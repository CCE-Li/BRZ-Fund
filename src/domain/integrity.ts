import type {
  Allocation,
  Cents,
  IncomeRecord,
  Transaction,
} from '@/types/models';
import {
  ALLOCATION_DESTINATION_LABELS,
  BUCKET_LABELS,
  BUCKETS,
  TRANSACTION_TYPE_LABELS,
} from '@/types/models';
import { calculateBucketBalances, calculateNetIncome } from '@/domain/balances';

export type IntegritySeverity = 'error' | 'warning';

export interface IntegrityIssue {
  severity: IntegritySeverity;
  message: string;
  entity: 'income' | 'allocation' | 'transaction' | 'bucket';
  entityId: string;
}

export interface IntegrityAuditResult {
  issues: IntegrityIssue[];
  errorCount: number;
  warningCount: number;
  checkedAt: string;
  /** 有一个以上带资金的交易记录时才认为数据足以审计。 */
  hasAnyActivity: boolean;
}

export interface IntegrityInput {
  transactions: readonly Transaction[];
  incomeRecords: readonly IncomeRecord[];
  allocations: readonly Allocation[];
}

function verifyAllocations(
  input: IntegrityInput,
  issues: IntegrityIssue[],
): void {
  const incomeById = new Map(input.incomeRecords.map((record) => [record.id, record]));
  const allocatedByIncome = new Map<string, Cents>();

  for (const allocation of input.allocations) {
    const income = incomeById.get(allocation.incomeRecordId);
    if (!income) {
      issues.push({
        severity: 'error',
        message: `分配记录（${ALLOCATION_DESTINATION_LABELS[allocation.destination]} ${allocation.amount / 100} 元）找不到对应的收入记录，属于孤立数据。`,
        entity: 'allocation',
        entityId: allocation.id,
      });
      continue;
    }
    const net = calculateNetIncome(income);
    const total = (allocatedByIncome.get(income.id) ?? 0) + allocation.amount;
    allocatedByIncome.set(income.id, total);
    if (total > net) {
      issues.push({
        severity: 'error',
        message: `收入记录「${income.receivedAt}」的分配总额（${total / 100} 元）超出其可分配净额（${net / 100} 元）。`,
        entity: 'allocation',
        entityId: allocation.id,
      });
    }
  }
}

function verifyIncomeTransactions(
  input: IntegrityInput,
  issues: IntegrityIssue[],
): void {
  const incomeTransactions = new Map<string, Transaction[]>();
  for (const transaction of input.transactions) {
    if (transaction.voidedAt || transaction.type !== 'income') continue;
    if (!transaction.incomeRecordId) continue;
    const bucket = incomeTransactions.get(transaction.incomeRecordId) ?? [];
    bucket.push(transaction);
    incomeTransactions.set(transaction.incomeRecordId, bucket);
  }

  for (const [incomeRecordId, bucket] of incomeTransactions) {
    if (bucket.length > 1) {
      issues.push({
        severity: 'error',
        message: `同一笔收入存在 ${bucket.length} 条入账交易（重复记账）。`,
        entity: 'income',
        entityId: incomeRecordId,
      });
    }
  }

  const incomeById = new Map(input.incomeRecords.map((record) => [record.id, record]));
  for (const income of input.incomeRecords) {
    if (income.voidedAt) continue;
    const linked = income.transactionId ? input.transactions.find((t) => t.id === income.transactionId) : null;
    if (income.transactionId && !linked) {
      issues.push({
        severity: 'error',
        message: `收入记录「${income.receivedAt}」引用的入账交易不存在，余额可能不完整。`,
        entity: 'income',
        entityId: income.id,
      });
      continue;
    }
    if (!linked) {
      issues.push({
        severity: 'warning',
        message: `收入记录「${income.receivedAt}」尚未关联入账交易，未计入现金余额。`,
        entity: 'income',
        entityId: income.id,
      });
      continue;
    }
    if (linked.amount !== calculateNetIncome(income)) {
      issues.push({
        severity: 'warning',
        message: `收入记录「${income.receivedAt}」的入账金额（${linked.amount / 100} 元）与净收入（${calculateNetIncome(income) / 100} 元）不一致。`,
        entity: 'income',
        entityId: income.id,
      });
    }
  }
  void incomeById;
}

function verifyTransactionLinks(
  input: IntegrityInput,
  issues: IntegrityIssue[],
): void {
  const incomeById = new Map(input.incomeRecords.map((record) => [record.id, record]));

  for (const transaction of input.transactions) {
    if (transaction.voidedAt) continue;

    if (transaction.incomeRecordId) {
      const income = incomeById.get(transaction.incomeRecordId);
      if (!income) {
        issues.push({
          severity: 'warning',
          message: `交易「${TRANSACTION_TYPE_LABELS[transaction.type]}」引用的收入记录不存在。`,
          entity: 'transaction',
          entityId: transaction.id,
        });
      } else if (income.transactionId && income.transactionId !== transaction.id && transaction.type === 'income') {
        issues.push({
          severity: 'error',
          message: '收入记录与入账交易的双向引用不一致。',
          entity: 'transaction',
          entityId: transaction.id,
        });
      }
    }

    if (transaction.type === 'transfer' && transaction.fromBucket === transaction.toBucket) {
      issues.push({
        severity: 'error',
        message: '桶间调整的来源与目标相同，不产生任何资金变化。',
        entity: 'transaction',
        entityId: transaction.id,
      });
    }
  }
}

function verifyBucketBalances(input: IntegrityInput, issues: IntegrityIssue[]): void {
  const balances = calculateBucketBalances(input.transactions);
  for (const bucket of BUCKETS) {
    if (balances[bucket] < 0) {
      issues.push({
        severity: 'warning',
        message: `「${BUCKET_LABELS[bucket]}」余额为负数（${balances[bucket] / 100} 元），请检查相关交易或登记一笔修正调整。`,
        entity: 'bucket',
        entityId: bucket,
      });
    }
  }
}

export function auditIntegrity(input: IntegrityInput): IntegrityAuditResult {
  const issues: IntegrityIssue[] = [];
  verifyAllocations(input, issues);
  verifyIncomeTransactions(input, issues);
  verifyTransactionLinks(input, issues);
  verifyBucketBalances(input, issues);

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    checkedAt: new Date().toISOString(),
    hasAnyActivity: input.transactions.some((transaction) => !transaction.voidedAt),
  };
}
