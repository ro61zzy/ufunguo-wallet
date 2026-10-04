import React from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';
import {
  colors,
  fonts,
  typography,
  type ColorName,
  type TypographyVariant,
} from '../theme/tokens';

interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorName;
  align?: 'left' | 'center' | 'right';
}

export function AppText({
  variant = 'body',
  color = 'ink',
  align,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        variant === 'mono' && styles.mono,
        { color: colors[color] },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}

/** Monospace text for addresses, TXIDs, outpoints and derivation paths. */
export function Mono({
  style,
  color = 'ink',
  selectable = true,
  ...rest
}: Omit<AppTextProps, 'variant'>) {
  return (
    <AppText
      {...rest}
      variant="mono"
      color={color}
      selectable={selectable}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: fonts.mono },
});
