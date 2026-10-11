import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  MarkAreaComponentOption,
  MarkLineComponentOption,
  TitleComponentOption,
  TooltipComponentOption,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import type { ComposeOption } from 'echarts/core';
import {
  readChartPalette,
  type ChartPalette,
} from '@/composables/chartTheme';

export type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | MarkLineComponentOption
  | MarkAreaComponentOption
  | TitleComponentOption
>;

let registered = false;

/** 按需注册图表类型与组件，避免打包整个 ECharts。 */
export function ensureEChartsRegistered(): void {
  if (registered) return;
  echarts.use([
    LineChart,
    BarChart,
    PieChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    MarkLineComponent,
    MarkAreaComponent,
    TitleComponent,
    LabelLayout,
    UniversalTransition,
    CanvasRenderer,
  ]);
  registered = true;
}

/** 图表通用基础样式：网格、坐标轴、提示框。 */
export function baseChartOption(palette: ChartPalette): ChartOption {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: palette.textSecondary, fontFamily: 'inherit' },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: palette.elevated,
      borderColor: palette.border,
      textStyle: { color: palette.text, fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: palette.border } },
    },
    legend: {
      textStyle: { color: palette.textSecondary, fontSize: 12 },
      top: 0,
      right: 0,
    },
  };
}

export { echarts, readChartPalette };
