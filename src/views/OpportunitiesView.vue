<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { RouterLink } from 'vue-router';
</script>

<template>
  <div>
    <PageHeader title="收入机会" subtitle="管理编程接单、兼职、竞赛、奖学金等潜在收入来源。" />
    <BaseCard>
      <EmptyState
        title="机会管理将在下一阶段实现"
        description="届时可在此新增、编辑、筛选机会，并在确认到账后登记真实收入（预计收入永远不会计入余额）。"
      >
        <RouterLink :to="{ name: 'dashboard' }">返回总览</RouterLink>
      </EmptyState>
    </BaseCard>
  </div>
</template>
