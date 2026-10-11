import { getDatabase } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { STORE_TRANSACTIONS } from '@/db/schema';
import type { Transaction } from '@/types/models';

export async function listTransactions(): Promise<Transaction[]> {
  const db = await getDatabase();
  return withTransaction(db, STORE_TRANSACTIONS, 'readonly', (transaction) =>
    requestToPromise<Transaction[]>(transaction.objectStore(STORE_TRANSACTIONS).getAll()),
  );
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const db = await getDatabase();
  const value = await withTransaction(db, STORE_TRANSACTIONS, 'readonly', (transaction) =>
    requestToPromise<Transaction | undefined>(transaction.objectStore(STORE_TRANSACTIONS).get(id)),
  );
  return value ?? null;
}

export async function putTransaction(record: Transaction): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_TRANSACTIONS, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_TRANSACTIONS).put(record);
  });
}

export async function bulkPutTransactions(records: Transaction[]): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_TRANSACTIONS, 'readwrite', (transaction) => {
    const store = transaction.objectStore(STORE_TRANSACTIONS);
    for (const record of records) store.put(record);
  });
}

export async function removeTransaction(id: string): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_TRANSACTIONS, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_TRANSACTIONS).delete(id);
  });
}
