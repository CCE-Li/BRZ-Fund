import { describe, expect, it } from 'vitest';
import {
  calculateAvailableBalance,
  calculateBrzFundBalance,
  calculateBucketBalances,
  calculateBucketBalancesAt,
  calculateEmergencyFundBalance,
  calculateNetIncome,
  calculateTotalCash,
  earliestTransactionDate,
  transactionBucketDelta,
} from '@/domain/balances';
import {
  createAdjustment,
  createGenericTransfer,
  createIncomeRecord,
  createIncomeTransaction,
  createTransaction,
  createTransfer,
  createWithdraw,
} from '../factories';

describe('transactionBucketDelta（单笔交易影响）', () => {
  it('收入计入指定桶', () => {
    const delta = transactionBucketDelta(createIncomeTransaction(5000, '2026-01-10'));
    expect(delta.unallocated).toBe(5000);
    expect(delta.brz).toBe(0);
  });

  it('支出从未指定来源时从「未分配」扣除', () => {
    const delta = transactionBucketDelta(
      createTransaction({ type: 'expense', amount: 1200, occurredAt: '2026-01-10' }),
    );
    expect(delta.unallocated).toBe(-1200);
  });

  it('转入购车基金是从未分配资金移动，不产生新收入', () => {
    const delta = transactionBucketDelta(createTransfer('brz_transfer', 10000, '2026-01-10'));
    expect(delta.unallocated).toBe(-10000);
    expect(delta.brz).toBe(10000);
  });

  it('从应急金取出回流到未分配资金', () => {
    const delta = transactionBucketDelta(createWithdraw('emergency_withdraw', 3000, '2026-01-10'));
    expect(delta.emergency).toBe(-3000);
    expect(delta.unallocated).toBe(3000);
  });

  it('桶间调整保持总额不变', () => {
    const delta = transactionBucketDelta(createGenericTransfer('brz', 'emergency', 5000, '2026-01-10'));
    expect(delta.brz).toBe(-5000);
    expect(delta.emergency).toBe(5000);
  });

  it('外部调整可使总现金增加（用于期初/误差修正）', () => {
    const delta = transactionBucketDelta(createAdjustment('brz', 100000, '2026-01-10', null));
    expect(delta.brz).toBe(100000);
  });

  it('作废交易不产生任何影响', () => {
    const delta = transactionBucketDelta(
      createTransaction({ type: 'expense', amount: 999, voidedAt: '2026-02-01T00:00:00.000Z' }),
    );
    expect(delta).toEqual({ unallocated: 0, brz: 0, emergency: 0, other: 0 });
  });
});

describe('资金桶余额聚合', () => {
  it('从零余额开始：收入 − 支出 − 存入购车基金', () => {
    const transactions = [
      createIncomeTransaction(300000, '2026-01-05'),
      createTransaction({ type: 'expense', amount: 50000, occurredAt: '2026-01-08' }),
      createTransfer('brz_transfer', 200000, '2026-01-10'),
    ];
    const balances = calculateBucketBalances(transactions);
    expect(balances.unallocated).toBe(50000);
    expect(balances.brz).toBe(200000);
    expect(calculateTotalCash(transactions)).toBe(250000);
  });

  it('已有部分购车资金时余额正确累加', () => {
    const transactions = [
      createIncomeTransaction(100000, '2026-01-05'),
      createTransfer('brz_transfer', 100000, '2026-01-06'),
      createIncomeTransaction(200000, '2026-02-05'),
      createTransfer('brz_transfer', 150000, '2026-02-06'),
    ];
    expect(calculateBrzFundBalance(transactions)).toBe(250000);
    expect(calculateAvailableBalance(transactions)).toBe(50000);
  });

  it('转账不被计为新收入（总额守恒）', () => {
    const income = createIncomeTransaction(100000, '2026-01-05');
    const onlyIncome = [income];
    const withTransfers = [
      income,
      createGenericTransfer('unallocated', 'brz', 30000, '2026-01-06'),
      createGenericTransfer('brz', 'emergency', 10000, '2026-01-07'),
      createTransfer('emergency_transfer', 5000, '2026-01-08'),
    ];
    expect(calculateTotalCash(withTransfers)).toBe(calculateTotalCash(onlyIncome));
    expect(calculateBrzFundBalance(withTransfers)).toBe(20000);
    expect(calculateEmergencyFundBalance(withTransfers)).toBe(15000);
    expect(calculateAvailableBalance(withTransfers)).toBe(65000);
  });

  it('删除（作废）交易后余额正确回退', () => {
    const transactions = [
      createIncomeTransaction(100000, '2026-01-05'),
      createTransfer('brz_transfer', 60000, '2026-01-06'),
    ];
    expect(calculateBrzFundBalance(transactions)).toBe(60000);

    const afterRemoval = transactions.filter((item) => item.id !== transactions[1]?.id);
    expect(calculateBrzFundBalance(afterRemoval)).toBe(0);
    expect(calculateAvailableBalance(afterRemoval)).toBe(100000);
  });

  it('作废后的交易不再影响任何余额', () => {
    const transactions = [
      createIncomeTransaction(100000, '2026-01-05'),
      createTransaction({
        type: 'expense',
        amount: 20000,
        occurredAt: '2026-01-07',
        voidedAt: '2026-01-20T00:00:00.000Z',
      }),
    ];
    expect(calculateAvailableBalance(transactions)).toBe(100000);
  });

  it('其它用途资金可以被单独统计', () => {
    const transactions = [
      createIncomeTransaction(100000, '2026-01-05'),
      createGenericTransfer('unallocated', 'other', 25000, '2026-01-06'),
    ];
    const balances = calculateBucketBalances(transactions);
    expect(balances.other).toBe(25000);
    expect(balances.unallocated).toBe(75000);
  });
});

describe('calculateNetIncome（直接成本只扣一次）', () => {
  it('净收入 = 到账金额 − 直接成本', () => {
    expect(calculateNetIncome(createIncomeRecord({ amountReceived: 150000, directCosts: 23500 }))).toBe(
      126500,
    );
  });

  it('没有直接成本时净收入等于到账金额', () => {
    expect(calculateNetIncome(createIncomeRecord({ amountReceived: 88800, directCosts: 0 }))).toBe(88800);
  });

  it('入账交易金额与净收入一致时不会重复扣除成本', () => {
    const record = createIncomeRecord({ amountReceived: 100000, directCosts: 20000 });
    const net = calculateNetIncome(record);
    const transactions = [createIncomeTransaction(net, record.receivedAt)];
    expect(calculateTotalCash(transactions)).toBe(80000);
    expect(calculateNetIncome(record)).toBe(80000);
  });
});

describe('calculateBucketBalancesAt（时点余额）', () => {
  it('只统计指定日期（含当日）之前的交易', () => {
    const transactions = [
      createIncomeTransaction(100000, '2026-01-05'),
      createTransfer('brz_transfer', 60000, '2026-02-10'),
      createTransfer('brz_transfer', 40000, '2026-03-10'),
    ];
    expect(calculateBucketBalancesAt(transactions, '2026-01-31').brz).toBe(0);
    expect(calculateBucketBalancesAt(transactions, '2026-02-10').brz).toBe(60000);
    expect(calculateBucketBalancesAt(transactions, '2026-03-31').brz).toBe(100000);
  });
});

describe('earliestTransactionDate', () => {
  it('忽略作废交易', () => {
    const transactions = [
      createTransaction({ occurredAt: '2025-12-01', voidedAt: '2026-01-01T00:00:00.000Z' }),
      createIncomeTransaction(1000, '2026-01-15'),
    ];
    expect(earliestTransactionDate(transactions)).toBe('2026-01-15');
  });

  it('没有有效交易时返回 null', () => {
    expect(earliestTransactionDate([])).toBeNull();
  });
});
