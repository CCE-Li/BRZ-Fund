<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { RouterLink } from 'vue-router';
</script>

<template>
  <div>
    <PageHeader title="购车预测" subtitle="基于真实储蓄速度推算，并支持自定义情景模拟。" />
    <BaseCard>
      <EmptyState
        title="预测页面将在下一阶段实现"
        description="届时提供历史速度预测、情景模拟、多档速度对比、目标日期差距与快照对比，全部标注数据来源。"
      >
        <RouterLink :to="{ name: 'dashboard' }">返回总览</RouterLink>
      </EmptyState>
    </BaseCard>
  </div>
</template>
