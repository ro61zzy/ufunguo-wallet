import type {
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
  WalletSummary,
  WalletTransaction,
} from './types';

export type DataSource = 'api' | 'mock';

/**
 * The only way screens reach wallet data. Implementations must not contain
 * Bitcoin logic: the HTTP implementation forwards to Rust, the mock returns
 * fixtures for UI development.
 */
export interface WalletRepository {
  readonly source: DataSource;
  health(): Promise<Health>;
  listWallets(): Promise<WalletSummary[]>;
  createWallet(name: string): Promise<CreatedWallet>;
  restoreWallet(name: string, mnemonic: string): Promise<RestoredWallet>;
  overview(wallet: string): Promise<WalletOverview>;
  sync(wallet: string): Promise<SyncReport>;
  addresses(wallet: string): Promise<WalletAddress[]>;
  revealReceiveAddress(wallet: string): Promise<WalletAddress>;
  transactions(wallet: string): Promise<WalletTransaction[]>;
  transaction(wallet: string, txid: string): Promise<TransactionDetail>;
  utxos(wallet: string): Promise<Utxo[]>;
  fees(): Promise<FeeEstimates>;
  previewTransaction(
    wallet: string,
    request: PreviewRequest,
  ): Promise<TransactionPreview>;
  sendTransaction(
    wallet: string,
    previewId: string,
    mnemonic: string,
  ): Promise<SendResult>;
}
