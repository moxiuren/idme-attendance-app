<template>
  <div class="datebar">
    <button class="date-arrow" @click="$emit('prev')" :disabled="busy"
            :aria-label="t('prevDay')" :title="t('prevDay')">‹</button>

    <button class="date-main" @click="$emit('today')" :title="t('jumpToday')">
      <span class="date-text">{{ dateDisplay }}</span>
      <!-- 官方状态徽章原文（tabguru 页 statusBadge）。
           非上课日（周休 / 假期）不显示 —— 当天本就没有出勤可确认，
           挂一个「MENUNGGU PENGESAHAN」是误导（2026-10-17 用户指出）。 -->
      <span v-if="showTag" class="date-tag" :class="isVerified ? 'tag-green' : 'tag-amber'">
        {{ isVerified ? t('archived') : t('notArchived') }}
      </span>
    </button>

    <!-- 「下一天」在今天置灰：官方日期选择器 maxDate = 今天，
         未来日期本就不该到达，索性在导航层挡住，不必再给任何提示。 -->
    <button class="date-arrow" @click="$emit('next')" :disabled="busy || !canNext"
            :aria-label="t('nextDay')" :title="t('nextDay')">›</button>
  </div>
</template>

<script setup>
// 日期导航：前后一天 + 回到今天。状态徽章用官方 TELAH DISAHKAN / MENUNGGU PENGESAHAN。
import { t } from './i18n.js';

defineProps({
  dateDisplay: { type: String, default: '—' },
  isVerified: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  // 还能不能往后翻一天（false = 已到今天）
  canNext: { type: Boolean, default: true },
  // 是否显示「已归档 / 待确认」徽章（非上课日为 false）
  showTag: { type: Boolean, default: true },
});
defineEmits(['prev', 'next', 'today']);
</script>
