<script setup lang="ts">
import { computed } from 'vue';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    block?: boolean;
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    block: false,
  },
);

const classes = computed(() => [
  'btn',
  `btn--${props.variant}`,
  `btn--${props.size}`,
  { 'btn--block': props.block, 'btn--loading': props.loading },
]);
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading">
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border-radius: var(--radius);
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  transition:
    background var(--transition),
    border-color var(--transition),
    color var(--transition);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn--md {
  padding: 7px 14px;
}

.btn--lg {
  padding: 10px 20px;
  font-size: 15px;
}

.btn--block {
  width: 100%;
}

.btn--primary {
  background: var(--accent-strong);
  color: var(--text-inverse);
}

.btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn--secondary {
  background: var(--bg-panel);
  border-color: var(--border);
  color: var(--text);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.btn--ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}

.btn--danger {
  background: var(--danger-soft);
  border-color: var(--danger);
  color: var(--danger);
}

.btn--danger:hover:not(:disabled) {
  background: var(--danger);
  color: var(--text-inverse);
}

.btn--link {
  background: transparent;
  color: var(--info);
  padding-left: 0;
  padding-right: 0;
}

.btn--link:hover:not(:disabled) {
  text-decoration: underline;
}

.btn__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: btn-spin 0.6s linear infinite;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
