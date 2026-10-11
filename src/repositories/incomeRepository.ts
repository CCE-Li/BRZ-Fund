import { getDatabase } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { STORE_INCOMES } from '@/db/schema';
import type { IncomeRecord } from '@/types/models';

export async function listIncomeRecords(): Promise<IncomeRecord[]> {
  const db = await getDatabase();
  return withTransaction(db, STORE_INCOMES, 'readonly', (transaction) =>
    requestToPromise<IncomeRecord[]>(transaction.objectStore(STORE_INCOMES).getAll()),
  );
}

export async function getIncomeRecord(id: string): Promise<IncomeRecord | null> {
  const db = await getDatabase();
  const value = await withTransaction(db, STORE_INCOMES, 'readonly', (transaction) =>
    requestToPromise<IncomeRecord | undefined>(transaction.objectStore(STORE_INCOMES).get(id)),
  );
  return value ?? null;
}

export async function listIncomeRecordsByOpportunity(opportunityId: string): Promise<IncomeRecord[]> {
  const db = await getDatabase();
  return withTransaction(db, STORE_INCOMES, 'readonly', (transaction) =>
    requestToPromise<IncomeRecord[]>(
      transaction.objectStore(STORE_INCOMES).index('opportunityId').getAll(opportunityId),
    ),
  );
}

export async function findIncomeByTransactionId(transactionId: string): Promise<IncomeRecord | null> {
  const db = await getDatabase();
  const value = await withTransaction(db, STORE_INCOMES, 'readonly', (transaction) =>
    requestToPromise<IncomeRecord | undefined>(
      transaction.objectStore(STORE_INCOMES).index('transactionId').get(transactionId),
    ),
  );
  return value ?? null;
}

export async function putIncomeRecord(record: IncomeRecord): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_INCOMES, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_INCOMES).put(record);
  });
}

export async function bulkPutIncomeRecords(records: IncomeRecord[]): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_INCOMES, 'readwrite', (transaction) => {
    const store = transaction.objectStore(STORE_INCOMES);
    for (const record of records) store.put(record);
  });
}

export async function removeIncomeRecord(id: string): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_INCOMES, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_INCOMES).delete(id);
  });
}
