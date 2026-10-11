<script setup lang="ts">
import { computed, ref } from 'vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorBanner from '@/components/ui/ErrorBanner.vue';
import MoneyText from '@/components/ui/MoneyText.vue';
import TransactionFormDialog from '@/components/forms/TransactionFormDialog.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import { describeTransaction, voidTransaction } from '@/services/transactionService';
import { BUCKET_LABELS, TRANSACTION_TYPES, type Transaction } from '@/types/models';
import { formatMoney } from '@/utils/money';
import { formatDateDisplay } from '@/utils/date';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';

const app = useAppStore();
const finance = useFinanceStore();
const toast = useToast();
const { confirm } = useConfirm();

const typeFilter = ref('');
const directionFilter = ref('');
const keyword = ref('');
const fromDate = ref('');
const toDate = ref('');
const includeVoided = ref(false);

const dialogOpen = ref(false);
const editing = ref<Transaction | null>(null);
const busyId = ref<string | null>(null);
const error = ref<string | null>(null);

const typeOptions = [
  { value: '', label: '全部类型' },
  ...TRANSACTION_TYPES.map((item) => ({ value: item.key, label: item.label })),
];

const directionOptions = [
  { value: '', label: '全部方向' },
  { value: 'in', label: '流入（增加资金）' },
  { value: 'out', label: '流出（减少资金）' },
  { value: 'move', label: '桶间移动（总额不变）' },
];

const MOVE_TYPES = ['transfer', 'brz_transfer', 'emergency_transfer'];
const IN_TYPES = ['income', 'adjustment'];
const OUT_TYPES = ['expense', 'brz_withdraw', 'emergency_withdraw'];

const filtered = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return finance.transactions
    .filter((transaction) => {
      if (!includeVoided.value && transaction.voidedAt) return false;
      if (typeFilter.value && transaction.type !== typeFilter.value) return false;
      if (directionFilter.value) {
        if (directionFilter.value === 'in' && !IN_TYPES.includes(transaction.type)) return false;
        if (directionFilter.value === 'out' && !OUT_TYPES.includes(transaction.type)) return false;
        if (directionFilter.value === 'move' && !MOVE_TYPES.includes(transaction.type)) return false;
      }
      if (fromDate.value && transaction.occurredAt < fromDate.value) return false;
      if (toDate.value && transaction.occurredAt > toDate.value) return false;
      if (text.length > 0) {
        const haystack = `${transaction.note} ${transaction.category ?? ''} ${transaction.type}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt));
});

const totals = computed(() => {
  let income = 0;
  let expense = 0;
  for (const transaction of filtered.value) {
    if (transaction.voidedAt) continue;
    if (transaction.type === 'income') income += transaction.amount;
    if (transaction.type === 'expense') expense += transaction.amount;
  }
  return { income, expense };
});

function openCreate(): void {
  editing.value = null;
  dialogOpen.value = true;
}

function openEdit(transaction: Transaction): void {
  editing.value = transaction;
  dialogOpen.value = true;
}

async function onVoid(transaction: Transaction): Promise<void> {
  const isIncome = transaction.type === 'income';
  const confirmed = await confirm({
    title: isIncome ? '作废这笔收入的入账' : '作废这笔交易',
    message: isIncome
      ? '这笔交易由收入到账自动生成。作废后会同时作废对应的收入记录，余额随之回退，请先确认没有未撤销的分配记录。'
      : `确认作废「${describeTransaction(transaction)} ${formatMoney(transaction.amount, transaction.currency, app.locale)}」吗？作废后不再影响余额，记录仍会保留以便审计。`,
    confirmLabel: '作废',
    tone: 'danger',
  });
  if (!confirmed) return;

  busyId.value = transaction.id;
  error.value = null;
  try {
    if (isIncome) {
      const { voidIncomeRecord } = await import('@/services/incomeService');
      if (!transaction.incomeRecordId) throw new Error('该交易缺少对应的收入记录引用。');
      await voidIncomeRecord(transaction.incomeRecordId);
    } else {
      await voidTransaction(transaction.id, { force: true });
    }
    await finance.reload(app.settings);
    toast.success('交易已作废，余额已回退。');
  } catch (voidError) {
    error.value = toErrorMessage(voidError);
  } finally {
    busyId.value = null;
  }
}

async function onSaved(): Promise<void> {
  await finance.reload(app.settings);
}

function toneOf(transaction: Transaction): 'positive' | 'negative' | 'muted' {
  if (transaction.voidedAt) return 'muted';
  if (transaction.type === 'income') return 'positive';
  if (transaction.type === 'expense') return 'negative';
  return 'muted';
}

function signedAmount(transaction: Transaction): number {
  if (transaction.type === 'expense' || transaction.type.endsWith('withdraw')) {
    return -transaction.amount;
  }
  return transaction.amount;
}

function clearFilters(): void {
  typeFilter.value = '';
  directionFilter.value = '';
  keyword.value = '';
  fromDate.value = '';
  toDate.value = '';
}
</script>

<template>
  <div class="transactions">
    <PageHeader title="收支流水" subtitle="全部资金变动的唯一账本：收入、支出、转账与调整。">
      <template #actions>
        <BaseButton variant="primary" @click="openCreate">记录一笔变动</BaseButton>
      </template>
    </PageHeader>

    <ErrorBanner v-if="error" tone="danger" title="操作失败" :message="error" dismissible @dismiss="error = null" />

    <div class="summary">
      <div class="summary__item">
        <span class="summary__label">筛选范围内收入</span>
        <MoneyText :cents="totals.income" :currency="app.currency" tone="positive" size="sm" />
      </div>
      <div class="summary__item">
        <span class="summary__label">筛选范围内支出</span>
        <MoneyText :cents="totals.expense" :currency="app.currency" tone="negative" size="sm" />
      </div>
      <div class="summary__item">
        <span class="summary__label">记录条数</span>
        <span class="summary__value">{{ filtered.length }}</span>
      </div>
    </div>

    <BaseCard>
      <div class="filters">
        <BaseInput v-model="keyword" label="搜索" placeholder="备注 / 分类" />
        <BaseSelect
          :model-value="typeFilter"
          :options="typeOptions"
          label="类型"
          @update:model-value="(value) => (typeFilter = value)"
        />
        <BaseSelect
          :model-value="directionFilter"
          :options="directionOptions"
          label="资金方向"
          @update:model-value="(value) => (directionFilter = value)"
        />
        <BaseInput v-model="fromDate" label="起始日期" type="date" />
        <BaseInput v-model="toDate" label="结束日期" type="date" />
      </div>
      <div class="filters__footer">
        <label class="checkbox">
          <input v-model="includeVoided" type="checkbox" />
          <span>显示已作废记录</span>
        </label>
        <BaseButton variant="ghost" size="sm" @click="clearFilters">清除筛选</BaseButton>
      </div>

      <EmptyState
        v-if="finance.transactions.length === 0"
        title="还没有任何资金变动"
        description="先到「机会」确认一笔真实到账收入，或在这里记录一笔支出。"
      />

      <EmptyState
        v-else-if="filtered.length === 0"
        title="没有符合条件的记录"
        description="试着放宽筛选条件，或勾选显示已作废记录。"
      />

      <ul v-else class="list">
        <li
          v-for="transaction in filtered"
          :key="transaction.id"
          class="row"
          :class="{ 'row--voided': !!transaction.voidedAt }"
        >
          <div class="row__main">
            <div class="row__title-line">
              <span class="row__title">{{ describeTransaction(transaction) }}</span>
              <span v-if="transaction.voidedAt" class="row__voided">已作废</span>
            </div>
            <span class="row__meta">
              {{ formatDateDisplay(transaction.occurredAt) }}
              <template v-if="transaction.category"> · {{ transaction.category }}</template>
              <template v-if="transaction.fromBucket && transaction.type === 'transfer'">
                · {{ BUCKET_LABELS[transaction.fromBucket] }} → {{ BUCKET_LABELS[transaction.toBucket] }}
              </template>
              <template v-if="transaction.note"> · {{ transaction.note }}</template>
            </span>
          </div>

          <div class="row__side">
            <MoneyText
              :cents="signedAmount(transaction)"
              :currency="transaction.currency"
              :tone="toneOf(transaction)"
              size="sm"
              signed
            />
            <div class="row__actions">
              <BaseButton
                v-if="transaction.type !== 'income' || transaction.incomeRecordId"
                size="sm"
                variant="ghost"
                :disabled="!!transaction.voidedAt"
                @click="openEdit(transaction)"
              >
                编辑
              </BaseButton>
              <BaseButton
                size="sm"
                variant="ghost"
                :disabled="!!transaction.voidedAt"
                :loading="busyId === transaction.id"
                @click="onVoid(transaction)"
              >
                作废
              </BaseButton>
            </div>
          </div>
        </li>
      </ul>
    </BaseCard>

    <TransactionFormDialog
      :open="dialogOpen"
      :transaction="editing"
      @close="dialogOpen = false"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.transactions {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.summary__item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.summary__label {
  font-size: 12px;
  color: var(--text-secondary);
}

.summary__value {
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.filters {
  display: grid;
  grid-template-columns: minmax(160px, 2fr) repeat(4, minmax(120px, 1fr));
  gap: var(--space-3);
}

.filters__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: var(--space-3) 0 var(--space-2);
  gap: var(--space-3);
  flex-wrap: wrap;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.row:last-child {
  border-bottom: none;
}

.row--voided {
  opacity: 0.6;
}

.row__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.row__title-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.row__title {
  font-size: 13px;
}

.row__voided {
  font-size: 11px;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  padding: 0 5px;
}

.row__meta {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.row__side {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.row__actions {
  display: flex;
  gap: var(--space-1);
}

@media (max-width: 900px) {
  .filters {
    grid-template-columns: 1fr;
  }

  .row {
    flex-direction: column;
    align-items: stretch;
  }

  .row__side {
    justify-content: space-between;
  }
}
</style>
