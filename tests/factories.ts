import type {
  Allocation,
  AllocationDestination,
  AppSettings,
  Cents,
  DateString,
  IncomeOpportunity,
  IncomeRecord,
  IncomeSource,
  OpportunityStatus,
  SavingsGoal,
  Transaction,
  TransactionType,
  Bucket,
} from '@/types/models';
import { createDefaultSettings } from '@/domain/defaults';

export function createTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const base: Transaction = {
    id: `tx-${Math.random().toString(36).slice(2, 10)}`,
    type: 'expense',
    amount: 0,
    currency: 'CNY',
    category: null,
    note: '',
    occurredAt: '2026-01-15',
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    opportunityId: null,
    incomeRecordId: null,
    reversalOfId: null,
    fromBucket: null,
    toBucket: 'unallocated',
    voidedAt: null,
  };
  return { ...base, ...overrides };
}

export function createIncomeTransaction(amount: Cents, occurredAt: DateString, id?: string): Transaction {
  return createTransaction({
    id: id ?? `inc-${occurredAt}-${amount}`,
    type: 'income',
    amount,
    toBucket: 'unallocated',
    occurredAt,
    category: 'programming',
  });
}

export function createTransfer(
  type: Extract<TransactionType, 'brz_transfer' | 'emergency_transfer'>,
  amount: Cents,
  occurredAt: DateString,
): Transaction {
  return createTransaction({
    type,
    amount,
    occurredAt,
    toBucket: type === 'brz_transfer' ? 'brz' : 'emergency',
  });
}

export function createWithdraw(
  type: Extract<TransactionType, 'brz_withdraw' | 'emergency_withdraw'>,
  amount: Cents,
  occurredAt: DateString,
): Transaction {
  return createTransaction({
    type,
    amount,
    occurredAt,
    fromBucket: type === 'brz_withdraw' ? 'brz' : 'emergency',
    toBucket: 'unallocated',
  });
}

export function createGenericTransfer(
  fromBucket: Bucket,
  toBucket: Bucket,
  amount: Cents,
  occurredAt: DateString,
): Transaction {
  return createTransaction({
    type: 'transfer',
    amount,
    occurredAt,
    fromBucket,
    toBucket,
  });
}

export function createAdjustment(
  toBucket: Bucket,
  amount: Cents,
  occurredAt: DateString,
  fromBucket: Bucket | null = null,
): Transaction {
  return createTransaction({
    type: 'adjustment',
    amount,
    occurredAt,
    fromBucket,
    toBucket,
  });
}

export function createIncomeRecord(overrides: Partial<IncomeRecord> = {}): IncomeRecord {
  const base: IncomeRecord = {
    id: `income-${Math.random().toString(36).slice(2, 10)}`,
    opportunityId: null,
    source: 'programming',
    amountReceived: 100000,
    directCosts: 0,
    workHours: null,
    receivedAt: '2026-01-15',
    currency: 'CNY',
    note: '',
    transactionId: null,
    voidedAt: null,
    createdAt: '2026-01-15T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

export function createAllocation(overrides: Partial<Allocation> = {}): Allocation {
  const base: Allocation = {
    id: `alloc-${Math.random().toString(36).slice(2, 10)}`,
    incomeRecordId: 'income-1',
    destination: 'brz' as AllocationDestination,
    amount: 10000,
    allocatedAt: '2026-01-16',
    createdAt: '2026-01-16T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

export function createGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  const base: SavingsGoal = {
    id: 'current',
    name: '二手 Subaru BRZ',
    targetCarPrice: 6000000,
    purchaseExtraBudget: 500000,
    repairBudget: 300000,
    currentDeadline: '2028-10-01',
    currency: 'CNY',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

export function createOpportunity(overrides: Partial<IncomeOpportunity> = {}): IncomeOpportunity {
  const base: IncomeOpportunity = {
    id: `opp-${Math.random().toString(36).slice(2, 10)}`,
    source: 'programming' as IncomeSource,
    title: '外包小程序开发',
    status: 'identified' as OpportunityStatus,
    estimatedGrossMin: 200000,
    estimatedGrossMax: 500000,
    probability: 60,
    estimatedHours: 20,
    expectedPaymentDate: '2026-03-01',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

export function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...createDefaultSettings(), ...overrides };
}
