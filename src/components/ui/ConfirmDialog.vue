<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import { settleConfirm, useConfirmState } from '@/composables/useConfirm';

const state = useConfirmState();
const typed = ref('');

watch(
  () => state.open,
  (open) => {
    if (open) typed.value = '';
  },
);

const textSatisfied = computed(() => {
  if (!state.requireText) return true;
  return typed.value.trim() === state.requireText;
});

function onConfirm(): void {
  if (!textSatisfied.value) return;
  settleConfirm(true);
}

function onCancel(): void {
  settleConfirm(false);
}
</script>

<template>
  <BaseModal
    :open="state.open"
    :title="state.title"
    width="sm"
    :close-on-backdrop="false"
    @close="onCancel"
  >
    <p class="confirm__message">{{ state.message }}</p>
    <div v-if="state.requireText" class="confirm__require">
      <BaseInput
        v-model="typed"
        :label="`请输入「${state.requireText}」以继续`"
        placeholder=""
      />
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="onCancel">{{ state.cancelLabel }}</BaseButton>
      <BaseButton
        :variant="state.tone === 'danger' ? 'danger' : 'primary'"
        :disabled="!textSatisfied"
        @click="onConfirm"
      >
        {{ state.confirmLabel }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.confirm__message {
  color: var(--text-secondary);
  line-height: 1.6;
}

.confirm__require {
  margin-top: var(--space-4);
}
</style>
