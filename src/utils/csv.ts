import type { CsvCell } from '@/types/backup';

/** RFC 4180 转义：含分隔符、引号或换行时使用双引号包裹。 */
export function escapeCsvCell(value: CsvCell, delimiter = ','): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<CsvCell>>,
  options: { delimiter?: string; bom?: boolean } = {},
): string {
  const delimiter = options.delimiter ?? ',';
  const lines = [headers.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter)];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter));
  }
  const body = `${lines.join('\r\n')}\r\n`;
  return options.bom === false ? body : `\uFEFF${body}`;
}

/** 触发浏览器下载，返回创建的文件名。 */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildTimestampedFilename(prefix: string, extension: string, date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${prefix}-${stamp}.${extension}`;
}
