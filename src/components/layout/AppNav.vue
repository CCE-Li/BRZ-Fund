<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import { computed } from 'vue';

interface NavItem {
  name: string;
  label: string;
  icon: string;
}

const items: readonly NavItem[] = [
  { name: 'dashboard', label: '总览', icon: '◧' },
  { name: 'opportunities', label: '机会', icon: '◇' },
  { name: 'allocations', label: '分配', icon: '⇄' },
  { name: 'transactions', label: '流水', icon: '≡' },
  { name: 'forecast', label: '预测', icon: '◈' },
  { name: 'settings', label: '设置', icon: '⚙' },
];

const props = withDefaults(defineProps<{ variant?: 'sidebar' | 'bottom' }>(), {
  variant: 'sidebar',
});

const route = useRoute();
const activeName = computed(() => String(route.name ?? ''));
</script>

<template>
  <nav :class="variant === 'sidebar' ? 'nav nav--sidebar' : 'nav nav--bottom'" aria-label="主导航">
    <RouterLink
      v-for="item in items"
      :key="item.name"
      :to="{ name: item.name }"
      class="nav__item"
      :class="{ 'nav__item--active': activeName === item.name }"
    >
      <span class="nav__icon" aria-hidden="true">{{ item.icon }}</span>
      <span class="nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav {
  display: flex;
  gap: var(--space-1);
}

.nav--sidebar {
  flex-direction: column;
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
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  color: var(--text-secondary);
  font-size: 13px;
  text-decoration: none;
  transition:
    background var(--transition),
    color var(--transition);
}

.nav__item:hover {
  background: var(--bg-hover);
  color: var(--text);
  text-decoration: none;
}

.nav__item--active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}

.nav__icon {
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.nav--bottom .nav__item {
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  font-size: 11px;
  flex: 1;
  border-radius: 0;
}

@media (max-width: 900px) {
  .nav--sidebar {
    flex-direction: row;
    overflow-x: auto;
  }

  .nav--sidebar .nav__item {
    flex-shrink: 0;
  }
}
</style>
