import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseForTests } from '@/db/database';
import {
  buildBackupFile,
  clearAllData,
  importBackupData,
  importBackupFromText,
  parseBackupText,
  validateBackupPayload,
} from '@/services/backupService';
import { recordIncome, listIncomes } from '@/services/incomeService';
import { allocateIncome, listForIncome } from '@/services/allocationService';
import { listTransactions } from '@/repositories/transactionsRepository';
import { getMeta } from '@/repositories/metaRepository';
import {
  canTransition,
  changeOpportunityStatus,
  createOpportunity,
  deleteOpportunity,
  listAllOpportunities,
  updateOpportunity,
} from '@/services/opportunityService';
import { loadSettings, applySettingsPatch } from '@/services/settingsService';
import { calculateTotalCash } from '@/domain/balances';
import { ConflictError } from '@/utils/errors';

beforeEach(() => {
  resetDatabaseForTests();
});

describe('机会状态机', () => {
  async function seed(): Promise<string> {
    const opportunity = await createOpportunity({
      title: '校园竞赛',
      source: 'competition',
      estimatedGrossMin: 100000,
      estimatedGrossMax: 200000,
      probability: 30,
      estimatedHours: 30,
      expectedPaymentDate: '2026-11-01',
      notes: '需要 3 人组队',
    });
    return opportunity.id;
  }

  it('允许的流转：已发现 → 已申请 → 沟通中 → 进行中 → 已完成未付款', async () => {
    const id = await seed();
    await changeOpportunityStatus(id, 'applied');
    await changeOpportunityStatus(id, 'negotiating');
    await changeOpportunityStatus(id, 'in_progress');
    const completed = await changeOpportunityStatus(id, 'completed_unpaid');
    expect(completed.status).toBe('completed_unpaid');
  });

  it('不允许从「已发现」直接跳到「已到账」', async () => {
    const id = await seed();
    await expect(changeOpportunityStatus(id, 'paid')).rejects.toThrow();
  });

  it('「已完成未付款」不会增加任何余额', async () => {
    const id = await seed();
    await changeOpportunityStatus(id, 'in_progress');
    await changeOpportunityStatus(id, 'completed_unpaid');
    const transactions = await listTransactions();
    expect(transactions).toHaveLength(0);
    expect(calculateTotalCash(transactions)).toBe(0);
  });

  it('没有真实收入记录时不允许标记为已到账', async () => {
    const id = await seed();
    await changeOpportunityStatus(id, 'in_progress');
    await changeOpportunityStatus(id, 'completed_unpaid');
    await expect(changeOpportunityStatus(id, 'paid')).rejects.toThrow(ConflictError);
  });

  it('登记到账收入后自动推进为已到账，余额随之增加', async () => {
    const id = await seed();
    await changeOpportunityStatus(id, 'in_progress');
    await changeOpportunityStatus(id, 'completed_unpaid');
    await recordIncome({
      opportunityId: id,
      source: 'competition',
      amountReceived: 150000,
      directCosts: 0,
      workHours: 30,
      receivedAt: '2026-11-05',
      note: '奖金到账',
    });
    const opportunities = await listAllOpportunities();
    expect(opportunities[0]?.status).toBe('paid');
    const transactions = await listTransactions();
    expect(calculateTotalCash(transactions)).toBe(150000);
  });

  it('已到账状态是终态，不能再流转', async () => {
    expect(canTransition('paid', 'cancelled')).toBe(false);
    expect(canTransition('rejected', 'applied')).toBe(false);
    expect(canTransition('identified', 'applied')).toBe(true);
  });

  it('更新机会信息不影响状态', async () => {
    const id = await seed();
    await changeOpportunityStatus(id, 'applied');
    const updated = await updateOpportunity(id, { notes: '已投递简历' });
    expect(updated.status).toBe('applied');
    expect(updated.notes).toBe('已投递简历');
  });

  it('产生收入记录的机会不能被删除', async () => {
    const id = await seed();
    await recordIncome({
      opportunityId: id,
      source: 'competition',
      amountReceived: 10000,
      directCosts: 0,
      workHours: 1,
      receivedAt: '2026-11-06',
      note: '',
    });
    await expect(deleteOpportunity(id)).rejects.toThrow();
  });

  it('没有收入记录的机会可以删除', async () => {
    const id = await seed();
    await deleteOpportunity(id);
    expect(await listAllOpportunities()).toHaveLength(0);
  });
});

describe('备份导出与导入', () => {
  async function seedFullDataset(): Promise<{ incomeId: string }> {
    await applySettingsPatch({ currency: 'CNY', emergencyTarget: 300000 });
    const { income } = await recordIncome({
      opportunityId: null,
      source: 'programming',
      amountReceived: 250000,
      directCosts: 30000,
      workHours: 10,
      receivedAt: '2026-07-01',
      note: '备份测试',
    });
    await allocateIncome(income.id, { kind: 'amounts', amounts: { brz: 150000, emergency: 70000 } });
    return { incomeId: income.id };
  }

  it('导出文件包含完整数据并通过自校验', async () => {
    const { incomeId } = await seedFullDataset();
    const file = await buildBackupFile();

    expect(file.app).toBe('brz-fund');
    expect(file.data.incomes).toHaveLength(1);
    expect(file.data.allocations).toHaveLength(2);
    expect(file.data.transactions).toHaveLength(1);
    expect(file.data.settings).toHaveLength(1);

    const validation = validateBackupPayload(file);
    expect(validation.ok).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.counts?.allocations).toBe(2);

    const incomes = await listIncomes();
    expect(incomes[0]?.id).toBe(incomeId);
  });

  it('清空数据 → 导入备份 → 数据完整恢复（保留原有 ID）', async () => {
    await seedFullDataset();
    const file = await buildBackupFile();
    const incomesBefore = await listIncomes();
    const allocationsBefore = await listForIncome(incomesBefore[0]?.id ?? '');

    await clearAllData();
    expect(await listIncomes()).toHaveLength(0);
    expect(await listSettingsOrNull()).toBeNull();
    const metaAfterClear = await getMeta();
    expect(metaAfterClear.userCleared).toBe(true);

    await importBackupData(file.data);

    const incomesAfter = await listIncomes();
    expect(incomesAfter).toHaveLength(1);
    expect(incomesAfter[0]?.id).toBe(incomesBefore[0]?.id);
    expect(incomesAfter[0]?.transactionId).toBe(incomesBefore[0]?.transactionId);

    const allocationsAfter = await listForIncome(incomesAfter[0]?.id ?? '');
    expect(allocationsAfter.map((item) => item.id).sort()).toEqual(
      allocationsBefore.map((item) => item.id).sort(),
    );

    const transactions = await listTransactions();
    expect(calculateTotalCash(transactions)).toBe(220000);

    const settings = await loadSettings();
    expect(settings.emergencyTarget).toBe(300000);

    const metaAfterImport = await getMeta();
    expect(metaAfterImport.userCleared).toBe(false);
  });

  it('无效 JSON 被拒绝，且现有数据保持不变', async () => {
    await seedFullDataset();
    const before = await listIncomes();

    const result = await parseBackupText('{ 这不是 JSON');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    const after = await listIncomes();
    expect(after.map((item) => item.id)).toEqual(before.map((item) => item.id));
  });

  it('结构不完整或引用缺失的备份被拒绝，不写入任何数据', async () => {
    await seedFullDataset();
    const before = await listIncomes();

    const corrupted = await buildBackupFile();
    corrupted.data.allocations[0]!.incomeRecordId = 'missing-income-id';
    const validation = validateBackupPayload(corrupted);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('')).toContain('不存在的收入记录');

    const attempt = await importBackupFromText(JSON.stringify(corrupted), {
      confirmOverwrite: true,
    });
    expect(attempt.ok).toBe(false);
    expect(attempt.errors.join('')).toContain('不存在的收入记录');

    const after = await listIncomes();
    expect(after.map((item) => item.id)).toEqual(before.map((item) => item.id));
  });

  it('拒绝其它应用的备份文件与更高版本 schema', async () => {
    const other = validateBackupPayload({ app: 'other-app', schemaVersion: 1, data: {} });
    expect(other.ok).toBe(false);

    const future = validateBackupPayload({
      app: 'brz-fund',
      backupVersion: 1,
      schemaVersion: 99,
      exportedAt: '2026-07-01T00:00:00.000Z',
      appVersion: '9.9.9',
      data: {},
    });
    expect(future.ok).toBe(false);
    expect(future.errors.join('')).toContain('更高版本');
  });

  it('未确认覆盖时导入直接取消', async () => {
    await seedFullDataset();
    const file = await buildBackupFile();
    await expect(
      importBackupFromText(JSON.stringify(file), { confirmOverwrite: false }),
    ).rejects.toThrow();
  });

  it('同一笔收入存在多条入账交易的备份被拒绝', async () => {
    await seedFullDataset();
    const file = await buildBackupFile();
    const duplicatedTransaction = { ...file.data.transactions[0]!, id: 'tx-duplicate' };
    file.data.transactions.push(duplicatedTransaction);
    const validation = validateBackupPayload(file);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('')).toContain('多条入账交易');
  });
});

async function listSettingsOrNull() {
  const { getSettings } = await import('@/repositories/settingsRepository');
  return getSettings();
}
