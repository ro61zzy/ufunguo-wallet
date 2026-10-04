export class ApiError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  network_unreachable:
    'Ufunguo could not reach the local Rust API. Start it with `cargo run -p ufunguo-api` from the rust/ folder.',
  node_unavailable:
    'The Rust API is running but could not reach Bitcoin Core. Check that your Polar regtest node is started.',
  insufficient_funds:
    'This wallet does not have enough spendable bitcoin for that amount plus the miner fee.',
  preview_not_found:
    'This review expired or was already used. Go back and review the transaction again.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY_MESSAGES[error.code] ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong.';
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}
