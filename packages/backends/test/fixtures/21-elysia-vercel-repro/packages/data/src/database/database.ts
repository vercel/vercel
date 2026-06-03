import { AsyncLocalStorage } from 'async_hooks';
import { createDrizzleClient } from './drizzleClient';
import type { DrizzleDatabase, DrizzleDatabaseTransaction } from './drizzleClient';

// Top-level instantiation at module-load time, mirroring azzapp's pattern.
// This forces @planetscale/database (transitive workspace dep) to be
// resolvable at the moment data's index.cjs is loaded.
const drizzleClient = createDrizzleClient();

const transactionStorage = new AsyncLocalStorage<DrizzleDatabaseTransaction>();
const usePrimaryStorage = new AsyncLocalStorage<boolean>();

export const db = (): DrizzleDatabase => {
  return transactionStorage.getStore() ?? drizzleClient;
};

export const runWithPrimary = async <T>(
  callback: () => Promise<T>,
): Promise<T> => usePrimaryStorage.run(true, callback);

export const transaction = async <T>(
  callback: (tx: { rollback(): void }) => Promise<T>,
): Promise<T> =>
  db().transaction(tx => {
    return new Promise<T>((resolve, reject) => {
      transactionStorage.run(tx, () => {
        callback(tx).then(resolve, reject);
      });
    });
  });
