<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import ErrorBanner from '@/components/ui/ErrorBanner.vue';
import GoalSettingsForm from '@/components/forms/GoalSettingsForm.vue';
import AllocationRatioForm from '@/components/forms/AllocationRatioForm.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import {
  clearAllData,
  exportBackupJson,
  exportIncomesCsv,
  exportTransactionsCsv,
  importBackupFromText,
  parseBackupText,
  type BackupValidationResult,
} from '@/services/backupService';
import { loadSettings } from '@/services/settingsService';
import {
  estimateStorage,
  isStoragePersisted,
  requestPersistentStorage,
  type StorageEstimateInfo,
} from '@/db/database';
import { formatDateDisplay } from '@/utils/date';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';

const app = useAppStore();
const finance = useFinanceStore();
const toast = useToast();
const { confirm } = useConfirm();

const THEME_OPTIONS = [
  { value: 'dark', label: '深色（默认）' },
  { value: 'light', label: '浅色' },
];

const themeSelection = ref(app.theme);
const themeSaving = ref(false);
const busy = ref<string | null>(null);
const error = ref<string | null>(null);
const importPreview = ref<BackupValidationResult | null>(null);
const importText = ref('');
const persisted = ref<boolean | null>(null);
const estimate = ref<StorageEstimateInfo>({ usageInBytes: null, quotaInBytes: null });

const lastBackupText = computed(() =>
  app.lastBackupAt ? formatDateDisplay(app.lastBackupAt.slice(0, 10)) : '从未导出备份',
);

const usageText = computed(() => {
  const { usageInBytes, quotaInBytes } = estimate.value;
  if (usageInBytes === null) return '无法获取（浏览器未提供）';
  const used = formatBytes(usageInBytes);
  if (quotaInBytes === null) return used;
  return `${used} / ${formatBytes(quotaInBytes)}`;
});

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

onMounted(async () => {
  persisted.value = await isStoragePersisted();
  estimate.value = await estimateStorage();
});

async function onThemeChange(value: string): Promise<void> {
  themeSelection.value = value as 'dark' | 'light';
  themeSaving.value = true;
  try {
    await app.setTheme(value as 'dark' | 'light');
    toast.success('主题已更新。');
  } catch (themeError) {
    toast.error(toErrorMessage(themeError));
  } finally {
    themeSaving.value = false;
  }
}

async function onExportJson(): Promise<void> {
  busy.value = 'export-json';
  error.value = null;
  try {
    const result = await exportBackupJson();
    app.applySettings(await loadSettings());
    toast.success(`已导出备份文件 ${result.filename}，请保存到本机之外的位置。`);
  } catch (exportError) {
    error.value = toErrorMessage(exportError);
  } finally {
    busy.value = null;
  }
}

async function onExportCsv(kind: 'income' | 'transactions'): Promise<void> {
  busy.value = `export-${kind}`;
  error.value = null;
  try {
    const result = kind === 'income' ? await exportIncomesCsv() : await exportTransactionsCsv();
    toast.success(`已导出 ${result.filename}，共 ${result.rowCount} 行。`);
  } catch (exportError) {
    error.value = toErrorMessage(exportError);
  } finally {
    busy.value = null;
  }
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  busy.value = 'import-read';
  error.value = null;
  importPreview.value = null;
  importText.value = '';
  try {
    const text = await file.text();
    importText.value = text;
    const validation = await parseBackupText(text);
    importPreview.value = validation;
    if (!validation.ok) {
      toast.error('备份文件校验未通过，现有数据未被修改。');
    } else {
      toast.info('校验通过，确认后才会覆盖现有数据。');
    }
  } catch (readError) {
    error.value = toErrorMessage(readError);
  } finally {
    busy.value = null;
  }
}

async function confirmImport(): Promise<void> {
  if (!importPreview.value?.ok) return;
  const confirmed = await confirm({
    title: '确认导入备份',
    message:
      '导入会用备份文件中的内容完整替换当前全部数据（目标、机会、收入、交易、分配、快照、设置）。此操作不可撤销，建议先导出一份当前数据。',
    confirmLabel: '覆盖导入',
    tone: 'danger',
    requireText: '覆盖导入',
  });
  if (!confirmed) return;

  busy.value = 'import';
  error.value = null;
  try {
    if (!importText.value) throw new Error('请重新选择备份文件。');
    const result = await importBackupFromText(importText.value, { confirmOverwrite: true });
    if (!result.ok) {
      error.value = result.errors.join('；');
      return;
    }
    app.applySettings(await loadSettings());
    await app.refreshMeta();
    await finance.reload(app.settings);
    importPreview.value = null;
    importText.value = '';
    toast.success('备份已导入，数据已恢复。');
  } catch (importError) {
    error.value = toErrorMessage(importError);
  } finally {
    busy.value = null;
  }
}

async function onClearData(): Promise<void> {
  const confirmed = await confirm({
    title: '清空全部数据',
    message:
      '这会删除目标、机会、收入、交易、分配、快照与设置。删除后不会自动重建默认数据，可以再通过导入备份恢复。建议先导出备份。',
    confirmLabel: '清空数据',
    tone: 'danger',
    requireText: '清空数据',
  });
  if (!confirmed) return;

  busy.value = 'clear';
  error.value = null;
  try {
    await clearAllData();
    await app.refreshMeta();
    app.applySettings(await loadSettings());
    await finance.reload(app.settings);
    toast.success('数据已清空。');
  } catch (clearError) {
    error.value = toErrorMessage(clearError);
  } finally {
    busy.value = null;
  }
}

async function onRequestPersist(): Promise<void> {
  busy.value = 'persist';
  try {
    const granted = await requestPersistentStorage();
    persisted.value = await isStoragePersisted();
    estimate.value = await estimateStorage();
    if (granted === null) {
      toast.warn('当前浏览器不支持申请持久化存储。');
    } else if (granted) {
      toast.success('已获得持久化存储许可，浏览器不会在磁盘紧张时自动清理数据。');
    } else {
      toast.warn('浏览器未授予持久化许可，数据仍可能被自动清理，请定期导出备份。');
    }
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="settings">
    <PageHeader title="设置" subtitle="目标、预算、分配比例与数据安全相关的选项。" />

    <ErrorBanner v-if="error" tone="danger" title="操作失败" :message="error" dismissible @dismiss="error = null" />

    <div class="settings__grid">
      <BaseCard title="购车目标与预算" subtitle="裸车价、附加费用与整备预算分别维护">
        <GoalSettingsForm />
      </BaseCard>

      <BaseCard title="分配比例与应急储备" subtitle="作为每次分配时的初始建议，不强制">
        <AllocationRatioForm />
      </BaseCard>

      <BaseCard title="外观与显示" subtitle="主题切换只影响界面，不影响数据">
        <BaseSelect
          :model-value="themeSelection"
          :options="THEME_OPTIONS"
          label="主题"
          :disabled="themeSaving"
          @update:model-value="onThemeChange"
        />
      </BaseCard>

      <BaseCard title="数据备份与恢复" subtitle="本地存储不是永久安全，请定期导出并保存到其它位置">
        <div class="settings__info">
          <div class="settings__row">
            <span>最近备份时间</span>
            <span class="settings__value">{{ lastBackupText }}</span>
          </div>
          <div class="settings__row">
            <span>当前货币单位</span>
            <span class="settings__value">{{ app.currency }}</span>
          </div>
          <div class="settings__row">
            <span>占用空间 / 配额</span>
            <span class="settings__value">{{ usageText }}</span>
          </div>
          <div class="settings__row">
            <span>持久化存储许可</span>
            <span class="settings__value">
              {{ persisted === null ? '未知' : persisted ? '已获得' : '未获得' }}
            </span>
          </div>
        </div>

        <div class="settings__actions">
          <BaseButton variant="primary" :loading="busy === 'export-json'" @click="onExportJson">
            导出全部数据（JSON）
          </BaseButton>
          <BaseButton
            variant="secondary"
            :loading="busy === 'export-income'"
            @click="onExportCsv('income')"
          >
            导出收入（CSV）
          </BaseButton>
          <BaseButton
            variant="secondary"
            :loading="busy === 'export-transactions'"
            @click="onExportCsv('transactions')"
          >
            导出流水（CSV）
          </BaseButton>
        </div>

        <div class="settings__import">
          <label class="settings__file">
            <input
              id="backup-file"
              type="file"
              accept="application/json,.json"
              :disabled="busy === 'import-read'"
              @change="onFileSelected"
            />
            <span>选择备份文件…</span>
          </label>
          <p class="settings__note">
            导入采用「先校验 → 再确认 → 事务覆盖」流程：校验不通过或你取消确认时，现有数据不会被改动。
          </p>

          <div v-if="importPreview" class="preview">
            <p v-if="!importPreview.ok" class="preview__title preview__title--error">
              备份文件校验未通过：
            </p>
            <ul v-if="!importPreview.ok" class="preview__errors">
              <li v-for="message in importPreview.errors.slice(0, 6)" :key="message">{{ message }}</li>
            </ul>
            <template v-else>
              <p class="preview__title">校验通过，将导入：</p>
              <ul class="preview__counts">
                <li>收入机会：{{ importPreview.counts?.['opportunities'] ?? 0 }} 条</li>
                <li>收入记录：{{ importPreview.counts?.['incomes'] ?? 0 }} 条</li>
                <li>交易流水：{{ importPreview.counts?.['transactions'] ?? 0 }} 条</li>
                <li>资金分配：{{ importPreview.counts?.['allocations'] ?? 0 }} 条</li>
                <li>预测快照：{{ importPreview.counts?.['snapshots'] ?? 0 }} 条</li>
              </ul>
              <div class="preview__actions">
                <BaseButton
                  variant="danger"
                  :loading="busy === 'import'"
                  @click="confirmImport"
                >
                  确认覆盖导入
                </BaseButton>
                <BaseButton variant="ghost" @click="importPreview = null">取消</BaseButton>
              </div>
            </template>
          </div>
        </div>

        <p class="settings__warning">
          数据默认保存在当前浏览器的当前网站源下，<strong>不会自动同步到其它浏览器或设备</strong>。
          清理浏览器数据、隐私模式、设备损坏都可能导致数据丢失；IndexedDB
          不保证永久保存，唯一可靠的保障是你在别处保留的备份文件。
        </p>
      </BaseCard>

      <BaseCard title="存储与危险操作" subtitle="删除前请先导出备份">
        <div class="settings__danger">
          <div>
            <p class="settings__danger-title">申请持久化存储许可</p>
            <p class="settings__note">
              授予后浏览器在磁盘紧张时不会自动清理本站数据（你手动清理仍然会生效）。
            </p>
          </div>
          <BaseButton
            variant="secondary"
            :loading="busy === 'persist'"
            :disabled="persisted === true"
            @click="onRequestPersist"
          >
            {{ persisted ? '已获得许可' : '申请持久化' }}
          </BaseButton>
        </div>

        <div class="settings__danger">
          <div>
            <p class="settings__danger-title">清空全部数据</p>
            <p class="settings__note">
              删除后不会自动重建默认数据，应用会停留在空状态；可以用导入备份恢复。操作需要输入确认文字。
            </p>
          </div>
          <BaseButton variant="danger" :loading="busy === 'clear'" @click="onClearData">
            清空数据
          </BaseButton>
        </div>
      </BaseCard>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.settings__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.settings__info {
  display: flex;
  flex-direction: column;
}

.settings__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
  color: var(--text-secondary);
}

.settings__row:last-child {
  border-bottom: none;
}

.settings__value {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.settings__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-top: var(--space-3);
}

.settings__import {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.settings__file {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}

.settings__file input {
  font-size: 12px;
  color: var(--text-secondary);
}

.settings__note {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.7;
}

.settings__warning {
  margin-top: var(--space-4);
  font-size: 12px;
  color: var(--warning);
  line-height: 1.7;
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-3);
}

.preview {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-3);
  background: var(--bg-panel);
}

.preview__title {
  font-size: 13px;
  margin-bottom: var(--space-2);
}

.preview__title--error {
  color: var(--danger);
}

.preview__errors {
  margin: 0;
  padding-left: var(--space-5);
  font-size: 12px;
  color: var(--danger);
  line-height: 1.7;
}

.preview__counts {
  margin: 0;
  padding-left: var(--space-5);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.8;
  list-style: none;
}

.preview__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.settings__danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.settings__danger:last-child {
  border-bottom: none;
}

.settings__danger-title {
  font-size: 13px;
  margin-bottom: 2px;
}
</style>
