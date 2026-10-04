import React, { useEffect, useRef, useState } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import { Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { Keychain, WalletTransaction } from '../api/types';
import { colors, radii, spacing } from '../theme/tokens';
import {
  formatBtc,
  formatSats,
  formatTimestamp,
  truncateMiddle,
} from '../utils/format';
import { AppText, Mono } from './AppText';
import { Badge, ConfirmationBadge } from './Badge';
import { Icon } from './Icon';

export function CopyButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const copy = () => {
    Clipboard.setString(value);
    setCopied(true);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Pressable
      onPress={copy}
      accessibilityRole="button"
      accessibilityLabel={copied ? 'Copied to clipboard' : label}
      accessibilityLiveRegion="polite"
      hitSlop={8}
      style={({ pressed }) => [styles.copy, pressed && styles.copyPressed]}
    >
      <Icon
        name={copied ? 'check' : 'copy'}
        size={18}
        color={copied ? colors.success : colors.ink}
      />
      <AppText variant="label" color={copied ? 'success' : 'ink'}>
        {copied ? 'Copied' : label}
      </AppText>
    </Pressable>
  );
}

/** Long technical value (address, TXID) shown in full with a copy action. */
export function TechnicalValue({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel?: string;
}) {
  return (
    <View style={styles.technical}>
      <View style={styles.technicalHeader}>
        <AppText variant="caption" color="textMuted">
          {label}
        </AppText>
        <CopyButton value={value} label={copyLabel ?? 'Copy'} />
      </View>
      <Mono accessibilityLabel={`${label}: ${value}`}>{value}</Mono>
    </View>
  );
}

export function AddressQr({
  value,
  size = 200,
}: {
  value: string;
  size?: number;
}) {
  return (
    <View
      style={styles.qr}
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR code of the receive address"
    >
      <QRCode
        value={value}
        size={size}
        color={colors.ink}
        backgroundColor={colors.surface}
      />
    </View>
  );
}

export function KeychainBadge({ keychain }: { keychain: Keychain | null }) {
  if (keychain === null) {
    return <Badge label="Not yours" tone="neutral" />;
  }
  return keychain === 'external' ? (
    <Badge label="Receive" tone="info" />
  ) : (
    <Badge label="Change" tone="primary" />
  );
}

export function UsedBadge({ used }: { used: boolean }) {
  return used ? (
    <Badge label="Used" tone="neutral" />
  ) : (
    <Badge label="Unused" tone="success" />
  );
}

const DIRECTION_COPY = {
  incoming: { title: 'Received', icon: 'receive', tone: colors.success },
  outgoing: { title: 'Sent', icon: 'send', tone: colors.ink },
  self: { title: 'Moved to yourself', icon: 'swap', tone: colors.info },
} as const;

export function directionTitle(tx: Pick<WalletTransaction, 'direction'>) {
  return DIRECTION_COPY[tx.direction].title;
}

export function TransactionRow({
  tx,
  onPress,
}: {
  tx: WalletTransaction;
  onPress?: () => void;
}) {
  const copy = DIRECTION_COPY[tx.direction];
  const amount =
    tx.netSats > 0 ? `+${formatSats(tx.netSats)}` : formatSats(tx.netSats);
  const when = formatTimestamp(tx.timestamp);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${copy.title} ${formatSats(Math.abs(tx.netSats))}, ${
        tx.confirmed ? `${tx.confirmations} confirmations` : 'unconfirmed'
      }`}
      accessibilityHint={onPress ? 'Opens transaction details' : undefined}
      style={({ pressed }) => [styles.txRow, pressed && styles.txPressed]}
    >
      <View
        style={[styles.txIcon, tx.direction === 'incoming' && styles.txIconIn]}
      >
        <Icon name={copy.icon} size={20} color={copy.tone} />
      </View>
      <View style={styles.txMain}>
        <View style={styles.txLine}>
          <AppText variant="bodyStrong">{copy.title}</AppText>
          <AppText
            variant="bodyStrong"
            color={tx.netSats > 0 ? 'success' : 'ink'}
          >
            {amount}
          </AppText>
        </View>
        <View style={styles.txLine}>
          <Mono color="textMuted" selectable={false}>
            {truncateMiddle(tx.txid, 8, 6)}
          </Mono>
          <AppText variant="caption" color="textMuted">
            {formatBtc(tx.netSats, { trim: true })}
          </AppText>
        </View>
        <View style={styles.txMeta}>
          <ConfirmationBadge
            confirmed={tx.confirmed}
            confirmations={tx.confirmations}
          />
          <AppText variant="caption" color="textMuted">
            {tx.blockHeight !== null ? `Block ${tx.blockHeight}` : 'In mempool'}
            {when ? ` · ${when}` : ''}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  copyPressed: { backgroundColor: colors.primarySoft },
  technical: { gap: spacing.xs },
  technicalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qr: {
    alignSelf: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  txRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  txPressed: { opacity: 0.6 },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconIn: { backgroundColor: colors.successSoft },
  txMain: { flex: 1, gap: 4 },
  txLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.xs,
  },
  txMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
});
