import { Directory, File, Paths } from 'expo-file-system';
import type { ShareSnapshot } from '@/domain/sharePackage';
import { buildSnapshot, ingestPackages, type InboxPackage, type InboxStore } from './shareIngest';
import type { DocumentService } from './documentService';

/** Must match the App Group in app.json and targets/share/Models.swift. */
export const SHARE_GROUP_ID = 'group.com.eitankoren.travelthings';

function groupRoot(): Directory | null {
  try {
    return Paths.appleSharedContainers?.[SHARE_GROUP_ID] ?? null;
  } catch {
    return null; // Expo Go or a build without the App Group
  }
}

class ExpoInbox implements InboxStore {
  constructor(private readonly dir: Directory) {}

  list(): InboxPackage[] {
    const out: InboxPackage[] = [];
    for (const entry of this.dir.list()) {
      if (!(entry instanceof Directory) || entry.name.endsWith('.staging')) continue;
      out.push({
        importId: entry.name,
        readManifest: () => new File(entry, 'package.json').text(),
        fileUri: (name) => new File(entry, name).uri,
        fileSize: (name) => {
          const f = new File(entry, name);
          return f.exists ? f.size : null;
        },
      });
    }
    return out;
  }

  remove(importId: string): void {
    const d = new Directory(this.dir, importId);
    if (d.exists) d.delete();
  }
}

/** Publishes trips and known fingerprints for the extension. Replaced as a whole file; the extension tolerates a missing one. */
export async function writeSnapshot(svc: DocumentService): Promise<void> {
  const root = groupRoot();
  if (!root) return;
  const snapshot: ShareSnapshot = await buildSnapshot(svc, Date.now());
  const tmp = new File(root, 'snapshot.json.tmp');
  const dest = new File(root, 'snapshot.json');
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(JSON.stringify(snapshot));
  if (dest.exists) dest.delete();
  tmp.move(dest);
}

export interface SyncResult {
  incorporated: number;
  failed: number;
  fellBackToDefault: number;
  lastDocumentId: string | null;
}

let running: Promise<SyncResult> | null = null;

/** Incorporates saved shares, then refreshes the snapshot. Concurrent calls share one run, so callbacks never overlap. */
export function syncShareInbox(svc: DocumentService): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const empty: SyncResult = { incorporated: 0, failed: 0, fellBackToDefault: 0, lastDocumentId: null };
    const root = groupRoot();
    if (!root) return empty;
    let result = empty;
    try {
      const inbox = new Directory(root, 'inbox');
      if (inbox.exists) result = await ingestPackages(svc, new ExpoInbox(inbox));
    } catch {
      /* retried on the next foreground */
    }
    try {
      await writeSnapshot(svc);
    } catch {
      /* the extension falls back to My Documents only */
    }
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}
