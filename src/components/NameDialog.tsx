import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toAppError } from '@/domain/errors';
import { MAX_TRIP_NAME_LENGTH } from '@/domain/trips';
import { colors } from '@/theme';

interface Props {
  title: string;
  initialValue?: string;
  placeholder?: string;
  saveLabel: string;
  /** Called with the trimmed, non-empty name. Throwing shows the error under the field and keeps the dialog open. */
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

/** One text field with Cancel and Save. Save stays disabled while the name is empty. */
export function NameDialog({ title, initialValue = '', placeholder, saveLabel, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clean = value.trim();
  const canSave = clean.length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(clean);
    } catch (e) {
      setError(toAppError(e).userMessage);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onCancel} accessibilityLabel="Dismiss" />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            placeholder={placeholder}
            placeholderTextColor={colors.secondary}
            maxLength={MAX_TRIP_NAME_LENGTH}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            style={styles.input}
            accessibilityLabel={title}
          />
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Pressable onPress={onCancel} accessibilityRole="button" style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              onPress={() => void save()}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel={saveLabel}
              accessibilityState={{ disabled: !canSave }}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}
            >
              <Text style={[styles.save, !canSave && { opacity: 0.35 }]}>{saveLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.38)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  card: { width: '100%', maxWidth: 320, backgroundColor: 'rgba(250,250,252,0.98)', borderRadius: 14, overflow: 'hidden' },
  title: { textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.label, paddingTop: 18, paddingHorizontal: 16 },
  input: {
    marginTop: 14,
    marginHorizontal: 16,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    fontSize: 17,
    color: colors.label,
  },
  error: { marginTop: 8, marginHorizontal: 16, fontSize: 13, color: colors.red, textAlign: 'center' },
  row: { flexDirection: 'row', marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  btn: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  cancel: { fontSize: 17, color: colors.blue },
  save: { fontSize: 17, fontWeight: '600', color: colors.blue },
});
