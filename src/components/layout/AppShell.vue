<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppNav from '@/components/layout/AppNav.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import ToastHost from '@/components/ui/ToastHost.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { useAppStore } from '@/stores/appStore';

const app = useAppStore();
const route = useRoute();

const PAGE_META: Record<string, { title: string; icon: string }> = {
  dashboard: { title: '总览', icon: 'grid' },
  opportunities: { title: '收入机会', icon: 'target' },
  allocations: { title: '资金分配', icon: 'swap' },
  transactions: { title: '收支流水', icon: 'list' },
  forecast: { title: '购车预测', icon: 'trend' },
  settings: { title: '设置', icon: 'sliders' },
};

const page = computed(() => PAGE_META[String(route.name ?? '')] ?? { title: 'BRZ Fund', icon: 'grid' });

async function toggleTheme(): Promise<void> {
  await app.setTheme(app.theme === 'dark' ? 'light' : 'dark');
}
</script>

<template>
  <div class="shell">
    <aside class="shell__rail">
      <div class="shell__brand" aria-hidden="true">B</div>
      <AppNav variant="sidebar" />
      <div class="shell__rail-footer">
        <button
          class="shell__rail-button"
          type="button"
          :title="app.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          :aria-label="app.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          @click="toggleTheme"
        >
          <AppIcon :name="app.theme === 'dark' ? 'sun' : 'moon'" :size="17" />
        </button>
      </div>
    </aside>

    <div class="shell__main">
      <header class="shell__topbar">
        <div class="shell__title-group">
          <span class="shell__mark" aria-hidden="true" />
          <AppIcon :name="page.icon" :size="15" class="shell__title-icon" />
          <span class="shell__title">{{ page.title }}</span>
        </div>
        <div class="shell__topbar-actions">
          <span
            class="shell__status"
            :class="app.onboarded ? 'shell__status--ok' : 'shell__status--warn'"
            :title="app.onboarded ? '数据保存在本机浏览器中' : '尚未完成初始化向导'"
          >
            <AppIcon name="database" :size="13" />
            <span class="shell__status-text">{{ app.onboarded ? '本地存储' : '未初始化' }}</span>
          </span>
        </div>
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

.shell__rail {
  border-right: 1px solid var(--border);
  background: var(--bg-elevated);
  padding: var(--space-3) 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  position: sticky;
  top: 0;
  height: 100vh;
}

.shell__brand {
  width: 28px;
  height: 28px;
  border-radius: var(--radius);
  border: 1px solid var(--border-strong);
  background: var(--bg-panel);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
}

.shell__rail-footer {
  margin-top: auto;
}

.shell__rail-button {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition:
    background var(--transition),
    color var(--transition);
}

.shell__rail-button:hover {
  background: var(--bg-hover);
  color: var(--text);
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
  gap: var(--space-4);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
}

.shell__title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.shell__mark {
  width: 3px;
  height: 14px;
  background: var(--border-strong);
  border-radius: 1px;
  transform: skewX(-14deg);
  flex-shrink: 0;
}

.shell__title-icon {
  color: var(--text-tertiary);
}

.shell__title {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.shell__topbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.shell__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

.shell__status--ok {
  border-color: var(--border-strong);
  color: var(--text-secondary);
}

.shell__status--warn {
  border-color: var(--warning);
  color: var(--warning);
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

  .shell__rail {
    position: static;
    height: auto;
    flex-direction: row;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-right: none;
    border-bottom: 1px solid var(--border);
    gap: var(--space-3);
  }

  .shell__rail-footer {
    margin-top: 0;
  }

  .shell__status-text {
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
