/** @jest-environment node */
import { diffDays, formatLong, isValidISODate, relative, toISODate } from '@/domain/dates';
import { displayTitle, fingerprintInput, groupDocuments, matchesFilter, matchesQuery } from '@/domain/documents';
import { AppError, toAppError } from '@/domain/errors';
import type { Document } from '@/domain/types';
import { normalizeStaged, resolveMimeType, safeFileName, sanitizeMetadata } from '@/domain/validation';
import { buildPdf } from '@/dev/pdf';

const NOW = new Date(2026, 10, 14, 23, 30); // 14 Nov 2026, late evening
const TODAY = toISODate(NOW);

let n = 0;
const doc = (p: Partial<Document>): Document => ({
  id: `d${++n}`,
  tripId: 'default-my-documents',
  originalName: `file${n}.pdf`,
  title: null,
  type: null,
  activityDate: null,
  importedAt: n,
  fingerprint: `fp${n}`,
  storageKey: `k${n}`,
  attachments: [],
  ...p,
});

describe('display title', () => {
  it('falls back to the original filename when the title is empty or blank', () => {
    expect(displayTitle({ title: null, originalName: 'Boarding Pass.pdf' })).toBe('Boarding Pass.pdf');
    expect(displayTitle({ title: '   ', originalName: 'Boarding Pass.pdf' })).toBe('Boarding Pass.pdf');
    expect(displayTitle({ title: 'Flight to BCN', originalName: 'x.pdf' })).toBe('Flight to BCN');
  });
});

describe('grouping and ordering', () => {
  it('splits into Today / Upcoming / No Date / Past with the right ordering', () => {
    const docs = [
      doc({ id: 'late', activityDate: '2026-12-20' }),
      doc({ id: 'soon', activityDate: '2026-11-20' }),
      doc({ id: 'now', activityDate: TODAY }),
      doc({ id: 'nodate-old', importedAt: 1 }),
      doc({ id: 'nodate-new', importedAt: 99 }),
      doc({ id: 'p1', activityDate: '2026-10-01' }),
      doc({ id: 'p2', activityDate: '2026-11-01' }),
    ];
    const g = groupDocuments(docs, TODAY);
    expect(g.today.map((d) => d.id)).toEqual(['now']);
    expect(g.upcoming.map((d) => d.id)).toEqual(['soon', 'late']); // by activity date ascending
    expect(g.noDate.map((d) => d.id)).toEqual(['nodate-new', 'nodate-old']); // newest import first, still listed
    expect(g.past.map((d) => d.id)).toEqual(['p2', 'p1']); // most recent first
  });

  it('moves a document when its activity date changes', () => {
    const d = doc({ id: 'x', activityDate: '2026-12-12' });
    const other = doc({ id: 'y', activityDate: '2026-11-30' });
    expect(groupDocuments([d, other], TODAY).upcoming.map((e) => e.id)).toEqual(['y', 'x']);
    const moved = { ...d, activityDate: '2026-11-20' };
    expect(groupDocuments([moved, other], TODAY).upcoming.map((e) => e.id)).toEqual(['x', 'y']);
    const past = { ...d, activityDate: '2026-01-01' };
    expect(groupDocuments([past, other], TODAY).past.map((e) => e.id)).toEqual(['x']);
    const cleared = { ...d, activityDate: null };
    expect(groupDocuments([cleared, other], TODAY).noDate.map((e) => e.id)).toEqual(['x']);
  });

  it('uses calendar days, not instants, so late-evening local time stays on the same day', () => {
    expect(diffDays('2026-11-14', NOW)).toBe(0);
    expect(diffDays('2026-11-15', NOW)).toBe(1);
    expect(groupDocuments([doc({ activityDate: '2026-11-14' })], TODAY).today).toHaveLength(1);
  });
});

describe('filters and search', () => {
  const flight = doc({ type: 'flight', title: 'Flight to Barcelona', activityDate: '2026-12-12', originalName: 'SK395.pdf' });
  const passport = doc({ type: 'passport', originalName: 'scan-001.jpg' });
  const untyped = doc({ type: null, originalName: 'misc.pdf' });

  it('filters by category, treating untyped as Other', () => {
    expect(matchesFilter(flight, 'bookings')).toBe(true);
    expect(matchesFilter(passport, 'ids')).toBe(true);
    expect(matchesFilter(untyped, 'other')).toBe(true);
    expect(matchesFilter(flight, 'ids')).toBe(false);
    expect(matchesFilter(flight, 'all')).toBe(true);
  });

  it('searches title, filename, type label and date text; undated docs match "no date"', () => {
    expect(matchesQuery(flight, 'barcelona', NOW)).toBe(true);
    expect(matchesQuery(flight, 'sk395', NOW)).toBe(true);
    expect(matchesQuery(flight, 'flight december', NOW)).toBe(true);
    expect(matchesQuery(flight, '2026-12-12', NOW)).toBe(true);
    expect(matchesQuery(passport, 'scan-001', NOW)).toBe(true);
    expect(matchesQuery(passport, 'no date', NOW)).toBe(true);
    expect(matchesQuery(flight, 'hotel', NOW)).toBe(false);
    expect(matchesQuery(flight, '   ', NOW)).toBe(true);
  });
});

describe('validation', () => {
  it('accepts PDFs and images, rejects everything else', () => {
    expect(resolveMimeType('a.pdf', '')).toBe('application/pdf');
    expect(resolveMimeType('a.PDF', 'application/octet-stream')).toBe('application/pdf');
    expect(resolveMimeType('IMG_1.HEIC', '')).toBe('image/heic');
    expect(resolveMimeType('x', 'image/png')).toBe('image/png');
    expect(resolveMimeType('x.jpg', 'image/jpg')).toBe('image/jpeg');
    expect(() => resolveMimeType('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toThrow(AppError);
    try {
      resolveMimeType('notes.txt', 'text/plain');
    } catch (e) {
      expect((e as AppError).code).toBe('UNSUPPORTED_FORMAT');
    }
    expect(() => normalizeStaged([{ uri: 'u', name: 'a.zip', mimeType: 'application/zip' }])).toThrow(AppError);
  });

  it('sanitizes metadata: every field optional, invalid values dropped', () => {
    expect(sanitizeMetadata({})).toEqual({ title: null, type: null, activityDate: null });
    expect(sanitizeMetadata({ title: '  Hi  ', type: 'flight', activityDate: '2026-12-12' })).toEqual({
      title: 'Hi',
      type: 'flight',
      activityDate: '2026-12-12',
    });
    expect(sanitizeMetadata({ title: '   ', type: 'rocket', activityDate: '2026-13-45' })).toEqual({
      title: null,
      type: null,
      activityDate: null,
    });
  });

  it('makes stored file names safe', () => {
    expect(safeFileName('a/b\\c:d.pdf', 'f')).toBe('a_b_c_d.pdf');
    expect(safeFileName('...', 'fallback')).toBe('fallback');
  });

  it('validates ISO dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate(null)).toBe(false);
  });
});

describe('errors', () => {
  it('classifies low-storage, permission and missing-file failures', () => {
    expect(toAppError(new Error('ENOSPC: no space left on device')).code).toBe('STORAGE_FULL');
    expect(toAppError(new Error('Permission denied')).code).toBe('PERMISSION_DENIED');
    expect(toAppError(new Error('No such file or directory'), 'READ_FAILED').code).toBe('FILE_MISSING');
    expect(toAppError(new Error('weird'), 'WRITE_FAILED').code).toBe('WRITE_FAILED');
    expect(toAppError('boom').code).toBe('UNKNOWN');
  });
  it('marks retryable errors', () => {
    expect(new AppError('STORAGE_FULL').retryable).toBe(true);
    expect(new AppError('UNSUPPORTED_FORMAT').retryable).toBe(false);
  });
});

describe('misc', () => {
  it('fingerprints single files by checksum and multi-file sets order-independently', () => {
    expect(fingerprintInput(['aa'])).toBe('aa');
    expect(fingerprintInput(['b', 'a'])).toBe(fingerprintInput(['a', 'b']));
  });
  it('formats relative days', () => {
    expect(relative(0)).toBe('Today');
    expect(relative(3)).toBe('In 3 days');
    expect(relative(-45)).toBe('6 weeks ago');
    expect(formatLong('2026-12-12')).toContain('December');
  });
  it('generates structurally valid multi-page PDFs for sample data', () => {
    const bytes = buildPdf([{ heading: 'A', lines: ['x'] }, { heading: 'B', lines: ['y'], barcode: true }]);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
  });
});
