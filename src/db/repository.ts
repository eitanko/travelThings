import { AppError, toAppError } from '@/domain/errors';
import type { Attachment, Document, DocumentMetadata, DocumentType } from '@/domain/types';
import type { Db } from './types';

interface DocRow {
  id: string;
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
}

const toAttachment = (r: AttRow): Attachment => ({
  id: r.id,
  documentId: r.document_id,
  position: r.position,
  originalName: r.original_name,
  relativePath: r.relative_path,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  checksum: r.checksum,
});

const toDocument = (r: DocRow, atts: Attachment[]): Document => ({
  id: r.id,
  originalName: r.original_name,
  title: r.title,
  type: r.type as DocumentType | null,
  activityDate: r.activity_date,
  importedAt: r.imported_at,
  fingerprint: r.fingerprint,
  storageKey: r.storage_key,
  attachments: atts,
});

async function insertAttachments(tx: Db, atts: Attachment[]): Promise<void> {
  for (const a of atts) {
    await tx.runAsync(
      `INSERT INTO attachments (id, document_id, position, original_name, relative_path, mime_type, size_bytes, checksum)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.documentId, a.position, a.originalName, a.relativePath, a.mimeType, a.sizeBytes, a.checksum],
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
          `INSERT INTO documents (id, original_name, title, type, activity_date, imported_at, fingerprint, storage_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [doc.id, doc.originalName, doc.title, doc.type, doc.activityDate, doc.importedAt, doc.fingerprint, doc.storageKey],
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
   * Returns the removed file's relative path, or null if the attachment did not belong to the document.
   */
  async removeAttachment(
    docId: string,
    attachmentId: string,
    remaining: { fingerprint: string; originalName: string },
  ): Promise<string | null> {
    return this.guard(() =>
      this.db.withTransaction(async (tx) => {
        const row = await tx.getFirstAsync<{ relative_path: string }>(
          'SELECT relative_path FROM attachments WHERE id = ? AND document_id = ?',
          [attachmentId, docId],
        );
        if (!row) return null;
        await tx.runAsync('DELETE FROM attachments WHERE id = ? AND document_id = ?', [attachmentId, docId]);
        await tx.runAsync('UPDATE documents SET fingerprint = ?, original_name = ? WHERE id = ?', [
          remaining.fingerprint,
          remaining.originalName,
          docId,
        ]);
        return row.relative_path;
      }),
    );
  }

  /**
   * Atomically points an existing document at a new set of files (Replace existing).
   * Either every row changes or none do.
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

  async allStorageKeys(): Promise<string[]> {
    return this.guard(async () => {
      const rows = await this.db.getAllAsync<{ storage_key: string }>('SELECT storage_key FROM documents');
      return rows.map((r) => r.storage_key);
    });
  }
}
