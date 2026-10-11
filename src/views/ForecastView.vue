<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorBanner from '@/components/ui/ErrorBanner.vue';
import MoneyText from '@/components/ui/MoneyText.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';
import StatCard from '@/components/ui/StatCard.vue';
import BaseChart from '@/components/charts/BaseChart.vue';
import ForecastProjectionChart from '@/components/charts/ForecastProjectionChart.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import {
  calculateRequiredMonthlySaving,
  compareForecastWithActual,
  compareSavingRates,
  simulateSavingsPlan,
} from '@/domain/forecast';
import { getSavingsWindow } from '@/domain/savingsRate';
import { activeIncomes, activeTransactions } from '@/domain/dashboard';
import {
  addMonthsToMonthKey,
  currentMonthKey,
  formatDateDisplay,
  monthKeyOf,
  monthKeyToLabel,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { saveForecastSnapshot } from '@/services/forecastService';
import { INCOME_SOURCE_LABELS, type IncomeSource } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';
import {
  buildFundGrowthOption,
  buildIncomeSourceOption,
  buildMonthlyTrendOption,
  buildPlanVsActualOption,
} from '@/composables/chartOptions';

const app = useAppStore();
const finance = useFinanceStore();
const toast = useToast();

const savingSnapshot = ref(false);
const error = ref<string | null>(null);

const summary = computed(() => finance.summary);
const goal = computed(() => finance.goal);
const threeMonth = computed(() =>
  summary.value ? getSavingsWindow(summary.value.savingsReport, 3) : null,
);
const sixMonth = computed(() =>
  summary.value ? getSavingsWindow(summary.value.savingsReport, 6) : null,
);
const historicalRate = computed(() => threeMonth.value?.average ?? 0);

const estimate = computed(() => summary.value?.estimate ?? null);

const estimateLabel = computed(() => {
  const value = estimate.value;
  if (!value) return '—';
  if (value.status === 'estimated') return formatDateDisplay(value.estimatedDate);
  if (value.status === 'achieved') return '目标已达成';
  if (value.status === 'beyond_horizon') return '超出预测范围';
  return '暂时无法预测';
});

const flatPlan = reactive<{ monthly: number | null }>({ monthly: null });
const perMonthPlan = reactive<Record<string, number>>({});
const planMode = ref<'flat' | 'perMonth'>('flat');

const flatSimulation = computed(() => {
  if (!summary.value) return null;
  const monthly = flatPlan.monthly ?? historicalRate.value;
  if (monthly <= 0) return null;
  return simulateSavingsPlan(summary.value.fundBalance, summary.value.targetTotal, {
    kind: 'flat',
    monthly,
  });
});

const perMonthSimulation = computed(() => {
  if (!summary.value) return null;
  const months: Record<string, number> = {};
  for (const [key, value] of Object.entries(perMonthPlan)) {
    if (value > 0) months[key] = value;
  }
  if (Object.keys(months).length === 0) return null;
  return simulateSavingsPlan(summary.value.fundBalance, summary.value.targetTotal, {
    kind: 'per_month',
    months,
  });
});

const simulation = computed(() =>
  planMode.value === 'flat' ? flatSimulation.value : perMonthSimulation.value,
);

const monthPlanRows = computed(() => {
  const start = currentMonthKey();
  return Array.from({ length: 12 }, (_, index) => addMonthsToMonthKey(start, index));
});

function planValueFor(month: string): string {
  const cents = perMonthPlan[month];
  return cents === undefined ? '' : String(cents / 100);
}

function setPlanValue(month: string, text: string): void {
  const trimmed = text.trim();
  if (trimmed === '') {
    delete perMonthPlan[month];
    return;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    delete perMonthPlan[month];
    return;
  }
  perMonthPlan[month] = Math.round(value * 100);
}

function fillPlanWithHistorical(): void {
  if (historicalRate.value <= 0) {
    toast.warn('目前还没有可用的历史储蓄速度，无法一键填充。');
    return;
  }
  for (const month of monthPlanRows.value) {
    perMonthPlan[month] = historicalRate.value;
  }
  planMode.value = 'perMonth';
  toast.info('已按最近 3 个月的平均储蓄速度填充未来 12 个月，你可以逐月调整。');
}

const comparison = computed(() => {
  if (!summary.value) return [];
  const base = historicalRate.value;
  const candidates = [base, Math.round(base * 1.5), base * 2, Math.round(base * 0.5)].filter(
    (value) => value > 0,
  );
  const unique = Array.from(new Set(candidates)).sort((a, b) => a - b);
  return compareSavingRates(summary.value.fundBalance, summary.value.targetTotal, unique, {
    capMonths: 240,
  });
});

const requiredSaving = computed(() => {
  if (!summary.value?.goal || summary.value.remainingGap <= 0) return null;
  return calculateRequiredMonthlySaving(
    summary.value.remainingGap,
    summary.value.goal.currentDeadline,
    { historicalMonthlySaving: historicalRate.value },
  );
});

const transactions = computed(() => activeTransactions(finance.transactions));

const growthChart = computed(() =>
  buildFundGrowthOption({
    transactions: transactions.value,
    goal: goal.value,
    currency: app.currency,
    locale: app.locale,
  }),
);

const planVsActualOption = computed(() => {
  if (!sixMonth.value) return null;
  return buildPlanVsActualOption({
    window: sixMonth.value,
    planned: app.settings.plannedMonthlySaving ?? historicalRate.value,
    currency: app.currency,
    locale: app.locale,
  });
});

const monthlyTrendOption = computed(() => {
  if (!sixMonth.value) return null;
  return buildMonthlyTrendOption({
    window: sixMonth.value,
    currency: app.currency,
    locale: app.locale,
  });
});

const incomeSourceOption = computed(() => {
  const totals = new Map<IncomeSource, number>();
  for (const income of activeIncomes(finance.incomes)) {
    const net = income.amountReceived - income.directCosts;
    totals.set(income.source, (totals.get(income.source) ?? 0) + net);
  }
  if (totals.size === 0) return null;
  return buildIncomeSourceOption({
    items: Array.from(totals.entries()).map(([source, value]) => ({
      name: INCOME_SOURCE_LABELS[source],
      value,
    })),
    currency: app.currency,
    locale: app.locale,
  });
});

const projectionData = computed(() => {
  if (!summary.value || !goal.value) return null;
  const monthly = historicalRate.value;
  const projection =
    simulation.value?.timeline && simulation.value.timeline.length > 0
      ? simulation.value.timeline.slice(0, 36)
      : monthly > 0
        ? Array.from(
            { length: Math.min(36, Math.ceil(summary.value.remainingGap / monthly) + 1) },
            (_, index) => {
              const monthsFromNow = index + 1;
              return {
                month: addMonthsToMonthKey(currentMonthKey(), monthsFromNow),
                balance: summary.value!.fundBalance + monthly * monthsFromNow,
                savings: monthly,
              };
            },
          )
        : [];

  // 历史累计曲线（与购车基金增长图一致）
  const series = growthChart.value.series;
  const historicalMonths: string[] = [];
  const historicalValues: number[] = [];
  const monthKeys = new Set<string>();
  for (const transaction of transactions.value) monthKeys.add(monthKeyOf(transaction.occurredAt));
  const months = Array.from(monthKeys).sort();
  const rawData = (series.data ?? []) as number[];
  for (let index = 0; index < months.length; index += 1) {
    const month = months[index];
    if (month === undefined) continue;
    historicalMonths.push(month);
    historicalValues.push(rawData[rawData.length - months.length + index] ?? 0);
  }

  return {
    historicalMonths,
    historical: historicalValues,
    projection,
    target: summary.value.targetTotal,
    deadline: goal.value.currentDeadline,
    currency: app.currency,
    locale: app.locale,
  };
});

const latestSnapshot = computed(() => {
  const list = finance.snapshots;
  if (list.length === 0) return null;
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
});

const snapshotComparison = computed(() => {
  if (!latestSnapshot.value || !summary.value) return null;
  return compareForecastWithActual(latestSnapshot.value, {
    fundBalance: summary.value.fundBalance,
    monthlySaving: historicalRate.value,
    remainingGap: summary.value.remainingGap,
    estimate: summary.value.estimate,
    today: new Date().toISOString().slice(0, 10),
  });
});

async function saveSnapshot(): Promise<void> {
  if (!summary.value) return;
  savingSnapshot.value = true;
  error.value = null;
  try {
    const months = threeMonth.value?.entries.length ?? 0;
    await saveForecastSnapshot({
      summary: summary.value,
      method: 'historical_rate',
      confidence: months >= 6 ? 'high' : months >= 3 ? 'medium' : 'low',
    });
    await finance.reload(app.settings);
    toast.success('已保存本次预测快照，之后可与实际进度对比。');
  } catch (snapshotError) {
    error.value = toErrorMessage(snapshotError);
  } finally {
    savingSnapshot.value = false;
  }
}

function moneyOf(cents: number): string {
  return formatMoney(cents, app.currency, app.locale);
}

function lastProjectionMonth(): string {
  const timeline = simulation.value?.timeline ?? [];
  const last = timeline[timeline.length - 1];
  return last ? monthKeyToLabel(last.month) : '—';
}
</script>

<template>
  <div class="forecast">
    <PageHeader
      title="购车预测"
      subtitle="所有预测都标注数据来源：实际记录、你的假设、计算结果。预测不是承诺。"
    >
      <template #actions>
        <BaseButton variant="secondary" size="sm" :loading="savingSnapshot" @click="saveSnapshot">
          保存本次预测快照
        </BaseButton>
      </template>
    </PageHeader>

    <ErrorBanner v-if="error" tone="danger" title="操作失败" :message="error" dismissible @dismiss="error = null" />

    <EmptyState
      v-if="!goal"
      title="还没有设置购车目标"
      description="先完成初始化向导或前往设置页填写裸车价、附加费用与整备预算，然后才能预测。"
    />

    <template v-else-if="summary">
      <section class="stats">
        <StatCard
          label="购车目标总额"
          :value="moneyOf(summary.targetTotal)"
          hint="裸车 + 购车附加费用 + 整备维修预算（应急储备独立计算）"
          size="lg"
        />
        <StatCard
          label="按历史速度预计购车"
          :value="estimateLabel"
          :tone="estimate?.status === 'achieved' ? 'accent' : 'default'"
          :hint="
            estimate?.status === 'estimated'
              ? `基于实际记录：最近 3 个完整月平均储蓄 ${moneyOf(historicalRate)}/月`
              : estimate?.status === 'unavailable' || estimate?.status === 'beyond_horizon'
                ? estimate.reason
                : '购车基金已达到目标金额'
          "
          size="lg"
        />
        <StatCard
          label="距离目标还差"
          :value="moneyOf(summary.remainingGap)"
          :hint="`已完成 ${summary.progressPercent}%`"
          size="lg"
        />
      </section>

      <div class="grid grid--two">
        <BaseCard title="A. 基于真实记录的速度预测" subtitle="只使用已确认到账并实际转入购车基金的金额">
          <div v-if="threeMonth" class="rows">
            <div class="rows__row">
              <span>最近 3 个完整月平均</span>
              <span class="rows__value">
                <MoneyText :cents="threeMonth.average" :currency="app.currency" size="sm" />
                <span class="rows__tag">实际数据</span>
              </span>
            </div>
            <div class="rows__row">
              <span>最近 6 个完整月平均</span>
              <span class="rows__value">
                <MoneyText :cents="sixMonth?.average ?? 0" :currency="app.currency" size="sm" />
                <span class="rows__tag">实际数据</span>
              </span>
            </div>
            <div class="rows__row">
              <span>统计区间与样本</span>
              <span class="rows__value">
                {{ threeMonth.entries[0]?.month }} ~
                {{ threeMonth.entries[threeMonth.entries.length - 1]?.month }}（{{
                  threeMonth.activeMonths
                }}
                个月有记录）
              </span>
            </div>
            <p v-if="!threeMonth.sufficient" class="rows__warn">
              数据不足：需要至少 3 个有真实记录的月份，当前预测不可靠。
            </p>
            <p v-else class="rows__note">
              空月份保留为 0 参与平均，因此结果不会被偶然的单个好月份美化。
            </p>
          </div>
          <template #footer>
            <p class="hint">预计结果：{{ estimateLabel }}</p>
          </template>
        </BaseCard>

        <BaseCard title="D. 与计划日期的差距" subtitle="按历史速度需要的月储蓄 vs 目标日期的要求">
          <div v-if="requiredSaving" class="rows">
            <div class="rows__row">
              <span>距离计划日期</span>
              <span class="rows__value">
                {{ requiredSaving.monthsLeft }} 个月（{{ formatDateDisplay(goal.currentDeadline) }}）
              </span>
            </div>
            <div class="rows__row">
              <span>还需要每月储蓄</span>
              <span class="rows__value">
                <MoneyText :cents="requiredSaving.requiredMonthly" :currency="app.currency" size="sm" />
                <span class="rows__tag">计算结果</span>
              </span>
            </div>
            <div class="rows__row">
              <span>当前历史速度</span>
              <span class="rows__value">
                <MoneyText :cents="historicalRate" :currency="app.currency" size="sm" />
                <span class="rows__tag">实际数据</span>
              </span>
            </div>
            <p class="rows__note" :class="requiredSaving.achievableAtHistoricalRate ? '' : 'rows__warn'">
              {{
                requiredSaving.achievableAtHistoricalRate
                  ? '按当前速度可以按时完成计划。'
                  : '按当前速度达不到计划要求，需要增加收入、延后日期或降低预算。'
              }}
            </p>
          </div>
          <EmptyState
            v-else
            title="无需额外储蓄"
            description="购车基金已达到目标总额。"
          />
        </BaseCard>
      </div>

      <BaseCard title="B. 情景模拟（由你填写的假设）" subtitle="模拟结果只是假设，不代表承诺">
        <div class="simulator">
          <div class="simulator__mode">
            <BaseButton
              size="sm"
              :variant="planMode === 'flat' ? 'primary' : 'secondary'"
              @click="planMode = 'flat'"
            >
              固定月储蓄
            </BaseButton>
            <BaseButton
              size="sm"
              :variant="planMode === 'perMonth' ? 'primary' : 'secondary'"
              @click="planMode = 'perMonth'"
            >
              按月单独填写（季节性）
            </BaseButton>
            <BaseButton size="sm" variant="ghost" @click="fillPlanWithHistorical">
              用历史平均速度填充
            </BaseButton>
          </div>

          <div v-if="planMode === 'flat'" class="simulator__flat">
            <MoneyInput v-model="flatPlan.monthly" label="假设每月存入购车基金" :currency="app.currency" />
            <p class="hint">
              留空则使用历史平均值 {{ moneyOf(historicalRate) }}。当前假设：
              {{ moneyOf(flatPlan.monthly ?? historicalRate) }}/月
            </p>
          </div>

          <div v-else class="simulator__months">
            <div v-for="month in monthPlanRows" :key="month" class="simulator__month">
              <label class="simulator__month-label" :for="`plan-${month}`">
                {{ monthKeyToLabel(month) }}
              </label>
              <input
                :id="`plan-${month}`"
                class="simulator__month-input"
                type="number"
                min="0"
                step="1"
                :value="planValueFor(month)"
                placeholder="0"
                @input="setPlanValue(month, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>

          <div class="simulator__result">
            <template v-if="simulation && simulation.status !== 'unachievable'">
              <div class="rows__row">
                <span>模拟结果预计月份数</span>
                <span class="rows__value">
                  {{ simulation.monthsAhead }} 个月
                  <span class="rows__tag">计算结果</span>
                </span>
              </div>
              <div class="rows__row">
                <span>预计达成时间</span>
                <span class="rows__value">
                  {{ lastProjectionMonth() }}
                  <span class="rows__tag">计算结果</span>
                </span>
              </div>
            </template>
            <p v-else-if="simulation" class="rows__warn">在该假设下，10 年内无法达成目标。</p>
            <p v-else class="hint">填写储蓄假设后即可看到模拟结果。</p>
          </div>
        </div>
      </BaseCard>

      <div class="grid grid--two">
        <BaseCard title="C. 不同储蓄速度的完成时间" subtitle="同样的余额与目标，不同月储蓄额的差异">
          <table v-if="comparison.length > 0" class="table">
            <thead>
              <tr>
                <th>每月储蓄</th>
                <th>预计完成时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in comparison" :key="item.monthlySaving">
                <td><MoneyText :cents="item.monthlySaving" :currency="app.currency" size="sm" /></td>
                <td>
                  <template v-if="item.estimate.status === 'estimated'">
                    {{ formatDateDisplay(item.estimate.estimatedDate) }}
                    <span class="rows__tag">计算结果</span>
                  </template>
                  <template v-else-if="item.estimate.status === 'achieved'">已达成</template>
                  <template v-else-if="item.estimate.status === 'beyond_horizon'">超出预测范围</template>
                  <template v-else>无法预测</template>
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState
            v-else
            title="还没有可对比的速度"
            description="需要至少一笔实际转入购车基金的记录，才能给出速度对比。"
          />
        </BaseCard>

        <BaseCard title="E. 实际 vs 计划" subtitle="最近 6 个完整月的实际储蓄与计划金额">
          <BaseChart
            v-if="planVsActualOption"
            :option="planVsActualOption"
            :height="240"
            :empty="(sixMonth?.entries ?? []).every((entry) => entry.savings === 0)"
            empty-text="还没有储蓄记录，无法对比"
          />
          <p class="hint">
            计划金额取设置中的每月计划储蓄额；未设置时使用历史平均值 {{ moneyOf(historicalRate) }}。
          </p>
        </BaseCard>
      </div>

      <div class="grid grid--two">
        <BaseCard title="每月收入与储蓄趋势" subtitle="收入是过程，储蓄才是朝目标前进的部分">
          <BaseChart
            v-if="monthlyTrendOption"
            :option="monthlyTrendOption"
            :height="240"
            :empty="(sixMonth?.entries ?? []).every((entry) => entry.income === 0 && entry.savings === 0)"
          />
        </BaseCard>

        <BaseCard title="收入来源构成" subtitle="按已到账净额统计，不含预计收入">
          <BaseChart
            v-if="incomeSourceOption"
            :option="incomeSourceOption"
            :height="240"
            empty-text="还没有到账收入记录"
            :empty="!incomeSourceOption"
          />
        </BaseCard>
      </div>

      <BaseCard title="购车基金累计增长" subtitle="实际记录曲线，虚线为最终目标金额">
        <BaseChart :option="growthChart.option" :height="280" :empty="transactions.length === 0" />
      </BaseCard>

      <BaseCard title="预测投影" subtitle="历史实线 + 情景虚线，标注目标金额与计划日期">
        <ForecastProjectionChart v-if="projectionData" :data="projectionData" :height="280" />
        <p class="hint">
          投影仅用于理解趋势：它假设未来每个月都能按当前假设存入，实际收入可能中断。
        </p>
      </BaseCard>

      <BaseCard title="F. 最近一次预测 vs 当前实际" subtitle="用你保存的快照检验预测偏差">
        <div v-if="snapshotComparison" class="rows">
          <div class="rows__row">
            <span>快照生成时间</span>
            <span class="rows__value">
              {{ formatDateDisplay(snapshotComparison.snapshotCreatedAt.slice(0, 10)) }}
            </span>
          </div>
          <div class="rows__row">
            <span>当时预测</span>
            <span class="rows__value">
              {{
                snapshotComparison.snapshotEstimatedDate
                  ? formatDateDisplay(snapshotComparison.snapshotEstimatedDate)
                  : '当时无法预测'
              }}
            </span>
          </div>
          <div class="rows__row">
            <span>当前预测</span>
            <span class="rows__value">
              {{
                snapshotComparison.actualEstimatedDate
                  ? formatDateDisplay(snapshotComparison.actualEstimatedDate)
                  : '当前无法预测'
              }}
            </span>
          </div>
          <div class="rows__row">
            <span>相比快照时的进度</span>
            <span class="rows__value">
              <MoneyText
                :cents="snapshotComparison.progressDelta"
                :currency="app.currency"
                size="sm"
                signed
              />
            </span>
          </div>
          <p class="rows__note">{{ snapshotComparison.note }}</p>
        </div>
        <EmptyState
          v-else
          title="还没有保存过预测快照"
          description="点击右上角「保存本次预测快照」，之后就能在这里对比预测与实际的偏差。"
        />
      </BaseCard>
    </template>
  </div>
</template>

<style scoped>
.forecast {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-3);
}

.grid {
  display: grid;
  gap: var(--space-4);
}

.grid--two {
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.rows__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 13px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.rows__value {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.rows__tag {
  font-size: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  color: var(--text-tertiary);
}

.rows__note {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.rows__warn {
  font-size: 12px;
  color: var(--warning);
  line-height: 1.6;
}

.hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-top: var(--space-2);
}

.simulator {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.simulator__mode {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.simulator__flat {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 320px;
}

.simulator__months {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-2);
}

.simulator__month {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.simulator__month-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.simulator__month-input {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text);
  padding: 4px 8px;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.simulator__month-input:focus {
  border-color: var(--info);
}

.simulator__result {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-3);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th {
  text-align: left;
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 12px;
  padding: var(--space-2) var(--space-3) var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.table td {
  padding: var(--space-2) var(--space-3) var(--space-2) 0;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}
</style>
