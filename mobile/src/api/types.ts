// JSON contract shared with `rust/crates/ufunguo-api/src/dto.rs`.
// Every amount is an integer number of satoshis (fields ending in `Sats`).

export type Sats = number;
export type Keychain = 'external' | 'internal';
export type FeeSource = 'bitcoin_core' | 'regtest_fallback' | 'manual';
export type TransactionDirection = 'incoming' | 'outgoing' | 'self';

export interface Health {
  status: 'ok';
  network: 'regtest';
  regtestOnly: true;
  node: {
    reachable: boolean;
    chain: string | null;
    blocks: number | null;
    message: string | null;
  };
}

export interface WalletSummary {
  name: string;
}

export interface DerivationPaths {
  receivePath: string;
  changePath: string;
}

export interface CreatedWallet extends DerivationPaths {
  name: string;
  /** Shown exactly once. Never persist or log this value. */
  mnemonic: string;
  wordCount: number;
  masterFingerprint: string;
  firstReceiveAddress: string;
}

export interface RestoredWallet extends DerivationPaths {
  name: string;
  masterFingerprint: string;
  firstReceiveAddress: string;
  alreadyExisted: boolean;
}

export interface Balance {
  confirmedSats: Sats;
  trustedPendingSats: Sats;
  untrustedPendingSats: Sats;
  unconfirmedSats: Sats;
  immatureSats: Sats;
  spendableSats: Sats;
  totalSats: Sats;
}

export interface WalletTransaction {
  txid: string;
  direction: TransactionDirection;
  netSats: Sats;
  sentSats: Sats;
  receivedSats: Sats;
  feeSats: Sats | null;
  confirmed: boolean;
  confirmations: number;
  blockHeight: number | null;
  /** Block time when confirmed, first-seen time when unconfirmed (unix seconds). */
  timestamp: number | null;
  inputCount: number;
  outputCount: number;
}

export interface WalletOverview extends DerivationPaths {
  name: string;
  network: 'regtest';
  balance: Balance;
  walletHeight: number;
  tipHash: string;
  revealedAddresses: number;
  usedAddresses: number;
  receiveAddressCount: number;
  changeAddressCount: number;
  utxoCount: number;
  confirmedUtxoCount: number;
  transactionCount: number;
  latestTransaction: WalletTransaction | null;
}

export interface SyncReport {
  blocksScanned: number;
  mempoolTransactions: number;
  walletHeight: number;
}

export interface WalletAddress {
  address: string;
  keychain: Keychain;
  index: number;
  derivationPath: string;
  used: boolean;
}

export interface TransactionInput {
  outpoint: string;
  valueSats: Sats | null;
  isMine: boolean;
  keychain: Keychain | null;
  derivationIndex: number | null;
}

export interface TransactionOutput {
  vout: number;
  address: string | null;
  valueSats: Sats;
  isMine: boolean;
  keychain: Keychain | null;
  derivationIndex: number | null;
}

export interface TransactionDetail extends WalletTransaction {
  vsize: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
}

export interface Utxo {
  outpoint: string;
  txid: string;
  vout: number;
  valueSats: Sats;
  address: string | null;
  keychain: Keychain;
  derivationIndex: number;
  derivationPath: string;
  confirmed: boolean;
  confirmations: number;
  blockHeight: number | null;
}

export interface FeeEstimate {
  confirmationTarget: number;
  satPerVb: number;
  source: FeeSource;
}

export interface FeeEstimates {
  estimates: FeeEstimate[];
  fallbackSatPerVb: number;
}

export interface PreviewRequest {
  address: string;
  amountSats: Sats;
  confirmationTarget?: number;
  feeRateSatPerVb?: number;
}

export interface PreviewInput {
  outpoint: string;
  valueSats: Sats;
  address: string | null;
  keychain: Keychain | null;
  derivationIndex: number | null;
  derivationPath: string | null;
}

export type OutputRole = 'recipient' | 'change' | 'external';

export interface PreviewOutput {
  vout: number;
  address: string | null;
  valueSats: Sats;
  role: OutputRole;
  keychain: Keychain | null;
  derivationIndex: number | null;
  derivationPath: string | null;
}

export interface TransactionPreview {
  previewId: string;
  expiresInSeconds: number;
  destination: string;
  amountSats: Sats;
  feeSats: Sats;
  feeRateSatPerVb: number;
  feeSource: FeeSource;
  confirmationTarget: number | null;
  inputTotalSats: Sats;
  outputTotalSats: Sats;
  changeSats: Sats;
  vsize: number;
  unsignedTxid: string;
  psbtBase64: string;
  inputs: PreviewInput[];
  outputs: PreviewOutput[];
}

export interface SendResult {
  txid: string;
  signedInputs: number;
  synced: boolean;
  walletHeight: number | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
