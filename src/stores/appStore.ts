import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AppSettings, DatabaseMeta } from '@/types/models';
import { createDefaultSettings, normalizeSettings } from '@/domain/defaults';
import { getMeta } from '@/repositories/metaRepository';
import { loadSettings } from '@/services/settingsService';
import { probeIndexedDb } from '@/db/database';
import { toErrorMessage } from '@/utils/errors';

export type BootStatus = 'idle' | 'loading' | 'ready' | 'failed';

let bootPromise: Promise<void> | null = null;

export const useAppStore = defineStore('app', () => {
  const bootStatus = ref<BootStatus>('idle');
  const bootError = ref<string | null>(null);
  const settings = ref<AppSettings>(createDefaultSettings());
  const meta = ref<DatabaseMeta | null>(null);

  const theme = computed(() => settings.value.theme);
  const currency = computed(() => settings.value.currency);
  const locale = computed(() => settings.value.locale);
  const onboarded = computed(() => meta.value?.onboarded ?? false);
  const userCleared = computed(() => meta.value?.userCleared ?? false);
  const lastBackupAt = computed(() => settings.value.lastBackupAt);
  /** 引导是否已经结束（成功或失败），供路由守卫判断是否可以决定跳转。 */
  const bootSettled = computed(() => bootStatus.value === 'ready' || bootStatus.value === 'failed');

  function applyTheme(next: AppSettings['theme']): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset['theme'] = next;
  }

  async function setTheme(next: AppSettings['theme']): Promise<void> {
    const { applySettingsPatch } = await import('@/services/settingsService');
    const updated = await applySettingsPatch({ theme: next });
    settings.value = updated;
    applyTheme(updated.theme);
  }

  function applySettings(next: AppSettings): void {
    settings.value = normalizeSettings(next);
    applyTheme(settings.value.theme);
  }

  /**
   * 启动引导：先探测 IndexedDB 可用性 → 读取设置与元信息 → 设定主题。
   * 任何失败都会把状态置为 failed 并保留错误信息，界面展示错误页而不是空数据。
   */
  async function bootstrap(): Promise<void> {
    if (bootPromise) return bootPromise;
    bootStatus.value = 'loading';
    bootPromise = (async () => {
      try {
        const available = await probeIndexedDb();
        if (!available) {
          throw new Error(
            '当前浏览器环境不可用或禁止了 IndexedDB，BRZ Fund 无法安全保存数据。请更换浏览器或退出隐私模式后重试。',
          );
        }
        const [loadedSettings, loadedMeta] = await Promise.all([loadSettings(), getMeta()]);
        applySettings(loadedSettings);
        meta.value = loadedMeta;
        bootStatus.value = 'ready';
      } catch (error) {
        bootStatus.value = 'failed';
        bootError.value = toErrorMessage(error);
        throw error;
      }
    })();
    return bootPromise;
  }

  function setMeta(next: DatabaseMeta | null): void {
    meta.value = next;
  }

  function refreshMeta(): Promise<void> {
    return getMeta().then((next) => {
      meta.value = next;
    });
  }

  function resetForTests(): void {
    bootPromise = null;
    bootStatus.value = 'idle';
    bootError.value = null;
    settings.value = createDefaultSettings();
    meta.value = null;
  }

  return {
    bootStatus,
    bootError,
    settings,
    meta,
    theme,
    currency,
    locale,
    onboarded,
    userCleared,
    lastBackupAt,
    bootSettled,
    bootstrap,
    setTheme,
    applySettings,
    setMeta,
    refreshMeta,
    resetForTests,
  };
});
