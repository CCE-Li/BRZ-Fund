<script setup lang="ts">
import { computed } from 'vue';

/**
 * 分段进度条：参考图中「用量限额」的块状进度条。
 * 填充块为亮色，剩余块为暗色轨道；块数固定，因此视觉上能一眼看出比例。
 */
const props = withDefaults(
  defineProps<{
    percent: number;
    tone?: 'accent' | 'info' | 'warning' | 'danger' | 'violet';
    label?: string;
    valueLabel?: string;
    /** 方块数量。 */
    blocks?: number;
    /** 方块高度（px）。 */
    height?: number;
  }>(),
  {
    tone: 'accent',
    label: '',
    valueLabel: '',
    blocks: 32,
    height: 10,
  },
);

const clamped = computed(() => Math.max(0, Math.min(100, props.percent)));
const filledBlocks = computed(() => Math.round((clamped.value / 100) * props.blocks));

const toneVar = computed(() => {
  const map: Record<string, string> = {
    accent: 'var(--accent)',
    info: 'var(--info)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    violet: 'var(--violet)',
  };
  return map[props.tone] ?? 'var(--accent)';
});
</script>

<template>
  <div class="pbar">
    <div v-if="label || valueLabel" class="pbar__meta">
      <span class="pbar__label">{{ label }}</span>
      <span class="pbar__value">{{ valueLabel }}</span>
    </div>
    <div
      class="pbar__blocks"
      :style="{ height: `${height}px` }"
      role="progressbar"
      :aria-valuenow="clamped"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="label || undefined"
    >
      <span
        v-for="index in blocks"
        :key="index"
        class="pbar__block"
        :class="{ 'pbar__block--on': index <= filledBlocks }"
        :style="index <= filledBlocks ? { background: toneVar } : undefined"
      />
    </div>
  </div>
</template>

<style scoped>
.pbar {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.pbar__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 12px;
}

.pbar__label {
  color: var(--text-secondary);
}

.pbar__value {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.pbar__blocks {
  display: flex;
  gap: 2px;
  width: 100%;
}

.pbar__block {
  flex: 1 1 0;
  min-width: 1px;
  background: var(--bg-track);
  border-radius: 1px;
}

.pbar__block--on {
  opacity: 0.92;
}
</style>
