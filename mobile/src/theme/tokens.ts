import { Platform } from 'react-native';

export const colors = {
  primary: '#F7591A',
  primaryPressed: '#D9470C',
  primarySoft: '#FFE7DC',
  background: '#FFF8F4',
  surface: '#FFFFFF',
  surfaceMuted: '#F5EEE9',
  ink: '#1C1917',
  textMuted: '#6F625B',
  border: '#E7D8D0',
  success: '#237A57',
  successSoft: '#E3F2EA',
  warning: '#B76B00',
  warningSoft: '#FCEFD9',
  danger: '#C53D3D',
  dangerSoft: '#FBE5E5',
  info: '#315EAC',
  infoSoft: '#E4ECF8',
} as const;

export type ColorName = keyof typeof colors;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
} as const;

export const fonts = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

export const typography = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: '700' },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  mono: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
