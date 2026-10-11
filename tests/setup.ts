import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';

// 每个用例使用全新的内存数据库实例，避免用例之间互相污染。
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
