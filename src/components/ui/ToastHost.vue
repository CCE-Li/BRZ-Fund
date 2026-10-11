<script setup lang="ts">
import { useToast } from '@/composables/useToast';

const toast = useToast();
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite">
      <div
        v-for="item in toast.items"
        :key="item.id"
        class="toast"
        :class="`toast--${item.tone}`"
        role="status"
      >
        <span class="toast__message">{{ item.message }}</span>
        <button class="toast__close" type="button" aria-label="关闭提示" @click="toast.dismiss(item.id)">
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
  pointer-events: auto;
  animation: toast-in 160ms ease-out;
}

.toast--success {
  border-left: 3px solid var(--accent);
}

.toast--info {
  border-left: 3px solid var(--info);
}

.toast--warning {
  border-left: 3px solid var(--warning);
}

.toast--danger {
  border-left: 3px solid var(--danger);
}

.toast__message {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
}

.toast__close {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}

.toast__close:hover {
  color: var(--text);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
