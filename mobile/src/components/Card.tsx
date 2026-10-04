import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'muted' | 'soft';
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const TONES = {
  default: colors.surface,
  muted: colors.surfaceMuted,
  soft: colors.primarySoft,
};

export function Card({
  children,
  style,
  tone = 'default',
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: CardProps) {
  const base = [styles.card, { backgroundColor: TONES[tone] }, style];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        style={({ pressed }) => [base, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={base}>{children}</View>;
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionTitle}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg - 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
