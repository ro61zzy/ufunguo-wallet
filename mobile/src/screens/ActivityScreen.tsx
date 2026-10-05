import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TransactionDirection } from '../api/types';
import { Card } from '../components/Card';
import { ExplainCard, ExplainText } from '../components/ExplainCard';
import { Segmented } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { TransactionRow } from '../components/WalletBits';
import { explain } from '../content/explanations';
import { useSyncWallet, useTransactions } from '../hooks/wallet';
import type { TabScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { colors } from '../theme/tokens';

type Filter = 'all' | TransactionDirection;

export function ActivityScreen({ navigation }: TabScreenProps<'Activity'>) {
  const { selectedWallet } = useAppSettings();
  const transactions = useTransactions(selectedWallet);
  const sync = useSyncWallet(selectedWallet);
  const [filter, setFilter] = useState<Filter>('all');

  const items = (transactions.data ?? []).filter(
    tx => filter === 'all' || tx.direction === filter,
  );

  return (
    <Screen
      title="Activity"
      subtitle="Pull down to sync with Bitcoin Core."
      refreshing={sync.isPending}
      onRefresh={() => sync.mutate()}
    >
      <Segmented<Filter>
        accessibilityLabel="Filter transactions"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'incoming', label: 'Received' },
          { value: 'outgoing', label: 'Sent' },
        ]}
      />

      {transactions.isPending && selectedWallet ? (
        <LoadingState label="Loading transactions…" />
      ) : transactions.isError ? (
        <ErrorState
          error={transactions.error}
          onRetry={() => transactions.refetch()}
          retrying={transactions.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="activity"
          title={filter === 'all' ? 'No transactions yet' : 'Nothing here'}
          message={
            filter === 'all'
              ? 'Generate a receive address, send regtest coins to it from Polar and pull down to sync.'
              : 'No transactions match this filter.'
          }
        />
      ) : (
        <Card style={styles.list}>
          {items.map((tx, index) => (
            <View
              key={tx.txid}
              style={index > 0 ? styles.separated : undefined}
            >
              <TransactionRow
                tx={tx}
                onPress={() =>
                  navigation.navigate('TransactionDetail', { txid: tx.txid })
                }
              />
            </View>
          ))}
        </Card>
      )}

      <ExplainCard title="Why is “sent” bigger than the amount I paid?">
        <ExplainText>{explain.change}</ExplainText>
        <ExplainText>
          Ufunguo shows the net effect on your wallet: what left your wallet
          minus the change that came back. For a payment that is the amount plus
          the miner fee.
        </ExplainText>
      </ExplainCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 4 },
  separated: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
