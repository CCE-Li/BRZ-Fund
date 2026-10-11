<script setup lang="ts">
import { computed } from 'vue';

/**
 * 分段块状条形图 —— 参考图的标志性元素。
 * 每个时间段一个方块，方块内底部为亮色条（高度按数值占比），其余为暗色轨道。
 * 所有高度都由传入的真实数据决定，不做装饰性填充。
 */
const props = withDefaults(
  defineProps<{
    values: readonly number[];
    color?: string;
    height?: number;
    gap?: number;
    /** 高亮最后一个方块（通常代表当前周期）。 */
    highlightLast?: boolean;
    maxBlocks?: number;
  }>(),
  {
    color: 'var(--accent)',
    height: 30,
    gap: 3,
    highlightLast: true,
    maxBlocks: 14,
  },
);

const blocks = computed(() => {
  const source = props.values.slice(-props.maxBlocks);
  const max = Math.max(...source, 0);
  return source.map((value, index) => {
    const ratio = max > 0 ? value / max : 0;
    return {
      key: index,
      percent: Math.max(0, Math.min(100, ratio * 100)),
      empty: value <= 0,
    };
  });
});

const hasData = computed(() => blocks.value.length > 0 && blocks.value.some((block) => !block.empty));
</script>

<template>
  <div
    class="segbar"
    :class="{ 'segbar--highlight': highlightLast }"
    :style="{ height: `${height}px`, gap: `${gap}px` }"
  >
    <div v-for="(block, index) in blocks" :key="block.key" class="segbar__block">
      <div
        class="segbar__fill"
        :class="{
          'segbar__fill--empty': block.empty,
          'segbar__fill--last': highlightLast && index === blocks.length - 1 && !block.empty,
        }"
        :style="{ height: `${block.empty ? 0 : Math.max(block.percent, 6)}%`, background: color }"
      />
    </div>
    <div v-if="!hasData" class="segbar__idle" aria-hidden="true" />
  </div>
</template>

<style scoped>
.segbar {
  display: flex;
  align-items: flex-end;
  width: 100%;
}

.segbar__block {
  position: relative;
  flex: 1 1 0;
  min-width: 2px;
  height: 100%;
  background: var(--bg-track);
  border-radius: 2px;
  overflow: hidden;
}

.segbar__fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 2px;
  opacity: 0.55;
  transition: height var(--transition);
}

.segbar__fill--last {
  opacity: 1;
}

.segbar--highlight .segbar__block:last-child {
  outline: 1px solid var(--border-strong);
  outline-offset: 0;
}

.segbar__idle {
  position: absolute;
}
</style>
