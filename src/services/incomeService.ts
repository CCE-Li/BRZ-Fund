import { getDatabase } from '@/db/database';
import { withTransaction } from '@/db/idb';
import { STORE_INCOMES, STORE_OPPORTUNITIES, STORE_TRANSACTIONS } from '@/db/schema';
import {
  findIncomeByTransactionId,
  getIncomeRecord,
  listIncomeRecords,
  listIncomeRecordsByOpportunity,
} from '@/repositories/incomeRepository';
import { getTransaction } from '@/repositories/transactionsRepository';
import type {
  Cents,
  DateString,
  IncomeOpportunity,
  IncomeRecord,
  IncomeSource,
  OpportunityStatus,
  Transaction,
} from '@/types/models';
import { validateIncomeRecord, validateTransaction } from '@/domain/validators';
import { loadSettings } from '@/services/settingsService';
import { ConflictError, NotFoundError, ValidationError } from '@/utils/errors';
import { createId, nextTimestamp } from '@/utils/id';
import { isNonNegativeCents } from '@/utils/money';
import { isValidDateString } from '@/utils/date';

export interface IncomeDraft {
  opportunityId: string | null;
  source: IncomeSource;
  amountReceived: Cents;
  directCosts: Cents;
  workHours: number | null;
  receivedAt: DateString;
  note: string;
}

export interface RecordIncomeResult {
  income: IncomeRecord;
  transaction: Transaction;
}

export async function listIncomes(): Promise<IncomeRecord[]> {
  const records = await listIncomeRecords();
  return records.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.createdAt.localeCompare(a.createdAt));
}

export async function listIncomesForOpportunity(opportunityId: string): Promise<IncomeRecord[]> {
  const records = await listIncomeRecordsByOpportunity(opportunityId);
  return records.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function getIncomeById(id: string): Promise<IncomeRecord | null> {
  return getIncomeRecord(id);
}

function validateDraft(draft: IncomeDraft): void {
  const errors: string[] = [];
  if (!isNonNegativeCents(draft.amountReceived)) errors.push('到账金额必须是非负整数分');
  if (!isNonNegativeCents(draft.directCosts)) errors.push('直接成本必须是非负整数分');
  if (isNonNegativeCents(draft.amountReceived) && isNonNegativeCents(draft.directCosts)) {
    if (draft.directCosts > draft.amountReceived) errors.push('直接成本不能大于到账金额');
  }
  if (draft.workHours !== null && (!Number.isFinite(draft.workHours) || draft.workHours < 0)) {
    errors.push('工时必须是非负数');
  }
  if (!isValidDateString(draft.receivedAt)) errors.push('到账日期无效');
  if (errors.length > 0) throw new ValidationError(errors.join('；'), errors);
}

/**
 * 登记真实到账收入：在同一个 IndexedDB 事务内创建收入记录与入账交易。
 * 入账交易记录的是「扣除直接成本后的净额」，因此直接成本只会被扣除一次。
 */
export async function recordIncome(draft: IncomeDraft): Promise<RecordIncomeResult> {
  validateDraft(draft);
  const settings = await loadSettings();
  const timestamp = nextTimestamp();
  const transactionId = createId();

  // 只读兜底检查：迁移/手工导入的数据可能破坏「一笔收入 ≤ 一条入账交易」的不变量
  const existingLink = await findIncomeByTransactionId(transactionId);
  if (existingLink) {
    throw new ConflictError('检测到重复的入账交易标识，请重试。');
  }

  const income: IncomeRecord = {
    id: createId(),
    opportunityId: draft.opportunityId,
    source: draft.source,
    amountReceived: draft.amountReceived,
    directCosts: draft.directCosts,
    workHours: draft.workHours,
    receivedAt: draft.receivedAt,
    currency: settings.currency,
    note: draft.note,
    transactionId,
    voidedAt: null,
    createdAt: timestamp,
  };

  const netAmount = draft.amountReceived - draft.directCosts;
  const transaction: Transaction = {
    id: transactionId,
    type: 'income',
    amount: netAmount,
    currency: settings.currency,
    category: draft.source,
    note: draft.note,
    occurredAt: draft.receivedAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    opportunityId: draft.opportunityId,
    incomeRecordId: income.id,
    reversalOfId: null,
    fromBucket: null,
    toBucket: 'unallocated',
    voidedAt: null,
  };

  const incomeValidation = validateIncomeRecord(income);
  if (!incomeValidation.ok) {
    throw new ValidationError(incomeValidation.errors.join('；'), incomeValidation.errors);
  }
  const transactionValidation = validateTransaction(transaction);
  if (!transactionValidation.ok) {
    throw new ValidationError(transactionValidation.errors.join('；'), transactionValidation.errors);
  }

  const db = await getDatabase();
  await withTransaction(db, [STORE_INCOMES, STORE_TRANSACTIONS], 'readwrite', (tx) => {
    tx.objectStore(STORE_INCOMES).add(income);
    tx.objectStore(STORE_TRANSACTIONS).add(transaction);
  });

  if (draft.opportunityId) {
    await markOpportunityPaidOnIncome(draft.opportunityId);
  }

  return { income, transaction };
}

const PRE_PAID_STATUSES: readonly OpportunityStatus[] = [
  'identified',
  'applied',
  'negotiating',
  'in_progress',
  'completed_unpaid',
];

/**
 * 收到款项后把机会推进为「已到账」。这是由真实资金事件驱动的状态推进，
 * 不经过「机会状态机」的人工流转校验（用户可从未申请状态直接收款）。
 */
async function markOpportunityPaidOnIncome(opportunityId: string): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_OPPORTUNITIES, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_OPPORTUNITIES);
    const request = store.get(opportunityId);
    request.onsuccess = () => {
      const opportunity = request.result as IncomeOpportunity | undefined;
      if (!opportunity) return;
      if (!PRE_PAID_STATUSES.includes(opportunity.status)) return;
      store.put({ ...opportunity, status: 'paid', updatedAt: nextTimestamp() } satisfies IncomeOpportunity);
    };
  });
}

/**
 * 作废一笔收入记录：同一事务内把收入记录与其入账交易一并标记作废，
 * 交易与记录都不会被物理删除，保留完整审计痕迹，余额随之回退。
 */
export async function voidIncomeRecord(incomeId: string): Promise<void> {
  const income = await getIncomeRecord(incomeId);
  if (!income) throw new NotFoundError('收入记录不存在或已被删除。');
  if (income.voidedAt) throw new ConflictError('该收入记录已经作废，无需重复操作。');

  const timestamp = nextTimestamp();
  const transaction = income.transactionId ? await getTransaction(income.transactionId) : null;

  await withTransaction(await getDatabase(), [STORE_INCOMES, STORE_TRANSACTIONS], 'readwrite', (tx) => {
    tx.objectStore(STORE_INCOMES).put({ ...income, voidedAt: timestamp } satisfies IncomeRecord);
    if (transaction && !transaction.voidedAt) {
      tx.objectStore(STORE_TRANSACTIONS).put({
        ...transaction,
        voidedAt: timestamp,
        updatedAt: timestamp,
      } satisfies Transaction);
    }
  });
}

/** 为缺少入账交易的收入记录补建交易（用于导入旧数据或修复不一致）。 */
export async function ensureIncomeTransaction(incomeId: string): Promise<Transaction | null> {
  const income = await getIncomeRecord(incomeId);
  if (!income) throw new NotFoundError('收入记录不存在或已被删除。');
  if (income.voidedAt) return null;
  if (income.transactionId) {
    const existing = await getTransaction(income.transactionId);
    if (existing) return existing;
  }

  const timestamp = nextTimestamp();
  const transactionId = createId();
  const transaction: Transaction = {
    id: transactionId,
    type: 'income',
    amount: income.amountReceived - income.directCosts,
    currency: income.currency,
    category: income.source,
    note: income.note,
    occurredAt: income.receivedAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    opportunityId: income.opportunityId,
    incomeRecordId: income.id,
    reversalOfId: null,
    fromBucket: null,
    toBucket: 'unallocated',
    voidedAt: null,
  };

  const db = await getDatabase();
  await withTransaction(db, [STORE_INCOMES, STORE_TRANSACTIONS], 'readwrite', (tx) => {
    tx.objectStore(STORE_TRANSACTIONS).add(transaction);
    tx.objectStore(STORE_INCOMES).put({ ...income, transactionId } satisfies IncomeRecord);
  });
  return transaction;
}
