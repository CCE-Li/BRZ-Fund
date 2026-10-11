import { expect, test, type Page } from '@playwright/test';

async function completeOnboarding(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('购车目标名称').fill('二手 Subaru BRZ');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('裸车目标价格').fill('60000');
  await page.getByLabel('购车附加费用预算').fill('5000');
  await page.getByLabel('初期整备及维修预算').fill('3000');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '完成初始化' }).click();
  await expect(page.getByRole('heading', { name: '总览', level: 1 })).toBeVisible();
}

async function goTo(page: Page, navLabel: string, heading: string): Promise<void> {
  await page.getByRole('link', { name: navLabel }).first().click();
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
}

/** 模态框内的操作统一限定作用域，避免与页面同名按钮冲突。 */
function dialog(page: Page) {
  return page.getByRole('dialog');
}

async function clickInDialog(page: Page, name: string): Promise<void> {
  await dialog(page).getByRole('button', { name, exact: true }).click();
}

/** MoneyInput 渲染为 textbox；用角色限定可避开同名的百分比输入框。 */
function moneyField(page: Page, label: string) {
  return dialog(page).getByRole('textbox', { name: label });
}

/** 向 MoneyInput 填入「元」文本，并等待受控值回写。 */
async function fillMoneyField(page: Page, label: string, text: string): Promise<void> {
  const input = moneyField(page, label);
  await input.fill(text);
  await input.blur();
  await page.waitForTimeout(120);
}

/** 覆盖确认弹窗：先填确认文字，再点确认按钮（按钮文本与标题相同）。 */
async function confirmOverwriteDialog(page: Page, phrase: string, confirmLabel: string): Promise<void> {
  const confirmDialog = page.getByRole('dialog').filter({ hasText: '请输入' });
  await confirmDialog.getByLabel(`请输入「${phrase}」以继续`).fill(phrase);
  await confirmDialog.getByRole('button', { name: confirmLabel, exact: true }).click();
}

async function createOpportunity(page: Page, title: string, grossMin?: string): Promise<void> {
  await page.getByRole('button', { name: '新增机会' }).click();
  await page.getByLabel('机会名称').fill(title);
  if (grossMin) await page.getByLabel('预计收入下限').fill(grossMin);
  await clickInDialog(page, '创建机会');
  await expect(page.getByText('机会已创建')).toBeVisible();
}

async function advanceToCompletedUnpaid(page: Page): Promise<void> {
  await page.getByRole('button', { name: '已在做' }).click();
  await expect(page.getByText('状态已更新为「进行中」')).toBeVisible();
  await page.getByRole('button', { name: '已完成待付款' }).click();
  await expect(page.getByText('状态已更新为「已完成未付款」')).toBeVisible();
}

async function confirmIncome(page: Page, amount: string): Promise<void> {
  await page.getByRole('button', { name: '确认到账' }).click();
  await moneyField(page, '实际到账金额').fill(amount);
  await clickInDialog(page, '确认到账');
  await expect(page.getByText('已确认到账')).toBeVisible();
}

test('验收 3-4：机会「已完成未付款」不增加余额，确认到账后才增加', async ({ page }) => {
  await completeOnboarding(page);

  await goTo(page, '机会', '收入机会');
  await createOpportunity(page, '帮社团做小程序', '800');
  await expect(page.getByText('帮社团做小程序')).toBeVisible();

  // 预计收入不进余额
  await goTo(page, '总览', '总览');
  await expect(page.getByText('¥0.00').first()).toBeVisible();

  // 推进到「已完成待付款」——余额仍不变
  await goTo(page, '机会', '收入机会');
  await advanceToCompletedUnpaid(page);
  await expect(page.getByText('状态已更新为「已完成未付款」')).toBeVisible();

  await goTo(page, '总览', '总览');
  await expect(page.getByText('¥0.00').first()).toBeVisible();

  // 确认到账后余额增加
  await goTo(page, '机会', '收入机会');
  await confirmIncome(page, '1000');

  await goTo(page, '总览', '总览');
  await expect(page.getByText('¥1,000.00').first()).toBeVisible();

  // 刷新后数据仍在（IndexedDB 持久化）
  await page.reload();
  await expect(page.getByText('¥1,000.00').first()).toBeVisible();
});

test('验收 5：同一笔收入的分配额度受限，超出会被阻止', async ({ page }) => {
  await completeOnboarding(page);

  await goTo(page, '机会', '收入机会');
  await createOpportunity(page, '直接收入');
  await advanceToCompletedUnpaid(page);
  await confirmIncome(page, '1000');

  // 分配到购车基金与应急金
  await goTo(page, '分配', '资金分配');
  await page.getByRole('button', { name: '立即分配' }).click();
  await expect(dialog(page).getByText('剩余可分配')).toBeVisible();

  // 先填入合法金额
  await fillMoneyField(page, 'BRZ 购车基金', '700');
  await fillMoneyField(page, '应急储备', '300');
  await fillMoneyField(page, '其他用途', '0');

  // 超出剩余额度时阻止提交
  await fillMoneyField(page, 'BRZ 购车基金', '1200');
  await expect(page.getByText('合计超过剩余可分配余额')).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: '确认分配' })).toBeDisabled();

  // 调回合法金额并确认
  await fillMoneyField(page, 'BRZ 购车基金', '700');
  await clickInDialog(page, '确认分配');
  await expect(page.getByText('分配已保存')).toBeVisible();

  // 额度用尽后不允许再次分配
  await expect(page.getByText('所有收入都已分配完毕')).toBeVisible();

  // 撤销分配后额度释放
  await page.getByRole('button', { name: '撤销' }).first().click();
  await clickInDialog(page, '撤销分配');
  await expect(page.getByText('分配已撤销')).toBeVisible();
  await expect(page.getByRole('button', { name: '立即分配' })).toBeVisible();
});

test('验收 6-7：导出 JSON → 清空 → 导入恢复；无效文件不破坏数据', async ({ page }) => {
  await completeOnboarding(page);

  await goTo(page, '机会', '收入机会');
  await createOpportunity(page, '备份测试机会');
  await advanceToCompletedUnpaid(page);
  await confirmIncome(page, '2500');

  // 导出 JSON 备份
  await goTo(page, '设置', '设置');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出全部数据（JSON）' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  // 清空全部数据（需输入确认文字）
  await page.getByRole('button', { name: '清空数据' }).click();
  await confirmOverwriteDialog(page, '清空数据', '清空数据');
  await expect(page.getByText('数据已清空')).toBeVisible();

  await goTo(page, '总览', '总览');
  await expect(page.getByText('还没有设置购车目标')).toBeVisible();

  // 导入无效 JSON：数据保持为空（用 filePayload 而不是临时文件）
  await goTo(page, '设置', '设置');
  await page.locator('#backup-file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ 这不是合法 JSON'),
  });
  await expect(page.getByText('备份文件校验未通过，现有数据未被修改。')).toBeVisible();
  await expect(page.getByText('备份文件校验未通过：')).toBeVisible();

  // 导入有效备份：数据完整恢复（预览面板在页面内，确认弹窗才是 dialog）
  if (!backupPath) throw new Error('未获取到备份文件路径');
  await page.locator('#backup-file').setInputFiles(backupPath);
  await expect(page.getByText('校验通过，将导入：')).toBeVisible();
  await page.getByRole('button', { name: '确认覆盖导入' }).click();
  await confirmOverwriteDialog(page, '覆盖导入', '覆盖导入');
  await expect(page.getByText('备份已导入，数据已恢复。')).toBeVisible();

  await goTo(page, '总览', '总览');
  await expect(page.getByText('¥2,500.00').first()).toBeVisible();

  await goTo(page, '机会', '收入机会');
  await expect(page.getByText('备份测试机会')).toBeVisible();
});

test('验收 10：预测页不把未到账收入算进储蓄速度', async ({ page }) => {
  await completeOnboarding(page);

  await goTo(page, '机会', '收入机会');
  await createOpportunity(page, '还没到手的钱', '5000');
  await page.getByRole('button', { name: '已在做' }).click();

  await goTo(page, '预测', '购车预测');
  await expect(
    page.getByText('数据不足：需要至少 3 个有真实记录的月份，当前预测不可靠。'),
  ).toBeVisible();
  await expect(page.getByText('暂时无法预测').first()).toBeVisible();
  await expect(page.getByText('¥5,000.00')).toHaveCount(0);
});

test('支出与转账：桶间移动不产生新收入，支出减少未分配资金', async ({ page }) => {
  await completeOnboarding(page);

  await goTo(page, '机会', '收入机会');
  await createOpportunity(page, '收入 A');
  await advanceToCompletedUnpaid(page);
  await confirmIncome(page, '2000');

  // 记录一笔 500 元支出
  await goTo(page, '流水', '收支流水');
  await page.getByRole('button', { name: '记录一笔变动' }).click();
  await moneyField(page, '金额').fill('500');
  await clickInDialog(page, '保存交易');
  await expect(page.getByText('交易已保存')).toBeVisible();

  await goTo(page, '总览', '总览');
  await expect(page.getByText('¥1,500.00').first()).toBeVisible();

  // 转入购车基金 1000：现金总额不变，购车基金增加
  await goTo(page, '流水', '收支流水');
  await page.getByRole('button', { name: '记录一笔变动' }).click();
  await dialog(page).getByLabel('变动类型').selectOption('brz_transfer');
  await moneyField(page, '金额').fill('1000');
  await clickInDialog(page, '保存交易');
  await expect(page.getByText('交易已保存')).toBeVisible();

  await goTo(page, '总览', '总览');
  await expect(page.getByText('未分配资金余额 ¥500.00')).toBeVisible();

  // 作废转账后余额回退
  await goTo(page, '流水', '收支流水');
  await page.getByRole('button', { name: '作废' }).first().click();
  await clickInDialog(page, '作废');
  await expect(page.getByText('交易已作废，余额已回退。')).toBeVisible();

  await goTo(page, '总览', '总览');
  await expect(page.getByText('未分配资金余额 ¥1,500.00')).toBeVisible();
});
