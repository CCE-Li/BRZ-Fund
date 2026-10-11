# 验收清单

本文档把需求中的验收标准逐条映射到可执行的验证方式。
自动化用例位于 `e2e/`，用 `npm run test:e2e` 运行（首次需 `npx playwright install chromium`）。

## 自动化覆盖

| # | 验收标准 | 自动化用例 | 结果 |
|---|---|---|---|
| 1 | 新增一笔实际到账收入，刷新页面后记录仍然存在 | `acceptance.spec.ts` › 验收 3-4（含 reload）、`persistence.spec.ts` › 验收 1 | ✅ |
| 2 | 关闭并重新打开浏览器后，购车基金余额仍然正确 | `persistence.spec.ts` › 验收 2（持久化上下文，两次独立会话） | ✅ |
| 3 | 将预计收入标记为「已完成但未付款」时，余额不增加 | `acceptance.spec.ts` › 验收 3-4 | ✅ |
| 4 | 确认真实到账后，余额才增加 | `acceptance.spec.ts` › 验收 3-4 | ✅ |
| 5 | 分配同一笔收入两次时，系统必须阻止重复分配 | `acceptance.spec.ts` › 验收 5（超额禁用提交 + 额度用尽提示 + 撤销释放） | ✅ |
| 6 | 导出 JSON → 清空测试数据库 → 导入备份，数据正确恢复 | `acceptance.spec.ts` › 验收 6-7 | ✅ |
| 7 | 导入无效 JSON 时，现有数据保持不变 | `acceptance.spec.ts` › 验收 6-7 | ✅ |
| 8 | 数据库操作失败时，界面不能错误显示操作成功 | `persistence.spec.ts` › 验收 8（注入写入失败，校验错误提示与余额不变） | ✅ |
| 9 | 预测页面不能把未到账收入算入储蓄速度 | `acceptance.spec.ts` › 验收 10、`persistence.spec.ts` › 验收 9 | ✅ |
| 10 | 浏览器刷新和重新启动后，设置、收入、分配和历史记录全部一致 | `persistence.spec.ts` › 验收 1/10 | ✅ |

### 附加保障（超出原始验收标准）

| 保障项 | 自动化用例 | 结果 |
|---|---|---|
| 更新代码后本地数据不丢失（含 schema 升级与迁移日志） | `tests/db/upgrade-survival.spec.ts` | ✅ |
| 离线可用：应用外壳预缓存完整、断网刷新可打开、离线可记账 | `e2e/offline.spec.ts` | ✅ |

## 其余需求项的覆盖位置

| 需求 | 验证方式 | 位置 |
|---|---|---|
| 金额使用整数分存储，无浮点误差 | 单元测试 | `tests/utils/money.spec.ts` |
| 转账不被计为新收入 | 单元测试 + E2E | `tests/domain/balances.spec.ts`、`acceptance.spec.ts` › 支出与转账 |
| 直接成本只扣除一次 | 单元测试 | `tests/domain/balances.spec.ts`、`tests/services/finance.spec.ts` |
| 同一笔收入重复入账被拒绝 | 集成测试 | `tests/services/finance.spec.ts`、`tests/domain/integrity.spec.ts` |
| 零储蓄速度 / 负储蓄速度不给出误导日期 | 单元测试 | `tests/domain/forecast.spec.ts` |
| 空月份保留为 0，不美化平均值 | 单元测试 | `tests/domain/savingsRate.spec.ts` |
| 数据不足 3 个月时明确提示 | 单元测试 + E2E | `tests/domain/savingsRate.spec.ts`、`acceptance.spec.ts` › 验收 10 |
| 月份边界（月末收束 / 闰年） | 单元测试 | `tests/utils/date.spec.ts`、`tests/domain/forecast.spec.ts` |
| 删除或作废交易后余额正确回退 | 单元测试 + 集成测试 | `tests/domain/balances.spec.ts`、`tests/services/finance.spec.ts` |
| 数据库版本迁移保留既有数据 | 集成测试 | `tests/db/database.spec.ts` |
| 跨表写入原子性（失败整体回滚） | 集成测试 | `tests/db/database.spec.ts`、`tests/services/backup.spec.ts` |
| 启动失败不静默建空库 | 代码路径 + 错误页 | `src/stores/appStore.ts`、`src/App.vue` |
| 清空数据后不再自动初始化 | 集成测试 | `tests/services/backup.spec.ts`（userCleared 标记） |

## 手动补充检查（建议在真实浏览器中偶尔走一遍）

以下项目难以自动化，建议发布前手动确认：

1. **移动端布局**：在浏览器 DevTools 中切换到手机尺寸，确认底部导航、弹窗、表格均可正常操作。
2. **浅色主题对比度**：切换到浅色主题，检查图表与文字是否依然清晰。
3. **安装为应用**：设置页点击「安装为应用」，确认浏览器弹出安装提示；安装后从开始菜单
   / 桌面图标打开，确认以独立窗口运行、数据与浏览器中一致。
4. **持久化许可**：依次尝试「申请持久化 → 重新检查状态」，确认状态文本随之变化；
   若被拒绝，先收藏或安装后再试（Chrome / Edge 按站点权重判断）。
5. **存储配额展示**：设置页确认「占用空间 / 配额」有合理数值，且随数据增长而变化。
6. **复制备份文件**：把导出的 JSON 复制到另一台设备或网盘，确认文件内容可读（文本编辑器打开可见结构）。
7. **卸载后重装**：卸载 PWA 不应删除 IndexedDB 数据，重装后数据仍在（可用作一次额外验证）。
8. **长时间闲置**：关闭标签页数天后重新打开，确认数据仍在（浏览器未清理的前提下）。

## 已知边界与限制

- **IndexedDB 不等于永久安全**：手动清理浏览器数据、隐私模式、Safari 7 天无访问清理、设备损坏都会导致数据丢失。唯一可靠的保障是定期导出备份并保存到别处。
- **不做多币种换算**：更换货币单位只影响新记录与展示，历史记录保留各自币种。
- **不做收益/投资计算**：应用只统计真实到账收入与储蓄，不预测投资收益。
- **预测不是承诺**：所有预测都基于历史数据或用户假设，收入中断、支出增加都会影响结果。
- **单设备单浏览器**：数据默认只存在当前浏览器的当前网站源下，不自动同步。
