import { useSyncExternalStore } from 'react';
import { toAppError } from '@/domain/errors';
import { getDocumentService } from '@/services/container';

/** App start-up: opens + migrates the database and sweeps orphaned files before any screen renders. */
export type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

let boot: BootState = { status: 'loading' };
const listeners = new Set<() => void>();
const set = (next: BootState) => {
  boot = next;
  listeners.forEach((l) => l());
};

export function startBoot(): void {
  set({ status: 'loading' });
  getDocumentService().then(
    () => set({ status: 'ready' }),
    (e) => set({ status: 'error', message: toAppError(e, 'DATABASE_FAILED').userMessage }),
  );
}

export const useBoot = (): BootState =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => boot,
  );
