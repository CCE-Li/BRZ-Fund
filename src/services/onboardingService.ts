import { getGoal, putGoal } from '@/repositories/goalsRepository';
import { getSettings, putSettings } from '@/repositories/settingsRepository';
import { getMeta, putMeta } from '@/repositories/metaRepository';
import type { AllocationRatios, CurrencyCode, DateString, SavingsGoal } from '@/types/models';
import { createDefaultSettings, isValidRatioSet, normalizeSettings } from '@/domain/defaults';
import { validateSavingsGoal, validateSettings } from '@/domain/validators';
import { DB_VERSION } from '@/db/schema';
import { ValidationError } from '@/utils/errors';
import { nextTimestamp } from '@/utils/id';
import { isNonNegativeCents } from '@/utils/money';
import { isValidDateString, todayString } from '@/utils/date';

export interface GoalDraft {
  name: string;
  targetCarPrice: number;
  purchaseExtraBudget: number;
  repairBudget: number;
  currentDeadline: DateString;
  currency: CurrencyCode;
}

export interface OnboardingInput extends GoalDraft {
  allocationRatios: AllocationRatios;
  emergencyTarget: number;
}

function validateGoalDraft(draft: GoalDraft): void {
  const errors: string[] = [];
  if (draft.name.trim().length === 0) errors.push('目标名称不能为空');
  if (!isNonNegativeCents(draft.targetCarPrice) || draft.targetCarPrice <= 0) {
    errors.push('裸车目标价格必须大于 0');
  }
  if (!isNonNegativeCents(draft.purchaseExtraBudget)) errors.push('购车附加费用必须是非负整数分');
  if (!isNonNegativeCents(draft.repairBudget)) errors.push('整备维修预算必须是非负整数分');
  if (!isValidDateString(draft.currentDeadline)) errors.push('计划购车日期无效');
  if (draft.currency.trim().length === 0) errors.push('货币单位不能为空');
  if (errors.length > 0) throw new ValidationError(errors.join('；'), errors);
}

export async function loadGoal(): Promise<SavingsGoal | null> {
  return getGoal();
}

/** 创建或更新购车目标；首次创建时才设定 createdAt。 */
export async function saveGoal(draft: GoalDraft): Promise<SavingsGoal> {
  validateGoalDraft(draft);
  const existing = await getGoal();
  const timestamp = nextTimestamp();
  const goal: SavingsGoal = {
    id: 'current',
    name: draft.name.trim(),
    targetCarPrice: draft.targetCarPrice,
    purchaseExtraBudget: draft.purchaseExtraBudget,
    repairBudget: draft.repairBudget,
    currentDeadline: draft.currentDeadline,
    currency: draft.currency,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const validation = validateSavingsGoal(goal);
  if (!validation.ok) throw new ValidationError(validation.errors.join('；'), validation.errors);
  await putGoal(goal);
  return goal;
}

export function goalTargetTotal(goal: Pick<SavingsGoal, 'targetCarPrice' | 'purchaseExtraBudget' | 'repairBudget'>): number {
  return goal.targetCarPrice + goal.purchaseExtraBudget + goal.repairBudget;
}

/**
 * 完成初始化向导：写入购车目标、分配比例与应急储备目标，
 * 并把 meta.onboarded 置为 true。初始余额恒为 0，资金只能由真实到账收入进入。
 */
export async function completeOnboarding(input: OnboardingInput): Promise<SavingsGoal> {
  if (!isValidRatioSet(input.allocationRatios)) {
    throw new ValidationError('分配比例必须是非负数，且总和大于 0。');
  }
  if (!isNonNegativeCents(input.emergencyTarget)) {
    throw new ValidationError('应急储备目标必须是非负整数分。');
  }

  const goal = await saveGoal(input);

  const current = normalizeSettings(await getSettings());
  const nextSettings = {
    ...current,
    currency: input.currency,
    allocationRatios: { ...input.allocationRatios },
    emergencyTarget: input.emergencyTarget,
    createdAt: current.createdAt || nextTimestamp(),
    updatedAt: nextTimestamp(),
  };
  const settingsValidation = validateSettings(nextSettings);
  if (!settingsValidation.ok) {
    throw new ValidationError(settingsValidation.errors.join('；'), settingsValidation.errors);
  }
  await putSettings(nextSettings);

  const meta = await getMeta();
  await putMeta({
    ...meta,
    dbVersion: DB_VERSION,
    onboarded: true,
    userCleared: false,
    updatedAt: nextTimestamp(),
  });

  return goal;
}

export async function isOnboarded(): Promise<boolean> {
  const meta = await getMeta();
  return meta.onboarded;
}

export function defaultGoalDraft(): GoalDraft {
  return {
    name: '二手 Subaru BRZ',
    targetCarPrice: 6000000,
    purchaseExtraBudget: 500000,
    repairBudget: 300000,
    currentDeadline: '',
    currency: createDefaultSettings().currency,
  };
}

export function defaultDeadline(): DateString {
  const now = new Date();
  return `${now.getFullYear() + 2}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

export function isDeadlineInFuture(deadline: DateString): boolean {
  if (!isValidDateString(deadline)) return false;
  return deadline > todayString();
}
