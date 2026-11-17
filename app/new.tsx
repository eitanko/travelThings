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
import { importSession, notifyLibraryChanged, setFlash, useStagedFiles } from '@/state/store';
import { colors, shadow } from '@/theme';

const baseName = (n: string) => {
  const e = extensionOf(n);
  return e ? n.slice(0, -(e.length + 1)) : n;
};

export default function NewDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staged = useStagedFiles();
  const sheet = useActionSheet();
  const [meta, setMeta] = useState<DocumentMetadata>(EMPTY_METADATA);
  const [saving, setSaving] = useState(false);

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

  const finish = (docId: string) => {
    leaving.current = true;
    importSession.clear();
    notifyLibraryChanged();
    setFlash({ message: 'Document saved', highlightId: docId });
    router.dismissAll();
  };

  const commit = async (prepared: PreparedImport, mode: CommitMode) => {
    setSaving(true);
    try {
      const svc = await getDocumentService();
      const doc = await svc.commit(prepared, meta, mode);
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
          <PreviewCarousel items={items} height={210} showZoomPill onOpen={() => router.push({ pathname: '/viewer', params: { staged: '1' } })} />
        </View>
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
