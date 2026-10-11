import type { DateString, ISODateTimeString, MonthKey } from '@/types/models';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDateString(date: Date): DateString {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateString(value: DateString): Date {
  const match = DATE_PATTERN.exec(value);
  if (!match) return new Date(Number.NaN);
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return new Date(Number.NaN);
  }
  return date;
}

export function isValidDateString(value: unknown): value is DateString {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  return !Number.isNaN(parseDateString(value).getTime());
}

export function isValidIsoDateTime(value: unknown): value is ISODateTimeString {
  if (typeof value !== 'string' || value.length < 10) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function todayString(): DateString {
  return toDateString(new Date());
}

export function monthKeyOf(value: DateString): MonthKey {
  return value.slice(0, 7);
}

export function currentMonthKey(reference: Date = new Date()): MonthKey {
  return `${reference.getFullYear()}-${pad2(reference.getMonth() + 1)}`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function addDays(value: DateString, days: number): DateString {
  const date = parseDateString(value);
  if (Number.isNaN(date.getTime())) throw new Error(`无效日期: ${value}`);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

/** 月份加减；目标月份天数不足时收束到月末（如 1/31 + 1 个月 = 2/28）。 */
export function addMonths(value: DateString, months: number): DateString {
  const date = parseDateString(value);
  if (Number.isNaN(date.getTime())) throw new Error(`无效日期: ${value}`);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const targetMonth = month + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, normalizedMonth));
  return toDateString(new Date(targetYear, normalizedMonth, clampedDay));
}

export function monthKeyToDate(value: MonthKey, day = 1): DateString {
  return `${value}-${pad2(day)}`;
}

export function monthKeyToLabel(value: MonthKey): string {
  const [year, month] = value.split('-');
  return `${year} 年 ${Number(month)} 月`;
}

export function monthKeyToShortLabel(value: MonthKey): string {
  const [, month] = value.split('-');
  return `${Number(month)} 月`;
}

/** 指定月份前一个月的 MonthKey。 */
export function previousMonthKey(reference: Date = new Date()): MonthKey {
  const date = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function addMonthsToMonthKey(value: MonthKey, months: number): MonthKey {
  const [yearRaw, monthRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw) - 1;
  const date = new Date(year, month + months, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** 两个日期之间的整月数（向下取整，可用于计算剩余月份）。 */
export function monthsBetween(from: DateString, to: DateString): number {
  const a = parseDateString(from);
  const b = parseDateString(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Number.NaN;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function daysBetween(from: DateString, to: DateString): number {
  const a = parseDateString(from);
  const b = parseDateString(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Number.NaN;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 转为用于展示的本地日期文本。 */
export function formatDateDisplay(value: DateString): string {
  const date = parseDateString(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function isValidMonthKey(value: unknown): value is MonthKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}
