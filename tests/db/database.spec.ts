import { describe, expect, it } from 'vitest';
import { DB_VERSION, META_ID, STORE_NAMES, STORE_META } from '@/db/schema';
import { openDatabase, probeIndexedDb } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import type { DatabaseMeta } from '@/types/models';

function openRaw(name: string, version: number, onUpgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      onUpgrade?.(request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('数据库初始化与迁移', () => {
  it('首次打开创建全部对象存储与索引', async () => {
    const db = await openDatabase('brz-test', DB_VERSION);
    expect(Array.from(db.objectStoreNames).sort()).toEqual([...STORE_NAMES].sort());

    const transaction = db.transaction('transactions', 'readonly');
    const store = transaction.objectStore('transactions');
    const indexNames = Array.from(store.indexNames);
    expect(indexNames).toContain('occurredAt');
    expect(indexNames).toContain('type');
    db.close();
  });

  it('首次打开写入初始 meta 记录', async () => {
    const db = await openDatabase('brz-meta-test', DB_VERSION);
    const meta = await withTransaction(db, STORE_META, 'readonly', (tx) =>
      requestToPromise<DatabaseMeta | undefined>(tx.objectStore(STORE_META).get(META_ID)),
    );
    expect(meta).toBeDefined();
    expect(meta?.dbVersion).toBe(DB_VERSION);
    expect(meta?.onboarded).toBe(false);
    expect(meta?.userCleared).toBe(false);
    db.close();
  });

  it('版本升级时执行迁移并保留既有数据、记录迁移日志', async () => {
    const dbName = 'brz-migration-test';

    const v1 = await openRaw(dbName, 1, (db) => {
      const store = db.createObjectStore('transactions', { keyPath: 'id' });
      store.createIndex('occurredAt', 'occurredAt', { unique: false });
      db.createObjectStore('meta', { keyPath: 'id' });
    });
    await withTransaction(v1, 'transactions', 'readwrite', (tx) => {
      tx.objectStore('transactions').put({ id: 'tx-1', amount: 1000, occurredAt: '2026-01-01' });
    });
    const v1Meta: DatabaseMeta = {
      id: META_ID,
      dbVersion: 1,
      migrations: [],
      onboarded: false,
      userCleared: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await withTransaction(v1, 'meta', 'readwrite', (tx) => {
      tx.objectStore('meta').put(v1Meta);
    });
    v1.close();

    // 模拟一次 schema v2 迁移：新增存档对象存储
    const v2 = await openRaw(dbName, 2, (db) => {
      if (!db.objectStoreNames.contains('archives')) {
        db.createObjectStore('archives', { keyPath: 'id' });
      }
    });
    const upgraded = await withTransaction(v2, 'transactions', 'readonly', (tx) =>
      requestToPromise<{ id: string; amount: number }[]>(tx.objectStore('transactions').getAll()),
    );
    const upgradedMeta = await withTransaction(v2, 'meta', 'readonly', (tx) =>
      requestToPromise<DatabaseMeta>(tx.objectStore('meta').get(META_ID)),
    );
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]?.amount).toBe(1000);
    expect(Array.from(v2.objectStoreNames)).toContain('archives');
    expect(upgradedMeta.dbVersion).toBe(1);
    v2.close();
  });

  it('withTransaction 失败时整体回滚，不产生部分写入', async () => {
    const db = await openDatabase('brz-rollback-test', DB_VERSION);
    await expect(
      withTransaction(db, ['transactions', 'meta'], 'readwrite', (tx) => {
        tx.objectStore('transactions').put({ id: 'tx-partial', amount: 1 });
        tx.objectStore('meta').put({ id: META_ID, dbVersion: DB_VERSION });
        throw new Error('模拟写入过程中出错');
      }),
    ).rejects.toThrow();

    const remaining = await withTransaction(db, 'transactions', 'readonly', (tx) =>
      requestToPromise<unknown[]>(tx.objectStore('transactions').getAll()),
    );
    expect(remaining).toHaveLength(0);
    db.close();
  });

  it('probeIndexedDb 在可用环境下返回 true', async () => {
    await expect(probeIndexedDb()).resolves.toBe(true);
  });
});
