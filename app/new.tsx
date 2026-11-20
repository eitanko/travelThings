import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionSheet } from '@/components/ActionSheet';
import { DocumentForm } from '@/components/DocumentForm';
import { PreviewCarousel, type PreviewItem } from '@/components/PreviewCarousel';
import { errorSheet } from '@/components/showError';
import { extensionOf } from '@/domain/validation';
import { EMPTY_METADATA, type DocumentMetadata } from '@/domain/types';
import type { CommitMode, PreparedImport } from '@/services/documentService';
import { getDocumentService } from '@/services/container';
import { openPreview } from '@/services/documentPreview';
import { removeTempFile } from '@/services/importer';
import { rotateStagedImage } from '@/services/imageRotation';
import { DEFAULT_TRIP_ID } from '@/domain/trips';
import { removeShare } from '@/services/sharedInbox';
import { importSession, notifyLibraryChanged, setFlash, shareSession, useLibrary, useStagedFiles } from '@/state/store';
import { colors, shadow } from '@/theme';

const baseName = (n: string) => {
  const e = extensionOf(n);
  return e ? n.slice(0, -(e.length + 1)) : n;
};

export default function NewDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staged = useStagedFiles();
  const { selectedTripId, trips } = useLibrary();
  // Imports from the iOS share menu default to My Documents; in-app imports use the trip being viewed.
  const [shareId] = useState(() => shareSession.get()?.id ?? null);
  const [destId, setDestId] = useState<string>(shareId ? DEFAULT_TRIP_ID : selectedTripId);
  const destName = trips.find((t) => t.id === destId)?.name ?? 'My Documents';
  const sheet = useActionSheet();
  const [meta, setMeta] = useState<DocumentMetadata>(EMPTY_METADATA);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  // Set when this screen is already on its way out (saved or discarded) so it never navigates back twice.
  const leaving = useRef(false);

  // Nothing staged (e.g. state was cleared): leave rather than show an empty form.
  useEffect(() => {
    if (staged.length === 0 && !saving && !leaving.current && router.canGoBack()) router.back();
  }, [staged.length, saving, router]);

  const items: PreviewItem[] = useMemo(
    () => staged.map((f) => ({ uri: f.uri, name: f.name, kind: f.mimeType === 'application/pdf' ? 'pdf' : 'image' })),
    [staged],
  );

  // Turns one page 90° clockwise. Only that page changes; the original capture is kept untouched.
  const rotate = async (index: number) => {
    const current = importSession.get()[index];
    if (rotating || saving || !current || current.mimeType === 'application/pdf') return;
    setRotating(true);
    try {
      const next = await rotateStagedImage(current);
      // The user may have discarded the import while this turn was rendering. Then the result is not wanted.
      if (importSession.get()[index] !== current) {
        removeTempFile(next.uri);
        return;
      }
      importSession.replaceAt(index, next);
    } catch (e) {
      sheet.show(errorSheet(e));
    } finally {
      setRotating(false);
    }
  };

  // The shared files are deleted only once the event is durably committed or the user discards the import.
  const endShare = () => {
    if (!shareId) return;
    removeShare(shareId);
    shareSession.set(null);
  };

  const finish = (docId: string) => {
    leaving.current = true;
    importSession.clear();
    endShare();
    notifyLibraryChanged();
    setFlash({ message: 'Document saved', highlightId: docId });
    router.dismissAll();
  };

  const commit = async (prepared: PreparedImport, mode: CommitMode) => {
    setSaving(true);
    try {
      const svc = await getDocumentService();
      const doc = await svc.commit(prepared, meta, mode, destId);
      finish(doc.id); // success is reported only after files AND metadata are stored
    } catch (e) {
      setSaving(false);
      sheet.show(errorSheet(e, () => void commit(prepared, mode)));
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const svc = await getDocumentService();
      const prepared = await svc.prepare(staged);
      if (!prepared.duplicate) {
        setSaving(false);
        await commit(prepared, { kind: 'new' });
        return;
      }
      setSaving(false);
      const existing = prepared.duplicate;
      sheet.show({
        title: 'This document is already saved',
        message: `It matches “${existing.title?.trim() || existing.originalName}” in your library.`,
        actions: [
          { label: 'Replace existing', onPress: () => void commit(prepared, { kind: 'replace', existingId: existing.id }) },
          {
            label: 'Save with another name',
            onPress: () => {
              const first = staged[0]!.name;
              const suggestion = `${meta.title?.trim() || baseName(first)} copy`;
              Alert.prompt(
                'Save with another name',
                'The file is kept as is. This only changes the name shown in your library.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Save', onPress: (v?: string) => void commit(prepared, { kind: 'rename', title: v?.trim() || suggestion }) },
                ],
                'plain-text',
                suggestion,
              );
            },
          },
        ],
        cancelLabel: 'Cancel', // leaves everything unchanged
      });
    } catch (e) {
      setSaving(false);
      sheet.show(errorSheet(e, () => void save()));
    }
  };

  const cancel = () =>
    sheet.show({
      title: 'Discard this document?',
      message: 'It has not been saved yet.',
      actions: [
        {
          label: 'Discard Document',
          destructive: true,
          onPress: () => {
            leaving.current = true;
            importSession.clear();
            endShare();
            router.back();
          },
        },
      ],
      cancelLabel: 'Keep Editing',
    });

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'New Document',
          headerLeft: () => (
            <Pressable onPress={cancel} hitSlop={10} accessibilityRole="button" disabled={saving}>
              <Text style={styles.headerBtn}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <View style={{ marginHorizontal: 16, marginTop: 10 }}>
          <PreviewCarousel
            items={items}
            height={210}
            showZoomPill
            onRotate={(i) => void rotate(i)}
            rotating={rotating}
            onOpen={(i) =>
              openPreview(
                staged.map((f) => f.uri),
                i,
                () => router.push({ pathname: '/viewer', params: { staged: '1', index: String(i) } }),
              ).catch((e) => sheet.show(errorSheet(e)))
            }
          />
        </View>
        {shareId && trips.length > 1 && (
          <Pressable
            style={styles.dest}
            accessibilityRole="button"
            accessibilityLabel={`Destination trip: ${destName}`}
            disabled={saving}
            onPress={() =>
              sheet.show({
                title: 'Save to',
                actions: trips.map((t) => ({ label: t.name, onPress: () => setDestId(t.id) })),
                cancelLabel: 'Cancel',
              })
            }
          >
            <Text style={styles.destLabel}>Save to</Text>
            <Text style={styles.destValue}>{destName}</Text>
          </Pressable>
        )}
        <DocumentForm value={meta} onChange={setMeta} disabled={saving} />
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => void save()}
          disabled={saving || rotating}
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
  dest: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between' },
  destLabel: { fontSize: 17, color: colors.label },
  destValue: { fontSize: 17, color: colors.blue },
  headerBtn: { color: colors.blue, fontSize: 17 },
  bottom: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(242,242,247,0.92)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  primary: { height: 54, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
