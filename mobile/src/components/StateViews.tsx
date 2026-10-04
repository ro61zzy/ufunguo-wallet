import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { errorMessage } from '../api/errors';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View
      style={styles.center}
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={label}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      <AppText color="textMuted">{label}</AppText>
    </View>
  );
}

export function SkeletonBlock({
  height = 20,
  width = '100%' as const,
}: {
  height?: number;
  width?: number | '100%';
}) {
  return <View style={[styles.skeleton, { height, width }]} />;
}

export function EmptyState({
  icon = 'info',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <Card tone="muted" style={styles.empty}>
      <View style={styles.iconBubble}>
        <Icon name={icon} color={colors.primary} />
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText color="textMuted" align="center">
        {message}
      </AppText>
      {action}
    </Card>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <Card
      style={styles.error}
      accessibilityLabel={`${title}. ${errorMessage(error)}`}
    >
      <View style={styles.errorHeader}>
        <Icon name="info" color={colors.danger} />
        <AppText variant="bodyStrong" color="danger">
          {title}
        </AppText>
      </View>
      <AppText color="textMuted">{errorMessage(error)}</AppText>
      {onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          compact
          onPress={onRetry}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.sm,
  },
  skeleton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    gap: spacing.sm,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  errorHeader: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
});
