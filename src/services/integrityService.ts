import { listTransactions } from '@/repositories/transactionsRepository';
import { listIncomeRecords } from '@/repositories/incomeRepository';
import { listAllocations } from '@/repositories/allocationsRepository';
import { getGoal } from '@/repositories/goalsRepository';
import type { SavingsGoal, Transaction } from '@/types/models';
import { auditIntegrity, type IntegrityAuditResult } from '@/domain/integrity';
import {
  calculateFinancialSummary,
  type FinancialSummary,
} from '@/services/forecastService';
import { loadSettings } from '@/services/settingsService';

export interface AuditBundle {
  summary: FinancialSummary;
  audit: IntegrityAuditResult;
  goal: SavingsGoal | null;
  transactionCount: number;
}

export async function auditAll(): Promise<IntegrityAuditResult> {
  const [transactions, incomeRecords, allocations] = await Promise.all([
    listTransactions(),
    listIncomeRecords(),
    listAllocations(),
  ]);
  return auditIntegrity({ transactions, incomeRecords, allocations });
}

export async function loadDashboardBundle(reference: Date = new Date()): Promise<AuditBundle> {
  const [goal, transactions, settings, incomeRecords, allocations] = await Promise.all([
    getGoal(),
    listTransactions(),
    loadSettings(),
    listIncomeRecords(),
    listAllocations(),
  ]);
  const audit = auditIntegrity({ transactions, incomeRecords, allocations });
  const summary = calculateFinancialSummary(goal, transactions, settings, reference);
  return { summary, audit, goal, transactionCount: transactions.length };
}

export function latestTransactions(transactions: readonly Transaction[], limit = 8): Transaction[] {
  return transactions
    .filter((transaction) => !transaction.voidedAt)
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
