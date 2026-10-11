import { StorageError, StorageUnavailableError } from '@/utils/errors';

/**
 * 将 IDBRequest 包装为 Promise。
 * 注意：调用方必须在事务回调内「同步」发起请求，且不要在事务中途 await 其他
 * 异步操作，否则事务会自动提交导致后续请求失败（IndexedDB 规范行为）。
 */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => {
      const error = transaction.error ?? new StorageError('IndexedDB 事务被中止');
      reject(error);
    };
    transaction.onerror = () => {
      // 具体错误由 request 级 Promise 抛出；此处仅保证事务级错误也被捕获
    };
  });
}

export function describeStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return new StorageError('浏览器存储空间不足，本次操作未保存。请先导出备份并清理浏览器存储。');
    }
    if (error.name === 'ConstraintError') {
      return new StorageError('数据唯一性冲突，操作被拒绝。');
    }
    if (error.name === 'InvalidStateError') {
      return new StorageError('数据库连接已失效，请刷新页面后重试。');
    }
    return new StorageError(`数据库操作失败：${error.name} - ${error.message}`);
  }
  if (error instanceof Error) return new StorageError(error.message);
  return new StorageError('数据库操作失败');
}

let durabilitySupported: boolean | null = null;

function createTransaction(
  db: IDBDatabase,
  names: string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  if (durabilitySupported !== false) {
    try {
      const transaction = db.transaction(names, mode, { durability: 'strict' });
      durabilitySupported = true;
      return transaction;
    } catch (error) {
      if (durabilitySupported === null && error instanceof TypeError) {
        // 环境不支持 durability 选项，降级后重试一次
        durabilitySupported = false;
      } else {
        throw error;
      }
    }
  }
  return db.transaction(names, mode);
}

/**
 * 在单个事务内执行多个跨表操作：回调内同步发出全部请求，
 * 事务提交（oncomplete）后才 resolve；任一步失败整体回滚。
 */
export async function withTransaction<T>(
  db: IDBDatabase,
  storeNames: string | readonly string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => T,
): Promise<T> {
  const names = typeof storeNames === 'string' ? [storeNames] : [...storeNames];
  let transaction: IDBTransaction;
  try {
    transaction = createTransaction(db, names, mode);
  } catch (error) {
    throw describeStorageError(error);
  }

  // 先建立完成监听，再同步执行回调
  const completion = transactionToPromise(transaction);
  // 回调同步抛错时由事务中止引发 reject，这里先接住避免未处理的拒绝
  completion.catch(() => undefined);
  let result: T;
  try {
    result = run(transaction);
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // 事务可能已经自动结束，忽略
    }
    throw describeStorageError(error);
  }

  await completion;
  return result;
}

/** 在某一对象存储上执行单个读写请求。 */
export function putRecord<T>(transaction: IDBTransaction, storeName: string, value: T): IDBRequest<IDBValidKey> {
  return transaction.objectStore(storeName).put(value);
}

export function addRecord<T>(transaction: IDBTransaction, storeName: string, value: T): IDBRequest<IDBValidKey> {
  return transaction.objectStore(storeName).add(value);
}

export function deleteRecord(transaction: IDBTransaction, storeName: string, key: IDBValidKey): IDBRequest<undefined> {
  return transaction.objectStore(storeName).delete(key);
}

export function clearStore(transaction: IDBTransaction, storeName: string): IDBRequest<undefined> {
  return transaction.objectStore(storeName).clear();
}

export function ensureIndexedDbAvailable(): void {
  if (typeof globalThis.indexedDB === 'undefined') {
    throw new StorageUnavailableError();
  }
}
