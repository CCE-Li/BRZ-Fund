<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';
import MoneyText from '@/components/ui/MoneyText.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import {
  completeOnboarding,
  defaultDeadline,
  defaultGoalDraft,
  isDeadlineInFuture,
  type OnboardingInput,
} from '@/services/onboardingService';
import { ratioSum } from '@/domain/defaults';
import { parseMoneyToCents } from '@/utils/money';
import { formatDateDisplay } from '@/utils/date';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const app = useAppStore();
const finance = useFinanceStore();
const toast = useToast();

const step = ref(0);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const CURRENCY_OPTIONS = [
  { value: 'CNY', label: '人民币 CNY（¥）' },
  { value: 'USD', label: '美元 USD（$）' },
  { value: 'EUR', label: '欧元 EUR（€）' },
  { value: 'JPY', label: '日元 JPY（¥）' },
  { value: 'HKD', label: '港币 HKD（HK$）' },
];

const draft = reactive({
  name: defaultGoalDraft().name,
  currency: defaultGoalDraft().currency,
  targetCarPrice: defaultGoalDraft().targetCarPrice as number | null,
  purchaseExtraBudget: defaultGoalDraft().purchaseExtraBudget as number | null,
  repairBudget: defaultGoalDraft().repairBudget as number | null,
  currentDeadline: defaultDeadline(),
  emergencyTargetText: '3000',
  brz: 75,
  emergency: 15,
  other: 10,
});

const emergencyTarget = computed(() => {
  const parsed = parseMoneyToCents(draft.emergencyTargetText);
  return parsed ?? 0;
});

const targetTotal = computed(
  () => (draft.targetCarPrice ?? 0) + (draft.purchaseExtraBudget ?? 0) + (draft.repairBudget ?? 0),
);

const steps = ['目标与货币', '价格与预算', '日期与分配'] as const;

const stepErrors = computed<string[]>(() => {
  const errors: string[] = [];
  if (step.value === 0) {
    if (draft.name.trim().length === 0) errors.push('请填写目标名称。');
    if (!draft.currency) errors.push('请选择货币单位。');
  }
  if (step.value === 1) {
    if (!draft.targetCarPrice || draft.targetCarPrice <= 0) errors.push('裸车目标价格必须大于 0。');
    if (draft.purchaseExtraBudget === null) errors.push('请填写购车附加费用预算（可为 0）。');
    if (draft.repairBudget === null) errors.push('请填写初期整备及维修预算（可为 0）。');
  }
  if (step.value === 2) {
    if (!isDeadlineInFuture(draft.currentDeadline)) errors.push('计划购车日期必须是未来的日期。');
    if (ratioSum({ brz: draft.brz, emergency: draft.emergency, other: draft.other }) <= 0) {
      errors.push('分配比例之和必须大于 0。');
    }
    if (draft.emergencyTargetText.trim().length > 0 && emergencyTarget.value < 0) {
      errors.push('应急储备目标不能为负数。');
    }
  }
  return errors;
});

const canAdvance = computed(() => stepErrors.value.length === 0);

function next(): void {
  if (!canAdvance.value) return;
  if (step.value < steps.length - 1) {
    step.value += 1;
    return;
  }
  void submit();
}

function back(): void {
  if (step.value > 0) step.value -= 1;
}

async function submit(): Promise<void> {
  if (!canAdvance.value) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const payload: OnboardingInput = {
      name: draft.name,
      currency: draft.currency,
      targetCarPrice: draft.targetCarPrice ?? 0,
      purchaseExtraBudget: draft.purchaseExtraBudget ?? 0,
      repairBudget: draft.repairBudget ?? 0,
      currentDeadline: draft.currentDeadline,
      allocationRatios: { brz: draft.brz, emergency: draft.emergency, other: draft.other },
      emergencyTarget: emergencyTarget.value,
    };
    await completeOnboarding(payload);
    await app.refreshMeta();
    app.applySettings({
      ...app.settings,
      currency: payload.currency,
      allocationRatios: payload.allocationRatios,
      emergencyTarget: payload.emergencyTarget,
    });
    await finance.reload(app.settings);
    toast.success('初始化完成，开始记录你的第一笔真实收入吧。');
    await router.push({ name: 'dashboard' });
  } catch (error) {
    submitError.value = toErrorMessage(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="onboarding">
    <PageHeader
      title="初始化 BRZ Fund"
      subtitle="只需要几步设置目标与预算。初始余额始终为 0，资金只能由真实到账收入进入。"
    />

    <ol class="steps">
      <li
        v-for="(label, index) in steps"
        :key="label"
        class="steps__item"
        :class="{ 'steps__item--active': index === step, 'steps__item--done': index < step }"
      >
        <span class="steps__index">{{ index + 1 }}</span>
        <span class="steps__label">{{ label }}</span>
      </li>
    </ol>

    <BaseCard>
      <div v-if="step === 0" class="form">
        <BaseInput
          v-model="draft.name"
          label="购车目标名称"
          placeholder="例如：二手 Subaru BRZ"
          hint="仅用于展示，可以随时在设置中修改。"
        />
        <BaseSelect v-model="draft.currency" label="货币单位" :options="CURRENCY_OPTIONS" />
        <p class="form__note">
          第一版不做汇率换算：更换货币单位只影响新记录与展示，历史记录保留各自币种。
        </p>
      </div>

      <div v-else-if="step === 1" class="form">
        <MoneyInput v-model="draft.targetCarPrice" label="裸车目标价格" required />
        <MoneyInput
          v-model="draft.purchaseExtraBudget"
          label="购车附加费用预算"
          hint="税费、保险、上牌等一次性支出。"
        />
        <MoneyInput
          v-model="draft.repairBudget"
          label="初期整备及维修预算"
          hint="二手车到手后的检查、保养与维修预留。"
        />
        <div class="form__total">
          <span>购车目标总额</span>
          <MoneyText :cents="targetTotal" :currency="draft.currency" size="lg" />
        </div>
        <p class="form__note">
          应急储备与购车基金分开管理，不计入上面的目标总额。
        </p>
      </div>

      <div v-else class="form">
        <BaseInput v-model="draft.currentDeadline" label="计划购车日期" type="date" />
        <p class="form__note">
          当前计划：{{ formatDateDisplay(draft.currentDeadline) }}。这只是目标，不是承诺，之后可以调整。
        </p>
        <div class="ratios">
          <BaseInput v-model.number="draft.brz" label="购车基金比例（%）" type="number" />
          <BaseInput v-model.number="draft.emergency" label="应急储备比例（%）" type="number" />
          <BaseInput v-model.number="draft.other" label="其他用途比例（%）" type="number" />
        </div>
        <p class="form__note">
          分配比例只是每次分配时的建议值，实际分配时可以自由修改，不会强制按比例存入。
        </p>
        <BaseInput
          v-model="draft.emergencyTargetText"
          label="应急储备目标（元）"
          hint="留空或 0 表示暂不设置；未达到目标时应用只会提示，不会自动转账。"
          inputmode="decimal"
          suffix="元"
        />
      </div>

      <template #footer>
        <div class="actions">
          <p v-if="stepErrors.length > 0" class="actions__error">{{ stepErrors[0] }}</p>
          <p v-else-if="submitError" class="actions__error">{{ submitError }}</p>
          <div class="actions__buttons">
            <BaseButton v-if="step > 0" variant="ghost" @click="back">上一步</BaseButton>
            <BaseButton variant="primary" :disabled="!canAdvance" :loading="submitting" @click="next">
              {{ step === steps.length - 1 ? '完成初始化' : '下一步' }}
            </BaseButton>
          </div>
        </div>
      </template>
    </BaseCard>
  </div>
</template>

<style scoped>
.onboarding {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}

.steps {
  display: flex;
  gap: var(--space-4);
  list-style: none;
  margin: 0 0 var(--space-5);
  padding: 0;
  flex-wrap: wrap;
}

.steps__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-tertiary);
  font-size: 13px;
}

.steps__item--active {
  color: var(--text);
  font-weight: 500;
}

.steps__item--done {
  color: var(--accent);
}

.steps__index {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form__note {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.form__total {
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

.ratios {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  width: 100%;
}

.actions__error {
  color: var(--danger);
  font-size: 12px;
}

.actions__buttons {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

@media (max-width: 560px) {
  .ratios {
    grid-template-columns: 1fr;
  }
}
</style>
