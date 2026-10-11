import type { AllocationRatios, AppSettings } from '@/types/models';
import { nowIso } from '@/utils/id';

/**
 * 分配比例仅为「初始建议」默认值，不是强制规则；
 * 用户可以在设置页或每次分配时自由修改。
 */
export const DEFAULT_ALLOCATION_RATIOS: AllocationRatios = {
  brz: 75,
  emergency: 15,
  other: 10,
};

export const DEFAULT_CURRENCY = 'CNY';

/** 计算平均储蓄速度所需的最少月份样本数。 */
export const MIN_MONTHS_SAMPLE = 3;

export const DEFAULT_SAVINGS_WINDOWS: readonly number[] = [3, 6];

export function createDefaultSettings(): AppSettings {
  const timestamp = nowIso();
  return {
    id: 'app',
    currency: DEFAULT_CURRENCY,
    locale: 'zh-CN',
    theme: 'dark',
    allocationRatios: { ...DEFAULT_ALLOCATION_RATIOS },
    emergencyTarget: 0,
    plannedMonthlySaving: null,
    lastBackupAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeSettings(settings: AppSettings | null): AppSettings {
  const defaults = createDefaultSettings();
  if (!settings) return defaults;
  return {
    ...defaults,
    ...settings,
    id: 'app',
    allocationRatios: {
      brz: settings.allocationRatios?.brz ?? defaults.allocationRatios.brz,
      emergency: settings.allocationRatios?.emergency ?? defaults.allocationRatios.emergency,
      other: settings.allocationRatios?.other ?? defaults.allocationRatios.other,
    },
  };
}

export function ratioSum(ratios: AllocationRatios): number {
  return ratios.brz + ratios.emergency + ratios.other;
}

export function isValidRatioSet(ratios: AllocationRatios): boolean {
  const values = [ratios.brz, ratios.emergency, ratios.other];
  return values.every((value) => Number.isFinite(value) && value >= 0) && ratioSum(ratios) > 0;
}
