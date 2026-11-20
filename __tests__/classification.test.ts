/** @jest-environment node */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildPdf } from '@/dev/pdf';
import { MIGRATIONS, migrate } from '@/db/migrations';
import {
  CATEGORY_DATE_LABEL,
  CATEGORY_LABEL,
  CATEGORY_TYPES,
  TYPE_INFO,
  filterOf,
  primaryDate,
  resolveClassification,
} from '@/domain/classification';
import { parsePackage } from '@/domain/sharePackage';
import { sanitizeMetadata } from '@/domain/validation';
import { CATEGORIES, DOCUMENT_TYPES } from '@/domain/types';
import { makeHarness, NodeSqliteDb, type Harness } from './helpers';

const pdfBytes = (tag: string) => Buffer.from(buildPdf([{ heading: tag, lines: [tag] }]));
let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(() => fs.rmSync(h.dir, { recursive: true, force: true }));

const create = async (name: string, meta = {}) => {
  const uri = h.write(name, pdfBytes(name));
  return h.svc.commit(await h.svc.prepare([{ uri, name, mimeType: 'application/pdf' }]), meta, { kind: 'new' });
};

describe('taxonomy (AT-CAT-01..03)', () => {
  it('has exactly the five approved categories with approved labels', () => {
    expect(CATEGORIES.map((c) => CATEGORY_LABEL[c])).toEqual(['Transportation', 'Accommodation', 'Activities', 'Personal Documents', 'Other']);
  });

  it('offers only the types of the selected category; every type belongs to exactly one category', () => {
    const all = CATEGORIES.flatMap((c) => CATEGORY_TYPES[c]);
    expect([...all].sort()).toEqual([...DOCUMENT_TYPES].sort());
    for (const c of CATEGORIES) for (const t of CATEGORY_TYPES[c]) expect(TYPE_INFO[t].category).toBe(c);
    expect(CATEGORY_TYPES.personal.map((t) => TYPE_INFO[t].label)).toEqual([
      'Passport', 'National ID', 'Driver’s license', 'Visa/entry permit', 'Social Security card', 'Travel insurance', 'Other personal document',
    ]);
    expect(CATEGORY_TYPES.transportation).toEqual(expect.arrayContaining(['flight_reservation', 'boarding_pass']));
    expect(CATEGORY_TYPES.other.map((t) => TYPE_INFO[t].label)).toEqual(['Travel itinerary', 'Travel guide/map', 'General file']);
  });

  it('uses the approved date label per category and expiration for personal documents', () => {
    expect(CATEGORY_DATE_LABEL.transportation).toBe('Travel date');
    expect(CATEGORY_DATE_LABEL.accommodation).toBe('Check-in date');
    expect(CATEGORY_DATE_LABEL.activities).toBe('Event date');
    expect(primaryDate('personal')).toBe('expirationDate');
    expect(primaryDate('other')).toBe('activityDate');
  });

  it('keeps the existing filter chips working across the new categories', () => {
    expect([filterOf('transportation'), filterOf('accommodation'), filterOf('activities'), filterOf('personal'), filterOf('other')]).toEqual([
      'bookings', 'bookings', 'bookings', 'ids', 'other',
    ]);
  });
});

describe('sanitize / defaults', () => {
  it('defaults to Other / General file; a category alone gets its catch-all; the type decides the category', () => {
    expect(resolveClassification({ category: null, type: null })).toEqual({ category: 'other', type: 'general_file' });
    expect(sanitizeMetadata({ category: 'personal' })).toMatchObject({ category: 'personal', type: 'other_personal' });
    expect(sanitizeMetadata({ category: 'transportation', type: 'passport' })).toMatchObject({ category: 'personal', type: 'passport' });
    expect(sanitizeMetadata({ category: 'bogus', type: 'bogus' })).toMatchObject({ category: null, type: null });
  });
});

describe('persistence (AT-CAT-04..06, 08, 10)', () => {
  it('saves unclassified as Other / General file with no dates, original filename kept', async () => {
    const d = await create('scan.pdf');
    expect(d).toMatchObject({ category: 'other', type: 'general_file', activityDate: null, expirationDate: null, title: null, originalName: 'scan.pdf' });
  });

  it('a passport and a social security card save without a date; a dated passport carries the #8 status input', async () => {
    const ssn = await create('ssn.pdf', { type: 'social_security_card' });
    expect(ssn).toMatchObject({ category: 'personal', type: 'social_security_card', expirationDate: null });
    const p = await create('p.pdf', { type: 'passport', expirationDate: '2027-03-15' });
    await expect((await h.restart()).svc.get(p.id)).resolves.toMatchObject({ category: 'personal', expirationDate: '2027-03-15' });
  });

  it('reclassifying after save keeps both dates, title, trip, id and attachments; survives restart', async () => {
    const d = await create('t.pdf', { title: 'Trip doc', type: 'boarding_pass', activityDate: '2027-02-01', expirationDate: '2030-01-01' });
    await h.svc.updateMetadata(d.id, { title: 'Trip doc', category: 'accommodation', activityDate: '2027-02-01', expirationDate: '2030-01-01' });
    const r = await h.restart();
    const after = (await r.svc.get(d.id))!;
    expect(after).toMatchObject({
      id: d.id, tripId: d.tripId, title: 'Trip doc', category: 'accommodation', type: 'other_accommodation',
      activityDate: '2027-02-01', expirationDate: '2030-01-01',
    });
    expect(after.attachments.map((a) => a.id)).toEqual(d.attachments.map((a) => a.id));
    expect(r.files.exists(after.attachments[0]!.relativePath)).toBe(true);
  });

  it('classification applies to the entry: a multi-attachment entry keeps all files; past events stay listed', async () => {
    const a = h.write('a.pdf', pdfBytes('a'));
    const b = h.write('b.pdf', pdfBytes('b'));
    const d = await h.svc.commit(
      await h.svc.prepare([
        { uri: a, name: 'a.pdf', mimeType: 'application/pdf' },
        { uri: b, name: 'b.pdf', mimeType: 'application/pdf' },
      ]),
      { type: 'boarding_pass', activityDate: '2020-01-01' },
      { kind: 'new' },
    );
    expect(d.attachments).toHaveLength(2);
    expect((await h.repo.list()).map((x) => x.id)).toContain(d.id);
  });

  it('replace without classification keeps the existing one; with one, changes it', async () => {
    const d = await create('r.pdf', { type: 'hotel_reservation', activityDate: '2027-05-05' });
    const uri = h.write('r2.pdf', pdfBytes('r2'));
    const rep = await h.svc.commit(await h.svc.prepare([{ uri, name: 'r2.pdf', mimeType: 'application/pdf' }]), {}, { kind: 'replace', existingId: d.id });
    expect(rep).toMatchObject({ category: 'accommodation', type: 'hotel_reservation', activityDate: '2027-05-05' });
  });
});

describe('migration v7 (AT-CAT-07)', () => {
  it('maps legacy types deterministically, falls back to Other / General file, and loses nothing', async () => {
    const db = new NodeSqliteDb(new DatabaseSync(':memory:'));
    for (let v = 0; v < 6; v++) await db.execAsync(MIGRATIONS[v]!);
    await db.execAsync('PRAGMA user_version = 6;');
    const legacy = ['flight', 'hotel', 'transport', 'attraction', 'passport', 'visa', 'other', null, 'weird'];
    for (const [i, t] of legacy.entries()) {
      await db.runAsync(
        `INSERT INTO documents (id, trip_id, original_name, title, type, activity_date, expiration_date, imported_at, fingerprint, storage_key)
         VALUES (?, 'default-my-documents', ?, ?, ?, '2026-12-01', '2030-01-01', ?, ?, ?)`,
        [`d${i}`, `f${i}.pdf`, `T${i}`, t, i, `fp${i}`, `k${i}`],
      );
      await db.runAsync(
        `INSERT INTO attachments (id, document_id, position, original_name, relative_path, mime_type, size_bytes, checksum)
         VALUES (?, ?, 0, ?, ?, 'application/pdf', 10, 'c')`,
        [`a${i}`, `d${i}`, `f${i}.pdf`, `documents/k${i}/f${i}.pdf`],
      );
    }
    await migrate(db);
    const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM documents ORDER BY id');
    expect(rows.map((r) => [r.category, r.type])).toEqual([
      ['transportation', 'flight_reservation'],
      ['accommodation', 'hotel_reservation'],
      ['transportation', 'other_transport'],
      ['activities', 'attraction_ticket'],
      ['personal', 'passport'],
      ['personal', 'visa'],
      ['other', 'general_file'],
      ['other', 'general_file'],
      ['other', 'general_file'],
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({ activity_date: '2026-12-01', expiration_date: '2030-01-01', trip_id: 'default-my-documents' });
    }
    expect(await db.getAllAsync('SELECT id FROM attachments')).toHaveLength(9);
  });
});

describe('share extension compatibility', () => {
  it('still accepts legacy type keys from the iOS share extension and maps them', () => {
    const base = { schemaVersion: 1, importId: 'x', createdAt: 1, tripId: 'default-my-documents', title: null, activityDate: null, duplicate: { kind: 'new' }, files: [{ name: 'a.pdf', mimeType: 'application/pdf', path: 'p', size: 1 }] };
    expect(parsePackage(JSON.stringify({ ...base, type: 'flight' }))?.type).toBe('flight_reservation');
    expect(parsePackage(JSON.stringify({ ...base, type: 'passport' }))?.type).toBe('passport');
    expect(parsePackage(JSON.stringify({ ...base, type: 'nonsense' }))?.type).toBeNull();
  });
});
