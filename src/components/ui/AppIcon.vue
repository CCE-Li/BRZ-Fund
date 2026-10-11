<script setup lang="ts">
import { computed } from 'vue';
import { ICONS, type IconDefinition } from '@/components/ui/icons';

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 16,
    strokeWidth: 1.5,
  },
);

const EMPTY: IconDefinition = { paths: [] };
const icon = computed<IconDefinition>(() => ICONS[props.name] ?? EMPTY);
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke-width="strokeWidth"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle
      v-for="(circle, index) in icon.circles ?? []"
      :key="`c${index}`"
      :cx="circle.cx"
      :cy="circle.cy"
      :r="circle.r"
    />
    <path v-for="(item, index) in icon.paths ?? []" :key="`p${index}`" :d="item" />
  </svg>
</template>

<style scoped>
.icon {
  display: block;
  flex-shrink: 0;
}
</style>
