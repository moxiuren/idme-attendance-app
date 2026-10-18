<template>
  <div v-if="state" class="dialog-mask" @click.self="$emit('answer', false)">
    <div class="dialog" role="alertdialog" aria-modal="true">
      <div class="dialog-head">
        <span class="dialog-icon" :class="state.danger ? 'dialog-icon-danger' : 'dialog-icon-warn'">
          <Icon :name="state.danger ? 'alert' : 'help'" :size="21" />
        </span>
        <span v-if="state.title" class="dialog-title">{{ state.title }}</span>
      </div>

      <p class="dialog-msg">{{ state.message }}</p>

      <div class="dialog-foot">
        <button class="btn btn-ghost flex1" @click="$emit('answer', false)">
          {{ state.cancelText || t('cancel') }}
        </button>
        <button class="btn flex1" :class="state.danger ? 'btn-danger' : 'btn-primary'"
                @click="$emit('answer', true)">
          {{ state.confirmText || t('confirmOk') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 手账风确认对话框：居中卡片 + 手绘边框 + 实色偏移投影。
// 与底部抽屉刻意区分 —— 抽屉是「选东西」（点遮罩即关闭），
// 对话框是「做决定」（必须明确选一边）。
import { t } from './i18n.js';
import Icon from './Icon.vue';

defineProps({
  // { title, message, confirmText, cancelText, danger }
  state: { type: Object, default: null },
});
defineEmits(['answer']);
</script>
