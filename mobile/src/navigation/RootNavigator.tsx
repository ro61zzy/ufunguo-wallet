import React from 'react';
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '../components/Icon';
import { LoadingState } from '../components/StateViews';
import { useAppSettings } from '../state/AppSettings';
import { colors, typography } from '../theme/tokens';
import { screens } from './screens';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, IconName> = {
  Home: 'home',
  Activity: 'activity',
  Lab: 'lab',
  Settings: 'settings',
};

function tabScreenOptions({
  route,
}: {
  route: RouteProp<TabParamList>;
}): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primaryPressed,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: styles.tabBar,
    tabBarLabelStyle: styles.tabLabel,
    tabBarIcon: ({ color, size }) => (
      <Icon name={TAB_ICONS[route.name]} color={color} size={size} />
    ),
  };
}

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={tabScreenOptions}>
      <Tabs.Screen name="Home" component={screens.Home} />
      <Tabs.Screen name="Activity" component={screens.Activity} />
      <Tabs.Screen
        name="Lab"
        component={screens.Lab}
        options={{
          title: 'Bitcoin Lab',
          tabBarAccessibilityLabel: 'Bitcoin Lab',
        }}
      />
      <Tabs.Screen name="Settings" component={screens.Settings} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { ready, selectedWallet } = useAppSettings();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <LoadingState label="Opening Ufunguo…" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={selectedWallet ? 'Main' : 'Onboarding'}
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { ...typography.heading, color: colors.ink },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Onboarding"
        component={screens.Onboarding}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateWallet"
        component={screens.CreateWallet}
        options={{ title: 'New wallet' }}
      />
      <Stack.Screen
        name="RecoveryPhrase"
        component={screens.RecoveryPhrase}
        options={{
          title: 'Recovery phrase',
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="RestoreWallet"
        component={screens.RestoreWallet}
        options={{ title: 'Restore wallet' }}
      />
      <Stack.Screen
        name="Main"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Receive" component={screens.Receive} />
        <Stack.Screen
          name="WalletSwitcher"
          component={screens.WalletSwitcher}
          options={{ title: 'Wallets' }}
        />
      </Stack.Group>
      <Stack.Screen name="Send" component={screens.Send} />
      <Stack.Screen
        name="ReviewTransaction"
        component={screens.ReviewTransaction}
        options={{ title: 'Review' }}
      />
      <Stack.Screen
        name="TransactionDetail"
        component={screens.TransactionDetail}
        options={{ title: 'Transaction' }}
      />
      <Stack.Screen
        name="AddressDetail"
        component={screens.AddressDetail}
        options={{ title: 'Address' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
  },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
});
