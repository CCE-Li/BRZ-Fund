<script setup lang="ts">
import { computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    label?: string;
    type?: 'text' | 'number' | 'date' | 'password' | 'email';
    placeholder?: string;
    hint?: string;
    error?: string | null;
    disabled?: boolean;
    min?: string | number;
    max?: string | number;
    step?: string | number;
    inputmode?: 'text' | 'decimal' | 'numeric';
    suffix?: string;
  }>(),
  {
    type: 'text',
    placeholder: '',
    hint: '',
    error: null,
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [];
  enter: [];
}>();

const inputId = useId();
const describedBy = computed(() => {
  if (props.error) return `${inputId}-error`;
  if (props.hint) return `${inputId}-hint`;
  return undefined;
});

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="field">
    <label v-if="label" :for="inputId" class="field__label">{{ label }}</label>
    <div class="field__control" :class="{ 'field__control--error': !!error }">
      <input
        :id="inputId"
        class="field__input"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        :inputmode="inputmode"
        :aria-invalid="!!error"
        :aria-describedby="describedBy"
        @input="onInput"
        @blur="emit('blur')"
        @keydown.enter="emit('enter')"
      />
      <span v-if="suffix" class="field__suffix">{{ suffix }}</span>
    </div>
    <p v-if="error" :id="`${inputId}-error`" class="field__error">{{ error }}</p>
    <p v-else-if="hint" :id="`${inputId}-hint`" class="field__hint">{{ hint }}</p>
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

.field__control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-input);
  padding: 0 var(--space-3);
  transition: border-color var(--transition);
}

.field__control:focus-within {
  border-color: var(--info);
}

.field__control--error {
  border-color: var(--danger);
}

.field__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  padding: 7px 0;
  font-variant-numeric: tabular-nums;
}

.field__input:disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.field__suffix {
  color: var(--text-tertiary);
  font-size: 12px;
  flex-shrink: 0;
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
