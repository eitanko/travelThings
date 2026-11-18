import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionSheet } from '@/components/ActionSheet';
import { DocumentForm } from '@/components/DocumentForm';
import { PreviewCarousel, type PreviewItem } from '@/components/PreviewCarousel';
import { errorSheet } from '@/components/showError';
import { attachmentKind } from '@/domain/documents';
import type { Document, DocumentMetadata } from '@/domain/types';
import { getDocumentService, getReadyDocumentService } from '@/services/container';
import { openPreview } from '@/services/documentPreview';
import { notifyLibraryChanged, setFlash, useDocument } from '@/state/store';
import { colors, shadow } from '@/theme';

export default function EditDocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const doc = useDocument(id);

  useEffect(() => {
    if (doc === null && router.canGoBack()) router.back(); // deleted or never existed
  }, [doc, router]);

  if (!doc) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  }
  // Keyed by id so the form state is initialised once from the stored values.
  return <EditForm key={doc.id} doc={doc} />;
}

function EditForm({ doc }: { doc: Document }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheet = useActionSheet();
  const [meta, setMeta] = useState<DocumentMetadata>(() => ({
    title: doc.title,
    type: doc.type,
    activityDate: doc.activityDate,
  }));
  const [saving, setSaving] = useState(false);

  const items: PreviewItem[] = useMemo(() => {
    const svc = getReadyDocumentService();
    return doc.attachments.map((a) => ({ uri: svc.uriFor(a), name: a.originalName, kind: attachmentKind(a) }));
  }, [doc]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const svc = await getDocumentService();
      await svc.updateMetadata(doc.id, meta);
      notifyLibraryChanged();
      setFlash({ message: 'Changes saved' });
      router.back();
    } catch (e) {
      setSaving(false);
      sheet.show(errorSheet(e, () => void save()));
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'Edit Document',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
              <Text style={styles.headerBtn}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        {items.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 10 }}>
            <PreviewCarousel
              items={items}
              height={210}
              showZoomPill
              onOpen={(i) =>
                openPreview(
                  doc.attachments.map((a) => getReadyDocumentService().uriFor(a)),
                  i,
                  () => router.push({ pathname: '/viewer', params: { id: doc.id, index: String(i) } }),
                ).catch((e) => sheet.show(errorSheet(e)))
              }
            />
          </View>
        )}
        <DocumentForm value={meta} onChange={setMeta} disabled={saving} />
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => void save()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save Document"
          style={({ pressed }) => [styles.primary, shadow.primary, pressed && { transform: [{ scale: 0.985 }] }, saving && { opacity: 0.8 }]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save Document</Text>}
        </Pressable>
      </View>
      {sheet.element}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: colors.blue, fontSize: 17 },
  bottom: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(242,242,247,0.92)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  primary: { height: 54, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
