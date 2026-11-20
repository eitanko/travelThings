import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_TRIP_ID } from '@/domain/trips';
import type { Document, StagedFile, Trip } from '@/domain/types';
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
  /** Swaps one staged file in place (used by rotation). The other files keep their order. */
  replaceAt(index: number, file: StagedFile) {
    staged = staged.map((f, i) => (i === index ? file : f));
    emitStaged();
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
  trips: Trip[];
  /** The trip the main screen shows and new documents are saved into. */
  selectedTripId: string;
  loading: boolean;
  error: Error | null;
}

let library: LibrarySnapshot = { docs: [], trips: [], selectedTripId: DEFAULT_TRIP_ID, loading: true, error: null };
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
    const [docs, trips, selectedTripId] = await Promise.all([svc.list(), svc.listTrips(), svc.selectedTripId()]);
    setLibrary({ docs, trips, selectedTripId, loading: false, error: null });
  } catch (e) {
    setLibrary({ ...library, loading: false, error: e instanceof Error ? e : new Error(String(e)) });
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

/** The pending iOS share currently open in the review screen, if any. It is deleted only after save or discard. */
let activeShare: { id: string } | null = null;
export const shareSession = {
  get: () => activeShare,
  set(id: string | null) {
    activeShare = id ? { id } : null;
  },
};
