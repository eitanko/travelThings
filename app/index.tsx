import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionSheet } from '@/components/ActionSheet';
import { DocumentRow } from '@/components/DocumentRow';
import { NameDialog } from '@/components/NameDialog';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useToast } from '@/components/Toast';
import { errorSheet } from '@/components/showError';
import { todayISO } from '@/domain/dates';
import { groupDocuments, matchesFilter, matchesQuery } from '@/domain/documents';
import { DEFAULT_TRIP_NAME } from '@/domain/trips';
import type { Document, FilterCategory, Trip } from '@/domain/types';
import { loadSampleDocuments } from '@/dev/sampleData';
import { getDocumentService } from '@/services/container';
import { useAddFlow } from '@/state/addFlow';
import { consumeFlash, notifyLibraryChanged, useLibrary } from '@/state/store';
import { colors, font, shadow } from '@/theme';

const FILTERS: { key: FilterCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'ids', label: 'IDs' },
  { key: 'other', label: 'Other' },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { docs, trips, selectedTripId, loading, error, reload } = useLibrary();
  const sheet = useActionSheet();
  const toast = useToast();
  const { openAddSheet } = useAddFlow(sheet.show);
  const [dialog, setDialog] = useState<null | { mode: 'create' } | { mode: 'rename'; trip: Trip }>(null);

  const currentTrip = trips.find((t) => t.id === selectedTripId);
  const tripName = currentTrip?.name ?? DEFAULT_TRIP_NAME;
  const countIn = (tripId: string) => docs.filter((d) => d.tripId === tripId).length;
  const tripDocs = useMemo(() => docs.filter((d) => d.tripId === selectedTripId), [docs, selectedTripId]);

  const [filter, setFilter] = useState<FilterCategory>('all');
  const [query, setQuery] = useState('');
  const [pastOpen, setPastOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const f = consumeFlash();
      if (f) {
        toast.show(f.message);
        if (f.highlightId) {
          setFilter('all');
          setQuery('');
          setHighlight(f.highlightId);
          const doc = docs.find((d) => d.id === f.highlightId);
          if (doc?.activityDate && doc.activityDate < todayISO()) setPastOpen(true);
          setTimeout(() => setHighlight(null), 2400);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const visible = useMemo(
    () => tripDocs.filter((d) => matchesFilter(d, filter) && matchesQuery(d, query)),
    [tripDocs, filter, query],
  );
  const groups = useMemo(() => groupDocuments(visible, todayISO()), [visible]);
  const q = query.trim();
  const showPast = pastOpen || !!q;

  const loadSamples = async () => {
    try {
      await loadSampleDocuments(await getDocumentService());
      notifyLibraryChanged();
    } catch (e) {
      sheet.show(errorSheet(e));
    }
  };

  const section = (label: string, items: Document[], opts?: { today?: boolean; dim?: boolean }) =>
    items.length === 0 ? null : (
      <View key={label}>
        <View style={styles.sh}>
          <Text style={[styles.shText, opts?.today && { color: colors.blue }]} accessibilityRole="header">
            {label}
          </Text>
          <Text style={[styles.shText, opts?.today && { color: colors.blue }]}>{items.length}</Text>
        </View>
        <View style={[styles.group, opts?.dim && { opacity: 0.62 }]}>
          {items.map((d, i) => (
            <DocumentRow key={d.id} doc={d} first={i === 0} highlighted={highlight === d.id} onPress={() => router.push({ pathname: '/document/[id]', params: { id: d.id } })} />
          ))}
        </View>
      </View>
    );

  const isEmptyLibrary = !loading && !error && tripDocs.length === 0;

  // ---- Trips -------------------------------------------------------------------------------------------------

  const chooseTrip = async (id: string) => {
    if (id === selectedTripId) return;
    try {
      const svc = await getDocumentService();
      await svc.selectTrip(id);
      notifyLibraryChanged();
    } catch (e) {
      sheet.show(errorSheet(e));
    }
  };

  const openTripSheet = () =>
    sheet.show({
      title: 'Trips',
      actions: [
        ...trips.map((t) => {
          const n = countIn(t.id);
          const selected = t.id === selectedTripId;
          return {
            label: t.name,
            sub: `${selected ? 'Selected · ' : ''}${n} document${n === 1 ? '' : 's'}`,
            icon: selected ? ('check' as const) : undefined,
            onPress: () => void chooseTrip(t.id),
            onMore: t.isDefault ? undefined : () => openTripActions(t),
          };
        }),
        { label: 'Create trip', icon: 'plus' as const, onPress: () => setDialog({ mode: 'create' }) },
      ],
    });

  /** Contextual menu for a custom trip. My Documents never gets one. */
  const openTripActions = (t: Trip) =>
    sheet.show({
      title: t.name,
      actions: [
        { label: 'Rename Trip', onPress: () => setDialog({ mode: 'rename', trip: t }) },
        { label: 'Delete Trip', destructive: true, onPress: () => openDeleteTrip(t) },
      ],
    });

  const runDeleteTrip = async (t: Trip, mode: 'keep' | 'delete') => {
    try {
      const svc = await getDocumentService();
      await svc.deleteTrip(t.id, mode);
      notifyLibraryChanged();
      toast.show(mode === 'keep' ? 'Trip deleted. Documents moved to My Documents' : 'Trip and its documents deleted');
    } catch (e) {
      sheet.show(errorSheet(e));
    }
  };

  const confirmDeleteWithDocuments = (t: Trip, n: number) =>
    sheet.show({
      title: 'Delete documents permanently?',
      message: `${n} document${n === 1 ? '' : 's'} and ${n === 1 ? 'its files' : 'their files'} will be removed from this device. This cannot be undone.`,
      actions: [{ label: 'Delete Trip and Documents', destructive: true, onPress: () => void runDeleteTrip(t, 'delete') }],
    });

  const openDeleteTrip = (t: Trip) => {
    const n = countIn(t.id);
    if (n === 0) {
      sheet.show({
        title: `Delete “${t.name}”?`,
        message: 'This trip is empty.',
        actions: [{ label: 'Delete Trip', destructive: true, onPress: () => void runDeleteTrip(t, 'keep') }],
      });
      return;
    }
    sheet.show({
      title: `Delete “${t.name}”?`,
      message: `It contains ${n} document${n === 1 ? '' : 's'}. What should happen to them?`,
      actions: [
        { label: 'Keep documents in My Documents', onPress: () => void runDeleteTrip(t, 'keep') },
        { label: 'Delete trip and documents', destructive: true, onPress: () => confirmDeleteWithDocuments(t, n) },
      ],
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + 10 }]}>
        <View style={styles.top}>
          <Pressable
            onPress={openTripSheet}
            accessibilityRole="button"
            accessibilityLabel={`Trip: ${tripName}. Choose or manage trips`}
            hitSlop={8}
            style={({ pressed }) => [styles.titleBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.h1} numberOfLines={1} accessibilityRole="header">
              {tripName}
            </Text>
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <Icon name="chevR" size={16} color={colors.blue} />
            </View>
          </Pressable>
        </View>
        {!isEmptyLibrary && (
          <>
            <View style={styles.search}>
              <Icon name="search" size={18} color={colors.secondary} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search title, type, date…"
                placeholderTextColor={colors.secondary}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="never"
                accessibilityLabel="Search documents"
              />
              {!!query && (
                <Pressable style={styles.sclear} onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Icon name="x" size={11} color="#fff" strokeWidth={2.6} />
                </Pressable>
              )}
            </View>
            <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errTitle}>Couldn&apos;t load your documents</Text>
          <Text style={styles.errMsg}>Your files are safe on this device. Try again.</Text>
          <Pressable onPress={() => void reload()} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : isEmptyLibrary ? (
        <EmptyState onAdd={openAddSheet} onLoadSamples={__DEV__ ? () => void loadSamples() : undefined} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {section('Today', groups.today, { today: true })}
          {section('Upcoming', groups.upcoming)}
          {section('No Date', groups.noDate)}
          {groups.past.length > 0 && (
            <View>
              <Pressable
                style={styles.sh}
                onPress={() => setPastOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showPast }}
                accessibilityLabel={`Past, ${groups.past.length} documents`}
              >
                <Text style={styles.shText}>Past</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.shText}>{groups.past.length}</Text>
                  <View style={{ transform: [{ rotate: showPast ? '90deg' : '0deg' }] }}>
                    <Icon name="chevR" size={14} color={colors.secondary} />
                  </View>
                </View>
              </Pressable>
              {showPast && (
                <View style={[styles.group, { opacity: 0.62 }]}>
                  {groups.past.map((d, i) => (
                    <DocumentRow key={d.id} doc={d} first={i === 0} highlighted={highlight === d.id} onPress={() => router.push({ pathname: '/document/[id]', params: { id: d.id } })} />
                  ))}
                </View>
              )}
            </View>
          )}
          {visible.length === 0 && (
            <View style={styles.noMatch}>
              <Icon name="file" size={38} color={colors.secondary} />
              <Text style={styles.noMatchTitle}>No matching documents</Text>
              <Text style={styles.errMsg}>Try another search or filter.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {!isEmptyLibrary && !loading && !error && (
        <Pressable
          onPress={openAddSheet}
          accessibilityRole="button"
          accessibilityLabel="Add document"
          style={({ pressed }) => [styles.fab, shadow.fab, { bottom: insets.bottom + 22 }, pressed && { transform: [{ scale: 0.92 }] }]}
        >
          <Icon name="plus" size={28} color="#fff" strokeWidth={2.4} />
        </Pressable>
      )}

      {dialog && (
        <NameDialog
          key={dialog.mode === 'rename' ? dialog.trip.id : 'create'}
          title={dialog.mode === 'create' ? 'New Trip' : 'Rename Trip'}
          initialValue={dialog.mode === 'rename' ? dialog.trip.name : ''}
          placeholder="Trip name"
          saveLabel={dialog.mode === 'create' ? 'Create' : 'Save'}
          onCancel={() => setDialog(null)}
          onSave={async (name) => {
            const svc = await getDocumentService();
            if (dialog.mode === 'create') {
              const trip = await svc.createTrip(name);
              await svc.selectTrip(trip.id); // a new trip opens straight away, ready for documents
              toast.show(`Created “${trip.name}”`);
            } else {
              await svc.renameTrip(dialog.trip.id, name);
              toast.show('Trip renamed');
            }
            setDialog(null);
            notifyLibraryChanged();
          }}
        />
      )}
      {sheet.element}
      {toast.element}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 16, paddingBottom: 8 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 10, gap: 12 },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  h1: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: colors.label, flexShrink: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.fill, borderRadius: 11, paddingHorizontal: 10, height: 38 },
  searchInput: { flex: 1, fontSize: 17, color: colors.label, padding: 0 },
  sclear: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(60,60,67,0.3)', alignItems: 'center', justifyContent: 'center' },
  sh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginHorizontal: 20, marginBottom: 8 },
  shText: { ...font.sectionHeader, color: colors.secondary, textTransform: 'uppercase' },
  group: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  fab: { position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  errTitle: { fontSize: 18, fontWeight: '600', color: colors.label },
  errMsg: { fontSize: 15, color: colors.secondary, textAlign: 'center' },
  retry: { marginTop: 10, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12, backgroundColor: colors.blue },
  retryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  noMatch: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40, gap: 6 },
  noMatchTitle: { fontSize: 18, fontWeight: '700', color: colors.label, marginTop: 6 },
});
