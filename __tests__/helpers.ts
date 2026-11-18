import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam } from '@/db/types';
import { migrate } from '@/db/migrations';
import { DocumentRepository } from '@/db/repository';
import { DocumentService } from '@/services/documentService';
import type { FileStore } from '@/services/fileStore';
import { AppError } from '@/domain/errors';

/** Db backed by Node's built-in SQLite engine: same SQL, real transactions. */
export class NodeSqliteDb implements Db {
  constructor(private readonly db: DatabaseSync) {}
  async execAsync(sql: string) {
    this.db.exec(sql);
  }
  async runAsync(sql: string, params: SqlParam[] = []) {
    this.db.prepare(sql).run(...params);
  }
  async getAllAsync<T>(sql: string, params: SqlParam[] = []) {
    return this.db.prepare(sql).all(...params) as T[];
  }
  async getFirstAsync<T>(sql: string, params: SqlParam[] = []) {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const r = await fn(this);
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** FileStore on the real filesystem under a temp dir, mirroring ExpoFileStore's layout. */
export class NodeFileStore implements FileStore {
  space = Number.POSITIVE_INFINITY;
  constructor(readonly root: string) {
    fs.mkdirSync(path.join(root, 'documents'), { recursive: true });
  }
  availableSpace() {
    return this.space;
  }
  size(uri: string) {
    if (!fs.existsSync(uri)) throw new AppError('FILE_MISSING');
    return fs.statSync(uri).size;
  }
  async sha256(uri: string) {
    return createHash('sha256').update(fs.readFileSync(uri)).digest('hex');
  }
  async copyInto(sourceUri: string, storageKey: string, fileName: string) {
    const dir = path.join(this.root, 'documents', storageKey);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(sourceUri, path.join(dir, fileName));
    return `documents/${storageKey}/${fileName}`;
  }
  exists(rel: string) {
    return fs.existsSync(path.join(this.root, rel));
  }
  sizeOfStored(rel: string) {
    return fs.statSync(path.join(this.root, rel)).size;
  }
  async sha256OfStored(rel: string) {
    return createHash('sha256').update(fs.readFileSync(path.join(this.root, rel))).digest('hex');
  }
  uriFor(rel: string) {
    return path.join(this.root, rel);
  }
  removeDir(key: string) {
    fs.rmSync(path.join(this.root, 'documents', key), { recursive: true, force: true });
  }
  removeFile(rel: string) {
    fs.rmSync(path.join(this.root, rel), { force: true });
  }
  listStorageKeys() {
    return fs.readdirSync(path.join(this.root, 'documents'));
  }
  storedFileCount() {
    return this.listStorageKeys().reduce((n, k) => n + fs.readdirSync(path.join(this.root, 'documents', k)).length, 0);
  }
}

export interface Harness {
  dir: string;
  dbPath: string;
  db: NodeSqliteDb;
  files: NodeFileStore;
  repo: DocumentRepository;
  svc: DocumentService;
  /** Simulates an app restart: new DB connection + new service over the same on-disk data. */
  restart(): Promise<Harness>;
  write(name: string, content: string | Buffer): string;
}

export async function makeHarness(existing?: { dir: string }): Promise<Harness> {
  const dir = existing?.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
  const dbPath = path.join(dir, 'test.db');
  const db = new NodeSqliteDb(new DatabaseSync(dbPath));
  await migrate(db);
  const files = new NodeFileStore(path.join(dir, 'app'));
  const repo = new DocumentRepository(db);
  const svc = new DocumentService({ repo, files, newId: () => randomUUID(), now: () => Date.now() });
  fs.mkdirSync(path.join(dir, 'tmp'), { recursive: true });
  return {
    dir,
    dbPath,
    db,
    files,
    repo,
    svc,
    restart: () => makeHarness({ dir }),
    write: (name, content) => {
      const p = path.join(dir, 'tmp', name);
      fs.writeFileSync(p, content);
      return p;
    },
  };
}
