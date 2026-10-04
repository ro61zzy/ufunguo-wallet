import { ActivityScreen } from '../screens/ActivityScreen';
import { AddressDetailScreen } from '../screens/AddressDetailScreen';
import { CreateWalletScreen } from '../screens/CreateWalletScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LabScreen } from '../screens/LabScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ReceiveScreen } from '../screens/ReceiveScreen';
import { RecoveryPhraseScreen } from '../screens/RecoveryPhraseScreen';
import { RestoreWalletScreen } from '../screens/RestoreWalletScreen';
import { ReviewTransactionScreen } from '../screens/ReviewTransactionScreen';
import { SendScreen } from '../screens/SendScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TransactionDetailScreen } from '../screens/TransactionDetailScreen';
import { WalletSwitcherScreen } from '../screens/WalletSwitcherScreen';

export const screens = {
  Onboarding: OnboardingScreen,
  CreateWallet: CreateWalletScreen,
  RecoveryPhrase: RecoveryPhraseScreen,
  RestoreWallet: RestoreWalletScreen,
  Home: HomeScreen,
  Activity: ActivityScreen,
  Lab: LabScreen,
  Settings: SettingsScreen,
  Receive: ReceiveScreen,
  Send: SendScreen,
  ReviewTransaction: ReviewTransactionScreen,
  TransactionDetail: TransactionDetailScreen,
  AddressDetail: AddressDetailScreen,
  WalletSwitcher: WalletSwitcherScreen,
};
