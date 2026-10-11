<script setup lang="ts">
import { onMounted, ref } from 'vue';

const status = ref('正在检查本地数据存储…');
const failed = ref(false);

onMounted(async () => {
  try {
    const { probeIndexedDb } = await import('@/db/database');
    const available = await probeIndexedDb();
    if (!available) {
      failed.value = true;
      status.value = '当前浏览器环境不可用或禁止了 IndexedDB，BRZ Fund 无法安全保存数据。';
      return;
    }
    const { loadDashboardBundle } = await import('@/services/integrityService');
    const bundle = await loadDashboardBundle();
    status.value = `数据层已就绪：交易 ${bundle.transactionCount} 条，购车基金余额 ${(
      bundle.summary.fundBalance / 100
    ).toFixed(2)} 元。`;
  } catch (error) {
    failed.value = true;
    status.value = `初始化失败：${error instanceof Error ? error.message : String(error)}`;
  }
});
</script>

<template>
  <main class="boot">
    <h1>BRZ Fund</h1>
    <p :class="failed ? 'text-danger' : 'text-secondary'">{{ status }}</p>
  </main>
</template>

<style scoped>
.boot {
  max-width: 720px;
  margin: 0 auto;
  padding: 64px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
