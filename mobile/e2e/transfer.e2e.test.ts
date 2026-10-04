/**
 * Live Alice → Bob regtest transfer through the app's real HTTP repository.
 *
 * Opt-in: requires `cargo run -p ufunguo-api` and a running regtest node.
 *
 *   UFUNGUO_E2E_FROM=alice UFUNGUO_E2E_TO=bob \
 *   UFUNGUO_E2E_MNEMONIC_FILE=/path/to/alice-phrase.txt \
 *   npm run test:e2e
 *
 * The test waits for the payment to confirm: mine a block in Polar while it
 * runs. The recovery phrase is read from a file so it never appears in shell
 * history, and it is never printed.
 *
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { HttpWalletRepository } from '../src/api/http';

const BASE_URL = process.env.UFUNGUO_E2E_API ?? 'http://127.0.0.1:8787';
const FROM = process.env.UFUNGUO_E2E_FROM ?? 'alice';
const TO = process.env.UFUNGUO_E2E_TO ?? 'bob';
const AMOUNT_SATS = Number(process.env.UFUNGUO_E2E_AMOUNT ?? 25_000_000);
const CONFIRM_TIMEOUT_MS = Number(
  process.env.UFUNGUO_E2E_TIMEOUT_MS ?? 180_000,
);

function readPhrase(): string {
  const file = process.env.UFUNGUO_E2E_MNEMONIC_FILE;
  if (!file) {
    throw new Error(
      'Set UFUNGUO_E2E_MNEMONIC_FILE to a file holding the sender phrase',
    );
  }
  const raw = readFileSync(file, 'utf8').trim();
  // Accept either a bare phrase or the JSON returned by POST /api/wallets.
  return raw.startsWith('{') ? JSON.parse(raw).mnemonic : raw;
}

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

jest.setTimeout(CONFIRM_TIMEOUT_MS + 60_000);

test(`${FROM} pays ${TO} on regtest and the payment confirms`, async () => {
  const repo = new HttpWalletRepository(BASE_URL, fetch);

  const health = await repo.health();
  expect(health.network).toBe('regtest');
  expect(health.node.reachable).toBe(true);

  await repo.sync(FROM);
  await repo.sync(TO);
  const senderBefore = await repo.overview(FROM);
  const recipientBefore = await repo.overview(TO);
  expect(senderBefore.balance.spendableSats).toBeGreaterThan(AMOUNT_SATS);

  // Receive: Rust reveals and persists Bob's next external address.
  const receive = await repo.revealReceiveAddress(TO);
  expect(receive.keychain).toBe('external');
  expect(receive.used).toBe(false);

  // Preview: Rust syncs, selects coins, adds change and computes the fee.
  const preview = await repo.previewTransaction(FROM, {
    address: receive.address,
    amountSats: AMOUNT_SATS,
    confirmationTarget: 6,
  });
  const recipient = preview.outputs.find(o => o.role === 'recipient');
  const change = preview.outputs.find(o => o.role === 'change');
  expect(recipient?.address).toBe(receive.address);
  expect(recipient?.valueSats).toBe(AMOUNT_SATS);
  expect(change?.keychain).toBe('internal');
  expect(preview.inputTotalSats).toBe(
    preview.amountSats + preview.changeSats + preview.feeSats,
  );
  expect(preview.feeSats).toBeGreaterThan(0);

  // Sign and broadcast exactly the reviewed PSBT.
  let phrase = readPhrase();
  const sent = await repo.sendTransaction(FROM, preview.previewId, phrase);
  phrase = '';
  expect(sent.txid).toBe(preview.unsignedTxid);
  expect(sent.signedInputs).toBe(preview.inputs.length);

  // A reviewed preview is single-use.
  await expect(
    repo.sendTransaction(FROM, preview.previewId, 'unused'),
  ).rejects.toMatchObject({ code: 'preview_not_found' });

  const pending = await repo.transaction(FROM, sent.txid);
  expect(pending.direction).toBe('outgoing');
  expect(pending.feeSats).toBe(preview.feeSats);

  // Status polling, exactly as the Transaction screen does it.
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  let detail = pending;
  while (!detail.confirmed) {
    if (Date.now() > deadline) {
      throw new Error(
        `Not confirmed within ${CONFIRM_TIMEOUT_MS} ms — mine a block in Polar`,
      );
    }
    await sleep(3_000);
    await repo.sync(FROM);
    detail = await repo.transaction(FROM, sent.txid);
  }
  expect(detail.confirmations).toBeGreaterThanOrEqual(1);
  expect(detail.blockHeight).not.toBeNull();

  await repo.sync(TO);
  const incoming = await repo.transaction(TO, sent.txid);
  expect(incoming.direction).toBe('incoming');
  expect(incoming.netSats).toBe(AMOUNT_SATS);
  expect(incoming.confirmed).toBe(true);

  const senderAfter = await repo.overview(FROM);
  const recipientAfter = await repo.overview(TO);
  expect(senderAfter.balance.totalSats).toBe(
    senderBefore.balance.totalSats - AMOUNT_SATS - preview.feeSats,
  );
  expect(recipientAfter.balance.totalSats).toBe(
    recipientBefore.balance.totalSats + AMOUNT_SATS,
  );

  const bobAddresses = await repo.addresses(TO);
  expect(bobAddresses.find(a => a.address === receive.address)?.used).toBe(
    true,
  );
});
