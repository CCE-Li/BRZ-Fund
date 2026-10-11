import { getGoal } from '@/repositories/goalsRepository';
import { listTransactions } from '@/repositories/transactionsRepository';
import { loadSettings } from '@/services/settingsService';
import {
  getSavingsWindow,
  calculateMonthlySavingsRate,
  type SavingsRateReport,
} from '@/domain/savingsRate';
import {
  buildPlanVsActualSeries,
  estimatePurchaseDate,
  type PurchaseDateEstimate,
} from '@/domain/forecast';
import {
  DEFAULT_SAVINGS_WINDOWS,
  MIN_MONTHS_SAMPLE,
} from '@/domain/defaults';
import {
  calculateAvailableBalance,
  calculateBrzFundBalance,
  calculateEmergencyFundBalance,
  calculateTotalCash,
} from '@/domain/balances';
import type {
  AppSettings,
  Cents,
  ForecastSnapshot,
  SavingsGoal,
  Transaction,
} from '@/types/models';
import { putSnapshot } from '@/repositories/snapshotsRepository';
import { createId, nextTimestamp } from '@/utils/id';

export interface FinancialSummary {
  goal: SavingsGoal | null;
  fundBalance: Cents;
  emergencyBalance: Cents;
  unallocatedBalance: Cents;
  otherBalance: Cents;
  totalCash: Cents;
  targetTotal: Cents;
  remainingGap: Cents;
  progressPercent: number;
  savingsReport: SavingsRateReport;
  estimate: PurchaseDateEstimate;
  emergencyTarget: Cents | null;
  emergencyProgressPercent: number;
}

export function calculateFinancialSummary(
  goal: SavingsGoal | null,
  transactions: readonly Transaction[],
  settings: AppSettings | null,
  reference: Date = new Date(),
): FinancialSummary {
  const savingsReport = calculateMonthlySavingsRate(transactions, reference, {
    windows: [...DEFAULT_SAVINGS_WINDOWS],
    minMonthsRequired: MIN_MONTHS_SAMPLE,
  });

  const primaryWindow = getSavingsWindow(savingsReport, 3);
  const monthlySaving = primaryWindow?.average ?? 0;

  const fundBalance = calculateBrzFundBalance(transactions);
  const emergencyBalance = calculateEmergencyFundBalance(transactions);
  const unallocatedBalance = calculateAvailableBalance(transactions);
  const totalCash = calculateTotalCash(transactions);
  const otherBalance = totalCash - fundBalance - emergencyBalance - unallocatedBalance;

  const targetTotal = goal
    ? goal.targetCarPrice + goal.purchaseExtraBudget + goal.repairBudget
    : 0;
  const remainingGap = Math.max(0, targetTotal - fundBalance);
  const progressPercent =
    targetTotal > 0 ? Math.min(100, Math.round((fundBalance / targetTotal) * 1000) / 10) : 0;

  const estimate = goal
    ? primaryWindow && primaryWindow.sufficient
      ? estimatePurchaseDate(fundBalance, targetTotal, monthlySaving)
      : { status: 'unavailable' as const, estimatedDate: null, monthsAhead: null, reason: '数据不足，暂时无法可靠预测。' }
    : { status: 'unavailable' as const, estimatedDate: null, monthsAhead: null, reason: '尚未设置购车目标。' };

  const emergencyTarget = settings && settings.emergencyTarget > 0 ? settings.emergencyTarget : null;
  const emergencyProgressPercent = emergencyTarget
    ? Math.min(100, Math.round((emergencyBalance / emergencyTarget) * 1000) / 10)
    : 0;

  return {
    goal,
    fundBalance,
    emergencyBalance,
    unallocatedBalance,
    otherBalance,
    totalCash,
    targetTotal,
    remainingGap,
    progressPercent,
    savingsReport,
    estimate,
    emergencyTarget,
    emergencyProgressPercent,
  };
}

export async function loadFinancialSummary(reference: Date = new Date()): Promise<FinancialSummary> {
  const [goal, transactions, settings] = await Promise.all([
    getGoal(),
    listTransactions(),
    loadSettings(),
  ]);
  return calculateFinancialSummary(goal, transactions, settings, reference);
}

export interface SnapshotInput {
  summary: FinancialSummary;
  method: ForecastSnapshot['method'];
  confidence: ForecastSnapshot['confidence'];
  assumptions?: Record<string, number | string | null>;
}

/** 把一次预测结果落库，用于后续「预测 vs 实际」对比。 */
export async function saveForecastSnapshot(input: SnapshotInput): Promise<ForecastSnapshot> {
  const { summary, method, confidence } = input;
  const primaryWindow = getSavingsWindow(summary.savingsReport, 3);
  const snapshot: ForecastSnapshot = {
    id: createId(),
    method,
    inputs: {
      fundBalance: summary.fundBalance,
      targetTotal: summary.targetTotal,
      remainingGap: summary.remainingGap,
      monthlySaving: primaryWindow?.average ?? 0,
      sampleMonths: primaryWindow?.entries.length ?? 0,
      deadline: summary.goal?.currentDeadline ?? null,
      ...(input.assumptions ?? {}),
    },
    result: {
      status: summary.estimate.status,
      estimatedDate:
        summary.estimate.status === 'estimated' ? summary.estimate.estimatedDate : null,
      monthsAhead: summary.estimate.status === 'estimated' ? summary.estimate.monthsAhead : null,
      reason: summary.estimate.status === 'unavailable' ? summary.estimate.reason : null,
    },
    confidence,
    createdAt: nextTimestamp(),
  };
  await putSnapshot(snapshot);
  return snapshot;
}

export function confidenceFromSample(months: number): ForecastSnapshot['confidence'] {
  if (months >= 6) return 'high';
  if (months >= 3) return 'medium';
  return 'low';
}

export function planVsActualSeries(summary: FinancialSummary, plannedMonthly: Cents) {
  const window = getSavingsWindow(summary.savingsReport, 6);
  if (!window) return [];
  return buildPlanVsActualSeries(window, plannedMonthly);
}
