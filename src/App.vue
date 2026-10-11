<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import { toErrorMessage } from '@/utils/errors';

const app = useAppStore();
const finance = useFinanceStore();
const fatalError = ref<string | null>(null);

async function hydrateFinance(): Promise<void> {
  try {
    await finance.reload(app.settings);
  } catch (error) {
    fatalError.value = toErrorMessage(error);
  }
}

onMounted(async () => {
  try {
    await app.bootstrap();
    await hydrateFinance();
  } catch (error) {
    fatalError.value = toErrorMessage(error);
  }
});

watch(
  () => [app.settings.currency, app.settings.emergencyTarget, app.settings.allocationRatios],
  () => {
    void hydrateFinance();
  },
  { deep: true },
);

function retry(): void {
  window.location.reload();
}
</script>

<template>
  <div v-if="!app.bootStatus || app.bootStatus === 'loading'" class="boot">
    <LoadingState message="正在读取本地数据…" :rows="4" />
  </div>

  <div v-else-if="fatalError || app.bootStatus === 'failed'" class="boot">
    <div class="boot__panel">
      <h1 class="boot__title">无法启动 BRZ Fund</h1>
      <p class="boot__message">{{ fatalError ?? app.bootError }}</p>
      <p class="boot__hint">
        你的数据仍然保存在浏览器中，应用没有做任何写入。若问题是浏览器禁用了本地存储，请退出隐私模式后重试。
      </p>
      <BaseButton variant="primary" @click="retry">重新加载页面</BaseButton>
    </div>
  </div>

  <RouterView v-else />
</template>

<style scoped>
.boot {
  padding: var(--space-6);
  max-width: 640px;
  margin: 0 auto;
}

.boot__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border: 1px solid var(--danger);
  background: var(--danger-soft);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}

.boot__title {
  font-size: 18px;
}

.boot__message {
  color: var(--text);
  line-height: 1.6;
}

.boot__hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
