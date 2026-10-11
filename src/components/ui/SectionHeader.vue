<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue';

/**
 * 区块标题：参考图中每个区块以「斜杠标记 + 图标 + 标题 + 右侧说明」开头。
 */
withDefaults(
  defineProps<{
    title: string;
    caption?: string;
    icon?: string;
    sub?: string;
  }>(),
  {
    caption: '',
    icon: '',
    sub: '',
  },
);
</script>

<template>
  <header class="section">
    <span class="section__mark" aria-hidden="true" />
    <AppIcon v-if="icon" :name="icon" :size="14" class="section__icon" />
    <h2 class="section__title">{{ title }}</h2>
    <span v-if="sub" class="section__sub">{{ sub }}</span>
    <span v-if="caption || $slots.caption" class="section__caption">
      <slot name="caption">{{ caption }}</slot>
    </span>
  </header>
</template>

<style scoped>
.section {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
}

.section__mark {
  width: 4px;
  height: 14px;
  background: var(--border-strong);
  border-radius: 1px;
  transform: skewX(-14deg);
  flex-shrink: 0;
}

.section__icon {
  color: var(--text-tertiary);
}

.section__title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text);
}

.section__sub {
  font-size: 12px;
  color: var(--text-tertiary);
}

.section__caption {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.02em;
}
</style>
