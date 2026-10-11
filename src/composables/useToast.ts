import { computed, reactive, readonly } from 'vue';
import { createId } from '@/utils/id';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
  timeoutMs: number;
}

const state = reactive<{ items: ToastItem[] }>({ items: [] });

function push(message: string, tone: ToastTone = 'info', timeoutMs = 4000): string {
  const id = createId();
  state.items.push({ id, tone, message, timeoutMs });
  if (timeoutMs > 0 && typeof setTimeout === 'function') {
    setTimeout(() => dismiss(id), timeoutMs);
  }
  return id;
}

function dismiss(id: string): void {
  const index = state.items.findIndex((item) => item.id === id);
  if (index >= 0) state.items.splice(index, 1);
}

function clear(): void {
  state.items.splice(0, state.items.length);
}

/** 轻量全局提示；组件通过 ToastHost 渲染，业务代码只调用 push。 */
export function useToast() {
  return {
    items: readonly(state).items,
    push,
    dismiss,
    clear,
    info: (message: string) => push(message, 'info'),
    success: (message: string) => push(message, 'success'),
    warn: (message: string) => push(message, 'warning', 6000),
    error: (message: string) => push(message, 'danger', 8000),
  };
}

export function useToastItems() {
  return computed(() => state.items);
}
