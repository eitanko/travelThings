import { useEffect, useSyncExternalStore } from 'react';
import type { Document, StagedFile } from '@/domain/types';
import { getDocumentService } from '@/services/container';
import { discardStagedFiles } from '@/services/importer';

/** Tiny external store: holds files selected in the Add flow until the user saves or discards them. */
let staged: StagedFile[] = [];
const stagedListeners = new Set<() => void>();
const emitStaged = () => stagedListeners.forEach((l) => l());

export const importSession = {
  set(files: StagedFile[]) {
    staged = files;
    emitStaged();
  },
  /** Forgets the staged files and removes their temporary picker/camera/scanner copies. */
  clear() {
    const old = staged;
    staged = [];
    emitStaged();
    discardStagedFiles(old);
  },
  get: () => staged,
  subscribe(l: () => void) {
    stagedListeners.add(l);
    return () => {
      stagedListeners.delete(l);
    };
  },
};

export const useStagedFiles = () => useSyncExternalStore(importSession.subscribe, importSession.get);

/** Library snapshot shared by every screen. Any mutation calls notifyLibraryChanged() to refresh it. */
export interface LibrarySnapshot {
  docs: Document[];
  loading: boolean;
  error: Error | null;
}

let library: LibrarySnapshot = { docs: [], loading: true, error: null };
let libraryStarted = false;
const libraryListeners = new Set<() => void>();

const setLibrary = (next: LibrarySnapshot) => {
  library = next;
  libraryListeners.forEach((l) => l());
};

const subscribeLibrary = (l: () => void) => {
  libraryListeners.add(l);
  return () => {
    libraryListeners.delete(l);
  };
};

export async function reloadLibrary(): Promise<void> {
  try {
    const svc = await getDocumentService();
    setLibrary({ docs: await svc.list(), loading: false, error: null });
  } catch (e) {
    setLibrary({ docs: library.docs, loading: false, error: e instanceof Error ? e : new Error(String(e)) });
  }
}

export const notifyLibraryChanged = () => {
  void reloadLibrary();
};

export function useLibrary(): LibrarySnapshot & { reload: () => Promise<void> } {
  const snap = useSyncExternalStore(subscribeLibrary, () => library);
  useEffect(() => {
    if (!libraryStarted) {
      libraryStarted = true;
      void reloadLibrary();
    }
  }, []);
  return { ...snap, reload: reloadLibrary };
}

/** `undefined` while the library is loading, `null` once it is known that no such document exists. */
export function useDocument(id: string | undefined): Document | null | undefined {
  const { docs, loading } = useLibrary();
  if (!id) return undefined;
  const found = docs.find((d) => d.id === id);
  if (found) return found;
  return loading ? undefined : null;
}

/** One-shot message/highlight handed from a finished flow (save, edit, delete) to the screen shown next. */
let flash: { message: string; highlightId?: string } | null = null;
export const setFlash = (f: { message: string; highlightId?: string }) => {
  flash = f;
};
export const consumeFlash = () => {
  const f = flash;
  flash = null;
  return f;
};
