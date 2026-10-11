import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  formatDateDisplay,
  isValidDateString,
  monthKeyToShortLabel,
  monthKeyOf,
  monthsBetween,
  previousMonthKey,
  toDateString,
  todayString,
} from '@/utils/date';

describe('addMonths（月份边界）', () => {
  it('普通跨月', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15');
  });

  it('月末收束：1/31 加一个月收束到 2/28', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('闰年 2 月正确处理', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('跨年与负数月份', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });
});

describe('addDays / daysBetween', () => {
  it('跨月与跨年', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
  });

  it('同一日期相差 0 天', () => {
    expect(daysBetween('2026-03-15', '2026-03-15')).toBe(0);
  });
});

describe('monthsBetween', () => {
  it('按自然月差计算', () => {
    expect(monthsBetween('2026-01-15', '2026-07-15')).toBe(6);
    expect(monthsBetween('2026-07-15', '2026-01-15')).toBe(-6);
    expect(monthsBetween('2026-01-31', '2026-02-01')).toBe(1);
  });
});

describe('日期字符串校验', () => {
  it('拒绝不存在的日期', () => {
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-1-1')).toBe(false);
    expect(isValidDateString('2026/01/01')).toBe(false);
  });

  it('闰年 2 月 29 日有效', () => {
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false);
  });
});

describe('toDateString / todayString', () => {
  it('使用本地日历日，不受 UTC 时区偏移影响', () => {
    expect(toDateString(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(toDateString(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('monthKey 工具', () => {
  it('从日期取月份键', () => {
    expect(monthKeyOf('2026-07-15')).toBe('2026-07');
  });

  it('上一月份键跨年正确', () => {
    expect(previousMonthKey(new Date(2026, 0, 15))).toBe('2025-12');
    expect(previousMonthKey(new Date(2026, 6, 15))).toBe('2026-06');
  });

  it('月份短标签', () => {
    expect(monthKeyToShortLabel('2026-07')).toBe('7 月');
  });
});

describe('formatDateDisplay', () => {
  it('输出中文日期，非法输入原样返回', () => {
    expect(formatDateDisplay('2026-07-15')).toBe('2026年7月15日');
    expect(formatDateDisplay('bad')).toBe('bad');
  });
});
