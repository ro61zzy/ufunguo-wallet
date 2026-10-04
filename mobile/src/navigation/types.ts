import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TransactionPreview, WalletAddress } from '../api/types';

export type TabParamList = {
  Home: undefined;
  Activity: undefined;
  Lab: undefined;
  Settings: undefined;
};

// Never put a recovery phrase in navigation params: params live in navigation
// state, which can be inspected by dev tools.
export type RootStackParamList = {
  Onboarding: undefined;
  CreateWallet: undefined;
  RecoveryPhrase: { walletName: string };
  RestoreWallet: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Receive: undefined;
  Send: undefined;
  ReviewTransaction: { preview: TransactionPreview };
  TransactionDetail: { txid: string; justSent?: boolean };
  AddressDetail: { address: WalletAddress };
  WalletSwitcher: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
