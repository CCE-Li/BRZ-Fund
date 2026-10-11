import type { AppSettings } from '@/types/models';

export const DB_NAME = 'brz-fund';
export const DB_VERSION = 1;

export const STORE_GOALS = 'goals';
export const STORE_OPPORTUNITIES = 'opportunities';
export const STORE_INCOMES = 'incomes';
export const STORE_TRANSACTIONS = 'transactions';
export const STORE_ALLOCATIONS = 'allocations';
export const STORE_SNAPSHOTS = 'snapshots';
export const STORE_SETTINGS = 'settings';
export const STORE_META = 'meta';

export const STORE_NAMES: readonly string[] = [
  STORE_GOALS,
  STORE_OPPORTUNITIES,
  STORE_INCOMES,
  STORE_TRANSACTIONS,
  STORE_ALLOCATIONS,
  STORE_SNAPSHOTS,
  STORE_SETTINGS,
  STORE_META,
];

export const GOAL_CURRENT_ID = 'current' as const;
export const SETTINGS_APP_ID: AppSettings['id'] = 'app';
export const META_ID = 'meta' as const;

export interface StoreSpec {
  name: string;
  keyPath: string;
  indexes: ReadonlyArray<{ name: string; keyPath: string | string[]; unique: boolean }>;
}

export const SCHEMA_V1: readonly StoreSpec[] = [
  {
    name: STORE_GOALS,
    keyPath: 'id',
    indexes: [{ name: 'updatedAt', keyPath: 'updatedAt', unique: false }],
  },
  {
    name: STORE_OPPORTUNITIES,
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'source', keyPath: 'source', unique: false },
      { name: 'updatedAt', keyPath: 'updatedAt', unique: false },
    ],
  },
  {
    name: STORE_INCOMES,
    keyPath: 'id',
    indexes: [
      { name: 'opportunityId', keyPath: 'opportunityId', unique: false },
      { name: 'receivedAt', keyPath: 'receivedAt', unique: false },
      // 唯一索引：每笔收入至多关联一条入账交易，从存储层拦截重复入账
      { name: 'transactionId', keyPath: 'transactionId', unique: true },
    ],
  },
  {
    name: STORE_TRANSACTIONS,
    keyPath: 'id',
    indexes: [
      { name: 'occurredAt', keyPath: 'occurredAt', unique: false },
      { name: 'type', keyPath: 'type', unique: false },
      { name: 'incomeRecordId', keyPath: 'incomeRecordId', unique: false },
      { name: 'opportunityId', keyPath: 'opportunityId', unique: false },
    ],
  },
  {
    name: STORE_ALLOCATIONS,
    keyPath: 'id',
    indexes: [
      { name: 'incomeRecordId', keyPath: 'incomeRecordId', unique: false },
      { name: 'destination', keyPath: 'destination', unique: false },
      { name: 'allocatedAt', keyPath: 'allocatedAt', unique: false },
    ],
  },
  {
    name: STORE_SNAPSHOTS,
    keyPath: 'id',
    indexes: [{ name: 'createdAt', keyPath: 'createdAt', unique: false }],
  },
  {
    name: STORE_SETTINGS,
    keyPath: 'id',
    indexes: [],
  },
  {
    name: STORE_META,
    keyPath: 'id',
    indexes: [],
  },
];

export interface Migration {
  version: number;
  note: string;
  migrate: (db: IDBDatabase, transaction: IDBTransaction) => void;
}

/**
 * 逐版本迁移注册表。每个条目的 version 表示「升级到该版本时要执行的操作」。
 * 新增 schema 变更时：DB_VERSION +1，并在数组末尾追加一条同版本号迁移。
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    note: '初始 schema：创建全部对象存储与索引',
    migrate(db, transaction) {
      for (const spec of SCHEMA_V1) {
        const store = db.createObjectStore(spec.name, { keyPath: spec.keyPath });
        for (const index of spec.indexes) {
          store.createIndex(index.name, index.keyPath, { unique: index.unique });
        }
      }
      void transaction;
    },
  },
];

export function applySpecs(
  db: IDBDatabase,
  transaction: IDBTransaction,
  specs: readonly StoreSpec[],
): void {
  for (const spec of specs) {
    const store = transaction.objectStore(spec.name);
    for (const index of spec.indexes) {
      if (store.indexNames.contains(index.name)) continue;
      store.createIndex(index.name, index.keyPath, { unique: index.unique });
    }
    void db;
  }
}

/** 跨表写入涉及的对象存储集合（收入到账、分配、导入等原子操作）。 */
export const CORE_STORES: readonly string[] = [
  STORE_GOALS,
  STORE_OPPORTUNITIES,
  STORE_INCOMES,
  STORE_TRANSACTIONS,
  STORE_ALLOCATIONS,
  STORE_SNAPSHOTS,
  STORE_SETTINGS,
  STORE_META,
];

export function isStoreName(value: string): boolean {
  return STORE_NAMES.includes(value);
}
