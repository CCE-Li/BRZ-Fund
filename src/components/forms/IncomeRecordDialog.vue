<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';
import MoneyText from '@/components/ui/MoneyText.vue';
import { INCOME_SOURCES, type IncomeOpportunity, type IncomeRecord, type IncomeSource } from '@/types/models';
import { recordIncome } from '@/services/incomeService';
import { useAppStore } from '@/stores/appStore';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { todayString } from '@/utils/date';

const props = defineProps<{
  open: boolean;
  opportunity: IncomeOpportunity | null;
  /** 已有到账记录时用于提示，避免重复登记。 */
  existingIncomes: readonly IncomeRecord[];
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const app = useAppStore();
const toast = useToast();
const saving = ref(false);
const error = ref<string | null>(null);

const draft = reactive({
  amountReceived: null as number | null,
  directCosts: null as number | null,
  workHoursText: '',
  receivedAt: todayString(),
  note: '',
  source: 'programming' as IncomeSource,
});

watch(
  () => [props.open, props.opportunity] as const,
  ([open, opportunity]) => {
    if (!open) return;
    error.value = null;
    draft.amountReceived = null;
    draft.directCosts = null;
    draft.workHoursText = opportunity?.estimatedHours === null || !opportunity ? '' : String(opportunity.estimatedHours);
    draft.receivedAt = todayString();
    draft.note = opportunity ? `${opportunity.title} 到账` : '';
    draft.source = opportunity?.source ?? 'other';
  },
  { immediate: true },
);

const netAmount = computed(() => (draft.amountReceived ?? 0) - (draft.directCosts ?? 0));

const duplicateWarning = computed(() => {
  if (!props.opportunity) return null;
  const active = props.existingIncomes.filter((income) => !income.voidedAt);
  if (active.length === 0) return null;
  const total = active.reduce((acc, income) => acc + income.amountReceived, 0);
  return `该机会已登记过 ${
    active.length
  } 笔到账记录（合计 ¥${(total / 100).toFixed(2)}）。重复登记会造成重复记账，请确认这是新的一笔款项。`;
});

async function submit(): Promise<void> {
  if (!draft.amountReceived || draft.amountReceived <= 0) {
    error.value = '请填写真实的到账金额（必须大于 0）。';
    return;
  }
  saving.value = true;
  error.value = null;
  try {
    await recordIncome({
      opportunityId: props.opportunity?.id ?? null,
      source: draft.source,
      amountReceived: draft.amountReceived,
      directCosts: draft.directCosts ?? 0,
      workHours: draft.workHoursText.trim() === '' ? null : Number(draft.workHoursText),
      receivedAt: draft.receivedAt,
      note: draft.note,
    });
    toast.success('已确认到账，余额已更新。请前往「分配」把资金划分到购车基金或应急储备。');
    emit('saved');
    emit('close');
  } catch (submitError) {
    error.value = toErrorMessage(submitError);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    title="确认到账"
    width="md"
    @close="emit('close')"
  >
    <div class="form">
      <p v-if="opportunity" class="form__context">
        机会：<strong>{{ opportunity.title }}</strong>
      </p>
      <p v-if="duplicateWarning" class="form__warning">{{ duplicateWarning }}</p>

      <MoneyInput
        v-model="draft.amountReceived"
        label="实际到账金额"
        :currency="app.currency"
        required
      />
      <MoneyInput
        v-model="draft.directCosts"
        label="直接成本"
        :currency="app.currency"
        hint="交通、材料、平台抽成等为这笔收入实际支出的钱；会从可分配金额中扣除。"
      />
      <div class="form__grid">
        <BaseInput v-model="draft.workHoursText" label="投入工时（小时）" type="number" min="0" />
        <BaseInput v-model="draft.receivedAt" label="到账日期" type="date" />
      </div>
      <BaseSelect
        v-if="!opportunity"
        v-model="draft.source"
        label="收入来源"
        :options="INCOME_SOURCES.map((item) => ({ value: item.key, label: item.label }))"
      />
      <BaseInput v-model="draft.note" label="备注" placeholder="付款方、项目名称等" />

      <div class="form__net">
        <span>可分配净额（到账 − 直接成本）</span>
        <MoneyText :cents="Math.max(0, netAmount)" :currency="app.currency" size="lg" />
      </div>
      <p class="form__notice">
        确认后将生成一条收入记录与一条入账交易（记录净额），同一笔收入不会被重复计入。
      </p>
      <p v-if="error" class="form__error">{{ error }}</p>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">取消</BaseButton>
      <BaseButton variant="primary" :loading="saving" @click="submit">确认到账</BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.form__context {
  font-size: 13px;
  color: var(--text-secondary);
}

.form__net {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--bg-panel);
  font-size: 13px;
  color: var(--text-secondary);
}

.form__warning {
  font-size: 12px;
  color: var(--warning);
  line-height: 1.6;
  border: 1px solid var(--warning);
  background: var(--warning-soft);
  border-radius: var(--radius);
  padding: var(--space-3);
}

.form__notice {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.form__error {
  color: var(--danger);
  font-size: 12px;
}
</style>
