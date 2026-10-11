<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { RouterLink } from 'vue-router';
</script>

<template>
  <div>
    <PageHeader title="收支流水" subtitle="收入、支出、桶间转账与其他调整的完整账本。" />
    <BaseCard>
      <EmptyState
        title="流水页面将在下一阶段实现"
        description="届时支持按日期、金额、类型筛选，并提供编辑备注、删除与撤销操作。"
      >
        <RouterLink :to="{ name: 'dashboard' }">返回总览</RouterLink>
      </EmptyState>
    </BaseCard>
  </div>
</template>
