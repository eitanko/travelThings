/** @jest-environment node */
import fs from 'node:fs';
import { buildPdf } from '@/dev/pdf';
import { MIGRATIONS, migrate } from '@/db/migrations';
import { makeHarness, NodeSqliteDb, type Harness } from './helpers';
import { DatabaseSync } from 'node:sqlite';

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

describe('expiration date persistence', () => {
  it('saves without an expiration date', async () => {
    expect((await create('a.pdf')).expirationDate).toBeNull();
  });

  it('stores a date-only value for any type, separate from the activity date, and survives a restart', async () => {
    const passport = await create('p.pdf', { type: 'passport', expirationDate: '2027-03-15', activityDate: '2026-12-01' });
    const license = await create('l.pdf', { type: 'other', expirationDate: '2020-01-01' });
    const h2 = await h.restart();
    expect(await h2.svc.get(passport.id)).toMatchObject({ expirationDate: '2027-03-15', activityDate: '2026-12-01' });
    expect(await h2.svc.get(license.id)).toMatchObject({ expirationDate: '2020-01-01', activityDate: null }); // past allowed
  });

  it('edits and clears the date, leaving everything else alone', async () => {
    const doc = await create('p.pdf', { title: 'Passport', type: 'passport', expirationDate: '2027-03-15' });
    await h.svc.updateMetadata(doc.id, { title: 'Passport', type: 'passport', activityDate: null, expirationDate: '2032-03-15' });
    expect(await h.svc.get(doc.id)).toMatchObject({ expirationDate: '2032-03-15', title: 'Passport', type: 'passport' });
    await h.svc.updateMetadata(doc.id, { title: 'Passport', type: 'passport', activityDate: null, expirationDate: null });
    const after = (await h.svc.get(doc.id))!;
    expect(after.expirationDate).toBeNull();
    expect(after.attachments).toHaveLength(1);
  });

  it('keeps the date when the type changes', async () => {
    const doc = await create('p.pdf', { type: 'passport', expirationDate: '2027-03-15' });
    await h.svc.updateMetadata(doc.id, { type: 'visa', expirationDate: '2027-03-15' });
    expect(await h.svc.get(doc.id)).toMatchObject({ type: 'visa', expirationDate: '2027-03-15' });
  });

  it('keeps the existing date when files are replaced without a new one', async () => {
    const doc = await create('p.pdf', { expirationDate: '2027-03-15' });
    const uri = h.write('new.pdf', pdfBytes('new'));
    const replaced = await h.svc.commit(await h.svc.prepare([{ uri, name: 'new.pdf', mimeType: 'application/pdf' }]), {}, { kind: 'replace', existingId: doc.id });
    expect(replaced.expirationDate).toBe('2027-03-15');
  });
});

describe('migration v6', () => {
  it('upgrades a v5 database without touching existing rows; no dates are invented', async () => {
    const db = new NodeSqliteDb(new DatabaseSync(':memory:'));
    for (let v = 0; v < 5; v++) await db.execAsync(MIGRATIONS[v]!);
    await db.execAsync('PRAGMA user_version = 5;');
    await db.runAsync(
      `INSERT INTO documents (id, trip_id, original_name, title, type, activity_date, imported_at, fingerprint, storage_key)
       VALUES ('d1', 'default-my-documents', 'old.pdf', 'Old', 'passport', '2026-12-01', 1, 'fp', 'k')`,
    );
    await db.runAsync(
      `INSERT INTO attachments (id, document_id, position, original_name, relative_path, mime_type, size_bytes, checksum)
       VALUES ('a1', 'd1', 0, 'old.pdf', 'documents/k/old.pdf', 'application/pdf', 10, 'c')`,
    );
    await migrate(db);
    const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM documents WHERE id = ?', ['d1']);
    expect(row).toMatchObject({ title: 'Old', type: 'passport', activity_date: '2026-12-01', expiration_date: null });
    expect(await db.getAllAsync('SELECT id FROM attachments WHERE document_id = ?', ['d1'])).toHaveLength(1);
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(MIGRATIONS.length);
  });
});
