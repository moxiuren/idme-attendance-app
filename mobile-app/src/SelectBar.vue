<template>
  <div class="selbar">
    <span class="selbar-count">{{ t('selCount', { n: count, total }) }}</span>
    <button class="selbar-btn" @click="$emit('all')">{{ t('selectAll') }}</button>
    <button class="selbar-btn" @click="$emit('invert')">{{ t('invertSelect') }}</button>
    <button class="selbar-btn" @click="$emit('none')">{{ t('selectNone') }}</button>
  </div>
</template>

<script setup>
// 批量选择条：只在批量模式下出现。
// 计数独占一行 —— 三个马来文按钮名较长，与计数同行会把计数挤成两行并裁切。
import { t } from './i18n.js';

defineProps({
  count: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
});
defineEmits(['all', 'invert', 'none']);
</script>
