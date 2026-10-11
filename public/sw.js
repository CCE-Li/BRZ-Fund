/**
 * 离线缓存 Service Worker。
 *
 * 策略：
 * - 应用外壳（index.html + assets/*）在安装阶段预缓存。
 *   这很关键：首次访问时浏览器会在 SW 生效之前就把入口脚本和样式取走，
 *   若不预缓存，这些文件永远不会进入缓存，离线打开就只有一张白页。
 * - 导航请求：network-first（保证拿到最新版本），失败时回退到缓存的首页
 * - 其它同源 GET：cache-first，未命中再联网并写入缓存
 *
 * 缓存名与预缓存清单在构建时由 vite.config.ts 注入（见 brz-fund-precache 插件），
 * 因此每次构建的资源哈希变化都会产生新的缓存名，旧缓存在 activate 阶段被清理。
 */
const CACHE = '__CACHE_NAME__';
const PRECACHE = /* __PRECACHE_LIST__ */ [];
const HOME = './index.html';

async function precache() {
  const cache = await caches.open(CACHE);
  // 逐个缓存并容忍单个失败：某个资源缺失不应该让整个离线能力失效
  const results = await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[BRZ Fund] 预缓存完成，${failed} 个资源失败（离线时可能缺失对应功能）`);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 必须忽略 Vary：某些静态服务器（vite preview、部分托管）会给资源加
  // `Vary: Origin`，而预缓存由 SW 自己发起、不带 Origin 头，
  // 页面请求模块脚本时会带 Origin —— 默认匹配会因 Vary 不一致而漏命中，
  // 表现为「资源明明缓存了，离线仍然 504」。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(HOME, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(HOME, { ignoreVary: true })
            .then((cached) => cached ?? new Response('离线且无可用缓存', { status: 503 })),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? new Response('', { status: 504 }));
    }),
  );
});
