<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';
import MoneyText from '@/components/ui/MoneyText.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import { saveGoal, type GoalDraft } from '@/services/onboardingService';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';

const app = useAppStore();
const finance = useFinanceStore();
const toast = useToast();

const CURRENCY_OPTIONS = [
  { value: 'CNY', label: '人民币 CNY（¥）' },
  { value: 'USD', label: '美元 USD（$）' },
  { value: 'EUR', label: '欧元 EUR（€）' },
  { value: 'JPY', label: '日元 JPY（¥）' },
  { value: 'HKD', label: '港币 HKD（HK$）' },
];

const draft = reactive<{
  name: string;
  currency: string;
  targetCarPrice: number | null;
  purchaseExtraBudget: number | null;
  repairBudget: number | null;
  currentDeadline: string;
}>({
  name: '',
  currency: app.settings.currency,
  targetCarPrice: null,
  purchaseExtraBudget: null,
  repairBudget: null,
  currentDeadline: '',
});

const saving = ref(false);
const error = ref<string | null>(null);

const target = computed(
  () => (draft.targetCarPrice ?? 0) + (draft.purchaseExtraBudget ?? 0) + (draft.repairBudget ?? 0),
);

watch(
  () => finance.goal,
  (goal) => {
    if (!goal) return;
    draft.name = goal.name;
    draft.currency = goal.currency;
    draft.targetCarPrice = goal.targetCarPrice;
    draft.purchaseExtraBudget = goal.purchaseExtraBudget;
    draft.repairBudget = goal.repairBudget;
    draft.currentDeadline = goal.currentDeadline;
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const payload: GoalDraft = {
      name: draft.name,
      currency: draft.currency,
      targetCarPrice: draft.targetCarPrice ?? 0,
      purchaseExtraBudget: draft.purchaseExtraBudget ?? 0,
      repairBudget: draft.repairBudget ?? 0,
      currentDeadline: draft.currentDeadline,
    };
    await saveGoal(payload);
    if (draft.currency !== app.settings.currency) {
      const { applySettingsPatch } = await import('@/services/settingsService');
      const updated = await applySettingsPatch({ currency: draft.currency });
      app.applySettings(updated);
    }
    await finance.reload(app.settings);
    toast.success('购车目标已保存。');
  } catch (submitError) {
    error.value = toErrorMessage(submitError);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="goal-form" @submit.prevent="submit">
    <BaseInput v-model="draft.name" label="目标名称" />
    <div class="goal-form__grid">
      <BaseSelect v-model="draft.currency" label="货币单位" :options="CURRENCY_OPTIONS" />
      <BaseInput v-model="draft.currentDeadline" label="计划购车日期" type="date" />
    </div>
    <div class="goal-form__grid">
      <MoneyInput v-model="draft.targetCarPrice" label="裸车目标价格" />
      <MoneyInput v-model="draft.purchaseExtraBudget" label="购车附加费用" />
      <MoneyInput v-model="draft.repairBudget" label="整备维修预算" />
    </div>
    <div class="goal-form__total">
      <span>目标总额</span>
      <MoneyText :cents="target" :currency="draft.currency" size="lg" />
    </div>
    <p v-if="error" class="goal-form__error">{{ error }}</p>
    <div class="goal-form__actions">
      <BaseButton type="submit" variant="primary" :loading="saving">保存目标</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.goal-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.goal-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.goal-form__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--bg-panel);
  font-size: 13px;
  color: var(--text-secondary);
}

.goal-form__error {
  color: var(--danger);
  font-size: 12px;
}

.goal-form__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
