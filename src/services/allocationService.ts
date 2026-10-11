import { getDatabase } from '@/db/database';
import { withTransaction } from '@/db/idb';
import { STORE_ALLOCATIONS } from '@/db/schema';
import {
  listAllocations,
  listAllocationsByIncome,
} from '@/repositories/allocationsRepository';
import { getIncomeRecord } from '@/repositories/incomeRepository';
import type { Allocation, AllocationDestination } from '@/types/models';
import {
  buildAllocationDrafts,
  calculateAllocation,
  remainingAllocatable,
  totalAllocated,
  type AllocationPlan,
  type AllocationRequest,
} from '@/domain/allocation';
import { validateAllocation } from '@/domain/validators';
import { ConflictError, NotFoundError, ValidationError } from '@/utils/errors';
import { createId, nextTimestamp } from '@/utils/id';
import { distributeByRatio } from '@/utils/money';
import { todayString } from '@/utils/date';

export async function listAll(): Promise<Allocation[]> {
  const records = await listAllocations();
  return records.sort(
    (a, b) => b.allocatedAt.localeCompare(a.allocatedAt) || b.createdAt.localeCompare(a.createdAt),
  );
}

export async function listForIncome(incomeRecordId: string): Promise<Allocation[]> {
  return listAllocationsByIncome(incomeRecordId);
}

export interface AllocationPreview {
  plan: AllocationPlan;
  allocatedTotalOfIncome: number;
}

/** 生成分配预览：校验失败时 plan.errors 非空，调用方不得提交。 */
export async function previewAllocation(
  incomeRecordId: string,
  request: AllocationRequest,
): Promise<AllocationPreview> {
  const income = await getIncomeRecord(incomeRecordId);
  if (!income) throw new NotFoundError('收入记录不存在或已被删除。');
  const allocations = await listAllocationsByIncome(incomeRecordId);
  const plan = calculateAllocation(income, allocations, request);
  return { plan, allocatedTotalOfIncome: totalAllocated(allocations) };
}

export async function allocateIncome(
  incomeRecordId: string,
  request: AllocationRequest,
): Promise<Allocation[]> {
  const income = await getIncomeRecord(incomeRecordId);
  if (!income) throw new NotFoundError('收入记录不存在或已被删除。');
  if (income.voidedAt) throw new ConflictError('该笔收入已作废，不能再进行分配。');

  const allocations = await listAllocationsByIncome(incomeRecordId);
  const plan = calculateAllocation(income, allocations, request);
  if (plan.errors.length > 0) {
    throw new ValidationError(plan.errors.join('；'), plan.errors);
  }

  const drafts = buildAllocationDrafts(plan, createId, todayString(), nextTimestamp());
  if (drafts.length === 0) {
    throw new ValidationError('分配金额为 0，未生成任何分配记录。');
  }
  for (const draft of drafts) {
    const validation = validateAllocation(draft);
    if (!validation.ok) {
      throw new ValidationError(validation.errors.join('；'), validation.errors);
    }
  }

  const db = await getDatabase();
  await withTransaction(db, STORE_ALLOCATIONS, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_ALLOCATIONS);
    for (const draft of drafts) store.add(draft);
  });
  return drafts;
}

/**
 * 撤销一笔分配：删除该分配记录并释放额度。
 * 删除是安全的——分配只影响「限额」语义，不参与现金余额计算。
 */
export async function reverseAllocation(allocationId: string): Promise<void> {
  const all = await listAllocations();
  const target = all.find((item) => item.id === allocationId);
  if (!target) throw new NotFoundError('分配记录不存在或已被撤销。');

  const db = await getDatabase();
  await withTransaction(db, STORE_ALLOCATIONS, 'readwrite', (tx) => {
    tx.objectStore(STORE_ALLOCATIONS).delete(allocationId);
  });
}

/** 当前可继续分配的余额（净收入减去已分配金额）。 */
export async function remainingForIncome(incomeRecordId: string): Promise<number> {
  const income = await getIncomeRecord(incomeRecordId);
  if (!income) throw new NotFoundError('收入记录不存在或已被删除。');
  const allocations = await listAllocationsByIncome(incomeRecordId);
  return remainingAllocatable(income, allocations);
}

/** 按当前设置的比例把剩余可分配额拆成建议金额。 */
export async function suggestAmounts(
  incomeRecordId: string,
  ratios: { brz: number; emergency: number; other: number },
): Promise<Record<AllocationDestination, number>> {
  const remaining = await remainingForIncome(incomeRecordId);
  const distributed = distributeByRatio(Math.max(0, remaining), [
    { key: 'brz' as const, value: ratios.brz },
    { key: 'emergency' as const, value: ratios.emergency },
    { key: 'other' as const, value: ratios.other },
  ]);
  return distributed.reduce(
    (acc, item) => {
      acc[item.key] = item.value;
      return acc;
    },
    { brz: 0, emergency: 0, other: 0 } as Record<AllocationDestination, number>,
  );
}
