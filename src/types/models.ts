/**
 * 领域数据模型。所有金额字段一律使用「整数分」（Cents）存储，
 * 以避免浮点误差；所有业务日期使用本地日历日字符串 YYYY-MM-DD，
 * 所有创建/更新时间使用 ISO 8601 时间戳。
 */

export type ISODateTimeString = string;
export type DateString = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM
export type UUID = string;

/** 金额：整数分。1 元 = 100 分。 */
export type Cents = number;

export type CurrencyCode = string;

export type IncomeSource =
  | 'programming'
  | 'part_time'
  | 'competition'
  | 'scholarship'
  | 'internship'
  | 'other';

export type OpportunityStatus =
  | 'identified'
  | 'applied'
  | 'negotiating'
  | 'in_progress'
  | 'completed_unpaid'
  | 'paid'
  | 'rejected'
  | 'cancelled';

export interface IncomeOpportunity {
  id: UUID;
  source: IncomeSource;
  title: string;
  status: OpportunityStatus;
  estimatedGrossMin: Cents | null;
  estimatedGrossMax: Cents | null;
  probability: number | null;
  estimatedHours: number | null;
  expectedPaymentDate: DateString | null;
  notes: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface IncomeRecord {
  id: UUID;
  opportunityId: UUID | null;
  source: IncomeSource;
  amountReceived: Cents;
  directCosts: Cents;
  workHours: number | null;
  receivedAt: DateString;
  currency: CurrencyCode;
  note: string;
  /** 关联的入账交易 ID；每笔收入至多对应一条入账交易（防重复入账）。 */
  transactionId: UUID | null;
  /** 软作废时间；非空的记录不参与任何计算，但保留审计痕迹。 */
  voidedAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
}

export interface SavingsGoal {
  id: UUID;
  name: string;
  /** 裸车目标价格 */
  targetCarPrice: Cents;
  /** 购车附加费用预算（税费、保险、上牌等） */
  purchaseExtraBudget: Cents;
  /** 初期整备及维修预算 */
  repairBudget: Cents;
  /** 计划购车日期 YYYY-MM-DD */
  currentDeadline: DateString;
  currency: CurrencyCode;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export type AllocationDestination = 'brz' | 'emergency' | 'other';

/** 资金桶：未分配现金、购车基金、应急储备、其它用途。 */
export type Bucket = 'unallocated' | 'brz' | 'emergency' | 'other';

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'brz_transfer'
  | 'brz_withdraw'
  | 'emergency_transfer'
  | 'emergency_withdraw'
  | 'adjustment';

export interface Transaction {
  id: UUID;
  type: TransactionType;
  /** 恒为非负数（分）。方向由 type 与 fromBucket/toBucket 表达。 */
  amount: Cents;
  currency: CurrencyCode;
  category: string | null;
  note: string;
  occurredAt: DateString;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  opportunityId: UUID | null;
  incomeRecordId: UUID | null;
  /** 冲正/撤销原交易的引用，形成审计链。 */
  reversalOfId: UUID | null;
  /** 仅 adjustment 使用：资金从哪个桶更正（null 表示外部（期初/误差修正））。 */
  fromBucket: Bucket | null;
  /** 资金流向哪个桶。 */
  toBucket: Bucket;
  voidedAt: ISODateTimeString | null;
}

export interface Allocation {
  id: UUID;
  incomeRecordId: UUID;
  destination: AllocationDestination;
  amount: Cents;
  allocatedAt: DateString;
  createdAt: ISODateTimeString;
}

export type ForecastMethod = 'historical_rate' | 'flat_plan' | 'per_month_plan';

export type ForecastConfidence = 'low' | 'medium' | 'high';

export interface ForecastSnapshot {
  id: UUID;
  method: ForecastMethod;
  /** 生成快照时的实际输入：余额、储蓄率、目标值等。 */
  inputs: Record<string, number | string | null>;
  /** 计算结果：预计日期或无法预测的原因；以及快照时点余额。 */
  result: Record<string, number | string | null>;
  confidence: ForecastConfidence;
  createdAt: ISODateTimeString;
}

export interface AllocationRatios {
  brz: number;
  emergency: number;
  other: number;
}

export type ThemePreference = 'dark' | 'light';

export interface AppSettings {
  id: 'app';
  currency: CurrencyCode;
  locale: string;
  theme: ThemePreference;
  allocationRatios: AllocationRatios;
  /** 应急储备目标（分）。 */
  emergencyTarget: Cents;
  /** 用户可选设置的每月计划储蓄额（分）。 */
  plannedMonthlySaving: Cents | null;
  lastBackupAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface MigrationLogEntry {
  version: number;
  appliedAt: ISODateTimeString;
  note: string;
}

export interface DatabaseMeta {
  id: 'meta';
  dbVersion: number;
  migrations: MigrationLogEntry[];
  /** 是否完成过初始化向导。 */
  onboarded: boolean;
  /** 用户是否主动清空过全部数据（清空后不得再自动初始化默认数据）。 */
  userCleared: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** 情景模拟计划：固定月储蓄、或按月单独指定（支持季节性收入）。 */
export type SavingsPlan =
  | { kind: 'flat'; monthly: Cents }
  | { kind: 'per_month'; months: Record<MonthKey, Cents> };

export interface IncomeSourceMeta {
  key: IncomeSource;
  label: string;
}

export interface OpportunityStatusMeta {
  key: OpportunityStatus;
  label: string;
  tone: 'neutral' | 'progress' | 'success' | 'danger';
}

export interface TransactionTypeMeta {
  key: TransactionType;
  label: string;
}

export const INCOME_SOURCES: readonly IncomeSourceMeta[] = [
  { key: 'programming', label: '编程接单' },
  { key: 'part_time', label: '兼职工作' },
  { key: 'competition', label: '竞赛奖金' },
  { key: 'scholarship', label: '奖学金' },
  { key: 'internship', label: '实习收入' },
  { key: 'other', label: '其他收入' },
] as const;

export const OPPORTUNITY_STATUSES: readonly OpportunityStatusMeta[] = [
  { key: 'identified', label: '已发现', tone: 'neutral' },
  { key: 'applied', label: '已申请', tone: 'progress' },
  { key: 'negotiating', label: '沟通中', tone: 'progress' },
  { key: 'in_progress', label: '进行中', tone: 'progress' },
  { key: 'completed_unpaid', label: '已完成未付款', tone: 'neutral' },
  { key: 'paid', label: '已到账', tone: 'success' },
  { key: 'rejected', label: '未获得', tone: 'danger' },
  { key: 'cancelled', label: '已取消', tone: 'danger' },
] as const;

export const TRANSACTION_TYPES: readonly TransactionTypeMeta[] = [
  { key: 'income', label: '收入到账' },
  { key: 'expense', label: '支出' },
  { key: 'transfer', label: '资金调整（桶间）' },
  { key: 'brz_transfer', label: '转入购车基金' },
  { key: 'brz_withdraw', label: '从购车基金取出' },
  { key: 'emergency_transfer', label: '转入应急金' },
  { key: 'emergency_withdraw', label: '从应急金取出' },
  { key: 'adjustment', label: '其他资金调整' },
] as const;

export const ALLOCATION_DESTINATION_LABELS: Record<AllocationDestination, string> = {
  brz: 'BRZ 购车基金',
  emergency: '应急储备',
  other: '其他用途',
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  unallocated: '未分配资金',
  brz: 'BRZ 购车基金',
  emergency: '应急储备',
  other: '其他用途',
};

export const INCOME_SOURCE_LABELS: Record<IncomeSource, string> = {
  programming: '编程接单',
  part_time: '兼职工作',
  competition: '竞赛奖金',
  scholarship: '奖学金',
  internship: '实习收入',
  other: '其他收入',
};

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  identified: '已发现',
  applied: '已申请',
  negotiating: '沟通中',
  in_progress: '进行中',
  completed_unpaid: '已完成未付款',
  paid: '已到账',
  rejected: '未获得',
  cancelled: '已取消',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: '收入到账',
  expense: '支出',
  transfer: '资金调整（桶间）',
  brz_transfer: '转入购车基金',
  brz_withdraw: '从购车基金取出',
  emergency_transfer: '转入应急金',
  emergency_withdraw: '从应急金取出',
  adjustment: '其他资金调整',
};

export const BUCKETS: readonly Bucket[] = ['unallocated', 'brz', 'emergency', 'other'] as const;

export const ALLOCATION_DESTINATIONS: readonly AllocationDestination[] = [
  'brz',
  'emergency',
  'other',
] as const;

export const INCOME_SOURCE_KEYS: readonly IncomeSource[] = INCOME_SOURCES.map((s) => s.key);

export const OPPORTUNITY_STATUS_KEYS: readonly OpportunityStatus[] = OPPORTUNITY_STATUSES.map(
  (s) => s.key,
);
