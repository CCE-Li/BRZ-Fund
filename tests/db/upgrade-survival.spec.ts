import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, META_ID, STORE_INCOMES, STORE_META, STORE_TRANSACTIONS } from '@/db/schema';
import { openDatabase, resetDatabaseForTests } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { recordIncome, voidIncomeRecord } from '@/services/incomeService';
import { listIncomes } from '@/services/incomeService';
import { listTransactions } from '@/repositories/transactionsRepository';
import { getMeta } from '@/repositories/metaRepository';
import { calculateTotalCash } from '@/domain/balances';
import type { DatabaseMeta, IncomeRecord, Transaction } from '@/types/models';
import type { Migration } from '@/db/schema';

beforeEach(() => {
  resetDatabaseForTests();
});

function openAtVersion(version: number, migrations: readonly Migration[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) return;
      for (const migration of migrations) {
        if (migration.version <= event.oldVersion) continue;
        migration.migrate(db, transaction);
      }
      const metaRequest = transaction.objectStore(STORE_META).get(META_ID);
      metaRequest.onsuccess = () => {
        const current = metaRequest.result as DatabaseMeta | undefined;
        const applied = migrations
          .filter((item) => item.version > event.oldVersion)
          .map((item) => ({
            version: item.version,
            appliedAt: new Date().toISOString(),
            note: item.note,
          }));
        if (current) {
          transaction.objectStore(STORE_META).put({
            ...current,
            dbVersion: version,
            migrations: [...current.migrations, ...applied],
            updatedAt: new Date().toISOString(),
          });
        }
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('升级应用代码后的数据存活（版本迁移）', () => {
  it('v1 数据在 v2 升级后完整保留，并记录迁移日志', async () => {
    // 第一步：v1 应用正常写入数据（模拟「已经在用」的旧版本）
    const v1 = await openDatabase(DB_NAME, 1);
    await withTransaction(v1, [STORE_INCOMES, STORE_TRANSACTIONS], 'readwrite', (tx) => {
      tx.objectStore(STORE_INCOMES).put({
        id: 'income-legacy',
        opportunityId: null,
        source: 'programming',
        amountReceived: 500000,
        directCosts: 20000,
        workHours: 12,
        receivedAt: '2026-05-01',
        currency: 'CNY',
        note: '旧版本记录',
        transactionId: 'tx-legacy',
        voidedAt: null,
        createdAt: '2026-05-01T00:00:00.000Z',
      } satisfies IncomeRecord);
      tx.objectStore(STORE_TRANSACTIONS).put({
        id: 'tx-legacy',
        type: 'income',
        amount: 480000,
        currency: 'CNY',
        category: 'programming',
        note: '旧版本记录',
        occurredAt: '2026-05-01',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        opportunityId: null,
        incomeRecordId: 'income-legacy',
        reversalOfId: null,
        fromBucket: null,
        toBucket: 'unallocated',
        voidedAt: null,
      } satisfies Transaction);
    });
    v1.close();

    // 第二步：新版本应用开工——DB_VERSION 提高，并新增一个迁移
    const v2Migrations: readonly Migration[] = [
      {
        version: 2,
        note: '新增：记账归档对象存储',
        migrate(db) {
          if (!db.objectStoreNames.contains('archives')) {
            db.createObjectStore('archives', { keyPath: 'id' });
          }
        },
      },
    ];
    const v2 = await openAtVersion(2, v2Migrations);

    // 第三步：旧数据仍在，且能正常读取
    const incomes = await withTransaction(v2, STORE_INCOMES, 'readonly', (tx) =>
      requestToPromise<IncomeRecord[]>(tx.objectStore(STORE_INCOMES).getAll()),
    );
    expect(incomes).toHaveLength(1);
    expect(incomes[0]?.amountReceived).toBe(500000);
    expect(incomes[0]?.note).toBe('旧版本记录');

    const transactions = await withTransaction(v2, STORE_TRANSACTIONS, 'readonly', (tx) =>
      requestToPromise<Transaction[]>(tx.objectStore(STORE_TRANSACTIONS).getAll()),
    );
    expect(calculateTotalCash(transactions)).toBe(480000);

    // 结构升级与迁移日志都生效
    expect(Array.from(v2.objectStoreNames)).toContain('archives');
    const meta = await withTransaction(v2, STORE_META, 'readonly', (tx) =>
      requestToPromise<DatabaseMeta>(tx.objectStore(STORE_META).get(META_ID)),
    );
    expect(meta.dbVersion).toBe(2);
    expect(meta.migrations.map((item) => item.version)).toContain(2);
    v2.close();
  });

  it('仅升级代码、不改 schema 版本时，直接复用现有数据库（不触发迁移）', async () => {
    // 旧版本应用写入
    const first = await openDatabase(DB_NAME, 1);
    await withTransaction(first, STORE_TRANSACTIONS, 'readwrite', (tx) => {
      tx.objectStore(STORE_TRANSACTIONS).put({
        id: 'tx-keep',
        type: 'adjustment',
        amount: 12345,
        currency: 'CNY',
        category: null,
        note: '',
        occurredAt: '2026-06-01',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        opportunityId: null,
        incomeRecordId: null,
        reversalOfId: null,
        fromBucket: null,
        toBucket: 'brz',
        voidedAt: null,
      } satisfies Transaction);
    });
    first.close();

    // 同一版本号再次打开（等同于新代码不改 schema）
    const second = await openDatabase(DB_NAME, 1);
    const rows = await withTransaction(second, STORE_TRANSACTIONS, 'readonly', (tx) =>
      requestToPromise<Transaction[]>(tx.objectStore(STORE_TRANSACTIONS).getAll()),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(12345);
    second.close();
  });

  it('发布新版本后继续正常记账（迁移不破坏写入与作废链路）', async () => {
    // 旧版本写过一条记录
    const legacy = await openDatabase(DB_NAME, 1);
    legacy.close();

    // 新版本（同一 DB 版本）继续写
    resetDatabaseForTests();
    const { income } = await recordIncome({
      opportunityId: null,
      source: 'part_time',
      amountReceived: 120000,
      directCosts: 0,
      workHours: 6,
      receivedAt: '2026-07-01',
      note: '新版本写入',
    });
    expect((await listIncomes()).some((row) => row.id === income.id)).toBe(true);
    expect(calculateTotalCash(await listTransactions())).toBe(120000);

    const meta = await getMeta();
    expect(meta.userCleared).toBe(false);

    // 作废链路仍然可用
    await voidIncomeRecord(income.id);
    expect(calculateTotalCash(await listTransactions())).toBe(0);
  });
});
