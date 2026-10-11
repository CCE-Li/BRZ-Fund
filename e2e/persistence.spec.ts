import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

async function recordIncome(page: Page, title: string, amount: string): Promise<void> {
  await goTo(page, '机会', '收入机会');
  await page.getByRole('button', { name: '新增机会' }).click();
  await page.getByLabel('机会名称').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: '创建机会' }).click();
  await expect(page.getByText('机会已创建')).toBeVisible();
  await page.getByRole('button', { name: '已在做' }).click();
  await page.getByRole('button', { name: '已完成待付款' }).click();
  await page.getByRole('button', { name: '确认到账' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: '实际到账金额' }).fill(amount);
  await page.getByRole('dialog').getByRole('button', { name: '确认到账' }).click();
  await expect(page.getByText('已确认到账')).toBeVisible();
}

test('验收 1：新增收入后刷新页面记录仍存在', async ({ page }) => {
  await completeOnboarding(page);
  await recordIncome(page, '刷新测试收入', '1800');

  await goTo(page, '总览', '总览');
  await expect(page.getByText('¥1,800.00').first()).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { name: '总览', level: 1 })).toBeVisible();
  await expect(page.getByText('¥1,800.00').first()).toBeVisible();

  await goTo(page, '机会', '收入机会');
  await expect(page.getByText('刷新测试收入')).toBeVisible();
  // 状态徽章与筛选项同名，用列表项作用域限定
  await expect(page.getByRole('listitem').getByText('已到账', { exact: true })).toBeVisible();
});

test('验收 2：关闭并重新打开浏览器后数据仍在（持久化上下文）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'brz-fund-chrome-'));
  let context: BrowserContext | null = null;

  try {
    // 第一次会话：完成初始化并记录一笔收入
    context = await chromium.launchPersistentContext(userDataDir, {
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN',
    });
    const firstPage = context.pages()[0] ?? (await context.newPage());
    await completeOnboarding(firstPage);
    await recordIncome(firstPage, '跨会话收入', '2600');

    const balanceBefore = await firstPage
      .locator('body')
      .innerText()
      .then((text) => text.includes('¥2,600.00'));
    expect(balanceBefore).toBe(true);

    // 关闭浏览器（模拟用户关闭窗口）
    await context.close();
    context = null;

    // 第二次会话：同一个用户数据目录重新打开，数据应从 IndexedDB 恢复
    context = await chromium.launchPersistentContext(userDataDir, {
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN',
    });
    const secondPage = context.pages()[0] ?? (await context.newPage());
    await secondPage.goto('http://localhost:4173/');
    await secondPage.waitForLoadState('load');

    await expect(secondPage.getByRole('heading', { name: '总览', level: 1 })).toBeVisible();
    await expect(secondPage.getByText('¥2,600.00').first()).toBeVisible();
    // 不应再次进入初始化向导
    await expect(secondPage.getByText('初始化 BRZ Fund')).toHaveCount(0);
  } finally {
    if (context) await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('验收 8：数据库写入失败时界面不会误报成功', async ({ page }) => {
  await completeOnboarding(page);

  // 注入一次写入失败：让 IndexedDB 的 add 请求抛出错误
  await page.evaluate(() => {
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function patched(
      this: IDBDatabase,
      ...args: Parameters<typeof originalTransaction>
    ) {
      const tx = originalTransaction.apply(this, args);
      const originalObjectStore = tx.objectStore.bind(tx);
      tx.objectStore = ((name: string) => {
        const store = originalObjectStore(name);
        if (name !== 'incomes') return store;
        const originalAdd = store.add.bind(store);
        store.add = ((...addArgs: Parameters<typeof originalAdd>) => {
          throw new DOMException('模拟写入失败', 'QuotaExceededError');
        }) as typeof store.add;
        return store;
      }) as typeof tx.objectStore;
      return tx;
    } as typeof IDBDatabase.prototype.transaction;
  });

  // 尝试确认到账：应当显示失败，且不能出现成功提示
  await goTo(page, '机会', '收入机会');
  await page.getByRole('button', { name: '新增机会' }).click();
  await page.getByLabel('机会名称').fill('写入失败测试');
  await page.getByRole('dialog').getByRole('button', { name: '创建机会' }).click();
  await expect(page.getByText('机会已创建')).toBeVisible();
  await page.getByRole('button', { name: '已在做' }).click();
  await page.getByRole('button', { name: '已完成待付款' }).click();
  await page.getByRole('button', { name: '确认到账' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: '实际到账金额' }).fill('999');
  await page.getByRole('dialog').getByRole('button', { name: '确认到账' }).click();

  // 失败提示：模态框保持打开以便重试，且绝不能出现成功提示
  const failDialog = page.getByRole('dialog');
  await expect(failDialog.getByText('存储空间不足', { exact: false })).toBeVisible();
  await expect(page.getByText('已确认到账')).toHaveCount(0);

  // 关闭弹窗后归零检查：余额仍为 0
  await failDialog.getByRole('button', { name: '取消' }).click();
  await expect(failDialog).toHaveCount(0);

  await goTo(page, '总览', '总览');
  await expect(page.getByText('¥0.00').first()).toBeVisible();
  await expect(page.getByText('还没有任何资金记录')).toBeVisible();
});

test('验收 9：月份边界与统计窗口（不含未结束的当前月）', async ({ page }) => {
  await completeOnboarding(page);

  // 通过真实 UI 记录一笔到账并转入购车基金
  await recordIncome(page, '本期收入', '1500');
  await goTo(page, '流水', '收支流水');
  await page.getByRole('button', { name: '记录一笔变动' }).click();
  await page.getByRole('dialog').getByLabel('变动类型').selectOption('brz_transfer');
  await page.getByRole('dialog').getByRole('textbox', { name: '金额' }).fill('900');
  await page.getByRole('dialog').getByRole('button', { name: '保存交易' }).click();
  await expect(page.getByText('交易已保存')).toBeVisible();

  // 本月记录存在，因此预测页应把本月计入「本月转入」而不是统计窗口
  await goTo(page, '预测', '购车预测');
  await expect(page.getByText('统计区间与样本')).toBeVisible();
  await expect(
    page.getByText('数据不足：需要至少 3 个有真实记录的月份，当前预测不可靠。'),
  ).toBeVisible();

  // 总览页应显示本月已存入 900
  await goTo(page, '总览', '总览');
  await expect(page.getByText('本月转入购车基金')).toBeVisible();
  await expect(page.getByText('¥900.00').first()).toBeVisible();
});

test('验收 1/10：刷新后设置、收入、分配与历史保持一致', async ({ page }) => {
  await completeOnboarding(page);
  await recordIncome(page, '一致性收入', '2000');

  // 分配 1200 到购车基金、500 到应急储备
  await goTo(page, '分配', '资金分配');
  await page.getByRole('button', { name: '立即分配' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'BRZ 购车基金' }).fill('1200');
  await page.getByRole('dialog').getByRole('textbox', { name: '应急储备' }).fill('500');
  await page.getByRole('dialog').getByRole('textbox', { name: '其他用途' }).fill('0');
  await page.getByRole('dialog').getByRole('button', { name: '确认分配' }).click();
  await expect(page.getByText('分配已保存')).toBeVisible();

  // 改一个设置，验证设置也会保留
  await goTo(page, '设置', '设置');
  await page.getByLabel('应急储备目标').fill('3000');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('分配比例与应急储备目标已保存')).toBeVisible();

  await page.reload();

  // 设置保留
  await expect(page.getByLabel('应急储备目标')).toHaveValue('3000');

  // 分配历史保留
  await goTo(page, '分配', '资金分配');
  await expect(page.getByText('BRZ 购车基金').first()).toBeVisible();
  await expect(page.getByText('分配历史')).toBeVisible();

  // 流水与收入保留
  await goTo(page, '流水', '收支流水');
  await expect(page.getByRole('listitem').getByText('收入到账')).toBeVisible();

  await goTo(page, '机会', '收入机会');
  await expect(page.getByText('一致性收入')).toBeVisible();
});
