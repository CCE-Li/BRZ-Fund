import { getDatabase } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { STORE_SNAPSHOTS } from '@/db/schema';
import type { ForecastSnapshot } from '@/types/models';

export async function listSnapshots(): Promise<ForecastSnapshot[]> {
  const db = await getDatabase();
  return withTransaction(db, STORE_SNAPSHOTS, 'readonly', (transaction) =>
    requestToPromise<ForecastSnapshot[]>(transaction.objectStore(STORE_SNAPSHOTS).getAll()),
  );
}

export async function putSnapshot(record: ForecastSnapshot): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_SNAPSHOTS, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_SNAPSHOTS).put(record);
  });
}

export async function bulkPutSnapshots(records: ForecastSnapshot[]): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_SNAPSHOTS, 'readwrite', (transaction) => {
    const store = transaction.objectStore(STORE_SNAPSHOTS);
    for (const record of records) store.put(record);
  });
}

export async function removeSnapshot(id: string): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_SNAPSHOTS, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_SNAPSHOTS).delete(id);
  });
}
