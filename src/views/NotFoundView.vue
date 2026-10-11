<script setup lang="ts">
import { RouterLink } from 'vue-router';
import BaseButton from '@/components/ui/BaseButton.vue';
</script>

<template>
  <div class="not-found">
    <h1 class="not-found__title">页面不存在</h1>
    <p class="not-found__message">你访问的页面不存在或已被移除。</p>
    <RouterLink :to="{ name: 'dashboard' }">
      <BaseButton variant="primary">返回总览</BaseButton>
    </RouterLink>
  </div>
</template>

<style scoped>
.not-found {
  max-width: 480px;
  margin: 0 auto;
  padding: var(--space-7) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  text-align: center;
  align-items: center;
}

.not-found__title {
  font-size: 20px;
}

.not-found__message {
  color: var(--text-secondary);
}
</style>
