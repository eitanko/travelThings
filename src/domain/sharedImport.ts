/** Manifest written by the iOS Share extension for one share (see targets/share/ShareViewController.swift). */
export interface SharedManifestFile {
  name: string;
  mimeType: string;
  path: string;
}
export interface SharedManifest {
  id: string;
  createdAt: number;
  files: SharedManifestFile[];
}

const SUPPORTED = (m: string) => m === 'application/pdf' || m.startsWith('image/');

/** Validates untrusted manifest JSON. Returns null for anything incomplete, unsupported or path-escaping. */
export function parseManifest(raw: string): SharedManifest | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  const m = v as Partial<SharedManifest> & { state?: string };
  if (!m || typeof m.id !== 'string' || m.state !== 'ready' || !Array.isArray(m.files) || m.files.length === 0) return null;
  const files: SharedManifestFile[] = [];
  for (const f of m.files) {
    if (!f || typeof f.name !== 'string' || typeof f.path !== 'string' || typeof f.mimeType !== 'string') return null;
    if (f.path.includes('/') || f.path.includes('..') || !SUPPORTED(f.mimeType)) return null;
    files.push({ name: f.name, mimeType: f.mimeType, path: f.path });
  }
  return { id: m.id, createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0, files };
}
