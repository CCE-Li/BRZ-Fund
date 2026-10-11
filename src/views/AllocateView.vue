<script setup lang="ts">
import { computed, ref } from 'vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorBanner from '@/components/ui/ErrorBanner.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import MoneyText from '@/components/ui/MoneyText.vue';
import ProgressBar from '@/components/ui/ProgressBar.vue';
import StatCard from '@/components/ui/StatCard.vue';
import AllocationDialog from '@/components/forms/AllocationDialog.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import { reverseAllocation } from '@/services/allocationService';
import { activeIncomes } from '@/domain/dashboard';
import { allocationProgressPercent } from '@/domain/allocation';
import { calculateNetIncome } from '@/domain/balances';
import {
  ALLOCATION_DESTINATION_LABELS,
  type Allocation,
  type IncomeRecord,
} from '@/types/models';
import { formatMoney } from '@/utils/money';
import { formatDateDisplay } from '@/utils/date';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';

const app = useAppStore();
const finance = useFinanceStore();
const toast = useToast();
const { confirm } = useConfirm();

const dialogOpen = ref(false);
const activeIncome = ref<IncomeRecord | null>(null);
const busyId = ref<string | null>(null);
const error = ref<string | null>(null);

const incomes = computed(() => activeIncomes(finance.incomes));

const summary = computed(() => finance.summary);

function allocatedFor(incomeId: string): number {
  return finance.allocatedTotalFor(incomeId);
}

function remainingFor(income: IncomeRecord): number {
  return calculateNetIncome(income) - allocatedFor(income.id);
}

const pendingIncomes = computed(() => incomes.value.filter((income) => remainingFor(income) > 0));

const emergencyGap = computed(() => {
  const target = summary.value?.emergencyTarget ?? 0;
  const balance = summary.value?.emergencyBalance ?? 0;
  return target > 0 ? Math.max(0, target - balance) : 0;
});

const history = computed(() =>
  [...finance.allocations].sort(
    (a, b) => b.allocatedAt.localeCompare(a.allocatedAt) || b.createdAt.localeCompare(a.createdAt),
  ),
);

function incomeOf(allocation: Allocation): IncomeRecord | null {
  return finance.incomeById(allocation.incomeRecordId);
}

function openDialog(income: IncomeRecord): void {
  activeIncome.value = income;
  dialogOpen.value = true;
}

async function onReverse(allocation: Allocation): Promise<void> {
  const confirmed = await confirm({
    title: '撤销这笔分配',
    message: `确认撤销「${ALLOCATION_DESTINATION_LABELS[allocation.destination]} ${formatMoney(allocation.amount, app.currency, app.locale)}」的分配吗？撤销后额度会释放，可以重新分配。`,
    confirmLabel: '撤销分配',
    tone: 'danger',
  });
  if (!confirmed) return;

  busyId.value = allocation.id;
  error.value = null;
  try {
    await reverseAllocation(allocation.id);
    await finance.reload(app.settings);
    toast.success('分配已撤销，额度已释放。');
  } catch (reverseError) {
    error.value = toErrorMessage(reverseError);
  } finally {
    busyId.value = null;
  }
}

async function onSaved(): Promise<void> {
  await finance.reload(app.settings);
}

const allocationsOf = (incomeId: string): Allocation[] => finance.allocationsFor(incomeId);
</script>

<template>
  <div class="allocate">
    <PageHeader
      title="资金分配"
      subtitle="把已到账的钱划分用途：购车基金、应急储备、其他。分配不改变现金总额，只明确用途。"
    />

    <ErrorBanner v-if="error" tone="danger" title="操作失败" :message="error" dismissible @dismiss="error = null" />

    <section class="stats">
      <StatCard
        label="未分配资金"
        :value="formatMoney(summary?.unallocatedBalance ?? 0, app.currency, app.locale)"
        hint="尚未指明用途的现金，可以随时分配"
        tone="default"
      />
      <StatCard
        label="已划入购车基金"
        :value="formatMoney(summary?.fundBalance ?? 0, app.currency, app.locale)"
        tone="accent"
        :hint="`目标 ${formatMoney(summary?.targetTotal ?? 0, app.currency, app.locale)}`"
      />
      <StatCard
        label="应急储备"
        :value="formatMoney(summary?.emergencyBalance ?? 0, app.currency, app.locale)"
        tone="info"
        :hint="summary?.emergencyTarget ? `目标 ${formatMoney(summary.emergencyTarget, app.currency, app.locale)}` : '未设置目标'"
      />
    </section>

    <ErrorBanner
      v-if="emergencyGap > 0"
      tone="info"
      title="应急储备尚未达标"
      :message="`还差 ${formatMoney(emergencyGap, app.currency, app.locale)}。分配时可以考虑优先补充应急储备，应用不会替你自动决定。`"
    />

    <BaseCard title="待分配的收入" subtitle="每笔收入的可分配净额 = 到账金额 − 直接成本">
      <LoadingState v-if="finance.loading && incomes.length === 0" />

      <EmptyState
        v-else-if="incomes.length === 0"
        title="还没有已到账的收入"
        description="先在「机会」页确认一笔真实到账收入，之后才能进行分配。"
      />

      <EmptyState
        v-else-if="pendingIncomes.length === 0"
        title="所有收入都已分配完毕"
        description="如果之后有新的到账记录，会在这里出现。"
      />

      <ul v-else class="list">
        <li v-for="income in pendingIncomes" :key="income.id" class="item">
          <div class="item__main">
            <div class="item__title-line">
              <span class="item__title">
                {{ income.note || '收入到账' }} · {{ formatDateDisplay(income.receivedAt) }}
              </span>
            </div>
            <span class="item__meta">
              净额 {{ formatMoney(calculateNetIncome(income), income.currency, app.locale) }}
              · 已分配 {{ formatMoney(allocatedFor(income.id), income.currency, app.locale) }}
            </span>
            <ProgressBar
              :percent="allocationProgressPercent(calculateNetIncome(income), allocatedFor(income.id))"
              :value-label="`已分配 ${allocationProgressPercent(calculateNetIncome(income), allocatedFor(income.id))}%`"
              label="分配进度"
            />
          </div>
          <div class="item__side">
            <div class="item__remaining">
              <span class="item__remaining-label">剩余可分配</span>
              <MoneyText :cents="remainingFor(income)" :currency="income.currency" size="lg" />
            </div>
            <BaseButton variant="primary" size="sm" @click="openDialog(income)">立即分配</BaseButton>
          </div>
        </li>
      </ul>
    </BaseCard>

    <BaseCard title="分配历史" subtitle="记录保留完整用途划分；撤销只会释放额度，不影响现金总额">
      <EmptyState
        v-if="history.length === 0"
        title="还没有任何分配记录"
        description="分配后这里会显示每笔资金的用途与撤销入口。"
      />

      <ul v-else class="list">
        <li v-for="allocation in history" :key="allocation.id" class="item item--compact">
          <div class="item__main">
            <span class="item__title">{{ ALLOCATION_DESTINATION_LABELS[allocation.destination] }}</span>
            <span class="item__meta">
              {{ formatDateDisplay(allocation.allocatedAt) }}
              · 来自 {{ incomeOf(allocation)?.note || '收入到账' }}
              <template v-if="!incomeOf(allocation)">（收入记录缺失）</template>
            </span>
          </div>
          <div class="item__side">
            <MoneyText :cents="allocation.amount" :currency="app.currency" size="sm" />
            <BaseButton
              size="sm"
              variant="ghost"
              :loading="busyId === allocation.id"
              @click="onReverse(allocation)"
            >
              撤销
            </BaseButton>
          </div>
        </li>
      </ul>

      <template #footer>
        <p class="hint">
          只有「转入购车基金 / 转入应急金」这类转账交易才会增加对应余额；普通分配只是给这笔钱贴上用途标签。
        </p>
      </template>
    </BaseCard>

    <AllocationDialog
      :open="dialogOpen"
      :income="activeIncome"
      :allocations="activeIncome ? allocationsOf(activeIncome.id) : []"
      :emergency-target="summary?.emergencyTarget ?? 0"
      :emergency-balance="summary?.emergencyBalance ?? 0"
      @close="dialogOpen = false"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.allocate {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.item:last-child {
  border-bottom: none;
}

.item--compact {
  padding: var(--space-2) 0;
}

.item__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}

.item__title-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.item__title {
  font-size: 13px;
}

.item__meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

.item__side {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.item__remaining {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.item__remaining-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

@media (max-width: 760px) {
  .item {
    flex-direction: column;
    align-items: stretch;
  }

  .item__side {
    justify-content: space-between;
  }
}
</style>
