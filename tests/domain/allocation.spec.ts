import { describe, expect, it } from 'vitest';
import {
  allocationProgressPercent,
  calculateAllocation,
  remainingAllocatable,
  totalAllocated,
} from '@/domain/allocation';
import { createAllocation, createIncomeRecord } from '../factories';

const RATIOS = { brz: 75, emergency: 15, other: 10 };

describe('calculateAllocation（比例建议）', () => {
  it('按比例拆分剩余可分配额，且合计守恒', () => {
    const income = createIncomeRecord({ id: 'income-a', amountReceived: 100000, directCosts: 0 });
    const plan = calculateAllocation(income, [], { kind: 'ratio', ratios: RATIOS });
    expect(plan.errors).toEqual([]);
    expect(plan.remaining).toBe(100000);
    const total = plan.entries.reduce((acc, entry) => acc + entry.amount, 0);
    expect(total).toBe(100000);
    expect(plan.entries.find((entry) => entry.destination === 'brz')?.amount).toBe(75000);
    expect(plan.entries.find((entry) => entry.destination === 'emergency')?.amount).toBe(15000);
    expect(plan.entries.find((entry) => entry.destination === 'other')?.amount).toBe(10000);
  });

  it('直接成本从可分配额中扣除，不参与分配', () => {
    const income = createIncomeRecord({ id: 'income-b', amountReceived: 100000, directCosts: 23456 });
    const plan = calculateAllocation(income, [], { kind: 'ratio', ratios: RATIOS });
    expect(plan.netIncome).toBe(76544);
    expect(plan.entries.reduce((acc, entry) => acc + entry.amount, 0)).toBe(76544);
  });

  it('已分配部分会占用额度，只对剩余部分继续分配', () => {
    const income = createIncomeRecord({ id: 'income-c', amountReceived: 100000, directCosts: 0 });
    const existing = [createAllocation({ incomeRecordId: 'income-c', destination: 'brz', amount: 40000 })];
    const plan = calculateAllocation(income, existing, { kind: 'ratio', ratios: RATIOS });
    expect(plan.previouslyAllocated).toBe(40000);
    expect(plan.remaining).toBe(60000);
    expect(plan.entries.reduce((acc, entry) => acc + entry.amount, 0)).toBe(60000);
  });
});

describe('分配额度校验', () => {
  it('同一笔收入重复分配且超额时被拒绝', () => {
    const income = createIncomeRecord({ id: 'income-d', amountReceived: 100000, directCosts: 0 });
    const existing = [createAllocation({ incomeRecordId: 'income-d', destination: 'brz', amount: 100000 })];
    const plan = calculateAllocation(income, existing, {
      kind: 'amounts',
      amounts: { brz: 10000 },
    });
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.errors.join('')).toContain('超出可分配余额');
  });

  it('剩余额度为 0 时任何新增分配都会被拒绝', () => {
    const income = createIncomeRecord({ id: 'income-e', amountReceived: 50000, directCosts: 10000 });
    const existing = [createAllocation({ incomeRecordId: 'income-e', destination: 'brz', amount: 40000 })];
    expect(remainingAllocatable(income, existing)).toBe(0);
    const plan = calculateAllocation(income, existing, {
      kind: 'amounts',
      amounts: { emergency: 1 },
    });
    expect(plan.errors.join('')).toContain('超出可分配余额');
  });

  it('负数或非法金额被拒绝', () => {
    const income = createIncomeRecord({ id: 'income-f', amountReceived: 100000 });
    const plan = calculateAllocation(income, [], {
      kind: 'amounts',
      amounts: { brz: -100 },
    });
    expect(plan.errors.length).toBeGreaterThan(0);
  });

  it('比例之和为 0 被拒绝', () => {
    const income = createIncomeRecord({ id: 'income-g', amountReceived: 100000 });
    const plan = calculateAllocation(income, [], {
      kind: 'ratio',
      ratios: { brz: 0, emergency: 0, other: 0 },
    });
    expect(plan.errors.join('')).toContain('分配比例之和必须大于 0');
  });

  it('已作废的收入不能再分配', () => {
    const income = createIncomeRecord({
      id: 'income-h',
      amountReceived: 100000,
      voidedAt: '2026-02-01T00:00:00.000Z',
    });
    const plan = calculateAllocation(income, [], { kind: 'ratio', ratios: RATIOS });
    expect(plan.errors.join('')).toContain('已作废');
  });

  it('撤销分配后额度被释放（分配记录被删除）', () => {
    const income = createIncomeRecord({ id: 'income-i', amountReceived: 100000 });
    const existing = [createAllocation({ incomeRecordId: 'income-i', destination: 'brz', amount: 100000 })];
    expect(remainingAllocatable(income, existing)).toBe(0);
    const after = existing.filter((item) => item.destination !== 'brz');
    expect(remainingAllocatable(income, after)).toBe(100000);
  });
});

describe('totalAllocated / allocationProgressPercent', () => {
  it('汇总多笔分配', () => {
    expect(
      totalAllocated([
        createAllocation({ amount: 100, destination: 'brz' }),
        createAllocation({ amount: 250, destination: 'emergency' }),
      ]),
    ).toBe(350);
  });

  it('进度百分比按净收入计算，净额为 0 时返回 0', () => {
    expect(allocationProgressPercent(100000, 50000)).toBe(50);
    expect(allocationProgressPercent(0, 50000)).toBe(0);
    expect(allocationProgressPercent(100000, 200000)).toBe(100);
  });
});
