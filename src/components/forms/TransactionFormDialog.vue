<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';
import { BUCKET_LABELS, type Bucket, type Transaction } from '@/types/models';
import {
  createTransaction,
  updateTransactionMeta,
  type ManualTransactionType,
} from '@/services/transactionService';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { todayString } from '@/utils/date';

const props = defineProps<{
  open: boolean;
  /** 传入交易表示「编辑备注/分类」；否则为新建。 */
  transaction: Transaction | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const toast = useToast();
const saving = ref(false);
const error = ref<string | null>(null);

const TYPE_OPTIONS: Array<{ value: ManualTransactionType; label: string }> = [
  { value: 'expense', label: '支出' },
  { value: 'brz_transfer', label: '转入购车基金' },
  { value: 'brz_withdraw', label: '从购车基金取出' },
  { value: 'emergency_transfer', label: '转入应急金' },
  { value: 'emergency_withdraw', label: '从应急金取出' },
  { value: 'transfer', label: '资金调整（桶间移动）' },
  { value: 'adjustment', label: '其他调整（外部增减）' },
];

const BUCKET_OPTIONS = (Object.keys(BUCKET_LABELS) as Bucket[]).map((bucket) => ({
  value: bucket,
  label: BUCKET_LABELS[bucket],
}));

const EXPENSE_CATEGORIES = ['餐饮', '交通', '学习', '设备', '娱乐', '通讯', '医疗', '其他'];

const draft = reactive({
  type: 'expense' as ManualTransactionType,
  amount: null as number | null,
  category: '',
  note: '',
  occurredAt: todayString(),
  fromBucket: 'unallocated' as Bucket,
  toBucket: 'brz' as Bucket,
});

watch(
  () => [props.open, props.transaction] as const,
  ([open, transaction]) => {
    if (!open) return;
    error.value = null;
    if (transaction) {
      draft.type = transaction.type === 'income' ? 'expense' : (transaction.type as ManualTransactionType);
      draft.amount = transaction.amount;
      draft.category = transaction.category ?? '';
      draft.note = transaction.note;
      draft.occurredAt = transaction.occurredAt;
      draft.fromBucket = transaction.fromBucket ?? 'unallocated';
      draft.toBucket = transaction.toBucket;
      return;
    }
    draft.type = 'expense';
    draft.amount = null;
    draft.category = EXPENSE_CATEGORIES[0] ?? '其他';
    draft.note = '';
    draft.occurredAt = todayString();
    draft.fromBucket = 'unallocated';
    draft.toBucket = 'brz';
  },
  { immediate: true },
);

const editing = computed(() => !!props.transaction);

const needsCategory = computed(() => draft.type === 'expense');
const needsBuckets = computed(
  () => draft.type === 'transfer' || draft.type === 'adjustment',
);

const transferPreview = computed(() => {
  if (draft.type === 'brz_transfer') return '从未分配资金 → 购车基金';
  if (draft.type === 'brz_withdraw') return '从购车基金 → 未分配资金';
  if (draft.type === 'emergency_transfer') return '从未分配资金 → 应急储备';
  if (draft.type === 'emergency_withdraw') return '从应急储备 → 未分配资金';
  return '';
});

async function submit(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    if (editing.value && props.transaction) {
      await updateTransactionMeta(props.transaction.id, {
        category: draft.category.trim() === '' ? null : draft.category.trim(),
        note: draft.note,
      });
      toast.success('交易备注已更新（金额与日期不可修改，如需更正请作废后重建）。');
      emit('saved');
      emit('close');
      return;
    }

    if (!draft.amount || draft.amount <= 0) {
      throw new Error('请填写大于 0 的金额。');
    }

    await createTransaction({
      type: draft.type,
      amount: draft.amount,
      category: needsCategory.value ? draft.category.trim() || '其他' : null,
      note: draft.note,
      occurredAt: draft.occurredAt,
      fromBucket: draft.type === 'adjustment' ? null : draft.fromBucket,
      toBucket: draft.toBucket,
    });
    toast.success('交易已保存。');
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
    :title="editing ? '编辑交易备注' : '记录一笔资金变动'"
    width="md"
    @close="emit('close')"
  >
    <div class="form">
      <BaseSelect
        v-if="!editing"
        :model-value="draft.type"
        label="变动类型"
        :options="TYPE_OPTIONS"
        @update:model-value="(value) => (draft.type = value as ManualTransactionType)"
      />

      <MoneyInput
        v-model="draft.amount"
        label="金额"
        :disabled="editing"
        :hint="editing ? '金额与日期不可修改：如需更正请作废后重新登记。' : ''"
        required
      />

      <div v-if="!editing" class="form__grid">
        <BaseInput v-model="draft.occurredAt" label="发生日期" type="date" />
        <BaseSelect
          v-if="needsCategory"
          :model-value="draft.category"
          label="分类"
          :options="EXPENSE_CATEGORIES.map((item) => ({ value: item, label: item }))"
          @update:model-value="(value) => (draft.category = value)"
        />
      </div>

      <div v-if="!editing && needsBuckets" class="form__grid">
        <BaseSelect
          :model-value="draft.fromBucket"
          label="从哪个桶移出"
          :options="BUCKET_OPTIONS"
          @update:model-value="(value) => (draft.fromBucket = value as Bucket)"
        />
        <BaseSelect
          :model-value="draft.toBucket"
          label="移动到哪个桶"
          :options="BUCKET_OPTIONS"
          @update:model-value="(value) => (draft.toBucket = value as Bucket)"
        />
      </div>

      <p v-if="!editing && transferPreview" class="form__hint">
        资金流向：{{ transferPreview }}（桶间移动不会产生新的收入）
      </p>
      <p v-if="!editing && draft.type === 'adjustment'" class="form__hint">
        调整会把金额直接加到目标桶，用于修正与真实银行账户对不上的情况，不会计入收入。
      </p>

      <BaseInput v-model="draft.note" label="备注" placeholder="用途说明，便于以后核对" />
      <p v-if="error" class="form__error">{{ error }}</p>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">取消</BaseButton>
      <BaseButton variant="primary" :loading="saving" @click="submit">
        {{ editing ? '保存备注' : '保存交易' }}
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
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.form__hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.form__error {
  color: var(--danger);
  font-size: 12px;
}
</style>
