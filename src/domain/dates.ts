/** Date helpers. Activity dates are plain local calendar days (`YYYY-MM-DD`), never time-zone shifted instants. */

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function isValidISODate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

const utcDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole calendar days from `now` to the given date (negative = past). */
export function diffDays(s: string, now: Date = new Date()): number {
  return Math.round((utcDay(parseISODate(s)) - utcDay(now)) / 864e5);
}

export function formatShort(s: string, now: Date = new Date()): string {
  const d = parseISODate(s);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

export function formatLong(s: string): string {
  return parseISODate(s).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function relative(n: number): string {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const a = Math.abs(n);
  const unit = a < 14 ? `${a} days` : a < 70 ? `${Math.round(a / 7)} weeks` : `${Math.round(a / 30)} months`;
  return n > 0 ? `In ${unit}` : `${unit} ago`;
}

/** Local calendar date `n` days from `now` (noon-anchored so DST can't shift the day). */
export function addDaysISO(n: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
