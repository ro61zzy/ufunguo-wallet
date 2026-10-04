import { ApiError } from './errors';
import type { WalletRepository } from './repository';
import type {
  ApiErrorBody,
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

type Fetch = typeof fetch;

const DEFAULT_TIMEOUT_MS = 30_000;

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const inner = (value as { error: unknown }).error;
  return (
    typeof inner === 'object' &&
    inner !== null &&
    typeof (inner as { code?: unknown }).code === 'string' &&
    typeof (inner as { message?: unknown }).message === 'string'
  );
}

/**
 * Talks to the local `ufunguo-api` development bridge. This is the only
 * module in the app that calls `fetch`.
 */
export class HttpWalletRepository implements WalletRepository {
  readonly source = 'api' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      // Deliberately do not include the request body in the error.
      throw new ApiError(
        'network_unreachable',
        `Could not reach ${this.baseUrl}`,
      );
    } finally {
      clearTimeout(timer);
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (isApiErrorBody(payload)) {
        throw new ApiError(
          payload.error.code,
          payload.error.message,
          response.status,
        );
      }
      throw new ApiError(
        'http_error',
        `Request failed with status ${response.status}`,
        response.status,
      );
    }

    return payload as T;
  }

  private walletPath(wallet: string, suffix = ''): string {
    return `/api/wallets/${encodeURIComponent(wallet)}${suffix}`;
  }

  health() {
    return this.request<Health>('GET', '/health');
  }

  async listWallets() {
    const result = await this.request<{ wallets: WalletSummary[] }>(
      'GET',
      '/api/wallets',
    );
    return result.wallets;
  }

  createWallet(name: string) {
    return this.request<CreatedWallet>('POST', '/api/wallets', { name });
  }

  restoreWallet(name: string, mnemonic: string) {
    return this.request<RestoredWallet>(
      'POST',
      this.walletPath(name, '/restore'),
      { mnemonic },
    );
  }

  overview(wallet: string) {
    return this.request<WalletOverview>(
      'GET',
      this.walletPath(wallet, '/overview'),
    );
  }

  sync(wallet: string) {
    return this.request<SyncReport>('POST', this.walletPath(wallet, '/sync'));
  }

  async addresses(wallet: string) {
    const result = await this.request<{ addresses: WalletAddress[] }>(
      'GET',
      this.walletPath(wallet, '/addresses'),
    );
    return result.addresses;
  }

  revealReceiveAddress(wallet: string) {
    return this.request<WalletAddress>(
      'POST',
      this.walletPath(wallet, '/addresses/receive'),
    );
  }

  async transactions(wallet: string) {
    const result = await this.request<{ transactions: WalletTransaction[] }>(
      'GET',
      this.walletPath(wallet, '/transactions'),
    );
    return result.transactions;
  }

  transaction(wallet: string, txid: string) {
    return this.request<TransactionDetail>(
      'GET',
      this.walletPath(wallet, `/transactions/${encodeURIComponent(txid)}`),
    );
  }

  async utxos(wallet: string) {
    const result = await this.request<{ utxos: Utxo[] }>(
      'GET',
      this.walletPath(wallet, '/utxos'),
    );
    return result.utxos;
  }

  fees() {
    return this.request<FeeEstimates>('GET', '/api/fees');
  }

  previewTransaction(wallet: string, request: PreviewRequest) {
    return this.request<TransactionPreview>(
      'POST',
      this.walletPath(wallet, '/transactions/preview'),
      request,
    );
  }

  sendTransaction(wallet: string, previewId: string, mnemonic: string) {
    return this.request<SendResult>(
      'POST',
      this.walletPath(wallet, '/transactions/send'),
      { previewId, mnemonic },
    );
  }
}
