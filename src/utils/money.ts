import type { Cents, CurrencyCode } from '@/types/models';

export interface ProportionEntry<K extends string> {
  key: K;
  value: number;
}

export function parseMoneyToCents(input: string): number | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .trim()
    .replace(/\s/g, '')
    .replace(/[\u00a5\uffe5$\u20ac\u00a3]/g, '')
    .replace(/[\u5143\u5757]/g, '');
  // 允许「12」「12.3」「12.34」以及带千分位的「1,234.56」，拒绝 「1,2,3」这类含糊写法
  const plain = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
  const grouped = /^(-?)(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/;
  const match = plain.exec(cleaned) ?? grouped.exec(cleaned);
  if (!match) return null;
  const negative = match[1] === '-';
  const intPart = (match[2] ?? '0').replace(/,/g, '');
  const fracPart = match[3] ?? '';
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function centsToNumber(cents: Cents): number {
  return cents / 100;
}

export function centsToInput(cents: Cents): string {
  if (!Number.isFinite(cents)) return '';
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const intPart = Math.floor(abs / 100);
  const frac = abs % 100;
  let text = String(intPart);
  if (frac !== 0) {
    text += frac % 10 === 0 ? `.${Math.floor(frac / 10)}` : `.${String(frac).padStart(2, '0')}`;
  }
  return negative ? `-${text}` : text;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((acc, value) => acc + value, 0);
}

export function isNonNegativeCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isNonNegativePercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

type FormatterOptions = Intl.NumberFormatOptions;

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, options: FormatterOptions): Intl.NumberFormat {
  const cacheKey = `${locale}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(locale, options);
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

/** 按指定币种与语言格式化整数分金额。 */
export function formatMoney(
  cents: Cents,
  currency: CurrencyCode = 'CNY',
  locale = 'zh-CN',
  options: FormatterOptions = {},
): string {
  const optionsResolved: FormatterOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  };
  try {
    return getFormatter(locale, { style: 'currency', currency, ...optionsResolved }).format(
      centsToNumber(cents),
    );
  } catch {
    return `${centsToInput(cents)} ${currency}`;
  }
}

/** 大额金额的紧凑显示（用于图表坐标轴等空间受限处）。 */
export function formatMoneyCompact(
  cents: Cents,
  currency: CurrencyCode = 'CNY',
  locale = 'zh-CN',
): string {
  try {
    return getFormatter(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(centsToNumber(cents));
  } catch {
    return `${centsToInput(cents)} ${currency}`;
  }
}

export function formatPercent(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(fractionDigits)}%`;
}

/**
 * 按比例把金额拆分为整数分，使用最大余数法保证各项之和恰好等于原金额，
 * 不产生浮点误差造成的零头丢失。
 */
export function distributeByRatio<K extends string>(
  amount: Cents,
  entries: ReadonlyArray<ProportionEntry<K>>,
): ProportionEntry<K>[] {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('distributeByRatio 仅接受非负整数分金额');
  }
  const active = entries.filter((entry) => entry.value > 0);
  if (active.length === 0) return entries.map((entry) => ({ ...entry, value: 0 }));

  const ratioSum = active.reduce((acc, entry) => acc + entry.value, 0);
  const allocated = active.map((entry) => {
    const exact = (amount * entry.value) / ratioSum;
    const floor = Math.floor(exact);
    return { key: entry.key, floor, remainder: exact - floor };
  });

  let leftover = amount - allocated.reduce((acc, entry) => acc + entry.floor, 0);
  const byRemainder = [...allocated].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.key.localeCompare(b.key);
  });
  const bonus = new Set<K>();
  for (const entry of byRemainder) {
    if (leftover <= 0) break;
    bonus.add(entry.key);
    leftover -= 1;
  }

  return entries.map((entry) => {
    const hit = allocated.find((item) => item.key === entry.key);
    if (!hit) return { key: entry.key, value: 0 };
    return { key: entry.key, value: hit.floor + (bonus.has(entry.key) ? 1 : 0) };
  });
}
