import { DOCUMENT_TYPES, type DocumentType } from './types';

/**
 * Contract between the iOS Share extension (targets/share, Swift) and the main app.
 * Keep in step with `SharePackage` / `ShareSnapshot` in targets/share/Models.swift.
 *
 * Inbox layout inside the App Group container:
 *   drafts/<uuid>/…                    work in progress inside the extension (never read by the app)
 *   inbox/<importId>/package.json      a committed package, plus the original files next to it
 *   snapshot.json                      written by the app: trips + known fingerprints, read-only for the extension
 * A package directory only appears in `inbox/` through one atomic rename after Save, so the app never sees a partial one.
 */
export const PACKAGE_SCHEMA_VERSION = 1;
export const SNAPSHOT_SCHEMA_VERSION = 1;

export type DuplicateIntent =
  | { kind: 'new' }
  | { kind: 'replace'; existingId: string }
  | { kind: 'rename'; title: string };

export interface PackageFile {
  name: string;
  mimeType: string;
  /** File name inside the package directory. Never contains a path separator. */
  path: string;
  size: number;
}

export interface SharePackage {
  schemaVersion: number;
  importId: string;
  createdAt: number;
  tripId: string;
  title: string | null;
  type: DocumentType | null;
  activityDate: string | null;
  duplicate: DuplicateIntent;
  files: PackageFile[];
}

export interface ShareSnapshot {
  schemaVersion: number;
  updatedAt: number;
  trips: { id: string; name: string; isDefault: boolean }[];
  docs: { id: string; title: string | null; originalName: string; fingerprint: string }[];
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const supported = (m: string) => m === 'application/pdf' || m.startsWith('image/');

/** Validates untrusted package JSON. Returns null for anything incomplete, newer than this app, or path-escaping. */
export function parsePackage(raw: string): SharePackage | null {
  let v: any;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || v.schemaVersion !== PACKAGE_SCHEMA_VERSION || !isStr(v.importId) || !v.importId || !isStr(v.tripId)) return null;
  if (v.importId.includes('/') || v.importId.includes('..')) return null;
  if (!Array.isArray(v.files) || v.files.length === 0) return null;
  const files: PackageFile[] = [];
  for (const f of v.files) {
    if (!f || !isStr(f.name) || !isStr(f.path) || !isStr(f.mimeType) || typeof f.size !== 'number') return null;
    if (!f.path || f.path.includes('/') || f.path.includes('\\') || f.path.startsWith('.') || f.path === 'package.json') return null;
    if (!supported(f.mimeType)) return null;
    files.push({ name: f.name, mimeType: f.mimeType, path: f.path, size: f.size });
  }
  const d = v.duplicate;
  let duplicate: DuplicateIntent = { kind: 'new' };
  if (d?.kind === 'replace' && isStr(d.existingId)) duplicate = { kind: 'replace', existingId: d.existingId };
  else if (d?.kind === 'rename' && isStr(d.title)) duplicate = { kind: 'rename', title: d.title };
  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    importId: v.importId,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    tripId: v.tripId,
    title: isStr(v.title) ? v.title : null,
    type: (DOCUMENT_TYPES as readonly string[]).includes(v.type) ? (v.type as DocumentType) : null,
    activityDate: isStr(v.activityDate) ? v.activityDate : null,
    duplicate,
    files,
  };
}
