import { getDatabase } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { STORE_ALLOCATIONS } from '@/db/schema';
import type { Allocation } from '@/types/models';

export async function listAllocations(): Promise<Allocation[]> {
  const db = await getDatabase();
  return withTransaction(db, STORE_ALLOCATIONS, 'readonly', (transaction) =>
    requestToPromise<Allocation[]>(transaction.objectStore(STORE_ALLOCATIONS).getAll()),
  );
}

export async function listAllocationsByIncome(incomeRecordId: string): Promise<Allocation[]> {
  const db = await getDatabase();
  return withTransaction(db, STORE_ALLOCATIONS, 'readonly', (transaction) =>
    requestToPromise<Allocation[]>(
      transaction.objectStore(STORE_ALLOCATIONS).index('incomeRecordId').getAll(incomeRecordId),
    ),
  );
}

export async function putAllocation(record: Allocation): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_ALLOCATIONS, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_ALLOCATIONS).put(record);
  });
}

export async function removeAllocation(id: string): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_ALLOCATIONS, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_ALLOCATIONS).delete(id);
  });
}

export async function bulkPutAllocations(records: Allocation[]): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_ALLOCATIONS, 'readwrite', (transaction) => {
    const store = transaction.objectStore(STORE_ALLOCATIONS);
    for (const record of records) store.put(record);
  });
}
