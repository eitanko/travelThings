/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';
import { buildPdf } from '@/dev/pdf';
import { parsePackage, type SharePackage } from '@/domain/sharePackage';
import { DEFAULT_TRIP_ID } from '@/domain/trips';
import { ingestPackages, type InboxStore } from '@/services/shareIngest';
import { makeHarness, type Harness } from './helpers';

const pdf = (tag: string) => Buffer.from(buildPdf([{ heading: tag, lines: [tag] }]));

let h: Harness;
let inboxDir: string;
beforeEach(async () => {
  h = await makeHarness();
  inboxDir = path.join(h.dir, 'inbox');
  fs.mkdirSync(inboxDir);
});
afterEach(() => fs.rmSync(h.dir, { recursive: true, force: true }));

/** Node stand-in for the App Group inbox: committed packages are directories without the .staging suffix. */
const store = (): InboxStore => ({
  list: () =>
    fs
      .readdirSync(inboxDir)
      .filter((n) => !n.endsWith('.staging'))
      .map((importId) => {
        const dir = path.join(inboxDir, importId);
        return {
          importId,
          readManifest: async () => fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
          fileUri: (n: string) => path.join(dir, n),
          fileSize: (n: string) => (fs.existsSync(path.join(dir, n)) ? fs.statSync(path.join(dir, n)).size : null),
        };
      }),
  remove: (id) => fs.rmSync(path.join(inboxDir, id), { recursive: true, force: true }),
});

function writePackage(importId: string, files: { name: string; bytes: Buffer }[], over: Partial<SharePackage> = {}, suffix = '') {
  const dir = path.join(inboxDir, importId + suffix);
  fs.mkdirSync(dir, { recursive: true });
  const entries = files.map((f, i) => {
    fs.writeFileSync(path.join(dir, `${i}-${f.name}`), f.bytes);
    return { name: f.name, mimeType: 'application/pdf', path: `${i}-${f.name}`, size: f.bytes.length };
  });
  const pkg: SharePackage = {
    schemaVersion: 1,
    importId,
    createdAt: Date.now(),
    tripId: DEFAULT_TRIP_ID,
    title: null,
    type: null,
    activityDate: null,
    duplicate: { kind: 'new' },
    files: entries,
    ...over,
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
}

describe('parsePackage', () => {
  const ok = { schemaVersion: 1, importId: 'a', tripId: 't', files: [{ name: 'x.pdf', mimeType: 'application/pdf', path: '0-x.pdf', size: 3 }] };
  it('accepts a valid package and rejects unsafe or unsupported ones', () => {
    expect(parsePackage(JSON.stringify(ok))?.duplicate).toEqual({ kind: 'new' });
    expect(parsePackage('{')).toBeNull();
    expect(parsePackage(JSON.stringify({ ...ok, schemaVersion: 2 }))).toBeNull();
    expect(parsePackage(JSON.stringify({ ...ok, files: [] }))).toBeNull();
    expect(parsePackage(JSON.stringify({ ...ok, files: [{ ...ok.files[0], path: '../x' }] }))).toBeNull();
    expect(parsePackage(JSON.stringify({ ...ok, files: [{ ...ok.files[0], mimeType: 'video/mp4' }] }))).toBeNull();
  });
});

describe('ingestPackages', () => {
  it('turns a saved package into one event with its metadata, then removes the package', async () => {
    writePackage('imp-1', [{ name: 'boarding.pdf', bytes: pdf('a') }], { title: 'Flight home', type: 'flight', activityDate: '2026-12-01' });
    const r = await ingestPackages(h.svc, store());
    expect(r).toMatchObject({ incorporated: 1, failed: 0 });
    const docs = await h.svc.list();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ title: 'Flight home', type: 'flight', activityDate: '2026-12-01', tripId: DEFAULT_TRIP_ID });
    expect(fs.existsSync(path.join(inboxDir, 'imp-1'))).toBe(false);
  });

  it('keeps several files as one event with ordered attachments', async () => {
    writePackage('imp-2', [{ name: 'a.pdf', bytes: pdf('a') }, { name: 'b.pdf', bytes: pdf('b') }]);
    await ingestPackages(h.svc, store());
    const docs = await h.svc.list();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.attachments.map((a) => a.originalName)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('is idempotent: repeated runs and a crash between commit and cleanup create no duplicate', async () => {
    const dir = writePackage('imp-3', [{ name: 'a.pdf', bytes: pdf('a') }]);
    const backup = path.join(h.dir, 'backup');
    fs.cpSync(dir, backup, { recursive: true });
    await ingestPackages(h.svc, store());
    await ingestPackages(h.svc, store());
    // Simulate the app dying before removal: the package is still there, but the import is already recorded.
    fs.cpSync(backup, dir, { recursive: true });
    const again = await ingestPackages((await h.restart()).svc, store());
    expect(again.incorporated).toBe(0);
    expect(await h.svc.list()).toHaveLength(1);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('ignores a package that is still being written (interrupted writer)', async () => {
    writePackage('imp-4', [{ name: 'a.pdf', bytes: pdf('a') }], {}, '.staging');
    const r = await ingestPackages(h.svc, store());
    expect(r).toMatchObject({ incorporated: 0, failed: 0 });
    expect(await h.svc.list()).toHaveLength(0);
    expect(fs.existsSync(path.join(inboxDir, 'imp-4.staging'))).toBe(true); // not touched
  });

  it('keeps a broken package for retry and does not affect the others', async () => {
    const bad = writePackage('imp-5', [{ name: 'a.pdf', bytes: pdf('bad') }]);
    fs.truncateSync(path.join(bad, '0-a.pdf'), 3); // size no longer matches the manifest
    writePackage('imp-6', [{ name: 'b.pdf', bytes: pdf('good') }]);
    const r = await ingestPackages(h.svc, store());
    expect(r).toMatchObject({ incorporated: 1, failed: 1 });
    expect(fs.existsSync(bad)).toBe(true);
    expect(await h.svc.list()).toHaveLength(1);
  });

  it('falls back to My Documents when the chosen trip was deleted', async () => {
    writePackage('imp-7', [{ name: 'a.pdf', bytes: pdf('a') }], { tripId: 'gone-trip' });
    const r = await ingestPackages(h.svc, store());
    expect(r.fellBackToDefault).toBe(1);
    expect((await h.svc.list())[0]!.tripId).toBe(DEFAULT_TRIP_ID);
  });

  it('honours Replace only while the target still matches; otherwise saves a new event and overwrites nothing', async () => {
    const bytes = pdf('same');
    const first = h.write('orig.pdf', bytes);
    const existing = await h.svc.commit(await h.svc.prepare([{ uri: first, name: 'orig.pdf', mimeType: 'application/pdf' }]), { title: 'Keep me' }, { kind: 'new' });

    writePackage('imp-8', [{ name: 'again.pdf', bytes }], { duplicate: { kind: 'replace', existingId: existing.id }, title: 'Updated' });
    await ingestPackages(h.svc, store());
    let docs = await h.svc.list();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: existing.id, title: 'Updated' });

    // Stale snapshot: the replace target does not exist (anymore).
    writePackage('imp-9', [{ name: 'other.pdf', bytes: pdf('other') }], { duplicate: { kind: 'replace', existingId: 'deleted-doc' } });
    await ingestPackages(h.svc, store());
    docs = await h.svc.list();
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.id === existing.id)!.title).toBe('Updated');
  });

  it('saves under another name when the package asks for it', async () => {
    const bytes = pdf('dup');
    await h.svc.commit(await h.svc.prepare([{ uri: h.write('x.pdf', bytes), name: 'x.pdf', mimeType: 'application/pdf' }]), {}, { kind: 'new' });
    writePackage('imp-10', [{ name: 'x.pdf', bytes }], { duplicate: { kind: 'rename', title: 'Copy of x' } });
    await ingestPackages(h.svc, store());
    expect((await h.svc.list()).map((d) => d.title)).toContain('Copy of x');
  });

  it('needs no notification permission or running UI: ingestion works from files alone', async () => {
    writePackage('imp-11', [{ name: 'a.pdf', bytes: pdf('a') }]);
    await expect(ingestPackages(h.svc, store())).resolves.toMatchObject({ incorporated: 1 });
  });
});
