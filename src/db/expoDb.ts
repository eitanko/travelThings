import * as SQLite from 'expo-sqlite';
import { migrate } from './migrations';
import type { Db, SqlParam } from './types';

type Executor = Pick<SQLite.SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

function wrap(exec: Executor, db: SQLite.SQLiteDatabase): Db {
  return {
    execAsync: (sql) => exec.execAsync(sql),
    runAsync: async (sql, params = []) => {
      await exec.runAsync(sql, params as SqlParam[]);
    },
    getAllAsync: <T,>(sql: string, params: SqlParam[] = []) => exec.getAllAsync<T>(sql, params),
    getFirstAsync: <T,>(sql: string, params: SqlParam[] = []) => exec.getFirstAsync<T>(sql, params),
    withTransaction: async <T,>(fn: (tx: Db) => Promise<T>): Promise<T> => {
      let result!: T;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(wrap(txn, db));
      });
      return result;
    },
  };
}

export async function openDatabase(): Promise<Db> {
  const raw = await SQLite.openDatabaseAsync('travelthings.db');
  await raw.execAsync('PRAGMA journal_mode = WAL;');
  const db = wrap(raw, raw);
  await migrate(db);
  return db;
}
