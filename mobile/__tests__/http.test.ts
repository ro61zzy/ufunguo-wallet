import { ApiError, errorMessage } from '../src/api/errors';
import { HttpWalletRepository } from '../src/api/http';

type Call = { url: string; init: RequestInit };

function stubFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const BASE = 'http://127.0.0.1:8787';

test('unwraps list responses and keeps integer satoshis', async () => {
  const { calls, fetchImpl } = stubFetch(200, {
    utxos: [{ outpoint: 'ab:0', valueSats: 2_100_000_000_000_000 }],
  });
  const repo = new HttpWalletRepository(BASE, fetchImpl);

  const utxos = await repo.utxos('alice');

  expect(calls[0].url).toBe(`${BASE}/api/wallets/alice/utxos`);
  expect(calls[0].init.method).toBe('GET');
  expect(utxos[0].valueSats).toBe(2_100_000_000_000_000);
  expect(Number.isSafeInteger(utxos[0].valueSats)).toBe(true);
});

test('encodes wallet names and txids into the path', async () => {
  const { calls, fetchImpl } = stubFetch(200, {});
  const repo = new HttpWalletRepository(BASE, fetchImpl);

  await repo.transaction('../evil', 'a/b');

  expect(calls[0].url).toBe(`${BASE}/api/wallets/..%2Fevil/transactions/a%2Fb`);
});

test('posts JSON bodies for write operations', async () => {
  const { calls, fetchImpl } = stubFetch(200, { txid: 'ff' });
  const repo = new HttpWalletRepository(BASE, fetchImpl);

  await repo.previewTransaction('alice', {
    address: 'bcrt1qexample',
    amountSats: 25_000,
    confirmationTarget: 6,
  });

  expect(calls[0].init.method).toBe('POST');
  expect(JSON.parse(String(calls[0].init.body))).toEqual({
    address: 'bcrt1qexample',
    amountSats: 25_000,
    confirmationTarget: 6,
  });
  expect(
    (calls[0].init.headers as Record<string, string>)['Content-Type'],
  ).toBe('application/json');
});

test('turns the Rust error envelope into an ApiError', async () => {
  const { fetchImpl } = stubFetch(404, {
    error: { code: 'wallet_not_found', message: 'Wallet alice was not found' },
  });
  const repo = new HttpWalletRepository(BASE, fetchImpl);

  await expect(repo.overview('alice')).rejects.toMatchObject({
    name: 'ApiError',
    code: 'wallet_not_found',
    status: 404,
    message: 'Wallet alice was not found',
  });
});

test('reports an unreachable API without leaking the request body', async () => {
  const fetchImpl = (async () => {
    throw new TypeError('Network request failed');
  }) as unknown as typeof fetch;
  const repo = new HttpWalletRepository(BASE, fetchImpl);
  const phrase = 'abandon '.repeat(11) + 'about';

  let caught: unknown;
  try {
    await repo.sendTransaction('alice', 'preview-1', phrase);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(ApiError);
  expect((caught as ApiError).code).toBe('network_unreachable');
  expect(JSON.stringify(caught)).not.toContain('abandon');
  expect((caught as ApiError).message).not.toContain('abandon');
  expect(errorMessage(caught)).toContain('cargo run -p ufunguo-api');
});

test('handles non-JSON error responses', async () => {
  const fetchImpl = (async () =>
    ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response)) as unknown as typeof fetch;
  const repo = new HttpWalletRepository(BASE, fetchImpl);

  await expect(repo.health()).rejects.toMatchObject({
    code: 'http_error',
    status: 502,
  });
});
