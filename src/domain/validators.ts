import type {
  Allocation,
  AppSettings,
  DatabaseMeta,
  ForecastSnapshot,
  IncomeOpportunity,
  IncomeRecord,
  SavingsGoal,
  Transaction,
} from '@/types/models';
import {
  ALLOCATION_DESTINATIONS,
  BUCKETS,
  INCOME_SOURCE_KEYS,
  OPPORTUNITY_STATUS_KEYS,
  TRANSACTION_TYPES,
} from '@/types/models';
import type { VResult } from '@/utils/result';
import { invalid, valid } from '@/utils/result';
import { isValidDateString, isValidIsoDateTime } from '@/utils/date';

type UnknownRecord = Record<string, unknown>;

interface IdentityFields {
  id: string;
  createdAt: string;
  updatedAt?: string;
}

const TRANSACTION_TYPE_KEYS = TRANSACTION_TYPES.map((item) => item.key);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateIdentity(value: UnknownRecord, label: string, errors: string[]): IdentityFields | null {
  const id = value['id'];
  const createdAt = value['createdAt'];
  if (!isNonEmptyString(id)) errors.push(`${label}：缺少有效的 id`);
  if (!isValidIsoDateTime(createdAt)) errors.push(`${label}：缺少有效的 createdAt`);
  if (errors.length > 0) return null;
  return { id: id as string, createdAt: createdAt as string };
}

export function validateSavingsGoal(value: unknown): VResult<SavingsGoal> {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid(['购车目标：数据格式无效']);
  const identity = validateIdentity(value, '购车目标', errors);
  if (!identity) return invalid(errors);

  if (!isNonEmptyString(value['name'])) errors.push('购车目标：名称不能为空');
  if (!isNonNegativeInteger(value['targetCarPrice'])) errors.push('购车目标：裸车价必须是非负整数分');
  if (!isNonNegativeInteger(value['purchaseExtraBudget'])) {
    errors.push('购车目标：附加费用预算必须是非负整数分');
  }
  if (!isNonNegativeInteger(value['repairBudget'])) errors.push('购车目标：整备预算必须是非负整数分');
  if (!isValidDateString(value['currentDeadline'])) errors.push('购车目标：截止日期无效');
  if (!isNonEmptyString(value['currency'])) errors.push('购车目标：币种不能为空');
  if (!isValidIsoDateTime(value['updatedAt'])) errors.push('购车目标：updatedAt 无效');
  if (errors.length > 0) return invalid(errors);
  return valid(value as unknown as SavingsGoal);
}

export function validateIncomeOpportunity(value: unknown): VResult<IncomeOpportunity> {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid(['收入机会：数据格式无效']);
  const identity = validateIdentity(value, '收入机会', errors);
  if (!identity) return invalid(errors);

  if (!isNonEmptyString(value['title'])) errors.push('收入机会：名称不能为空');
  if (!INCOME_SOURCE_KEYS.includes(value['source'] as never)) errors.push('收入机会：收入来源无效');
  if (!OPPORTUNITY_STATUS_KEYS.includes(value['status'] as never)) errors.push('收入机会：状态无效');
  if (!isNullableNonNegativeInteger(value['estimatedGrossMin'])) {
    errors.push('收入机会：预计收入下限必须是非负整数分或 null');
  }
  if (!isNullableNonNegativeInteger(value['estimatedGrossMax'])) {
    errors.push('收入机会：预计收入上限必须是非负整数分或 null');
  }
  const probability = value['probability'];
  if (probability !== null && (typeof probability !== 'number' || probability < 0 || probability > 100)) {
    errors.push('收入机会：成功概率必须在 0 到 100 之间或为 null');
  }
  const estimatedHours = value['estimatedHours'];
  if (estimatedHours !== null && (typeof estimatedHours !== 'number' || estimatedHours < 0)) {
    errors.push('收入机会：预计工时必须是非负数或 null');
  }
  const expectedPaymentDate = value['expectedPaymentDate'];
  if (expectedPaymentDate !== null && !isValidDateString(expectedPaymentDate)) {
    errors.push('收入机会：预计结算日期无效');
  }
  if (!isValidIsoDateTime(value['updatedAt'])) errors.push('收入机会：updatedAt 无效');
  if (errors.length > 0) return invalid(errors);
  return valid(value as unknown as IncomeOpportunity);
}

export function validateIncomeRecord(value: unknown): VResult<IncomeRecord> {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid(['收入记录：数据格式无效']);
  const identity = validateIdentity(value, '收入记录', errors);
  if (!identity) return invalid(errors);

  if (value['opportunityId'] !== null && !isNonEmptyString(value['opportunityId'])) {
    errors.push('收入记录：关联机会 ID 无效');
  }
  if (!INCOME_SOURCE_KEYS.includes(value['source'] as never)) errors.push('收入记录：收入来源无效');
  if (!isNonNegativeInteger(value['amountReceived'])) errors.push('收入记录：到账金额必须是非负整数分');
  if (!isNonNegativeInteger(value['directCosts'])) errors.push('收入记录：直接成本必须是非负整数分');
  if (
    isNonNegativeInteger(value['amountReceived']) &&
    isNonNegativeInteger(value['directCosts']) &&
    value['directCosts'] > value['amountReceived']
  ) {
    errors.push('收入记录：直接成本不能大于到账金额');
  }
  const workHours = value['workHours'];
  if (workHours !== null && (typeof workHours !== 'number' || workHours < 0)) {
    errors.push('收入记录：工时必须是非负数或 null');
  }
  if (!isValidDateString(value['receivedAt'])) errors.push('收入记录：到账日期无效');
  if (!isNonEmptyString(value['currency'])) errors.push('收入记录：币种不能为空');
  if (value['transactionId'] !== null && !isNonEmptyString(value['transactionId'])) {
    errors.push('收入记录：入账交易 ID 无效');
  }
  const voidedAt = value['voidedAt'];
  if (voidedAt !== null && !isValidIsoDateTime(voidedAt)) errors.push('收入记录：作废时间无效');
  if (errors.length > 0) return invalid(errors);
  return valid(value as unknown as IncomeRecord);
}

export function validateTransaction(value: unknown): VResult<Transaction> {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid(['交易记录：数据格式无效']);
  const identity = validateIdentity(value, '交易记录', errors);
  if (!identity) return invalid(errors);

  const type = value['type'];
  if (!TRANSACTION_TYPE_KEYS.includes(type as never)) errors.push('交易记录：交易类型无效');
  if (!isNonNegativeInteger(value['amount'])) errors.push('交易记录：金额必须是非负整数分');
  if (!isNonEmptyString(value['currency'])) errors.push('交易记录：币种不能为空');
  const category = value['category'];
  if (category !== null && typeof category !== 'string') errors.push('交易记录：分类无效');
  if (!isValidDateString(value['occurredAt'])) errors.push('交易记录：交易日期无效');
  if (!isValidIsoDateTime(value['updatedAt'])) errors.push('交易记录：updatedAt 无效');
  if (value['opportunityId'] !== null && !isNonEmptyString(value['opportunityId'])) {
    errors.push('交易记录：关联机会 ID 无效');
  }
  if (value['incomeRecordId'] !== null && !isNonEmptyString(value['incomeRecordId'])) {
    errors.push('交易记录：关联收入 ID 无效');
  }
  if (value['reversalOfId'] !== null && !isNonEmptyString(value['reversalOfId'])) {
    errors.push('交易记录：冲正目标 ID 无效');
  }
  const fromBucket = value['fromBucket'];
  if (fromBucket !== null && !BUCKETS.includes(fromBucket as never)) {
    errors.push('交易记录：来源资金桶无效');
  }
  if (!BUCKETS.includes(value['toBucket'] as never)) errors.push('交易记录：目标资金桶无效');
  if (type === 'transfer' && fromBucket === value['toBucket']) {
    errors.push('交易记录：桶间调整的来源与目标不能相同');
  }
  const voidedAt = value['voidedAt'];
  if (voidedAt !== null && !isValidIsoDateTime(voidedAt)) errors.push('交易记录：作废时间无效');
  if (errors.length > 0) return invalid(errors);
  return valid(value as unknown as Transaction);
}

export function validateAllocation(value: unknown): VResult<Allocation> {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid(['资金分配：数据格式无效']);
  const identity = validateIdentity(value, '资金分配', errors);
  if (!identity) return invalid(errors);

  if (!isNonEmptyString(value['incomeRecordId'])) errors.push('资金分配：缺少关联收入记录');
  if (!ALLOCATION_DESTINATIONS.includes(value['destination'] as never)) {
    errors.push('资金分配：用途无效');
  }
  if (!isNonNegativeInteger(value['amount']) || value['amount'] <= 0) {
    errors.push('资金分配：金额必须是正整数分');
  }
  if (!isValidDateString(value['allocatedAt'])) errors.push('资金分配：分配日期无效');
  if (errors.length > 0) return invalid(errors);
  return valid(value as unknown as Allocation);
}

export function validateForecastSnapshot(value: unknown): VResult<ForecastSnapshot> {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid(['预测快照：数据格式无效']);
  const identity = validateIdentity(value, '预测快照', errors);
  if (!identity) return invalid(errors);

  if (!['historical_rate', 'flat_plan', 'per_month_plan'].includes(value['method'] as never)) {
    errors.push('预测快照：预测方法无效');
  }
  if (!['low', 'medium', 'high'].includes(value['confidence'] as never)) {
    errors.push('预测快照：置信度无效');
  }
  if (!isRecord(value['inputs'])) errors.push('预测快照：缺少输入参数');
  if (!isRecord(value['result'])) errors.push('预测快照：缺少计算结果');
  if (errors.length > 0) return invalid(errors);
  return valid(value as unknown as ForecastSnapshot);
}

export function validateSettings(value: unknown): VResult<AppSettings> {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid(['应用设置：数据格式无效']);
  if (value['id'] !== 'app') errors.push('应用设置：id 必须为 app');
  if (!isNonEmptyString(value['currency'])) errors.push('应用设置：币种不能为空');
  if (!isNonEmptyString(value['locale'])) errors.push('应用设置：语言无效');
  if (value['theme'] !== 'dark' && value['theme'] !== 'light') errors.push('应用设置：主题无效');
  const ratios = value['allocationRatios'];
  if (!isRecord(ratios)) {
    errors.push('应用设置：分配比例无效');
  } else {
    for (const key of ['brz', 'emergency', 'other'] as const) {
      const ratio = ratios[key];
      if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) {
        errors.push(`应用设置：分配比例 ${key} 无效`);
      }
    }
  }
  if (!isNonNegativeInteger(value['emergencyTarget'])) {
    errors.push('应用设置：应急储备目标必须是非负整数分');
  }
  const lastBackupAt = value['lastBackupAt'];
  if (lastBackupAt !== null && !isValidIsoDateTime(lastBackupAt)) {
    errors.push('应用设置：最近备份时间无效');
  }
  if (errors.length > 0) return invalid(errors);
  return valid(value as unknown as AppSettings);
}

export function validateDatabaseMeta(value: unknown): VResult<DatabaseMeta> {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid(['数据库元信息：数据格式无效']);
  if (value['id'] !== 'meta') errors.push('数据库元信息：id 必须为 meta');
  if (typeof value['dbVersion'] !== 'number') errors.push('数据库元信息：dbVersion 无效');
  if (typeof value['onboarded'] !== 'boolean') errors.push('数据库元信息：onboarded 无效');
  if (typeof value['userCleared'] !== 'boolean') errors.push('数据库元信息：userCleared 无效');
  if (!Array.isArray(value['migrations'])) errors.push('数据库元信息：迁移日志无效');
  if (!isValidIsoDateTime(value['createdAt'])) errors.push('数据库元信息：createdAt 无效');
  if (!isValidIsoDateTime(value['updatedAt'])) errors.push('数据库元信息：updatedAt 无效');
  if (errors.length > 0) return invalid(errors);
  return valid(value as unknown as DatabaseMeta);
}
