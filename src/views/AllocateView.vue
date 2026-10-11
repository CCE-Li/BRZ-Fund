<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { RouterLink } from 'vue-router';
</script>

<template>
  <div>
    <PageHeader title="资金分配" subtitle="把已到账收入划分到购车基金、应急储备或其他用途。" />
    <BaseCard>
      <EmptyState
        title="分配页面将在下一阶段实现"
        description="届时可按比例生成建议、手动调整金额、校验总额，并对错误分配进行撤销。"
      >
        <RouterLink :to="{ name: 'dashboard' }">返回总览</RouterLink>
      </EmptyState>
    </BaseCard>
  </div>
</template>
