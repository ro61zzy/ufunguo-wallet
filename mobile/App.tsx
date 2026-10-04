import React, { useState } from 'react';
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { WalletRepository } from './src/api';
import { DevLinkHandler } from './src/navigation/DevLinkHandler';
import { linking } from './src/navigation/linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppSettingsProvider } from './src/state/AppSettings';
import { colors } from './src/theme/tokens';

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primaryPressed,
    background: colors.background,
    card: colors.surface,
    text: colors.ink,
    border: colors.border,
    notification: colors.primary,
  },
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 5_000 },
      mutations: { retry: false },
    },
  });
}

export default function App({ repository }: { repository?: WalletRepository }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppSettingsProvider initialRepository={repository}>
          {__DEV__ ? <DevLinkHandler /> : null}
          <NavigationContainer theme={navigationTheme} linking={linking}>
            <StatusBar barStyle="dark-content" />
            <RootNavigator />
          </NavigationContainer>
        </AppSettingsProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
