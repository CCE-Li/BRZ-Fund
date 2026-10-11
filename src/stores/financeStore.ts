import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  Allocation,
  AppSettings,
  ForecastSnapshot,
  IncomeOpportunity,
  IncomeRecord,
  SavingsGoal,
  Transaction,
} from '@/types/models';
import { loadFinanceData } from '@/services/integrityService';
import { buildDashboardSnapshot, type DashboardSnapshot } from '@/domain/dashboard';
import { calculateNetIncome } from '@/domain/balances';
import { toErrorMessage } from '@/utils/errors';

export const useFinanceStore = defineStore('finance', () => {
  const goal = ref<SavingsGoal | null>(null);
  const transactions = ref<Transaction[]>([]);
  const incomes = ref<IncomeRecord[]>([]);
  const allocations = ref<Allocation[]>([]);
  const opportunities = ref<IncomeOpportunity[]>([]);
  const snapshots = ref<ForecastSnapshot[]>([]);
  const snapshot = ref<DashboardSnapshot | null>(null);
  const loading = ref(false);
  const loadError = ref<string | null>(null);

  const summary = computed(() => snapshot.value?.summary ?? null);
  const audit = computed(() => snapshot.value?.audit ?? null);
  const hasAnyData = computed(() => transactions.value.length > 0);

  /** 从 IndexedDB 重新加载全部数据并刷新派生视图模型。 */
  async function reload(settings: AppSettings): Promise<void> {
    loading.value = true;
    try {
      const bundle = await loadFinanceData();
      goal.value = bundle.goal;
      transactions.value = bundle.transactions;
      incomes.value = bundle.incomes;
      allocations.value = bundle.allocations;
      opportunities.value = bundle.opportunities;
      snapshots.value = bundle.snapshots;
      snapshot.value = buildDashboardSnapshot({ ...bundle, settings });
      loadError.value = null;
    } catch (error) {
      loadError.value = toErrorMessage(error);
      throw error;
    } finally {
      loading.value = false;
    }
  }

  function incomeById(id: string): IncomeRecord | null {
    return incomes.value.find((income) => income.id === id) ?? null;
  }

  function allocationsFor(incomeRecordId: string): Allocation[] {
    return allocations.value.filter((allocation) => allocation.incomeRecordId === incomeRecordId);
  }

  function allocatedTotalFor(incomeRecordId: string): number {
    return allocationsFor(incomeRecordId).reduce((acc, allocation) => acc + allocation.amount, 0);
  }

  function netIncomeOf(income: IncomeRecord): number {
    return calculateNetIncome(income);
  }

  function resetForTests(): void {
    goal.value = null;
    transactions.value = [];
    incomes.value = [];
    allocations.value = [];
    opportunities.value = [];
    snapshots.value = [];
    snapshot.value = null;
    loading.value = false;
    loadError.value = null;
  }

  return {
    goal,
    transactions,
    incomes,
    allocations,
    opportunities,
    snapshots,
    snapshot,
    loading,
    loadError,
    summary,
    audit,
    hasAnyData,
    reload,
    incomeById,
    allocationsFor,
    allocatedTotalFor,
    netIncomeOf,
    resetForTests,
  };
});
