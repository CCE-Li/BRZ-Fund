import { describe, expect, it } from 'vitest';
import {
  buildFundGrowthOption,
  buildIncomeSourceOption,
  buildMonthlyTrendOption,
  buildPlanVsActualOption,
  buildProjectionOption,
} from '@/composables/chartOptions';
import { monthlyEntries } from '@/domain/savingsRate';
import { createGoal, createIncomeTransaction, createTransaction, createTransfer } from '../factories';

const CURRENCY = 'CNY';
const LOCALE = 'zh-CN';

describe('buildFundGrowthOption（累计增长曲线）', () => {
  it('没有交易时返回空数组而不是抛错', () => {
    const result = buildFundGrowthOption({
      transactions: [],
      goal: null,
      currency: CURRENCY,
      locale: LOCALE,
    });
    expect((result.series.data as number[]) ?? []).toHaveLength(0);
  });

  it('按月份给出累计购车基金余额并标注目标线', () => {
    const transactions = [
      createIncomeTransaction(300000, '2026-01-05'),
      createTransfer('brz_transfer', 100000, '2026-01-10'),
      createTransfer('brz_transfer', 150000, '2026-02-10'),
    ];
    const result = buildFundGrowthOption({
      transactions,
      goal: createGoal({ targetCarPrice: 500000, purchaseExtraBudget: 0, repairBudget: 0 }),
      currency: CURRENCY,
      locale: LOCALE,
    });
    expect(result.series.data).toEqual([100000, 250000]);
    expect(result.series.markLine).toBeTruthy();
  });

  it('作废交易不进入曲线', () => {
    const transactions = [
      createTransfer('brz_transfer', 100000, '2026-01-10'),
      createTransaction({
        type: 'brz_transfer',
        amount: 500000,
        occurredAt: '2026-02-10',
        voidedAt: '2026-02-11T00:00:00.000Z',
      }),
    ];
    const result = buildFundGrowthOption({
      transactions,
      goal: null,
      currency: CURRENCY,
      locale: LOCALE,
    });
    expect(result.series.data).toEqual([100000]);
  });
});

describe('buildPlanVsActualOption（实际 vs 计划）', () => {
  it('产出「实际储蓄」柱状与「计划储蓄」折线两条系列', () => {
    const window = {
      windowMonths: 3,
      entries: monthlyEntries(
        [createTransfer('brz_transfer', 50000, '2026-04-10')],
        '2026-03',
        '2026-05',
      ),
      average: 16667,
      positiveMonths: 1,
      activeMonths: 1,
      hasData: true,
      sufficient: false,
    };
    const option = buildPlanVsActualOption({
      window,
      planned: 20000,
      currency: CURRENCY,
      locale: LOCALE,
    });
    const series = option.series as Array<{ name: string; type: string; data: number[] }>;
    expect(series.map((item) => item.name)).toEqual(['实际储蓄', '计划储蓄']);
    expect(series[0]?.data).toEqual([0, 50000, 0]);
    expect(series[1]?.data).toEqual([20000, 20000, 20000]);
  });
});

describe('buildIncomeSourceOption（收入来源构成）', () => {
  it('按传入的净额条目生成饼图数据', () => {
    const option = buildIncomeSourceOption({
      items: [
        { name: '编程接单', value: 100000 },
        { name: '竞赛奖金', value: 50000 },
      ],
      currency: CURRENCY,
      locale: LOCALE,
    });
    const series = option.series as Array<{ type: string; data: Array<{ name: string }> }>;
    expect(series[0]?.type).toBe('pie');
    expect(series[0]?.data.map((item) => item.name)).toEqual(['编程接单', '竞赛奖金']);
  });
});

describe('buildMonthlyTrendOption（每月收入与储蓄）', () => {
  it('收入为柱、储蓄为线', () => {
    const window = {
      windowMonths: 2,
      entries: monthlyEntries(
        [
          createIncomeTransaction(200000, '2026-04-05'),
          createTransfer('brz_transfer', 80000, '2026-04-15'),
        ],
        '2026-04',
        '2026-05',
      ),
      average: 40000,
      positiveMonths: 1,
      activeMonths: 1,
      hasData: true,
      sufficient: false,
    };
    const option = buildMonthlyTrendOption({ window, currency: CURRENCY, locale: LOCALE });
    const series = option.series as Array<{ name: string; type: string; data: number[] }>;
    expect(series[0]?.name).toBe('本月到账收入');
    expect(series[0]?.type).toBe('bar');
    expect(series[0]?.data).toEqual([200000, 0]);
    expect(series[1]?.name).toBe('转入购车基金');
    expect(series[1]?.data).toEqual([80000, 0]);
  });
});

describe('buildProjectionOption（投影）', () => {
  it('历史与投影拼接在同一条轴上，且投影带目标线', () => {
    const option = buildProjectionOption({
      historicalMonths: ['2026-01', '2026-02'],
      historical: [100000, 200000],
      projection: [
        { month: '2026-03', balance: 300000, savings: 100000 },
        { month: '2026-04', balance: 400000, savings: 100000 },
      ],
      target: 500000,
      deadline: '2026-06-01',
      currency: CURRENCY,
      locale: LOCALE,
    });
    const series = option.series as Array<{
      name: string;
      data: Array<number | null>;
      lineStyle?: { type?: string };
    }>;
    expect(series[0]?.name).toBe('历史实际');
    expect(series[1]?.name).toBe('情景预测（假设）');
    expect(series[1]?.lineStyle?.type).toBe('dashed');
    // 投影系列前两段为 null 占位，与历史对齐
    expect(series[1]?.data.slice(0, 2)).toEqual([null, null]);
    expect(series[1]?.data.slice(2)).toEqual([300000, 400000]);
    expect(series[0]?.data).toEqual([100000, 200000, null, null]);
  });

  it('没有投影数据时只画历史', () => {
    const option = buildProjectionOption({
      historicalMonths: ['2026-01'],
      historical: [50000],
      projection: [],
      target: 500000,
      deadline: '2026-06-01',
      currency: CURRENCY,
      locale: LOCALE,
    });
    const series = option.series as Array<{ data: Array<number | null> }>;
    expect(series[0]?.data).toEqual([50000]);
    expect(series[1]?.data).toEqual([null]);
  });
});
