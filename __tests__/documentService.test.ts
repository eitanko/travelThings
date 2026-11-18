/** @jest-environment node */
import fs from 'node:fs';
import { AppError } from '@/domain/errors';
import { displayTitle, groupDocuments } from '@/domain/documents';
import { toISODate } from '@/domain/dates';
import { buildPdf } from '@/dev/pdf';
import { makeHarness, type Harness } from './helpers';

const pdfBytes = (tag: string) => Buffer.from(buildPdf([{ heading: tag, lines: [tag] }, { heading: `${tag} p2`, lines: ['two'] }]));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(() => fs.rmSync(h.dir, { recursive: true, force: true }));

const importPdf = async (name: string, tag = name, meta = {}) => {
  const uri = h.write(name, pdfBytes(tag));
  const prepared = await h.svc.prepare([{ uri, name, mimeType: 'application/pdf' }]);
  return { uri, prepared, doc: await h.svc.commit(prepared, meta, { kind: 'new' }) };
};

describe('import and persistence', () => {
  it('imports a PDF, preserving the original bytes exactly, and opens it from app storage', async () => {
    const { uri, doc } = await importPdf('ticket.pdf');
    const stored = h.svc.uriFor(doc.attachments[0]!);
    expect(stored).not.toBe(uri); // never depends on the external/original URL
    expect(fs.readFileSync(stored).equals(fs.readFileSync(uri))).toBe(true);
    expect(doc.attachments[0]!.relativePath.startsWith('documents/')).toBe(true); // relative, not absolute
    expect(doc.attachments[0]!.mimeType).toBe('application/pdf');
  });

  it('imports an image without re-encoding it', async () => {
    const uri = h.write('shot.png', PNG);
    const prepared = await h.svc.prepare([{ uri, name: 'shot.png', mimeType: 'image/png' }]);
    const doc = await h.svc.commit(prepared, {}, { kind: 'new' });
    expect(fs.readFileSync(h.svc.uriFor(doc.attachments[0]!)).equals(PNG)).toBe(true);
  });

  it('still opens after the original is deleted from its source', async () => {
    const { uri, doc } = await importPdf('gone.pdf');
    const before = fs.readFileSync(uri);
    fs.rmSync(uri);
    expect(fs.readFileSync(h.svc.uriFor(doc.attachments[0]!)).equals(before)).toBe(true);
    expect(h.svc.checkIntegrity(doc)).toBe('ok');
  });

  it('survives an app restart', async () => {
    const { doc } = await importPdf('persist.pdf', 'persist', { title: 'Keep me', type: 'hotel', activityDate: '2026-12-12' });
    const h2 = await h.restart();
    const docs = await h2.svc.list();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: doc.id, title: 'Keep me', type: 'hotel', activityDate: '2026-12-12' });
    expect(h2.svc.checkIntegrity(docs[0]!)).toBe('ok');
    expect(fs.existsSync(h2.svc.uriFor(docs[0]!.attachments[0]!))).toBe(true);
  });

  it('saves with every metadata field empty and shows the original filename', async () => {
    const { doc } = await importPdf('Boarding Pass LH123.pdf');
    expect(doc).toMatchObject({ title: null, type: null, activityDate: null });
    expect(displayTitle(doc)).toBe('Boarding Pass LH123.pdf');
    const listed = (await h.svc.list())[0]!;
    expect(displayTitle(listed)).toBe('Boarding Pass LH123.pdf');
    expect(groupDocuments([listed], toISODate(new Date())).noDate).toHaveLength(1); // visible, not an error state
  });

  it('stores multiple attachments (multi-page / multi-image) in order under one document', async () => {
    const a = h.write('1.png', PNG);
    const b = h.write('2.pdf', pdfBytes('b'));
    const prepared = await h.svc.prepare([
      { uri: a, name: 'scan page 1.png', mimeType: 'image/png' },
      { uri: b, name: 'scan page 2.pdf', mimeType: 'application/pdf' },
    ]);
    const doc = await h.svc.commit(prepared, {}, { kind: 'new' });
    const reloaded = (await h.svc.get(doc.id))!;
    expect(reloaded.attachments.map((x) => x.originalName)).toEqual(['scan page 1.png', 'scan page 2.pdf']);
    expect(reloaded.attachments.map((x) => x.position)).toEqual([0, 1]);
    expect(reloaded.originalName).toBe('scan page 1.png');
  });

  it('keeps files with identical names from colliding', async () => {
    const a = h.write('same.pdf', pdfBytes('A'));
    const prepared = await h.svc.prepare([
      { uri: a, name: 'same.pdf', mimeType: 'application/pdf' },
      { uri: a, name: 'same.pdf', mimeType: 'application/pdf' },
    ]);
    const doc = await h.svc.commit(prepared, {}, { kind: 'new' });
    expect(new Set(doc.attachments.map((x) => x.relativePath)).size).toBe(2);
  });
});

describe('editing and deleting', () => {
  it('edits optional metadata after saving', async () => {
    const { doc } = await importPdf('e.pdf');
    await h.svc.updateMetadata(doc.id, { title: ' New ', type: 'visa', activityDate: '2027-01-02' });
    expect(await h.svc.get(doc.id)).toMatchObject({ title: 'New', type: 'visa', activityDate: '2027-01-02' });
    await h.svc.updateMetadata(doc.id, {});
    expect(await h.svc.get(doc.id)).toMatchObject({ title: null, type: null, activityDate: null });
  });

  it('changing the activity date changes the list position', async () => {
    const a = (await importPdf('a.pdf', 'a', { activityDate: '2026-12-30' })).doc;
    const b = (await importPdf('b.pdf', 'b', { activityDate: '2026-12-20' })).doc;
    const order = async () => groupDocuments(await h.svc.list(), '2026-11-14').upcoming.map((d) => d.id);
    expect(await order()).toEqual([b.id, a.id]);
    await h.svc.updateMetadata(a.id, { activityDate: '2026-12-01' });
    expect(await order()).toEqual([a.id, b.id]);
  });

  it('delete removes both the metadata and the stored files', async () => {
    const { doc } = await importPdf('d.pdf');
    expect(h.files.storedFileCount()).toBe(1);
    const res = await h.svc.delete(doc.id);
    expect(res.filesRemoved).toBe(true);
    expect(await h.svc.get(doc.id)).toBeNull();
    expect(await h.svc.list()).toHaveLength(0);
    expect(h.files.storedFileCount()).toBe(0);
    expect(h.files.listStorageKeys()).toHaveLength(0);
    const rows = await h.repo.allStorageKeys();
    expect(rows).toHaveLength(0);
  });

  it('delete leaves no attachment rows behind', async () => {
    const { doc } = await importPdf('d2.pdf');
    await h.svc.delete(doc.id);
    const db = (h.repo as unknown as { db: { getAllAsync: (s: string) => Promise<unknown[]> } }).db;
    expect(await db.getAllAsync('SELECT * FROM attachments')).toHaveLength(0);
  });

  it('an empty library lists nothing (empty-state condition)', async () => {
    expect(await h.svc.list()).toHaveLength(0);
  });
});

describe('duplicate detection', () => {
  it('detects identical content even under a different filename', async () => {
    const first = await importPdf('orig.pdf', 'same-content');
    const uri2 = h.write('copy-of-orig.pdf', pdfBytes('same-content'));
    const prepared = await h.svc.prepare([{ uri: uri2, name: 'copy-of-orig.pdf', mimeType: 'application/pdf' }]);
    expect(prepared.duplicate?.id).toBe(first.doc.id);
  });

  it('does not flag different content', async () => {
    await importPdf('x.pdf', 'one');
    const uri = h.write('y.pdf', pdfBytes('two'));
    expect((await h.svc.prepare([{ uri, name: 'y.pdf', mimeType: 'application/pdf' }])).duplicate).toBeNull();
  });

  it('Replace existing: keeps the record id, swaps files, removes the old files', async () => {
    const first = await importPdf('orig.pdf', 'dup', { title: 'My ticket', type: 'flight' });
    const oldKey = first.doc.storageKey;
    const uri2 = h.write('orig-again.pdf', pdfBytes('dup'));
    const prepared = await h.svc.prepare([{ uri: uri2, name: 'orig-again.pdf', mimeType: 'application/pdf' }]);
    const replaced = await h.svc.commit(prepared, {}, { kind: 'replace', existingId: first.doc.id });
    expect(replaced.id).toBe(first.doc.id);
    expect(replaced.title).toBe('My ticket'); // existing metadata kept when the new draft has none
    expect(replaced.originalName).toBe('orig-again.pdf');
    expect(replaced.storageKey).not.toBe(oldKey);
    expect(h.files.listStorageKeys()).toEqual([replaced.storageKey]);
    expect(await h.svc.list()).toHaveLength(1);
    expect(h.svc.checkIntegrity((await h.svc.get(first.doc.id))!)).toBe('ok');
  });

  it('Replace existing: a failed replacement does NOT destroy the existing file', async () => {
    const first = await importPdf('orig.pdf', 'dup2', { title: 'Keep' });
    const before = fs.readFileSync(h.svc.uriFor(first.doc.attachments[0]!));
    const uri2 = h.write('again.pdf', pdfBytes('dup2'));
    const prepared = await h.svc.prepare([{ uri: uri2, name: 'again.pdf', mimeType: 'application/pdf' }]);

    h.files.copyInto = async () => {
      throw new AppError('WRITE_FAILED');
    };
    await expect(h.svc.commit(prepared, {}, { kind: 'replace', existingId: first.doc.id })).rejects.toMatchObject({ code: 'WRITE_FAILED' });

    const after = (await h.svc.get(first.doc.id))!;
    expect(after.title).toBe('Keep');
    expect(after.storageKey).toBe(first.doc.storageKey);
    expect(fs.readFileSync(h.svc.uriFor(after.attachments[0]!)).equals(before)).toBe(true);
    expect(h.files.listStorageKeys()).toEqual([first.doc.storageKey]);
  });

  it('Replace existing: if the database swap fails, the old files and record are intact and the new files are cleaned up', async () => {
    const first = await importPdf('orig.pdf', 'dup3');
    const uri2 = h.write('again.pdf', pdfBytes('dup3'));
    const prepared = await h.svc.prepare([{ uri: uri2, name: 'again.pdf', mimeType: 'application/pdf' }]);
    h.repo.swapFiles = async () => {
      throw new AppError('DATABASE_FAILED');
    };
    await expect(h.svc.commit(prepared, {}, { kind: 'replace', existingId: first.doc.id })).rejects.toMatchObject({ code: 'DATABASE_FAILED' });
    expect(h.files.listStorageKeys()).toEqual([first.doc.storageKey]);
    expect(h.svc.checkIntegrity((await h.svc.get(first.doc.id))!)).toBe('ok');
  });

  it('Save with another name: creates a separate record with a separate, identical file', async () => {
    const first = await importPdf('orig.pdf', 'dup4');
    const uri2 = h.write('orig2.pdf', pdfBytes('dup4'));
    const prepared = await h.svc.prepare([{ uri: uri2, name: 'orig2.pdf', mimeType: 'application/pdf' }]);
    const copy = await h.svc.commit(prepared, {}, { kind: 'rename', title: 'Ticket (second copy)' });
    expect(copy.id).not.toBe(first.doc.id);
    expect(copy.title).toBe('Ticket (second copy)');
    expect(copy.storageKey).not.toBe(first.doc.storageKey);
    const a = fs.readFileSync(h.svc.uriFor(first.doc.attachments[0]!));
    const b = fs.readFileSync(h.svc.uriFor(copy.attachments[0]!));
    expect(a.equals(b)).toBe(true);
    expect(await h.svc.list()).toHaveLength(2);
  });

  it('Cancel: preparing alone changes nothing', async () => {
    const first = await importPdf('orig.pdf', 'dup5');
    const snapshot = JSON.stringify(await h.svc.list());
    const keys = h.files.listStorageKeys();
    const uri2 = h.write('dup5-again.pdf', pdfBytes('dup5'));
    const prepared = await h.svc.prepare([{ uri: uri2, name: 'dup5-again.pdf', mimeType: 'application/pdf' }]);
    expect(prepared.duplicate?.id).toBe(first.doc.id);
    // user taps Cancel → no commit call
    expect(JSON.stringify(await h.svc.list())).toBe(snapshot);
    expect(h.files.listStorageKeys()).toEqual(keys);
  });
});

describe('failure handling', () => {
  const stage = (name: string, tag: string) => ({ uri: h.write(name, pdfBytes(tag)), name, mimeType: 'application/pdf' });

  it('a failed copy leaves no record and no files, and a retry then succeeds', async () => {
    const s = stage('f.pdf', 'fail1');
    const prepared = await h.svc.prepare([s]);
    const realCopy = h.files.copyInto.bind(h.files);
    let fail = true;
    h.files.copyInto = async (...a) => {
      if (fail) throw new Error('ENOSPC: no space left on device');
      return realCopy(...a);
    };
    await expect(h.svc.commit(prepared, {}, { kind: 'new' })).rejects.toMatchObject({ code: 'STORAGE_FULL', retryable: true });
    expect(await h.svc.list()).toHaveLength(0);
    expect(h.files.listStorageKeys()).toHaveLength(0);
    fail = false;
    const doc = await h.svc.commit(prepared, {}, { kind: 'new' }); // Retry
    expect(await h.svc.list()).toHaveLength(1);
    expect(h.svc.checkIntegrity(doc)).toBe('ok');
  });

  it('refuses to start when free space is insufficient (no partial write)', async () => {
    const prepared = await h.svc.prepare([stage('big.pdf', 'big')]);
    h.files.space = 100;
    await expect(h.svc.commit(prepared, {}, { kind: 'new' })).rejects.toMatchObject({ code: 'STORAGE_FULL' });
    expect(await h.svc.list()).toHaveLength(0);
    expect(h.files.listStorageKeys()).toHaveLength(0);
  });

  it('detects a corrupted copy (size/hash mismatch) and saves nothing', async () => {
    const prepared = await h.svc.prepare([stage('c.pdf', 'corrupt')]);
    const realCopy = h.files.copyInto.bind(h.files);
    h.files.copyInto = async (src, key, name) => {
      const rel = await realCopy(src, key, name);
      fs.appendFileSync(h.files.uriFor(rel), 'garbage'); // simulate a bad write
      return rel;
    };
    await expect(h.svc.commit(prepared, {}, { kind: 'new' })).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(await h.svc.list()).toHaveLength(0);
    expect(h.files.listStorageKeys()).toHaveLength(0);
  });

  it('a failed database insert rolls back the copied files', async () => {
    const prepared = await h.svc.prepare([stage('db.pdf', 'dbfail')]);
    h.repo.insert = async () => {
      throw new AppError('DATABASE_FAILED');
    };
    await expect(h.svc.commit(prepared, {}, { kind: 'new' })).rejects.toMatchObject({ code: 'DATABASE_FAILED' });
    expect(h.files.listStorageKeys()).toHaveLength(0);
    expect(await h.svc.list()).toHaveLength(0);
  });

  it('a failure on the 2nd of 3 files removes the 1st (all-or-nothing)', async () => {
    const files = [stage('1.pdf', 'm1'), stage('2.pdf', 'm2'), stage('3.pdf', 'm3')];
    const prepared = await h.svc.prepare(files);
    const realCopy = h.files.copyInto.bind(h.files);
    let calls = 0;
    h.files.copyInto = async (...a) => {
      if (++calls === 2) throw new Error('disk error');
      return realCopy(...a);
    };
    await expect(h.svc.commit(prepared, {}, { kind: 'new' })).rejects.toBeInstanceOf(AppError);
    expect(h.files.storedFileCount()).toBe(0);
    expect(await h.svc.list()).toHaveLength(0);
  });

  it('rejects unsupported formats before anything is stored', async () => {
    const uri = h.write('notes.docx', 'hello');
    await expect(h.svc.prepare([{ uri, name: 'notes.docx', mimeType: 'application/msword' }])).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
    expect(await h.svc.list()).toHaveLength(0);
  });

  it('reports unreadable and empty sources as read failures', async () => {
    await expect(h.svc.prepare([{ uri: '/nonexistent/x.pdf', name: 'x.pdf', mimeType: 'application/pdf' }])).rejects.toMatchObject({ code: 'FILE_MISSING' });
    const empty = h.write('empty.pdf', '');
    await expect(h.svc.prepare([{ uri: empty, name: 'empty.pdf', mimeType: 'application/pdf' }])).rejects.toMatchObject({ code: 'READ_FAILED' });
    await expect(h.svc.prepare([])).rejects.toMatchObject({ code: 'READ_FAILED' });
  });

  it('detects missing and corrupted stored files', async () => {
    const { doc } = await importPdf('i.pdf', 'integrity');
    expect(h.svc.checkIntegrity(doc)).toBe('ok');
    fs.appendFileSync(h.svc.uriFor(doc.attachments[0]!), 'x');
    expect(h.svc.checkIntegrity(doc)).toBe('corrupted');
    fs.rmSync(h.svc.uriFor(doc.attachments[0]!));
    expect(h.svc.checkIntegrity(doc)).toBe('missing');
  });

  it('sweeps orphaned directories (crash mid-import) but never referenced ones', async () => {
    const { doc } = await importPdf('keep.pdf', 'keep');
    fs.mkdirSync(`${h.files.root}/documents/orphan-1`, { recursive: true });
    fs.writeFileSync(`${h.files.root}/documents/orphan-1/x.pdf`, 'partial');
    expect(await h.svc.sweepOrphans()).toBe(1);
    expect(h.files.listStorageKeys()).toEqual([doc.storageKey]);
  });
});

describe('database', () => {
  it('migrates to the current schema version and is idempotent across restarts', async () => {
    const db = (h.repo as unknown as { db: { getFirstAsync: <T>(s: string) => Promise<T | null> } }).db;
    expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(2);
    const h2 = await h.restart();
    const db2 = (h2.repo as unknown as { db: { getFirstAsync: <T>(s: string) => Promise<T | null> } }).db;
    expect((await db2.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(2);
  });
});
