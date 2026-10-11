<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import { computed } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';

interface NavItem {
  name: string;
  label: string;
  icon: string;
}

const items: readonly NavItem[] = [
  { name: 'dashboard', label: '总览', icon: 'grid' },
  { name: 'opportunities', label: '机会', icon: 'target' },
  { name: 'allocations', label: '分配', icon: 'swap' },
  { name: 'transactions', label: '流水', icon: 'list' },
  { name: 'forecast', label: '预测', icon: 'trend' },
  { name: 'settings', label: '设置', icon: 'sliders' },
];

const props = withDefaults(defineProps<{ variant?: 'sidebar' | 'bottom' }>(), {
  variant: 'sidebar',
});

const route = useRoute();
const activeName = computed(() => String(route.name ?? ''));
</script>

<template>
  <nav :class="variant === 'sidebar' ? 'nav nav--rail' : 'nav nav--bottom'" aria-label="主导航">
    <RouterLink
      v-for="item in items"
      :key="item.name"
      :to="{ name: item.name }"
      class="nav__item"
      :class="{ 'nav__item--active': activeName === item.name }"
      :title="variant === 'sidebar' ? item.label : undefined"
      :aria-label="item.label"
    >
      <AppIcon :name="item.icon" :size="variant === 'sidebar' ? 18 : 20" />
      <span class="nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav {
  display: flex;
}

.nav--rail {
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.nav--bottom {
  flex-direction: row;
  justify-content: space-around;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

.nav__item {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  text-decoration: none;
  border-radius: var(--radius);
  transition:
    background var(--transition),
    color var(--transition);
}

.nav--rail .nav__item {
  width: 38px;
  height: 38px;
}

.nav--rail .nav__label {
  display: none;
}

.nav__item:hover {
  background: var(--bg-hover);
  color: var(--text);
  text-decoration: none;
}

.nav__item--active {
  background: var(--bg-panel);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--border);
}

.nav--bottom .nav__item {
  flex-direction: column;
  gap: 3px;
  padding: var(--space-2) var(--space-3);
  flex: 1;
  border-radius: 0;
  font-size: 11px;
}

.nav--bottom .nav__label {
  font-size: 11px;
  color: currentColor;
}

@media (max-width: 900px) {
  .nav--rail {
    flex-direction: row;
    justify-content: flex-start;
    overflow-x: auto;
    gap: var(--space-2);
  }

  .nav--rail .nav__item {
    width: 38px;
    height: 38px;
    flex-shrink: 0;
  }
}
</style>
