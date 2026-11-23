import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionSheet } from '@/components/ActionSheet';
import { DocumentForm } from '@/components/DocumentForm';
import { PreviewCarousel, type PreviewItem } from '@/components/PreviewCarousel';
import { errorSheet } from '@/components/showError';
import { attachmentKind } from '@/domain/documents';
import { resolveMimeType } from '@/domain/validation';
import type { Document, DocumentMetadata } from '@/domain/types';
import type { RotationChange } from '@/services/documentService';
import { getDocumentService, getReadyDocumentService } from '@/services/container';
import { openPreview } from '@/services/documentPreview';
import { removeTempFile } from '@/services/importer';
import { renderRotatedCopy } from '@/services/imageRotation';
import { notifyLibraryChanged, setFlash, useDocument } from '@/state/store';
import { type Palette, useThemedStyles, shadow } from '@/theme';

export default function EditDocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const doc = useDocument(id);
  const { styles } = useThemedStyles(makeStyles);

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
  const { colors, styles } = useThemedStyles(makeStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheet = useActionSheet();
  const [meta, setMeta] = useState<DocumentMetadata>(() => ({
    title: doc.title,
    category: doc.category,
    type: doc.type,
    activityDate: doc.activityDate,
    expirationDate: doc.expirationDate,
  }));
  const [saving, setSaving] = useState(false);
  // Extra clockwise quarter turns per attachment, not saved yet. Cancelling simply drops them.
  const [pending, setPending] = useState<Record<string, number>>({});

  const items: PreviewItem[] = useMemo(() => {
    const svc = getReadyDocumentService();
    return doc.attachments.map((a) => ({ uri: svc.uriFor(a), name: a.originalName, kind: attachmentKind(a), turns: pending[a.id] ?? 0 }));
  }, [doc, pending]);

  // Turns one image 90° clockwise in the preview right away. Nothing is rendered or stored until Save.
  const rotate = (index: number) => {
    const a = doc.attachments[index];
    if (!a || saving || attachmentKind(a) !== 'image') return;
    setPending((p) => ({ ...p, [a.id]: (((p[a.id] ?? 0) + 1) % 4) }));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const svc = await getDocumentService();
      // Render corrected copies from the untouched originals, then store everything together.
      const rendered: string[] = [];
      try {
        const changes: RotationChange[] = [];
        for (const a of doc.attachments) {
          const total = (a.rotationTurns + (pending[a.id] ?? 0)) % 4;
          if (total === a.rotationTurns) continue;
          if (total === 0) {
            changes.push({ attachmentId: a.id, turns: 0 });
            continue;
          }
          const copy = await renderRotatedCopy(svc.rotationSourceUri(a), total, a.originalName, a.originalRelativePath ? resolveMimeType(a.originalRelativePath) : a.mimeType);
          rendered.push(copy.uri);
          changes.push({ attachmentId: a.id, turns: total, rendered: copy });
        }
        if (changes.length > 0) await svc.applyRotations(doc.id, changes);
        await svc.updateMetadata(doc.id, meta);
      } finally {
        rendered.forEach(removeTempFile);
      }
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
              onRotate={rotate}
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
          {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Save Document</Text>}
        </Pressable>
      </View>
      {sheet.element}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: colors.blue, fontSize: 17 },
  bottom: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bottomBar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  primary: { height: 54, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onAccent, fontSize: 17, fontWeight: '600' },
});
