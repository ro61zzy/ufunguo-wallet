// Development-only fixtures. Nothing here is real Bitcoin logic: amounts,
// fees and addresses are canned values so the UI can be built and demonstrated
// without a node. Real wallets always go through the Rust API.

import { ApiError } from './errors';
import type { WalletRepository } from './repository';
import type {
  Balance,
  CreatedWallet,
  FeeEstimates,
  Health,
  PreviewRequest,
  RestoredWallet,
  SendResult,
  SyncReport,
  TransactionDetail,
  TransactionPreview,
  Utxo,
  WalletAddress,
  WalletOverview,
  WalletTransaction,
} from './types';

const RECEIVE_PATH = "m/84'/1'/0'/0/*";
const CHANGE_PATH = "m/84'/1'/0'/1/*";
const MOCK_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MOCK_FEE_SATS = 282;
const MOCK_FEE_RATE = 2;

const RECEIVE_ADDRESSES = [
  'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk',
  'bcrt1qd7spv5q28348xl4myc8zmh983w5jx32cs707jh',
  'bcrt1qxdyjdk4mnyve3tyg8z5ae83vsjhqqj9mhv0zep',
  'bcrt1qynpgsdjk4ak2d4ksv5rrjaw4mvfw08hrfqy4e4',
  'bcrt1qgq5k4q6qt4l7j6cnwxd2zv0xq2h8m7wx3h7c9d',
];
const CHANGE_ADDRESSES = [
  'bcrt1q8c6fshw2dlwun7ekn9qwf37cu2rn755ufhry49',
  'bcrt1qggnasd834t54yulsep6fta8lpjekv4zdh0hp7l',
  'bcrt1qn9h8e0y7nqk0t7h8a2l0xgk6dq0ju4mq4hfxrz',
];
const EXTERNAL_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

function path(keychain: 'external' | 'internal', index: number) {
  return `m/84'/1'/0'/${keychain === 'external' ? 0 : 1}/${index}`;
}

function fakeTxid(seed: number): string {
  let hex = '';
  let state = seed * 2654435761;
  while (hex.length < 64) {
    state = (state * 1103515245 + 12345) % 2147483648;
    hex += state.toString(16).padStart(8, '0');
  }
  return hex.slice(0, 64);
}

type MockTx = TransactionDetail;

interface MockWallet {
  name: string;
  height: number;
  receiveRevealed: number;
  changeRevealed: number;
  usedReceive: Set<number>;
  usedChange: Set<number>;
  utxos: Utxo[];
  transactions: MockTx[];
}

const now = () => Math.floor(Date.now() / 1000);

function fundedWallet(name: string): MockWallet {
  const fundingTxid = fakeTxid(1);
  const paymentTxid = fakeTxid(2);
  const height = 214;
  const funding: MockTx = {
    txid: fundingTxid,
    direction: 'incoming',
    netSats: 100_000_000,
    sentSats: 0,
    receivedSats: 100_000_000,
    feeSats: null,
    confirmed: true,
    confirmations: 12,
    blockHeight: 203,
    timestamp: now() - 7200,
    inputCount: 1,
    outputCount: 2,
    vsize: 141,
    inputs: [
      {
        outpoint: `${fakeTxid(9)}:0`,
        valueSats: null,
        isMine: false,
        keychain: null,
        derivationIndex: null,
      },
    ],
    outputs: [
      {
        vout: 0,
        address: RECEIVE_ADDRESSES[0],
        valueSats: 100_000_000,
        isMine: true,
        keychain: 'external',
        derivationIndex: 0,
      },
      {
        vout: 1,
        address: EXTERNAL_ADDRESS,
        valueSats: 4_899_999_859,
        isMine: false,
        keychain: null,
        derivationIndex: null,
      },
    ],
  };
  const payment: MockTx = {
    txid: paymentTxid,
    direction: 'outgoing',
    netSats: -25_000_282,
    sentSats: 100_000_000,
    receivedSats: 74_999_718,
    feeSats: MOCK_FEE_SATS,
    confirmed: true,
    confirmations: 3,
    blockHeight: 212,
    timestamp: now() - 1800,
    inputCount: 1,
    outputCount: 2,
    vsize: 141,
    inputs: [
      {
        outpoint: `${fundingTxid}:0`,
        valueSats: 100_000_000,
        isMine: true,
        keychain: 'external',
        derivationIndex: 0,
      },
    ],
    outputs: [
      {
        vout: 0,
        address: EXTERNAL_ADDRESS,
        valueSats: 25_000_000,
        isMine: false,
        keychain: null,
        derivationIndex: null,
      },
      {
        vout: 1,
        address: CHANGE_ADDRESSES[0],
        valueSats: 74_999_718,
        isMine: true,
        keychain: 'internal',
        derivationIndex: 0,
      },
    ],
  };
  return {
    name,
    height,
    receiveRevealed: 2,
    changeRevealed: 1,
    usedReceive: new Set([0]),
    usedChange: new Set([0]),
    transactions: [payment, funding],
    utxos: [
      {
        outpoint: `${paymentTxid}:1`,
        txid: paymentTxid,
        vout: 1,
        valueSats: 74_999_718,
        address: CHANGE_ADDRESSES[0],
        keychain: 'internal',
        derivationIndex: 0,
        derivationPath: path('internal', 0),
        confirmed: true,
        confirmations: 3,
        blockHeight: 212,
      },
    ],
  };
}

function emptyWallet(name: string): MockWallet {
  return {
    name,
    height: 214,
    receiveRevealed: 0,
    changeRevealed: 0,
    usedReceive: new Set(),
    usedChange: new Set(),
    utxos: [],
    transactions: [],
  };
}

function toSummary(tx: MockTx): WalletTransaction {
  return {
    txid: tx.txid,
    direction: tx.direction,
    netSats: tx.netSats,
    sentSats: tx.sentSats,
    receivedSats: tx.receivedSats,
    feeSats: tx.feeSats,
    confirmed: tx.confirmed,
    confirmations: tx.confirmations,
    blockHeight: tx.blockHeight,
    timestamp: tx.timestamp,
    inputCount: tx.inputCount,
    outputCount: tx.outputCount,
  };
}

function addressAt(keychain: 'external' | 'internal', index: number): string {
  const list = keychain === 'external' ? RECEIVE_ADDRESSES : CHANGE_ADDRESSES;
  return list[index % list.length];
}

export class MockWalletRepository implements WalletRepository {
  readonly source = 'mock' as const;
  private wallets = new Map<string, MockWallet>();
  private previews = new Map<string, TransactionPreview>();
  private previewCounter = 0;

  constructor(private readonly latencyMs = 250) {
    this.wallets.set('presentation', fundedWallet('presentation'));
    this.wallets.set('recipient', emptyWallet('recipient'));
  }

  private delay<T>(value: T): Promise<T> {
    return new Promise(resolve =>
      setTimeout(() => resolve(value), this.latencyMs),
    );
  }

  private wallet(name: string): MockWallet {
    const wallet = this.wallets.get(name);
    if (!wallet) {
      throw new ApiError(
        'wallet_not_found',
        `Wallet ${name} was not found`,
        404,
      );
    }
    return wallet;
  }

  private balance(wallet: MockWallet): Balance {
    const confirmed = wallet.utxos
      .filter(u => u.confirmed)
      .reduce((sum, u) => sum + u.valueSats, 0);
    const unconfirmed = wallet.utxos
      .filter(u => !u.confirmed)
      .reduce((sum, u) => sum + u.valueSats, 0);
    return {
      confirmedSats: confirmed,
      trustedPendingSats: unconfirmed,
      untrustedPendingSats: 0,
      unconfirmedSats: unconfirmed,
      immatureSats: 0,
      spendableSats: confirmed + unconfirmed,
      totalSats: confirmed + unconfirmed,
    };
  }

  private listAddresses(wallet: MockWallet): WalletAddress[] {
    const entries: WalletAddress[] = [];
    for (let index = 0; index < wallet.receiveRevealed; index += 1) {
      entries.push({
        address: addressAt('external', index),
        keychain: 'external',
        index,
        derivationPath: path('external', index),
        used: wallet.usedReceive.has(index),
      });
    }
    for (let index = 0; index < wallet.changeRevealed; index += 1) {
      entries.push({
        address: addressAt('internal', index),
        keychain: 'internal',
        index,
        derivationPath: path('internal', index),
        used: wallet.usedChange.has(index),
      });
    }
    return entries;
  }

  async health(): Promise<Health> {
    return this.delay({
      status: 'ok',
      network: 'regtest',
      regtestOnly: true,
      node: { reachable: true, chain: 'regtest', blocks: 214, message: null },
    });
  }

  async listWallets() {
    return this.delay([...this.wallets.keys()].sort().map(name => ({ name })));
  }

  async createWallet(name: string): Promise<CreatedWallet> {
    if (this.wallets.has(name)) {
      throw new ApiError('wallet_exists', `Wallet ${name} already exists`, 409);
    }
    this.wallets.set(name, emptyWallet(name));
    return this.delay({
      name,
      mnemonic: MOCK_MNEMONIC,
      wordCount: 12,
      masterFingerprint: '73c5da0a',
      firstReceiveAddress: RECEIVE_ADDRESSES[0],
      receivePath: RECEIVE_PATH,
      changePath: CHANGE_PATH,
    });
  }

  async restoreWallet(name: string, mnemonic: string): Promise<RestoredWallet> {
    if (mnemonic.trim().split(/\s+/).length !== 12) {
      throw new ApiError(
        'invalid_mnemonic',
        'Recovery phrase must have 12 words',
        400,
      );
    }
    const alreadyExisted = this.wallets.has(name);
    if (!alreadyExisted) {
      this.wallets.set(name, emptyWallet(name));
    }
    return this.delay({
      name,
      masterFingerprint: '73c5da0a',
      firstReceiveAddress: RECEIVE_ADDRESSES[0],
      alreadyExisted,
      receivePath: RECEIVE_PATH,
      changePath: CHANGE_PATH,
    });
  }

  async overview(name: string): Promise<WalletOverview> {
    const wallet = this.wallet(name);
    const addresses = this.listAddresses(wallet);
    const latest = wallet.transactions[0];
    return this.delay({
      name,
      network: 'regtest',
      balance: this.balance(wallet),
      walletHeight: wallet.height,
      tipHash: `0000${fakeTxid(wallet.height).slice(4)}`,
      revealedAddresses: addresses.length,
      usedAddresses: addresses.filter(a => a.used).length,
      receiveAddressCount: wallet.receiveRevealed,
      changeAddressCount: wallet.changeRevealed,
      utxoCount: wallet.utxos.length,
      confirmedUtxoCount: wallet.utxos.filter(u => u.confirmed).length,
      transactionCount: wallet.transactions.length,
      latestTransaction: latest ? toSummary(latest) : null,
      receivePath: RECEIVE_PATH,
      changePath: CHANGE_PATH,
    });
  }

  async sync(name: string): Promise<SyncReport> {
    const wallet = this.wallet(name);
    // Simulate a block being mined on every sync so the confirmation
    // timeline can be demonstrated without a node.
    wallet.height += 1;
    const mempool = wallet.transactions.filter(tx => !tx.confirmed).length;
    for (const tx of wallet.transactions) {
      if (tx.confirmed) {
        tx.confirmations += 1;
      } else {
        tx.confirmed = true;
        tx.confirmations = 1;
        tx.blockHeight = wallet.height;
      }
    }
    for (const utxo of wallet.utxos) {
      if (utxo.confirmed) {
        utxo.confirmations += 1;
      } else {
        utxo.confirmed = true;
        utxo.confirmations = 1;
        utxo.blockHeight = wallet.height;
      }
    }
    return this.delay({
      blocksScanned: 1,
      mempoolTransactions: mempool,
      walletHeight: wallet.height,
    });
  }

  async addresses(name: string) {
    return this.delay(this.listAddresses(this.wallet(name)));
  }

  async revealReceiveAddress(name: string): Promise<WalletAddress> {
    const wallet = this.wallet(name);
    const index = wallet.receiveRevealed;
    wallet.receiveRevealed += 1;
    return this.delay({
      address: addressAt('external', index),
      keychain: 'external',
      index,
      derivationPath: path('external', index),
      used: false,
    });
  }

  async transactions(name: string) {
    return this.delay(this.wallet(name).transactions.map(toSummary));
  }

  async transaction(name: string, txid: string) {
    const tx = this.wallet(name).transactions.find(t => t.txid === txid);
    if (!tx) {
      throw new ApiError(
        'transaction_not_found',
        `Transaction ${txid} was not found in wallet ${name}`,
        404,
      );
    }
    return this.delay({ ...tx });
  }

  async utxos(name: string) {
    return this.delay([...this.wallet(name).utxos]);
  }

  async fees(): Promise<FeeEstimates> {
    return this.delay({
      estimates: [1, 3, 6, 12].map(target => ({
        confirmationTarget: target,
        satPerVb: MOCK_FEE_RATE,
        source: 'regtest_fallback' as const,
      })),
      fallbackSatPerVb: MOCK_FEE_RATE,
    });
  }

  async previewTransaction(
    name: string,
    request: PreviewRequest,
  ): Promise<TransactionPreview> {
    const wallet = this.wallet(name);
    if (!request.address.startsWith('bcrt1')) {
      throw new ApiError(
        'invalid_address',
        'Enter a regtest (bcrt1…) address',
        400,
      );
    }
    const input = wallet.utxos[0];
    if (!input || input.valueSats < request.amountSats + MOCK_FEE_SATS) {
      throw new ApiError(
        'insufficient_funds',
        'Insufficient funds for this amount plus fee',
        422,
      );
    }
    const changeIndex = wallet.changeRevealed;
    wallet.changeRevealed += 1;
    const change = input.valueSats - request.amountSats - MOCK_FEE_SATS;
    this.previewCounter += 1;
    const preview: TransactionPreview = {
      previewId: `mock-preview-${this.previewCounter}`,
      expiresInSeconds: 600,
      destination: request.address,
      amountSats: request.amountSats,
      feeSats: MOCK_FEE_SATS,
      feeRateSatPerVb: request.feeRateSatPerVb ?? MOCK_FEE_RATE,
      feeSource: request.feeRateSatPerVb ? 'manual' : 'regtest_fallback',
      confirmationTarget: request.confirmationTarget ?? 6,
      inputTotalSats: input.valueSats,
      outputTotalSats: input.valueSats - MOCK_FEE_SATS,
      changeSats: change,
      vsize: 141,
      unsignedTxid: fakeTxid(100 + this.previewCounter),
      psbtBase64: 'cHNidP8BAHECAAAAAf…mock',
      inputs: [
        {
          outpoint: input.outpoint,
          valueSats: input.valueSats,
          address: input.address,
          keychain: input.keychain,
          derivationIndex: input.derivationIndex,
          derivationPath: input.derivationPath,
        },
      ],
      outputs: [
        {
          vout: 0,
          address: request.address,
          valueSats: request.amountSats,
          role: 'recipient',
          keychain: null,
          derivationIndex: null,
          derivationPath: null,
        },
        {
          vout: 1,
          address: addressAt('internal', changeIndex),
          valueSats: change,
          role: 'change',
          keychain: 'internal',
          derivationIndex: changeIndex,
          derivationPath: path('internal', changeIndex),
        },
      ],
    };
    this.previews.set(preview.previewId, preview);
    return this.delay(preview);
  }

  async sendTransaction(
    name: string,
    previewId: string,
    mnemonic: string,
  ): Promise<SendResult> {
    const wallet = this.wallet(name);
    const preview = this.previews.get(previewId);
    if (!preview) {
      throw new ApiError(
        'preview_not_found',
        'Preview expired or already used',
        404,
      );
    }
    if (mnemonic.trim().split(/\s+/).length !== 12) {
      throw new ApiError(
        'invalid_mnemonic',
        'Recovery phrase must have 12 words',
        400,
      );
    }
    this.previews.delete(previewId);
    const txid = preview.unsignedTxid;
    const changeOutput = preview.outputs.find(o => o.role === 'change');
    wallet.utxos = wallet.utxos.filter(
      u => u.outpoint !== preview.inputs[0].outpoint,
    );
    if (changeOutput && changeOutput.derivationIndex !== null) {
      wallet.usedChange.add(changeOutput.derivationIndex);
      wallet.utxos.push({
        outpoint: `${txid}:${changeOutput.vout}`,
        txid,
        vout: changeOutput.vout,
        valueSats: changeOutput.valueSats,
        address: changeOutput.address,
        keychain: 'internal',
        derivationIndex: changeOutput.derivationIndex,
        derivationPath: changeOutput.derivationPath ?? '',
        confirmed: false,
        confirmations: 0,
        blockHeight: null,
      });
    }
    wallet.transactions.unshift({
      txid,
      direction: 'outgoing',
      netSats: -(preview.amountSats + preview.feeSats),
      sentSats: preview.inputTotalSats,
      receivedSats: preview.changeSats,
      feeSats: preview.feeSats,
      confirmed: false,
      confirmations: 0,
      blockHeight: null,
      timestamp: now(),
      inputCount: preview.inputs.length,
      outputCount: preview.outputs.length,
      vsize: preview.vsize,
      inputs: preview.inputs.map(i => ({
        outpoint: i.outpoint,
        valueSats: i.valueSats,
        isMine: true,
        keychain: i.keychain,
        derivationIndex: i.derivationIndex,
      })),
      outputs: preview.outputs.map(o => ({
        vout: o.vout,
        address: o.address,
        valueSats: o.valueSats,
        isMine: o.role === 'change',
        keychain: o.keychain,
        derivationIndex: o.derivationIndex,
      })),
    });
    return this.delay({
      txid,
      signedInputs: preview.inputs.length,
      synced: true,
      walletHeight: wallet.height,
    });
  }
}
