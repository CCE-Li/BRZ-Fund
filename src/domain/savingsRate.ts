import type { Cents, MonthKey, Transaction } from '@/types/models';
import {
  addMonthsToMonthKey,
  currentMonthKey,
  isValidMonthKey,
  monthKeyOf,
} from '@/utils/date';

export interface MonthlySavingsEntry {
  month: MonthKey;
  income: Cents;
  expenses: Cents;
  brzDeposits: Cents;
  emergencyDeposits: Cents;
  savings: Cents;
  savingsRatePercent: number;
}

export interface SavingsRateWindow {
  windowMonths: number;
  entries: MonthlySavingsEntry[];
  average: Cents;
  positiveMonths: number;
  /** 窗口内出现过任何真实资金记录的月份数（收入/支出/储蓄）。 */
  activeMonths: number;
  /** 窗口内是否出现过任何储蓄记录（全 0 视为暂无数据）。 */
  hasData: boolean;
  /** 是否达到最少样本要求（默认 3 个月，且窗口内有过真实记录）。 */
  sufficient: boolean;
}

export interface SavingsRateReport {
  windows: SavingsRateWindow[];
  currentMonth: MonthlySavingsEntry;
  /** 有储蓄记录的最早月份，null 表示从未有储蓄。 */
  earliestMonth: MonthKey | null;
  minMonthsRequired: number;
}

/** 单笔交易在指定月份内是否计入「实际储蓄」（向购车基金 / 应急金的净流入）。 */
function isSavingsTransaction(transaction: Transaction): boolean {
  if (transaction.voidedAt) return false;
  return transaction.type === 'brz_transfer' || transaction.type === 'emergency_transfer';
}

/**
 * 生成按月时间序列。区间内没有记录的月份会以 0 保留，
 * 不允许为「美化平均值」而丢弃空月份。
 */
export function monthlyEntries(
  transactions: readonly Transaction[],
  startMonth: MonthKey,
  endMonth: MonthKey,
  reference: Date = new Date(),
): MonthlySavingsEntry[] {
  const entries: MonthlySavingsEntry[] = [];
  let cursor = startMonth;
  let guard = 0;
  while (cursor <= endMonth && guard < 600) {
    guard += 1;
    const monthTransactions = transactions.filter(
      (transaction) => !transaction.voidedAt && monthKeyOf(transaction.occurredAt) === cursor,
    );

    const income = monthTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((acc, transaction) => acc + transaction.amount, 0);
    const expenses = monthTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((acc, transaction) => acc + transaction.amount, 0);
    const brzDeposits = monthTransactions
      .filter((transaction) => transaction.type === 'brz_transfer')
      .reduce((acc, transaction) => acc + transaction.amount, 0);
    const emergencyDeposits = monthTransactions
      .filter((transaction) => transaction.type === 'emergency_transfer')
      .reduce((acc, transaction) => acc + transaction.amount, 0);

    const savings = brzDeposits + emergencyDeposits;
    entries.push({
      month: cursor,
      income,
      expenses,
      brzDeposits,
      emergencyDeposits,
      savings,
      savingsRatePercent: income > 0 ? Math.round((savings / income) * 1000) / 10 : 0,
    });

    cursor = addMonthsToMonthKey(cursor, 1);
  }
  void reference;
  return entries;
}

export function averageMonthlySaving(entries: readonly MonthlySavingsEntry[]): Cents {
  if (entries.length === 0) return 0;
  const total = entries.reduce((acc, entry) => acc + entry.savings, 0);
  return Math.round(total / entries.length);
}

/**
 * 储蓄速度报告：默认统计最近 3 个与 6 个「已结束的自然月」。
 * 数据不足 3 个月或窗口内从无储蓄记录时标记为不足，避免给出误导性预测。
 */
export function calculateMonthlySavingsRate(
  transactions: readonly Transaction[],
  reference: Date,
  options: { windows: number[]; minMonthsRequired: number },
): SavingsRateReport {
  const { windows, minMonthsRequired } = options;
  const currentKey = currentMonthKey(reference);
  const lastCompleteMonth = addMonthsToMonthKey(currentKey, -1);

  const savingsMonths = transactions
    .filter(isSavingsTransaction)
    .map((transaction) => monthKeyOf(transaction.occurredAt))
    .filter(isValidMonthKey)
    .sort();
  const earliestMonth = savingsMonths[0] ?? null;

  const windowReports: SavingsRateWindow[] = windows.map((windowMonths) => {
    const startMonth = addMonthsToMonthKey(lastCompleteMonth, -(windowMonths - 1));
    const entries = monthlyEntries(transactions, startMonth, lastCompleteMonth, reference);
    const positiveMonths = entries.filter((entry) => entry.savings > 0).length;
    const activeMonths = entries.filter(
      (entry) =>
        entry.savings !== 0 ||
        entry.income !== 0 ||
        entry.expenses !== 0 ||
        transactions.some(
          (transaction) =>
            !transaction.voidedAt && monthKeyOf(transaction.occurredAt) === entry.month,
        ),
    ).length;
    return {
      windowMonths,
      entries,
      average: averageMonthlySaving(entries),
      positiveMonths,
      activeMonths,
      hasData: positiveMonths > 0,
      sufficient: entries.length >= minMonthsRequired && positiveMonths > 0 && activeMonths >= minMonthsRequired,
    };
  });

  const currentMonth = monthlyEntries(transactions, currentKey, currentKey, reference)[0] ?? {
    month: currentKey,
    income: 0,
    expenses: 0,
    brzDeposits: 0,
    emergencyDeposits: 0,
    savings: 0,
    savingsRatePercent: 0,
  };

  return {
    windows: windowReports,
    currentMonth,
    earliestMonth,
    minMonthsRequired,
  };
}

export function getSavingsWindow(
  report: SavingsRateReport,
  windowMonths: number,
): SavingsRateWindow | null {
  return report.windows.find((window) => window.windowMonths === windowMonths) ?? null;
}
