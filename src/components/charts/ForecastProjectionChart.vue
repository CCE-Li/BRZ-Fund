<script setup lang="ts">
import { computed } from 'vue';
import BaseChart from '@/components/charts/BaseChart.vue';
import { buildProjectionOption } from '@/composables/chartOptions';
import type { ProjectionPoint } from '@/domain/forecast';
import type { MonthKey } from '@/types/models';

const props = withDefaults(
  defineProps<{
    data: {
      historicalMonths: MonthKey[];
      historical: number[];
      projection: ProjectionPoint[];
      target: number;
      deadline: string;
      currency: string;
      locale: string;
    };
    height?: number;
  }>(),
  { height: 280 },
);

const option = computed(() =>
  buildProjectionOption({
    historicalMonths: props.data.historicalMonths,
    historical: props.data.historical,
    projection: props.data.projection,
    target: props.data.target,
    deadline: props.data.deadline,
    currency: props.data.currency,
    locale: props.data.locale,
  }),
);

const empty = computed(
  () => props.data.historicalMonths.length === 0 && props.data.projection.length === 0,
);
</script>

<template>
  <BaseChart
    :option="option"
    :height="height"
    :empty="empty"
    empty-text="还没有足够的数据绘制投影"
  />
</template>
