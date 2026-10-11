import {
  bulkPutOpportunities,
  getOpportunity,
  listOpportunities,
  putOpportunity,
  removeOpportunity,
} from '@/repositories/opportunitiesRepository';
import { listIncomeRecordsByOpportunity } from '@/repositories/incomeRepository';
import type { DateString, IncomeOpportunity, IncomeSource, OpportunityStatus } from '@/types/models';
import { validateIncomeOpportunity } from '@/domain/validators';
import { ConflictError, NotFoundError, ValidationError } from '@/utils/errors';
import { createId, nextTimestamp } from '@/utils/id';
import { isNonNegativeCents } from '@/utils/money';

/** 允许的机会状态流转；未列出的流转一律拒绝，避免状态回退导致账目混乱。 */
const ALLOWED_TRANSITIONS: Record<OpportunityStatus, readonly OpportunityStatus[]> = {
  identified: ['applied', 'in_progress', 'rejected', 'cancelled'],
  applied: ['negotiating', 'in_progress', 'rejected', 'cancelled'],
  negotiating: ['in_progress', 'rejected', 'cancelled'],
  in_progress: ['completed_unpaid', 'rejected', 'cancelled'],
  completed_unpaid: ['paid', 'cancelled'],
  paid: [],
  rejected: [],
  cancelled: [],
};

export function canTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface OpportunityDraft {
  title: string;
  source: IncomeSource;
  estimatedGrossMin: number | null;
  estimatedGrossMax: number | null;
  probability: number | null;
  estimatedHours: number | null;
  expectedPaymentDate: DateString | null;
  notes: string;
}

export async function listAllOpportunities(): Promise<IncomeOpportunity[]> {
  const records = await listOpportunities();
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getOpportunityById(id: string): Promise<IncomeOpportunity | null> {
  return getOpportunity(id);
}

function validateDraft(draft: OpportunityDraft): void {
  const errors: string[] = [];
  if (draft.title.trim().length === 0) errors.push('机会名称不能为空');
  if (draft.estimatedGrossMin !== null && !isNonNegativeCents(draft.estimatedGrossMin)) {
    errors.push('预计收入下限必须是非负整数分');
  }
  if (draft.estimatedGrossMax !== null && !isNonNegativeCents(draft.estimatedGrossMax)) {
    errors.push('预计收入上限必须是非负整数分');
  }
  if (
    draft.estimatedGrossMin !== null &&
    draft.estimatedGrossMax !== null &&
    draft.estimatedGrossMin > draft.estimatedGrossMax
  ) {
    errors.push('预计收入下限不能大于上限');
  }
  if (
    draft.probability !== null &&
    (draft.probability < 0 || draft.probability > 100 || !Number.isFinite(draft.probability))
  ) {
    errors.push('成功概率必须在 0 到 100 之间');
  }
  if (draft.estimatedHours !== null && (!Number.isFinite(draft.estimatedHours) || draft.estimatedHours < 0)) {
    errors.push('预计工时必须是非负数');
  }
  if (errors.length > 0) throw new ValidationError(errors.join('；'), errors);
}

export async function createOpportunity(draft: OpportunityDraft): Promise<IncomeOpportunity> {
  validateDraft(draft);
  const timestamp = nextTimestamp();
  const record: IncomeOpportunity = {
    id: createId(),
    source: draft.source,
    title: draft.title.trim(),
    status: 'identified',
    estimatedGrossMin: draft.estimatedGrossMin,
    estimatedGrossMax: draft.estimatedGrossMax,
    probability: draft.probability,
    estimatedHours: draft.estimatedHours,
    expectedPaymentDate: draft.expectedPaymentDate,
    notes: draft.notes,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const validation = validateIncomeOpportunity(record);
  if (!validation.ok) throw new ValidationError(validation.errors.join('；'), validation.errors);
  await putOpportunity(record);
  return record;
}

export async function updateOpportunity(
  id: string,
  patch: Partial<OpportunityDraft>,
): Promise<IncomeOpportunity> {
  const existing = await getOpportunity(id);
  if (!existing) throw new NotFoundError('收入机会不存在或已被删除。');
  const next: IncomeOpportunity = {
    ...existing,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() : existing.title,
    id: existing.id,
    status: existing.status,
    createdAt: existing.createdAt,
    updatedAt: nextTimestamp(),
  };
  validateDraft(next);
  const validation = validateIncomeOpportunity(next);
  if (!validation.ok) throw new ValidationError(validation.errors.join('；'), validation.errors);
  await putOpportunity(next);
  return next;
}

export async function changeOpportunityStatus(
  id: string,
  status: OpportunityStatus,
): Promise<IncomeOpportunity> {
  const existing = await getOpportunity(id);
  if (!existing) throw new NotFoundError('收入机会不存在或已被删除。');
  if (!canTransition(existing.status, status)) {
    throw new ConflictError(`不允许从「${existing.status}」流转到「${status}」。`);
  }

  if (status === 'paid') {
    const incomes = await listIncomeRecordsByOpportunity(id);
    if (!incomes.some((income) => !income.voidedAt)) {
      throw new ConflictError('请先通过「确认到账」登记真实到账金额，之后才能标记为已到账。');
    }
  }

  const next: IncomeOpportunity = { ...existing, status, updatedAt: nextTimestamp() };
  await putOpportunity(next);
  return next;
}

export async function deleteOpportunity(id: string): Promise<void> {
  const existing = await getOpportunity(id);
  if (!existing) throw new NotFoundError('收入机会不存在或已被删除。');
  const incomes = await listIncomeRecordsByOpportunity(id);
  if (incomes.length > 0) {
    throw new ConflictError(
      '该机会已经产生收入记录，为保持账目可追溯，不能删除。可改为标记「已取消」。',
    );
  }
  await removeOpportunity(id);
}

export async function replaceAllOpportunities(records: IncomeOpportunity[]): Promise<void> {
  await bulkPutOpportunities(records);
}
