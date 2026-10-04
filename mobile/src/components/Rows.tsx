import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatBtc, formatSats } from '../utils/format';
import { colors, spacing } from '../theme/tokens';
import { AppText, Mono } from './AppText';
import { Icon } from './Icon';

/** Label on the left, value on the right; set `mono` for technical values. */
export function KeyValueRow({
  label,
  value,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <View
      style={styles.kv}
      accessible
      accessibilityLabel={
        typeof value === 'string' ? `${label}: ${value}` : undefined
      }
    >
      <AppText color="textMuted" variant="caption" style={styles.kvLabel}>
        {label}
      </AppText>
      {typeof value === 'string' || typeof value === 'number' ? (
        mono ? (
          <Mono style={styles.kvValue}>{value}</Mono>
        ) : (
          <AppText
            variant={emphasis ? 'bodyStrong' : 'body'}
            style={styles.kvValue}
          >
            {value}
          </AppText>
        )
      ) : (
        <View style={styles.kvValueBox}>{value}</View>
      )}
    </View>
  );
}

/** Satoshis first (the unit Rust uses), BTC underneath for orientation. */
export function AmountRow({ label, sats }: { label: string; sats: number }) {
  return (
    <View
      style={styles.kv}
      accessible
      accessibilityLabel={`${label}: ${formatSats(sats)}`}
    >
      <AppText color="textMuted" variant="caption" style={styles.kvLabel}>
        {label}
      </AppText>
      <View style={styles.amount}>
        <AppText variant="bodyStrong">{formatSats(sats)}</AppText>
        <AppText variant="caption" color="textMuted">
          {formatBtc(sats)}
        </AppText>
      </View>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  accessibilityLabel,
  monoSubtitle = false,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  monoSubtitle?: boolean;
}) {
  const content = (
    <>
      {left}
      <View style={styles.listText}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          monoSubtitle ? (
            <Mono color="textMuted" numberOfLines={1} selectable={false}>
              {subtitle}
            </Mono>
          ) : (
            <AppText variant="caption" color="textMuted">
              {subtitle}
            </AppText>
          )
        ) : null}
      </View>
      {right}
      {onPress ? (
        <Icon name="chevronRight" size={18} color={colors.textMuted} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.listRow}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  kvLabel: { flexShrink: 0, paddingTop: 2, maxWidth: '45%' },
  kvValue: { flexShrink: 1, textAlign: 'right' },
  kvValueBox: { flexShrink: 1, alignItems: 'flex-end' },
  amount: { alignItems: 'flex-end' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  listText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
});
