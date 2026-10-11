<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppNav from '@/components/layout/AppNav.vue';
import ToastHost from '@/components/ui/ToastHost.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { useAppStore } from '@/stores/appStore';

const app = useAppStore();
const route = useRoute();

const pageTitle = computed(() => {
  const name = String(route.name ?? '');
  const map: Record<string, string> = {
    dashboard: '总览',
    opportunities: '收入机会',
    allocations: '资金分配',
    transactions: '收支流水',
    forecast: '购车预测',
    settings: '设置',
  };
  return map[name] ?? 'BRZ Fund';
});

async function toggleTheme(): Promise<void> {
  await app.setTheme(app.theme === 'dark' ? 'light' : 'dark');
}
</script>

<template>
  <div class="shell">
    <aside class="shell__sidebar">
      <div class="shell__brand">
        <span class="shell__logo" aria-hidden="true">B</span>
        <div class="shell__brand-text">
          <span class="shell__brand-name">BRZ Fund</span>
          <span class="shell__brand-sub">购车目标财务台账</span>
        </div>
      </div>
      <AppNav variant="sidebar" />
      <div class="shell__sidebar-footer">
        <p class="shell__storage-note" :class="{ 'shell__storage-note--warn': !app.onboarded }">
          数据保存在本机浏览器中，不会自动同步到其它设备。
        </p>
      </div>
    </aside>

    <div class="shell__main">
      <header class="shell__topbar">
        <span class="shell__topbar-title">{{ pageTitle }}</span>
        <button class="shell__theme-toggle" type="button" @click="toggleTheme">
          {{ app.theme === 'dark' ? '浅色' : '深色' }}主题
        </button>
      </header>
      <main class="shell__content">
        <RouterView />
      </main>
    </div>

    <div class="shell__bottom">
      <AppNav variant="bottom" />
    </div>

    <ToastHost />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
}

.shell__sidebar {
  border-right: 1px solid var(--border);
  background: var(--bg-elevated);
  padding: var(--space-4) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.shell__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-2);
}

.shell__logo {
  width: 30px;
  height: 30px;
  border-radius: var(--radius);
  background: var(--accent-strong);
  color: var(--text-inverse);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}

.shell__brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.shell__brand-name {
  font-weight: 600;
}

.shell__brand-sub {
  font-size: 11px;
  color: var(--text-tertiary);
}

.shell__sidebar-footer {
  margin-top: auto;
}

.shell__storage-note {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.6;
  padding: 0 var(--space-2);
}

.shell__storage-note--warn {
  color: var(--warning);
}

.shell__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.shell__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
}

.shell__topbar-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.shell__theme-toggle {
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text-secondary);
  border-radius: var(--radius);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.shell__theme-toggle:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.shell__content {
  padding: var(--space-5);
  max-width: var(--content-max);
  width: 100%;
  margin: 0 auto;
}

.shell__bottom {
  display: none;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .shell__sidebar {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .shell__sidebar-footer {
    display: none;
  }

  .shell__content {
    padding: var(--space-4) var(--space-3) 88px;
  }

  .shell__bottom {
    display: block;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 20;
  }
}
</style>
