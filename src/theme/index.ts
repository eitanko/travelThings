/** Design tokens ported 1:1 from the HTML prototype's :root and component CSS. */
export const colors = {
  bg: '#f2f2f7',
  card: '#ffffff',
  label: '#111114',
  secondary: '#8e8e93',
  separator: 'rgba(60,60,67,0.14)',
  blue: '#007aff',
  blueTint: '#eaf3ff',
  red: '#ff3b30',
  fill: 'rgba(118,118,128,0.12)',
  chevron: '#c4c4c8',
  badge: '#efeff4',
  viewerBg: '#0b0b0d',
  yellow: '#ffd60a',
  rowPress: 'rgba(0,0,0,0.05)',
  highlight: '#e6f1ff',
} as const;

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
