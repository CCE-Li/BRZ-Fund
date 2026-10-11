import { getDatabase } from '@/db/database';
import { withTransaction } from '@/db/idb';
import { STORE_INCOMES, STORE_TRANSACTIONS } from '@/db/schema';
import {
  getTransaction,
  listTransactions,
  putTransaction,
} from '@/repositories/transactionsRepository';
import { getIncomeRecord } from '@/repositories/incomeRepository';
import { listAllocationsByIncome } from '@/repositories/allocationsRepository';
import type { Bucket, Cents, DateString, IncomeRecord, Transaction, TransactionType } from '@/types/models';
import { BUCKET_LABELS, TRANSACTION_TYPE_LABELS } from '@/types/models';
import { validateTransaction } from '@/domain/validators';
import { loadSettings } from '@/services/settingsService';
import { ConflictError, NotFoundError, ValidationError } from '@/utils/errors';
import { createId, nextTimestamp } from '@/utils/id';
import { isNonNegativeCents } from '@/utils/money';
import { isValidDateString } from '@/utils/date';

/** 除入账交易外，其余交易类型都允许用户手动创建/修改。 */
export type ManualTransactionType = Exclude<TransactionType, 'income'>;

export interface TransactionDraft {
  type: ManualTransactionType;
  amount: Cents;
  category: string | null;
  note: string;
  occurredAt: DateString;
  fromBucket: Bucket | null;
  toBucket: Bucket;
}

export async function listAllTransactions(): Promise<Transaction[]> {
  const records = await listTransactions();
  return records.sort(
    (a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt),
  );
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  return getTransaction(id);
}

export function describeTransaction(transaction: Transaction): string {
  const typeLabel = TRANSACTION_TYPE_LABELS[transaction.type];
  if (transaction.type === 'transfer') {
    const from = transaction.fromBucket ? BUCKET_LABELS[transaction.fromBucket] : '外部';
    return `${from} → ${BUCKET_LABELS[transaction.toBucket]}`;
  }
  if (transaction.type === 'adjustment') {
    return `${typeLabel}（${BUCKET_LABELS[transaction.toBucket]}）`;
  }
  return typeLabel;
}

function validateDraft(draft: TransactionDraft): void {
  const errors: string[] = [];
  if (!isNonNegativeCents(draft.amount) || draft.amount <= 0) {
    errors.push('金额必须是大于 0 的整数分');
  }
  if (!isValidDateString(draft.occurredAt)) errors.push('交易日期无效');
  switch (draft.type) {
    case 'expense':
      if (!draft.category) errors.push('支出必须填写分类');
      break;
    case 'transfer':
      if (!draft.fromBucket) errors.push('桶间调整必须指定来源资金桶');
      if (draft.fromBucket === draft.toBucket) errors.push('桶间调整的来源与目标不能相同');
      break;
    default:
      break;
  }
  if (errors.length > 0) throw new ValidationError(errors.join('；'), errors);
}

export async function createTransaction(draft: TransactionDraft): Promise<Transaction> {
  validateDraft(draft);
  const settings = await loadSettings();
  const timestamp = nextTimestamp();
  const record: Transaction = {
    id: createId(),
    type: draft.type,
    amount: draft.amount,
    currency: settings.currency,
    category: draft.category,
    note: draft.note,
    occurredAt: draft.occurredAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    opportunityId: null,
    incomeRecordId: null,
    reversalOfId: null,
    fromBucket: draft.fromBucket,
    toBucket: draft.toBucket,
    voidedAt: null,
  };
  const validation = validateTransaction(record);
  if (!validation.ok) throw new ValidationError(validation.errors.join('；'), validation.errors);

  const db = await getDatabase();
  await withTransaction(db, STORE_TRANSACTIONS, 'readwrite', (tx) => {
    tx.objectStore(STORE_TRANSACTIONS).add(record);
  });
  return record;
}

/** 允许就地修改的字段：金额与日期一经登记不可修改，保证账本可追溯。 */
export interface TransactionMetaPatch {
  category?: string | null;
  note?: string;
}

export async function updateTransactionMeta(
  id: string,
  patch: TransactionMetaPatch,
): Promise<Transaction> {
  const existing = await getTransaction(id);
  if (!existing) throw new NotFoundError('交易记录不存在或已被删除。');
  if (existing.voidedAt) throw new ConflictError('已作废的交易不能再修改。');

  const next: Transaction = {
    ...existing,
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    updatedAt: nextTimestamp(),
  };
  const validation = validateTransaction(next);
  if (!validation.ok) throw new ValidationError(validation.errors.join('；'), validation.errors);

  await putTransaction(next);
  return next;
}

/**
 * 作废交易。若交易关联收入记录，则要求先撤销相关分配，并同步作废收入记录，
 * 避免出现「收入记录仍在、现金却已扣除」的不一致状态。
 */
export async function voidTransaction(id: string, options: { force?: boolean } = {}): Promise<void> {
  const existing = await getTransaction(id);
  if (!existing) throw new NotFoundError('交易记录不存在或已被删除。');
  if (existing.voidedAt) throw new ConflictError('该交易已经作废。');

  if (existing.incomeRecordId && !options.force) {
    throw new ConflictError('该交易由收入到账自动生成，请通过作废对应的收入记录来冲销。');
  }

  const timestamp = nextTimestamp();

  if (existing.incomeRecordId) {
    const income = await getIncomeRecord(existing.incomeRecordId);
    if (income && !income.voidedAt) {
      const allocations = await listAllocationsByIncome(income.id);
      if (allocations.length > 0) {
        throw new ConflictError('该收入仍存在分配记录，请先撤销分配后再作废。');
      }
      await withTransaction(
        await getDatabase(),
        [STORE_TRANSACTIONS, STORE_INCOMES],
        'readwrite',
        (tx) => {
          tx.objectStore(STORE_TRANSACTIONS).put({
            ...existing,
            voidedAt: timestamp,
            updatedAt: timestamp,
          } satisfies Transaction);
          tx.objectStore(STORE_INCOMES).put({ ...income, voidedAt: timestamp } satisfies IncomeRecord);
        },
      );
      return;
    }
  }

  await putTransaction({ ...existing, voidedAt: timestamp, updatedAt: timestamp });
}

export function transactionTypeLabel(type: TransactionType): string {
  return TRANSACTION_TYPE_LABELS[type];
}
