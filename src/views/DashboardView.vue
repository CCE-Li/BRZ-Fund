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
import StatCard from '@/components/ui/StatCard.vue';
import { useAppStore } from '@/stores/appStore';
import { useFinanceStore } from '@/stores/financeStore';
import {
  activeIncomes,
  activeTransactions,
  openOpportunityCount,
  pendingPaymentOpportunities,
  totalNetIncome,
} from '@/domain/dashboard';
import { getSavingsWindow } from '@/domain/savingsRate';
import { INCOME_SOURCE_LABELS, TRANSACTION_TYPE_LABELS } from '@/types/models';
import type { ForecastSnapshot } from '@/types/models';
import { compareForecastWithActual, calculateRequiredMonthlySaving } from '@/domain/forecast';
import { formatDateDisplay, monthKeyToLabel } from '@/utils/date';
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
    today: new Date().toISOString().slice(0, 10),
  });
});

const currentMonth = computed(() => summary.value?.savingsReport.currentMonth ?? null);

const auditIssues = computed(() => snapshot.value?.audit.issues ?? []);
const hasAuditIssues = computed(() => auditIssues.value.length > 0);

const recentTransactions = computed(() => snapshot.value?.recentTransactions ?? []);
const recentIncomes = computed(() => snapshot.value?.recentIncomes ?? []);

const activeTransactionList = computed(() => activeTransactions(finance.transactions));

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
        <BaseButton variant="secondary" size="sm" @click="finance.reload(app.settings)">刷新</BaseButton>
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
      <section class="grid grid--hero">
        <StatCard
          label="当前购车基金余额"
          :value="money(summary.fundBalance)"
          tone="accent"
          size="lg"
          :hint="`目标总额 ${money(summary.targetTotal)} · 还需 ${money(summary.remainingGap)}`"
        >
          <ProgressBar
            :percent="summary.progressPercent"
            :value-label="`${summary.progressPercent}%`"
            label="完成度"
          />
        </StatCard>

        <StatCard
          label="预计购车时间"
          :value="estimateText"
          :tone="summary.estimate.status === 'achieved' ? 'accent' : 'default'"
          :hint="estimateHint"
          size="lg"
        />

        <StatCard
          label="应急储备"
          :value="money(summary.emergencyBalance)"
          tone="info"
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
            label="完成度"
          />
          <p v-else class="muted-note">未设置目标时不做提示，也不影响购车基金计算。</p>
        </StatCard>
      </section>

      <section class="grid grid--triple">
        <StatCard
          label="本月实际到账"
          :value="money(currentMonth?.income ?? 0)"
          :hint="currentMonth ? `${monthKeyToLabel(currentMonth.month)} 的真实收入` : ''"
        />
        <StatCard
          label="本月转入购车基金"
          :value="money(currentMonth?.brzDeposits ?? 0)"
          tone="accent"
          :hint="`应急金 ${money(currentMonth?.emergencyDeposits ?? 0)}`"
        />
        <StatCard
          label="本月支出"
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
          <li v-for="issue in auditIssues" :key="`${issue.entity}-${issue.entityId}-${issue.message}`" class="issues__item">
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

      <div v-else class="grid grid--two">
        <BaseCard title="最近资金记录" subtitle="按发生日期倒序，不含已作废记录">
          <ul class="records">
            <li v-for="transaction in recentTransactions" :key="transaction.id" class="records__row">
              <div class="records__main">
                <span class="records__title">{{ TRANSACTION_TYPE_LABELS[transaction.type] }}</span>
                <span class="records__meta">{{ formatDateDisplay(transaction.occurredAt) }}</span>
              </div>
              <MoneyText
                :cents="transaction.type.includes('withdraw') ? -transaction.amount : transaction.amount"
                :currency="transaction.currency"
                :tone="transaction.type === 'expense' ? 'negative' : 'positive'"
                size="sm"
                signed
              />
            </li>
            <li v-if="recentTransactions.length === 0" class="records__empty">暂无记录</li>
          </ul>
          <template #footer>
            <RouterLink class="records__link" :to="{ name: 'transactions' }">查看全部流水 →</RouterLink>
          </template>
        </BaseCard>

        <BaseCard title="最近到账收入" subtitle="只有确认到账的金额才计入余额">
          <ul class="records">
            <li v-for="income in recentIncomes" :key="income.id" class="records__row">
              <div class="records__main">
                <span class="records__title">{{ income.note || '收入到账' }}</span>
                <span class="records__meta">
                  {{ formatDateDisplay(income.receivedAt) }} · 直接成本
                  {{ money(income.directCosts, income.currency) }}
                </span>
              </div>
              <MoneyText :cents="finance.netIncomeOf(income)" :currency="income.currency" tone="positive" size="sm" />
            </li>
            <li v-if="recentIncomes.length === 0" class="records__empty">暂无到账记录</li>
          </ul>
          <template #footer>
            <RouterLink class="records__link" :to="{ name: 'allocations' }">去分配资金 →</RouterLink>
          </template>
        </BaseCard>
      </div>

      <div class="grid grid--two">
        <BaseCard title="储蓄速度" subtitle="空月份保留为 0，不会被忽略">
          <div v-if="threeMonthWindow" class="savings">
            <div class="savings__row">
              <span>最近 3 个完整月均值</span>
              <MoneyText :cents="threeMonthWindow.average" :currency="app.currency" size="sm" />
            </div>
            <div class="savings__row">
              <span>最近 6 个完整月均值</span>
              <MoneyText :cents="sixMonthWindow?.average ?? 0" :currency="app.currency" size="sm" />
            </div>
            <p v-if="!threeMonthWindow.sufficient" class="savings__warn">
              数据不足 3 个活跃月份，当前预测仅供参考，请继续记录真实储蓄。
            </p>
            <p v-else class="savings__note">
              统计区间 {{ threeMonthWindow.entries[0]?.month }} ~
              {{ threeMonthWindow.entries[threeMonthWindow.entries.length - 1]?.month }}，共
              {{ threeMonthWindow.entries.length }} 个月（{{ threeMonthWindow.activeMonths }} 个月有记录）。
            </p>
          </div>
          <template #footer>
            <RouterLink class="records__link" :to="{ name: 'forecast' }">查看详细预测 →</RouterLink>
          </template>
        </BaseCard>

        <BaseCard title="计划与进度" subtitle="目标日期与实际进度的差距">
          <div v-if="requiredSaving" class="savings">
            <div class="savings__row">
              <span>距目标日期还剩</span>
              <span class="savings__value">{{ requiredSaving.monthsLeft }} 个月</span>
            </div>
            <div class="savings__row">
              <span>仍需平均每月储蓄</span>
              <MoneyText :cents="requiredSaving.requiredMonthly" :currency="app.currency" size="sm" />
            </div>
            <p class="savings__note">
              {{
                requiredSaving.achievableAtHistoricalRate
                  ? '按最近的实际储蓄速度，这个要求是可行的。'
                  : '按最近的实际储蓄速度，还达不到这个要求，需要增加收入或延后日期。'
              }}
            </p>
          </div>
          <div v-else class="savings">
            <p class="savings__note">
              {{ summary.remainingGap === 0 ? '购车基金已经达到目标金额。' : '尚未设置计划购车日期。' }}
            </p>
          </div>

          <div v-if="snapshotComparison" class="savings savings--snapshot">
            <p class="savings__note">
              上次预测（{{ formatDateDisplay(snapshotComparison.snapshotCreatedAt.slice(0, 10)) }}）：
              {{ snapshotComparison.snapshotEstimatedDate ? formatDateDisplay(snapshotComparison.snapshotEstimatedDate) : '当时无法预测' }}
            </p>
            <p class="savings__note">{{ snapshotComparison.note }}</p>
          </div>
        </BaseCard>
      </div>

      <BaseCard title="购车基金累计增长" subtitle="按实际记录逐月累计，虚线为目标金额">
        <BaseChart
          :option="growthChartOption.option"
          :height="260"
          :empty="activeTransactionList.length === 0"
        />
      </BaseCard>

      <div class="grid grid--two">
        <BaseCard title="每月收入与储蓄趋势" subtitle="最近 6 个完整月：到账收入 vs 转入购车基金">
          <BaseChart
            v-if="monthlyTrendOption"
            :option="monthlyTrendOption"
            :height="240"
            empty-text="最近 6 个月还没有收入或储蓄记录"
            :empty="!monthlyTrendOption"
          />
        </BaseCard>

        <BaseCard title="收入来源构成" subtitle="按已到账净额统计，预计收入不计入">
          <BaseChart
            v-if="incomeSourceOption"
            :option="incomeSourceOption"
            :height="240"
            empty-text="还没有到账收入记录"
            :empty="!incomeSourceOption"
          />
        </BaseCard>
      </div>

      <div class="grid grid--two">
        <BaseCard title="待收款机会" subtitle="已完成但未到账，不计入余额">
          <ul class="records">
            <li v-for="opportunity in pendingOpportunities" :key="opportunity.id" class="records__row">
              <div class="records__main">
                <span class="records__title">{{ opportunity.title }}</span>
                <span class="records__meta">
                  预计结算 {{ opportunity.expectedPaymentDate ? formatDateDisplay(opportunity.expectedPaymentDate) : '未填写' }}
                </span>
              </div>
              <span class="records__meta">待确认到账</span>
            </li>
            <li v-if="pendingOpportunities.length === 0" class="records__empty">暂无待收款机会</li>
          </ul>
          <template #footer>
            <RouterLink class="records__link" :to="{ name: 'opportunities' }">管理收入机会 →</RouterLink>
          </template>
        </BaseCard>

        <BaseCard title="概览统计" subtitle="用于快速核对数据完整性">
          <ul class="metrics">
            <li><span>累计净收入（已到账）</span><MoneyText :cents="netIncomeTotal" :currency="app.currency" size="sm" /></li>
            <li><span>收入记录数</span><span class="metrics__value">{{ incomeCount }} 笔</span></li>
            <li><span>有效交易数</span><span class="metrics__value">{{ snapshot.usage.transactionCount }} 条</span></li>
            <li><span>进行中的机会</span><span class="metrics__value">{{ openCount }} 个</span></li>
            <li><span>未分配资金</span><MoneyText :cents="summary.unallocatedBalance" :currency="app.currency" size="sm" /></li>
            <li><span>其他用途资金</span><MoneyText :cents="summary.otherBalance" :currency="app.currency" size="sm" /></li>
          </ul>
        </BaseCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.grid {
  display: grid;
  gap: var(--space-4);
}

.grid--hero {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.grid--triple {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.grid--two {
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.muted-note {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: var(--space-2);
  line-height: 1.6;
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
  font-size: 11px;
  border: 1px solid currentColor;
}

.issues__tag--error {
  color: var(--danger);
}

.issues__tag--warning {
  color: var(--warning);
}

.records {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.records__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.records__row:last-child {
  border-bottom: none;
}

.records__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.records__title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.records__meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

.records__empty {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: var(--space-3) 0;
}

.records__link {
  font-size: 12px;
}

.savings {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.savings--snapshot {
  margin-top: var(--space-3);
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-3);
}

.savings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 13px;
  color: var(--text-secondary);
}

.savings__value {
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.savings__note {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.savings__warn {
  font-size: 12px;
  color: var(--warning);
  line-height: 1.6;
}

.metrics {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.metrics li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
  color: var(--text-secondary);
}

.metrics li:last-child {
  border-bottom: none;
}

.metrics__value {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
</style>
