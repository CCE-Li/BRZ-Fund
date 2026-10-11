<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';
import MoneyText from '@/components/ui/MoneyText.vue';
import type { Allocation, IncomeRecord } from '@/types/models';
import { allocateIncome, remainingForIncome, suggestAmounts } from '@/services/allocationService';
import { useAppStore } from '@/stores/appStore';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { formatMoney } from '@/utils/money';

const props = defineProps<{
  open: boolean;
  income: IncomeRecord | null;
  allocations: readonly Allocation[];
  emergencyTarget: number;
  emergencyBalance: number;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const app = useAppStore();
const toast = useToast();
const saving = ref(false);
const error = ref<string | null>(null);
const remaining = ref(0);
const mode = ref<'ratio' | 'manual'>('ratio');
const ratioPreset = ref<'suggested' | 'custom'>('suggested');

const draft = reactive({
  brz: null as number | null,
  emergency: null as number | null,
  other: null as number | null,
  ratios: { brz: 75, emergency: 15, other: 10 },
});

const total = computed(() => (draft.brz ?? 0) + (draft.emergency ?? 0) + (draft.other ?? 0));
const exceeds = computed(() => total.value > remaining.value);
const overAllocated = computed(() => remaining.value <= 0.01);

const emergencyGap = computed(() => {
  if (props.emergencyTarget <= 0) return 0;
  return Math.max(0, props.emergencyTarget - props.emergencyBalance);
});

const emergencyHint = computed(() => {
  if (emergencyGap.value <= 0) return null;
  return `应急储备尚未达到目标，还差 ${formatMoney(emergencyGap.value, app.currency, app.locale)}。可以优先补充，但应用不会替你自动决定。`;
});

watch(
  () => [props.open, props.income, props.allocations] as const,
  async ([open, income]) => {
    if (!open || !income) return;
    error.value = null;
    mode.value = 'ratio';
    ratioPreset.value = 'suggested';
    draft.ratios = { ...app.settings.allocationRatios };
    try {
      remaining.value = await remainingForIncome(income.id);
      await applyRatioSuggestion();
    } catch (loadError) {
      error.value = toErrorMessage(loadError);
    }
  },
  { immediate: true },
);

async function applyRatioSuggestion(): Promise<void> {
  if (!props.income) return;
  try {
    const suggestion = await suggestAmounts(props.income.id, draft.ratios);
    draft.brz = suggestion.brz;
    draft.emergency = suggestion.emergency;
    draft.other = suggestion.other;
  } catch (suggestionError) {
    error.value = toErrorMessage(suggestionError);
  }
}

async function onRatioChange(): Promise<void> {
  ratioPreset.value = 'custom';
  await applyRatioSuggestion();
}

async function resetToSuggested(): Promise<void> {
  draft.ratios = { ...app.settings.allocationRatios };
  ratioPreset.value = 'suggested';
  await applyRatioSuggestion();
}

async function submit(): Promise<void> {
  if (!props.income) return;
  saving.value = true;
  error.value = null;
  try {
    if (total.value <= 0) throw new Error('请至少为一个用途分配金额。');
    if (exceeds.value) throw new Error('各项金额之和超过了剩余可分配余额。');
    await allocateIncome(props.income.id, {
      kind: 'amounts',
      amounts: {
        brz: draft.brz ?? 0,
        emergency: draft.emergency ?? 0,
        other: draft.other ?? 0,
      },
    });
    toast.success('分配已保存。到这里为止，资金用途已经明确，但余额不变——它本来就是你的钱。');
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
  <BaseModal :open="open" title="分配这笔收入" width="md" @close="emit('close')">
    <div v-if="income" class="form">
      <div class="summary">
        <div class="summary__row">
          <span>到账金额</span>
          <MoneyText :cents="income.amountReceived" :currency="income.currency" size="sm" />
        </div>
        <div class="summary__row">
          <span>直接成本（已扣除）</span>
          <MoneyText :cents="income.directCosts" :currency="income.currency" size="sm" muted />
        </div>
        <div class="summary__row summary__row--strong">
          <span>剩余可分配</span>
          <MoneyText :cents="remaining" :currency="app.currency" size="lg" />
        </div>
      </div>

      <p v-if="overAllocated" class="form__notice">
        这笔收入的可分配余额已经用完了。若要重新分配，请在下方分配历史中撤销某条记录。
      </p>

      <div v-if="!overAllocated" class="form__mode">
        <BaseButton
          size="sm"
          :variant="mode === 'ratio' ? 'primary' : 'secondary'"
          @click="mode = 'ratio'"
        >
          按比例建议
        </BaseButton>
        <BaseButton
          size="sm"
          :variant="mode === 'manual' ? 'primary' : 'secondary'"
          @click="mode = 'manual'"
        >
          手动填写
        </BaseButton>
      </div>

      <div v-if="!overAllocated && mode === 'ratio'" class="ratios">
        <BaseInput
          v-model.number="draft.ratios.brz"
          label="购车基金 %"
          type="number"
          min="0"
          @blur="onRatioChange"
        />
        <BaseInput
          v-model.number="draft.ratios.emergency"
          label="应急储备 %"
          type="number"
          min="0"
          @blur="onRatioChange"
        />
        <BaseInput
          v-model.number="draft.ratios.other"
          label="其他用途 %"
          type="number"
          min="0"
          @blur="onRatioChange"
        />
      </div>

      <p v-if="!overAllocated && mode === 'ratio'" class="form__hint">
        <template v-if="ratioPreset === 'suggested'">
          使用设置中的默认比例（可在设置页修改）。
        </template>
        <template v-else>
          已按你的临时比例重新计算（不影响设置中的默认值）。
        </template>
        <BaseButton variant="link" size="sm" @click="resetToSuggested">恢复默认比例</BaseButton>
      </p>

      <div v-if="!overAllocated" class="amounts">
        <MoneyInput v-model="draft.brz" label="BRZ 购车基金" :currency="app.currency" />
        <MoneyInput v-model="draft.emergency" label="应急储备" :currency="app.currency" />
        <MoneyInput v-model="draft.other" label="其他用途" :currency="app.currency" />
      </div>

      <div v-if="!overAllocated" class="total" :class="{ 'total--error': exceeds }">
        <span>本次分配合计</span>
        <MoneyText
          :cents="total"
          :currency="app.currency"
          size="lg"
          :tone="exceeds ? 'negative' : 'default'"
        />
      </div>
      <p v-if="!overAllocated && exceeds" class="form__error">
        合计超过剩余可分配余额，请调整金额或撤销已有分配。
      </p>

      <p v-if="emergencyHint" class="form__tip">{{ emergencyHint }}</p>
      <p v-if="error" class="form__error">{{ error }}</p>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">取消</BaseButton>
      <BaseButton
        variant="primary"
        :loading="saving"
        :disabled="overAllocated || exceeds || total <= 0"
        @click="submit"
      >
        确认分配
      </BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--bg-panel);
  padding: var(--space-3) var(--space-4);
}

.summary__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 13px;
  color: var(--text-secondary);
}

.summary__row--strong {
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-2);
  color: var(--text);
}

.form__mode {
  display: flex;
  gap: var(--space-2);
}

.ratios {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.amounts {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-secondary);
}

.total--error {
  border-color: var(--danger);
}

.form__hint {
  font-size: 12px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.form__tip {
  font-size: 12px;
  color: var(--warning);
  line-height: 1.6;
}

.form__notice {
  font-size: 12px;
  color: var(--info);
  line-height: 1.6;
}

.form__error {
  color: var(--danger);
  font-size: 12px;
}
</style>
