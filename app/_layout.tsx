import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShareInboxWatcher } from '@/components/ShareInboxWatcher';
import { startBoot, useBoot } from '@/state/boot';
import { colors } from '@/theme';

export default function RootLayout() {
  const boot = useBoot();

  useEffect(() => {
    startBoot();
  }, []);

  if (boot.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (boot.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errTitle}>Couldn&apos;t open your library</Text>
        <Text style={styles.errMsg}>{boot.message}</Text>
        <Pressable onPress={startBoot} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="new" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="add/[id]" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="edit/[id]" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="document/[id]" options={{ title: '', headerBackTitle: 'Documents', headerShadowVisible: false }} />
        <Stack.Screen name="viewer" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }} />
      </Stack>
      <ShareInboxWatcher />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 32, gap: 10 },
  errTitle: { fontSize: 18, fontWeight: '600', color: colors.label },
  errMsg: { fontSize: 15, color: colors.secondary, textAlign: 'center' },
  retry: { marginTop: 10, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12, backgroundColor: colors.blue },
  retryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
