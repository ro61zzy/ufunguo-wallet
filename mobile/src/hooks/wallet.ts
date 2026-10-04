import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { PreviewRequest } from '../api/types';
import { useAppSettings } from '../state/AppSettings';

// Query keys are scoped by data source so switching between the Rust API and
// mock mode never mixes cached data.
export const queryKeys = {
  health: (source: string) => [source, 'health'] as const,
  wallets: (source: string) => [source, 'wallets'] as const,
  wallet: (source: string, wallet: string) =>
    [source, 'wallet', wallet] as const,
  overview: (source: string, wallet: string) =>
    [source, 'wallet', wallet, 'overview'] as const,
  addresses: (source: string, wallet: string) =>
    [source, 'wallet', wallet, 'addresses'] as const,
  transactions: (source: string, wallet: string) =>
    [source, 'wallet', wallet, 'transactions'] as const,
  transaction: (source: string, wallet: string, txid: string) =>
    [source, 'wallet', wallet, 'transactions', txid] as const,
  utxos: (source: string, wallet: string) =>
    [source, 'wallet', wallet, 'utxos'] as const,
  fees: (source: string) => [source, 'fees'] as const,
};

export function invalidateWallet(
  client: QueryClient,
  source: string,
  wallet: string,
) {
  return client.invalidateQueries({
    queryKey: queryKeys.wallet(source, wallet),
  });
}

export function useHealth() {
  const { repository, dataSource } = useAppSettings();
  return useQuery({
    queryKey: queryKeys.health(dataSource),
    queryFn: () => repository.health(),
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useWallets() {
  const { repository, dataSource } = useAppSettings();
  return useQuery({
    queryKey: queryKeys.wallets(dataSource),
    queryFn: () => repository.listWallets(),
  });
}

export function useOverview(wallet: string | null) {
  const { repository, dataSource } = useAppSettings();
  return useQuery({
    queryKey: queryKeys.overview(dataSource, wallet ?? ''),
    queryFn: () => repository.overview(wallet as string),
    enabled: wallet !== null,
  });
}

export function useAddresses(wallet: string | null) {
  const { repository, dataSource } = useAppSettings();
  return useQuery({
    queryKey: queryKeys.addresses(dataSource, wallet ?? ''),
    queryFn: () => repository.addresses(wallet as string),
    enabled: wallet !== null,
  });
}

export function useTransactions(wallet: string | null) {
  const { repository, dataSource } = useAppSettings();
  return useQuery({
    queryKey: queryKeys.transactions(dataSource, wallet ?? ''),
    queryFn: () => repository.transactions(wallet as string),
    enabled: wallet !== null,
  });
}

export function useTransaction(wallet: string | null, txid: string) {
  const { repository, dataSource } = useAppSettings();
  return useQuery({
    queryKey: queryKeys.transaction(dataSource, wallet ?? '', txid),
    queryFn: () => repository.transaction(wallet as string, txid),
    enabled: wallet !== null,
  });
}

export function useUtxos(wallet: string | null) {
  const { repository, dataSource } = useAppSettings();
  return useQuery({
    queryKey: queryKeys.utxos(dataSource, wallet ?? ''),
    queryFn: () => repository.utxos(wallet as string),
    enabled: wallet !== null,
  });
}

export function useFees() {
  const { repository, dataSource } = useAppSettings();
  return useQuery({
    queryKey: queryKeys.fees(dataSource),
    queryFn: () => repository.fees(),
    staleTime: 60_000,
  });
}

export function useSyncWallet(wallet: string | null) {
  const { repository, dataSource } = useAppSettings();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => repository.sync(wallet as string),
    onSuccess: () => invalidateWallet(client, dataSource, wallet as string),
  });
}

export function useRevealReceiveAddress(wallet: string | null) {
  const { repository, dataSource } = useAppSettings();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => repository.revealReceiveAddress(wallet as string),
    onSuccess: () => invalidateWallet(client, dataSource, wallet as string),
  });
}

export function usePreviewTransaction(wallet: string | null) {
  const { repository, dataSource } = useAppSettings();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: PreviewRequest) =>
      repository.previewTransaction(wallet as string, request),
    // Previewing may reveal a new change address, so refresh wallet views.
    onSuccess: () => invalidateWallet(client, dataSource, wallet as string),
  });
}
