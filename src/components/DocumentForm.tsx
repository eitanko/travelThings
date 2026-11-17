import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { diffDays, formatLong, parseISODate, relative, toISODate } from '@/domain/dates';
import { TYPE_INFO } from '@/domain/documents';
import { DOCUMENT_TYPES, type DocumentMetadata } from '@/domain/types';
import { colors } from '@/theme';
import { Icon } from './Icon';

interface Props {
  value: DocumentMetadata;
  onChange: (m: DocumentMetadata) => void;
  disabled?: boolean;
}

/** Title / Type / Activity date. All optional (spec FR-04). No description, location, booking ref or trip. */
export function DocumentForm({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<DocumentMetadata>) => onChange({ ...value, ...patch });
  const date = value.activityDate;

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
            placeholderTextColor="#b0b0b5"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Title, optional"
          />
          {!!value.title && (
            <Pressable style={styles.clr} onPress={() => set({ title: null })} accessibilityRole="button" accessibilityLabel="Clear title">
              <Icon name="x" size={12} color="#fff" strokeWidth={2.4} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.chips}>
          {DOCUMENT_TYPES.map((k) => {
            const T = TYPE_INFO[k];
            const on = value.type === k;
            return (
              <Pressable
                key={k}
                onPress={() => set({ type: on ? null : k })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={T.label}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Icon name={T.icon} size={17} color={on ? colors.blue : colors.label} />
                <Text style={[styles.chipText, on && { color: colors.blue, fontWeight: '600' }]}>{T.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Activity date</Text>
        {date ? (
          <View style={styles.inwrap}>
            <View style={{ flex: 1, paddingHorizontal: 14, minHeight: 50, justifyContent: 'center' }}>
              <DateTimePicker
                value={parseISODate(date)}
                mode="date"
                display="compact"
                style={{ alignSelf: 'flex-start' }}
                onChange={(_, d) => d && set({ activityDate: toISODate(d) })}
              />
            </View>
            <Pressable style={styles.clr} onPress={() => set({ activityDate: null })} accessibilityRole="button" accessibilityLabel="Remove date">
              <Icon name="x" size={12} color="#fff" strokeWidth={2.4} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.inwrap, { minHeight: 50, paddingLeft: 14 }]}
            onPress={() => set({ activityDate: toISODate(new Date()) })}
            accessibilityRole="button"
            accessibilityLabel="Add activity date, optional"
          >
            <Text style={{ flex: 1, fontSize: 17, color: '#b0b0b5' }}>Add date (optional)</Text>
          </Pressable>
        )}
        <Text style={styles.hint}>
          {date
            ? `${formatLong(date)} · ${relative(diffDays(date))}`
            : 'Optional — the day this document is needed, e.g. a flight or check-in day.'}
        </Text>
      </View>

      <Text style={[styles.hint, { marginHorizontal: 22, marginTop: 18, marginBottom: 24 }]}>
        Everything is optional — you can save right away and fill this in later.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 18, marginHorizontal: 16 },
  label: { fontSize: 13, color: colors.secondary, textTransform: 'uppercase', letterSpacing: 0.4, marginHorizontal: 4, marginBottom: 8 },
  inwrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingRight: 8 },
  input: { flex: 1, fontSize: 17, padding: 14, minHeight: 50, color: colors.label },
  clr: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(60,60,67,0.18)', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { borderColor: colors.blue, backgroundColor: colors.blueTint },
  chipText: { fontSize: 15, color: colors.label },
  hint: { marginTop: 7, marginHorizontal: 6, fontSize: 13, color: colors.secondary },
});
