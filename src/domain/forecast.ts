import type { Cents, DateString, ForecastSnapshot, MonthKey, SavingsPlan } from '@/types/models';
import type { SavingsRateWindow } from '@/domain/savingsRate';
import { addMonths, monthKeyOf, monthsBetween, todayString } from '@/utils/date';

export type PurchaseDateEstimate =
  | { status: 'achieved'; estimatedDate: null; monthsAhead: 0; projectedBalance: Cents }
  | { status: 'estimated'; estimatedDate: DateString; monthsAhead: number; projectedBalance: Cents }
  | { status: 'unavailable'; estimatedDate: null; monthsAhead: null; reason: string }
  | {
      status: 'beyond_horizon';
      estimatedDate: null;
      monthsAhead: null;
      reason: string;
      capMonths: number;
    };

export interface ProjectionPoint {
  month: MonthKey;
  balance: Cents;
  savings: Cents;
}

export type SimulationResult =
  | { status: 'achieved'; capped: false; monthsAhead: 0; timeline: ProjectionPoint[] }
  | { status: 'projected'; capped: boolean; monthsAhead: number; timeline: ProjectionPoint[] }
  | { status: 'unachievable'; capped: true; monthsAhead: null; timeline: ProjectionPoint[] };

export interface MonthlyPlanEntry {
  month: MonthKey;
  amount: Cents;
  source: 'actual' | 'assumption';
}

export interface RequiredSavingReport {
  gap: Cents;
  monthsLeft: number;
  requiredMonthly: Cents;
  achievableAtHistoricalRate: boolean;
}

/**
 * 基于历史实际储蓄速度推算购车日期。
 * 已达成目标时返回 achieved；速度为 0 或负数时明确返回不可预测，绝不给出误导日期。
 */
export function estimatePurchaseDate(
  currentBalance: Cents,
  targetAmount: Cents,
  monthlySaving: Cents,
  options: { from?: DateString; capMonths?: number } = {},
): PurchaseDateEstimate {
  const from = options.from ?? todayString();
  const capMonths = options.capMonths ?? 240;

  if (targetAmount <= 0) {
    return {
      status: 'unavailable',
      estimatedDate: null,
      monthsAhead: null,
      reason: '尚未设置有效的购车目标金额。',
    };
  }

  if (currentBalance >= targetAmount) {
    return {
      status: 'achieved',
      estimatedDate: null,
      monthsAhead: 0,
      projectedBalance: currentBalance,
    };
  }

  if (monthlySaving <= 0) {
    return {
      status: 'unavailable',
      estimatedDate: null,
      monthsAhead: null,
      reason:
        monthlySaving === 0
          ? '当前没有可用于购车基金的储蓄记录，暂时无法预测。'
          : '最近平均储蓄速度为负数（从购车基金净取出），暂时无法预测。',
    };
  }

  const gap = targetAmount - currentBalance;
  const monthsAhead = Math.ceil(gap / monthlySaving);
  if (monthsAhead > capMonths) {
    return {
      status: 'beyond_horizon',
      estimatedDate: null,
      monthsAhead: null,
      reason: `按当前储蓄速度需要超过 ${Math.round(capMonths / 12)} 年，超出预测范围。`,
      capMonths,
    };
  }

  return {
    status: 'estimated',
    estimatedDate: addMonths(from, monthsAhead),
    monthsAhead,
    projectedBalance: currentBalance + monthsAhead * monthlySaving,
  };
}

/**
 * 情景模拟：按固定月储蓄额或按月单独指定的计划逐月推进，
 * 返回时间线与达成月数。计划只代表用户假设，不代表承诺。
 */
export function simulateSavingsPlan(
  currentBalance: Cents,
  targetAmount: Cents,
  plan: SavingsPlan,
  options: { from?: DateString; maxMonths?: number } = {},
): SimulationResult {
  const from = options.from ?? todayString();
  const maxMonths = options.maxMonths ?? 240;
  const timeline: ProjectionPoint[] = [];

  if (targetAmount <= 0) {
    return { status: 'unachievable', capped: true, monthsAhead: null, timeline };
  }
  if (currentBalance >= targetAmount) {
    return { status: 'achieved', capped: false, monthsAhead: 0, timeline };
  }

  let balance = currentBalance;
  for (let monthIndex = 0; monthIndex < maxMonths; monthIndex += 1) {
    const monthAnchor = addMonths(from, monthIndex);
    const key = monthKeyOf(monthAnchor);
    const savings = plan.kind === 'flat' ? plan.monthly : (plan.months[key] ?? 0);
    balance += savings;
    timeline.push({ month: key, balance, savings });
    if (balance >= targetAmount) {
      return { status: 'projected', capped: false, monthsAhead: monthIndex + 1, timeline };
    }
  }

  return { status: 'unachievable', capped: true, monthsAhead: null, timeline };
}

/** 为计划补充每个月的来源标注：已发生的月份标记为实际，未来月份标记为假设。 */
export function annotatePlan(
  plan: SavingsPlan,
  from: DateString,
  monthCount: number,
): MonthlyPlanEntry[] {
  const entries: MonthlyPlanEntry[] = [];
  for (let index = 0; index < monthCount; index += 1) {
    const key = monthKeyOf(addMonths(from, index));
    const amount = plan.kind === 'flat' ? plan.monthly : (plan.months[key] ?? 0);
    entries.push({ month: key, amount, source: 'assumption' });
  }
  return entries;
}

/** 多档储蓄速度对比，用于「不同储蓄速度下的完成时间」展示。 */
export function compareSavingRates(
  currentBalance: Cents,
  targetAmount: Cents,
  rates: readonly Cents[],
  options: { from?: DateString; capMonths?: number } = {},
): Array<{ monthlySaving: Cents; estimate: PurchaseDateEstimate }> {
  return rates.map((monthlySaving) => ({
    monthlySaving,
    estimate: estimatePurchaseDate(currentBalance, targetAmount, monthlySaving, options),
  }));
}

/** 距离计划截止日期还需要的平均月度储蓄额。 */
export function calculateRequiredMonthlySaving(
  remainingGap: Cents,
  deadline: DateString,
  options: { from?: DateString; historicalMonthlySaving?: Cents } = {},
): RequiredSavingReport {
  const from = options.from ?? todayString();
  if (remainingGap <= 0) {
    return {
      gap: Math.max(0, remainingGap),
      monthsLeft: 0,
      requiredMonthly: 0,
      achievableAtHistoricalRate: true,
    };
  }
  const monthsLeft = Math.max(1, monthsBetween(from, deadline));
  const requiredMonthly = Math.ceil(remainingGap / monthsLeft);
  const historical = options.historicalMonthlySaving ?? 0;
  return {
    gap: remainingGap,
    monthsLeft,
    requiredMonthly,
    achievableAtHistoricalRate: historical >= requiredMonthly,
  };
}

export interface ScenarioComparison {
  scenarioMonthly: Cents;
  targetDate: DateString;
  status: 'on_track' | 'at_risk' | 'off_track';
  onTrackMonths: number;
  scenarioMonths: number;
}

/**
 * 对比用户目标日期与预测完成日期：
 * on_track（不晚于目标日期）、at_risk（晚 6 个月内）、off_track（晚超过 6 个月）。
 */
export function compareGoalDateToScenario(
  estimate: PurchaseDateEstimate,
  deadline: DateString,
  scenarioMonthly: Cents,
  today: DateString = todayString(),
): ScenarioComparison {
  const base = {
    scenarioMonthly,
    targetDate: deadline,
  };

  if (estimate.status === 'achieved') {
    return { ...base, status: 'on_track', onTrackMonths: 0, scenarioMonths: 0 };
  }
  if (estimate.status !== 'estimated') {
    return { ...base, status: 'off_track', onTrackMonths: 0, scenarioMonths: Number.POSITIVE_INFINITY };
  }

  const diff = monthsBetween(estimate.estimatedDate, deadline);
  const scenarioMonths = monthsBetween(today, estimate.estimatedDate);
  if (diff >= 0) {
    return { ...base, status: 'on_track', onTrackMonths: diff, scenarioMonths };
  }
  if (diff >= -6) {
    return { ...base, status: 'at_risk', onTrackMonths: diff, scenarioMonths };
  }
  return { ...base, status: 'off_track', onTrackMonths: diff, scenarioMonths };
}

export interface SnapshotComparison {
  snapshotCreatedAt: string;
  snapshotMethod: ForecastSnapshot['method'];
  snapshotEstimatedDate: DateString | null;
  actualEstimatedDate: DateString | null;
  /** 相对快照时的进度变化（分）。 */
  progressDelta: Cents;
  /** 快照预测 vs 实际进度：是否更慢。 */
  slowerThanProjected: boolean;
  note: string;
}

/** 使用当前实时数据与最近一次已保存快照对比，验证预测偏差。 */
export function compareForecastWithActual(
  snapshot: ForecastSnapshot,
  current: {
    fundBalance: Cents;
    monthlySaving: Cents;
    remainingGap: Cents;
    estimate: PurchaseDateEstimate;
    today: DateString;
  },
): SnapshotComparison {
  const snapshotBalance = Number(snapshot.inputs['fundBalance'] ?? 0);
  const snapshotSavingRate = Number(snapshot.inputs['monthlySaving'] ?? 0);
  const snapshotEstimatedDate =
    typeof snapshot.result['estimatedDate'] === 'string' ? snapshot.result['estimatedDate'] : null;

  const progressDelta = current.fundBalance - snapshotBalance;
  const slowerThanProjected =
    snapshotSavingRate > 0 && current.monthlySaving < snapshotSavingRate;

  const currentEstimateDate =
    current.estimate.status === 'estimated' ? current.estimate.estimatedDate : null;

  return {
    snapshotCreatedAt: snapshot.createdAt,
    snapshotMethod: snapshot.method,
    snapshotEstimatedDate,
    actualEstimatedDate: currentEstimateDate,
    progressDelta,
    slowerThanProjected,
    note: slowerThanProjected
      ? '当前平均储蓄速度低于上次预测时的速度，预计完成日期可能延后。'
      : '当前平均储蓄速度不低于上次预测时的速度。',
  };
}

/** 最近窗口的月度储蓄与「按计划应存金额」对比序列（用于实际 vs 计划图表）。 */
export function buildPlanVsActualSeries(
  window: SavingsRateWindow,
  plannedMonthly: Cents,
): Array<{ month: MonthKey; actual: Cents; planned: Cents }> {
  return window.entries.map((entry) => ({
    month: entry.month,
    actual: entry.savings,
    planned: plannedMonthly,
  }));
}
