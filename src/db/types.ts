/** Minimal async SQL surface used by the app. Implemented over expo-sqlite in production and node:sqlite in tests. */
export type SqlParam = string | number | null;

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParam[]): Promise<void>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  /** Runs `fn` atomically: commits if it resolves, rolls back if it throws. */
  withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
