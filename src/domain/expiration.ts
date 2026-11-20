import { isValidISODate } from './dates';

/** Months before the expiration date at which a document starts showing "About to expire". */
export const WARNING_MONTHS = 6;

export type ExpirationStatus = 'none' | 'aboutToExpire' | 'expired';

export const EXPIRATION_LABEL: Record<Exclude<ExpirationStatus, 'none'>, string> = {
  aboutToExpire: 'About to expire',
  expired: 'Expired',
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * First calendar day on which the warning shows: `expiration` minus six calendar months. When that month has no such
 * day (e.g. 31 Aug → 31 Feb) it clamps to the month's last day. Pure date-only arithmetic, so no time zone can move it.
 */
export function warningStart(expiration: string): string {
  const [y, m, d] = expiration.split('-').map(Number) as [number, number, number];
  let year = y;
  let month = m - WARNING_MONTHS;
  if (month < 1) {
    month += 12;
    year -= 1;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(Math.min(d, daysInMonth))}`;
}

/**
 * Derived on demand from the saved date and the current local calendar day; never stored.
 * The expiration day itself is still "About to expire"; "Expired" starts the next day.
 */
export function expirationStatus(expiration: string | null | undefined, today: string): ExpirationStatus {
  if (!isValidISODate(expiration)) return 'none';
  if (today > expiration) return 'expired';
  if (today >= warningStart(expiration)) return 'aboutToExpire';
  return 'none';
}
