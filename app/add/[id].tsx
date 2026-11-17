import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionSheet } from '@/components/ActionSheet';
import { PreviewCarousel, type PreviewItem } from '@/components/PreviewCarousel';
import { errorSheet } from '@/components/showError';
import { displayTitle } from '@/domain/documents';
import type { PreparedImport } from '@/services/documentService';
import { getDocumentService } from '@/services/container';
import { importSession, notifyLibraryChanged, setFlash, useDocument, useStagedFiles } from '@/state/store';
import { colors, shadow } from '@/theme';

/**
 * "+ Add another document": previews the files just picked and attaches them to an existing entry.
 * Only the files are added. Title, type, activity date and the current attachments are not changed.
 */
export default function AddAttachmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staged = useStagedFiles();
  const doc = useDocument(id);
  const sheet = useActionSheet();
  const [saving, setSaving] = useState(false);

  // Set when this screen is already leaving (saved or discarded) so it never navigates back twice.
  const leaving = useRef(false);

  // Nothing staged, or the entry was deleted elsewhere: leave rather than show an empty screen.
  useEffect(() => {
    if (staged.length === 0 && !saving && !leaving.current && router.canGoBack()) router.back();
  }, [staged.length, saving, router]);
  useEffect(() => {
    if (doc === null && !leaving.current && router.canGoBack()) router.back();
  }, [doc, router]);

  const items: PreviewItem[] = useMemo(
    () => staged.map((f) => ({ uri: f.uri, name: f.name, kind: f.mimeType === 'application/pdf' ? 'pdf' : 'image' })),
    [staged],
  );

  if (!doc) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const finish = () => {
    leaving.current = true;
    importSession.clear();
    notifyLibraryChanged();
    setFlash({ message: 'Document added' });
    router.back();
  };

  const commit = async (prepared: PreparedImport) => {
    setSaving(true);
    try {
      const svc = await getDocumentService();
      await svc.addAttachments(doc.id, prepared);
      finish();
    } catch (e) {
      setSaving(false);
      sheet.show(errorSheet(e, () => void commit(prepared)));
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    let prepared: PreparedImport;
    try {
      const svc = await getDocumentService();
      prepared = await svc.prepare(staged);
    } catch (e) {
      setSaving(false);
      sheet.show(errorSheet(e, () => void save()));
      return;
    }
    const attached = new Set(doc.attachments.map((a) => a.checksum));
    if (prepared.files.some((f) => attached.has(f.checksum))) {
      setSaving(false);
      sheet.show({
        title: 'Already in this document',
        message: 'One of these files is already attached to it. Add it again only if you want a second copy.',
        actions: [{ label: 'Add Anyway', onPress: () => void commit(prepared) }],
        cancelLabel: 'Cancel', // leaves everything unchanged
      });
      return;
    }
    await commit(prepared);
  };

  const cancel = () =>
    sheet.show({
      title: 'Discard these files?',
      message: 'They have not been added yet.',
      actions: [
        {
          label: 'Discard Files',
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
          title: 'Add Document',
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
        <Text style={styles.note}>
          {`Adds ${items.length === 1 ? 'this file' : `these ${items.length} files`} to “${displayTitle(doc)}”. Its title, type and date stay the same.`}
        </Text>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => void save()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Add to Document"
          style={({ pressed }) => [styles.primary, shadow.primary, pressed && { transform: [{ scale: 0.985 }] }, saving && { opacity: 0.8 }]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Add to Document</Text>}
        </Pressable>
      </View>
      {sheet.element}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: colors.blue, fontSize: 17 },
  note: { marginHorizontal: 20, marginTop: 14, color: colors.secondary, fontSize: 14, lineHeight: 19 },
  bottom: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(242,242,247,0.92)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  primary: { height: 54, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
