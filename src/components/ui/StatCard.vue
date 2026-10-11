<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue';

/**
 * 指标卡：等宽小标签 + 大号数字 + 可视化槽位 + 底部说明。
 * 与参考图的卡片结构一致（标签行 / 数值 / 分段条形图 / 说明）。
 */
withDefaults(
  defineProps<{
    label: string;
    value: string;
    hint?: string;
    icon?: string;
    /** 大号数字后的小号单位后缀，例如 CNY。 */
    unit?: string;
    tone?: 'default' | 'accent' | 'info' | 'warning' | 'danger' | 'violet';
    size?: 'md' | 'lg';
  }>(),
  {
    hint: '',
    icon: '',
    unit: '',
    tone: 'default',
    size: 'md',
  },
);
</script>

<template>
  <div class="tile" :class="[`tile--${tone}`, size === 'lg' ? 'tile--lg' : '']">
    <div class="tile__head">
      <AppIcon v-if="icon" :name="icon" :size="13" class="tile__icon" />
      <span class="tile__label">{{ label }}</span>
    </div>

    <p class="tile__value">
      <span class="tile__number">{{ value }}</span>
      <span v-if="unit" class="tile__unit">{{ unit }}</span>
    </p>

    <div v-if="$slots.default" class="tile__viz">
      <slot />
    </div>

    <p v-if="hint" class="tile__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.tile {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.tile__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.tile__icon {
  color: var(--text-tertiary);
}

.tile__label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile__value {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.tile__number {
  font-size: clamp(20px, 1.8vw, 26px);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.tile--lg .tile__number {
  font-size: clamp(22px, 2vw, 30px);
}

.tile__unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}

.tile__viz {
  margin-top: auto;
}

.tile__hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}

.tile--accent .tile__number {
  color: var(--accent);
}

.tile--info .tile__number {
  color: var(--info);
}

.tile--warning .tile__number {
  color: var(--warning);
}

.tile--danger .tile__number {
  color: var(--danger);
}

.tile--violet .tile__number {
  color: var(--violet);
}
</style>
