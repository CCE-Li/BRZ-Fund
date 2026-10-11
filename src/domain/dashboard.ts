import type {
  Allocation,
  AppSettings,
  DatabaseMeta,
  ForecastSnapshot,
  IncomeOpportunity,
  IncomeRecord,
  SavingsGoal,
  Transaction,
} from '@/types/models';
import {
  auditIntegrity,
  type IntegrityAuditResult,
  type IntegrityInput,
} from '@/domain/integrity';
import {
  calculateFinancialSummary,
  type FinancialSummary,
} from '@/services/forecastService';
import { calculateNetIncome } from '@/domain/balances';

export interface DashboardSnapshot {
  summary: FinancialSummary;
  audit: IntegrityAuditResult;
  recentTransactions: Transaction[];
  recentIncomes: IncomeRecord[];
  usage: {
    transactionCount: number;
    incomeCount: number;
    opportunityCount: number;
    allocationCount: number;
    snapshotCount: number;
  };
  createdAt: string;
}

export interface DashboardInput {
  goal: SavingsGoal | null;
  transactions: readonly Transaction[];
  incomes: readonly IncomeRecord[];
  opportunities: readonly IncomeOpportunity[];
  allocations: readonly Allocation[];
  settings: AppSettings;
  meta: DatabaseMeta;
  snapshots?: readonly ForecastSnapshot[];
  reference?: Date;
}

/** 有效（未作废）交易，按发生日期升序排列。 */
export function activeTransactions(transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .filter((transaction) => !transaction.voidedAt)
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt));
}

export function activeIncomes(incomes: readonly IncomeRecord[]): IncomeRecord[] {
  return incomes
    .filter((income) => !income.voidedAt)
    .slice()
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.createdAt.localeCompare(a.createdAt));
}

export function recentTransactions(transactions: readonly Transaction[], limit = 6): Transaction[] {
  return transactions
    .filter((transaction) => !transaction.voidedAt)
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function recentIncomes(incomes: readonly IncomeRecord[], limit = 4): IncomeRecord[] {
  return activeIncomes(incomes).slice(0, limit);
}

/** 累计净收入（到账金额 − 直接成本），只统计真实到账且未作废的收入。 */
export function totalNetIncome(incomes: readonly IncomeRecord[]): number {
  return activeIncomes(incomes).reduce((acc, income) => acc + calculateNetIncome(income), 0);
}

export function pendingPaymentOpportunities(
  opportunities: readonly IncomeOpportunity[],
): IncomeOpportunity[] {
  return opportunities
    .filter((opportunity) => opportunity.status === 'completed_unpaid')
    .sort((a, b) => {
      const left = a.expectedPaymentDate ?? '9999-12-31';
      const right = b.expectedPaymentDate ?? '9999-12-31';
      return left.localeCompare(right);
    });
}

export function openOpportunityCount(opportunities: readonly IncomeOpportunity[]): number {
  const openStatuses = ['identified', 'applied', 'negotiating', 'in_progress'];
  return opportunities.filter((opportunity) => openStatuses.includes(opportunity.status)).length;
}

/** 构建 Dashboard 视图模型（纯函数，便于单测）。 */
export function buildDashboardSnapshot(input: DashboardInput): DashboardSnapshot {
  const integrityInput: IntegrityInput = {
    transactions: input.transactions,
    incomeRecords: input.incomes,
    allocations: input.allocations,
  };

  return {
    summary: calculateFinancialSummary(
      input.goal,
      input.transactions,
      input.settings,
      input.reference ?? new Date(),
    ),
    audit: auditIntegrity(integrityInput),
    recentTransactions: recentTransactions(input.transactions),
    recentIncomes: recentIncomes(input.incomes),
    usage: {
      transactionCount: input.transactions.filter((item) => !item.voidedAt).length,
      incomeCount: activeIncomes(input.incomes).length,
      opportunityCount: input.opportunities.length,
      allocationCount: input.allocations.length,
      snapshotCount: input.snapshots?.length ?? 0,
    },
    createdAt: new Date().toISOString(),
  };
}
