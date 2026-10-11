import type {
  Allocation,
  AllocationDestination,
  AllocationRatios,
  Cents,
  DateString,
  IncomeRecord,
} from '@/types/models';
import { ALLOCATION_DESTINATIONS } from '@/types/models';
import { calculateNetIncome } from '@/domain/balances';
import { distributeByRatio } from '@/utils/money';

export type AllocationRequest =
  | { kind: 'ratio'; ratios: AllocationRatios }
  | { kind: 'amounts'; amounts: Partial<Record<AllocationDestination, Cents>> };

export interface PlannedAllocation {
  destination: AllocationDestination;
  amount: Cents;
}

export interface AllocationPlan {
  incomeRecordId: string;
  netIncome: Cents;
  previouslyAllocated: Cents;
  remaining: Cents;
  entries: PlannedAllocation[];
  errors: string[];
}

/** 某笔收入的有效（未作废）分配记录。 */
export function activeAllocationsFor(
  incomeRecordId: string,
  allocations: readonly Allocation[],
): Allocation[] {
  return allocations.filter((item) => item.incomeRecordId === incomeRecordId);
}

export function totalAllocated(allocs: readonly Pick<Allocation, 'amount'>[]): Cents {
  return allocs.reduce((acc, item) => acc + item.amount, 0);
}

export function remainingAllocatable(
  incomeRecord: Pick<IncomeRecord, 'id' | 'amountReceived' | 'directCosts'>,
  allocations: readonly Allocation[],
): Cents {
  const net = calculateNetIncome(incomeRecord);
  const allocated = totalAllocated(activeAllocationsFor(incomeRecord.id, allocations));
  return net - allocated;
}

export function allocationByDestination(
  allocations: readonly Allocation[],
): Record<AllocationDestination, Cents> {
  const totals: Record<AllocationDestination, Cents> = { brz: 0, emergency: 0, other: 0 };
  for (const item of allocations) {
    totals[item.destination] += item.amount;
  }
  return totals;
}

/**
 * 生成分配方案并校验。校验失败时返回带 errors 的方案，调用方不得落库。
 * 前一笔已分配金额会占用额度，累计不得超过可分配净额。
 */
export function calculateAllocation(
  incomeRecord: IncomeRecord,
  allocations: readonly Allocation[],
  request: AllocationRequest,
): AllocationPlan {
  const errors: string[] = [];
  const netIncome = calculateNetIncome(incomeRecord);
  const existing = activeAllocationsFor(incomeRecord.id, allocations);
  const previouslyAllocated = totalAllocated(existing);
  const remaining = netIncome - previouslyAllocated;

  if (incomeRecord.voidedAt) {
    errors.push('该笔收入已作废，不能继续分配。');
  }

  let entries: PlannedAllocation[];
  if (request.kind === 'ratio') {
    const ratioSum =
      request.ratios.brz + request.ratios.emergency + request.ratios.other;
    if (ratioSum <= 0) {
      errors.push('分配比例之和必须大于 0。');
      entries = ALLOCATION_DESTINATIONS.map((destination) => ({ destination, amount: 0 }));
    } else {
      const distributed = distributeByRatio(remaining, [
        { key: 'brz' as const, value: request.ratios.brz },
        { key: 'emergency' as const, value: request.ratios.emergency },
        { key: 'other' as const, value: request.ratios.other },
      ]);
      entries = distributed.map((item) => ({ destination: item.key, amount: item.value }));
    }
  } else {
    entries = ALLOCATION_DESTINATIONS.map((destination) => ({
      destination,
      amount: request.amounts[destination] ?? 0,
    }));
  }

  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amount) || entry.amount < 0) {
      errors.push(`「${entry.destination}」的金额必须是非负整数分。`);
    }
  }

  const total = totalAllocated(entries);
  if (total > remaining) {
    errors.push(
      `本次分配总额超出可分配余额：可分配 ${remaining / 100} 元，本次分配 ${total / 100} 元。`,
    );
  }

  return {
    incomeRecordId: incomeRecord.id,
    netIncome,
    previouslyAllocated,
    remaining,
    entries,
    errors,
  };
}

/** 生成待写入的分配实体（不落库，由服务层在事务内提交）。 */
export function buildAllocationDrafts(
  plan: AllocationPlan,
  createId: () => string,
  allocatedAt: DateString,
  createdAt: string,
): Allocation[] {
  return plan.entries
    .filter((entry) => entry.amount > 0)
    .map((entry) => ({
      id: createId(),
      incomeRecordId: plan.incomeRecordId,
      destination: entry.destination,
      amount: entry.amount,
      allocatedAt,
      createdAt,
    }));
}

/** 分配进度百分比，用于界面展示。 */
export function allocationProgressPercent(netIncome: Cents, allocated: Cents): number {
  if (netIncome <= 0) return 0;
  return Math.min(100, Math.round((allocated / netIncome) * 1000) / 10);
}
