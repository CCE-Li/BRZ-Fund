import { computed } from 'vue';
import { useAppStore } from '@/stores/appStore';
import { centsToNumber, formatMoney, parseMoneyToCents } from '@/utils/money';
import { formatMoneyCompact } from '@/utils/money';

/** 统一的金额展示与解析入口，组件不直接调用底层格式化函数。 */
export function useMoney() {
  const app = useAppStore();

  function money(cents: number, currency?: string): string {
    return formatMoney(cents, currency ?? app.currency, app.locale);
  }

  function moneyCompact(cents: number, currency?: string): string {
    return formatMoneyCompact(cents, currency ?? app.currency, app.locale);
  }

  function yuan(cents: number): number {
    return centsToNumber(cents);
  }

  function parse(text: string): number | null {
    return parseMoneyToCents(text);
  }

  const currency = computed(() => app.currency);
  const locale = computed(() => app.locale);

  return { money, moneyCompact, yuan, parse, currency, locale };
}
