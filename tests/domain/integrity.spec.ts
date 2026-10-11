import { describe, expect, it } from 'vitest';
import { auditIntegrity } from '@/domain/integrity';
import { createAllocation, createIncomeRecord, createIncomeTransaction, createTransaction } from '../factories';

describe('auditIntegrity（跨表一致性审计）', () => {
  it('空数据没有任何问题', () => {
    const result = auditIntegrity({ transactions: [], incomeRecords: [], allocations: [] });
    expect(result.issues).toEqual([]);
    expect(result.hasAnyActivity).toBe(false);
  });

  it('数据完全一致时不报错', () => {
    const income = createIncomeRecord({
      id: 'income-1',
      amountReceived: 100000,
      directCosts: 0,
      transactionId: 'tx-1',
    });
    const transaction = createIncomeTransaction(100000, '2026-01-10', 'tx-1');
    transaction.incomeRecordId = 'income-1';
    const allocation = createAllocation({ incomeRecordId: 'income-1', amount: 60000 });
    const result = auditIntegrity({
      transactions: [transaction],
      incomeRecords: [income],
      allocations: [allocation],
    });
    expect(result.issues).toEqual([]);
  });

  it('检出同一笔收入的重复入账交易', () => {
    const income = createIncomeRecord({ id: 'income-2', transactionId: 'tx-a' });
    const txA = createIncomeTransaction(100000, '2026-01-10', 'tx-a');
    txA.incomeRecordId = 'income-2';
    const txB = createIncomeTransaction(100000, '2026-01-10', 'tx-b');
    txB.incomeRecordId = 'income-2';
    const result = auditIntegrity({
      transactions: [txA, txB],
      incomeRecords: [income],
      allocations: [],
    });
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.message.includes('重复记账'))).toBe(true);
  });

  it('检出分配总额超过可分配净额', () => {
    const income = createIncomeRecord({
      id: 'income-3',
      amountReceived: 100000,
      directCosts: 20000,
    });
    const allocations = [
      createAllocation({ incomeRecordId: 'income-3', amount: 50000 }),
      createAllocation({ incomeRecordId: 'income-3', amount: 40000 }),
    ];
    const result = auditIntegrity({ transactions: [], incomeRecords: [income], allocations });
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.message.includes('超出'))).toBe(true);
  });

  it('检出孤立分配（引用的收入不存在）', () => {
    const result = auditIntegrity({
      transactions: [],
      incomeRecords: [],
      allocations: [createAllocation({ incomeRecordId: 'missing-income' })],
    });
    expect(result.issues.some((issue) => issue.entity === 'allocation')).toBe(true);
  });

  it('提示尚未关联入账交易的收入记录（不计入余额）', () => {
    const income = createIncomeRecord({ id: 'income-4', transactionId: null });
    const result = auditIntegrity({ transactions: [], incomeRecords: [income], allocations: [] });
    expect(result.warningCount).toBe(1);
    expect(result.issues[0]?.message).toContain('尚未关联入账交易');
  });

  it('检出桶间调整来源与目标相同', () => {
    const transaction = createTransaction({
      type: 'transfer',
      amount: 1000,
      fromBucket: 'brz',
      toBucket: 'brz',
      occurredAt: '2026-01-10',
    });
    const result = auditIntegrity({
      transactions: [transaction],
      incomeRecords: [],
      allocations: [],
    });
    expect(result.issues.some((issue) => issue.message.includes('来源与目标相同'))).toBe(true);
  });

  it('提示出现负余额的资金桶', () => {
    const transaction = createTransaction({
      type: 'brz_withdraw',
      amount: 50000,
      fromBucket: 'brz',
      toBucket: 'unallocated',
      occurredAt: '2026-01-10',
    });
    const result = auditIntegrity({
      transactions: [transaction],
      incomeRecords: [],
      allocations: [],
    });
    expect(result.issues.some((issue) => issue.message.includes('负数'))).toBe(true);
  });

  it('入账金额与净收入不一致时给出警告', () => {
    const income = createIncomeRecord({
      id: 'income-5',
      amountReceived: 100000,
      directCosts: 20000,
      transactionId: 'tx-mismatch',
    });
    const transaction = createIncomeTransaction(100000, '2026-01-10', 'tx-mismatch');
    transaction.incomeRecordId = 'income-5';
    const result = auditIntegrity({
      transactions: [transaction],
      incomeRecords: [income],
      allocations: [],
    });
    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.message.includes('不一致'))).toBe(true);
  });
});
