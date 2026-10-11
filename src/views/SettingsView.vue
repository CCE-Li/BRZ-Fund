<script setup lang="ts">
import { computed } from 'vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import GoalSettingsForm from '@/components/forms/GoalSettingsForm.vue';
import AllocationRatioForm from '@/components/forms/AllocationRatioForm.vue';
import { useAppStore } from '@/stores/appStore';
import { formatDateDisplay } from '@/utils/date';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import { ref } from 'vue';

const app = useAppStore();
const toast = useToast();

const THEME_OPTIONS = [
  { value: 'dark', label: '深色（默认）' },
  { value: 'light', label: '浅色' },
];

const themeSelection = ref(app.theme);
const themeSaving = ref(false);

const lastBackupText = computed(() =>
  app.lastBackupAt ? formatDateDisplay(app.lastBackupAt.slice(0, 10)) : '从未导出备份',
);

async function onThemeChange(value: string): Promise<void> {
  themeSelection.value = value as 'dark' | 'light';
  themeSaving.value = true;
  try {
    await app.setTheme(value as 'dark' | 'light');
    toast.success('主题已更新。');
  } catch (error) {
    toast.error(toErrorMessage(error));
  } finally {
    themeSaving.value = false;
  }
}
</script>

<template>
  <div class="settings">
    <PageHeader title="设置" subtitle="目标、预算、分配比例与数据安全相关的选项。" />

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

      <BaseCard title="数据与备份" subtitle="本地存储不是永久安全，请定期导出备份">
        <div class="settings__info">
          <div class="settings__row">
            <span>当前货币单位</span>
            <span class="settings__value">{{ app.currency }}</span>
          </div>
          <div class="settings__row">
            <span>最近备份时间</span>
            <span class="settings__value">{{ lastBackupText }}</span>
          </div>
          <div class="settings__row">
            <span>初始化状态</span>
            <span class="settings__value">{{ app.onboarded ? '已完成' : '未完成' }}</span>
          </div>
        </div>
        <p class="settings__note">
          数据默认保存在当前浏览器的当前网站源下，<strong>不会自动同步到其它浏览器或设备</strong>。
          清理浏览器数据、隐私模式、设备损坏都可能导致数据丢失。完整的导出 / 导入 / 清空功能将在后续阶段补齐。
        </p>
        <template #footer>
          <div class="settings__actions">
            <BaseButton variant="primary" disabled>导出 JSON 备份（即将支持）</BaseButton>
            <BaseButton variant="secondary" disabled>从备份恢复（即将支持）</BaseButton>
          </div>
        </template>
      </BaseCard>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
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

.settings__note {
  margin-top: var(--space-3);
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.7;
}

.settings__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
