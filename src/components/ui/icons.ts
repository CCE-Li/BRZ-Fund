/**
 * 细线图标数据。参考图使用统一的 1.5px 描边线性图标，
 * 用 SVG 路径而非 unicode 字形，保证在不同系统上形状一致。
 *
 * 数据与组件分离：这里只导出纯数据，避免把大段路径字面量塞进单文件组件。
 */

export interface IconDefinition {
  paths?: string[];
  circles?: Array<{ cx: number; cy: number; r: number }>;
}

export const ICONS: Record<string, IconDefinition> = {
  // 导航
  grid: { paths: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'] },
  target: {
    circles: [
      { cx: 12, cy: 12, r: 8 },
      { cx: 12, cy: 12, r: 3.5 },
    ],
    paths: ['M12 12h.01'],
  },
  swap: { paths: ['M4 9h15', 'M16 6l3 3-3 3', 'M20 17H5', 'M8 14l-3 3 3 3'] },
  list: { paths: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'] },
  trend: { paths: ['M4 17l5-5 3.5 3L20 8', 'M15 8h5v5'] },
  sliders: { paths: ['M4 8h9', 'M17 8h3', 'M4 16h4', 'M12 16h8', 'M15 8h.01', 'M10 16h.01'] },

  // 操作
  refresh: { paths: ['M20 12a8 8 0 1 1-2.5-5.8', 'M20 4v5h-5'] },
  upload: { paths: ['M12 16V4', 'M8 8l4-4 4 4', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'] },
  download: { paths: ['M12 4v12', 'M8 12l4 4 4-4', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'] },
  plus: { paths: ['M12 5v14', 'M5 12h14'] },

  // 财务语义
  wallet: {
    paths: [
      'M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      'M3 10h18',
      'M16 14h2',
    ],
  },
  clock: { circles: [{ cx: 12, cy: 12, r: 8 }], paths: ['M12 7.5V12l3 2'] },
  shield: { paths: ['M12 3 5 6v6c0 4.4 2.9 7.4 7 9 4.1-1.6 7-4.6 7-9V6z'] },
  database: {
    paths: [
      'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z',
      'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
      'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    ],
  },
  zap: { paths: ['M13 2 4 14h6l-1 8 9-12h-6z'] },
  alert: { paths: ['M12 3 2 20h20z', 'M12 9v5', 'M12 17h.01'] },
  check: { paths: ['M20 6 9 17l-5-5'] },

  // 主题
  moon: { paths: ['M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z'] },
  sun: {
    circles: [{ cx: 12, cy: 12, r: 4 }],
    paths: [
      'M12 2v2',
      'M12 20v2',
      'M2 12h2',
      'M20 12h2',
      'M5 5l1.5 1.5',
      'M17.5 17.5 19 19',
      'M19 5l-1.5 1.5',
      'M6.5 17.5 5 19',
    ],
  },
};
