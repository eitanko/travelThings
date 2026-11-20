import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { diffDays, formatLong, parseISODate, relative, toISODate } from '@/domain/dates';
import { CATEGORY_DATE_LABEL, CATEGORY_LABEL, CATEGORY_TYPES, TYPE_INFO, fallbackType, resolveClassification } from '@/domain/classification';
import { EXPIRATION_LABEL, expirationStatus } from '@/domain/expiration';
import { CATEGORIES, type DocumentMetadata } from '@/domain/types';
import { useToday } from '@/state/useToday';
import { type Palette, useScheme, useThemedStyles } from '@/theme';
import { ExpirationBadge } from './ExpirationBadge';
import { Icon } from './Icon';

interface Props {
  value: DocumentMetadata;
  onChange: (m: DocumentMetadata) => void;
  disabled?: boolean;
}

const HINT = {
  transportation: 'Optional — the day you travel, so this is easy to find beforehand.',
  accommodation: 'Optional — your check-in day. No check-out date needed.',
  activities: 'Optional — the day of the visit or event.',
  personal: '',
  other: 'Optional — a day this is useful, if any.',
} as const;

/** Title / Category / Type / date. All optional (spec FR-04). No description, location, booking ref or trip. */
export function DocumentForm({ value, onChange, disabled }: Props) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const scheme = useScheme();
  const set = (patch: Partial<DocumentMetadata>) => onChange({ ...value, ...patch });
  const { category, type } = resolveClassification(value);
  const personal = category === 'personal';
  const dateLabel = CATEGORY_DATE_LABEL[category];
  const expiry = value.expirationDate;
  const expStatus = expirationStatus(expiry, useToday());

  const dateField = (key: 'activityDate', label: string, removeLabel: string, addLabel: string, hint: string) => {
    const date = value[key];
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        {date ? (
          <View style={styles.inwrap}>
            <View style={{ flex: 1, paddingHorizontal: 14, minHeight: 50, justifyContent: 'center' }}>
              <DateTimePicker
                themeVariant={scheme}
                value={parseISODate(date)}
                mode="date"
                display="compact"
                style={{ alignSelf: 'flex-start' }}
                accessibilityLabel={label}
                onChange={(_, d) => d && set({ [key]: toISODate(d) })}
              />
            </View>
            <Pressable style={styles.clr} onPress={() => set({ [key]: null })} accessibilityRole="button" accessibilityLabel={removeLabel}>
              <Icon name="x" size={12} color={colors.onAccent} strokeWidth={2.4} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.inwrap, { minHeight: 50, paddingLeft: 14 }]}
            onPress={() => set({ [key]: toISODate(new Date()) })}
            accessibilityRole="button"
            accessibilityLabel={`${addLabel}, optional`}
          >
            <Text style={{ flex: 1, fontSize: 17, color: colors.placeholder }}>Add date (optional)</Text>
          </Pressable>
        )}
        <Text style={styles.hint}>{date ? `${formatLong(date)} · ${relative(diffDays(date))}` : hint}</Text>
      </View>
    );
  };

  const expirationField = (
    <View style={styles.field}>
      <Text style={styles.label}>Expiration date</Text>
      {expiry ? (
        <View style={styles.inwrap}>
          <View style={{ flex: 1, paddingHorizontal: 14, minHeight: 50, justifyContent: 'center' }}>
            <DateTimePicker
              themeVariant={scheme}
              value={parseISODate(expiry)}
              mode="date"
              display="compact"
              style={{ alignSelf: 'flex-start' }}
              accessibilityLabel="Expiration date"
              onChange={(_, d) => d && set({ expirationDate: toISODate(d) })}
            />
          </View>
          <Pressable style={styles.clr} onPress={() => set({ expirationDate: null })} accessibilityRole="button" accessibilityLabel="Remove expiration date">
            <Icon name="x" size={12} color={colors.onAccent} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.inwrap, { minHeight: 50, paddingLeft: 14 }]}
          onPress={() => set({ expirationDate: toISODate(new Date()) })}
          accessibilityRole="button"
          accessibilityLabel="Add expiration date, optional"
        >
          <Text style={{ flex: 1, fontSize: 17, color: colors.placeholder }}>Add expiration date (optional)</Text>
        </Pressable>
      )}
      {expiry && expStatus !== 'none' ? (
        <View style={styles.statusRow} accessible accessibilityLabel={EXPIRATION_LABEL[expStatus]}>
          <ExpirationBadge status={expStatus} />
        </View>
      ) : null}
      <Text style={styles.hint}>
        {expiry ? formatLong(expiry) : 'Optional — leave empty if it doesn’t expire. You’ll see “About to expire” six months before.'}
      </Text>
    </View>
  );

  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? { opacity: 0.6 } : undefined}>
      <View style={styles.field}>
        <Text style={styles.label}>Title</Text>
        <View style={styles.inwrap}>
          <TextInput
            style={styles.input}
            value={value.title ?? ''}
            onChangeText={(t) => set({ title: t })}
            placeholder="Title (optional)"
            placeholderTextColor={colors.placeholder}
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Title, optional"
          />
          {!!value.title && (
            <Pressable style={styles.clr} onPress={() => set({ title: null })} accessibilityRole="button" accessibilityLabel="Clear title">
              <Icon name="x" size={12} color={colors.onAccent} strokeWidth={2.4} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => {
            const on = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => {
                  // Same category: keep the chosen type. New category: its catch-all type (a type from another category can't stay).
                  if (!on) set({ category: c, type: fallbackType(c) });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Category: ${CATEGORY_LABEL[c]}`}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && { color: colors.blue, fontWeight: '600' }]}>{CATEGORY_LABEL[c]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.chips}>
          {CATEGORY_TYPES[category].map((k) => {
            const T = TYPE_INFO[k];
            const on = type === k;
            return (
              <Pressable
                key={k}
                onPress={() => set({ category, type: k })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Type: ${T.label}`}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Icon name={T.icon} size={17} color={on ? colors.blue : colors.label} />
                <Text style={[styles.chipText, on && { color: colors.blue, fontWeight: '600' }]}>{T.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Primary date for the category first. The other date is only shown when it already has a value, so a date saved
          before reclassifying is never hidden or silently lost. */}
      {personal ? (
        <>
          {expirationField}
          {value.activityDate ? dateField('activityDate', 'Event date', 'Remove event date', 'Add event date', '') : null}
        </>
      ) : (
        <>
          {dateField('activityDate', dateLabel, `Remove ${dateLabel.toLowerCase()}`, `Add ${dateLabel.toLowerCase()}`, HINT[category])}
          {value.expirationDate ? expirationField : null}
        </>
      )}

      <Text style={[styles.hint, { marginHorizontal: 22, marginTop: 18, marginBottom: 24 }]}>
        Everything is optional — you can save right away and fill this in later.
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  field: { marginTop: 18, marginHorizontal: 16 },
  label: { fontSize: 13, color: colors.secondary, textTransform: 'uppercase', letterSpacing: 0.4, marginHorizontal: 4, marginBottom: 8 },
  inwrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, paddingRight: 8 },
  input: { flex: 1, fontSize: 17, padding: 14, minHeight: 50, color: colors.label },
  clr: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.clearField, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { borderColor: colors.blue, backgroundColor: colors.blueTint },
  chipText: { fontSize: 15, color: colors.label },
  statusRow: { marginTop: 8, marginHorizontal: 4 },
  hint: { marginTop: 7, marginHorizontal: 6, fontSize: 13, color: colors.secondary },
});
