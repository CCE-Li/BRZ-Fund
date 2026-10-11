import { getDatabase } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { DB_VERSION, META_ID, STORE_META } from '@/db/schema';
import type { DatabaseMeta } from '@/types/models';
import { nextTimestamp } from '@/utils/id';

function createDefaultMeta(): DatabaseMeta {
  const timestamp = nextTimestamp();
  return {
    id: META_ID,
    dbVersion: DB_VERSION,
    migrations: [],
    onboarded: false,
    userCleared: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function getMeta(): Promise<DatabaseMeta> {
  const db = await getDatabase();
  const meta = await withTransaction(db, STORE_META, 'readonly', (transaction) =>
    requestToPromise<DatabaseMeta | undefined>(transaction.objectStore(STORE_META).get(META_ID)),
  );
  return meta ?? createDefaultMeta();
}

export async function putMeta(meta: DatabaseMeta): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_META, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_META).put(meta);
  });
}

export async function updateMeta(patch: Partial<Omit<DatabaseMeta, 'id'>>): Promise<void> {
  const db = await getDatabase();
  const { id: _ignoredId, ...safePatch } = patch as Partial<DatabaseMeta>;
  void _ignoredId;
  await withTransaction(db, STORE_META, 'readwrite', (transaction) => {
    const store = transaction.objectStore(STORE_META);
    const request = store.get(META_ID);
    request.onsuccess = () => {
      const current = request.result as DatabaseMeta | undefined;
      const next: DatabaseMeta = {
        ...createDefaultMeta(),
        ...(current ?? {}),
        ...safePatch,
        id: META_ID,
        updatedAt: nextTimestamp(),
      };
      store.put(next);
    };
  });
}
