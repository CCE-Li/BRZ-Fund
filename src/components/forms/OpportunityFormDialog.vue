<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';
import { INCOME_SOURCES, type IncomeOpportunity, type IncomeSource } from '@/types/models';
import { createOpportunity, updateOpportunity } from '@/services/opportunityService';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { todayString } from '@/utils/date';

const props = defineProps<{
  open: boolean;
  opportunity: IncomeOpportunity | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const toast = useToast();
const saving = ref(false);
const error = ref<string | null>(null);

const draft = reactive({
  title: '',
  source: 'programming' as IncomeSource,
  estimatedGrossMin: null as number | null,
  estimatedGrossMax: null as number | null,
  probabilityText: '',
  estimatedHoursText: '',
  expectedPaymentDate: '',
  notes: '',
});

watch(
  () => [props.open, props.opportunity] as const,
  ([open, opportunity]) => {
    if (!open) return;
    error.value = null;
    if (opportunity) {
      draft.title = opportunity.title;
      draft.source = opportunity.source;
      draft.estimatedGrossMin = opportunity.estimatedGrossMin;
      draft.estimatedGrossMax = opportunity.estimatedGrossMax;
      draft.probabilityText = opportunity.probability === null ? '' : String(opportunity.probability);
      draft.estimatedHoursText = opportunity.estimatedHours === null ? '' : String(opportunity.estimatedHours);
      draft.expectedPaymentDate = opportunity.expectedPaymentDate ?? '';
      draft.notes = opportunity.notes;
      return;
    }
    draft.title = '';
    draft.source = 'programming';
    draft.estimatedGrossMin = null;
    draft.estimatedGrossMax = null;
    draft.probabilityText = '';
    draft.estimatedHoursText = '';
    draft.expectedPaymentDate = todayString();
    draft.notes = '';
  },
  { immediate: true },
);

function parseOptionalNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

async function submit(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const payload = {
      title: draft.title,
      source: draft.source,
      estimatedGrossMin: draft.estimatedGrossMin,
      estimatedGrossMax: draft.estimatedGrossMax,
      probability: parseOptionalNumber(draft.probabilityText),
      estimatedHours: parseOptionalNumber(draft.estimatedHoursText),
      expectedPaymentDate: draft.expectedPaymentDate.trim() === '' ? null : draft.expectedPaymentDate,
      notes: draft.notes,
    };
    if (props.opportunity) {
      await updateOpportunity(props.opportunity.id, payload);
      toast.success('机会信息已更新。');
    } else {
      await createOpportunity(payload);
      toast.success('机会已创建。预计收入不会计入余额，只有确认到账才会。');
    }
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
    :title="opportunity ? '编辑收入机会' : '新增收入机会'"
    width="lg"
    @close="emit('close')"
  >
    <div class="form">
      <BaseInput v-model="draft.title" label="机会名称" placeholder="例如：帮社团做一个小程序" />
      <div class="form__grid">
        <BaseSelect
          v-model="draft.source"
          label="收入来源"
          :options="INCOME_SOURCES.map((item) => ({ value: item.key, label: item.label }))"
        />
        <BaseInput
          v-model="draft.probabilityText"
          label="成功概率（%）"
          type="number"
          min="0"
          max="100"
          hint="可留空；仅作为参考，不影响余额计算。"
        />
      </div>
      <div class="form__grid">
        <MoneyInput v-model="draft.estimatedGrossMin" label="预计收入下限" hint="可留空" />
        <MoneyInput v-model="draft.estimatedGrossMax" label="预计收入上限" hint="可留空" />
      </div>
      <div class="form__grid">
        <BaseInput
          v-model="draft.estimatedHoursText"
          label="预计工时（小时）"
          type="number"
          min="0"
          hint="用于后续评估时薪"
        />
        <BaseInput v-model="draft.expectedPaymentDate" label="预计结算日期" type="date" />
      </div>
      <BaseInput v-model="draft.notes" label="备注" placeholder="沟通记录、对接人、注意事项…" />
      <p class="form__notice">
        预计收入只是计划信息：无论填写多少，都不会进入购车基金或任何余额统计。
      </p>
      <p v-if="error" class="form__error">{{ error }}</p>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">取消</BaseButton>
      <BaseButton variant="primary" :loading="saving" @click="submit">
        {{ opportunity ? '保存修改' : '创建机会' }}
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

.form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
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
