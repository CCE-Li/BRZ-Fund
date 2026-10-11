import { computed, reactive, readonly } from 'vue';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** 需要用户输入指定文字才能确认（用于清空数据等高风险操作）。 */
  requireText?: string;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
}

const state = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: '确认',
  cancelLabel: '取消',
  tone: 'default',
  requireText: undefined,
  resolve: null,
});

export function useConfirmState() {
  return readonly(state);
}

/** 弹出确认对话框；危险操作必须经由此入口，禁止直接执行。 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    state.title = options.title;
    state.message = options.message;
    state.confirmLabel = options.confirmLabel ?? '确认';
    state.cancelLabel = options.cancelLabel ?? '取消';
    state.tone = options.tone ?? 'default';
    state.requireText = options.requireText;
    state.resolve = resolve;
    state.open = true;
  });
}

export function settleConfirm(result: boolean): void {
  state.open = false;
  const resolver = state.resolve;
  state.resolve = null;
  resolver?.(result);
}

export function useConfirm() {
  return {
    state: useConfirmState(),
    confirm: confirmAction,
    needsText: computed(() => state.requireText ?? null),
  };
}
