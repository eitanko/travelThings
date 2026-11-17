import type { Db } from './types';

/**
 * Ordered, append-only migrations. `PRAGMA user_version` records how many have run.
 * Phase 2 (trips, archive) should add new entries here instead of editing existing ones.
 */
export const MIGRATIONS: string[] = [
  // v1 — Phase 1 schema: opaque documents with optional metadata and 1..n attachments.
  `
  CREATE TABLE documents (
    id            TEXT PRIMARY KEY NOT NULL,
    original_name TEXT NOT NULL,
    title         TEXT,
    type          TEXT,
    activity_date TEXT,
    imported_at   INTEGER NOT NULL,
    fingerprint   TEXT NOT NULL,
    storage_key   TEXT NOT NULL
  );
  CREATE TABLE attachments (
    id            TEXT PRIMARY KEY NOT NULL,
    document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    checksum      TEXT NOT NULL
  );
  CREATE INDEX idx_attachments_document ON attachments(document_id, position);
  CREATE INDEX idx_documents_fingerprint ON documents(fingerprint);
  CREATE INDEX idx_documents_activity ON documents(activity_date);
  `,
];

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = MIGRATIONS[v] as string;
    await db.withTransaction(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${v + 1};`);
    });
  }
}
