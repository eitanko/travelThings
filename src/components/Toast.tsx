import React, { useCallback, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Palette, useThemedStyles } from '@/theme';
import { Icon } from './Icon';

/** Prototype toast: dark pill that slides down from the top with a green check. Only shown after real success. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [y] = useState(() => new Animated.Value(-160));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, styles } = useThemedStyles(makeStyles);

  const show = useCallback(
    (msg: string) => {
      setMessage(msg);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(y, { toValue: 0, duration: 450, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(y, { toValue: -160, duration: 300, useNativeDriver: true }).start(() => setMessage(null));
      }, 2400);
    },
    [y],
  );

  const element = message ? (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.toast, { top: insets.top + 8, transform: [{ translateY: y }] }]}
    >
      <Icon name="check" size={18} color={colors.green} />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  ) : null;

  return { show, element };
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.toast,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    zIndex: 60,
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
