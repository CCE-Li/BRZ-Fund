<script setup lang="ts">
import { useId } from 'vue';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly SelectOption[];
    label?: string;
    hint?: string;
    error?: string | null;
    disabled?: boolean;
    placeholder?: string;
  }>(),
  {
    label: '',
    hint: '',
    error: null,
    disabled: false,
    placeholder: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const selectId = useId();

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <div class="field">
    <label v-if="label" :for="selectId" class="field__label">{{ label }}</label>
    <select
      :id="selectId"
      class="field__select"
      :class="{ 'field__select--error': !!error }"
      :value="modelValue"
      :disabled="disabled"
      @change="onChange"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <p v-if="error" class="field__error">{{ error }}</p>
    <p v-else-if="hint" class="field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.field__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.field__select {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-input);
  color: var(--text);
  padding: 7px var(--space-3);
  outline: none;
  transition: border-color var(--transition);
}

.field__select:focus {
  border-color: var(--info);
}

.field__select--error {
  border-color: var(--danger);
}

.field__select:disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.field__error {
  font-size: 12px;
  color: var(--danger);
}

.field__hint {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
