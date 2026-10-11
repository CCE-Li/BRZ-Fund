import { describe, expect, it } from 'vitest';
import {
  validateAllocation,
  validateDatabaseMeta,
  validateForecastSnapshot,
  validateIncomeOpportunity,
  validateIncomeRecord,
  validateSavingsGoal,
  validateSettings,
  validateTransaction,
} from '@/domain/validators';
import { createDefaultSettings } from '@/domain/defaults';
import {
  createAllocation,
  createGoal,
  createIncomeRecord,
  createOpportunity,
  createTransaction,
} from '../factories';

describe('validateSavingsGoal', () => {
  it('接受合法目标', () => {
    expect(validateSavingsGoal(createGoal()).ok).toBe(true);
  });

  it('拒绝负数金额与非法日期', () => {
    expect(validateSavingsGoal({ ...createGoal(), targetCarPrice: -1 }).ok).toBe(false);
    expect(validateSavingsGoal({ ...createGoal(), currentDeadline: '2026-13-40' }).ok).toBe(false);
    expect(validateSavingsGoal({ ...createGoal(), name: '  ' }).ok).toBe(false);
  });

  it('拒绝非对象与缺少 id 的数据', () => {
    expect(validateSavingsGoal(null).ok).toBe(false);
    expect(validateSavingsGoal({ name: 'x' }).ok).toBe(false);
  });
});

describe('validateIncomeOpportunity', () => {
  it('接受合法机会（含 null 的可选字段）', () => {
    expect(validateIncomeOpportunity(createOpportunity()).ok).toBe(true);
    expect(
      validateIncomeOpportunity(
        createOpportunity({
          estimatedGrossMin: null,
          estimatedGrossMax: null,
          probability: null,
          estimatedHours: null,
          expectedPaymentDate: null,
        }),
      ).ok,
    ).toBe(true);
  });

  it('拒绝非法状态、来源与概率', () => {
    expect(validateIncomeOpportunity({ ...createOpportunity(), status: 'unknown' }).ok).toBe(false);
    expect(validateIncomeOpportunity({ ...createOpportunity(), source: 'crypto' }).ok).toBe(false);
    expect(validateIncomeOpportunity({ ...createOpportunity(), probability: 120 }).ok).toBe(false);
  });
});

describe('validateIncomeRecord', () => {
  it('接受合法记录', () => {
    expect(validateIncomeRecord(createIncomeRecord()).ok).toBe(true);
  });

  it('拒绝直接成本大于到账金额', () => {
    const invalid = createIncomeRecord({ amountReceived: 1000, directCosts: 2000 });
    expect(validateIncomeRecord(invalid).ok).toBe(false);
  });

  it('拒绝负数金额与非法到账日期', () => {
    expect(validateIncomeRecord({ ...createIncomeRecord(), amountReceived: -1 }).ok).toBe(false);
    expect(validateIncomeRecord({ ...createIncomeRecord(), receivedAt: '2026/01/01' }).ok).toBe(false);
  });
});

describe('validateTransaction', () => {
  it('接受各类型合法交易', () => {
    expect(validateTransaction(createTransaction({ type: 'expense', amount: 100 })).ok).toBe(true);
    expect(
      validateTransaction(
        createTransaction({
          type: 'transfer',
          amount: 100,
          fromBucket: 'brz',
          toBucket: 'emergency',
        }),
      ).ok,
    ).toBe(true);
  });

  it('拒绝非法交易类型、负数金额与非法资金桶', () => {
    expect(validateTransaction({ ...createTransaction(), type: 'magic' }).ok).toBe(false);
    expect(validateTransaction({ ...createTransaction(), amount: -5 }).ok).toBe(false);
    expect(validateTransaction({ ...createTransaction(), toBucket: 'nowhere' }).ok).toBe(false);
  });

  it('拒绝来源与目标相同的桶间调整', () => {
    const invalid = createTransaction({
      type: 'transfer',
      amount: 100,
      fromBucket: 'brz',
      toBucket: 'brz',
    });
    expect(validateTransaction(invalid).ok).toBe(false);
  });
});

describe('validateAllocation', () => {
  it('接受合法分配，拒绝 0 或负数金额', () => {
    expect(validateAllocation(createAllocation({ amount: 100 })).ok).toBe(true);
    expect(validateAllocation(createAllocation({ amount: 0 })).ok).toBe(false);
    expect(validateAllocation({ ...createAllocation(), destination: 'gold' }).ok).toBe(false);
  });
});

describe('validateSettings', () => {
  it('接受默认设置', () => {
    expect(validateSettings(createDefaultSettings()).ok).toBe(true);
  });

  it('拒绝非法主题与负比例', () => {
    expect(validateSettings({ ...createDefaultSettings(), theme: 'neon' }).ok).toBe(false);
    expect(
      validateSettings({
        ...createDefaultSettings(),
        allocationRatios: { brz: -1, emergency: 15, other: 10 },
      }).ok,
    ).toBe(false);
  });
});

describe('validateForecastSnapshot / validateDatabaseMeta', () => {
  it('校验快照必需字段', () => {
    const snapshot = {
      id: 'snap',
      method: 'historical_rate',
      inputs: {},
      result: {},
      confidence: 'low',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(validateForecastSnapshot(snapshot).ok).toBe(true);
    expect(validateForecastSnapshot({ ...snapshot, confidence: 'certain' }).ok).toBe(false);
  });

  it('校验元信息必需字段', () => {
    const meta = {
      id: 'meta',
      dbVersion: 1,
      migrations: [],
      onboarded: false,
      userCleared: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(validateDatabaseMeta(meta).ok).toBe(true);
    expect(validateDatabaseMeta({ ...meta, onboarded: 'yes' }).ok).toBe(false);
  });
});
