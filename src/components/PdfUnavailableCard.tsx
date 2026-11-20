import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Palette, useThemedStyles } from '@/theme';
import { Icon } from './Icon';

export function PdfUnavailableCard({ message }: { message?: string }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Icon name="file" size={34} color={colors.secondary} />
      <Text style={styles.title}>PDF preview unavailable</Text>
      <Text style={styles.msg}>{message ?? 'Tap to open the full PDF.'}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 16, fontWeight: '600', color: colors.secondary },
  msg: { fontSize: 13, color: colors.secondary, textAlign: 'center' },
});
