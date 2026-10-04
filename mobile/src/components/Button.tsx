import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  testID?: string;
}

const BACKGROUND: Record<Variant, { idle: string; pressed: string }> = {
  primary: { idle: colors.primary, pressed: colors.primaryPressed },
  secondary: { idle: colors.surface, pressed: colors.surfaceMuted },
  ghost: { idle: 'transparent', pressed: colors.primarySoft },
  danger: { idle: colors.dangerSoft, pressed: '#F5D0D0' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  accessibilityHint,
  style,
  compact = false,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  // Dark ink on orange keeps contrast high for body-size labels.
  const textColor = variant === 'danger' ? 'danger' : 'ink';

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variant === 'secondary' && styles.bordered,
        {
          backgroundColor: pressed
            ? BACKGROUND[variant].pressed
            : BACKGROUND[variant].idle,
        },
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <View style={styles.content}>
          {icon}
          <AppText variant="bodyStrong" color={textColor}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  inactive: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
