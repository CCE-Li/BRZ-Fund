<script setup lang="ts">
import { computed } from 'vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import { centsToInput, parseMoneyToCents } from '@/utils/money';

const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    label?: string;
    hint?: string;
    placeholder?: string;
    currency?: string;
    disabled?: boolean;
    required?: boolean;
    allowNegative?: boolean;
    tone?: 'default' | 'danger';
  }>(),
  {
    label: '',
    hint: '',
    placeholder: '0.00',
    currency: '元',
    disabled: false,
    required: false,
    allowNegative: false,
    tone: 'default',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
  validity: [valid: boolean];
}>();

const text = computed(() => (props.modelValue === null ? '' : centsToInput(props.modelValue)));

const error = computed<string | null>(() => {
  if (props.modelValue === null) return null;
  if (!props.allowNegative && props.modelValue < 0) return '金额不能为负数';
  return null;
});

function onUpdate(value: string): void {
  if (value.trim() === '') {
    emit('update:modelValue', null);
    emit('validity', !props.required);
    return;
  }
  const parsed = parseMoneyToCents(value);
  if (parsed === null || (!props.allowNegative && parsed < 0)) {
    emit('validity', false);
    return;
  }
  emit('update:modelValue', parsed);
  emit('validity', true);
}
</script>

<template>
  <BaseInput
    :model-value="text"
    :label="label"
    :hint="hint"
    :placeholder="placeholder"
    :disabled="disabled"
    :error="error"
    :suffix="currency"
    inputmode="decimal"
    @update:model-value="onUpdate"
  />
</template>
