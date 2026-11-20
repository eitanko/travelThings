import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/domain/documents';
import { colors } from '@/theme';
import { Icon } from './Icon';

export interface SheetAction {
  label: string;
  sub?: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
  /** Optional trailing "•••" button that opens a contextual menu for this row (e.g. rename or delete a trip). */
  onMore?: () => void;
}

export interface SheetConfig {
  title?: string;
  message?: string;
  actions: SheetAction[];
  cancelLabel?: string;
  onCancel?: () => void;
}

/**
 * iOS-style bottom action sheet (prototype's `openSheet`). Rendered as an overlay inside the screen
 * rather than a RN <Modal>, so it also works on top of native modal screens.
 */
export function useActionSheet() {
  const [config, setConfig] = useState<SheetConfig | null>(null);
  // Each show() gets a new instance. Otherwise a sheet that is shown right after another one closes (for example a
  // trip menu opened from the trip sheet) reuses the old instance, whose closing state and entrance animation are stale.
  const [instance, setInstance] = useState(0);
  const show = useCallback((c: SheetConfig) => {
    setInstance((n) => n + 1);
    setConfig(c);
  }, []);
  const hide = useCallback(() => setConfig(null), []);
  const element = config ? <SheetView key={instance} config={config} onClose={hide} /> : null;
  return { show, hide, element };
}

function SheetView({ config, onClose }: { config: SheetConfig; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [t] = useState(() => new Animated.Value(0));
  const closing = useRef(false);

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 380, easing: Easing.bezier(0.22, 0.8, 0.25, 1), useNativeDriver: true }).start();
  }, [t]);

  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(t, { toValue: 0, duration: 260, easing: Easing.bezier(0.22, 0.8, 0.25, 1), useNativeDriver: true }).start(() => {
      onClose();
      after?.();
    });
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(config.onCancel)} accessibilityLabel="Dismiss" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { bottom: insets.bottom + 8, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] },
        ]}
      >
        <View style={styles.group}>
          {(config.title || config.message) && (
            <View style={styles.head}>
              {config.title ? <Text style={styles.headTitle}>{config.title}</Text> : null}
              {config.message ? <Text style={styles.headMsg}>{config.message}</Text> : null}
            </View>
          )}
          {config.actions.map((a, i) => (
            <View key={`${a.label}-${i}`} style={[styles.row, (i > 0 || config.title || config.message) && styles.btnBorder]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={a.sub ? `${a.label}, ${a.sub}` : a.label}
                onPress={() => close(a.onPress)}
                style={({ pressed }) => [styles.btn, styles.btnFlex, pressed && { backgroundColor: 'rgba(0,0,0,0.06)' }]}
              >
                {a.icon ? <Icon name={a.icon} size={24} color={a.destructive ? colors.red : colors.blue} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.btnText, a.destructive && { color: colors.red }]}>{a.label}</Text>
                  {a.sub ? <Text style={styles.btnSub}>{a.sub}</Text> : null}
                </View>
              </Pressable>
              {a.onMore ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More options for ${a.label}`}
                  hitSlop={8}
                  onPress={() => close(a.onMore)}
                  style={({ pressed }) => [styles.more, pressed && { opacity: 0.5 }]}
                >
                  <Text style={styles.moreText}>•••</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
        <Pressable accessibilityRole="button" style={styles.cancel} onPress={() => close(config.onCancel)}>
          <Text style={styles.cancelText}>{config.cancelLabel ?? 'Cancel'}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 8, right: 8, gap: 8 },
  group: { backgroundColor: 'rgba(250,250,252,0.97)', borderRadius: 14, overflow: 'hidden' },
  head: { paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', gap: 3 },
  headTitle: { color: colors.label, fontSize: 14, fontWeight: '600' },
  headMsg: { color: colors.secondary, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  btnFlex: { flex: 1 },
  more: { minHeight: 60, paddingHorizontal: 18, justifyContent: 'center' },
  moreText: { color: colors.secondary, fontSize: 16, letterSpacing: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 22, minHeight: 60 },
  btnBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  btnText: { fontSize: 18, color: colors.blue },
  btnSub: { fontSize: 12.5, color: colors.secondary, marginTop: 1 },
  cancel: { minHeight: 58, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.blue, fontWeight: '600', fontSize: 18 },
});
