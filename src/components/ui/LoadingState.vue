<script setup lang="ts">
withDefaults(defineProps<{ message?: string; rows?: number }>(), {
  message: '正在加载数据…',
  rows: 3,
});
</script>

<template>
  <div class="loading" role="status" aria-live="polite">
    <div v-for="index in rows" :key="index" class="loading__row" />
    <p class="loading__message">{{ message }}</p>
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) 0;
}

.loading__row {
  height: 14px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--bg-panel) 25%, var(--bg-hover) 50%, var(--bg-panel) 75%);
  background-size: 200% 100%;
  animation: loading-shimmer 1.4s ease infinite;
}

.loading__row:nth-child(2) {
  width: 80%;
}

.loading__row:nth-child(3) {
  width: 60%;
}

.loading__message {
  font-size: 12px;
  color: var(--text-tertiary);
}

@keyframes loading-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
</style>
