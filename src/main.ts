import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { router } from '@/router';
import '@/styles/tokens.css';
import '@/styles/base.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');

// 注册离线缓存：只生产环境注册，避免开发时缓存住未带哈希的开发资源
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
      // 注册失败不影响核心功能（数据始终存在 IndexedDB），仅失去离线访问能力
      console.warn('[BRZ Fund] Service Worker 注册失败：', error);
    });
  });
}
