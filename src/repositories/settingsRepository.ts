import { getDatabase } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { SETTINGS_APP_ID, STORE_SETTINGS } from '@/db/schema';
import type { AppSettings } from '@/types/models';

export async function getSettings(): Promise<AppSettings | null> {
  const db = await getDatabase();
  const settings = await withTransaction(db, STORE_SETTINGS, 'readonly', (transaction) =>
    requestToPromise<AppSettings | undefined>(
      transaction.objectStore(STORE_SETTINGS).get(SETTINGS_APP_ID),
    ),
  );
  return settings ?? null;
}

export async function putSettings(settings: AppSettings): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_SETTINGS, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_SETTINGS).put(settings);
  });
}

export async function bulkPutSettings(records: AppSettings[]): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_SETTINGS, 'readwrite', (transaction) => {
    const store = transaction.objectStore(STORE_SETTINGS);
    for (const record of records) store.put(record);
  });
}
