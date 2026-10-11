<script setup lang="ts">
import { computed, ref } from 'vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorBanner from '@/components/ui/ErrorBanner.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import OpportunityFormDialog from '@/components/forms/OpportunityFormDialog.vue';
import IncomeRecordDialog from '@/components/forms/IncomeRecordDialog.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import {
  changeOpportunityStatus,
  deleteOpportunity,
  listAllOpportunities,
} from '@/services/opportunityService';
import {
  INCOME_SOURCE_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUSES,
  INCOME_SOURCES,
  type IncomeOpportunity,
  type OpportunityStatus,
} from '@/types/models';
import { formatDateDisplay } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';

const app = useAppStore();
const finance = useFinanceStore();
const toast = useToast();
const { confirm } = useConfirm();

const search = ref('');
const sourceFilter = ref('');
const statusFilter = ref('');

const formOpen = ref(false);
const editing = ref<IncomeOpportunity | null>(null);
const incomeDialogOpen = ref(false);
const payingOpportunity = ref<IncomeOpportunity | null>(null);
const busyId = ref<string | null>(null);
const error = ref<string | null>(null);

const sourceOptions = [
  { value: '', label: '全部来源' },
  ...INCOME_SOURCES.map((item) => ({ value: item.key, label: item.label })),
];

const statusOptions = [
  { value: '', label: '全部状态' },
  ...OPPORTUNITY_STATUSES.map((item) => ({ value: item.key, label: item.label })),
];

const filtered = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return finance.opportunities.filter((opportunity) => {
    if (sourceFilter.value && opportunity.source !== sourceFilter.value) return false;
    if (statusFilter.value && opportunity.status !== statusFilter.value) return false;
    if (keyword.length === 0) return true;
    return (
      opportunity.title.toLowerCase().includes(keyword) ||
      opportunity.notes.toLowerCase().includes(keyword)
    );
  });
});

const statusPriority: Record<OpportunityStatus, number> = {
  completed_unpaid: 0,
  in_progress: 1,
  negotiating: 2,
  applied: 3,
  identified: 4,
  paid: 5,
  rejected: 6,
  cancelled: 7,
};

const sorted = computed(() =>
  [...filtered.value].sort((a, b) => {
    const priority = statusPriority[a.status] - statusPriority[b.status];
    if (priority !== 0) return priority;
    return b.updatedAt.localeCompare(a.updatedAt);
  }),
);

interface StatusAction {
  status: OpportunityStatus;
  label: string;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
}

function actionsFor(opportunity: IncomeOpportunity): StatusAction[] {
  switch (opportunity.status) {
    case 'identified':
      return [
        { status: 'applied', label: '标记已申请', variant: 'secondary' },
        { status: 'in_progress', label: '已在做', variant: 'secondary' },
        { status: 'rejected', label: '未获得', variant: 'ghost' },
        { status: 'cancelled', label: '取消', variant: 'ghost' },
      ];
    case 'applied':
      return [
        { status: 'negotiating', label: '进入沟通', variant: 'secondary' },
        { status: 'in_progress', label: '已在做', variant: 'secondary' },
        { status: 'rejected', label: '未获得', variant: 'ghost' },
        { status: 'cancelled', label: '取消', variant: 'ghost' },
      ];
    case 'negotiating':
      return [
        { status: 'in_progress', label: '开始进行', variant: 'secondary' },
        { status: 'rejected', label: '未谈成', variant: 'ghost' },
        { status: 'cancelled', label: '取消', variant: 'ghost' },
      ];
    case 'in_progress':
      return [
        { status: 'completed_unpaid', label: '已完成待付款', variant: 'secondary' },
        { status: 'cancelled', label: '取消', variant: 'ghost' },
      ];
    case 'completed_unpaid':
      return [
        { status: 'paid', label: '确认到账', variant: 'primary' },
        { status: 'cancelled', label: '取消', variant: 'ghost' },
      ];
    default:
      return [];
  }
}

async function onStatusAction(opportunity: IncomeOpportunity, action: StatusAction): Promise<void> {
  if (action.status === 'paid') {
    payingOpportunity.value = opportunity;
    incomeDialogOpen.value = true;
    return;
  }

  if (action.status === 'cancelled' || action.status === 'rejected') {
    const confirmed = await confirm({
      title: action.status === 'rejected' ? '标记为未获得' : '取消这个机会',
      message: `确认把「${opportunity.title}」标记为「${OPPORTUNITY_STATUS_LABELS[action.status]}」吗？该状态之后不能回退。`,
      confirmLabel: '确认',
    });
    if (!confirmed) return;
  }

  busyId.value = opportunity.id;
  error.value = null;
  try {
    await changeOpportunityStatus(opportunity.id, action.status);
    await finance.reload(app.settings);
    toast.success(`状态已更新为「${OPPORTUNITY_STATUS_LABELS[action.status]}」。`);
  } catch (actionError) {
    error.value = toErrorMessage(actionError);
  } finally {
    busyId.value = null;
  }
}

function openCreate(): void {
  editing.value = null;
  formOpen.value = true;
}

function openEdit(opportunity: IncomeOpportunity): void {
  editing.value = opportunity;
  formOpen.value = true;
}

async function onDelete(opportunity: IncomeOpportunity): Promise<void> {
  const confirmed = await confirm({
    title: '删除收入机会',
    message: `确认删除「${opportunity.title}」吗？如果它已经产生过到账收入，为保持账目可追溯将无法删除。`,
    confirmLabel: '删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  error.value = null;
  try {
    await deleteOpportunity(opportunity.id);
    await finance.reload(app.settings);
    toast.success('机会已删除。');
  } catch (deleteError) {
    error.value = toErrorMessage(deleteError);
  }
}

async function onSaved(): Promise<void> {
  await finance.reload(app.settings);
}

async function refresh(): Promise<void> {
  await finance.reload(app.settings);
  const latest = await listAllOpportunities();
  toast.info(`已刷新，共 ${latest.length} 个机会。`);
}

function estimatedRange(opportunity: IncomeOpportunity): string {
  const { estimatedGrossMin: min, estimatedGrossMax: max } = opportunity;
  if (min === null && max === null) return '未填写预计收入';
  if (min !== null && max !== null) {
    return `${formatMoney(min, app.currency, app.locale)} ~ ${formatMoney(max, app.currency, app.locale)}`;
  }
  if (min !== null) return `至少 ${formatMoney(min, app.currency, app.locale)}`;
  return `最多 ${formatMoney(max ?? 0, app.currency, app.locale)}`;
}

function toneOf(status: OpportunityStatus): string {
  return OPPORTUNITY_STATUSES.find((item) => item.key === status)?.tone ?? 'neutral';
}

function incomesOf(opportunityId: string) {
  return finance.incomes.filter((income) => income.opportunityId === opportunityId);
}
</script>

<template>
  <div class="opportunities">
    <PageHeader
      title="收入机会"
      subtitle="记录潜在收入并跟踪状态。预计收入只是计划，永远不会计入余额。"
    >
      <template #actions>
        <BaseButton variant="secondary" size="sm" @click="refresh">刷新</BaseButton>
        <BaseButton variant="primary" @click="openCreate">新增机会</BaseButton>
      </template>
    </PageHeader>

    <ErrorBanner v-if="error" tone="danger" title="操作失败" :message="error" dismissible @dismiss="error = null" />

    <BaseCard>
      <div class="filters">
        <BaseInput v-model="search" label="搜索" placeholder="按名称或备注搜索" />
        <BaseSelect
          :model-value="sourceFilter"
          :options="sourceOptions"
          label="收入来源"
          @update:model-value="(value) => (sourceFilter = value)"
        />
        <BaseSelect
          :model-value="statusFilter"
          :options="statusOptions"
          label="状态"
          @update:model-value="(value) => (statusFilter = value)"
        />
      </div>

      <LoadingState v-if="finance.loading && finance.opportunities.length === 0" />

      <EmptyState
        v-else-if="finance.opportunities.length === 0"
        title="还没有登记任何收入机会"
        description="先把可能的收入记下来（编程接单、兼职、竞赛、奖学金、实习），等真正到账时再确认收款。"
      >
        <BaseButton variant="primary" @click="openCreate">新增第一个机会</BaseButton>
      </EmptyState>

      <EmptyState
        v-else-if="sorted.length === 0"
        title="没有符合筛选条件的机会"
        description="试着调整搜索关键词或筛选条件。"
      />

      <ul v-else class="list">
        <li v-for="opportunity in sorted" :key="opportunity.id" class="item">
          <div class="item__head">
            <div class="item__title-row">
              <h3 class="item__title">{{ opportunity.title }}</h3>
              <span class="badge" :class="`badge--${toneOf(opportunity.status)}`">
                {{ OPPORTUNITY_STATUS_LABELS[opportunity.status] }}
              </span>
              <span class="badge badge--muted">{{ INCOME_SOURCE_LABELS[opportunity.source] }}</span>
            </div>
            <div class="item__actions">
              <BaseButton size="sm" variant="ghost" @click="openEdit(opportunity)">编辑</BaseButton>
              <BaseButton size="sm" variant="ghost" @click="onDelete(opportunity)">删除</BaseButton>
            </div>
          </div>

          <div class="item__meta">
            <span>{{ estimatedRange(opportunity) }}</span>
            <span v-if="opportunity.probability !== null">成功率 {{ opportunity.probability }}%</span>
            <span v-if="opportunity.estimatedHours !== null">预计 {{ opportunity.estimatedHours }} 小时</span>
            <span>
              预计结算
              {{ opportunity.expectedPaymentDate ? formatDateDisplay(opportunity.expectedPaymentDate) : '未填写' }}
            </span>
          </div>

          <p v-if="opportunity.notes" class="item__notes">{{ opportunity.notes }}</p>

          <div v-if="incomesOf(opportunity.id).length > 0" class="item__incomes">
            <span class="item__incomes-title">已到账记录：</span>
            <span v-for="income in incomesOf(opportunity.id)" :key="income.id" class="item__income">
              {{ formatDateDisplay(income.receivedAt) }}
              {{ formatMoney(income.amountReceived, income.currency, app.locale) }}
              <template v-if="income.voidedAt">（已作废）</template>
            </span>
          </div>

          <div v-if="actionsFor(opportunity).length > 0" class="item__status-actions">
            <BaseButton
              v-for="action in actionsFor(opportunity)"
              :key="action.status"
              size="sm"
              :variant="action.variant"
              :loading="busyId === opportunity.id"
              @click="onStatusAction(opportunity, action)"
            >
              {{ action.label }}
            </BaseButton>
          </div>
          <p v-else class="item__final">
            该状态已是终态。记录会保留用于统计与复盘。
          </p>
        </li>
      </ul>
    </BaseCard>

    <OpportunityFormDialog
      :open="formOpen"
      :opportunity="editing"
      @close="formOpen = false"
      @saved="onSaved"
    />
    <IncomeRecordDialog
      :open="incomeDialogOpen"
      :opportunity="payingOpportunity"
      :existing-incomes="payingOpportunity ? incomesOf(payingOpportunity.id) : []"
      @close="incomeDialogOpen = false"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.opportunities {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.filters {
  display: grid;
  grid-template-columns: minmax(200px, 2fr) repeat(2, minmax(140px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.item {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.item__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.item__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  min-width: 0;
}

.item__title {
  font-size: 14px;
}

.item__actions {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}

.item__meta {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-tertiary);
}

.item__notes {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.item__incomes {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
}

.item__incomes-title {
  color: var(--text-tertiary);
}

.item__income {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0 6px;
  font-variant-numeric: tabular-nums;
}

.item__status-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-top: var(--space-1);
}

.item__final {
  font-size: 12px;
  color: var(--text-tertiary);
}

.badge {
  font-size: 11px;
  border-radius: 999px;
  padding: 1px 8px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  white-space: nowrap;
}

.badge--progress {
  border-color: var(--info);
  color: var(--info);
}

.badge--success {
  border-color: var(--accent);
  color: var(--accent);
}

.badge--danger {
  border-color: var(--danger);
  color: var(--danger);
}

.badge--muted {
  color: var(--text-tertiary);
}

@media (max-width: 700px) {
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
