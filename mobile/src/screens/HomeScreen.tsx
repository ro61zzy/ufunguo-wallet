import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorCode, errorMessage } from '../api/errors';
import { AppText, Mono } from '../components/AppText';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, Divider, SectionTitle } from '../components/Card';
import { WhatJustHappened } from '../components/ExplainCard';
import { Icon } from '../components/Icon';
import { KeyValueRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import {
  EmptyState,
  ErrorState,
  SkeletonBlock,
} from '../components/StateViews';
import { TransactionRow } from '../components/WalletBits';
import { explain } from '../content/explanations';
import { useHealth, useOverview, useSyncWallet } from '../hooks/wallet';
import type { TabScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { colors, spacing } from '../theme/tokens';
import { formatBtc, formatSats, truncateMiddle } from '../utils/format';

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const { selectedWallet } = useAppSettings();
  const overview = useOverview(selectedWallet);
  const health = useHealth();
  const sync = useSyncWallet(selectedWallet);

  const walletPicker = (
    <Pressable
      onPress={() => navigation.navigate('WalletSwitcher')}
      accessibilityRole="button"
      accessibilityLabel={`Wallet ${selectedWallet ?? 'none'}. Switch wallet`}
      style={({ pressed }) => [styles.picker, pressed && styles.pickerPressed]}
      hitSlop={8}
    >
      <Icon name="wallet" size={18} />
      <AppText variant="label">{selectedWallet ?? 'Choose wallet'}</AppText>
      <Icon name="chevronDown" size={16} color={colors.textMuted} />
    </Pressable>
  );

  if (!selectedWallet) {
    return (
      <Screen headerRight={walletPicker}>
        <EmptyState
          icon="wallet"
          title="No wallet selected"
          message="Choose one of your wallets or create a new one."
          action={
            <Button
              label="Choose a wallet"
              onPress={() => navigation.navigate('WalletSwitcher')}
            />
          }
        />
      </Screen>
    );
  }

  const data = overview.data;
  const nodeReachable = health.data?.node.reachable;

  return (
    <Screen
      headerRight={walletPicker}
      refreshing={sync.isPending}
      onRefresh={() => sync.mutate()}
    >
      {overview.isError ? (
        <ErrorState
          error={overview.error}
          title={
            errorCode(overview.error) === 'wallet_not_found'
              ? 'Wallet not found'
              : 'Could not load wallet'
          }
          onRetry={() => overview.refetch()}
          retrying={overview.isFetching}
        />
      ) : null}

      <Card style={styles.balanceCard}>
        <AppText variant="label" color="textMuted">
          Total balance
        </AppText>
        {data ? (
          <View
            accessible
            accessibilityLabel={`Total balance ${formatSats(
              data.balance.totalSats,
            )}, ${formatBtc(data.balance.totalSats)}`}
          >
            <AppText variant="display">
              {formatSats(data.balance.totalSats).replace(' sats', '')}
              <AppText variant="heading" color="textMuted">
                {' '}
                sats
              </AppText>
            </AppText>
            <AppText color="textMuted">
              {formatBtc(data.balance.totalSats)}
            </AppText>
          </View>
        ) : (
          <View style={styles.skeletons}>
            <SkeletonBlock height={44} width={220} />
            <SkeletonBlock height={18} width={140} />
          </View>
        )}
        <Divider />
        <View style={styles.balanceSplit}>
          <View style={styles.balanceCol}>
            <Badge label="Confirmed" tone="success" />
            <AppText variant="bodyStrong">
              {data ? formatSats(data.balance.confirmedSats) : '—'}
            </AppText>
          </View>
          <View style={styles.balanceCol}>
            <Badge label="Unconfirmed" tone="warning" />
            <AppText variant="bodyStrong">
              {data ? formatSats(data.balance.unconfirmedSats) : '—'}
            </AppText>
          </View>
        </View>
        {data && data.balance.immatureSats > 0 ? (
          <AppText variant="caption" color="textMuted">
            Plus {formatSats(data.balance.immatureSats)} of immature mining
            rewards (spendable after 100 blocks).
          </AppText>
        ) : null}
      </Card>

      <View style={styles.actions}>
        <Button
          style={styles.action}
          label="Receive"
          icon={<Icon name="receive" size={20} />}
          onPress={() => navigation.navigate('Receive')}
        />
        <Button
          style={styles.action}
          label="Send"
          icon={<Icon name="send" size={20} />}
          onPress={() => navigation.navigate('Send')}
          disabled={!data || data.balance.spendableSats === 0}
          accessibilityHint={
            data && data.balance.spendableSats === 0
              ? 'Receive bitcoin first'
              : undefined
          }
        />
      </View>

      <Card style={styles.syncCard}>
        <View style={styles.syncRow}>
          <View style={styles.syncText}>
            <AppText variant="bodyStrong">
              {data ? `Synced to block ${data.walletHeight}` : 'Sync status'}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {health.isError
                ? 'Rust API unreachable'
                : nodeReachable === false
                ? 'Bitcoin Core unreachable'
                : health.data?.node.blocks != null
                ? `Bitcoin Core is at block ${health.data.node.blocks}`
                : 'Checking Bitcoin Core…'}
            </AppText>
          </View>
          <Button
            compact
            variant="secondary"
            label="Sync"
            icon={<Icon name="refresh" size={18} />}
            loading={sync.isPending}
            loadingLabel="Syncing…"
            onPress={() => sync.mutate()}
            accessibilityHint="Asks Bitcoin Core for new blocks and mempool transactions"
          />
        </View>
        {sync.isError ? (
          <AppText variant="caption" color="danger">
            Sync failed: {errorMessage(sync.error)}
          </AppText>
        ) : null}
      </Card>

      {sync.isSuccess ? (
        <WhatJustHappened>
          {`${explain.afterSync} Scanned ${sync.data.blocksScanned} new block${
            sync.data.blocksScanned === 1 ? '' : 's'
          } and ${sync.data.mempoolTransactions} mempool transaction${
            sync.data.mempoolTransactions === 1 ? '' : 's'
          }; the wallet is now at height ${sync.data.walletHeight}.`}
        </WhatJustHappened>
      ) : null}

      <SectionTitle
        title="Latest activity"
        action={
          <Button
            compact
            variant="ghost"
            label="See all"
            onPress={() => navigation.navigate('Activity')}
          />
        }
      />
      <Card>
        {data?.latestTransaction ? (
          <TransactionRow
            tx={data.latestTransaction}
            onPress={() =>
              navigation.navigate('TransactionDetail', {
                txid: data.latestTransaction!.txid,
              })
            }
          />
        ) : data ? (
          <AppText color="textMuted">
            No transactions yet. Tap Receive to get an address, send regtest
            coins to it from Polar, then sync.
          </AppText>
        ) : (
          <SkeletonBlock height={56} />
        )}
      </Card>

      <SectionTitle title="What your wallet knows" />
      <Card tone="soft">
        <KeyValueRow
          label="Revealed addresses"
          value={data ? String(data.revealedAddresses) : '—'}
        />
        <KeyValueRow
          label="Used addresses"
          value={data ? String(data.usedAddresses) : '—'}
        />
        <KeyValueRow
          label="Spendable UTXOs"
          value={data ? String(data.utxoCount) : '—'}
        />
        <KeyValueRow
          label="Last synchronized block"
          value={data ? String(data.walletHeight) : '—'}
        />
        {data ? (
          <Mono
            color="textMuted"
            accessibilityLabel={`Tip hash ${data.tipHash}`}
          >
            {truncateMiddle(data.tipHash, 16, 12)}
          </Mono>
        ) : null}
        <Button
          compact
          variant="ghost"
          label="Explore in Bitcoin Lab"
          onPress={() => navigation.navigate('Lab')}
          style={styles.labLink}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickerPressed: { backgroundColor: colors.surfaceMuted },
  balanceCard: { gap: spacing.xs },
  skeletons: { gap: spacing.xs },
  balanceSplit: { flexDirection: 'row', gap: spacing.md },
  balanceCol: { flex: 1, gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  syncCard: { gap: spacing.xs },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  syncText: { flex: 1, gap: 2 },
  labLink: { alignSelf: 'flex-start', marginTop: spacing.xs },
});
