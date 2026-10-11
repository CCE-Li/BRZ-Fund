import { DB_NAME, DB_VERSION, META_ID, MIGRATIONS, STORE_META } from '@/db/schema';
import { ensureIndexedDbAvailable } from '@/db/idb';
import type { DatabaseMeta } from '@/types/models';
import { nowIso } from '@/utils/id';
import { StorageError, StorageUnavailableError, toErrorMessage } from '@/utils/errors';

function isDatabaseMeta(value: unknown): value is DatabaseMeta {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DatabaseMeta>;
  return candidate.id === META_ID && typeof candidate.dbVersion === 'number';
}

function createDefaultMeta(): DatabaseMeta {
  const timestamp = nowIso();
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

function runUpgrade(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number): void {
  for (const migration of MIGRATIONS) {
    if (migration.version <= oldVersion) continue;
    migration.migrate(db, transaction);
  }

  const metaRequest = transaction.objectStore(STORE_META).get(META_ID);
  metaRequest.onsuccess = () => {
    const existing = metaRequest.result as unknown;
    if (isDatabaseMeta(existing)) {
      const next: DatabaseMeta = {
        ...existing,
        dbVersion: DB_VERSION,
        migrations: [
          ...existing.migrations,
          ...MIGRATIONS.filter((item) => item.version > oldVersion).map((item) => ({
            version: item.version,
            appliedAt: nowIso(),
            note: item.note,
          })),
        ],
        updatedAt: nowIso(),
      };
      transaction.objectStore(STORE_META).put(next);
      return;
    }
    const meta = createDefaultMeta();
    meta.migrations = MIGRATIONS.filter((item) => item.version > oldVersion).map((item) => ({
      version: item.version,
      appliedAt: nowIso(),
      note: item.note,
    }));
    transaction.objectStore(STORE_META).put(meta);
  };
}

/**
 * 打开数据库。首次创建或版本升级时在同一 versionchange 事务内执行迁移，
 * 并写入迁移日志；失败时抛出错误，绝不静默创建空库覆盖既有数据。
 */
export function openDatabase(name: string = DB_NAME, version: number = DB_VERSION): Promise<IDBDatabase> {
  ensureIndexedDbAvailable();
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, version);
    } catch (error) {
      reject(
        error instanceof StorageUnavailableError
          ? error
          : new StorageError(`数据库打开失败：${toErrorMessage(error)}`),
      );
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) return;
      try {
        runUpgrade(db, transaction, event.oldVersion);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // 忽略
        }
        reject(error instanceof Error ? error : new StorageError(String(error)));
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };

    request.onerror = () => {
      reject(new StorageError(`数据库打开失败：${toErrorMessage(request.error)}`));
    };

    request.onblocked = () => {
      // 其它标签页仍占用旧版本连接；保持等待，不强制关闭
    };
  });
}

/** 功能探针：真正尝试打开一个临时库，用于识别隐私模式等场景下的禁用。 */
export async function probeIndexedDb(): Promise<boolean> {
  if (typeof globalThis.indexedDB === 'undefined') return false;
  const probeName = `brz-fund-probe-${Date.now()}`;
  try {
    const request = indexedDB.open(probeName, 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore('probe', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('probe failed'));
      request.onblocked = () => reject(new Error('probe blocked'));
    });
    db.close();
    indexedDB.deleteDatabase(probeName);
    return true;
  } catch {
    return false;
  }
}

let databasePromise: Promise<IDBDatabase> | null = null;

/** 进程内单例连接；失败后不缓存错误，允许后续重试。 */
export function getDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export function resetDatabaseForTests(): void {
  databasePromise = null;
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    if (!navigator.storage || typeof navigator.storage.persisted !== 'function') return false;
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export interface StorageEstimateInfo {
  usageInBytes: number | null;
  quotaInBytes: number | null;
}

export async function estimateStorage(): Promise<StorageEstimateInfo> {
  try {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
      return { usageInBytes: null, quotaInBytes: null };
    }
    const estimate = await navigator.storage.estimate();
    return {
      usageInBytes: typeof estimate.usage === 'number' ? estimate.usage : null,
      quotaInBytes: typeof estimate.quota === 'number' ? estimate.quota : null,
    };
  } catch {
    return { usageInBytes: null, quotaInBytes: null };
  }
}

/** 请求持久化存储许可；应仅在用户手势中调用。 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return null;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export { DB_NAME, DB_VERSION, STORE_META, META_ID };
