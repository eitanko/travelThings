import { AppError, toAppError } from '@/domain/errors';
import type { Attachment, Document, DocumentMetadata, DocumentType, Trip } from '@/domain/types';
import type { Db } from './types';

interface DocRow {
  id: string;
  trip_id: string;
  original_name: string;
  title: string | null;
  type: string | null;
  activity_date: string | null;
  imported_at: number;
  fingerprint: string;
  storage_key: string;
}
interface AttRow {
  id: string;
  document_id: string;
  position: number;
  original_name: string;
  relative_path: string;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  original_relative_path: string | null;
  rotation_turns: number;
}
interface TripRow {
  id: string;
  name: string;
  is_default: number;
}

const SELECTED_TRIP_KEY = 'selected_trip_id';

const toAttachment = (r: AttRow): Attachment => ({
  id: r.id,
  documentId: r.document_id,
  position: r.position,
  originalName: r.original_name,
  relativePath: r.relative_path,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  checksum: r.checksum,
  originalRelativePath: r.original_relative_path ?? null,
  rotationTurns: r.rotation_turns ?? 0,
});

const toDocument = (r: DocRow, atts: Attachment[]): Document => ({
  id: r.id,
  tripId: r.trip_id,
  originalName: r.original_name,
  title: r.title,
  type: r.type as DocumentType | null,
  activityDate: r.activity_date,
  importedAt: r.imported_at,
  fingerprint: r.fingerprint,
  storageKey: r.storage_key,
  attachments: atts,
});

const toTrip = (r: TripRow): Trip => ({ id: r.id, name: r.name, isDefault: r.is_default === 1 });

async function insertAttachments(tx: Db, atts: Attachment[]): Promise<void> {
  for (const a of atts) {
    await tx.runAsync(
      `INSERT INTO attachments (id, document_id, position, original_name, relative_path, mime_type, size_bytes, checksum, original_relative_path, rotation_turns)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.documentId,
        a.position,
        a.originalName,
        a.relativePath,
        a.mimeType,
        a.sizeBytes,
        a.checksum,
        a.originalRelativePath ?? null,
        a.rotationTurns ?? 0,
      ],
    );
  }
}

export class DocumentRepository {
  constructor(private readonly db: Db) {}

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw e instanceof AppError ? e : toAppError(e, 'DATABASE_FAILED');
    }
  }

  async list(): Promise<Document[]> {
    return this.guard(async () => {
      const docs = await this.db.getAllAsync<DocRow>('SELECT * FROM documents');
      const atts = await this.db.getAllAsync<AttRow>('SELECT * FROM attachments ORDER BY document_id, position');
      const byDoc = new Map<string, Attachment[]>();
      for (const a of atts) {
        const list = byDoc.get(a.document_id) ?? [];
        list.push(toAttachment(a));
        byDoc.set(a.document_id, list);
      }
      return docs.map((d) => toDocument(d, byDoc.get(d.id) ?? []));
    });
  }

  async get(id: string): Promise<Document | null> {
    return this.guard(async () => {
      const row = await this.db.getFirstAsync<DocRow>('SELECT * FROM documents WHERE id = ?', [id]);
      if (!row) return null;
      const atts = await this.db.getAllAsync<AttRow>(
        'SELECT * FROM attachments WHERE document_id = ? ORDER BY position',
        [id],
      );
      return toDocument(row, atts.map(toAttachment));
    });
  }

  async findByFingerprint(fingerprint: string): Promise<Document | null> {
    return this.guard(async () => {
      const row = await this.db.getFirstAsync<{ id: string }>(
        'SELECT id FROM documents WHERE fingerprint = ? ORDER BY imported_at LIMIT 1',
        [fingerprint],
      );
      return row ? this.get(row.id) : null;
    });
  }

  /** Inserts the document and all attachments in one transaction. */
  async insert(doc: Document): Promise<void> {
    await this.guard(() =>
      this.db.withTransaction(async (tx) => {
        await tx.runAsync(
          `INSERT INTO documents (id, trip_id, original_name, title, type, activity_date, imported_at, fingerprint, storage_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [doc.id, doc.tripId, doc.originalName, doc.title, doc.type, doc.activityDate, doc.importedAt, doc.fingerprint, doc.storageKey],
        );
        await insertAttachments(tx, doc.attachments);
      }),
    );
  }

  async updateMetadata(id: string, meta: DocumentMetadata): Promise<void> {
    await this.guard(async () => {
      await this.db.runAsync('UPDATE documents SET title = ?, type = ?, activity_date = ? WHERE id = ?', [
        meta.title,
        meta.type,
        meta.activityDate,
        id,
      ]);
    });
  }

  /**
   * Adds attachments to an existing document and sets its content fingerprint.
   * Title, type, activity date and the original name are not touched.
   */
  async appendAttachments(id: string, atts: Attachment[], fingerprint: string): Promise<void> {
    await this.guard(() =>
      this.db.withTransaction(async (tx) => {
        await insertAttachments(tx, atts);
        await tx.runAsync('UPDATE documents SET fingerprint = ? WHERE id = ?', [fingerprint, id]);
      }),
    );
  }

  /**
   * Removes one attachment row, updates the fingerprint and the display fallback name, in one transaction.
   * Returns the removed files' relative paths (the file and its kept original, if any), or null if the attachment
   * did not belong to the document.
   */
  async removeAttachment(
    docId: string,
    attachmentId: string,
    remaining: { fingerprint: string; originalName: string },
  ): Promise<string[] | null> {
    return this.guard(() =>
      this.db.withTransaction(async (tx) => {
        const row = await tx.getFirstAsync<{ relative_path: string; original_relative_path: string | null }>(
          'SELECT relative_path, original_relative_path FROM attachments WHERE id = ? AND document_id = ?',
          [attachmentId, docId],
        );
        if (!row) return null;
        await tx.runAsync('DELETE FROM attachments WHERE id = ? AND document_id = ?', [attachmentId, docId]);
        await tx.runAsync('UPDATE documents SET fingerprint = ?, original_name = ? WHERE id = ?', [
          remaining.fingerprint,
          remaining.originalName,
          docId,
        ]);
        return [row.relative_path, row.original_relative_path].filter((p): p is string => !!p);
      }),
    );
  }

  /**
   * Points saved attachments at their re-oriented files and updates the content fingerprint, in one transaction.
   * Position, display name, the document's metadata and every other attachment are not touched.
   */
  async updateAttachmentFiles(
    docId: string,
    updates: Pick<Attachment, 'id' | 'relativePath' | 'originalRelativePath' | 'rotationTurns' | 'mimeType' | 'sizeBytes' | 'checksum'>[],
    fingerprint: string,
  ): Promise<void> {
    await this.guard(() =>
      this.db.withTransaction(async (tx) => {
        for (const u of updates) {
          await tx.runAsync(
            `UPDATE attachments SET relative_path = ?, original_relative_path = ?, rotation_turns = ?, mime_type = ?,
               size_bytes = ?, checksum = ? WHERE id = ? AND document_id = ?`,
            [u.relativePath, u.originalRelativePath, u.rotationTurns, u.mimeType, u.sizeBytes, u.checksum, u.id, docId],
          );
        }
        await tx.runAsync('UPDATE documents SET fingerprint = ? WHERE id = ?', [fingerprint, docId]);
      }),
    );
  }

  /**
   * Atomically points an existing document at a new set of files (Replace existing).
   * Either every row changes or none do. The trip association is kept.
   */
  async swapFiles(
    id: string,
    next: Pick<Document, 'originalName' | 'fingerprint' | 'storageKey' | 'importedAt' | 'attachments'>,
    meta: DocumentMetadata,
  ): Promise<void> {
    await this.guard(() =>
      this.db.withTransaction(async (tx) => {
        await tx.runAsync('DELETE FROM attachments WHERE document_id = ?', [id]);
        await tx.runAsync(
          `UPDATE documents SET original_name = ?, fingerprint = ?, storage_key = ?, imported_at = ?,
             title = ?, type = ?, activity_date = ? WHERE id = ?`,
          [next.originalName, next.fingerprint, next.storageKey, next.importedAt, meta.title, meta.type, meta.activityDate, id],
        );
        await insertAttachments(tx, next.attachments);
      }),
    );
  }

  /** Deletes the record (attachments cascade). Returns the storage key whose files should now be removed. */
  async delete(id: string): Promise<string | null> {
    return this.guard(async () => {
      let key: string | null = null;
      await this.db.withTransaction(async (tx) => {
        const row = await tx.getFirstAsync<{ storage_key: string }>('SELECT storage_key FROM documents WHERE id = ?', [id]);
        key = row?.storage_key ?? null;
        await tx.runAsync('DELETE FROM attachments WHERE document_id = ?', [id]);
        await tx.runAsync('DELETE FROM documents WHERE id = ?', [id]);
      });
      return key;
    });
  }

  /** Moves the whole entry (and therefore all of its attachments) to another trip. Files are not touched. */
  async moveDocument(docId: string, tripId: string): Promise<void> {
    await this.guard(() => this.db.runAsync('UPDATE documents SET trip_id = ? WHERE id = ?', [tripId, docId]));
  }

  async allStorageKeys(): Promise<string[]> {
    return this.guard(async () => {
      const rows = await this.db.getAllAsync<{ storage_key: string }>('SELECT storage_key FROM documents');
      return rows.map((r) => r.storage_key);
    });
  }

  // ---- Trips -------------------------------------------------------------------------------------------------

  /** Default trip first, then custom trips alphabetically. */
  async listTrips(): Promise<Trip[]> {
    return this.guard(async () => {
      const rows = await this.db.getAllAsync<TripRow>('SELECT * FROM trips ORDER BY is_default DESC, name COLLATE NOCASE');
      return rows.map(toTrip);
    });
  }

  async getTrip(id: string): Promise<Trip | null> {
    return this.guard(async () => {
      const row = await this.db.getFirstAsync<TripRow>('SELECT * FROM trips WHERE id = ?', [id]);
      return row ? toTrip(row) : null;
    });
  }

  async insertTrip(trip: Trip): Promise<void> {
    await this.guard(() =>
      this.db.runAsync('INSERT INTO trips (id, name, is_default) VALUES (?, ?, ?)', [trip.id, trip.name, trip.isDefault ? 1 : 0]),
    );
  }

  async renameTrip(id: string, name: string): Promise<void> {
    await this.guard(() => this.db.runAsync('UPDATE trips SET name = ? WHERE id = ?', [name, id]));
  }

  async getSelectedTripId(): Promise<string | null> {
    return this.guard(async () => {
      const row = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [SELECTED_TRIP_KEY]);
      return row?.value ?? null;
    });
  }

  async setSelectedTripId(id: string): Promise<void> {
    await this.guard(() =>
      this.db.runAsync(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [SELECTED_TRIP_KEY, id],
      ),
    );
  }

  /**
   * Deletes a custom trip in one transaction.
   * - `move`: its documents go to `moveTo` first (files untouched).
   * - `delete`: its documents and attachment rows are removed too.
   * If the trip was the selected one, `fallbackSelection` becomes selected in the same transaction.
   * Returns the storage keys whose files should now be removed (empty for `move`).
   */
  async removeTrip(
    id: string,
    mode: { kind: 'move'; moveTo: string } | { kind: 'delete' },
    fallbackSelection: string,
  ): Promise<string[]> {
    return this.guard(async () => {
      let keys: string[] = [];
      await this.db.withTransaction(async (tx) => {
        if (mode.kind === 'move') {
          await tx.runAsync('UPDATE documents SET trip_id = ? WHERE trip_id = ?', [mode.moveTo, id]);
        } else {
          const rows = await tx.getAllAsync<{ storage_key: string }>('SELECT storage_key FROM documents WHERE trip_id = ?', [id]);
          keys = rows.map((r) => r.storage_key);
          await tx.runAsync('DELETE FROM attachments WHERE document_id IN (SELECT id FROM documents WHERE trip_id = ?)', [id]);
          await tx.runAsync('DELETE FROM documents WHERE trip_id = ?', [id]);
        }
        await tx.runAsync(
          'UPDATE app_settings SET value = ? WHERE key = ? AND value = ?',
          [fallbackSelection, SELECTED_TRIP_KEY, id],
        );
        await tx.runAsync('DELETE FROM trips WHERE id = ? AND is_default = 0', [id]);
      });
      return keys;
    });
  }
}
