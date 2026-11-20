import { Directory, File, Paths } from 'expo-file-system';
import { parseManifest, type SharedManifest } from '@/domain/sharedImport';
import type { StagedFile } from '@/domain/types';

/** Must match the App Group in app.json and targets/share. */
export const SHARE_GROUP_ID = 'group.com.eitankoren.travelthings';

export interface PendingShare {
  id: string;
  files: StagedFile[];
}

function incomingDir(): Directory | null {
  try {
    const root = Paths.appleSharedContainers?.[SHARE_GROUP_ID];
    if (!root) return null;
    const dir = new Directory(root, 'incoming');
    return dir.exists ? dir : null;
  } catch {
    return null; // e.g. Expo Go or a build without the App Group
  }
}

/**
 * Returns the oldest completed share from the extension that is not `skipId`, or null.
 * Half-written shares (`*.staging`) and invalid manifests are ignored, never loaded or deleted here.
 */
export async function readPendingShare(skipId?: string): Promise<PendingShare | null> {
  const dir = incomingDir();
  if (!dir) return null;
  const found: { manifest: SharedManifest; dir: Directory }[] = [];
  for (const entry of dir.list()) {
    if (!(entry instanceof Directory) || entry.name.endsWith('.staging') || entry.name === skipId) continue;
    try {
      const manifestFile = new File(entry, 'manifest.json');
      if (!manifestFile.exists) continue;
      const manifest = parseManifest(await manifestFile.text());
      if (manifest && manifest.id === entry.name) found.push({ manifest, dir: entry });
    } catch {
      /* unreadable: leave it for a later attempt */
    }
  }
  found.sort((a, b) => a.manifest.createdAt - b.manifest.createdAt);
  for (const { manifest, dir: d } of found) {
    const files: StagedFile[] = [];
    for (const f of manifest.files) {
      const file = new File(d, f.path);
      if (file.exists) files.push({ uri: file.uri, name: f.name, mimeType: f.mimeType, size: file.size });
    }
    if (files.length === manifest.files.length) return { id: manifest.id, files };
  }
  return null;
}

/** Removes a share's staged files. Call only after the event is committed or the user cancelled. */
export function removeShare(id: string): void {
  try {
    const dir = incomingDir();
    if (!dir) return;
    const d = new Directory(dir, id);
    if (d.exists) d.delete();
  } catch {
    /* retried implicitly: a leftover share is caught by the duplicate check if it is imported again */
  }
}
