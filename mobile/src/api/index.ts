import { API_BASE_URL } from '../config';
import { HttpWalletRepository } from './http';
import { MockWalletRepository } from './mock';
import type { DataSource, WalletRepository } from './repository';

export type { DataSource, WalletRepository } from './repository';
export { ApiError, errorCode, errorMessage } from './errors';

/** The Rust API is the default; mock data remains for UI development. */
export const DEFAULT_DATA_SOURCE: DataSource = 'api';

export function createRepository(source: DataSource): WalletRepository {
  return source === 'api'
    ? new HttpWalletRepository(API_BASE_URL)
    : new MockWalletRepository();
}
