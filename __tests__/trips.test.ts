/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AppError } from '@/domain/errors';
import { DEFAULT_TRIP_ID, DEFAULT_TRIP_NAME } from '@/domain/trips';
import { buildPdf } from '@/dev/pdf';
import { migrate, MIGRATIONS } from '@/db/migrations';
import { makeHarness, NodeSqliteDb, type Harness } from './helpers';

const pdf = (tag: string) => Buffer.from(buildPdf([{ heading: tag, lines: [tag] }]));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(() => fs.rmSync(h.dir, { recursive: true, force: true }));

const importEntry = async (tag: string, tripId?: string) => {
  const uri = h.write(`${tag}.pdf`, pdf(tag));
  const prepared = await h.svc.prepare([{ uri, name: `${tag}.pdf`, mimeType: 'application/pdf' }]);
  return h.svc.commit(prepared, {}, { kind: 'new' }, tripId);
};
const addFile = async (docId: string, tag: string) => {
  const prepared = await h.svc.prepare([{ uri: h.write(`${tag}.png`, PNG), name: `${tag}.png`, mimeType: 'image/png' }]);
  return h.svc.addAttachments(docId, prepared);
};

describe('default trip', () => {
  it('exists on a fresh install, is selected, and is named My Documents', async () => {
    const trips = await h.svc.listTrips();
    expect(trips).toEqual([{ id: DEFAULT_TRIP_ID, name: DEFAULT_TRIP_NAME, isDefault: true }]);
    expect(await h.svc.selectedTripId()).toBe(DEFAULT_TRIP_ID);
  });

  it('cannot be renamed or deleted', async () => {
    await expect(h.svc.renameTrip(DEFAULT_TRIP_ID, 'Holidays')).rejects.toBeInstanceOf(AppError);
    await expect(h.svc.deleteTrip(DEFAULT_TRIP_ID, 'delete')).rejects.toBeInstanceOf(AppError);
    expect((await h.svc.listTrips())[0]).toMatchObject({ name: DEFAULT_TRIP_NAME, isDefault: true });
  });

  it('is created exactly once, even when the database is reopened', async () => {
    const reopened = await h.restart();
    await reopened.restart();
    const rows = await reopened.repo.listTrips();
    expect(rows.filter((t) => t.isDefault)).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });
});

describe('create, rename and validate', () => {
  it('creates an empty custom trip from a name only', async () => {
    const trip = await h.svc.createTrip('  Andorra weekend  ');
    expect(trip).toMatchObject({ name: 'Andorra weekend', isDefault: false });
    expect((await h.svc.get(DEFAULT_TRIP_ID)) ?? null).toBeNull(); // trips are not documents
    expect((await h.svc.listTrips()).map((t) => t.name)).toEqual([DEFAULT_TRIP_NAME, 'Andorra weekend']);
  });

  it('rejects an empty name and a name that already exists, ignoring case', async () => {
    await expect(h.svc.createTrip('   ')).rejects.toMatchObject({ userMessage: 'Enter a trip name.' });
    await h.svc.createTrip('Paris');
    await expect(h.svc.createTrip('paris')).rejects.toBeInstanceOf(AppError);
    await expect(h.svc.createTrip(DEFAULT_TRIP_NAME.toLowerCase())).rejects.toBeInstanceOf(AppError);
  });

  it('renames a custom trip without touching its documents', async () => {
    const trip = await h.svc.createTrip('Old name');
    const doc = await importEntry('a', trip.id);
    await h.svc.renameTrip(trip.id, 'New name');
    expect((await h.svc.listTrips()).find((t) => t.id === trip.id)?.name).toBe('New name');
    expect((await h.svc.get(doc.id))!.tripId).toBe(trip.id);
  });
});

describe('documents and trips', () => {
  it('saves new documents into the trip they were imported into', async () => {
    const trip = await h.svc.createTrip('Lisbon');
    const doc = await importEntry('lisbon-ticket', trip.id);
    expect(doc.tripId).toBe(trip.id);
    expect((await h.svc.get(doc.id))!.tripId).toBe(trip.id);
  });

  it('moves a multi-attachment entry as one unit, without touching its files', async () => {
    const trip = await h.svc.createTrip('Andorra');
    const doc = await importEntry('bus');
    const withSecond = await addFile(doc.id, 'second');
    const bytes = withSecond.attachments.map((a) => fs.readFileSync(h.svc.uriFor(a)));

    await h.svc.moveDocument(doc.id, trip.id);
    const moved = (await h.svc.get(doc.id))!;
    expect(moved.tripId).toBe(trip.id);
    expect(moved.attachments.map((a) => a.id)).toEqual(withSecond.attachments.map((a) => a.id));
    expect(moved.attachments.map((a) => fs.readFileSync(h.svc.uriFor(a)))).toEqual(bytes);
    expect((await h.svc.list()).filter((d) => d.tripId === DEFAULT_TRIP_ID)).toHaveLength(0);
  });

  it('moves documents back to My Documents', async () => {
    const trip = await h.svc.createTrip('Trip');
    const doc = await importEntry('back', trip.id);
    await h.svc.moveDocument(doc.id, DEFAULT_TRIP_ID);
    expect((await h.svc.get(doc.id))!.tripId).toBe(DEFAULT_TRIP_ID);
  });

  it('refuses to move to a trip that does not exist', async () => {
    const doc = await importEntry('x');
    await expect(h.svc.moveDocument(doc.id, 'nope')).rejects.toBeInstanceOf(AppError);
    expect((await h.svc.get(doc.id))!.tripId).toBe(DEFAULT_TRIP_ID);
  });

  it('keeps metadata, attachments and the trip after adding a file to a document in a trip', async () => {
    const trip = await h.svc.createTrip('Trip');
    const doc = await importEntry('keep', trip.id);
    const after = await addFile(doc.id, 'extra');
    expect(after.tripId).toBe(trip.id);
    expect(after.attachments).toHaveLength(2);
  });
});

describe('deleting a trip', () => {
  it('"keep" moves its documents to My Documents and removes only the trip', async () => {
    const trip = await h.svc.createTrip('Keep me');
    const doc = await importEntry('kept', trip.id);
    const { filesRemoved } = await h.svc.deleteTrip(trip.id, 'keep');
    expect(filesRemoved).toBe(true);
    expect((await h.svc.listTrips()).map((t) => t.id)).toEqual([DEFAULT_TRIP_ID]);
    const survived = (await h.svc.get(doc.id))!;
    expect(survived.tripId).toBe(DEFAULT_TRIP_ID);
    expect(fs.readFileSync(h.svc.uriFor(survived.attachments[0]!)).equals(pdf('kept'))).toBe(true);
  });

  it('"delete" permanently removes the trip, its documents, attachments and files', async () => {
    const keepTrip = await h.svc.createTrip('Other');
    const otherDoc = await importEntry('other-doc', keepTrip.id);
    const trip = await h.svc.createTrip('Doomed');
    const doc = await importEntry('doomed', trip.id);
    const withSecond = await addFile(doc.id, 'doomed-2');
    const doomedPath = h.svc.uriFor(withSecond.attachments[0]!);

    await h.svc.deleteTrip(trip.id, 'delete');
    expect(await h.svc.get(doc.id)).toBeNull();
    expect(fs.existsSync(doomedPath)).toBe(false);
    expect(await h.repo.getTrip(trip.id)).toBeNull();
    // Unrelated trips and documents are untouched.
    expect((await h.svc.get(otherDoc.id))!.tripId).toBe(keepTrip.id);
    expect(fs.existsSync(h.svc.uriFor((await h.svc.get(otherDoc.id))!.attachments[0]!))).toBe(true);
  });

  it('deleting the selected trip selects My Documents, including after a restart', async () => {
    const trip = await h.svc.createTrip('Selected');
    await h.svc.selectTrip(trip.id);
    expect(await h.svc.selectedTripId()).toBe(trip.id);
    await h.svc.deleteTrip(trip.id, 'delete');
    expect(await h.svc.selectedTripId()).toBe(DEFAULT_TRIP_ID);
    expect(await (await h.restart()).svc.selectedTripId()).toBe(DEFAULT_TRIP_ID);
  });

  it('falls back to My Documents when the stored selection no longer exists', async () => {
    const trip = await h.svc.createTrip('Ghost');
    await h.svc.selectTrip(trip.id);
    await h.db.runAsync('DELETE FROM trips WHERE id = ?', [trip.id]);
    expect(await h.svc.selectedTripId()).toBe(DEFAULT_TRIP_ID);
  });
});

describe('persistence and selection', () => {
  it('trips, their documents and the selected trip survive a restart', async () => {
    const trip = await h.svc.createTrip('Persisted');
    await importEntry('persisted', trip.id);
    await h.svc.selectTrip(trip.id);
    const again = await h.restart();
    expect((await again.svc.listTrips()).map((t) => t.name)).toEqual([DEFAULT_TRIP_NAME, 'Persisted']);
    expect(await again.svc.selectedTripId()).toBe(trip.id);
    expect((await again.svc.list()).filter((d) => d.tripId === trip.id)).toHaveLength(1);
  });

  it('the database refuses a document without a trip', async () => {
    await expect(
      h.db.runAsync(
        `INSERT INTO documents (id, trip_id, original_name, imported_at, fingerprint, storage_key) VALUES ('bad', NULL, 'x', 0, 'fp', 'k')`,
      ),
    ).rejects.toThrow(/trip_id is required/);
  });
});

describe('migration from the single-trip database (v1)', () => {
  it('attaches every existing document to My Documents and keeps files, metadata and attachments', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-mig-'));
    try {
      // Build a database exactly as the v1 app left it.
      const raw = new DatabaseSync(path.join(dir, 'v1.db'));
      const v1 = new NodeSqliteDb(raw);
      await v1.execAsync('PRAGMA foreign_keys = ON;');
      await v1.execAsync(MIGRATIONS[0]!);
      await v1.execAsync('PRAGMA user_version = 1;');
      raw.exec(`INSERT INTO documents (id, original_name, title, type, activity_date, imported_at, fingerprint, storage_key)
                VALUES ('d-old', 'Bus.pdf', 'Bus to Andorra', 'transport', '2027-03-04', 1, 'fp-old', 'key-old')`);
      raw.exec(`INSERT INTO attachments (id, document_id, position, original_name, relative_path, mime_type, size_bytes, checksum)
                VALUES ('a1', 'd-old', 0, 'Bus.pdf', 'documents/key-old/1-Bus.pdf', 'application/pdf', 10, 'c1'),
                       ('a2', 'd-old', 1, 'Pass.png', 'documents/key-old/2-Pass.png', 'image/png', 20, 'c2')`);
      raw.close();

      // Upgrade with the current code, twice (simulating two app launches).
      const upgraded = new NodeSqliteDb(new DatabaseSync(path.join(dir, 'v1.db')));
      await migrate(upgraded);
      await migrate(upgraded);

      const docs = await upgraded.getAllAsync<{ id: string; trip_id: string; title: string; activity_date: string; fingerprint: string }>(
        'SELECT id, trip_id, title, activity_date, fingerprint FROM documents',
      );
      expect(docs).toEqual([{ id: 'd-old', trip_id: DEFAULT_TRIP_ID, title: 'Bus to Andorra', activity_date: '2027-03-04', fingerprint: 'fp-old' }]);
      const atts = await upgraded.getAllAsync<{ id: string; relative_path: string }>('SELECT id, relative_path FROM attachments ORDER BY position');
      expect(atts.map((a) => a.id)).toEqual(['a1', 'a2']);
      expect(atts.map((a) => a.relative_path)).toEqual(['documents/key-old/1-Bus.pdf', 'documents/key-old/2-Pass.png']);
      const trips = await upgraded.getAllAsync<{ id: string; is_default: number }>('SELECT id, is_default FROM trips');
      expect(trips).toEqual([{ id: DEFAULT_TRIP_ID, is_default: 1 }]);
      const version = await upgraded.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      expect(version?.user_version).toBe(MIGRATIONS.length);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
