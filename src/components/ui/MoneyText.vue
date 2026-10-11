<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney } from '@/utils/money';

const props = withDefaults(
  defineProps<{
    cents: number;
    currency?: string;
    locale?: string;
    tone?: 'default' | 'positive' | 'negative' | 'muted';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    signed?: boolean;
  }>(),
  {
    currency: 'CNY',
    locale: 'zh-CN',
    tone: 'default',
    size: 'md',
    signed: false,
  },
);

const text = computed(() => {
  const formatted = formatMoney(props.cents, props.currency, props.locale);
  if (!props.signed) return formatted;
  if (props.cents > 0) return `+${formatted}`;
  return formatted;
});
</script>

<template>
  <span class="money" :class="[`money--${tone}`, `money--${size}`]">{{ text }}</span>
</template>

<style scoped>
.money {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.money--default {
  color: var(--text);
}

.money--positive {
  color: var(--accent);
}

.money--negative {
  color: var(--danger);
}

.money--muted {
  color: var(--text-secondary);
}

.money--sm {
  font-size: 12px;
}

.money--md {
  font-size: 14px;
}

.money--lg {
  font-size: 18px;
  font-weight: 600;
}

.money--xl {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
</style>
