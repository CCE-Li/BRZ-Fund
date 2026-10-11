import { listTransactions } from '@/repositories/transactionsRepository';
import { listIncomeRecords } from '@/repositories/incomeRepository';
import { listAllocations } from '@/repositories/allocationsRepository';
import { listOpportunities } from '@/repositories/opportunitiesRepository';
import { listSnapshots } from '@/repositories/snapshotsRepository';
import { getGoal } from '@/repositories/goalsRepository';
import { getMeta } from '@/repositories/metaRepository';
import { loadSettings } from '@/services/settingsService';
import { auditIntegrity, type IntegrityAuditResult } from '@/domain/integrity';
import { buildDashboardSnapshot, type DashboardSnapshot } from '@/domain/dashboard';
import type {
  Allocation,
  DatabaseMeta,
  ForecastSnapshot,
  IncomeOpportunity,
  IncomeRecord,
  SavingsGoal,
  Transaction,
} from '@/types/models';

export interface FinanceDataBundle {
  goal: SavingsGoal | null;
  transactions: Transaction[];
  incomes: IncomeRecord[];
  allocations: Allocation[];
  opportunities: IncomeOpportunity[];
  snapshots: ForecastSnapshot[];
  meta: DatabaseMeta;
}

/** 一次性读取全部业务数据，供 Pinia 水合使用（单入口，避免组件各自查询）。 */
export async function loadFinanceData(): Promise<FinanceDataBundle> {
  const [goal, transactions, incomes, allocations, opportunities, snapshots, meta] =
    await Promise.all([
      getGoal(),
      listTransactions(),
      listIncomeRecords(),
      listAllocations(),
      listOpportunities(),
      listSnapshots(),
      getMeta(),
    ]);
  return { goal, transactions, incomes, allocations, opportunities, snapshots, meta };
}

export async function loadDashboardSnapshot(
  reference: Date = new Date(),
): Promise<DashboardSnapshot> {
  const [bundle, settings] = await Promise.all([loadFinanceData(), loadSettings()]);
  return buildDashboardSnapshot({ ...bundle, settings, reference });
}

export async function auditAll(): Promise<IntegrityAuditResult> {
  const [transactions, incomeRecords, allocations] = await Promise.all([
    listTransactions(),
    listIncomeRecords(),
    listAllocations(),
  ]);
  return auditIntegrity({ transactions, incomeRecords, allocations });
}
