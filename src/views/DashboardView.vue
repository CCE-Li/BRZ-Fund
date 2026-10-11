<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorBanner from '@/components/ui/ErrorBanner.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import MoneyText from '@/components/ui/MoneyText.vue';
import ProgressBar from '@/components/ui/ProgressBar.vue';
import SegmentedBar from '@/components/ui/SegmentedBar.vue';
import SectionHeader from '@/components/ui/SectionHeader.vue';
import StatCard from '@/components/ui/StatCard.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import {
  activeIncomes,
  activeTransactions,
  openOpportunityCount,
  pendingPaymentOpportunities,
  totalNetIncome,
} from '@/domain/dashboard';
import { getSavingsWindow, monthlyEntries } from '@/domain/savingsRate';
import { earliestTransactionDate } from '@/domain/balances';
import { INCOME_SOURCE_LABELS, TRANSACTION_TYPE_LABELS } from '@/types/models';
import type { ForecastSnapshot } from '@/types/models';
import { compareForecastWithActual, calculateRequiredMonthlySaving } from '@/domain/forecast';
import {
  addMonthsToMonthKey,
  currentMonthKey,
  formatDateDisplay,
  monthKeyToLabel,
  monthsBetween,
  todayString,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';
import {
  buildFundGrowthOption,
  buildIncomeSourceOption,
  buildMonthlyTrendOption,
} from '@/composables/chartOptions';
import BaseChart from '@/components/charts/BaseChart.vue';

const app = useAppStore();
const finance = useFinanceStore();

const summary = computed(() => finance.summary);
const snapshot = computed(() => finance.snapshot);
const goal = computed(() => finance.goal);

const hasGoal = computed(() => !!goal.value);
const hasActivity = computed(() => finance.hasAnyData);

const errorMessage = computed(() => finance.loadError);

const threeMonthWindow = computed(() => {
  if (!summary.value) return null;
  return getSavingsWindow(summary.value.savingsReport, 3);
});

const sixMonthWindow = computed(() => {
  if (!summary.value) return null;
  return getSavingsWindow(summary.value.savingsReport, 6);
});

const estimateText = computed(() => {
  const estimate = summary.value?.estimate;
  if (!estimate) return '—';
  if (estimate.status === 'achieved') return '目标已达成';
  if (estimate.status === 'estimated') return formatDateDisplay(estimate.estimatedDate);
  return '暂时无法预测';
});

const estimateHint = computed(() => {
  const estimate = summary.value?.estimate;
  if (!estimate) return '尚无足够数据。';
  if (estimate.status === 'achieved') return '购车基金已达到目标金额。';
  if (estimate.status === 'estimated') {
    const rate = threeMonthWindow.value?.average ?? 0;
    return `基于最近 3 个完整月平均储蓄 ${formatMoney(rate, app.currency, app.locale)}/月推算，仅供参考。`;
  }
  return estimate.reason;
});

const requiredSaving = computed(() => {
  if (!summary.value?.goal || summary.value.remainingGap <= 0) return null;
  const historical = threeMonthWindow.value?.sufficient ? threeMonthWindow.value.average : 0;
  return calculateRequiredMonthlySaving(summary.value.remainingGap, summary.value.goal.currentDeadline, {
    historicalMonthlySaving: historical,
  });
});

const pendingOpportunities = computed(() => pendingPaymentOpportunities(finance.opportunities));
const openCount = computed(() => openOpportunityCount(finance.opportunities));
const incomeCount = computed(() => activeIncomes(finance.incomes).length);
const netIncomeTotal = computed(() => totalNetIncome(finance.incomes));

const latestSnapshot = computed<ForecastSnapshot | null>(() => {
  const list = finance.snapshots;
  if (list.length === 0) return null;
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
});

const snapshotComparison = computed(() => {
  const snap = latestSnapshot.value;
  const s = summary.value;
  if (!snap || !s) return null;
  const window = threeMonthWindow.value;
  return compareForecastWithActual(snap, {
    fundBalance: s.fundBalance,
    monthlySaving: window?.average ?? 0,
    remainingGap: s.remainingGap,
    estimate: s.estimate,
    today: todayString(),
  });
});

const currentMonth = computed(() => summary.value?.savingsReport.currentMonth ?? null);

const auditIssues = computed(() => snapshot.value?.audit.issues ?? []);
const hasAuditIssues = computed(() => auditIssues.value.length > 0);

const recentTransactions = computed(() => snapshot.value?.recentTransactions ?? []);
const recentIncomes = computed(() => snapshot.value?.recentIncomes ?? []);

const activeTransactionList = computed(() => activeTransactions(finance.transactions));

/** 最近 12 个完整月的资金序列，用于卡片内的分段条形图（空月份保留为 0）。 */
const monthlySeries = computed(() => {
  const lastComplete = addMonthsToMonthKey(currentMonthKey(), -1);
  const start = addMonthsToMonthKey(lastComplete, -11);
  return monthlyEntries(activeTransactionList.value, start, lastComplete, new Date());
});

const savingsBlocks = computed(() => monthlySeries.value.map((entry) => entry.savings));
const incomeBlocks = computed(() => monthlySeries.value.map((entry) => entry.income));

const plannedMonthlySaving = computed(() => {
  const planned = app.settings.plannedMonthlySaving;
  if (planned && planned > 0) return planned;
  return threeMonthWindow.value?.average ?? 0;
});

/** 计划时间进度：从第一笔记录起算，已过去的时间占整个计划周期的比例。 */
const timelineProgress = computed(() => {
  const goalValue = goal.value;
  const s = summary.value;
  if (!goalValue || !s) return null;
  const start =
    earliestTransactionDate(activeTransactionList.value) ?? goalValue.createdAt.slice(0, 10);
  const total = monthsBetween(start, goalValue.currentDeadline);
  if (total <= 0) return null;
  const elapsed = Math.max(0, monthsBetween(start, todayString()));
  const percent = Math.min(100, Math.round((elapsed / total) * 1000) / 10);
  return {
    percent,
    elapsed,
    total,
    behind: s.progressPercent < percent,
    start,
  };
});

const currentMonthSavingProgress = computed(() => {
  const planned = plannedMonthlySaving.value;
  const saved = (currentMonth.value?.brzDeposits ?? 0) + (currentMonth.value?.emergencyDeposits ?? 0);
  if (planned <= 0) return { percent: 0, saved, planned, available: false };
  return {
    percent: Math.min(100, Math.round((saved / planned) * 1000) / 10),
    saved,
    planned,
    available: true,
  };
});

const growthChartOption = computed(() =>
  buildFundGrowthOption({
    transactions: activeTransactionList.value,
    goal: goal.value,
    currency: app.currency,
    locale: app.locale,
  }),
);

const monthlyTrendOption = computed(() => {
  const window = sixMonthWindow.value;
  if (!window || window.entries.every((entry) => entry.income === 0 && entry.savings === 0)) return null;
  return buildMonthlyTrendOption({ window, currency: app.currency, locale: app.locale });
});

const incomeSourceOption = computed(() => {
  const totals = new Map<string, number>();
  for (const income of activeIncomes(finance.incomes)) {
    const label = INCOME_SOURCE_LABELS[income.source];
    totals.set(label, (totals.get(label) ?? 0) + (income.amountReceived - income.directCosts));
  }
  if (totals.size === 0) return null;
  return buildIncomeSourceOption({
    items: Array.from(totals.entries()).map(([name, value]) => ({ name, value })),
    currency: app.currency,
    locale: app.locale,
  });
});

function severityLabel(severity: 'error' | 'warning'): string {
  return severity === 'error' ? '数据错误' : '提醒';
}

function money(cents: number, currency = app.currency): string {
  return formatMoney(cents, currency, app.locale);
}
</script>

<template>
  <div class="dashboard">
    <PageHeader title="总览" subtitle="所有数字都来自你真实记录的数据，预计收入从不计入余额。">
      <template #actions>
        <BaseButton variant="secondary" size="sm" @click="finance.reload(app.settings)">
          <AppIcon name="refresh" :size="13" />
          刷新
        </BaseButton>
      </template>
    </PageHeader>

    <ErrorBanner v-if="errorMessage" tone="danger" title="数据加载失败" :message="errorMessage" />

    <LoadingState v-if="finance.loading && !snapshot" message="正在读取本地数据…" />

    <EmptyState
      v-else-if="!hasGoal"
      title="还没有设置购车目标"
      description="完成初始化向导即可开始使用。你的数据始终保存在本机浏览器中，不会上传。"
    >
      <RouterLink :to="{ name: 'onboarding' }">
        <BaseButton variant="primary">去设置目标</BaseButton>
      </RouterLink>
    </EmptyState>

    <template v-else-if="summary && snapshot">
      <SectionHeader title="概览" icon="grid" caption="最近 12 个完整月" />

      <section class="grid grid--hero">
        <StatCard
          label="购车基金余额"
          icon="wallet"
          :value="money(summary.fundBalance)"
          tone="accent"
          size="lg"
          :hint="`目标 ${money(summary.targetTotal)} · 还需 ${money(summary.remainingGap)}`"
        >
          <SegmentedBar :values="savingsBlocks" color="var(--accent)" :height="30" />
        </StatCard>

        <StatCard
          label="预计购车时间"
          icon="clock"
          :value="estimateText"
          tone="violet"
          size="lg"
          :hint="estimateHint"
        >
          <SegmentedBar :values="incomeBlocks" color="var(--violet)" :height="30" />
        </StatCard>

        <StatCard
          label="应急储备"
          icon="shield"
          :value="money(summary.emergencyBalance)"
          tone="info"
          size="lg"
          :hint="
            summary.emergencyTarget
              ? `目标 ${money(summary.emergencyTarget)}`
              : '尚未设置应急储备目标'
          "
        >
          <ProgressBar
            v-if="summary.emergencyTarget"
            :percent="summary.emergencyProgressPercent"
            tone="info"
            :value-label="`${summary.emergencyProgressPercent}%`"
            :blocks="18"
            :height="12"
          />
          <p v-else class="muted-note">未设置目标时不做提示，也不影响购车基金计算。</p>
        </StatCard>
      </section>

      <SectionHeader title="储蓄进度" icon="trend" caption="目标日期 vs 实际进度" />

      <BaseCard>
        <div class="limits">
          <div class="limits__row">
            <ProgressBar
              :percent="summary.progressPercent"
              :value-label="`${summary.progressPercent}%`"
              label="购车基金完成度"
              :blocks="40"
            />
            <p class="limits__caption">
              已存 {{ money(summary.fundBalance) }} / 目标 {{ money(summary.targetTotal) }}
            </p>
          </div>

          <div class="limits__row">
            <ProgressBar
              :percent="summary.emergencyTarget ? summary.emergencyProgressPercent : 0"
              tone="info"
              :value-label="summary.emergencyTarget ? `${summary.emergencyProgressPercent}%` : '—'"
              label="应急储备完成度"
              :blocks="40"
            />
            <p class="limits__caption">
              {{
                summary.emergencyTarget
                  ? `已存 ${money(summary.emergencyBalance)} / 目标 ${money(summary.emergencyTarget)}`
                  : '尚未设置应急储备目标，可在设置页填写'
              }}
            </p>
          </div>

          <div class="limits__row">
            <ProgressBar
              :percent="currentMonthSavingProgress.percent"
              tone="violet"
              :value-label="
                currentMonthSavingProgress.available ? `${currentMonthSavingProgress.percent}%` : '—'
              "
              label="本月储蓄达成率"
              :blocks="40"
            />
            <p class="limits__caption">
              <template v-if="currentMonthSavingProgress.available">
                本月已存 {{ money(currentMonthSavingProgress.saved) }} / 计划
                {{ money(currentMonthSavingProgress.planned) }}
              </template>
              <template v-else>尚无历史储蓄速度，无法给出计划值</template>
            </p>
          </div>

          <div v-if="timelineProgress" class="limits__row">
            <ProgressBar
              :percent="timelineProgress.percent"
              :tone="timelineProgress.behind ? 'warning' : 'accent'"
              :value-label="`${timelineProgress.percent}%`"
              label="计划时间进度"
              :blocks="40"
            />
            <p class="limits__caption">
              已过 {{ timelineProgress.elapsed }} 个月 / 共 {{ timelineProgress.total }} 个月（自
              {{ formatDateDisplay(timelineProgress.start) }} 起算）
              <span v-if="timelineProgress.behind" class="limits__warn">
                · 资金进度落后于时间进度
              </span>
            </p>
          </div>
        </div>
      </BaseCard>

      <SectionHeader
        title="本月"
        icon="zap"
        :caption="currentMonth ? monthKeyToLabel(currentMonth.month) : ''"
      />

      <section class="grid grid--triple">
        <StatCard
          label="本月实际到账"
          icon="zap"
          :value="money(currentMonth?.income ?? 0)"
          hint="真实到账收入，不含预计"
        />
        <StatCard
          label="本月转入购车基金"
          icon="trend"
          :value="money(currentMonth?.brzDeposits ?? 0)"
          tone="accent"
          :hint="`应急金 ${money(currentMonth?.emergencyDeposits ?? 0)}`"
        />
        <StatCard
          label="本月支出"
          icon="list"
          :value="money(currentMonth?.expenses ?? 0)"
          :hint="`未分配资金余额 ${money(summary.unallocatedBalance)}`"
        />
      </section>

      <ErrorBanner
        v-if="hasAuditIssues"
        tone="warning"
        title="数据一致性提示"
        :message="`检测到 ${snapshot.audit.errorCount} 个错误、${snapshot.audit.warningCount} 个提醒，请核对下方明细。`"
      >
        <ul class="issues">
          <li
            v-for="issue in auditIssues"
            :key="`${issue.entity}-${issue.entityId}-${issue.message}`"
            class="issues__item"
          >
            <span class="issues__tag" :class="`issues__tag--${issue.severity}`">
              {{ severityLabel(issue.severity) }}
            </span>
            <span>{{ issue.message }}</span>
          </li>
        </ul>
      </ErrorBanner>

      <EmptyState
        v-if="!hasActivity"
        title="还没有任何资金记录"
        description="先去「机会」登记真实到账的收入，或用「流水」记录一笔支出。预计收入不会自动进入余额。"
      >
        <RouterLink :to="{ name: 'opportunities' }">
          <BaseButton variant="primary">登记收入机会</BaseButton>
        </RouterLink>
        <RouterLink :to="{ name: 'transactions' }">
          <BaseButton variant="secondary">记录一笔支出</BaseButton>
        </RouterLink>
      </EmptyState>

      <template v-else>
        <SectionHeader title="资金动态" icon="list" />

        <div class="grid grid--two">
          <BaseCard>
            <template #header>
              <div class="panel-head">
                <span>最近资金记录</span>
                <span class="panel-head__note">按发生日期倒序</span>
              </div>
            </template>
            <table class="table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>日期</th>
                  <th class="table__num">金额</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="transaction in recentTransactions" :key="transaction.id">
                  <td>{{ TRANSACTION_TYPE_LABELS[transaction.type] }}</td>
                  <td class="table__dim">{{ formatDateDisplay(transaction.occurredAt) }}</td>
                  <td class="table__num">
                    <MoneyText
                      :cents="
                        transaction.type.includes('withdraw') ? -transaction.amount : transaction.amount
                      "
                      :currency="transaction.currency"
                      :tone="transaction.type === 'expense' ? 'negative' : 'positive'"
                      size="sm"
                      signed
                    />
                  </td>
                </tr>
                <tr v-if="recentTransactions.length === 0">
                  <td colspan="3" class="table__empty">暂无记录</td>
                </tr>
              </tbody>
            </table>
            <template #footer>
              <RouterLink class="link" :to="{ name: 'transactions' }">查看全部流水 →</RouterLink>
            </template>
          </BaseCard>

          <BaseCard>
            <template #header>
              <div class="panel-head">
                <span>最近到账收入</span>
                <span class="panel-head__note">仅已确认到账</span>
              </div>
            </template>
            <table class="table">
              <thead>
                <tr>
                  <th>来源</th>
                  <th>日期</th>
                  <th class="table__num">净额</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="income in recentIncomes" :key="income.id">
                  <td>{{ income.note || INCOME_SOURCE_LABELS[income.source] }}</td>
                  <td class="table__dim">{{ formatDateDisplay(income.receivedAt) }}</td>
                  <td class="table__num">
                    <MoneyText
                      :cents="finance.netIncomeOf(income)"
                      :currency="income.currency"
                      tone="positive"
                      size="sm"
                    />
                  </td>
                </tr>
                <tr v-if="recentIncomes.length === 0">
                  <td colspan="3" class="table__empty">暂无到账记录</td>
                </tr>
              </tbody>
            </table>
            <template #footer>
              <RouterLink class="link" :to="{ name: 'allocations' }">去分配资金 →</RouterLink>
            </template>
          </BaseCard>
        </div>

        <SectionHeader title="趋势分析" icon="trend" caption="金额单位：元" />

        <BaseCard>
          <template #header>
            <div class="panel-head">
              <span>购车基金累计增长</span>
              <span class="panel-head__note">虚线为目标金额</span>
            </div>
          </template>
          <BaseChart
            :option="growthChartOption.option"
            :height="260"
            :empty="activeTransactionList.length === 0"
          />
        </BaseCard>

        <div class="grid grid--two">
          <BaseCard>
            <template #header>
              <div class="panel-head">
                <span>每月收入与储蓄趋势</span>
                <span class="panel-head__note">最近 6 个完整月</span>
              </div>
            </template>
            <BaseChart
              v-if="monthlyTrendOption"
              :option="monthlyTrendOption"
              :height="240"
              empty-text="最近 6 个月还没有收入或储蓄记录"
              :empty="!monthlyTrendOption"
            />
          </BaseCard>

          <BaseCard>
            <template #header>
              <div class="panel-head">
                <span>收入来源构成</span>
                <span class="panel-head__note">按已到账净额</span>
              </div>
            </template>
            <BaseChart
              v-if="incomeSourceOption"
              :option="incomeSourceOption"
              :height="240"
              empty-text="还没有到账收入记录"
              :empty="!incomeSourceOption"
            />
          </BaseCard>
        </div>

        <SectionHeader title="储蓄速度与计划" icon="clock" />

        <div class="grid grid--two">
          <BaseCard>
            <template #header>
              <div class="panel-head">
                <span>储蓄速度</span>
                <span class="panel-head__note">空月份保留为 0</span>
              </div>
            </template>
            <div v-if="threeMonthWindow" class="rows">
              <div class="rows__row">
                <span class="rows__label">最近 3 个完整月均值</span>
                <MoneyText :cents="threeMonthWindow.average" :currency="app.currency" size="sm" />
              </div>
              <div class="rows__row">
                <span class="rows__label">最近 6 个完整月均值</span>
                <MoneyText :cents="sixMonthWindow?.average ?? 0" :currency="app.currency" size="sm" />
              </div>
              <p v-if="!threeMonthWindow.sufficient" class="rows__warn">
                数据不足 3 个活跃月份，当前预测仅供参考，请继续记录真实储蓄。
              </p>
              <p v-else class="rows__note">
                统计区间 {{ threeMonthWindow.entries[0]?.month }} ~
                {{ threeMonthWindow.entries[threeMonthWindow.entries.length - 1]?.month }}，共
                {{ threeMonthWindow.entries.length }} 个月（{{ threeMonthWindow.activeMonths }} 个月有记录）。
              </p>
            </div>
            <template #footer>
              <RouterLink class="link" :to="{ name: 'forecast' }">查看详细预测 →</RouterLink>
            </template>
          </BaseCard>

          <BaseCard>
            <template #header>
              <div class="panel-head">
                <span>计划与进度</span>
                <span class="panel-head__note">目标日期差距</span>
              </div>
            </template>
            <div v-if="requiredSaving" class="rows">
              <div class="rows__row">
                <span class="rows__label">距目标日期还剩</span>
                <span class="rows__value">{{ requiredSaving.monthsLeft }} 个月</span>
              </div>
              <div class="rows__row">
                <span class="rows__label">仍需平均每月储蓄</span>
                <MoneyText :cents="requiredSaving.requiredMonthly" :currency="app.currency" size="sm" />
              </div>
              <p
                class="rows__note"
                :class="requiredSaving.achievableAtHistoricalRate ? '' : 'rows__warn'"
              >
                {{
                  requiredSaving.achievableAtHistoricalRate
                    ? '按最近的实际储蓄速度，这个要求是可行的。'
                    : '按最近的实际储蓄速度，还达不到这个要求，需要增加收入或延后日期。'
                }}
              </p>
            </div>
            <div v-else class="rows">
              <p class="rows__note">
                {{
                  summary.remainingGap === 0
                    ? '购车基金已经达到目标金额。'
                    : '尚未设置计划购车日期。'
                }}
              </p>
            </div>

            <div v-if="snapshotComparison" class="rows rows--divider">
              <p class="rows__note">
                上次预测（{{ formatDateDisplay(snapshotComparison.snapshotCreatedAt.slice(0, 10)) }}）：
                {{
                  snapshotComparison.snapshotEstimatedDate
                    ? formatDateDisplay(snapshotComparison.snapshotEstimatedDate)
                    : '当时无法预测'
                }}
              </p>
              <p class="rows__note">{{ snapshotComparison.note }}</p>
            </div>
          </BaseCard>
        </div>

        <SectionHeader title="待收款与统计" icon="target" />

        <div class="grid grid--two">
          <BaseCard>
            <template #header>
              <div class="panel-head">
                <span>待收款机会</span>
                <span class="panel-head__note">已完成未到账</span>
              </div>
            </template>
            <table class="table">
              <thead>
                <tr>
                  <th>机会</th>
                  <th>预计结算</th>
                  <th class="table__num">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="opportunity in pendingOpportunities" :key="opportunity.id">
                  <td>{{ opportunity.title }}</td>
                  <td class="table__dim">
                    {{
                      opportunity.expectedPaymentDate
                        ? formatDateDisplay(opportunity.expectedPaymentDate)
                        : '未填写'
                    }}
                  </td>
                  <td class="table__num table__dim">待确认</td>
                </tr>
                <tr v-if="pendingOpportunities.length === 0">
                  <td colspan="3" class="table__empty">暂无待收款机会</td>
                </tr>
              </tbody>
            </table>
            <template #footer>
              <RouterLink class="link" :to="{ name: 'opportunities' }">管理收入机会 →</RouterLink>
            </template>
          </BaseCard>

          <BaseCard>
            <template #header>
              <div class="panel-head">
                <span>概览统计</span>
                <span class="panel-head__note">核对数据完整性</span>
              </div>
            </template>
            <table class="table">
              <thead>
                <tr>
                  <th>指标</th>
                  <th class="table__num">数值</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>累计净收入（已到账）</td>
                  <td class="table__num">
                    <MoneyText :cents="netIncomeTotal" :currency="app.currency" size="sm" />
                  </td>
                </tr>
                <tr>
                  <td>收入记录数</td>
                  <td class="table__num table__mono">{{ incomeCount }} 笔</td>
                </tr>
                <tr>
                  <td>有效交易数</td>
                  <td class="table__num table__mono">{{ snapshot.usage.transactionCount }} 条</td>
                </tr>
                <tr>
                  <td>进行中的机会</td>
                  <td class="table__num table__mono">{{ openCount }} 个</td>
                </tr>
                <tr>
                  <td>未分配资金</td>
                  <td class="table__num">
                    <MoneyText :cents="summary.unallocatedBalance" :currency="app.currency" size="sm" />
                  </td>
                </tr>
                <tr>
                  <td>其他用途资金</td>
                  <td class="table__num">
                    <MoneyText :cents="summary.otherBalance" :currency="app.currency" size="sm" />
                  </td>
                </tr>
              </tbody>
            </table>
          </BaseCard>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.grid {
  display: grid;
  gap: var(--space-4);
}

.grid--hero {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.grid--triple {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.grid--two {
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
}

/* 区块标题自身带下边距，压缩一点以免和上方卡片间距过大 */
.dashboard > :deep(.section) {
  margin-top: calc(var(--space-3) * -1);
}

.muted-note {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

/* 储蓄进度：参考图「用量限额」的排布 */
.limits {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.limits__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.limits__caption {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.limits__warn {
  color: var(--warning);
}

/* 卡片内标题行 */
.panel-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  width: 100%;
}

.panel-head > span:first-child {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.panel-head__note {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

/* 表格：参考图「按模型统计用量」的表头与行分隔 */
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  text-align: left;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: 0 var(--space-3) var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.table td {
  padding: var(--space-3) var(--space-3) var(--space-3) 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--text);
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.table__num {
  text-align: right;
}

.table th.table__num,
.table td.table__num {
  padding-right: 0;
  font-variant-numeric: tabular-nums;
}

.table__dim {
  color: var(--text-tertiary);
}

.table__mono {
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.table__empty {
  color: var(--text-tertiary);
  font-size: 12px;
  padding: var(--space-4) 0;
}

/* 指标行 */
.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.rows--divider {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

.rows__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.rows__label {
  font-size: 12px;
  color: var(--text-secondary);
}

.rows__value {
  font-size: 12px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.rows__note {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.7;
}

.rows__warn {
  font-size: 11px;
  color: var(--warning);
  line-height: 1.7;
}

.link {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.issues {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.issues__item {
  display: flex;
  gap: var(--space-2);
  font-size: 12px;
  line-height: 1.6;
  align-items: flex-start;
}

.issues__tag {
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  padding: 0 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid currentColor;
}

.issues__tag--error {
  color: var(--danger);
}

.issues__tag--warning {
  color: var(--warning);
}
</style>
