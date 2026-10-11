import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 把应用外壳（index.html + 构建产物 assets）写进 Service Worker 的预缓存清单。
 *
 * 为什么必须预缓存：首次访问时浏览器会在 SW 生效之前取走入口脚本与样式，
 * 这些请求不经过 fetch 处理器，因此永远不会被运行时缓存命中。
 * 离线打开时 HTML 能从缓存出来，却加载不到 JS，表现为白屏。
 *
 * 同时按清单内容生成缓存名：构建产物哈希一变，缓存名就变，
 * activate 阶段会清掉旧缓存，避免新旧资源混用。
 */
function brzFundPrecache(): Plugin {
  return {
    name: 'brz-fund-precache',
    apply: 'build',
    closeBundle: {
      order: 'post',
      handler() {
        const outDir = fileURLToPath(new URL('./dist', import.meta.url));
        const swPath = join(outDir, 'sw.js');
        if (!existsSync(swPath)) return;

        const assetDir = join(outDir, 'assets');
        const assets = existsSync(assetDir)
          ? readdirSync(assetDir, { recursive: true })
              .map((entry) => String(entry))
              .filter((entry) => !entry.endsWith('.map'))
              .map((entry) => `assets/${entry.split(sep).join('/')}`)
          : [];

        // 根目录下需要离线可用的静态文件（图标与 manifest 参与安装与启动）
        const rootFiles = ['manifest.webmanifest', 'logo-192.png', 'logo-512.png'].filter((file) =>
          existsSync(join(outDir, file)),
        );

        const list = ['index.html', ...rootFiles, ...assets].sort();
        const hash = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 8);

        const source = readFileSync(swPath, 'utf8');
        const injected = source
          .replace("'__CACHE_NAME__'", `'brz-fund-${hash}'`)
          .replace('/* __PRECACHE_LIST__ */ []', JSON.stringify(list.map((file) => `./${file}`)));

        writeFileSync(swPath, injected, 'utf8');
        console.log(`\n  precache: ${list.length} 个资源写入 sw.js（缓存名 brz-fund-${hash}）`);
      },
    },
  };
}

export default defineConfig({
  // 相对 base：GitHub Pages 子路径与本地预览均可直接工作
  base: './',
  plugins: [vue(), brzFundPrecache()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});

export { brzFundPrecache };
