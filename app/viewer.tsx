import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { FullScreenViewer } from '@/components/FullScreenViewer';
import type { PreviewItem } from '@/components/PreviewCarousel';
import { attachmentKind } from '@/domain/documents';
import { getDocumentService } from '@/services/container';
import { useStagedFiles } from '@/state/store';
import { colors } from '@/theme';

/** Full-screen viewer for a saved document (`id`) or for the files currently staged in the Add flow (`staged=1`). */
export default function ViewerScreen() {
  const router = useRouter();
  const { id, index, staged } = useLocalSearchParams<{ id?: string; index?: string; staged?: string }>();
  const stagedFiles = useStagedFiles();
  const [items, setItems] = useState<PreviewItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (staged) {
        setItems(stagedFiles.map((f) => ({ uri: f.uri, name: f.name, kind: f.mimeType === 'application/pdf' ? 'pdf' : 'image' })));
        return;
      }
      const svc = await getDocumentService();
      const doc = id ? await svc.get(id) : null;
      if (!alive) return;
      setItems(doc ? doc.attachments.map((a) => ({ uri: svc.uriFor(a), name: a.originalName, kind: attachmentKind(a) })) : []);
    })().catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, staged]);

  useEffect(() => {
    if (items && items.length === 0) router.back();
  }, [items, router]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {items && items.length > 0 ? (
        <FullScreenViewer items={items} initialIndex={Number(index ?? 0) || 0} onClose={() => router.back()} />
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.viewerBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
