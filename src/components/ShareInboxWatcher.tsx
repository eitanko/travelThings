import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { readPendingShare } from '@/services/sharedInbox';
import { importSession, shareSession } from '@/state/store';

/** Opens the review screen when the Share extension has left files waiting. Checks at launch and on every foreground. */
export function ShareInboxWatcher() {
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      // Never interrupt an import in progress; the share is picked up on the next foreground.
      if (busy.current || shareSession.get() || importSession.get().length > 0) return;
      busy.current = true;
      try {
        const pending = await readPendingShare();
        if (!pending || shareSession.get() || importSession.get().length > 0) return;
        shareSession.set(pending.id);
        importSession.set(pending.files);
        router.push('/new');
      } finally {
        busy.current = false;
      }
    };
    const t = setTimeout(() => void check(), 300);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [router]);

  return null;
}
