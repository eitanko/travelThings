/** Trip (folder) rules shared by the database layer and the UI. */

/** Fixed id so the default trip is created exactly once, even if the migration is somehow re-run. */
export const DEFAULT_TRIP_ID = 'default-my-documents';
export const DEFAULT_TRIP_NAME = 'My Documents';
export const MAX_TRIP_NAME_LENGTH = 100;

/** Trims the name and returns it, or `null` when it is empty. The name is the only trip field. */
export function cleanTripName(input: string): string | null {
  const name = input.trim().slice(0, MAX_TRIP_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

/** Trip names must be unique ignoring case, so the picker never shows two identical choices. */
export function sameTripName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}
