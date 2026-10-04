import type { LinkingOptions } from '@react-navigation/native';
import { Linking } from 'react-native';
import { devLaunchUrl } from './devLaunch';
import type { RootStackParamList } from './types';

// Deep links let a presenter jump straight to a screen during a demo, e.g.
// `xcrun simctl openurl booted ufunguo://lab`.
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['ufunguo://'],
  async getInitialURL() {
    return (await Linking.getInitialURL()) ?? devLaunchUrl();
  },
  config: {
    screens: {
      Onboarding: 'welcome',
      Main: {
        screens: {
          Home: 'home',
          Activity: 'activity',
          Lab: 'lab',
          Settings: 'settings',
        },
      },
      Receive: 'receive',
      Send: 'send',
      WalletSwitcher: 'wallets',
      CreateWallet: 'create',
      RestoreWallet: 'restore',
      TransactionDetail: 'tx/:txid',
    },
  },
};

/** Development-only: `ufunguo://dev/select/<wallet>` opens a wallet by name. */
export function parseDevSelectLink(url: string): string | null {
  const match = /^ufunguo:\/\/dev\/select\/([a-z0-9][a-z0-9_-]{0,31})$/.exec(
    url,
  );
  return match ? match[1] : null;
}
