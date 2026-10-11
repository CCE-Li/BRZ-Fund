import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  distributeByRatio,
  formatMoney,
  isNonNegativeCents,
  parseMoneyToCents,
  sumCents,
} from '@/utils/money';

describe('parseMoneyToCents（元 → 整数分，定点解析）', () => {
  it('解析整数与两位小数', () => {
    expect(parseMoneyToCents('12')).toBe(1200);
    expect(parseMoneyToCents('12.3')).toBe(1230);
    expect(parseMoneyToCents('12.34')).toBe(1234);
    expect(parseMoneyToCents('0.01')).toBe(1);
    expect(parseMoneyToCents('0')).toBe(0);
  });

  it('剔除货币符号、千分位与「元」单位', () => {
    expect(parseMoneyToCents('¥1,234.50')).toBe(123450);
    expect(parseMoneyToCents('￥ 99.9')).toBe(9990);
    expect(parseMoneyToCents('1234元')).toBe(123400);
    expect(parseMoneyToCents(' 1 000.05 ')).toBe(100005);
  });

  it('拒绝非法输入而不是猜测', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('1.234')).toBeNull();
    expect(parseMoneyToCents('1.2.3')).toBeNull();
    expect(parseMoneyToCents('--5')).toBeNull();
  });

  it('避免浮点误差（0.1 + 0.2 场景）', () => {
    const a = parseMoneyToCents('0.1');
    const b = parseMoneyToCents('0.2');
    expect(a).toBe(10);
    expect(b).toBe(20);
    expect(sumCents([a ?? 0, b ?? 0])).toBe(30);
    expect(centsToInput(30)).toBe('0.3');
  });
});

describe('centsToInput（分 → 输入框文本）', () => {
  it('整数分不显示多余小数，零头补齐两位', () => {
    expect(centsToInput(1200)).toBe('12');
    expect(centsToInput(1230)).toBe('12.3');
    expect(centsToInput(1234)).toBe('12.34');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(0)).toBe('0');
  });
});

describe('formatMoney', () => {
  it('按币种格式化', () => {
    expect(formatMoney(123456, 'CNY', 'zh-CN')).toContain('1,234.56');
    expect(formatMoney(100, 'USD', 'en-US')).toContain('1.00');
  });

  it('非法币种降级为文本而不是抛错', () => {
    expect(formatMoney(1234, 'NOT_A_CURRENCY')).toContain('12.34');
  });
});

describe('distributeByRatio（最大余数法，合计必须守恒）', () => {
  it('按比例拆分且合计等于原金额', () => {
    const result = distributeByRatio(1000, [
      { key: 'brz', value: 75 },
      { key: 'emergency', value: 15 },
      { key: 'other', value: 10 },
    ]);
    expect(result.map((item) => item.value)).toEqual([750, 150, 100]);
    expect(sumCents(result.map((item) => item.value))).toBe(1000);
  });

  it('除不尽时余数不丢失', () => {
    const result = distributeByRatio(1001, [
      { key: 'a', value: 1 },
      { key: 'b', value: 1 },
      { key: 'c', value: 1 },
    ]);
    expect(sumCents(result.map((item) => item.value))).toBe(1001);
  });

  it('极小金额不会算出负数或丢失分', () => {
    const result = distributeByRatio(2, [
      { key: 'a', value: 1 },
      { key: 'b', value: 1 },
      { key: 'c', value: 1 },
    ]);
    expect(sumCents(result.map((item) => item.value))).toBe(2);
    expect(result.every((item) => item.value >= 0)).toBe(true);
  });

  it('比例全为零时返回全零', () => {
    const result = distributeByRatio(500, [
      { key: 'a', value: 0 },
      { key: 'b', value: 0 },
    ]);
    expect(result).toEqual([
      { key: 'a', value: 0 },
      { key: 'b', value: 0 },
    ]);
  });

  it('拒绝负数金额', () => {
    expect(() => distributeByRatio(-1, [{ key: 'a', value: 1 }])).toThrow();
  });
});

describe('isNonNegativeCents', () => {
  it('只接受非负整数', () => {
    expect(isNonNegativeCents(0)).toBe(true);
    expect(isNonNegativeCents(100)).toBe(true);
    expect(isNonNegativeCents(-1)).toBe(false);
    expect(isNonNegativeCents(1.5)).toBe(false);
    expect(isNonNegativeCents(Number.NaN)).toBe(false);
    expect(isNonNegativeCents('100')).toBe(false);
  });
});
