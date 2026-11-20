import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getDocumentService } from '@/services/container';
import { syncShareInbox, writeSnapshot } from '@/services/sharedInbox';
import { notifyLibraryChanged, setFlash } from '@/state/store';

/**
 * Keeps the iOS Share extension and the library in step, with no user action:
 *  - on foreground, documents saved from the share menu are added to their trips;
 *  - when the app leaves the foreground, the trips/duplicate snapshot the extension reads is refreshed.
 * (Launch is handled in the document service, so the first list already includes shared documents.)
 */
export function ShareInboxWatcher() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      void (async () => {
        try {
          const svc = await getDocumentService();
          if (state === 'active') {
            const r = await syncShareInbox(svc);
            if (r.incorporated > 0) {
              setFlash({
                message: r.incorporated === 1 ? 'Document added from Share' : `${r.incorporated} documents added from Share`,
                highlightId: r.lastDocumentId ?? undefined,
              });
              notifyLibraryChanged();
            }
          } else {
            await writeSnapshot(svc);
          }
        } catch {
          /* retried on the next transition */
        }
      })();
    });
    return () => sub.remove();
  }, []);
  return null;
}
