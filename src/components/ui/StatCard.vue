<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string;
    hint?: string;
    tone?: 'default' | 'accent' | 'info' | 'warning' | 'danger';
    size?: 'md' | 'lg';
  }>(),
  {
    hint: '',
    tone: 'default',
    size: 'md',
  },
);
</script>

<template>
  <div class="stat" :class="`stat--${tone}`">
    <p class="stat__label">{{ label }}</p>
    <p class="stat__value" :class="size === 'lg' ? 'stat__value--lg' : ''">{{ value }}</p>
    <p v-if="hint" class="stat__hint">{{ hint }}</p>
    <slot />
  </div>
</template>

<style scoped>
.stat {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat__label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat__value {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  overflow-wrap: anywhere;
}

.stat__value--lg {
  font-size: 26px;
  letter-spacing: -0.01em;
}

.stat__hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.stat--accent .stat__value {
  color: var(--accent);
}

.stat--info .stat__value {
  color: var(--info);
}

.stat--warning .stat__value {
  color: var(--warning);
}

.stat--danger .stat__value {
  color: var(--danger);
}
</style>
