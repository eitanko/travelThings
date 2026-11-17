import React, { useEffect, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, shadow } from '@/theme';

interface Props<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}

/** iOS-style segmented control with a sliding thumb (prototype `.seg`). */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const [w, setW] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const segW = w > 0 ? (w - 4) / options.length : 0;

  useEffect(() => {
    Animated.timing(x, { toValue: idx * segW, duration: 300, easing: Easing.bezier(0.3, 0.9, 0.3, 1), useNativeDriver: true }).start();
  }, [idx, segW, x]);

  return (
    <View style={styles.seg} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {segW > 0 && <Animated.View style={[styles.thumb, shadow.segThumb, { width: segW, transform: [{ translateX: x }] }]} />}
      {options.map((o) => (
        <Pressable
          key={o.key}
          style={styles.btn}
          onPress={() => onChange(o.key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.key === value }}
        >
          <Text style={[styles.label, o.key === value && { fontWeight: '600' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: colors.fill, borderRadius: 10, padding: 2, marginTop: 10 },
  thumb: { position: 'absolute', top: 2, bottom: 2, left: 2, backgroundColor: '#fff', borderRadius: 8 },
  btn: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '500', color: colors.label },
});
