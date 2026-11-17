import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, shadow } from '@/theme';
import { Icon } from './Icon';

interface Props {
  onAdd: () => void;
  /** Development-only helper; never passed in release builds. */
  onLoadSamples?: () => void;
}

/** Empty library state (spec AT-11): explanation plus a prominent Add Document action. */
export function EmptyState({ onAdd, onLoadSamples }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Icon name="folder" size={40} color={colors.blue} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        Your travel documents, all in one place
      </Text>
      <Text style={styles.desc}>
        Save tickets, bookings, and important files so they&apos;re ready whenever you need them—even offline.
      </Text>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add Document"
        style={({ pressed }) => [styles.btn, shadow.primary, pressed && { transform: [{ scale: 0.985 }] }]}
      >
        <Icon name="plus" size={20} color="#fff" strokeWidth={2.4} />
        <Text style={styles.btnText}>Add Document</Text>
      </Pressable>
      {onLoadSamples ? (
        <Pressable onPress={onLoadSamples} accessibilityRole="button" style={{ marginTop: 28 }}>
          <Text style={styles.dev}>Load sample documents (development only)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 80 },
  badge: { width: 84, height: 84, borderRadius: 24, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  title: { fontSize: 22, fontWeight: '700', color: colors.label, textAlign: 'center', letterSpacing: -0.2 },
  desc: { fontSize: 15, lineHeight: 21, color: colors.secondary, textAlign: 'center', marginTop: 10, marginBottom: 28 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, paddingHorizontal: 28, borderRadius: 15, backgroundColor: colors.blue },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  dev: { color: colors.secondary, fontSize: 13, textDecorationLine: 'underline' },
});
