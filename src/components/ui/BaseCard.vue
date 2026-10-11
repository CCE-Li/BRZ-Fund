<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    padded?: boolean;
  }>(),
  {
    title: '',
    subtitle: '',
    padded: true,
  },
);
</script>

<template>
  <section class="card">
    <header v-if="title || $slots.header || $slots.actions" class="card__header">
      <div class="card__titles">
        <slot name="header">
          <h2 class="card__title">{{ title }}</h2>
          <p v-if="subtitle" class="card__subtitle">{{ subtitle }}</p>
        </slot>
      </div>
      <div v-if="$slots.actions" class="card__actions">
        <slot name="actions" />
      </div>
    </header>
    <div :class="{ 'card__body--padded': padded }">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5) 0;
}

.card__titles {
  min-width: 0;
}

.card__title {
  font-size: 14px;
}

.card__subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.card__body--padded {
  padding: var(--space-4) var(--space-5);
}

.card__footer {
  padding: 0 var(--space-5) var(--space-4);
}
</style>
