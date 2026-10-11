<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    percent: number;
    tone?: 'accent' | 'info' | 'warning' | 'danger';
    label?: string;
    valueLabel?: string;
    height?: number;
  }>(),
  {
    tone: 'accent',
    label: '',
    valueLabel: '',
    height: 8,
  },
);

const clamped = computed(() => Math.max(0, Math.min(100, props.percent)));
</script>

<template>
  <div class="progress">
    <div v-if="label || valueLabel" class="progress__meta">
      <span>{{ label }}</span>
      <span class="progress__value">{{ valueLabel }}</span>
    </div>
    <div
      class="progress__track"
      :style="{ height: `${height}px` }"
      role="progressbar"
      :aria-valuenow="clamped"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="label || undefined"
    >
      <div class="progress__fill" :class="`progress__fill--${tone}`" :style="{ width: `${clamped}%` }" />
    </div>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.progress__meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}

.progress__value {
  font-variant-numeric: tabular-nums;
}

.progress__track {
  width: 100%;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  overflow: hidden;
}

.progress__fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 300ms ease;
}

.progress__fill--accent {
  background: var(--accent);
}

.progress__fill--info {
  background: var(--info);
}

.progress__fill--warning {
  background: var(--warning);
}

.progress__fill--danger {
  background: var(--danger);
}
</style>
