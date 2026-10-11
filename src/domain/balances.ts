import type { Bucket, Cents, IncomeRecord, Transaction } from '@/types/models';
import { BUCKETS } from '@/types/models';
import { sumCents } from '@/utils/money';

export type BucketBalances = Record<Bucket, Cents>;

export const EMPTY_BUCKET_BALANCES: BucketBalances = {
  unallocated: 0,
  brz: 0,
  emergency: 0,
  other: 0,
};

function normalizeCents(value: number): Cents {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/**
 * 单笔交易对资金桶的净影响。这是全部余额计算的唯一入口：
 * 收入计入目标桶；支出从来源桶扣除；修正型调整按 from/to 桶移动；
 * 转账与支出在同一聚合器中处理，因此「账户间移动」永不会被当作新增收入。
 */
export function transactionBucketDelta(transaction: Transaction): BucketBalances {
  const delta: BucketBalances = { ...EMPTY_BUCKET_BALANCES };
  if (transaction.voidedAt) return delta;

  const amount = normalizeCents(transaction.amount);
  if (amount === 0) return delta;

  switch (transaction.type) {
    case 'income':
      delta[transaction.toBucket] += amount;
      break;
    case 'expense':
      delta[transaction.fromBucket ?? 'unallocated'] -= amount;
      break;
    case 'brz_withdraw':
    case 'emergency_withdraw':
      delta[transaction.fromBucket ?? 'unallocated'] -= amount;
      delta[transaction.toBucket] += amount;
      break;
    case 'brz_transfer':
      delta.unallocated -= amount;
      delta.brz += amount;
      break;
    case 'emergency_transfer':
      delta.unallocated -= amount;
      delta.emergency += amount;
      break;
    case 'transfer': {
      const from = transaction.fromBucket ?? 'unallocated';
      const to = transaction.toBucket;
      if (from === to) break;
      delta[from] -= amount;
      delta[to] += amount;
      break;
    }
    case 'adjustment': {
      const from = transaction.fromBucket;
      const to = transaction.toBucket;
      if (from) delta[from] -= amount;
      if (to) delta[to] += amount;
      break;
    }
    default:
      break;
  }

  return delta;
}

/** 当前各资金桶余额（不含已作废交易）。 */
export function calculateBucketBalances(transactions: readonly Transaction[]): BucketBalances {
  const balances: BucketBalances = { ...EMPTY_BUCKET_BALANCES };
  for (const transaction of transactions) {
    const delta = transactionBucketDelta(transaction);
    for (const bucket of BUCKETS) {
      balances[bucket] += delta[bucket];
    }
  }
  return balances;
}

export function calculateBrzFundBalance(transactions: readonly Transaction[]): Cents {
  return calculateBucketBalances(transactions).brz;
}

export function calculateEmergencyFundBalance(transactions: readonly Transaction[]): Cents {
  return calculateBucketBalances(transactions).emergency;
}

export function calculateTotalCash(transactions: readonly Transaction[]): Cents {
  const balances = calculateBucketBalances(transactions);
  return sumCents(BUCKETS.map((bucket) => balances[bucket]));
}

export function calculateNetIncome(record: Pick<IncomeRecord, 'amountReceived' | 'directCosts'>): Cents {
  return normalizeCents(record.amountReceived) - normalizeCents(record.directCosts);
}

/**
 * 未分配可用余额：尚未指明用途的现金。
 * 它等于全部桶余额中的 unallocated（已作废交易与作废收入记录均不参与）。
 */
export function calculateAvailableBalance(
  transactions: readonly Transaction[],
  incomeRecords: readonly IncomeRecord[] = [],
): Cents {
  void incomeRecords;
  return calculateBucketBalances(transactions).unallocated;
}

/** 某一时点（含当日）的累计桶余额，用于绘制资金增长曲线。 */
export function calculateBucketBalancesAt(
  transactions: readonly Transaction[],
  date: string,
): BucketBalances {
  return calculateBucketBalances(transactions.filter((item) => item.occurredAt <= date));
}

export interface BucketMovement {
  inbound: Cents;
  outbound: Cents;
}

/** 汇总每个桶的流入与流出总量，用于报表展示。 */
export function calculateBucketMovements(
  transactions: readonly Transaction[],
): Record<Bucket, BucketMovement> {
  const movements: Record<Bucket, BucketMovement> = {
    unallocated: { inbound: 0, outbound: 0 },
    brz: { inbound: 0, outbound: 0 },
    emergency: { inbound: 0, outbound: 0 },
    other: { inbound: 0, outbound: 0 },
  };
  for (const transaction of transactions) {
    const delta = transactionBucketDelta(transaction);
    for (const bucket of BUCKETS) {
      if (delta[bucket] > 0) movements[bucket].inbound += delta[bucket];
      if (delta[bucket] < 0) movements[bucket].outbound += -delta[bucket];
    }
  }
  return movements;
}

export function earliestTransactionDate(transactions: readonly Transaction[]): string | null {
  let earliest: string | null = null;
  for (const transaction of transactions) {
    if (transaction.voidedAt) continue;
    if (earliest === null || transaction.occurredAt < earliest) {
      earliest = transaction.occurredAt;
    }
  }
  return earliest;
}
