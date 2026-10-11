<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="empty">
    <div class="empty__mark" aria-hidden="true">◎</div>
    <h3 class="empty__title">{{ title }}</h3>
    <p v-if="description" class="empty__description">{{ description }}</p>
    <div v-if="$slots.default" class="empty__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
}

.empty__mark {
  font-size: 28px;
  color: var(--text-tertiary);
  line-height: 1;
}

.empty__title {
  font-size: 14px;
}

.empty__description {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 460px;
  line-height: 1.6;
}

.empty__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
  flex-wrap: wrap;
  justify-content: center;
}
</style>
