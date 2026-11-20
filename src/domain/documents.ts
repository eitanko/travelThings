import { diffDays, formatLong, relative } from './dates';
import type { Attachment, Document, FilterCategory } from './types';

export { TYPE_INFO, typeInfo } from './classification';
export type { IconName } from './classification';
import { typeInfo, filterOf } from './classification';

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
  return filter === 'all' || filterOf(d.category) === filter;
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
