/** @jest-environment node */
import fs from 'node:fs';
import { AppError } from '@/domain/errors';
import { buildPdf } from '@/dev/pdf';
import { makeHarness, type Harness } from './helpers';

const pdfBytes = (tag: string) => Buffer.from(buildPdf([{ heading: tag, lines: [tag] }]));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(() => fs.rmSync(h.dir, { recursive: true, force: true }));

/** Creates an entry with one file and optional metadata, like the New Document flow does. */
const createEntry = async (meta = {}) => {
  const uri = h.write('first.pdf', pdfBytes('first'));
  const prepared = await h.svc.prepare([{ uri, name: 'Bus to Andorra – passenger 1.pdf', mimeType: 'application/pdf' }]);
  return h.svc.commit(prepared, meta, { kind: 'new' });
};

const prepareOne = (uri: string, name: string, mimeType: string) => h.svc.prepare([{ uri, name, mimeType }]);

describe('add another document', () => {
  it('attaches a second file to the same entry without creating a library item', async () => {
    const doc = await createEntry({ title: 'Bus to Andorra', type: 'bus_ticket', activityDate: '2027-03-04' });
    const second = h.write('second.png', PNG);
    const updated = await h.svc.addAttachments(doc.id, await prepareOne(second, 'Passenger 2.png', 'image/png'));

    expect((await h.svc.list()).length).toBe(1);
    expect(updated.id).toBe(doc.id);
    expect(updated.attachments.map((a) => a.originalName)).toEqual(['Bus to Andorra – passenger 1.pdf', 'Passenger 2.png']);
    expect(updated.attachments.map((a) => a.position)).toEqual([0, 1]);
    expect(fs.readFileSync(h.svc.uriFor(updated.attachments[1]!)).equals(PNG)).toBe(true);
  });

  it('never changes the entry metadata or the first file', async () => {
    const doc = await createEntry({ title: 'Bus to Andorra', type: 'bus_ticket', activityDate: '2027-03-04' });
    const firstBefore = fs.readFileSync(h.svc.uriFor(doc.attachments[0]!));
    const after = await h.svc.addAttachments(doc.id, await prepareOne(h.write('b.pdf', pdfBytes('b')), 'b.pdf', 'application/pdf'));

    expect(after).toMatchObject({ title: 'Bus to Andorra', type: 'bus_ticket', activityDate: '2027-03-04', originalName: doc.originalName });
    expect(after.attachments[0]!.id).toBe(doc.attachments[0]!.id);
    expect(fs.readFileSync(h.svc.uriFor(after.attachments[0]!)).equals(firstBefore)).toBe(true);
  });

  it('keeps added attachments after a restart and keeps the new fingerprint consistent', async () => {
    const doc = await createEntry();
    await h.svc.addAttachments(doc.id, await prepareOne(h.write('c.png', PNG), 'c.png', 'image/png'));
    const reopened = await (await h.restart()).svc.get(doc.id);
    expect(reopened!.attachments).toHaveLength(2);
    expect(reopened!.fingerprint).not.toBe(doc.fingerprint);
  });

  it('a failed add leaves every existing attachment intact and writes no new rows', async () => {
    const doc = await createEntry();
    const good = await prepareOne(h.write('d.pdf', pdfBytes('d')), 'd.pdf', 'application/pdf');
    // Simulate the source disappearing between prepare() and commit().
    fs.rmSync(good.files[0]!.file.uri);
    await expect(h.svc.addAttachments(doc.id, good)).rejects.toBeInstanceOf(AppError);

    const after = (await h.svc.get(doc.id))!;
    expect(after.attachments).toHaveLength(1);
    expect(h.svc.checkIntegrity(after)).toBe('ok');
    expect(fs.readFileSync(h.svc.uriFor(after.attachments[0]!)).equals(pdfBytes('first'))).toBe(true);
    expect(h.files.storedFileCount()).toBe(1);
  });

  it('keeps positions unique when files are added after an attachment was removed', async () => {
    const doc = await createEntry();
    const b = await h.svc.addAttachments(doc.id, await prepareOne(h.write('e.pdf', pdfBytes('e')), 'e.pdf', 'application/pdf'));
    await h.svc.removeAttachment(b.id, b.attachments[1]!.id);
    const c = await h.svc.addAttachments(b.id, await prepareOne(h.write('f.png', PNG), 'f.png', 'image/png'));
    expect(new Set(c.attachments.map((a) => a.position)).size).toBe(c.attachments.length);
    expect(c.attachments.map((a) => a.originalName)).toEqual(['Bus to Andorra – passenger 1.pdf', 'f.png']);
  });
});

describe('remove one attachment', () => {
  it('removes only the chosen file and keeps the others readable', async () => {
    const doc = await createEntry({ title: 'Bus to Andorra' });
    const withSecond = await h.svc.addAttachments(doc.id, await prepareOne(h.write('g.png', PNG), 'g.png', 'image/png'));
    const first = withSecond.attachments[0]!;
    const second = withSecond.attachments[1]!;

    const result = await h.svc.removeAttachment(doc.id, second.id);
    expect(result.filesRemoved).toBe(true);
    expect(fs.existsSync(h.svc.uriFor(second))).toBe(false);

    const after = (await h.svc.get(doc.id))!;
    expect(after.attachments.map((a) => a.id)).toEqual([first.id]);
    expect(fs.readFileSync(h.svc.uriFor(after.attachments[0]!)).equals(pdfBytes('first'))).toBe(true);
    expect(after.title).toBe('Bus to Andorra');
    expect(after.fingerprint).toBe(doc.fingerprint); // back to the single-file fingerprint
  });

  it('refuses to remove the last remaining attachment; the whole document must be deleted instead', async () => {
    const doc = await createEntry();
    await expect(h.svc.removeAttachment(doc.id, doc.attachments[0]!.id)).rejects.toBeInstanceOf(AppError);
    expect((await h.svc.get(doc.id))!.attachments).toHaveLength(1);
    expect(fs.existsSync(h.svc.uriFor(doc.attachments[0]!))).toBe(true);
  });

  it('keeps the remaining file reachable after a restart', async () => {
    const doc = await createEntry();
    const withSecond = await h.svc.addAttachments(doc.id, await prepareOne(h.write('h.png', PNG), 'h.png', 'image/png'));
    await h.svc.removeAttachment(doc.id, withSecond.attachments[0]!.id);
    const reopened = await (await h.restart()).svc.get(doc.id);
    expect(reopened!.attachments).toHaveLength(1);
    expect(reopened!.attachments[0]!.originalName).toBe('h.png');
    expect(reopened!.originalName).toBe('h.png'); // display fallback follows the first remaining file
  });

  it('deleting the whole document still removes every attachment', async () => {
    const doc = await createEntry();
    await h.svc.addAttachments(doc.id, await prepareOne(h.write('i.png', PNG), 'i.png', 'image/png'));
    await h.svc.delete(doc.id);
    expect(await h.svc.list()).toHaveLength(0);
    expect(h.files.storedFileCount()).toBe(0);
  });
});
