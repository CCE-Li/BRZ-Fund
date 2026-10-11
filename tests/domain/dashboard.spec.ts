import { describe, expect, it } from 'vitest';
import {
  buildDashboardSnapshot,
  activeIncomes,
  activeTransactions,
  openOpportunityCount,
  pendingPaymentOpportunities,
  recentTransactions,
  totalNetIncome,
} from '@/domain/dashboard';
import { createDefaultSettings } from '@/domain/defaults';
import {
  createAdjustment,
  createGoal,
  createIncomeRecord,
  createIncomeTransaction,
  createOpportunity,
  createTransaction,
  createTransfer,
} from '../factories';

const settings = createDefaultSettings();
const meta = {
  id: 'meta' as const,
  dbVersion: 1,
  migrations: [],
  onboarded: true,
  userCleared: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const REFERENCE = new Date(2026, 6, 15);

describe('buildDashboardSnapshot（Dashboard 视图模型）', () => {
  it('空数据时各指标为 0 且提示无活动', () => {
    const snapshot = buildDashboardSnapshot({
      goal: null,
      transactions: [],
      incomes: [],
      opportunities: [],
      allocations: [],
      settings,
      meta,
      reference: REFERENCE,
    });
    expect(snapshot.summary.totalCash).toBe(0);
    expect(snapshot.summary.fundBalance).toBe(0);
    expect(snapshot.summary.estimate.status).toBe('unavailable');
    expect(snapshot.audit.hasAnyActivity).toBe(false);
    expect(snapshot.usage.transactionCount).toBe(0);
  });

  it('预计收入不参与任何余额或储蓄速度计算', () => {
    const opportunity = createOpportunity({
      status: 'in_progress',
      estimatedGrossMin: 500000,
      estimatedGrossMax: 900000,
    });
    const snapshot = buildDashboardSnapshot({
      goal: createGoal(),
      transactions: [],
      incomes: [],
      opportunities: [opportunity],
      allocations: [],
      settings,
      meta,
      reference: REFERENCE,
    });
    expect(snapshot.summary.totalCash).toBe(0);
    expect(snapshot.summary.savingsReport.windows.every((window) => window.average === 0)).toBe(true);
    expect(snapshot.usage.opportunityCount).toBe(1);
  });

  it('真实收入 + 转入购车基金后余额与进度正确', () => {
    const transactions = [
      createIncomeTransaction(500000, '2026-04-10'),
      createTransfer('brz_transfer', 300000, '2026-04-11'),
    ];
    const snapshot = buildDashboardSnapshot({
      goal: createGoal(),
      transactions,
      incomes: [],
      opportunities: [],
      allocations: [],
      settings,
      meta,
      reference: REFERENCE,
    });
    expect(snapshot.summary.fundBalance).toBe(300000);
    expect(snapshot.summary.totalCash).toBe(500000);
    expect(snapshot.summary.unallocatedBalance).toBe(200000);
    expect(snapshot.usage.transactionCount).toBe(2);
  });

  it('作废交易不计入统计', () => {
    const transactions = [
      createIncomeTransaction(100000, '2026-05-01'),
      createTransaction({
        type: 'expense',
        amount: 50000,
        occurredAt: '2026-05-02',
        voidedAt: '2026-05-03T00:00:00.000Z',
      }),
    ];
    const snapshot = buildDashboardSnapshot({
      goal: createGoal(),
      transactions,
      incomes: [],
      opportunities: [],
      allocations: [],
      settings,
      meta,
      reference: REFERENCE,
    });
    expect(snapshot.summary.totalCash).toBe(100000);
    expect(snapshot.usage.transactionCount).toBe(1);
  });

  it('审计结果随数据变化：检出分配超额', () => {
    const income = createIncomeRecord({ id: 'income-x', amountReceived: 10000, directCosts: 0 });
    const snapshot = buildDashboardSnapshot({
      goal: createGoal(),
      transactions: [],
      incomes: [income],
      opportunities: [],
      allocations: [
        {
          id: 'a1',
          incomeRecordId: 'income-x',
          destination: 'brz',
          amount: 20000,
          allocatedAt: '2026-05-01',
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      settings,
      meta,
      reference: REFERENCE,
    });
    expect(snapshot.audit.errorCount).toBeGreaterThan(0);
  });

  it('最近记录按日期倒序且限制条数', () => {
    const transactions = [
      createAdjustment('brz', 100, '2026-01-01'),
      createAdjustment('brz', 200, '2026-03-01'),
      createAdjustment('brz', 300, '2026-02-01'),
    ];
    const recent = recentTransactions(transactions, 2);
    expect(recent.map((item) => item.occurredAt)).toEqual(['2026-03-01', '2026-02-01']);
  });
});

describe('选择器', () => {
  it('activeTransactions 过滤作废并按日期升序', () => {
    const list = activeTransactions([
      createAdjustment('brz', 1, '2026-02-01'),
      createAdjustment('brz', 2, '2026-01-01'),
      createTransaction({ occurredAt: '2026-03-01', voidedAt: '2026-03-02T00:00:00.000Z' }),
    ]);
    expect(list.map((item) => item.occurredAt)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('activeIncomes 过滤作废收入', () => {
    const list = activeIncomes([
      createIncomeRecord({ receivedAt: '2026-01-01' }),
      createIncomeRecord({ receivedAt: '2026-02-01', voidedAt: '2026-02-02T00:00:00.000Z' }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.receivedAt).toBe('2026-01-01');
  });

  it('totalNetIncome 使用净额并忽略作废记录', () => {
    const total = totalNetIncome([
      createIncomeRecord({ amountReceived: 100000, directCosts: 25000 }),
      createIncomeRecord({ amountReceived: 50000, directCosts: 0, voidedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(total).toBe(75000);
  });

  it('pendingPaymentOpportunities 只保留已完工未付款并可按结算日排序', () => {
    const list = pendingPaymentOpportunities([
      createOpportunity({ status: 'completed_unpaid', expectedPaymentDate: '2026-09-01' }),
      createOpportunity({ status: 'completed_unpaid', expectedPaymentDate: '2026-08-01' }),
      createOpportunity({ status: 'in_progress' }),
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]?.expectedPaymentDate).toBe('2026-08-01');
  });

  it('openOpportunityCount 统计进行中的机会', () => {
    expect(
      openOpportunityCount([
        createOpportunity({ status: 'identified' }),
        createOpportunity({ status: 'applied' }),
        createOpportunity({ status: 'negotiating' }),
        createOpportunity({ status: 'in_progress' }),
        createOpportunity({ status: 'paid' }),
        createOpportunity({ status: 'rejected' }),
        createOpportunity({ status: 'cancelled' }),
      ]),
    ).toBe(4);
  });
});
