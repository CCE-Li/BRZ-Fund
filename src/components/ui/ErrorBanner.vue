<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    message: string;
    tone?: 'danger' | 'warning' | 'info';
    dismissible?: boolean;
  }>(),
  {
    title: '',
    tone: 'warning',
    dismissible: false,
  },
);

const emit = defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div class="banner" :class="`banner--${tone}`" role="alert">
    <div class="banner__content">
      <p v-if="title" class="banner__title">{{ title }}</p>
      <p class="banner__message">{{ message }}</p>
      <slot />
    </div>
    <button v-if="dismissible" class="banner__close" type="button" aria-label="关闭" @click="emit('dismiss')">
      ×
    </button>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
  font-size: 13px;
}

.banner--danger {
  background: var(--danger-soft);
  border-color: var(--danger);
}

.banner--warning {
  background: var(--warning-soft);
  border-color: var(--warning);
}

.banner--info {
  background: var(--info-soft);
  border-color: var(--info);
}

.banner__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.banner__title {
  font-weight: 600;
}

.banner__message {
  color: var(--text-secondary);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.banner__close {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.banner__close:hover {
  color: var(--text);
}
</style>
