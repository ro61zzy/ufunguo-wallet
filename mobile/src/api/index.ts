import { MockWalletRepository } from './mock';
import type { DataSource, WalletRepository } from './repository';

export type { DataSource, WalletRepository } from './repository';
export { ApiError, errorCode, errorMessage } from './errors';

export const DEFAULT_DATA_SOURCE: DataSource = 'mock';

export function createRepository(_source: DataSource): WalletRepository {
  return new MockWalletRepository();
}
