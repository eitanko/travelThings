import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { diffDays, formatShort, relative } from '@/domain/dates';
import { displayTitle, typeInfo } from '@/domain/documents';
import { EXPIRATION_LABEL, expirationStatus } from '@/domain/expiration';
import type { Document } from '@/domain/types';
import { type Palette, useThemedStyles, useTypeTint, font } from '@/theme';
import { ExpirationBadge } from './ExpirationBadge';
import { Icon } from './Icon';

interface Props {
  doc: Document;
  first: boolean;
  onPress: () => void;
  highlighted?: boolean;
  /** Today's local date (`YYYY-MM-DD`), from useToday(), so the expiration label stays current. */
  today: string;
}

export function DocumentRow({ doc, first, onPress, highlighted, today }: Props) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const T = typeInfo(doc);
  const tint = useTypeTint(doc.type);
  const n = doc.attachments.length;
  const diff = doc.activityDate ? diffDays(doc.activityDate) : null;
  const title = displayTitle(doc);
  const exp = expirationStatus(doc.expirationDate, today);
  const sub = [T.label, doc.title?.trim() ? doc.originalName : ''].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${T.label}${doc.activityDate ? `, ${relative(diff as number)}` : ''}${n > 1 ? `, ${n} attachments` : ''}${exp !== 'none' ? `, ${EXPIRATION_LABEL[exp]}` : ''}`}
      style={({ pressed }) => [styles.row, highlighted && { backgroundColor: colors.highlight }, pressed && { backgroundColor: colors.rowPress }]}
    >
      {!first && <View style={styles.divider} />}
      <View style={[styles.ico, { backgroundColor: tint.background }]}>
        <Icon name={T.icon} size={22} color={tint.color} />
      </View>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {n > 1 && (
            <View style={styles.multi}>
              <Icon name="layers" size={12} color={colors.secondary} />
              <Text style={styles.multiText}>{n}</Text>
            </View>
          )}
        </View>
        <View style={styles.subRow}>
          <Text style={[styles.sub, styles.subText]} numberOfLines={1}>
            {sub}
          </Text>
          <ExpirationBadge status={exp} />
        </View>
      </View>
      {doc.activityDate && diff !== null && (
        <View style={styles.date}>
          <Text style={[styles.dateMain, diff === 0 && { color: colors.blue }]}>{diff === 0 ? 'Today' : formatShort(doc.activityDate)}</Text>
          <Text style={styles.dateSub}>{diff === 0 ? formatShort(doc.activityDate) : relative(diff)}</Text>
        </View>
      )}
      <Icon name="chevR" size={16} color={colors.chevron} />
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 68 },
  divider: { position: 'absolute', top: 0, left: 70, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  ico: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...font.rowTitle, color: colors.label, flexShrink: 1 },
  multi: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.badge, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 7 },
  multiText: { fontSize: 11.5, fontWeight: '600', color: colors.secondary },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subText: { flexShrink: 1 },
  sub: { ...font.rowSub, color: colors.secondary },
  date: { alignItems: 'flex-end', gap: 2 },
  dateMain: { fontSize: 14.5, fontWeight: '600', color: colors.label },
  dateSub: { fontSize: 12, color: colors.secondary },
});
