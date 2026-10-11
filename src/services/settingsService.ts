import { getSettings, putSettings } from '@/repositories/settingsRepository';
import type { AppSettings } from '@/types/models';
import { createDefaultSettings, normalizeSettings } from '@/domain/defaults';
import { validateSettings } from '@/domain/validators';
import { ValidationError } from '@/utils/errors';
import { nextTimestamp } from '@/utils/id';
import { isNonNegativeCents } from '@/utils/money';
import { isValidDateString } from '@/utils/date';

const SETTING_LABELS: Record<string, string> = {
  currency: '货币单位',
  locale: '语言',
  theme: '主题',
  allocationRatios: '分配比例',
  emergencyTarget: '应急储备目标',
  plannedMonthlySaving: '每月计划储蓄额',
};

export async function loadSettings(): Promise<AppSettings> {
  return normalizeSettings(await getSettings());
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    id: 'app',
    allocationRatios: { ...current.allocationRatios, ...(patch.allocationRatios ?? {}) },
    updatedAt: nextTimestamp(),
  };
  if (patch.createdAt === undefined) {
    next.createdAt = current.createdAt;
  }

  const validation = validateSettings(next);
  if (!validation.ok) {
    throw new ValidationError(validation.errors.join('；'), validation.errors);
  }
  await putSettings(next);
  return next;
}

export interface SettingsPatchInput {
  currency?: string;
  locale?: string;
  theme?: 'dark' | 'light';
  allocationRatios?: Partial<AppSettings['allocationRatios']>;
  emergencyTarget?: number;
  plannedMonthlySaving?: number | null;
  lastBackupAt?: string | null;
}

export function describeSettingsPatch(patch: SettingsPatchInput): string[] {
  return Object.keys(patch).map((key) => SETTING_LABELS[key] ?? key);
}

export async function applySettingsPatch(patch: SettingsPatchInput): Promise<AppSettings> {
  return updateSettings(patch as Partial<AppSettings>);
}

export async function resetSettings(): Promise<AppSettings> {
  const defaults = createDefaultSettings();
  await putSettings(defaults);
  return defaults;
}

export function validateSettingsPatch(patch: SettingsPatchInput): string[] {
  const errors: string[] = [];
  if (patch.currency !== undefined && patch.currency.trim().length === 0) {
    errors.push('货币单位不能为空');
  }
  if (patch.emergencyTarget !== undefined && !isNonNegativeCents(patch.emergencyTarget)) {
    errors.push('应急储备目标必须是非负整数分');
  }
  if (
    patch.plannedMonthlySaving !== undefined &&
    patch.plannedMonthlySaving !== null &&
    !isNonNegativeCents(patch.plannedMonthlySaving)
  ) {
    errors.push('每月计划储蓄额必须是非负整数分');
  }
  if (
    patch.lastBackupAt !== undefined &&
    patch.lastBackupAt !== null &&
    !isValidDateString(patch.lastBackupAt.slice(0, 10))
  ) {
    errors.push('备份时间无效');
  }
  if (patch.allocationRatios) {
    for (const value of Object.values(patch.allocationRatios)) {
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        errors.push('分配比例必须是非负数');
      }
    }
  }
  if (patch.theme !== undefined && patch.theme !== 'dark' && patch.theme !== 'light') {
    errors.push('主题取值无效');
  }
  return errors;
}
