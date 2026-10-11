import { getDatabase } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { STORE_OPPORTUNITIES } from '@/db/schema';
import type { IncomeOpportunity } from '@/types/models';

export async function listOpportunities(): Promise<IncomeOpportunity[]> {
  const db = await getDatabase();
  return withTransaction(db, STORE_OPPORTUNITIES, 'readonly', (transaction) =>
    requestToPromise<IncomeOpportunity[]>(transaction.objectStore(STORE_OPPORTUNITIES).getAll()),
  );
}

export async function getOpportunity(id: string): Promise<IncomeOpportunity | null> {
  const db = await getDatabase();
  const value = await withTransaction(db, STORE_OPPORTUNITIES, 'readonly', (transaction) =>
    requestToPromise<IncomeOpportunity | undefined>(
      transaction.objectStore(STORE_OPPORTUNITIES).get(id),
    ),
  );
  return value ?? null;
}

export async function putOpportunity(record: IncomeOpportunity): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_OPPORTUNITIES, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_OPPORTUNITIES).put(record);
  });
}

export async function bulkPutOpportunities(records: IncomeOpportunity[]): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_OPPORTUNITIES, 'readwrite', (transaction) => {
    const store = transaction.objectStore(STORE_OPPORTUNITIES);
    for (const record of records) store.put(record);
  });
}

export async function removeOpportunity(id: string): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_OPPORTUNITIES, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_OPPORTUNITIES).delete(id);
  });
}
