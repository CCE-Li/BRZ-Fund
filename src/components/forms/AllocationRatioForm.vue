<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';
import { useAppStore } from '@/stores/appStore';
import { ratioSum } from '@/domain/defaults';
import { applySettingsPatch } from '@/services/settingsService';
import { toErrorMessage } from '@/utils/errors';
import { useToast } from '@/composables/useToast';

const app = useAppStore();
const toast = useToast();

const ratios = reactive({ brz: 75, emergency: 15, other: 10 });
const emergencyTarget = ref<number | null>(null);
const saving = ref(false);
const error = ref<string | null>(null);

watch(
  () => app.settings,
  (settings) => {
    ratios.brz = settings.allocationRatios.brz;
    ratios.emergency = settings.allocationRatios.emergency;
    ratios.other = settings.allocationRatios.other;
    emergencyTarget.value = settings.emergencyTarget > 0 ? settings.emergencyTarget : null;
  },
  { immediate: true, deep: true },
);

const sum = computed(() => ratioSum(ratios));

async function submit(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    if (sum.value <= 0) throw new Error('分配比例之和必须大于 0。');
    const updated = await applySettingsPatch({
      allocationRatios: { ...ratios },
      emergencyTarget: emergencyTarget.value ?? 0,
    });
    app.applySettings(updated);
    toast.success('分配比例与应急储备目标已保存。');
  } catch (submitError) {
    error.value = toErrorMessage(submitError);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="ratio-form" @submit.prevent="submit">
    <div class="ratio-form__grid">
      <BaseInput v-model.number="ratios.brz" label="购车基金（%）" type="number" min="0" />
      <BaseInput v-model.number="ratios.emergency" label="应急储备（%）" type="number" min="0" />
      <BaseInput v-model.number="ratios.other" label="其他用途（%）" type="number" min="0" />
    </div>
    <p class="ratio-form__sum" :class="{ 'ratio-form__sum--warn': sum <= 0 }">
      合计 {{ sum }}%（比例只是建议值，实际分配时可以自由修改）
    </p>
    <MoneyInput
      v-model="emergencyTarget"
      label="应急储备目标"
      hint="留空或 0 表示暂不设置目标。"
    />
    <p class="ratio-form__hint">
      未达到应急储备目标时，分配页面会提示优先补充，但不会自动转账或修改你的资金计划。
    </p>
    <p v-if="error" class="ratio-form__error">{{ error }}</p>
    <div class="ratio-form__actions">
      <BaseButton type="submit" variant="primary" :loading="saving">保存</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.ratio-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ratio-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-3);
}

.ratio-form__sum {
  font-size: 12px;
  color: var(--text-tertiary);
}

.ratio-form__sum--warn {
  color: var(--danger);
}

.ratio-form__hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.ratio-form__error {
  color: var(--danger);
  font-size: 12px;
}

.ratio-form__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
