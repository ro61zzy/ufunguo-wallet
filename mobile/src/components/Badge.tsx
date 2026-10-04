import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const TONES: Record<BadgeTone, { bg: string; fg: keyof typeof colors }> = {
  neutral: { bg: colors.surfaceMuted, fg: 'textMuted' },
  primary: { bg: colors.primarySoft, fg: 'ink' },
  success: { bg: colors.successSoft, fg: 'success' },
  warning: { bg: colors.warningSoft, fg: 'warning' },
  danger: { bg: colors.dangerSoft, fg: 'danger' },
  info: { bg: colors.infoSoft, fg: 'info' },
};

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: BadgeTone;
}) {
  return (
    <View
      style={[styles.badge, { backgroundColor: TONES[tone].bg }]}
      accessible
      accessibilityLabel={label}
    >
      <AppText variant="label" color={TONES[tone].fg}>
        {label}
      </AppText>
    </View>
  );
}

/** Shown on every main screen: this build only talks to a regtest chain. */
export function RegtestBadge() {
  return (
    <View
      style={styles.regtest}
      accessible
      accessibilityLabel="Regtest network. Test coins only, not real bitcoin."
    >
      <View style={styles.dot} />
      <AppText variant="label">Regtest</AppText>
    </View>
  );
}

export function ConfirmationBadge({
  confirmed,
  confirmations,
}: {
  confirmed: boolean;
  confirmations: number;
}) {
  return confirmed ? (
    <Badge
      tone="success"
      label={`${confirmations} confirmation${confirmations === 1 ? '' : 's'}`}
    />
  ) : (
    <Badge tone="warning" label="Unconfirmed" />
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  regtest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
