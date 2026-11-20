import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EXPIRATION_LABEL, type ExpirationStatus } from '@/domain/expiration';
import { type Palette, useThemedStyles } from '@/theme';

/** Compact text label for an expiring document. Renders nothing when there is no warning. Text, not color alone. */
export function ExpirationBadge({ status }: { status: ExpirationStatus }) {
  const { styles } = useThemedStyles(makeStyles);
  if (status === 'none') return null;
  const expired = status === 'expired';
  return (
    <View style={[styles.pill, expired ? styles.expiredBg : styles.warnBg]}>
      <Text style={[styles.text, expired ? styles.expiredText : styles.warnText]} numberOfLines={1}>
        {EXPIRATION_LABEL[status]}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    pill: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
    warnBg: { backgroundColor: colors.warnTint },
    expiredBg: { backgroundColor: colors.expiredTint },
    text: { fontSize: 12, fontWeight: '600' },
    warnText: { color: colors.warnText },
    expiredText: { color: colors.expiredText },
  });
