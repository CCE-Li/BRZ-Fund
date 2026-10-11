import type { ChartOption } from '@/composables/useECharts';
import { readChartPalette, axisStyle } from '@/composables/chartTheme';
import type { SavingsRateWindow } from '@/domain/savingsRate';
import type { ProjectionPoint } from '@/domain/forecast';
import type { MonthKey, SavingsGoal, Transaction } from '@/types/models';
import { calculateBucketBalancesAt } from '@/domain/balances';
import { monthKeyOf, monthKeyToShortLabel } from '@/utils/date';
import { formatMoney, formatMoneyCompact } from '@/utils/money';
import type { LineSeriesOption } from 'echarts/charts';

const MAX_POINTS = 48;

/** 从第一笔交易到今天的累计购车基金曲线，并标注目标线与计划日期。 */
export function buildFundGrowthOption(input: {
  transactions: readonly Transaction[];
  goal: SavingsGoal | null;
  currency: string;
  locale: string;
}): { option: ChartOption; series: LineSeriesOption } {
  const palette = readChartPalette();
  const active = input.transactions.filter((transaction) => !transaction.voidedAt);
  const axis = axisStyle(palette);

  if (active.length === 0) {
    return {
      option: { xAxis: { type: 'category', data: [] }, yAxis: { type: 'value' }, series: [] },
      series: { name: '购车基金累计', type: 'line', data: [] },
    };
  }

  const sorted = [...active].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const monthSet = new Set<MonthKey>();
  for (const transaction of sorted) monthSet.add(monthKeyOf(transaction.occurredAt));
  let months = Array.from(monthSet).sort();
  if (months.length > MAX_POINTS) months = months.slice(-MAX_POINTS);

  const balances = months.map((month) =>
    calculateBucketBalancesAt(sorted, `${month}-31`).brz,
  );

  const target = input.goal
    ? input.goal.targetCarPrice + input.goal.purchaseExtraBudget + input.goal.repairBudget
    : 0;

  const series: LineSeriesOption = {
    name: '购车基金累计',
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 5,
    data: balances,
    lineStyle: { color: palette.accent, width: 2 },
    itemStyle: { color: palette.accent },
    areaStyle: { color: palette.accent, opacity: 0.12 },
    markLine:
      target > 0
        ? {
            silent: true,
            symbol: 'none',
            lineStyle: { color: palette.info, type: 'dashed' },
            label: {
              formatter: `目标 ${formatMoneyCompact(target, input.currency, input.locale)}`,
              color: palette.info,
              fontSize: 11,
            },
            data: [{ yAxis: target }],
          }
        : undefined,
  };

  const option: ChartOption = {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => formatMoney(Number(value), input.currency, input.locale),
    },
    grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: months.map((month) => monthKeyToShortLabel(month)),
      ...axis,
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      ...axis,
      axisLabel: {
        color: palette.textSecondary,
        fontSize: 11,
        formatter: (value: number) => formatMoneyCompact(value, input.currency, input.locale),
      },
    },
    series: [series],
  };

  return { option, series };
}

/** 实际储蓄 vs 计划储蓄的柱 + 折线对比。 */
export function buildPlanVsActualOption(input: {
  window: SavingsRateWindow;
  planned: number;
  currency: string;
  locale: string;
}): ChartOption {
  const palette = readChartPalette();
  const axis = axisStyle(palette);
  const labels = input.window.entries.map((entry) => monthKeyToShortLabel(entry.month));
  const actual = input.window.entries.map((entry) => entry.savings);

  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => formatMoney(Number(value), input.currency, input.locale),
    },
    legend: { textStyle: { color: palette.textSecondary, fontSize: 12 }, top: 0, right: 0 },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: labels, ...axis, splitLine: { show: false } },
    yAxis: {
      type: 'value',
      ...axis,
      axisLabel: {
        color: palette.textSecondary,
        fontSize: 11,
        formatter: (value: number) => formatMoneyCompact(value, input.currency, input.locale),
      },
    },
    series: [
      {
        name: '实际储蓄',
        type: 'bar',
        data: actual,
        itemStyle: { color: palette.accent, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 28,
      },
      {
        name: '计划储蓄',
        type: 'line',
        data: input.window.entries.map(() => input.planned),
        symbol: 'none',
        lineStyle: { color: palette.info, type: 'dashed', width: 2 },
        itemStyle: { color: palette.info },
      },
    ],
  };
}

/** 收入来源构成（按已到账净额，不使用预计收入）。 */
export function buildIncomeSourceOption(input: {
  items: Array<{ name: string; value: number }>;
  currency: string;
  locale: string;
}): ChartOption {
  const palette = readChartPalette();
  const paletteColors = [
    palette.accent,
    palette.info,
    palette.warning,
    palette.other,
    palette.danger,
    palette.textSecondary,
  ];

  return {
    tooltip: {
      trigger: 'item',
      valueFormatter: (value) => formatMoney(Number(value), input.currency, input.locale),
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'middle',
      textStyle: { color: palette.textSecondary, fontSize: 12 },
    },
    series: [
      {
        name: '收入来源',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        data: input.items.map((item, index) => ({
          ...item,
          itemStyle: { color: paletteColors[index % paletteColors.length] },
        })),
        label: { color: palette.textSecondary, fontSize: 11 },
        labelLine: { lineStyle: { color: palette.border } },
      },
    ],
  };
}

/** 每月收入与储蓄趋势（柱 + 折线）。 */
export function buildMonthlyTrendOption(input: {
  window: SavingsRateWindow;
  currency: string;
  locale: string;
}): ChartOption {
  const palette = readChartPalette();
  const axis = axisStyle(palette);
  const labels = input.window.entries.map((entry) => monthKeyToShortLabel(entry.month));

  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => formatMoney(Number(value), input.currency, input.locale),
    },
    legend: { textStyle: { color: palette.textSecondary, fontSize: 12 }, top: 0, right: 0 },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: labels, ...axis, splitLine: { show: false } },
    yAxis: {
      type: 'value',
      ...axis,
      axisLabel: {
        color: palette.textSecondary,
        fontSize: 11,
        formatter: (value: number) => formatMoneyCompact(value, input.currency, input.locale),
      },
    },
    series: [
      {
        name: '本月到账收入',
        type: 'bar',
        data: input.window.entries.map((entry) => entry.income),
        itemStyle: { color: palette.info, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 22,
      },
      {
        name: '转入购车基金',
        type: 'line',
        smooth: true,
        data: input.window.entries.map((entry) => entry.brzDeposits),
        lineStyle: { color: palette.accent, width: 2 },
        itemStyle: { color: palette.accent },
        symbolSize: 5,
      },
    ],
  };
}

/** 投影图：历史实线 + 情景虚线 + 目标线 + 计划日期标注。 */
export function buildProjectionOption(input: {
  historicalMonths: MonthKey[];
  historical: number[];
  projection: ProjectionPoint[];
  target: number;
  deadline: string;
  currency: string;
  locale: string;
}): ChartOption {
  const palette = readChartPalette();
  const axis = axisStyle(palette);

  const openKeys = new Set(input.projection.map((point) => point.month));
  const historicalPoints = input.historicalMonths
    .map((month, index) => ({ month, value: input.historical[index] ?? 0 }))
    .filter((point) => !openKeys.has(point.month));

  const merged = [
    ...historicalPoints.map((point) => ({ month: point.month, value: point.value as number | null })),
    ...input.projection.map((point) => ({ month: point.month, value: point.balance as number | null })),
  ];

  const labels = merged.map((point) => monthKeyToShortLabel(point.month));
  const historicalData = historicalPoints.map((point) => point.value);
  const nullPad = historicalPoints.map(() => null as number | null);
  const projectionData = [...nullPad, ...input.projection.map((point) => point.balance)];

  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) =>
        value === null || value === undefined ? '—' : formatMoney(Number(value), input.currency, input.locale),
    },
    legend: { textStyle: { color: palette.textSecondary, fontSize: 12 }, top: 0, right: 0 },
    grid: { left: 8, right: 24, top: 28, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: labels, ...axis, splitLine: { show: false } },
    yAxis: {
      type: 'value',
      ...axis,
      axisLabel: {
        color: palette.textSecondary,
        fontSize: 11,
        formatter: (value: number) => formatMoneyCompact(value, input.currency, input.locale),
      },
    },
    series: [
      {
        name: '历史实际',
        type: 'line',
        data: [...historicalData, ...input.projection.map(() => null)],
        smooth: true,
        symbol: 'none',
        lineStyle: { color: palette.accent, width: 2 },
        itemStyle: { color: palette.accent },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: palette.info, type: 'dashed' },
          label: {
            formatter: `目标 ${formatMoneyCompact(input.target, input.currency, input.locale)}`,
            color: palette.info,
            fontSize: 11,
          },
          data: [{ yAxis: input.target }],
        },
      },
      {
        name: '情景预测（假设）',
        type: 'line',
        data: projectionData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: palette.info, type: 'dashed', width: 2 },
        itemStyle: { color: palette.info },
        markArea: {
          silent: true,
          itemStyle: { color: palette.info, opacity: 0.06 },
          data: [[{ xAxis: labels[historicalPoints.length] ?? labels[0] }, { xAxis: labels[labels.length - 1] }]],
        },
      },
    ],
  };
}
