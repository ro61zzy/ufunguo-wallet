import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { RegtestBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { Screen } from '../components/Screen';
import { explain } from '../content/explanations';
import { useWallets } from '../hooks/wallet';
import type { RootScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme/tokens';

const POINT_ICONS: Record<string, IconName> = {
  'non-custodial': 'key',
  phrase: 'wallet',
  utxo: 'lab',
  regtest: 'info',
};

export function OnboardingScreen({
  navigation,
}: RootScreenProps<'Onboarding'>) {
  const wallets = useWallets();
  const existing = wallets.data?.length ?? 0;

  return (
    <Screen
      showRegtest={false}
      edges={['top', 'left', 'right', 'bottom']}
      footer={
        <>
          <Button
            label="Create a new wallet"
            onPress={() => navigation.navigate('CreateWallet')}
            accessibilityHint="Generates a new 12-word recovery phrase"
            testID="onboarding-create"
          />
          <Button
            label="Restore from recovery phrase"
            variant="secondary"
            onPress={() => navigation.navigate('RestoreWallet')}
          />
          {existing > 0 ? (
            <Button
              label={`Open an existing wallet (${existing})`}
              variant="ghost"
              onPress={() => navigation.navigate('WalletSwitcher')}
            />
          ) : null}
        </>
      }
    >
      <View style={styles.hero}>
        <View style={styles.logo} accessibilityElementsHidden>
          <Icon name="key" size={36} color={colors.ink} strokeWidth={2.2} />
        </View>
        <RegtestBadge />
        <AppText variant="display" accessibilityRole="header">
          Ufunguo
        </AppText>
        <AppText variant="heading" color="textMuted">
          A Bitcoin wallet that shows you what happens under the hood.
        </AppText>
      </View>

      {explain.onboarding.map(point => (
        <Card key={point.key} style={styles.point}>
          <View style={styles.pointIcon}>
            <Icon
              name={POINT_ICONS[point.key] ?? 'info'}
              color={colors.primaryPressed}
            />
          </View>
          <View style={styles.pointText}>
            <AppText variant="bodyStrong">{point.title}</AppText>
            <AppText color="textMuted">{point.body}</AppText>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  point: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: { flex: 1, gap: spacing.xxs },
});
