<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  baseChartOption,
  echarts,
  ensureEChartsRegistered,
  readChartPalette,
  type ChartOption,
} from '@/composables/useECharts';

const props = withDefaults(
  defineProps<{
    option: ChartOption;
    height?: number;
    empty?: boolean;
    emptyText?: string;
  }>(),
  {
    height: 260,
    empty: false,
    emptyText: '暂无可展示的数据',
  },
);

const container = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ReturnType<typeof echarts.init> | null>(null);
let observer: ResizeObserver | null = null;

function render(): void {
  if (!chart.value) return;
  const palette = readChartPalette();
  chart.value.setOption(
    {
      ...baseChartOption(palette),
      ...props.option,
    },
    { notMerge: true },
  );
}

onMounted(() => {
  if (!container.value || props.empty) return;
  ensureEChartsRegistered();
  chart.value = echarts.init(container.value, undefined, { renderer: 'canvas' });
  render();
  observer = new ResizeObserver(() => {
    chart.value?.resize();
  });
  observer.observe(container.value);
});

watch(
  () => props.option,
  () => render(),
  { deep: true },
);

watch(
  () => props.empty,
  (empty) => {
    if (empty) {
      chart.value?.dispose();
      chart.value = null;
      return;
    }
    if (!chart.value && container.value) {
      ensureEChartsRegistered();
      chart.value = echarts.init(container.value, undefined, { renderer: 'canvas' });
      render();
    }
  },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart.value?.dispose();
  chart.value = null;
});

defineExpose({ resize: () => chart.value?.resize() });
</script>

<template>
  <div class="chart">
    <div v-if="empty" class="chart__empty" :style="{ height: `${height}px` }">
      {{ emptyText }}
    </div>
    <div v-else ref="container" class="chart__canvas" :style="{ height: `${height}px` }" />
  </div>
</template>

<style scoped>
.chart {
  width: 100%;
}

.chart__canvas {
  width: 100%;
}

.chart__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}
</style>
