<template>
  <header class="topbar">
    <button class="topbar-class" @click="$emit('pickClass')" :disabled="classCount < 2">
      <span class="topbar-class-name">{{ className || t('noClass') }}</span>
      <Icon v-if="classCount > 1" name="chevron-down" :size="14" class="caret" />
    </button>

    <div class="topbar-right">
      <!-- 连接状态：既是状态点也是无障碍标签（原来只有 title，读屏读不到） -->
      <span class="conn" :class="online ? 'conn-on' : 'conn-off'"
            role="img"
            :aria-label="online ? t('online') : t('offline')"
            :title="online ? t('online') : t('offline')"></span>

      <!-- 退出批量选择（批量选择本身由长按学生行进入） -->
      <button v-if="selectMode" class="icon-btn"
              :aria-label="t('actDone')" :title="t('actDone')"
              @click="$emit('exitSelect')">
        <Icon name="close" :size="21" />
      </button>

      <button class="icon-btn" :aria-label="t('actReport')" :title="t('actReport')"
              @click="$emit('report')">
        <Icon name="report" :size="21" />
      </button>
      <!-- 设置按钮兼任更新入口：有新版本时右上角挂一个琥珀圆点。
           不新增按钮 —— 360dp 下顶栏只剩约 36px 余量，
           再塞一个 44px 触控目标会把班级名挤到无法显示。 -->
      <button class="icon-btn icon-btn-badge" :aria-label="t('actSettings')" :title="t('actSettings')"
              @click="$emit('settings')">
        <Icon name="settings" :size="21" />
        <span v-if="updateBadge" class="upd-dot" aria-hidden="true"></span>
      </button>
    </div>
  </header>
</template>

<script setup>
// 顶栏：班级入口 + 连接状态 + 报表 / 设置 / 退出批量。
// 一键 PDPR 已移到吸底操作栏，顶栏因此只剩纯导航，不再挤字。
import { t } from './i18n.js';
import Icon from './Icon.vue';

defineProps({
  className: { type: String, default: '' },
  classCount: { type: Number, default: 0 },
  online: { type: Boolean, default: false },
  selectMode: { type: Boolean, default: false },
  updateBadge: { type: Boolean, default: false },
});
defineEmits(['pickClass', 'exitSelect', 'report', 'settings']);
</script>
