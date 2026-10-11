import { describe, expect, it } from 'vitest';
import {
  averageMonthlySaving,
  calculateMonthlySavingsRate,
  getSavingsWindow,
  monthlyEntries,
} from '@/domain/savingsRate';
import { createIncomeTransaction, createTransaction, createTransfer, createWithdraw } from '../factories';

const OPTIONS = { windows: [3, 6], minMonthsRequired: 3 };
const REFERENCE = new Date(2026, 6, 15); // 2026-07-15，最近完整月为 6 月

describe('monthlyEntries（时间序列保留空月份）', () => {
  it('区间内没有任何记录时仍返回全部月份且值为 0', () => {
    const entries = monthlyEntries([], '2026-01', '2026-03');
    expect(entries.map((entry) => entry.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(entries.every((entry) => entry.savings === 0 && entry.income === 0)).toBe(true);
  });

  it('中间没有储蓄的月份保留为 0，不被跳过', () => {
    const transactions = [
      createTransfer('brz_transfer', 50000, '2026-01-10'),
      createTransfer('brz_transfer', 30000, '2026-03-10'),
    ];
    const entries = monthlyEntries(transactions, '2026-01', '2026-03');
    expect(entries.map((entry) => entry.savings)).toEqual([50000, 0, 30000]);
  });

  it('收入与支出按月分别汇总', () => {
    const transactions = [
      createIncomeTransaction(200000, '2026-02-05'),
      createTransaction({ type: 'expense', amount: 60000, occurredAt: '2026-02-12' }),
      createTransfer('emergency_transfer', 20000, '2026-02-20'),
    ];
    const entries = monthlyEntries(transactions, '2026-02', '2026-02');
    expect(entries[0]?.income).toBe(200000);
    expect(entries[0]?.expenses).toBe(60000);
    expect(entries[0]?.emergencyDeposits).toBe(20000);
    expect(entries[0]?.savings).toBe(20000);
    expect(entries[0]?.savingsRatePercent).toBe(10);
  });

  it('从购车基金取出不计为储蓄（可能为负）', () => {
    const transactions = [
      createTransfer('brz_transfer', 100000, '2026-01-10'),
      createWithdraw('brz_withdraw', 30000, '2026-01-20'),
    ];
    const entries = monthlyEntries(transactions, '2026-01', '2026-01');
    expect(entries[0]?.savings).toBe(100000);
    expect(entries[0]?.brzDeposits).toBe(100000);
  });
});

describe('calculateMonthlySavingsRate（3/6 个月均值）', () => {
  it('以最近完整月为窗口末端，计算 3 个月与 6 个月均值', () => {
    const transactions = [
      createTransfer('brz_transfer', 30000, '2026-01-10'),
      createTransfer('brz_transfer', 60000, '2026-02-10'),
      createTransfer('brz_transfer', 90000, '2026-03-10'),
      createTransfer('brz_transfer', 120000, '2026-04-10'),
      createTransfer('brz_transfer', 150000, '2026-05-10'),
      createTransfer('brz_transfer', 180000, '2026-06-10'),
    ];
    const report = calculateMonthlySavingsRate(transactions, REFERENCE, OPTIONS);
    const three = getSavingsWindow(report, 3);
    const six = getSavingsWindow(report, 6);
    expect(three?.entries.map((entry) => entry.month)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(three?.average).toBe(Math.round((120000 + 150000 + 180000) / 3));
    expect(six?.entries).toHaveLength(6);
    expect(six?.average).toBe(Math.round((30000 + 60000 + 90000 + 120000 + 150000 + 180000) / 6));
    expect(three?.sufficient).toBe(true);
  });

  it('空月份计 0，不会被忽略以美化平均值', () => {
    const transactions = [
      createTransfer('brz_transfer', 300000, '2026-04-10'),
    ];
    const report = calculateMonthlySavingsRate(transactions, REFERENCE, OPTIONS);
    const three = getSavingsWindow(report, 3);
    expect(three?.entries.map((entry) => entry.savings)).toEqual([300000, 0, 0]);
    expect(three?.average).toBe(100000);
  });

  it('少于 3 个月记录时判定为样本不足', () => {
    const transactions = [
      createTransfer('brz_transfer', 300000, '2026-06-10'),
      createTransfer('brz_transfer', 300000, '2026-06-20'),
    ];
    const report = calculateMonthlySavingsRate(transactions, REFERENCE, OPTIONS);
    const three = getSavingsWindow(report, 3);
    expect(three?.positiveMonths).toBe(1);
    expect(three?.sufficient).toBe(false);
  });

  it('完全没有储蓄记录时标记为无数据', () => {
    const transactions = [createIncomeTransaction(500000, '2026-05-10')];
    const report = calculateMonthlySavingsRate(transactions, REFERENCE, OPTIONS);
    expect(report.earliestMonth).toBeNull();
    expect(getSavingsWindow(report, 3)?.sufficient).toBe(false);
    expect(getSavingsWindow(report, 3)?.hasData).toBe(false);
    expect(getSavingsWindow(report, 3)?.average).toBe(0);
  });

  it('作废的交易不计入储蓄速度', () => {
    const transactions = [
      createTransfer('brz_transfer', 300000, '2026-05-10'),
      createTransaction({
        type: 'brz_transfer',
        amount: 300000,
        occurredAt: '2026-06-10',
        voidedAt: '2026-06-11T00:00:00.000Z',
      }),
    ];
    const report = calculateMonthlySavingsRate(transactions, REFERENCE, OPTIONS);
    expect(getSavingsWindow(report, 3)?.average).toBe(100000);
  });

  it('记录当前月（未结束）的储蓄，供 Dashboard 展示但不参与均值窗口', () => {
    const transactions = [createTransfer('brz_transfer', 88000, '2026-07-05')];
    const report = calculateMonthlySavingsRate(transactions, REFERENCE, OPTIONS);
    expect(report.currentMonth.month).toBe('2026-07');
    expect(report.currentMonth.savings).toBe(88000);
    expect(getSavingsWindow(report, 3)?.average).toBe(0);
  });
});

describe('averageMonthlySaving', () => {
  it('空数组返回 0', () => {
    expect(averageMonthlySaving([])).toBe(0);
  });

  it('结果四舍五入到整数分', () => {
    expect(
      averageMonthlySaving([
        { month: '2026-01', income: 0, expenses: 0, brzDeposits: 0, emergencyDeposits: 0, savings: 100, savingsRatePercent: 0 },
        { month: '2026-02', income: 0, expenses: 0, brzDeposits: 0, emergencyDeposits: 0, savings: 101, savingsRatePercent: 0 },
      ]),
    ).toBe(101);
  });
});
