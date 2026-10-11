import { expect, test, type Page } from '@playwright/test';

/**
 * 离线可用性验收。
 *
 * 这里守两个容易回归的点：
 * 1. 首次访问时浏览器会在 Service Worker 生效之前取走入口脚本与样式，
 *    如果构建期没有把这些资源写进预缓存清单，离线打开会白屏。
 * 2. 部分静态服务器（vite preview、部分托管）给资源加了 `Vary: Origin`，
 *    而预缓存请求不带 Origin、页面请求模块脚本时带 Origin，
 *    若缓存匹配不忽略 Vary，就会出现「资源已缓存但离线仍 504」。
 */

async function completeOnboarding(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('购车目标名称').fill('离线验收');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('裸车目标价格').fill('60000');
  await page.getByLabel('购车附加费用预算').fill('5000');
  await page.getByLabel('初期整备及维修预算').fill('3000');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '完成初始化' }).click();
  await expect(page.getByRole('heading', { name: '总览', level: 1 })).toBeVisible();
}

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.state === 'activated';
    },
    undefined,
    { timeout: 20_000 },
  );
}

test('Service Worker 注册并预缓存应用外壳', async ({ page }) => {
  await completeOnboarding(page);
  await waitForServiceWorker(page);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    const html = await fetch('./index.html').then((response) => response.text());
    const referenced = Array.from(
      html.matchAll(/(?:src|href)="\.\/([^"]+)"/g),
      (match) => new URL(match[1] ?? '', location.href).href,
    );
    return { urls, referenced };
  });

  expect(cached.urls.some((url) => url.endsWith('/index.html'))).toBe(true);
  expect(cached.urls.some((url) => /\/assets\/index-.*\.js$/.test(url))).toBe(true);

  // index.html 引用的每个资源都必须已在预缓存里，否则离线会缺文件
  const missing = cached.referenced.filter((url) => !cached.urls.includes(url));
  expect(missing).toEqual([]);
});

test('断网后重新加载仍然可用，且设置页显示已缓存', async ({ page, context }) => {
  await completeOnboarding(page);
  await waitForServiceWorker(page);
  await page.waitForTimeout(500);

  // 设置页应报告离线已就绪
  await page.getByRole('link', { name: '设置' }).first().click();
  await expect(page.getByText('已缓存，可离线使用')).toBeVisible();

  // 断网后刷新（当前路由是设置页，刷新后应仍停留在设置页而不是白屏）
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible();

  // 离线状态下导航与数据都要正常
  await page.getByRole('link', { name: '总览' }).first().click();
  await expect(page.getByRole('heading', { name: '总览', level: 1 })).toBeVisible();
  await expect(page.getByText('¥68,000.00').first()).toBeVisible();

  // 离线状态下也能继续记录（数据只写本地 IndexedDB）
  await page.getByRole('link', { name: '流水' }).first().click();
  await expect(page.getByRole('heading', { name: '收支流水', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '记录一笔变动' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: '金额' }).fill('500');
  await page.getByRole('dialog').getByRole('button', { name: '保存交易' }).click();
  await expect(page.getByText('交易已保存')).toBeVisible();

  await context.setOffline(false);

  // 恢复联网后刷新，离线期间的记录仍在
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '收支流水', level: 1 })).toBeVisible();
  await expect(page.getByRole('listitem').getByText('支出')).toBeVisible();
});
