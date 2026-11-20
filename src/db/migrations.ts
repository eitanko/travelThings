import type { Db } from './types';

/**
 * Ordered, append-only migrations. `PRAGMA user_version` records how many have run.
 * Add new entries here instead of editing existing ones.
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
  // v2 — Trips (folders). Non-destructive: existing documents are attached to the permanent My Documents trip.
  // documents.trip_id stays nullable at the column level (SQLite cannot add a NOT NULL foreign-key column in place
  // without rebuilding `documents`, which would cascade-delete attachments). Triggers make it required in practice.
  `
  CREATE TABLE trips (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1))
  );
  CREATE UNIQUE INDEX idx_trips_one_default ON trips(is_default) WHERE is_default = 1;
  CREATE TABLE app_settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO trips (id, name, is_default) VALUES ('default-my-documents', 'My Documents', 1);
  ALTER TABLE documents ADD COLUMN trip_id TEXT REFERENCES trips(id);
  UPDATE documents SET trip_id = 'default-my-documents' WHERE trip_id IS NULL;
  CREATE INDEX idx_documents_trip ON documents(trip_id);
  CREATE TRIGGER documents_trip_required_insert BEFORE INSERT ON documents WHEN NEW.trip_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'documents.trip_id is required'); END;
  CREATE TRIGGER documents_trip_required_update BEFORE UPDATE OF trip_id ON documents WHEN NEW.trip_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'documents.trip_id is required'); END;
  `,
  // v3 — Rotation. Keeps the untouched original of a file whose orientation was corrected before saving.
  // Nullable: existing rows and never-rotated files have no original.
  `
  ALTER TABLE attachments ADD COLUMN original_relative_path TEXT;
  `,
  // v4 — Remembers how far a saved image has been turned from its original (0–3 clockwise quarter turns).
  `
  ALTER TABLE attachments ADD COLUMN rotation_turns INTEGER NOT NULL DEFAULT 0;
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
