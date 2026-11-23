import { useMemo } from 'react';
import { type ImageStyle, StyleSheet, type TextStyle, useColorScheme, type ViewStyle } from 'react-native';
import type { Category } from '@/domain/types';

/**
 * Semantic color tokens. Every UI color goes through one of these; screens never hardcode a hex value.
 * Light values are the original prototype colors. Dark values follow iOS's dark system palette.
 */
export interface Palette {
  /** Screen background (iOS "grouped" background). */
  bg: string;
  /** Cards, grouped lists, text fields and other surfaces that sit on `bg`. */
  card: string;
  /** Floating surfaces: action sheets and dialogs. */
  elevated: string;
  /** Text field inside an `elevated` surface. */
  inputOnElevated: string;
  label: string;
  secondary: string;
  /** Softer text for file names on a placeholder card. */
  muted: string;
  placeholder: string;
  separator: string;
  blue: string;
  blueTint: string;
  red: string;
  green: string;
  /** Expiration labels: text and tinted background. Chosen for ≥4.5:1 contrast (not just the bare system red). */
  warnText: string;
  warnTint: string;
  expiredText: string;
  expiredTint: string;
  /** Text and icons on top of `blue` (or on the clear buttons). */
  onAccent: string;
  fill: string;
  chevron: string;
  badge: string;
  highlight: string;
  rowPress: string;
  /** Pressed state inside action sheets. */
  sheetPress: string;
  scrim: string;
  /** Translucent bar behind the bottom Save button. */
  bottomBar: string;
  /** Small round clear (x) buttons. */
  clearSearch: string;
  clearField: string;
  /** Selected thumb of the segmented control. */
  segThumb: string;
  /** Backdrop behind document previews. */
  previewBg: string;
  dot: string;
  dotActive: string;
  toast: string;
  /** Surface for placeholder cards shown in place of a document preview. */
  placeholderCard: string;
}

export const lightColors: Palette = {
  bg: '#f2f2f7',
  card: '#ffffff',
  elevated: 'rgba(250,250,252,0.97)',
  inputOnElevated: '#ffffff',
  label: '#111114',
  secondary: '#8e8e93',
  muted: '#555555',
  placeholder: '#b0b0b5',
  separator: 'rgba(60,60,67,0.14)',
  blue: '#007aff',
  blueTint: '#eaf3ff',
  red: '#ff3b30',
  green: '#34c759',
  warnText: '#8a5200',
  warnTint: '#fff1cf',
  expiredText: '#c41e14',
  expiredTint: '#ffe5e3',
  onAccent: '#ffffff',
  fill: 'rgba(118,118,128,0.12)',
  chevron: '#c4c4c8',
  badge: '#efeff4',
  highlight: '#e6f1ff',
  rowPress: 'rgba(0,0,0,0.05)',
  sheetPress: 'rgba(0,0,0,0.06)',
  scrim: 'rgba(0,0,0,0.38)',
  bottomBar: 'rgba(242,242,247,0.92)',
  clearSearch: 'rgba(60,60,67,0.3)',
  clearField: 'rgba(60,60,67,0.18)',
  segThumb: '#ffffff',
  previewBg: '#dcdce3',
  dot: '#c7c7cc',
  dotActive: '#555555',
  toast: 'rgba(30,30,32,0.94)',
  placeholderCard: '#ffffff',
};

export const darkColors: Palette = {
  bg: '#000000',
  card: '#1c1c1e',
  elevated: 'rgba(44,44,46,0.97)',
  inputOnElevated: '#1c1c1e',
  label: '#f2f2f7',
  secondary: '#98989f',
  muted: '#aeaeb2',
  placeholder: '#6e6e73',
  separator: 'rgba(84,84,88,0.55)',
  blue: '#0a84ff',
  blueTint: '#0b2a4a',
  red: '#ff453a',
  green: '#30d158',
  warnText: '#ffc457',
  warnTint: '#3d2c05',
  expiredText: '#ff6b61',
  expiredTint: '#4a1713',
  onAccent: '#ffffff',
  fill: 'rgba(118,118,128,0.24)',
  chevron: '#545458',
  badge: '#2c2c2e',
  highlight: '#0f2e4f',
  rowPress: 'rgba(255,255,255,0.08)',
  sheetPress: 'rgba(255,255,255,0.1)',
  scrim: 'rgba(0,0,0,0.6)',
  bottomBar: 'rgba(0,0,0,0.88)',
  clearSearch: 'rgba(235,235,245,0.3)',
  clearField: 'rgba(235,235,245,0.3)',
  segThumb: '#636366',
  previewBg: '#2c2c2e',
  dot: '#48484a',
  dotActive: '#e5e5ea',
  toast: 'rgba(72,72,74,0.96)',
  placeholderCard: '#1c1c1e',
};

export type Scheme = 'light' | 'dark';

/** Current system appearance. Re-renders the caller when the user changes it (or day/night switches it). */
export function useScheme(): Scheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** Palette for the current system appearance. */
export function useColors(): Palette {
  return useScheme() === 'dark' ? darkColors : lightColors;
}

/**
 * Themed styles: pass a factory that takes the palette and returns a style object. The result is memoized per palette,
 * so styles are rebuilt only when the appearance changes. Usage: `const { colors, styles } = useThemedStyles(makeStyles);`.
 */
export function useThemedStyles<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(factory: (c: Palette) => T) {
  const colors = useColors();
  // `factory` is a module-level function, so it is stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const styles = useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  return { colors, styles };
}

/** Document-type tints (icon color + chip background) for the category indicators. */
const TYPE_TINTS: Record<Scheme, Record<Category, { color: string; background: string }>> = {
  light: {
    transportation: { color: '#2f7df6', background: '#e8f0fe' },
    accommodation: { color: '#e8833a', background: '#fdf0e6' },
    activities: { color: '#d6498c', background: '#fce8f2' },
    personal: { color: '#5b6078', background: '#ececf3' },
    other: { color: '#8e8e93', background: '#efeff2' },
  },
  dark: {
    transportation: { color: '#6aa8ff', background: '#16284a' },
    accommodation: { color: '#ffa05c', background: '#3d2713' },
    activities: { color: '#ff7ab6', background: '#40182f' },
    personal: { color: '#a3a9c4', background: '#2a2d3d' },
    other: { color: '#98989f', background: '#2c2c2e' },
  },
};

/** Tint for a document category in the current appearance. */
export function useTypeTint(category: Category) {
  return TYPE_TINTS[useScheme()][category];
}

/** The full-screen viewer is dark in both appearances (like Photos), so it uses fixed colors. */
export const viewer = { bg: '#0b0b0d', secondary: '#8e8e93' } as const;

export const radius = { card: 16, input: 14, row: 12, big: 14, pill: 999 } as const;

export const font = {
  h1: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.7 },
  title: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 17 },
  rowTitle: { fontSize: 16.5, fontWeight: '600' as const },
  rowSub: { fontSize: 13.5 },
  sectionHeader: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.5 },
};

export const shadow = {
  fab: { shadowColor: '#007aff', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  primary: { shadowColor: '#007aff', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } },
  segThumb: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
};
