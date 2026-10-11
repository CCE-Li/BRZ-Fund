<script setup lang="ts">
import { computed } from 'vue';
import BaseChart from '@/components/charts/BaseChart.vue';
import { buildFundGrowthOption } from '@/composables/chartOptions';
import type { SavingsGoal, Transaction } from '@/types/models';

const props = withDefaults(
  defineProps<{
    transactions: readonly Transaction[];
    goal: SavingsGoal | null;
    currency: string;
    locale: string;
    height?: number;
  }>(),
  { height: 280 },
);

const result = computed(() =>
  buildFundGrowthOption({
    transactions: props.transactions,
    goal: props.goal,
    currency: props.currency,
    locale: props.locale,
  }),
);

const empty = computed(() => props.transactions.filter((item) => !item.voidedAt).length === 0);
</script>

<template>
  <BaseChart
    :option="result.option"
    :height="height"
    :empty="empty"
    empty-text="还没有资金记录，暂时画不出增长曲线"
  />
</template>
