import { describe, expect, it } from 'vitest';
import {
  annotatePlan,
  calculateRequiredMonthlySaving,
  compareForecastWithActual,
  compareGoalDateToScenario,
  compareSavingRates,
  estimatePurchaseDate,
  simulateSavingsPlan,
} from '@/domain/forecast';
import { addMonths, monthsBetween } from '@/utils/date';
import type { ForecastSnapshot } from '@/types/models';

const TODAY = '2026-07-15';

describe('estimatePurchaseDate', () => {
  it('目标已经达成时返回 achieved，不再给日期', () => {
    const result = estimatePurchaseDate(6200000, 6000000, 200000, { from: TODAY });
    expect(result.status).toBe('achieved');
    expect(result.estimatedDate).toBeNull();
  });

  it('余额恰好等于目标也视为达成', () => {
    expect(estimatePurchaseDate(6000000, 6000000, 0, { from: TODAY }).status).toBe('achieved');
  });

  it('从零余额开始按储蓄速度推算月份', () => {
    const result = estimatePurchaseDate(0, 6000000, 200000, { from: TODAY });
    expect(result.status).toBe('estimated');
    if (result.status === 'estimated') {
      expect(result.monthsAhead).toBe(30);
      expect(result.estimatedDate).toBe(addMonths(TODAY, 30));
      expect(monthsBetween(TODAY, result.estimatedDate)).toBe(30);
    }
  });

  it('除不尽时向上取整到下一个整月', () => {
    const result = estimatePurchaseDate(0, 1000000, 300000, { from: TODAY });
    if (result.status === 'estimated') {
      expect(result.monthsAhead).toBe(4);
    }
  });

  it('储蓄速度为 0 时不给出预测日期', () => {
    const result = estimatePurchaseDate(100000, 6000000, 0, { from: TODAY });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.estimatedDate).toBeNull();
      expect(result.reason).toContain('无法预测');
    }
  });

  it('储蓄速度为负数时不给出预测日期', () => {
    const result = estimatePurchaseDate(100000, 6000000, -5000, { from: TODAY });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toContain('负数');
    }
  });

  it('未设置目标金额时不可预测', () => {
    expect(estimatePurchaseDate(0, 0, 200000, { from: TODAY }).status).toBe('unavailable');
  });

  it('超出预测视界时如实告知而不是给出假日期', () => {
    const result = estimatePurchaseDate(0, 6000000, 1000, { from: TODAY, capMonths: 60 });
    expect(result.status).toBe('beyond_horizon');
    if (result.status === 'beyond_horizon') {
      expect(result.estimatedDate).toBeNull();
    }
  });

  it('月份边界处理：月末起算不会溢出到下下个月', () => {
    const result = estimatePurchaseDate(0, 100000, 100000, { from: '2026-01-31' });
    if (result.status === 'estimated') {
      expect(result.estimatedDate).toBe('2026-02-28');
    }
  });
});

describe('simulateSavingsPlan', () => {
  it('固定月储蓄额：给出时间线与达成月数', () => {
    const result = simulateSavingsPlan(0, 300000, { kind: 'flat', monthly: 100000 }, { from: TODAY });
    expect(result.status).toBe('projected');
    expect(result.monthsAhead).toBe(3);
    expect(result.timeline).toHaveLength(3);
    expect(result.timeline.every((point) => point.savings === 100000)).toBe(true);
  });

  it('按月指定金额（季节性收入）被正确应用', () => {
    const plan = {
      kind: 'per_month' as const,
      months: { '2026-07': 300000, '2026-08': 0, '2026-09': 0 },
    };
    const result = simulateSavingsPlan(0, 300000, plan, { from: TODAY });
    expect(result.status).toBe('projected');
    expect(result.monthsAhead).toBe(1);
    expect(result.timeline[0]?.savings).toBe(300000);
  });

  it('储蓄为 0 时在视界内无法达成', () => {
    const result = simulateSavingsPlan(0, 300000, { kind: 'flat', monthly: 0 }, { from: TODAY, maxMonths: 12 });
    expect(result.status).toBe('unachievable');
    expect(result.timeline).toHaveLength(12);
  });

  it('目标已达成时立即返回', () => {
    const result = simulateSavingsPlan(500000, 300000, { kind: 'flat', monthly: 1000 }, { from: TODAY });
    expect(result.status).toBe('achieved');
    expect(result.timeline).toHaveLength(0);
  });
});

describe('calculateRequiredMonthlySaving', () => {
  it('按剩余月份计算所需月储蓄（向上取整）', () => {
    const report = calculateRequiredMonthlySaving(1200000, '2027-01-15', { from: TODAY });
    expect(report.monthsLeft).toBe(6);
    expect(report.requiredMonthly).toBe(200000);
  });

  it('已达成目标时所需月储蓄为 0', () => {
    const report = calculateRequiredMonthlySaving(0, '2027-01-15', { from: TODAY });
    expect(report.requiredMonthly).toBe(0);
    expect(report.achievableAtHistoricalRate).toBe(true);
  });

  it('历史速度不足时标记为不可行', () => {
    const report = calculateRequiredMonthlySaving(1200000, '2027-01-15', {
      from: TODAY,
      historicalMonthlySaving: 150000,
    });
    expect(report.requiredMonthly).toBe(200000);
    expect(report.achievableAtHistoricalRate).toBe(false);
  });

  it('截止日期已过时至少按 1 个月计算，不产生除零', () => {
    const report = calculateRequiredMonthlySaving(1200000, '2026-01-01', { from: TODAY });
    expect(report.monthsLeft).toBe(1);
    expect(report.requiredMonthly).toBe(1200000);
  });

  it('历史速度充足时标记为可行', () => {
    const report = calculateRequiredMonthlySaving(1200000, '2027-01-15', {
      from: TODAY,
      historicalMonthlySaving: 250000,
    });
    expect(report.achievableAtHistoricalRate).toBe(true);
  });
});

describe('compareSavingRates（多档速度对比）', () => {
  it('同时给出多档速度下的预计日期', () => {
    const comparison = compareSavingRates(0, 6000000, [100000, 200000, 400000], { from: TODAY });
    expect(comparison).toHaveLength(3);
    const months = comparison.map((item) =>
      item.estimate.status === 'estimated' ? item.estimate.monthsAhead : null,
    );
    expect(months).toEqual([60, 30, 15]);
    expect(comparison[0]?.estimate.status).toBe('estimated');
  });
});

describe('compareGoalDateToScenario', () => {
  it('预计日期早于或等于目标日期：on_track', () => {
    // 60000 元目标、每月存 4000 元 → 15 个月，目标日期给了 23 个月，属于提前完成
    const estimate = estimatePurchaseDate(0, 6000000, 400000, { from: TODAY });
    const comparison = compareGoalDateToScenario(estimate, '2028-06-15', 400000, TODAY);
    expect(comparison.status).toBe('on_track');
  });

  it('预计日期晚于目标但小于 6 个月：at_risk', () => {
    const estimate = estimatePurchaseDate(0, 6000000, 150000, { from: TODAY });
    if (estimate.status === 'estimated') {
      const lateDeadline = addMonths(estimate.estimatedDate, -3);
      const comparison = compareGoalDateToScenario(estimate, lateDeadline, 150000, TODAY);
      expect(comparison.status).toBe('at_risk');
    }
  });

  it('预计日期晚于目标超过 6 个月：off_track', () => {
    const estimate = estimatePurchaseDate(0, 6000000, 50000, { from: TODAY });
    const comparison = compareGoalDateToScenario(estimate, '2027-01-15', 50000, TODAY);
    expect(comparison.status).toBe('off_track');
  });

  it('无法预测时一律视为 off_track', () => {
    const estimate = estimatePurchaseDate(0, 6000000, 0, { from: TODAY });
    const comparison = compareGoalDateToScenario(estimate, '2028-01-15', 0, TODAY);
    expect(comparison.status).toBe('off_track');
  });
});

describe('compareForecastWithActual（预测 vs 实际）', () => {
  const snapshot: ForecastSnapshot = {
    id: 'snap-1',
    method: 'historical_rate',
    inputs: { fundBalance: 1000000, monthlySaving: 200000 },
    result: { status: 'estimated', estimatedDate: '2028-05-15' },
    confidence: 'medium',
    createdAt: '2026-06-01T00:00:00.000Z',
  };

  it('储蓄速度下降时提示可能延后', () => {
    const comparison = compareForecastWithActual(snapshot, {
      fundBalance: 1400000,
      monthlySaving: 120000,
      remainingGap: 4600000,
      estimate: { status: 'estimated', estimatedDate: '2028-11-15', monthsAhead: 28, projectedBalance: 6000000 },
      today: TODAY,
    });
    expect(comparison.progressDelta).toBe(400000);
    expect(comparison.slowerThanProjected).toBe(true);
    expect(comparison.snapshotEstimatedDate).toBe('2028-05-15');
    expect(comparison.actualEstimatedDate).toBe('2028-11-15');
  });

  it('储蓄速度未下降时给出中性结论', () => {
    const comparison = compareForecastWithActual(snapshot, {
      fundBalance: 1300000,
      monthlySaving: 250000,
      remainingGap: 4700000,
      estimate: { status: 'estimated', estimatedDate: '2028-03-15', monthsAhead: 20, projectedBalance: 6000000 },
      today: TODAY,
    });
    expect(comparison.slowerThanProjected).toBe(false);
  });
});

describe('annotatePlan', () => {
  it('未来月份全部标注为假设，不代表承诺', () => {
    const entries = annotatePlan({ kind: 'flat', monthly: 100000 }, TODAY, 4);
    expect(entries).toHaveLength(4);
    expect(entries.every((entry) => entry.source === 'assumption')).toBe(true);
    expect(entries[0]?.month).toBe('2026-07');
  });
});
