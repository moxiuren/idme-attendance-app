<template>
  <div>
    <div class="stats">
      <div class="stat">
        <div class="stat-num">{{ total }}</div>
        <div class="stat-lbl">{{ t('statTotal') }}</div>
      </div>
      <div class="stat">
        <div class="stat-num c-green">{{ hadir }}</div>
        <div class="stat-lbl">{{ t('statPresent') }}</div>
      </div>
      <div class="stat">
        <div class="stat-num" :class="absen > 0 ? 'c-red' : 'c-dim'">{{ absen }}</div>
        <div class="stat-lbl">{{ t('statAbsent') }}</div>
      </div>
      <div class="stat">
        <div class="stat-num c-blue">{{ rate }}%</div>
        <div class="stat-lbl">{{ t('statRate') }}</div>
      </div>
    </div>
    <div v-if="excused > 0" class="stat-note">
      {{ t('statNote', { n: excused }) }}
    </div>
  </div>
</template>

<script setup>
// 顶部统计条：口径与官方一致（出席 = 勾选出席 + 官方算出席的请假）
import { t } from './i18n.js';

defineProps({
  total: { type: Number, default: 0 },
  hadir: { type: Number, default: 0 },
  absen: { type: Number, default: 0 },
  excused: { type: Number, default: 0 },
  rate: { type: String, default: '100' },
});
</script>
