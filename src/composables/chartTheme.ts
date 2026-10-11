/**
 * 图表主题工具：与 ECharts 运行时不产生依赖，
 * 这样纯数据构造模块（chartOptions）不会把整个 ECharts 拉进产物。
 */

export interface ChartPalette {
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  info: string;
  warning: string;
  danger: string;
  other: string;
  panel: string;
  elevated: string;
}

export const CHART_PALETTE_FALLBACK: ChartPalette = {
  text: '#e6edf3',
  textSecondary: '#8b949e',
  border: '#30363d',
  accent: '#3fb950',
  info: '#58a6ff',
  warning: '#d29922',
  danger: '#f85149',
  other: '#a371f7',
  panel: '#1c2128',
  elevated: '#161b22',
};

function readToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

/** 从 CSS 变量读取当前主题色，保证图表与界面配色一致。 */
export function readChartPalette(): ChartPalette {
  return {
    text: readToken('--text', CHART_PALETTE_FALLBACK.text),
    textSecondary: readToken('--text-secondary', CHART_PALETTE_FALLBACK.textSecondary),
    border: readToken('--border', CHART_PALETTE_FALLBACK.border),
    accent: readToken('--accent', CHART_PALETTE_FALLBACK.accent),
    info: readToken('--info', CHART_PALETTE_FALLBACK.info),
    warning: readToken('--warning', CHART_PALETTE_FALLBACK.warning),
    danger: readToken('--danger', CHART_PALETTE_FALLBACK.danger),
    other: readToken('--other', CHART_PALETTE_FALLBACK.other),
    panel: readToken('--bg-panel', CHART_PALETTE_FALLBACK.panel),
    elevated: readToken('--bg-elevated', CHART_PALETTE_FALLBACK.elevated),
  };
}

/** 坐标轴通用样式：轴线、刻度标签、分隔线。 */
export function axisStyle(palette: ChartPalette): {
  axisLine: { lineStyle: { color: string } };
  axisLabel: { color: string; fontSize: number };
  splitLine: { lineStyle: { color: string; type: 'dashed' } };
} {
  return {
    axisLine: { lineStyle: { color: palette.border } },
    axisLabel: { color: palette.textSecondary, fontSize: 11 },
    splitLine: { lineStyle: { color: palette.border, type: 'dashed' } },
  };
}
