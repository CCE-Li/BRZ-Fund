import { expect, test } from '@playwright/test';

test('首次访问进入初始化向导，完成后显示 Dashboard 且刷新后数据保留', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '初始化 BRZ Fund' })).toBeVisible();
  await expect(page.getByText('初始余额始终为 0')).toBeVisible();

  // 第 1 步：目标名称与货币
  await page.getByLabel('购车目标名称').fill('二手 Subaru BRZ');
  await page.getByRole('button', { name: '下一步' }).click();

  // 第 2 步：价格与预算（元 → 分换算 + 总额展示）
  await page.getByLabel('裸车目标价格').fill('60000');
  await page.getByLabel('购车附加费用预算').fill('5000');
  await page.getByLabel('初期整备及维修预算').fill('3000');
  await expect(page.getByText('¥68,000.00')).toBeVisible();
  await page.getByRole('button', { name: '下一步' }).click();

  // 第 3 步：日期与分配
  await expect(page.getByLabel('计划购车日期')).toBeVisible();
  await page.getByRole('button', { name: '完成初始化' }).click();

  // Dashboard：真实数据显示，余额从 0 开始
  await expect(page.getByRole('heading', { name: '总览' })).toBeVisible();
  await expect(page.getByText('当前购车基金余额')).toBeVisible();
  await expect(page.getByText('¥0.00').first()).toBeVisible();
  await expect(page.getByText('¥68,000.00').first()).toBeVisible();
  await expect(page.getByText('数据不足，暂时无法可靠预测。')).toBeVisible();
  await expect(page.getByText('还没有任何资金记录')).toBeVisible();

  // 刷新后数据仍然存在（IndexedDB 持久化 + 水合）
  await page.reload();
  await expect(page.getByRole('heading', { name: '总览' })).toBeVisible();
  await expect(page.getByText('¥68,000.00').first()).toBeVisible();
  await expect(page.getByText('初始化 BRZ Fund')).toHaveCount(0);
});

test('设置页可修改目标与比例，保存后持久化并在刷新后生效', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('购车目标名称').fill('BRZ');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('裸车目标价格').fill('55000');
  await page.getByLabel('购车附加费用预算').fill('4000');
  await page.getByLabel('初期整备及维修预算').fill('4000');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '完成初始化' }).click();
  await expect(page.getByRole('heading', { name: '总览' })).toBeVisible();

  // 进入设置页
  await page.getByRole('link', { name: '设置' }).first().click();
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();

  // 修改目标：裸车价 55000 → 68000，总额应实时更新
  await page.getByLabel('裸车目标价格').fill('68000');
  await expect(page.getByText('¥76,000.00')).toBeVisible();
  await page.getByRole('button', { name: '保存目标' }).click();
  await expect(page.getByText('购车目标已保存')).toBeVisible();

  // 修改分配比例与应急储备目标
  await page.getByLabel('购车基金（%）').fill('60');
  await page.getByLabel('应急储备（%）').fill('30');
  await page.getByLabel('其他用途（%）').fill('10');
  await page.getByLabel('应急储备目标').fill('5000');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('分配比例与应急储备目标已保存')).toBeVisible();

  // 刷新后设置保留
  await page.reload();
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await expect(page.getByLabel('裸车目标价格')).toHaveValue('68000');
  await expect(page.getByLabel('购车基金（%）')).toHaveValue('60');
  await expect(page.getByLabel('应急储备目标')).toHaveValue('5000');
});

test('主题切换与路由跳转可用', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('购车目标名称').fill('BRZ');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('裸车目标价格').fill('50000');
  await page.getByLabel('购车附加费用预算').fill('0');
  await page.getByLabel('初期整备及维修预算').fill('0');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '完成初始化' }).click();
  await expect(page.getByRole('heading', { name: '总览' })).toBeVisible();

  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole('button', { name: '浅色主题' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(themeBefore);

  // 刷新后主题保留
  await page.reload();
  await expect(page.getByRole('button', { name: '深色主题' })).toBeVisible();

  // 路由跳转（各页面标题正确）
  await page.getByRole('link', { name: '机会' }).first().click();
  await expect(page.getByRole('heading', { name: '收入机会' })).toBeVisible();

  await page.getByRole('link', { name: '预测' }).first().click();
  await expect(page.getByRole('heading', { name: '购车预测' })).toBeVisible();

  // 未知路由 → 404 页面
  await page.goto('/#/definitely-not-a-page');
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible();
});
