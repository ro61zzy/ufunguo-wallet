import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';

interface TextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
  mono?: boolean;
  right?: React.ReactNode;
}

export function TextField({
  label,
  hint,
  error,
  mono = false,
  right,
  style,
  ...rest
}: TextFieldProps) {
  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      <View style={[styles.inputWrap, error ? styles.inputError : null]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          {...rest}
          style={[styles.input, mono && styles.mono, style]}
        />
        {right}
      </View>
      {error ? (
        <AppText
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
        >
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  caption?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      style={styles.segmented}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={
              option.caption
                ? `${option.label}, ${option.caption}`
                : option.label
            }
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            <AppText variant="label">{option.label}</AppText>
            {option.caption ? (
              <AppText variant="caption" color="textMuted">
                {option.caption}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.danger },
  input: {
    flex: 1,
    minHeight: 50,
    fontSize: 16,
    color: colors.ink,
  },
  mono: { fontFamily: fonts.mono, fontSize: 14 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radii.sm - 4,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  segmentPressed: { backgroundColor: colors.primarySoft },
});
