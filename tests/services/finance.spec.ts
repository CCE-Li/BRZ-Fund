import { beforeEach, describe, expect, it } from 'vitest';
import { listTransactions } from '@/repositories/transactionsRepository';
import { listIncomeRecords } from '@/repositories/incomeRepository';
import {
  createTransaction,
  listAllTransactions,
  updateTransactionMeta,
  voidTransaction,
} from '@/services/transactionService';
import {
  getIncomeById,
  listIncomes,
  recordIncome,
  voidIncomeRecord,
} from '@/services/incomeService';
import { allocateIncome, listForIncome, reverseAllocation } from '@/services/allocationService';
import { createOpportunity, listAllOpportunities } from '@/services/opportunityService';
import { loadFinancialSummary } from '@/services/forecastService';
import { loadSettings, applySettingsPatch } from '@/services/settingsService';
import { calculateTotalCash } from '@/domain/balances';
import { resetDatabaseForTests } from '@/db/database';

beforeEach(() => {
  resetDatabaseForTests();
});

describe('settingsService', () => {
  it('首次读取返回默认设置且不写入数据库', async () => {
    const settings = await loadSettings();
    expect(settings.currency).toBe('CNY');
    expect(settings.allocationRatios).toEqual({ brz: 75, emergency: 15, other: 10 });
    expect(settings.lastBackupAt).toBeNull();
  });

  it('更新设置会持久化并保留其他字段', async () => {
    await applySettingsPatch({ currency: 'USD', emergencyTarget: 500000 });
    const settings = await loadSettings();
    expect(settings.currency).toBe('USD');
    expect(settings.emergencyTarget).toBe(500000);
    expect(settings.allocationRatios.brz).toBe(75);
  });

  it('拒绝非法的应急储备目标', async () => {
    await expect(applySettingsPatch({ emergencyTarget: -1 })).rejects.toThrow();
  });
});

describe('recordIncome（收入到账）', () => {
  it('原子创建收入记录与入账交易，金额为扣除直接成本后的净额', async () => {
    const result = await recordIncome({
      opportunityId: null,
      source: 'programming',
      amountReceived: 100000,
      directCosts: 23500,
      workHours: 8,
      receivedAt: '2026-07-10',
      note: '小程序外包第一笔',
    });

    expect(result.income.amountReceived).toBe(100000);
    expect(result.income.directCosts).toBe(23500);
    expect(result.transaction.amount).toBe(76500);
    expect(result.income.transactionId).toBe(result.transaction.id);

    const transactions = await listTransactions();
    expect(transactions).toHaveLength(1);
    expect(calculateTotalCash(transactions)).toBe(76500);
  });

  it('预计收入（机会估算）不会被写入任何交易记录', async () => {
    const opportunity = await createOpportunity({
      title: '预计能拿到的大单',
      source: 'programming',
      estimatedGrossMin: 500000,
      estimatedGrossMax: 800000,
      probability: 50,
      estimatedHours: 40,
      expectedPaymentDate: '2026-09-01',
      notes: '',
    });
    const transactions = await listTransactions();
    expect(transactions).toHaveLength(0);

    const summary = await loadFinancialSummary(new Date(2026, 6, 20));
    expect(summary.totalCash).toBe(0);
    expect(summary.fundBalance).toBe(0);
    expect(opportunity.estimatedGrossMax).toBe(800000);
  });

  it('拒绝直接成本大于到账金额', async () => {
    await expect(
      recordIncome({
        opportunityId: null,
        source: 'other',
        amountReceived: 1000,
        directCosts: 2000,
        workHours: null,
        receivedAt: '2026-07-10',
        note: '',
      }),
    ).rejects.toThrow();
  });

  it('拒绝非法到账日期与负数金额', async () => {
    await expect(
      recordIncome({
        opportunityId: null,
        source: 'other',
        amountReceived: 1000,
        directCosts: 0,
        workHours: null,
        receivedAt: '2026-02-30',
        note: '',
      }),
    ).rejects.toThrow();
    await expect(
      recordIncome({
        opportunityId: null,
        source: 'other',
        amountReceived: -100,
        directCosts: 0,
        workHours: null,
        receivedAt: '2026-07-10',
        note: '',
      }),
    ).rejects.toThrow();
  });

  it('作废收入后金额回退，交易与记录都保留（软作废）', async () => {
    const { income } = await recordIncome({
      opportunityId: null,
      source: 'part_time',
      amountReceived: 80000,
      directCosts: 0,
      workHours: 6,
      receivedAt: '2026-07-11',
      note: '',
    });
    const before = await listTransactions();
    expect(calculateTotalCash(before)).toBe(80000);

    await voidIncomeRecord(income.id);

    const after = await listTransactions();
    expect(after).toHaveLength(1);
    expect(after[0]?.voidedAt).not.toBeNull();
    expect(calculateTotalCash(after)).toBe(0);

    const records = await listIncomeRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.voidedAt).not.toBeNull();
  });

  it('重复作废同一笔收入会被拒绝', async () => {
    const { income } = await recordIncome({
      opportunityId: null,
      source: 'other',
      amountReceived: 5000,
      directCosts: 0,
      workHours: null,
      receivedAt: '2026-07-12',
      note: '',
    });
    await voidIncomeRecord(income.id);
    await expect(voidIncomeRecord(income.id)).rejects.toThrow();
  });

  it('列表按到账日期倒序排列', async () => {
    await recordIncome({
      opportunityId: null,
      source: 'other',
      amountReceived: 1000,
      directCosts: 0,
      workHours: null,
      receivedAt: '2026-06-01',
      note: '早',
    });
    await recordIncome({
      opportunityId: null,
      source: 'other',
      amountReceived: 2000,
      directCosts: 0,
      workHours: null,
      receivedAt: '2026-07-01',
      note: '晚',
    });
    const incomes = await listIncomes();
    expect(incomes[0]?.receivedAt).toBe('2026-07-01');
  });

  it('关联机会的收到款项会把机会状态推进到已到账', async () => {
    const opportunity = await createOpportunity({
      title: '接单',
      source: 'programming',
      estimatedGrossMin: null,
      estimatedGrossMax: null,
      probability: null,
      estimatedHours: null,
      expectedPaymentDate: null,
      notes: '',
    });
    await recordIncome({
      opportunityId: opportunity.id,
      source: 'programming',
      amountReceived: 60000,
      directCosts: 0,
      workHours: 5,
      receivedAt: '2026-07-13',
      note: '',
    });
    const opportunities = await listAllOpportunities();
    expect(opportunities[0]?.status).toBe('paid');
  });
});

describe('allocateIncome（资金分配）', () => {
  async function seedIncome(amount = 100000): Promise<string> {
    const { income } = await recordIncome({
      opportunityId: null,
      source: 'programming',
      amountReceived: amount,
      directCosts: 0,
      workHours: null,
      receivedAt: '2026-07-10',
      note: '',
    });
    return income.id;
  }

  it('按比例分配并持久化，可继续分配剩余额度', async () => {
    const incomeId = await seedIncome(100000);
    const drafts = await allocateIncome(incomeId, {
      kind: 'ratio',
      ratios: { brz: 75, emergency: 15, other: 10 },
    });
    expect(drafts).toHaveLength(3);
    expect(drafts.reduce((acc, item) => acc + item.amount, 0)).toBe(100000);

    const persisted = await listForIncome(incomeId);
    expect(persisted).toHaveLength(3);
  });

  it('同一笔收入重复分配且超额时被拒绝，且不产生任何写入', async () => {
    const incomeId = await seedIncome(100000);
    await allocateIncome(incomeId, { kind: 'amounts', amounts: { brz: 100000 } });

    await expect(
      allocateIncome(incomeId, { kind: 'amounts', amounts: { brz: 1 } }),
    ).rejects.toThrow();

    const persisted = await listForIncome(incomeId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.amount).toBe(100000);
  });

  it('撤销分配后额度被释放，可以重新分配', async () => {
    const incomeId = await seedIncome(100000);
    const drafts = await allocateIncome(incomeId, { kind: 'amounts', amounts: { brz: 60000 } });
    await reverseAllocation(drafts[0]?.id ?? '');
    expect(await listForIncome(incomeId)).toHaveLength(0);

    const again = await allocateIncome(incomeId, { kind: 'amounts', amounts: { brz: 90000 } });
    expect(again[0]?.amount).toBe(90000);
  });

  it('作废的收入不能继续分配', async () => {
    const incomeId = await seedIncome(100000);
    await voidIncomeRecord(incomeId);
    await expect(
      allocateIncome(incomeId, { kind: 'ratio', ratios: { brz: 1, emergency: 0, other: 0 } }),
    ).rejects.toThrow();
  });

  it('分配不会改变现金总额（只是用途划分）', async () => {
    const incomeId = await seedIncome(100000);
    await allocateIncome(incomeId, { kind: 'ratio', ratios: { brz: 75, emergency: 15, other: 10 } });
    const transactions = await listTransactions();
    expect(calculateTotalCash(transactions)).toBe(100000);
  });
});

describe('transactionService（支出 / 转账 / 调整）', () => {
  it('创建支出并从未分配资金扣除', async () => {
    await recordIncome({
      opportunityId: null,
      source: 'other',
      amountReceived: 50000,
      directCosts: 0,
      workHours: null,
      receivedAt: '2026-07-01',
      note: '',
    });
    await createTransaction({
      type: 'expense',
      amount: 12000,
      category: '图书',
      note: '技术书',
      occurredAt: '2026-07-05',
      fromBucket: null,
      toBucket: 'unallocated',
    });
    const transactions = await listTransactions();
    expect(calculateTotalCash(transactions)).toBe(38000);
  });

  it('支出必须填写分类', async () => {
    await expect(
      createTransaction({
        type: 'expense',
        amount: 100,
        category: null,
        note: '',
        occurredAt: '2026-07-05',
        fromBucket: null,
        toBucket: 'unallocated',
      }),
    ).rejects.toThrow();
  });

  it('桶间调整必须指定不同来源与目标', async () => {
    await expect(
      createTransaction({
        type: 'transfer',
        amount: 100,
        category: null,
        note: '',
        occurredAt: '2026-07-05',
        fromBucket: 'brz',
        toBucket: 'brz',
      }),
    ).rejects.toThrow();
  });

  it('金额必须大于 0', async () => {
    await expect(
      createTransaction({
        type: 'adjustment',
        amount: 0,
        category: null,
        note: '',
        occurredAt: '2026-07-05',
        fromBucket: null,
        toBucket: 'brz',
      }),
    ).rejects.toThrow();
  });

  it('可以修改备注与分类，但不能修改金额', async () => {
    const created = await createTransaction({
      type: 'expense',
      amount: 500,
      category: '餐饮',
      note: '',
      occurredAt: '2026-07-06',
      fromBucket: null,
      toBucket: 'unallocated',
    });
    const updated = await updateTransactionMeta(created.id, { note: '聚餐', category: '社交' });
    expect(updated.note).toBe('聚餐');
    expect(updated.category).toBe('社交');
    expect(updated.amount).toBe(500);
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('作废交易后余额回退且列表仍保留记录', async () => {
    const created = await createTransaction({
      type: 'adjustment',
      amount: 30000,
      category: null,
      note: '手动调整',
      occurredAt: '2026-07-07',
      fromBucket: null,
      toBucket: 'brz',
    });
    await voidTransaction(created.id);
    const transactions = await listAllTransactions();
    expect(transactions[0]?.voidedAt).not.toBeNull();
    expect(calculateTotalCash(transactions)).toBe(0);
  });

  it('自动生成的入账交易不能直接作废，必须通过收入记录作废', async () => {
    const { transaction } = await recordIncome({
      opportunityId: null,
      source: 'other',
      amountReceived: 20000,
      directCosts: 0,
      workHours: null,
      receivedAt: '2026-07-08',
      note: '',
    });
    await expect(voidTransaction(transaction.id)).rejects.toThrow();
  });
});

describe('端到端一致性：收入 → 分配 → 支出 → 余额与摘要', () => {
  it('完整流程后各项指标正确且审计无错误', async () => {
    const { income } = await recordIncome({
      opportunityId: null,
      source: 'programming',
      amountReceived: 300000,
      directCosts: 20000,
      workHours: 12,
      receivedAt: '2026-07-09',
      note: '外包',
    });
    await allocateIncome(income.id, {
      kind: 'ratio',
      ratios: { brz: 80, emergency: 10, other: 10 },
    });
    await createTransaction({
      type: 'brz_transfer',
      amount: 200000,
      category: null,
      note: '转入购车基金',
      occurredAt: '2026-07-09',
      fromBucket: 'unallocated',
      toBucket: 'brz',
    });
    await createTransaction({
      type: 'expense',
      amount: 10000,
      category: '交通',
      note: '',
      occurredAt: '2026-07-09',
      fromBucket: null,
      toBucket: 'unallocated',
    });

    const summary = await loadFinancialSummary(new Date(2026, 6, 20));
    expect(summary.totalCash).toBe(270000);
    expect(summary.fundBalance).toBe(200000);
    expect(summary.unallocatedBalance).toBe(70000);

    const reloaded = await getIncomeById(income.id);
    expect(reloaded?.amountReceived).toBe(300000);
  });
});
