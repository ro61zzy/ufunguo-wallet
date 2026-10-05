import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ExplainCard, ExplainText } from '../components/ExplainCard';
import { Icon } from '../components/Icon';
import { ListRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { explain } from '../content/explanations';
import { useWallets } from '../hooks/wallet';
import type { RootScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { colors, spacing } from '../theme/tokens';

export function WalletSwitcherScreen({
  navigation,
}: RootScreenProps<'WalletSwitcher'>) {
  const { selectedWallet, selectWallet } = useAppSettings();
  const wallets = useWallets();

  const choose = (name: string) => {
    selectWallet(name);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <Screen
      title="Your wallets"
      subtitle="Each wallet is its own SQLite file and recovery phrase."
      edges={['left', 'right', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            style={styles.flex}
            label="New wallet"
            icon={<Icon name="plus" size={18} />}
            onPress={() => navigation.navigate('CreateWallet')}
          />
          <Button
            style={styles.flex}
            label="Restore"
            variant="secondary"
            onPress={() => navigation.navigate('RestoreWallet')}
          />
        </View>
      }
    >
      {wallets.isPending ? (
        <LoadingState label="Looking for wallets…" />
      ) : wallets.isError ? (
        <ErrorState
          error={wallets.error}
          onRetry={() => wallets.refetch()}
          retrying={wallets.isFetching}
        />
      ) : wallets.data.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="No wallets yet"
          message="Create a new wallet or restore one from a recovery phrase."
        />
      ) : (
        <Card style={styles.list}>
          {wallets.data.map(wallet => {
            const current = wallet.name === selectedWallet;
            return (
              <ListRow
                key={wallet.name}
                title={wallet.name}
                subtitle={`${wallet.name}.sqlite`}
                monoSubtitle
                left={
                  <View style={[styles.icon, current && styles.iconCurrent]}>
                    <Icon name="wallet" size={20} />
                  </View>
                }
                right={
                  current ? <Badge label="Open" tone="primary" /> : undefined
                }
                onPress={() => choose(wallet.name)}
                accessibilityLabel={`${wallet.name}${
                  current ? ', currently open' : ''
                }`}
              />
            );
          })}
        </Card>
      )}
      <ExplainCard title="Is this multi-user?">
        <ExplainText>{explain.multiWallet}</ExplainText>
      </ExplainCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  list: { paddingVertical: spacing.xs },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCurrent: { backgroundColor: colors.primarySoft },
});
