import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionSheet } from '@/components/ActionSheet';
import { Icon } from '@/components/Icon';
import { PreviewCarousel, type PreviewItem } from '@/components/PreviewCarousel';
import { useToast } from '@/components/Toast';
import { errorSheet } from '@/components/showError';
import { diffDays, formatLong, relative } from '@/domain/dates';
import { attachmentKind, displayTitle, typeInfo } from '@/domain/documents';
import { AppError } from '@/domain/errors';
import type { Attachment } from '@/domain/types';
import { getDocumentService } from '@/services/container';
import type { Integrity } from '@/services/documentService';
import { useAddFlow } from '@/state/addFlow';
import { consumeFlash, notifyLibraryChanged, setFlash, useDocument } from '@/state/store';
import { colors } from '@/theme';

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const doc = useDocument(id);
  const sheet = useActionSheet();
  const toast = useToast();
  const { openAddSheet } = useAddFlow(sheet.show, id);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [integrity, setIntegrity] = useState<Integrity>('ok');

  useFocusEffect(
    useCallback(() => {
      const f = consumeFlash();
      if (f) toast.show(f.message);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useEffect(() => {
    if (doc === null) router.back(); // deleted elsewhere
  }, [doc, router]);

  useEffect(() => {
    if (!doc) return;
    let alive = true;
    void getDocumentService().then((svc) => {
      if (!alive) return;
      const status = svc.checkIntegrity(doc);
      setIntegrity(status);
      setItems(status === 'ok' ? doc.attachments.map((a) => ({ uri: svc.uriFor(a), name: a.originalName, kind: attachmentKind(a) })) : []);
    });
    return () => {
      alive = false;
    };
  }, [doc]);

  if (!doc) return <View style={styles.root} />;

  const T = typeInfo(doc);
  const n = doc.attachments.length;
  const diff = doc.activityDate ? diffDays(doc.activityDate) : null;
  const subtitle = [T.label, doc.title?.trim() ? doc.originalName : ''].filter(Boolean).join(' · ');

  const openAttachment = (index: number) => router.push({ pathname: '/viewer', params: { id: doc.id, index: String(index) } });

  const confirmRemove = (a: Attachment) =>
    sheet.show({
      title: 'Remove this file?',
      message: `“${a.originalName}” will be deleted from this device. The other files in this document are not affected.`,
      actions: [
        {
          label: 'Remove File',
          destructive: true,
          onPress: async () => {
            try {
              const svc = await getDocumentService();
              await svc.removeAttachment(doc.id, a.id);
              notifyLibraryChanged();
              toast.show('File removed');
            } catch (e) {
              sheet.show(errorSheet(e, () => confirmRemove(a)));
            }
          },
        },
      ],
    });

  const confirmDelete = () =>
    sheet.show({
      title: 'Delete this document?',
      message: 'The saved file and its details will be removed from this device. This cannot be undone.',
      actions: [
        {
          label: 'Delete Document',
          destructive: true,
          onPress: async () => {
            try {
              const svc = await getDocumentService();
              await svc.delete(doc.id);
              notifyLibraryChanged();
              setFlash({ message: 'Document deleted' });
              router.back();
            } catch (e) {
              sheet.show(errorSheet(e, confirmDelete));
            }
          },
        },
      ],
    });

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/edit/[id]', params: { id: doc.id } })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit">
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 30 }}>
        {integrity === 'ok' && items.length > 0 ? (
          <PreviewCarousel items={items} height={400} onOpen={(i) => router.push({ pathname: '/viewer', params: { id: doc.id, index: String(i) } })} />
        ) : integrity !== 'ok' ? (
          <View style={styles.missing} accessibilityRole="alert">
            <Icon name="alert" size={30} color={colors.red} />
            <Text style={styles.missingTitle}>
              {integrity === 'missing' ? new AppError('FILE_MISSING').title : new AppError('FILE_CORRUPTED').title}
            </Text>
            <Text style={styles.missingMsg}>
              {integrity === 'missing' ? new AppError('FILE_MISSING').userMessage : new AppError('FILE_CORRUPTED').userMessage} You can delete this entry.
            </Text>
          </View>
        ) : null}

        <View style={styles.dhead}>
          <View style={[styles.ico, { backgroundColor: T.background }]}>
            <Icon name={T.icon} size={26} color={T.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.h2}>{displayTitle(doc)}</Text>
            {!!subtitle && <Text style={styles.p}>{subtitle}</Text>}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.kv}>
            <Text style={styles.k}>Type</Text>
            <Text style={styles.v}>{T.label}</Text>
          </View>
          <View style={[styles.kv, styles.kvBorder]}>
            <Text style={styles.k}>Activity date</Text>
            {doc.activityDate && diff !== null ? (
              <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                <Text style={styles.v}>{formatLong(doc.activityDate)}</Text>
                <Text style={styles.small}>{relative(diff)}</Text>
              </View>
            ) : (
              <Text style={[styles.v, { color: colors.secondary, fontWeight: '400', fontStyle: 'italic' }]}>No date</Text>
            )}
          </View>
        </View>

        <Text style={styles.sectionLabel}>{`Documents · ${n}`}</Text>
        <View style={styles.card}>
          {doc.attachments.map((a, i) => (
            <View key={a.id} style={[styles.attRow, i > 0 && styles.rowBorder]}>
              <Pressable
                onPress={() => openAttachment(i)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${a.originalName}, ${i + 1} of ${n}`}
                style={({ pressed }) => [styles.attMain, pressed && { opacity: 0.6 }]}
              >
                <Icon name={attachmentKind(a) === 'pdf' ? 'file' : 'image'} size={20} color={colors.secondary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.attName} numberOfLines={1}>
                    {a.originalName}
                  </Text>
                  <Text style={styles.small}>{`${i + 1} of ${n} · ${attachmentKind(a) === 'pdf' ? 'PDF' : 'Image'}`}</Text>
                </View>
                <Icon name="chevR" size={16} color={colors.chevron} />
              </Pressable>
              {n > 1 && (
                <Pressable
                  onPress={() => confirmRemove(a)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${a.originalName}`}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}
          <Pressable
            onPress={openAddSheet}
            accessibilityRole="button"
            accessibilityLabel="Add another document"
            style={({ pressed }) => [styles.attRow, styles.rowBorder, pressed && { opacity: 0.6 }]}
          >
            <Icon name="plus" size={18} color={colors.blue} />
            <Text style={styles.addText}>Add another document</Text>
          </Pressable>
        </View>
        {n === 1 && <Text style={styles.hint}>Add another file to keep it in this same document.</Text>}

        <Pressable onPress={confirmDelete} accessibilityRole="button" style={({ pressed }) => [styles.danger, pressed && { opacity: 0.6 }]}>
          <Text style={styles.dangerText}>Delete Document</Text>
        </Pressable>
      </ScrollView>
      {sheet.element}
      {toast.element}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  edit: { color: colors.blue, fontSize: 17, fontWeight: '600' },
  missing: { height: 220, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  missingTitle: { fontSize: 17, fontWeight: '600', color: colors.label },
  missingMsg: { fontSize: 14, color: colors.secondary, textAlign: 'center' },
  dhead: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 18, marginHorizontal: 4, marginBottom: 16 },
  ico: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2, color: colors.label },
  p: { marginTop: 3, color: colors.secondary, fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 14, paddingHorizontal: 16 },
  kvBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, marginLeft: 16, paddingLeft: 0, paddingRight: 16 },
  k: { fontSize: 16, color: colors.secondary },
  v: { fontSize: 16, fontWeight: '500', color: colors.label, textAlign: 'right' },
  small: { fontSize: 13, color: colors.secondary },
  sectionLabel: { marginTop: 22, marginLeft: 16, marginBottom: 6, fontSize: 13, color: colors.secondary, textTransform: 'uppercase' },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  attMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  attName: { fontSize: 16, fontWeight: '500', color: colors.label },
  removeText: { fontSize: 15, color: colors.red },
  addText: { fontSize: 16, color: colors.blue, fontWeight: '500' },
  hint: { marginTop: 8, marginHorizontal: 16, fontSize: 13, color: colors.secondary },
  danger: { marginTop: 22, height: 52, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.red, fontSize: 17 },
});
