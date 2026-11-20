/** @jest-environment node */
import { expirationStatus, warningStart } from '@/domain/expiration';
import { sanitizeMetadata } from '@/domain/validation';

describe('warningStart (six calendar months back)', () => {
  it.each([
    ['2027-03-15', '2026-09-15'],
    ['2027-12-15', '2027-06-15'],
    ['2027-01-31', '2026-07-31'], // crosses the year boundary
    ['2027-08-31', '2027-02-28'], // Feb has no 31st → clamp (non-leap)
    ['2028-08-31', '2028-02-29'], // clamp to leap-day
    ['2027-08-29', '2027-02-28'],
    ['2028-08-29', '2028-02-29'],
    ['2027-10-31', '2027-04-30'], // 30-day month
    ['2028-02-29', '2027-08-29'], // leap-day expiry
    ['2027-06-30', '2026-12-30'],
  ])('%s → %s', (exp, start) => expect(warningStart(exp)).toBe(start));
});

describe('expirationStatus', () => {
  const E = '2027-03-15';
  it('no date → none', () => {
    expect(expirationStatus(null, '2026-11-20')).toBe('none');
    expect(expirationStatus(undefined, '2026-11-20')).toBe('none');
    expect(expirationStatus('garbage', '2026-11-20')).toBe('none');
  });
  it('more than six months away → none, up to the day before the threshold', () => {
    expect(expirationStatus(E, '2026-01-01')).toBe('none');
    expect(expirationStatus(E, '2026-09-14')).toBe('none');
  });
  it('threshold day (exactly six calendar months before) → About to expire', () => {
    expect(expirationStatus(E, '2026-09-15')).toBe('aboutToExpire');
  });
  it('inside the window → About to expire', () => {
    expect(expirationStatus(E, '2026-11-20')).toBe('aboutToExpire');
    expect(expirationStatus(E, '2027-03-14')).toBe('aboutToExpire');
  });
  it('expiration day itself → About to expire; next day → Expired', () => {
    expect(expirationStatus(E, '2027-03-15')).toBe('aboutToExpire');
    expect(expirationStatus(E, '2027-03-16')).toBe('expired');
  });
  it('past dates → Expired', () => {
    expect(expirationStatus('2026-11-10', '2026-11-20')).toBe('expired');
    expect(expirationStatus('1999-01-01', '2026-11-20')).toBe('expired');
  });
  it('spec examples for 20 Nov 2026', () => {
    expect(expirationStatus('2027-03-15', '2026-11-20')).toBe('aboutToExpire');
    expect(expirationStatus('2026-11-10', '2026-11-20')).toBe('expired');
    expect(expirationStatus('2027-12-15', '2026-11-20')).toBe('none');
  });
  it('month-end clamp: 31 Aug expiry warns from 28 Feb / 29 Feb in a leap year', () => {
    expect(expirationStatus('2027-08-31', '2027-02-27')).toBe('none');
    expect(expirationStatus('2027-08-31', '2027-02-28')).toBe('aboutToExpire');
    expect(expirationStatus('2028-08-31', '2028-02-28')).toBe('none');
    expect(expirationStatus('2028-08-31', '2028-02-29')).toBe('aboutToExpire');
  });
  it('is purely date-based (a 23:59 vs 00:01 clock cannot change the result)', () => {
    // status takes calendar strings only; the caller derives them with local getters (toISODate).
    expect(expirationStatus(E, '2027-03-15')).toBe(expirationStatus(E, '2027-03-15'));
  });
});

describe('sanitizeMetadata expirationDate', () => {
  it('keeps a valid date, including past dates', () => {
    expect(sanitizeMetadata({ expirationDate: '2020-01-01' }).expirationDate).toBe('2020-01-01');
  });
  it('drops invalid dates (strict, leap-year aware) and missing values', () => {
    expect(sanitizeMetadata({ expirationDate: '2027-02-29' }).expirationDate).toBeNull();
    expect(sanitizeMetadata({ expirationDate: '2028-02-29' }).expirationDate).toBe('2028-02-29');
    expect(sanitizeMetadata({ expirationDate: '2026-13-01' }).expirationDate).toBeNull();
    expect(sanitizeMetadata({}).expirationDate).toBeNull();
  });
});
