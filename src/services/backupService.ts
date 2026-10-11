import { getDatabase } from '@/db/database';
import { withTransaction } from '@/db/idb';
import { CORE_STORES, STORE_NAMES } from '@/db/schema';
import { getGoal } from '@/repositories/goalsRepository';
import { listOpportunities } from '@/repositories/opportunitiesRepository';
import { listIncomeRecords } from '@/repositories/incomeRepository';
import { listSnapshots } from '@/repositories/snapshotsRepository';
import { listAllocations } from '@/repositories/allocationsRepository';
import { getSettings, putSettings } from '@/repositories/settingsRepository';
import { getMeta, putMeta } from '@/repositories/metaRepository';
import { listTransactions } from '@/repositories/transactionsRepository';
import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION, type BackupData, type BackupFile } from '@/types/backup';
import type { DatabaseMeta } from '@/types/models';
import {
  validateAllocation,
  validateDatabaseMeta,
  validateForecastSnapshot,
  validateIncomeOpportunity,
  validateIncomeRecord,
  validateSavingsGoal,
  validateSettings,
  validateTransaction,
} from '@/domain/validators';
import { calculateNetIncome } from '@/domain/balances';
import { normalizeSettings } from '@/domain/defaults';
import { DB_VERSION } from '@/db/schema';
import { ValidationError } from '@/utils/errors';
import { nextTimestamp } from '@/utils/id';
import { centsToInput } from '@/utils/money';
import { buildTimestampedFilename, downloadTextFile, toCsv } from '@/utils/csv';
import type { VResult } from '@/utils/result';
import { INCOME_SOURCE_LABELS } from '@/types/models';
import type { CsvCell } from '@/types/backup';

export const APP_VERSION = '0.1.0';

export async function buildBackupFile(): Promise<BackupFile> {
  const [goal, opportunities, incomes, transactions, allocations, snapshots, settings] =
    await Promise.all([
      getGoal(),
      listOpportunities(),
      listIncomeRecords(),
      listTransactions(),
      listAllocations(),
      listSnapshots(),
      getSettings(),
    ]);
  const meta = await getMeta();

  const data: BackupData = {
    goals: goal ? [goal] : [],
    opportunities,
    incomes,
    transactions,
    allocations,
    snapshots,
    settings: settings ? [settings] : [],
    meta: [meta],
  };

  return {
    app: BACKUP_APP_ID,
    backupVersion: BACKUP_SCHEMA_VERSION,
    schemaVersion: DB_VERSION,
    exportedAt: nextTimestamp(),
    appVersion: APP_VERSION,
    data,
  };
}

export async function exportBackupJson(): Promise<{ filename: string; file: BackupFile }> {
  const file = await buildBackupFile();
  const filename = buildTimestampedFilename('brz-fund-backup', 'json');
  downloadTextFile(filename, JSON.stringify(file, null, 2), 'application/json');
  const settings = normalizeSettings(await getSettings());
  await putSettings({ ...settings, lastBackupAt: file.exportedAt, updatedAt: nextTimestamp() });
  return { filename, file };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectArray(
  source: Record<string, unknown>,
  key: keyof BackupData,
  validator: (item: unknown) => VResult<unknown>,
  errors: string[],
): unknown[] {
  const raw = source[key];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push(`备份文件字段 ${String(key)} 必须是数组`);
    return [];
  }
  const accepted: unknown[] = [];
  raw.forEach((item, index) => {
    const result = validator(item);
    if (result.ok) {
      accepted.push(item);
    } else {
      errors.push(...result.errors.map((message) => `${String(key)}[${index}]：${message}`));
    }
  });
  return accepted;
}

export interface BackupValidationResult {
  ok: boolean;
  errors: string[];
  data: BackupData | null;
  exportedAt: string | null;
  schemaVersion: number | null;
  counts: Record<string, number> | null;
}

/**
 * 纯函数校验：解析备份文件并检查结构、类型与引用完整性。
 * 任何失败都会在写入数据库之前返回，避免破坏现有数据。
 */
export function validateBackupPayload(payload: unknown): BackupValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['备份内容不是有效的 JSON 对象。'], data: null, exportedAt: null, schemaVersion: null, counts: null };
  }
  if (payload['app'] !== BACKUP_APP_ID) {
    errors.push('这不是 BRZ Fund 的备份文件（app 标识不匹配）。');
  }
  const schemaVersion = typeof payload['schemaVersion'] === 'number' ? payload['schemaVersion'] : null;
  if (schemaVersion === null) {
    errors.push('备份文件缺少 schemaVersion。');
  } else if (schemaVersion > DB_VERSION) {
    errors.push(`备份文件来自更高版本的应用（schema v${schemaVersion}），当前应用无法导入。`);
  }
  const exportedAt = typeof payload['exportedAt'] === 'string' ? payload['exportedAt'] : null;
  if (!exportedAt) errors.push('备份文件缺少导出时间。');

  const dataRaw = payload['data'];
  if (!isPlainObject(dataRaw)) {
    errors.push('备份文件缺少 data 数据段。');
    return { ok: false, errors, data: null, exportedAt, schemaVersion, counts: null };
  }

  const goals = collectArray(dataRaw, 'goals', validateSavingsGoal, errors);
  const opportunities = collectArray(dataRaw, 'opportunities', validateIncomeOpportunity, errors);
  const incomes = collectArray(dataRaw, 'incomes', validateIncomeRecord, errors);
  const transactions = collectArray(dataRaw, 'transactions', validateTransaction, errors);
  const allocations = collectArray(dataRaw, 'allocations', validateAllocation, errors);
  const snapshots = collectArray(dataRaw, 'snapshots', validateForecastSnapshot, errors);
  const settings = collectArray(dataRaw, 'settings', validateSettings, errors);
  const meta = collectArray(dataRaw, 'meta', validateDatabaseMeta, errors);

  const incomeIds = new Set(incomes.map((item) => (item as { id: string }).id));
  const opportunityIds = new Set(opportunities.map((item) => (item as { id: string }).id));

  for (const allocation of allocations) {
    const candidate = allocation as { incomeRecordId: string };
    if (!incomeIds.has(candidate.incomeRecordId)) {
      errors.push(`分配记录引用了不存在的收入记录：${candidate.incomeRecordId}`);
    }
  }
  const incomeTransaction = new Map<string, string>();
  for (const transaction of transactions) {
    const candidate = transaction as { incomeRecordId: string | null; id: string; opportunityId: string | null };
    if (candidate.incomeRecordId) {
      if (!incomeIds.has(candidate.incomeRecordId)) {
        errors.push(`交易记录引用了不存在的收入记录：${candidate.incomeRecordId}`);
      }
      const previous = incomeTransaction.get(candidate.incomeRecordId);
      if (previous) {
        errors.push(`同一笔收入存在多条入账交易（${previous} 与 ${candidate.id}），备份数据不一致。`);
      }
      incomeTransaction.set(candidate.incomeRecordId, candidate.id);
    }
    if (candidate.opportunityId && !opportunityIds.has(candidate.opportunityId)) {
      errors.push(`交易记录引用了不存在的收入机会：${candidate.opportunityId}`);
    }
  }
  for (const income of incomes) {
    const candidate = income as { opportunityId: string | null; id: string };
    if (candidate.opportunityId && !opportunityIds.has(candidate.opportunityId)) {
      errors.push(`收入记录引用了不存在的收入机会：${candidate.opportunityId}`);
    }
  }

  const allocatedTotals = new Map<string, number>();
  for (const allocation of allocations) {
    const candidate = allocation as { incomeRecordId: string; amount: number };
    allocatedTotals.set(
      candidate.incomeRecordId,
      (allocatedTotals.get(candidate.incomeRecordId) ?? 0) + candidate.amount,
    );
  }
  for (const income of incomes) {
    const candidate = income as { id: string; amountReceived: number; directCosts: number };
    const allocated = allocatedTotals.get(candidate.id) ?? 0;
    if (allocated > calculateNetIncome(candidate)) {
      errors.push(`收入记录 ${candidate.id} 的分配总额超过其可分配净额。`);
    }
  }

  if (goals.length > 1) errors.push('备份中包含多份购车目标，数据不一致。');
  if (settings.length > 1) errors.push('备份中包含多份应用设置，数据不一致。');

  const counts = {
    goals: goals.length,
    opportunities: opportunities.length,
    incomes: incomes.length,
    transactions: transactions.length,
    allocations: allocations.length,
    snapshots: snapshots.length,
    settings: settings.length,
  };

  if (errors.length > 0) {
    return { ok: false, errors, data: null, exportedAt, schemaVersion, counts };
  }

  return {
    ok: true,
    errors: [],
    data: {
      goals: goals as BackupData['goals'],
      opportunities: opportunities as BackupData['opportunities'],
      incomes: incomes as BackupData['incomes'],
      transactions: transactions as BackupData['transactions'],
      allocations: allocations as BackupData['allocations'],
      snapshots: snapshots as BackupData['snapshots'],
      settings: settings as BackupData['settings'],
      meta: meta as BackupData['meta'],
    },
    exportedAt,
    schemaVersion,
    counts,
  };
}

export async function parseBackupText(text: string): Promise<BackupValidationResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      errors: ['文件不是有效的 JSON，无法解析。'],
      data: null,
      exportedAt: null,
      schemaVersion: null,
      counts: null,
    };
  }
  return validateBackupPayload(parsed);
}

/** 覆盖式导入：全量替换写入单个事务中，任一步失败则整体回滚。 */
export async function importBackupData(data: BackupData): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, CORE_STORES, 'readwrite', (tx) => {
    for (const storeName of STORE_NAMES) {
      tx.objectStore(storeName).clear();
    }
    for (const goal of data.goals) tx.objectStore('goals').put(goal);
    for (const opportunity of data.opportunities) tx.objectStore('opportunities').put(opportunity);
    for (const income of data.incomes) tx.objectStore('incomes').put(income);
    for (const transaction of data.transactions) tx.objectStore('transactions').put(transaction);
    for (const allocation of data.allocations) tx.objectStore('allocations').put(allocation);
    for (const snapshot of data.snapshots) tx.objectStore('snapshots').put(snapshot);
    for (const settings of data.settings) tx.objectStore('settings').put(settings);

    const fallbackMeta: DatabaseMeta = {
      id: 'meta',
      dbVersion: DB_VERSION,
      migrations: [],
      onboarded: data.incomes.length > 0 || data.goals.length > 0,
      userCleared: false,
      createdAt: nextTimestamp(),
      updatedAt: nextTimestamp(),
    };
    const meta = data.meta[0] ?? fallbackMeta;
    tx.objectStore('meta').put({ ...fallbackMeta, ...meta, dbVersion: DB_VERSION, userCleared: false });
  });
}

export async function importBackupFromText(
  text: string,
  options: { confirmOverwrite: boolean },
): Promise<BackupValidationResult> {
  const validation = await parseBackupText(text);
  if (!validation.ok || !validation.data) return validation;
  if (!options.confirmOverwrite) {
    throw new ValidationError('未确认覆盖现有数据，导入已取消。');
  }
  await importBackupData(validation.data);
  return validation;
}

/** 清空全部业务数据，并写入 userCleared 标记，避免下次启动时被自动初始化。 */
export async function clearAllData(): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, CORE_STORES, 'readwrite', (tx) => {
    for (const storeName of STORE_NAMES) {
      tx.objectStore(storeName).clear();
    }
    const meta: DatabaseMeta = {
      id: 'meta',
      dbVersion: DB_VERSION,
      migrations: [],
      onboarded: false,
      userCleared: true,
      createdAt: nextTimestamp(),
      updatedAt: nextTimestamp(),
    };
    tx.objectStore('meta').put(meta);
  });
}

export interface CsvExportResult {
  filename: string;
  rowCount: number;
}

export async function exportIncomesCsv(): Promise<CsvExportResult> {
  const [incomes, opportunities] = await Promise.all([listIncomeRecords(), listOpportunities()]);
  const opportunityTitles = new Map(opportunities.map((item) => [item.id, item.title]));
  const headers = [
    '到账日期',
    '收入来源',
    '到账金额',
    '直接成本',
    '净收入',
    '工时',
    '关联机会',
    '状态',
    '备注',
  ];
  const rows: CsvCell[][] = incomes
    .slice()
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    .map((income) => [
      income.receivedAt,
      INCOME_SOURCE_LABELS[income.source],
      centsToInput(income.amountReceived),
      centsToInput(income.directCosts),
      centsToInput(calculateNetIncome(income)),
      income.workHours ?? '',
      income.opportunityId ? (opportunityTitles.get(income.opportunityId) ?? '') : '',
      income.voidedAt ? '已作废' : '有效',
      income.note,
    ]);
  const filename = buildTimestampedFilename('brz-fund-income', 'csv');
  downloadTextFile(filename, toCsv(headers, rows), 'text/csv');
  return { filename, rowCount: rows.length };
}

export async function exportTransactionsCsv(): Promise<CsvExportResult> {
  const transactions = await listTransactions();
  const headers = ['交易日期', '类型', '金额', '来源桶', '目标桶', '分类', '状态', '备注'];
  const rows: CsvCell[][] = transactions
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((transaction) => [
      transaction.occurredAt,
      transaction.type,
      centsToInput(transaction.amount),
      transaction.fromBucket ?? '',
      transaction.toBucket,
      transaction.category ?? '',
      transaction.voidedAt ? '已作废' : '有效',
      transaction.note,
    ]);
  const filename = buildTimestampedFilename('brz-fund-transactions', 'csv');
  downloadTextFile(filename, toCsv(headers, rows), 'text/csv');
  return { filename, rowCount: rows.length };
}

export async function saveMetaAfterImport(): Promise<void> {
  const meta = await getMeta();
  await putMeta({ ...meta, onboarded: true, userCleared: false, updatedAt: nextTimestamp() });
}

export async function getLastBackupAt(): Promise<string | null> {
  const settings = await getSettings();
  return settings?.lastBackupAt ?? null;
}
