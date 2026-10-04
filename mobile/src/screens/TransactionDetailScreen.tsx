import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import type { TransactionDetail } from '../api/types';
import { AppText, Mono } from '../components/AppText';
import { Badge, ConfirmationBadge } from '../components/Badge';
import { Card, Divider, SectionTitle } from '../components/Card';
import {
  ExplainCard,
  ExplainText,
  WhatJustHappened,
} from '../components/ExplainCard';
import { AmountRow, KeyValueRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { ErrorState, LoadingState } from '../components/StateViews';
import { Timeline, type TimelineStep } from '../components/Timeline';
import {
  directionTitle,
  KeychainBadge,
  TechnicalValue,
} from '../components/WalletBits';
import { explain } from '../content/explanations';
import { invalidateWallet, useTransaction } from '../hooks/wallet';
import type { RootScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { colors, spacing } from '../theme/tokens';
import {
  formatSats,
  formatSignedSats,
  formatTimestamp,
  truncateMiddle,
} from '../utils/format';

const POLL_INTERVAL_MS = 4_000;

export function confirmationSteps(tx: TransactionDetail): TimelineStep[] {
  const incoming = tx.direction === 'incoming';
  return [
    {
      key: 'built',
      title: 'Built',
      detail: incoming
        ? 'The sender’s wallet selected coins and created outputs, one paying you.'
        : 'Rust selected your UTXOs and created recipient and change outputs in a PSBT.',
      state: 'done',
    },
    {
      key: 'signed',
      title: 'Signed',
      detail: incoming
        ? 'The sender signed with their keys.'
        : 'Your keys signed every owned input locally.',
      state: 'done',
    },
    {
      key: 'broadcast',
      title: 'Broadcast',
      detail: 'The finalized transaction was handed to a Bitcoin node.',
      state: 'done',
    },
    {
      key: 'mempool',
      title: 'Mempool',
      detail: tx.confirmed
        ? 'Waited in the mempool until a miner included it.'
        : 'Valid and waiting for a miner. Mine a block in Polar to confirm it.',
      state: tx.confirmed ? 'done' : 'active',
    },
    {
      key: 'confirmed',
      title: 'Confirmed',
      detail: tx.confirmed
        ? `Included in block ${tx.blockHeight}; ${
            tx.confirmations
          } confirmation${tx.confirmations === 1 ? '' : 's'} so far.`
        : 'Not yet in a block.',
      state: tx.confirmed ? 'done' : 'pending',
    },
  ];
}

export function TransactionDetailScreen({
  route,
}: RootScreenProps<'TransactionDetail'>) {
  const { txid, justSent } = route.params;
  const { selectedWallet, repository, dataSource } = useAppSettings();
  const client = useQueryClient();
  const query = useTransaction(selectedWallet, txid);
  const tx = query.data;
  const waiting = tx !== undefined && !tx.confirmed;

  // Status polling: while unconfirmed, ask Rust to sync with Bitcoin Core and
  // re-read the transaction until it lands in a block.
  useEffect(() => {
    if (!waiting || !selectedWallet) {
      return;
    }
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        await repository.sync(selectedWallet);
      } catch {
        // A failed poll is retried on the next tick.
      }
      if (!cancelled) {
        invalidateWallet(client, dataSource, selectedWallet);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waiting, selectedWallet, repository, client, dataSource]);

  if (query.isPending) {
    return (
      <Screen showRegtest={false} edges={['left', 'right']}>
        <LoadingState label="Loading transaction…" />
      </Screen>
    );
  }

  if (query.isError || !tx) {
    return (
      <Screen showRegtest={false} edges={['left', 'right']}>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  const when = formatTimestamp(tx.timestamp);

  return (
    <Screen edges={['left', 'right']}>
      {justSent ? (
        <WhatJustHappened>{explain.afterSend}</WhatJustHappened>
      ) : null}

      <Card style={styles.hero}>
        <AppText variant="label" color="textMuted">
          {directionTitle(tx)}
        </AppText>
        <AppText
          variant="title"
          color={tx.netSats > 0 ? 'success' : 'ink'}
          accessibilityLabel={`${directionTitle(tx)} ${formatSats(
            Math.abs(tx.netSats),
          )}`}
        >
          {formatSignedSats(tx.netSats)}
        </AppText>
        <View style={styles.badges}>
          <ConfirmationBadge
            confirmed={tx.confirmed}
            confirmations={tx.confirmations}
          />
          {waiting ? <Badge label="Watching for a block…" tone="info" /> : null}
        </View>
      </Card>

      <SectionTitle title="Confirmation timeline" />
      <Card>
        <Timeline steps={confirmationSteps(tx)} />
      </Card>

      <SectionTitle title="Details" />
      <Card>
        <TechnicalValue label="Transaction ID (TXID)" value={tx.txid} />
        <Divider />
        <AmountRow label="Sent from this wallet" sats={tx.sentSats} />
        <AmountRow label="Received by this wallet" sats={tx.receivedSats} />
        {tx.feeSats !== null ? (
          <AmountRow label="Miner fee" sats={tx.feeSats} />
        ) : (
          <KeyValueRow label="Miner fee" value="Paid by the sender" />
        )}
        <KeyValueRow
          label="Block height"
          value={tx.blockHeight !== null ? String(tx.blockHeight) : 'Mempool'}
        />
        <KeyValueRow label="Confirmations" value={String(tx.confirmations)} />
        {when ? (
          <KeyValueRow
            label={tx.confirmed ? 'Block time' : 'First seen'}
            value={when}
          />
        ) : null}
        <KeyValueRow label="Size" value={`${tx.vsize} vB`} />
      </Card>

      <SectionTitle title={`Inputs (${tx.inputs.length})`} />
      <Card style={styles.ioList}>
        {tx.inputs.map(input => (
          <View key={input.outpoint} style={styles.io}>
            <View style={styles.ioHeader}>
              <AppText variant="bodyStrong">
                {input.valueSats !== null
                  ? formatSats(input.valueSats)
                  : 'Unknown value'}
              </AppText>
              <KeychainBadge keychain={input.isMine ? input.keychain : null} />
            </View>
            <Mono color="textMuted">
              {truncateMiddle(input.outpoint, 14, 10)}
            </Mono>
          </View>
        ))}
      </Card>

      <SectionTitle title={`Outputs (${tx.outputs.length})`} />
      <Card style={styles.ioList}>
        {tx.outputs.map(output => (
          <View key={output.vout} style={styles.io}>
            <View style={styles.ioHeader}>
              <AppText variant="bodyStrong">
                {formatSats(output.valueSats)}
              </AppText>
              <KeychainBadge
                keychain={output.isMine ? output.keychain : null}
              />
            </View>
            <Mono color="textMuted">
              #{output.vout} {output.address ?? 'non-standard script'}
            </Mono>
          </View>
        ))}
      </Card>

      <ExplainCard title="Mempool and confirmations">
        <ExplainText>{explain.mempool}</ExplainText>
        <ExplainText>{explain.confirmations}</ExplainText>
      </ExplainCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs },
  badges: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  ioList: { gap: spacing.sm },
  io: {
    gap: 4,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
