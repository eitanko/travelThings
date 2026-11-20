import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayISO } from '@/domain/dates';

/**
 * Today's local calendar date (`YYYY-MM-DD`). Updates when the app returns to the foreground and when the
 * date changes while it stays open, so derived statuses (e.g. document expiration) never go stale. Fully offline.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const n = new Date();
      const nextMidnight = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, nextMidnight.getTime() - n.getTime());
    };
    schedule();
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);
  return today;
}
