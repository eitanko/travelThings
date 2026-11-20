/** @jest-environment node */
import fs from 'node:fs';
import { makeHarness, type Harness } from './helpers';

// Stand-ins for the captured image and its rotated copy. The service only cares about bytes and names.
const ORIGINAL = Buffer.from('original capture, sideways');
const TURNED = Buffer.from('corrected copy, upright');

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(() => fs.rmSync(h.dir, { recursive: true, force: true }));

/** A staged file as the rotation flow leaves it: `uri` is the corrected copy, `originalUri` the capture. */
const rotatedStaged = () => {
  const originalUri = h.write('capture.jpg', ORIGINAL);
  const uri = h.write('capture-turned.jpg', TURNED);
  return { uri, name: 'Scan 2026-11-20 10.00.00.jpg', mimeType: 'image/jpeg', originalUri, originalName: 'capture.jpg', originalMimeType: 'image/jpeg', turns: 1 };
};

describe('rotated captures', () => {
  it('saves the corrected copy and keeps the untouched original next to it', async () => {
    const prepared = await h.svc.prepare([rotatedStaged()]);
    const doc = await h.svc.commit(prepared, {}, { kind: 'new' });
    const att = doc.attachments[0]!;

    expect(fs.readFileSync(h.svc.uriFor(att))).toEqual(TURNED);
    expect(att.originalRelativePath).not.toBeNull();
    expect(fs.readFileSync(h.files.uriFor(att.originalRelativePath!))).toEqual(ORIGINAL);
    expect(att.checksum).not.toBe(prepared.files[0]!.original!.checksum);
  });

  it('keeps the corrected orientation and the original after a restart', async () => {
    const doc = await h.svc.commit(await h.svc.prepare([rotatedStaged()]), {}, { kind: 'new' });
    const reopened = await (await h.restart()).svc.get(doc.id);
    const att = reopened!.attachments[0]!;

    expect(fs.readFileSync(h.svc.uriFor(att))).toEqual(TURNED);
    expect(fs.readFileSync(h.files.uriFor(att.originalRelativePath!))).toEqual(ORIGINAL);
  });

  it('does not keep an original for a file that was never rotated', async () => {
    const uri = h.write('plain.jpg', ORIGINAL);
    const doc = await h.svc.commit(await h.svc.prepare([{ uri, name: 'plain.jpg', mimeType: 'image/jpeg' }]), {}, { kind: 'new' });

    expect(doc.attachments[0]!.originalRelativePath).toBeNull();
    expect(h.files.storedFileCount()).toBe(1);
  });

  it('does not keep an original when the user turned the page back to where it started', async () => {
    const originalUri = h.write('capture.jpg', ORIGINAL);
    const doc = await h.svc.commit(
      await h.svc.prepare([{ uri: originalUri, name: 'capture.jpg', mimeType: 'image/jpeg', originalUri, turns: 0 }]),
      {},
      { kind: 'new' },
    );

    expect(doc.attachments[0]!.originalRelativePath).toBeNull();
    expect(h.files.storedFileCount()).toBe(1);
  });

  it('writes nothing to storage until the document is saved (cancel leaves no trace)', async () => {
    await h.svc.prepare([rotatedStaged()]);
    expect(h.files.storedFileCount()).toBe(0);
    expect(await h.svc.list()).toHaveLength(0);
  });

  it('keeps the original when a rotated file is added to an existing entry', async () => {
    const existing = await h.svc.commit(
      await h.svc.prepare([{ uri: h.write('a.pdf', Buffer.from('%PDF-1.4 a')), name: 'a.pdf', mimeType: 'application/pdf' }]),
      {},
      { kind: 'new' },
    );
    const updated = await h.svc.addAttachments(existing.id, await h.svc.prepare([rotatedStaged()]));
    const added = updated.attachments[1]!;

    expect(fs.readFileSync(h.svc.uriFor(added))).toEqual(TURNED);
    expect(fs.readFileSync(h.files.uriFor(added.originalRelativePath!))).toEqual(ORIGINAL);
  });

  it('removing a rotated attachment removes its original too', async () => {
    const other = h.write('b.pdf', Buffer.from('%PDF-1.4 b'));
    const doc = await h.svc.commit(
      await h.svc.prepare([{ uri: other, name: 'b.pdf', mimeType: 'application/pdf' }]),
      {},
      { kind: 'new' },
    );
    const withRotated = await h.svc.addAttachments(doc.id, await h.svc.prepare([rotatedStaged()]));
    const rotated = withRotated.attachments[1]!;
    const originalPath = h.files.uriFor(rotated.originalRelativePath!);

    await h.svc.removeAttachment(doc.id, rotated.id);

    expect(fs.existsSync(originalPath)).toBe(false);
    expect(fs.existsSync(h.svc.uriFor(rotated))).toBe(false);
    expect((await h.svc.get(doc.id))!.attachments).toHaveLength(1);
  });

  it('deleting the whole document removes the original with everything else', async () => {
    const doc = await h.svc.commit(await h.svc.prepare([rotatedStaged()]), {}, { kind: 'new' });
    await h.svc.delete(doc.id);
    expect(h.files.storedFileCount()).toBe(0);
  });
});

describe('turning an image that is already saved', () => {
  const T1 = Buffer.from('turned once');
  const T2 = Buffer.from('turned twice');
  const rendered = (name: string, bytes: Buffer) => ({ uri: h.write(name, bytes), name, mimeType: 'image/jpeg' });

  const saveTwoImages = async () => {
    const files = [
      { uri: h.write('a.jpg', ORIGINAL), name: 'a.jpg', mimeType: 'image/jpeg' },
      { uri: h.write('b.jpg', Buffer.from('second page')), name: 'b.jpg', mimeType: 'image/jpeg' },
    ];
    return h.svc.commit(await h.svc.prepare(files), { title: 'Ticket', type: 'flight_reservation', activityDate: '2026-12-01' }, { kind: 'new' });
  };

  it('turns one image, keeps its original, and leaves the other image and the metadata alone', async () => {
    const doc = await saveTwoImages();
    const [a, b] = doc.attachments;
    const updated = await h.svc.applyRotations(doc.id, [{ attachmentId: a!.id, turns: 1, rendered: rendered('a1.jpg', T1) }]);

    const [a2, b2] = updated.attachments;
    expect(a2!.rotationTurns).toBe(1);
    expect(fs.readFileSync(h.svc.uriFor(a2!))).toEqual(T1);
    expect(fs.readFileSync(h.files.uriFor(a2!.originalRelativePath!))).toEqual(ORIGINAL);
    expect(b2).toEqual(b);
    expect([updated.title, updated.type, updated.activityDate, updated.tripId]).toEqual([doc.title, doc.type, doc.activityDate, doc.tripId]);
  });

  it('keeps the orientation after a restart', async () => {
    const doc = await saveTwoImages();
    await h.svc.applyRotations(doc.id, [{ attachmentId: doc.attachments[0]!.id, turns: 3, rendered: rendered('a3.jpg', T1) }]);
    const att = (await (await h.restart()).svc.get(doc.id))!.attachments[0]!;
    expect(att.rotationTurns).toBe(3);
    expect(fs.readFileSync(h.svc.uriFor(att))).toEqual(T1);
  });

  it('turning again replaces the earlier copy, never the original', async () => {
    const doc = await saveTwoImages();
    const id = doc.attachments[0]!.id;
    const once = await h.svc.applyRotations(doc.id, [{ attachmentId: id, turns: 1, rendered: rendered('a1.jpg', T1) }]);
    const firstCopy = h.svc.uriFor(once.attachments[0]!);
    const twice = await h.svc.applyRotations(doc.id, [{ attachmentId: id, turns: 2, rendered: rendered('a2.jpg', T2) }]);

    expect(fs.existsSync(firstCopy)).toBe(false);
    expect(fs.readFileSync(h.svc.uriFor(twice.attachments[0]!))).toEqual(T2);
    expect(fs.readFileSync(h.files.uriFor(twice.attachments[0]!.originalRelativePath!))).toEqual(ORIGINAL);
    expect(h.files.storedFileCount()).toBe(3); // original + one copy + the other image
  });

  it('turning back to the start restores the original and drops the copy', async () => {
    const doc = await saveTwoImages();
    const id = doc.attachments[0]!.id;
    await h.svc.applyRotations(doc.id, [{ attachmentId: id, turns: 1, rendered: rendered('a1.jpg', T1) }]);
    const back = await h.svc.applyRotations(doc.id, [{ attachmentId: id, turns: 0 }]);
    const att = back.attachments[0]!;

    expect(att.rotationTurns).toBe(0);
    expect(att.originalRelativePath).toBeNull();
    expect(fs.readFileSync(h.svc.uriFor(att))).toEqual(ORIGINAL);
    expect(att.mimeType).toBe('image/jpeg');
    expect(h.files.storedFileCount()).toBe(2);
  });

  it('changes nothing when the orientation did not change', async () => {
    const doc = await saveTwoImages();
    const same = await h.svc.applyRotations(doc.id, [{ attachmentId: doc.attachments[0]!.id, turns: 0 }]);
    expect(same).toEqual(doc);
  });

  it('is all-or-nothing: a failed save leaves the files and record as they were', async () => {
    const doc = await saveTwoImages();
    const [a, b] = doc.attachments;
    h.repo.updateAttachmentFiles = async () => {
      throw new Error('disk gone');
    };
    await expect(
      h.svc.applyRotations(doc.id, [
        { attachmentId: a!.id, turns: 1, rendered: rendered('a1.jpg', T1) },
        { attachmentId: b!.id, turns: 1, rendered: rendered('b1.jpg', T1) },
      ]),
    ).rejects.toBeTruthy();

    expect(h.files.storedFileCount()).toBe(2);
    expect((await h.svc.get(doc.id))!.attachments).toEqual(doc.attachments);
  });

  it('refuses PDFs and unknown attachments', async () => {
    const pdf = await h.svc.commit(
      await h.svc.prepare([{ uri: h.write('p.pdf', Buffer.from('%PDF-1.4 x')), name: 'p.pdf', mimeType: 'application/pdf' }]),
      {},
      { kind: 'new' },
    );
    await expect(h.svc.applyRotations(pdf.id, [{ attachmentId: pdf.attachments[0]!.id, turns: 1, rendered: rendered('x.jpg', T1) }])).rejects.toBeTruthy();
    await expect(h.svc.applyRotations(pdf.id, [{ attachmentId: 'nope', turns: 1, rendered: rendered('y.jpg', T1) }])).rejects.toBeTruthy();
  });
});
