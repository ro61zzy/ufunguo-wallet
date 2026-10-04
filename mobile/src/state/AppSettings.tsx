import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  createRepository,
  DEFAULT_DATA_SOURCE,
  type DataSource,
  type WalletRepository,
} from '../api';
import { readPreference, writePreference } from './storage';

interface AppSettings {
  ready: boolean;
  selectedWallet: string | null;
  explainMode: boolean;
  dataSource: DataSource;
  repository: WalletRepository;
  selectWallet: (name: string | null) => void;
  setExplainMode: (enabled: boolean) => void;
  setDataSource: (source: DataSource) => void;
}

const AppSettingsContext = createContext<AppSettings | null>(null);

function isDataSource(value: string | null): value is DataSource {
  return value === 'api' || value === 'mock';
}

export function AppSettingsProvider({
  children,
  initialRepository,
}: {
  children: React.ReactNode;
  /** Lets tests inject a repository instead of the configured one. */
  initialRepository?: WalletRepository;
}) {
  const [ready, setReady] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [explainMode, setExplainModeState] = useState(true);
  const [dataSource, setDataSourceState] = useState<DataSource>(
    initialRepository?.source ?? DEFAULT_DATA_SOURCE,
  );
  const [repository, setRepository] = useState<WalletRepository>(
    () => initialRepository ?? createRepository(DEFAULT_DATA_SOURCE),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [wallet, explain, source] = await Promise.all([
        readPreference('selectedWallet'),
        readPreference('explainMode'),
        readPreference('dataSource'),
      ]);
      if (cancelled) {
        return;
      }
      setSelectedWallet(wallet);
      setExplainModeState(explain !== 'false');
      if (
        !initialRepository &&
        isDataSource(source) &&
        source !== DEFAULT_DATA_SOURCE
      ) {
        setDataSourceState(source);
        setRepository(createRepository(source));
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialRepository]);

  const selectWallet = useCallback((name: string | null) => {
    setSelectedWallet(name);
    writePreference('selectedWallet', name);
  }, []);

  const setExplainMode = useCallback((enabled: boolean) => {
    setExplainModeState(enabled);
    writePreference('explainMode', enabled ? 'true' : 'false');
  }, []);

  const setDataSource = useCallback((source: DataSource) => {
    setDataSourceState(source);
    setRepository(createRepository(source));
    writePreference('dataSource', source);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      selectedWallet,
      explainMode,
      dataSource,
      repository,
      selectWallet,
      setExplainMode,
      setDataSource,
    }),
    [
      ready,
      selectedWallet,
      explainMode,
      dataSource,
      repository,
      selectWallet,
      setExplainMode,
      setDataSource,
    ],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettings {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error('useAppSettings must be used inside AppSettingsProvider');
  }
  return context;
}

export function useRepository(): WalletRepository {
  return useAppSettings().repository;
}
