import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseForTests } from '@/db/database';
import {
  completeOnboarding,
  defaultDeadline,
  goalTargetTotal,
  isDeadlineInFuture,
  isOnboarded,
  loadGoal,
  saveGoal,
} from '@/services/onboardingService';
import { loadSettings } from '@/services/settingsService';
import { getMeta } from '@/repositories/metaRepository';
import { loadDashboardSnapshot } from '@/services/integrityService';
import { calculateTotalCash } from '@/domain/balances';

beforeEach(() => {
  resetDatabaseForTests();
});

describe('onboardingService（初始化向导）', () => {
  it('完成向导后写入目标、设置与 onboarded 标记，初始余额为 0', async () => {
    const goal = await completeOnboarding({
      name: '二手 BRZ',
      currency: 'CNY',
      targetCarPrice: 6000000,
      purchaseExtraBudget: 500000,
      repairBudget: 300000,
      currentDeadline: '2028-10-01',
      allocationRatios: { brz: 70, emergency: 20, other: 10 },
      emergencyTarget: 300000,
    });

    expect(goal.name).toBe('二手 BRZ');
    expect(goalTargetTotal(goal)).toBe(6800000);

    const settings = await loadSettings();
    expect(settings.allocationRatios).toEqual({ brz: 70, emergency: 20, other: 10 });
    expect(settings.emergencyTarget).toBe(300000);

    const meta = await getMeta();
    expect(meta.onboarded).toBe(true);
    expect(meta.userCleared).toBe(false);

    const snapshot = await loadDashboardSnapshot(new Date(2026, 6, 15));
    expect(calculateTotalCash([])).toBe(0);
    expect(snapshot.summary.totalCash).toBe(0);
    expect(snapshot.summary.fundBalance).toBe(0);
    expect(snapshot.summary.targetTotal).toBe(6800000);
  });

  it('拒绝无效的目标金额与日期', async () => {
    await expect(
      completeOnboarding({
        name: '目标',
        currency: 'CNY',
        targetCarPrice: 0,
        purchaseExtraBudget: 0,
        repairBudget: 0,
        currentDeadline: '2028-10-01',
        allocationRatios: { brz: 70, emergency: 20, other: 10 },
        emergencyTarget: 0,
      }),
    ).rejects.toThrow();

    await expect(
      completeOnboarding({
        name: '目标',
        currency: 'CNY',
        targetCarPrice: 1000000,
        purchaseExtraBudget: 0,
        repairBudget: 0,
        currentDeadline: '2026-02-30',
        allocationRatios: { brz: 70, emergency: 20, other: 10 },
        emergencyTarget: 0,
      }),
    ).rejects.toThrow();
  });

  it('拒绝全零的分配比例', async () => {
    await expect(
      completeOnboarding({
        name: '目标',
        currency: 'CNY',
        targetCarPrice: 1000000,
        purchaseExtraBudget: 0,
        repairBudget: 0,
        currentDeadline: '2028-10-01',
        allocationRatios: { brz: 0, emergency: 0, other: 0 },
        emergencyTarget: 0,
      }),
    ).rejects.toThrow();
  });

  it('完成后 isOnboarded 为 true；保存目标会更新 updatedAt 但保留 createdAt', async () => {
    await completeOnboarding({
      name: '第一版目标',
      currency: 'CNY',
      targetCarPrice: 5000000,
      purchaseExtraBudget: 0,
      repairBudget: 0,
      currentDeadline: '2028-01-01',
      allocationRatios: { brz: 75, emergency: 15, other: 10 },
      emergencyTarget: 0,
    });
    expect(await isOnboarded()).toBe(true);

    const first = await loadGoal();
    const updated = await saveGoal({
      name: '调整后的目标',
      currency: 'CNY',
      targetCarPrice: 6200000,
      purchaseExtraBudget: 300000,
      repairBudget: 200000,
      currentDeadline: '2028-06-01',
    });
    expect(updated.name).toBe('调整后的目标');
    expect(updated.createdAt).toBe(first?.createdAt);
    expect(updated.updatedAt).not.toBe(first?.updatedAt);
    expect(goalTargetTotal(updated)).toBe(6700000);
  });

  it('isDeadlineInFuture 只接受未来日期', () => {
    expect(isDeadlineInFuture('2999-01-01')).toBe(true);
    expect(isDeadlineInFuture('2000-01-01')).toBe(false);
    expect(isDeadlineInFuture('not-a-date')).toBe(false);
  });

  it('defaultDeadline 默认给两年后且格式合法', () => {
    const deadline = defaultDeadline();
    expect(deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isDeadlineInFuture(deadline)).toBe(true);
  });
});
