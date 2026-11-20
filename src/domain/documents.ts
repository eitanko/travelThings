import { diffDays, formatLong, relative } from './dates';
import type { Attachment, Document, DocumentType, FilterCategory } from './types';

export interface TypeInfo {
  label: string;
  category: Exclude<FilterCategory, 'all'>;
  icon: IconName;
  color: string;
  background: string;
}

export type IconName =
  | 'plane' | 'bed' | 'bus' | 'ticket' | 'passport' | 'visa' | 'file' | 'plus' | 'search'
  | 'chevR' | 'chevL' | 'x' | 'camera' | 'image' | 'scan' | 'folder' | 'layers' | 'check' | 'expand' | 'alert' | 'rotate';

/** Colors/icons ported from the HTML prototype's TYPES table. */
export const TYPE_INFO: Record<DocumentType, TypeInfo> = {
  flight: { label: 'Flight', category: 'bookings', icon: 'plane', color: '#2f7df6', background: '#e8f0fe' },
  hotel: { label: 'Hotel', category: 'bookings', icon: 'bed', color: '#e8833a', background: '#fdf0e6' },
  transport: { label: 'Transportation', category: 'bookings', icon: 'bus', color: '#2fa66b', background: '#e5f6ec' },
  attraction: { label: 'Attraction', category: 'bookings', icon: 'ticket', color: '#d6498c', background: '#fce8f2' },
  passport: { label: 'Passport', category: 'ids', icon: 'passport', color: '#5b6078', background: '#ececf3' },
  visa: { label: 'Visa', category: 'ids', icon: 'visa', color: '#0f9aa8', background: '#e0f4f6' },
  other: { label: 'Other', category: 'other', icon: 'file', color: '#8e8e93', background: '#efeff2' },
};

export const typeInfo = (d: Pick<Document, 'type'>): TypeInfo => TYPE_INFO[d.type ?? 'other'];

/** Title if the user gave one, otherwise the original filename. Never "Untitled". */
export function displayTitle(d: Pick<Document, 'title' | 'originalName'>): string {
  const t = d.title?.trim();
  return t ? t : d.originalName;
}

export const attachmentKind = (a: Pick<Attachment, 'mimeType'>): 'pdf' | 'image' =>
  a.mimeType === 'application/pdf' ? 'pdf' : 'image';

export interface Grouped {
  today: Document[];
  upcoming: Document[];
  noDate: Document[];
  past: Document[];
}

export function matchesFilter(d: Document, filter: FilterCategory): boolean {
  return filter === 'all' || typeInfo(d).category === filter;
}

export function searchHaystack(d: Document, now: Date = new Date()): string {
  const parts = [displayTitle(d), d.originalName, typeInfo(d).label, ...d.attachments.map((a) => a.originalName)];
  if (d.activityDate) {
    parts.push(formatLong(d.activityDate), d.activityDate, relative(diffDays(d.activityDate, now)));
  } else {
    parts.push('no date');
  }
  return parts.join(' ').toLowerCase();
}

export function matchesQuery(d: Document, query: string, now: Date = new Date()): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = searchHaystack(d, now);
  return q.split(/\s+/).every((tok) => hay.includes(tok));
}

/**
 * Today / Upcoming (by activity date, ascending) / No Date (newest import first) / Past (most recent first).
 * Comparison is by calendar-day string so time zones can never move a document to another day.
 */
export function groupDocuments(docs: Document[], today: string): Grouped {
  const g: Grouped = { today: [], upcoming: [], noDate: [], past: [] };
  for (const d of docs) {
    const x = d.activityDate;
    if (!x) g.noDate.push(d);
    else if (x === today) g.today.push(d);
    else if (x > today) g.upcoming.push(d);
    else g.past.push(d);
  }
  const byDateAsc = (a: Document, b: Document) =>
    (a.activityDate ?? '').localeCompare(b.activityDate ?? '') || displayTitle(a).localeCompare(displayTitle(b));
  g.today.sort(byDateAsc);
  g.upcoming.sort(byDateAsc);
  g.past.sort((a, b) => byDateAsc(b, a));
  g.noDate.sort((a, b) => b.importedAt - a.importedAt);
  return g;
}

/**
 * Content identity for duplicate detection. Single file → its SHA-256.
 * Multi-file → SHA-256 over the ordered attachment hashes is computed by the caller; this joins them deterministically.
 */
export function fingerprintInput(checksums: string[]): string {
  return checksums.length === 1 ? (checksums[0] as string) : [...checksums].sort().join(':');
}
