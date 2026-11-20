import { DocumentRepository } from '@/db/repository';
import { AppError, toAppError } from '@/domain/errors';
import { attachmentKind, fingerprintInput } from '@/domain/documents';
import { DEFAULT_TRIP_ID, cleanTripName, sameTripName } from '@/domain/trips';
import { normalizeStaged, resolveMimeType, safeFileName, sanitizeMetadata } from '@/domain/validation';
import type { Attachment, Document, DocumentMetadata, StagedFile, Trip } from '@/domain/types';
import type { FileStore } from './fileStore';

export interface PreparedFile {
  file: StagedFile;
  size: number;
  checksum: string;
  /** The untouched capture, present only when the user rotated the file (its copy is `file`). */
  original?: { uri: string; name: string; size: number; checksum: string };
}

export interface PreparedImport {
  files: PreparedFile[];
  fingerprint: string;
  /** Existing document with identical content, if any. */
  duplicate: Document | null;
}

/** One image's new orientation. `rendered` is the corrected copy, required for 1–3 turns. */
export interface RotationChange {
  attachmentId: string;
  turns: number;
  rendered?: { uri: string; name: string; mimeType: string };
}

export type CommitMode =
  | { kind: 'new' }
  | { kind: 'replace'; existingId: string }
  | { kind: 'rename'; title: string };

export type Integrity = 'ok' | 'missing' | 'corrupted';

export interface Deps {
  repo: DocumentRepository;
  files: FileStore;
  newId: () => string;
  now: () => number;
}

/** Extra headroom required beyond the file bytes themselves (SQLite journal, filesystem overhead). */
const SPACE_MARGIN_BYTES = 5 * 1024 * 1024;

export class DocumentService {
  constructor(private readonly d: Deps) {}

  /**
   * Step 1: validate formats, read each file and hash it, and look for a duplicate.
   * Nothing is written to permanent storage or the database here.
   */
  async prepare(staged: StagedFile[]): Promise<PreparedImport> {
    if (staged.length === 0) throw new AppError('READ_FAILED');
    const normalized = normalizeStaged(staged);
    const files: PreparedFile[] = [];
    for (const file of normalized) {
      const size = this.d.files.size(file.uri);
      if (size <= 0) throw new AppError('READ_FAILED', undefined, `“${file.name}” is empty or unreadable.`);
      const checksum = await this.d.files.sha256(file.uri);
      const original = await this.prepareOriginal(file);
      files.push({ file, size, checksum, original });
    }
    const fingerprint = fingerprintInput(files.map((f) => f.checksum));
    const duplicate = await this.d.repo.findByFingerprint(fingerprint);
    return { files, fingerprint, duplicate };
  }

  /** Reads the untouched original of a rotated file, so it can be kept next to the corrected copy. */
  private async prepareOriginal(file: StagedFile): Promise<PreparedFile['original']> {
    if (!file.originalUri || file.originalUri === file.uri) return undefined;
    const size = this.d.files.size(file.originalUri);
    if (size <= 0) throw new AppError('READ_FAILED', undefined, `“${file.name}” is empty or unreadable.`);
    return {
      uri: file.originalUri,
      name: file.originalName ?? file.name,
      size,
      checksum: await this.d.files.sha256(file.originalUri),
    };
  }

  /**
   * Step 2: copy files into permanent storage (verified byte-for-byte) and save the record.
   * Success is returned only after BOTH the files and the metadata are durably stored.
   * Any failure removes whatever this call wrote and leaves existing data untouched.
   * A new entry is saved into `tripId` (the selected trip; My Documents by default).
   */
  async commit(
    prepared: PreparedImport,
    metaInput: Partial<DocumentMetadata>,
    mode: CommitMode,
    tripId: string = DEFAULT_TRIP_ID,
  ): Promise<Document> {
    const meta = sanitizeMetadata(metaInput);
    const total = prepared.files.reduce((n, f) => n + f.size + (f.original?.size ?? 0), 0);
    if (this.d.files.availableSpace() < total + SPACE_MARGIN_BYTES) throw new AppError('STORAGE_FULL');

    const storageKey = this.d.newId();
    try {
      const docId = mode.kind === 'replace' ? mode.existingId : this.d.newId();
      const attachments = await this.copyAll(prepared, docId, storageKey);
      const originalName = prepared.files[0]!.file.name;
      const importedAt = this.d.now();

      if (mode.kind === 'replace') {
        const existing = await this.d.repo.get(mode.existingId);
        if (!existing) throw new AppError('DATABASE_FAILED');
        const merged: DocumentMetadata = {
          title: meta.title ?? existing.title,
          type: meta.type ?? existing.type,
          activityDate: meta.activityDate ?? existing.activityDate,
        };
        await this.d.repo.swapFiles(
          docId,
          { originalName, fingerprint: prepared.fingerprint, storageKey, importedAt, attachments },
          merged,
        );
        // The swap is committed. Removing the old files is best-effort; leftovers are swept on next launch.
        try {
          this.d.files.removeDir(existing.storageKey);
        } catch {
          /* swept by sweepOrphans() */
        }
        return (await this.d.repo.get(docId))!;
      }

      const title = mode.kind === 'rename' ? mode.title.trim() || meta.title : meta.title;
      const doc: Document = {
        id: docId,
        tripId,
        originalName,
        title: title ?? null,
        type: meta.type,
        activityDate: meta.activityDate,
        importedAt,
        fingerprint: prepared.fingerprint,
        storageKey,
        attachments,
      };
      await this.d.repo.insert(doc);
      return doc;
    } catch (e) {
      this.safeRemove(storageKey);
      throw e instanceof AppError ? e : toAppError(e, 'WRITE_FAILED');
    }
  }

  private async copyAll(prepared: PreparedImport, documentId: string, storageKey: string): Promise<Attachment[]> {
    const out: Attachment[] = [];
    for (let i = 0; i < prepared.files.length; i++) {
      out.push(await this.copyOne(prepared.files[i]!, documentId, storageKey, i));
    }
    return out;
  }

  /**
   * Copies one file into `<storageKey>/` at `position` and verifies the stored bytes.
   * A rotated file also keeps its untouched original, stored beside it under a name that starts with "original-".
   * On verification failure the bad copy is removed before throwing; other files are never touched.
   */
  private async copyOne(pf: PreparedFile, documentId: string, storageKey: string, position: number): Promise<Attachment> {
    const safeName = safeFileName(pf.file.name, `file-${position + 1}`);
    const relativePath = await this.copyVerified(
      { uri: pf.file.uri, size: pf.size, checksum: pf.checksum },
      storageKey,
      `${position + 1}-${safeName}`,
      pf.file.name,
    );
    let originalRelativePath: string | null = null;
    if (pf.original) {
      try {
        originalRelativePath = await this.copyVerified(
          pf.original,
          storageKey,
          `${position + 1}-original-${safeFileName(pf.original.name, `file-${position + 1}`)}`,
          pf.original.name,
        );
      } catch (e) {
        this.safeRemoveFile(relativePath);
        throw e;
      }
    }
    return {
      id: this.d.newId(),
      documentId,
      position,
      originalName: pf.file.name,
      relativePath,
      mimeType: pf.file.mimeType,
      sizeBytes: pf.size,
      checksum: pf.checksum,
      originalRelativePath,
      rotationTurns: originalRelativePath ? (((pf.file.turns ?? 0) % 4) + 4) % 4 : 0,
    };
  }

  /** Copies `source` into the storage directory and checks the stored bytes match what was read. */
  private async copyVerified(
    source: { uri: string; size: number; checksum: string },
    storageKey: string,
    fileName: string,
    displayName: string,
  ): Promise<string> {
    const relativePath = await this.d.files.copyInto(source.uri, storageKey, fileName);
    const storedSize = this.d.files.sizeOfStored(relativePath);
    const storedHash = await this.d.files.sha256OfStored(relativePath);
    if (storedSize !== source.size || storedHash !== source.checksum) {
      this.safeRemoveFile(relativePath);
      throw new AppError('WRITE_FAILED', undefined, `“${displayName}” was not copied correctly. Nothing was saved.`);
    }
    return relativePath;
  }

  private safeRemove(storageKey: string) {
    try {
      this.d.files.removeDir(storageKey);
    } catch {
      /* swept by sweepOrphans() */
    }
  }

  private safeRemoveFile(relativePath: string) {
    try {
      this.d.files.removeFile(relativePath);
    } catch {
      /* orphaned file; not referenced by any record */
    }
  }

  /**
   * Add another document: attaches the prepared files to an existing entry.
   * Title, type, activity date and the existing attachments are untouched. On failure only the files written
   * by this call are removed, so previously saved attachments can never be lost.
   */
  async addAttachments(docId: string, prepared: PreparedImport): Promise<Document> {
    const existing = await this.d.repo.get(docId);
    if (!existing) throw new AppError('DATABASE_FAILED');
    const total = prepared.files.reduce((n, f) => n + f.size + (f.original?.size ?? 0), 0);
    if (this.d.files.availableSpace() < total + SPACE_MARGIN_BYTES) throw new AppError('STORAGE_FULL');

    const firstPosition = existing.attachments.reduce((max, a) => Math.max(max, a.position + 1), 0);
    const written: string[] = [];
    try {
      const added: Attachment[] = [];
      for (let i = 0; i < prepared.files.length; i++) {
        const attachment = await this.copyOne(prepared.files[i]!, docId, existing.storageKey, firstPosition + i);
        written.push(attachment.relativePath);
        if (attachment.originalRelativePath) written.push(attachment.originalRelativePath);
        added.push(attachment);
      }
      const fingerprint = fingerprintInput([...existing.attachments, ...added].map((a) => a.checksum));
      await this.d.repo.appendAttachments(docId, added, fingerprint);
      return (await this.d.repo.get(docId))!;
    } catch (e) {
      for (const p of written) this.safeRemoveFile(p);
      throw e instanceof AppError ? e : toAppError(e, 'WRITE_FAILED');
    }
  }

  /**
   * Removes one attachment and its file. The other attachments and the entry's metadata are unaffected.
   * The last remaining attachment cannot be removed here: the whole document must be deleted instead.
   */
  async removeAttachment(docId: string, attachmentId: string): Promise<{ filesRemoved: boolean }> {
    const doc = await this.d.repo.get(docId);
    if (!doc || !doc.attachments.some((a) => a.id === attachmentId)) throw new AppError('DATABASE_FAILED');
    if (doc.attachments.length <= 1) {
      throw new AppError('UNKNOWN', undefined, 'A document needs at least one file. To remove this file, delete the whole document.');
    }
    const remaining = doc.attachments.filter((a) => a.id !== attachmentId);
    const paths = await this.d.repo.removeAttachment(docId, attachmentId, {
      fingerprint: fingerprintInput(remaining.map((a) => a.checksum)),
      originalName: remaining[0]!.originalName,
    });
    if (!paths) return { filesRemoved: true };
    let filesRemoved = true;
    for (const p of paths) {
      try {
        this.d.files.removeFile(p);
      } catch {
        filesRemoved = false;
      }
    }
    return { filesRemoved };
  }

  /**
   * Where a re-oriented copy of this image must be rendered from: the untouched original when one is kept,
   * otherwise the stored file itself. Always rendering from the original means turns never stack lossy re-encodes.
   */
  rotationSourceUri(a: Attachment): string {
    return this.d.files.uriFor(a.originalRelativePath ?? a.relativePath);
  }

  /**
   * Saves a new orientation for some images of an entry. Each change says how many clockwise quarter turns (0–3)
   * the image should have from its original, and for 1–3 turns carries the freshly rendered copy.
   *
   * - The original file is never modified or removed. The first time an image is turned, the stored file becomes
   *   its kept original and the corrected copy is stored next to it.
   * - 0 turns points the attachment back at the original and drops the corrected copy.
   * - Title, type, date, trip, order, names and every attachment not listed here are untouched.
   * - All-or-nothing: if anything fails, files written by this call are removed and the entry stays as it was.
   */
  async applyRotations(docId: string, changes: RotationChange[]): Promise<Document> {
    const doc = await this.d.repo.get(docId);
    if (!doc) throw new AppError('DATABASE_FAILED');

    const todo: { att: Attachment; change: RotationChange }[] = [];
    for (const change of changes) {
      const att = doc.attachments.find((a) => a.id === change.attachmentId);
      if (!att || attachmentKind(att) !== 'image') throw new AppError('DATABASE_FAILED');
      if (!Number.isInteger(change.turns) || change.turns < 0 || change.turns > 3) throw new AppError('UNKNOWN', undefined, 'Invalid rotation.');
      if (change.turns === att.rotationTurns) continue; // already in that orientation
      if (change.turns > 0 && !change.rendered) throw new AppError('UNKNOWN', undefined, 'The rotated image is missing.');
      todo.push({ att, change });
    }
    if (todo.length === 0) return doc;

    const sizes = todo.map(({ change }) => (change.rendered ? this.d.files.size(change.rendered.uri) : 0));
    if (todo.some(({ change }, i) => change.rendered && sizes[i]! <= 0)) throw new AppError('READ_FAILED', undefined, 'The rotated image is empty or unreadable.');
    if (this.d.files.availableSpace() < sizes.reduce((n, s) => n + s, 0) + SPACE_MARGIN_BYTES) throw new AppError('STORAGE_FULL');

    const written: string[] = [];
    const replaced: string[] = []; // stored corrected copies that are no longer referenced once the update is saved
    try {
      const updates: Attachment[] = [];
      for (const [i, { att, change }] of todo.entries()) {
        if (change.turns === 0) {
          const original = att.originalRelativePath;
          if (!original) continue; // cannot happen: turns > 0 always keeps an original
          replaced.push(att.relativePath);
          updates.push({
            ...att,
            relativePath: original,
            originalRelativePath: null,
            rotationTurns: 0,
            mimeType: resolveMimeType(original),
            sizeBytes: this.d.files.sizeOfStored(original),
            checksum: await this.d.files.sha256OfStored(original),
          });
          continue;
        }
        const rendered = change.rendered!;
        const copy = await this.copyVerified(
          { uri: rendered.uri, size: sizes[i]!, checksum: await this.d.files.sha256(rendered.uri) },
          doc.storageKey,
          `${att.position + 1}-r${change.turns}-${safeFileName(rendered.name, `file-${att.position + 1}`)}`,
          rendered.name,
        );
        written.push(copy);
        if (att.originalRelativePath) replaced.push(att.relativePath);
        updates.push({
          ...att,
          relativePath: copy,
          originalRelativePath: att.originalRelativePath ?? att.relativePath,
          rotationTurns: change.turns,
          mimeType: resolveMimeType(rendered.name, rendered.mimeType),
          sizeBytes: sizes[i]!,
          checksum: await this.d.files.sha256OfStored(copy),
        });
      }
      const byId = new Map(updates.map((u) => [u.id, u]));
      const fingerprint = fingerprintInput(doc.attachments.map((a) => (byId.get(a.id) ?? a).checksum));
      await this.d.repo.updateAttachmentFiles(docId, updates, fingerprint);
    } catch (e) {
      for (const p of written) this.safeRemoveFile(p);
      throw e instanceof AppError ? e : toAppError(e, 'WRITE_FAILED');
    }
    // The new orientation is saved. Removing superseded copies is best-effort; they are not referenced any more.
    for (const p of replaced) this.safeRemoveFile(p);
    return (await this.d.repo.get(docId))!;
  }

  list() {
    return this.d.repo.list();
  }

  // ---- Trips -----------------------------------------------------------------------------------------------

  listTrips(): Promise<Trip[]> {
    return this.d.repo.listTrips();
  }

  /** The selected trip, falling back to My Documents when nothing is stored or the stored trip no longer exists. */
  async selectedTripId(): Promise<string> {
    const stored = await this.d.repo.getSelectedTripId();
    if (stored && (await this.d.repo.getTrip(stored))) return stored;
    return DEFAULT_TRIP_ID;
  }

  async selectTrip(id: string): Promise<void> {
    if (!(await this.d.repo.getTrip(id))) throw new AppError('DATABASE_FAILED');
    await this.d.repo.setSelectedTripId(id);
  }

  /** Creates an empty custom trip. Names are unique ignoring case. */
  async createTrip(input: string): Promise<Trip> {
    const name = await this.validTripName(input);
    const trip: Trip = { id: this.d.newId(), name, isDefault: false };
    await this.d.repo.insertTrip(trip);
    return trip;
  }

  /** Renames a custom trip. Its documents are unaffected. My Documents cannot be renamed. */
  async renameTrip(id: string, input: string): Promise<void> {
    const trip = await this.requireTrip(id);
    if (trip.isDefault) throw new AppError('UNKNOWN', undefined, 'My Documents can’t be renamed.');
    const name = await this.validTripName(input, id);
    await this.d.repo.renameTrip(id, name);
  }

  /**
   * Deletes a custom trip.
   * - `keep`: its documents move to My Documents first; no file is touched.
   * - `delete`: its documents and their files are permanently removed.
   * My Documents cannot be deleted. If the deleted trip was selected, My Documents becomes selected.
   */
  async deleteTrip(id: string, mode: 'keep' | 'delete'): Promise<{ filesRemoved: boolean }> {
    const trip = await this.requireTrip(id);
    if (trip.isDefault) throw new AppError('UNKNOWN', undefined, 'My Documents can’t be deleted.');
    const keys = await this.d.repo.removeTrip(
      id,
      mode === 'keep' ? { kind: 'move', moveTo: DEFAULT_TRIP_ID } : { kind: 'delete' },
      DEFAULT_TRIP_ID,
    );
    let filesRemoved = true;
    for (const key of keys) {
      try {
        this.d.files.removeDir(key);
      } catch {
        filesRemoved = false; // swept by sweepOrphans() on next launch
      }
    }
    return { filesRemoved };
  }

  /** Moves a whole entry, with all of its attachments, to another trip. */
  async moveDocument(docId: string, tripId: string): Promise<void> {
    if (!(await this.d.repo.get(docId))) throw new AppError('DATABASE_FAILED');
    await this.requireTrip(tripId);
    await this.d.repo.moveDocument(docId, tripId);
  }

  private async requireTrip(id: string): Promise<Trip> {
    const trip = await this.d.repo.getTrip(id);
    if (!trip) throw new AppError('DATABASE_FAILED');
    return trip;
  }

  private async validTripName(input: string, exceptId?: string): Promise<string> {
    const name = cleanTripName(input);
    if (!name) throw new AppError('UNKNOWN', undefined, 'Enter a trip name.');
    const clash = (await this.d.repo.listTrips()).some((t) => t.id !== exceptId && sameTripName(t.name, name));
    if (clash) throw new AppError('UNKNOWN', undefined, `A trip named “${name}” already exists.`);
    return name;
  }

  get(id: string) {
    return this.d.repo.get(id);
  }

  async updateMetadata(id: string, input: Partial<DocumentMetadata>): Promise<void> {
    await this.d.repo.updateMetadata(id, sanitizeMetadata(input));
  }

  /** Removes the record first, then its files. A leftover directory is never visible and is swept on next launch. */
  async delete(id: string): Promise<{ filesRemoved: boolean }> {
    const key = await this.d.repo.delete(id);
    if (!key) return { filesRemoved: true };
    try {
      this.d.files.removeDir(key);
      return { filesRemoved: true };
    } catch {
      return { filesRemoved: false };
    }
  }

  /** Cheap check (existence + size) used before opening a document. */
  checkIntegrity(doc: Document): Integrity {
    for (const a of doc.attachments) {
      if (!this.d.files.exists(a.relativePath)) return 'missing';
      try {
        if (this.d.files.sizeOfStored(a.relativePath) !== a.sizeBytes) return 'corrupted';
      } catch {
        return 'corrupted';
      }
    }
    return 'ok';
  }

  uriFor(a: Attachment): string {
    return this.d.files.uriFor(a.relativePath);
  }

  /** Deletes storage directories that no database record references (crashed imports, failed deletes). */
  async sweepOrphans(): Promise<number> {
    const keep = new Set(await this.d.repo.allStorageKeys());
    let removed = 0;
    for (const key of this.d.files.listStorageKeys()) {
      if (!keep.has(key)) {
        this.safeRemove(key);
        removed++;
      }
    }
    return removed;
  }
}
