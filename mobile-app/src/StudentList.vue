<template>
  <main class="list">
    <!-- 空态分两种，原先都只显示一行灰字：
         · 加载中 —— 只需一句提示
         · 加载完但没名单 —— 教师会问「是我选错日期，还是系统没数据」，
           必须给图标 + 一句可执行的说明，而不是干瘪的「Tiada data」 -->
    <div v-if="loading && !students.length" class="empty">
      <!-- 加载态是唯一带运动的东西：它确实在动（等数据），不是装饰。
           其余元素一律静止，避免整个界面「一直在呼吸」的 AI 演示感。 -->
      <span class="empty-ic empty-ic-load"><Icon name="refresh" :size="26" /></span>
      <p class="empty-t">{{ t('loading') }}</p>
    </div>
    <div v-else-if="!students.length" class="empty">
      <span class="empty-ic"><Icon name="inbox" :size="26" /></span>
      <p class="empty-t">{{ t('empty') }}</p>
      <p class="empty-hint">{{ t('emptyHint') }}</p>
    </div>

    <button v-for="st in students" :key="st.id"
            class="row"
            :class="{
              'row-absent': st.state === 'absent',
              'row-excused': st.state === 'excused',
              'row-picked': selectMode && picked.has(st.id),
            }"
            @click="onTap(st)"
            @touchstart.passive="onPressStart(st)"
            @touchend="onPressEnd"
            @touchcancel="onPressEnd"
            @touchmove.passive="onPressEnd"
            @contextmenu.prevent>
      <span v-if="selectMode" class="row-check" :class="{ 'row-check-on': picked.has(st.id) }">
        <span v-if="picked.has(st.id)">✓</span>
      </span>
      <span v-else class="row-idx">{{ st.index }}</span>

      <span class="row-body">
        <span class="row-name">{{ st.name }}</span>
        <span v-if="st.state !== 'present' && st.sebabName" class="row-reason">{{ st.sebabName }}</span>
      </span>

      <span class="row-state" :class="'state-' + st.state">{{ stateLabel(st) }}</span>
    </button>
  </main>
</template>

<script setup>
// 学生名单：三态着色（出席 / 算出席 / 缺席）+ 批量选择态
// 交互：单击 → 选假因；长按 → 进入批量选择（顶栏「批量」入口已让位给一键 PDPR）
import { computed } from 'vue';
import Icon from './Icon.vue';
import { t } from './i18n.js';
import { categoryName } from './sebab.js';

const props = defineProps({
  students: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  selectMode: { type: Boolean, default: false },
  selected: { type: Array, default: () => [] },
});
const emit = defineEmits(['tap', 'longpress']);

const picked = computed(() => new Set(props.selected));

/**
 * 行尾状态标签。
 *
 * present / absent 用官方词（Hadir / Tidak Hadir）。
 * 「算出席」官方**没有**对应标签 —— 官方页面只显示未勾选的复选框 + 假因原文。
 * 因此这里不用自造词，改用官方**分类名**（A → PDPR、G → PENGGILIRAN PEPERIKSAAN …），
 * 全部来自官方 generateKatSelect() 的下拉选项，与教师在下拉里看到的一致。
 */
function stateLabel(st) {
  if (st.state === 'present') return t('present');
  if (st.state === 'absent') return t('absent');
  return st.kategori ? categoryName(st.kategori) : t('excused');
}

// ── 长按识别 ──
// Android WebView 在长按后仍会补发一次 click，用 longPressed 标志吞掉它，
// 否则「长按进多选」会紧接着触发「打开假因抽屉」。
const LONG_PRESS_MS = 480;
let pressTimer = null;
let longPressed = false;

function onPressStart(st) {
  longPressed = false;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    longPressed = true;
    emit('longpress', st);
  }, LONG_PRESS_MS);
}
function onPressEnd() {
  clearTimeout(pressTimer);
  pressTimer = null;
}
function onTap(st) {
  if (longPressed) { longPressed = false; return; }
  emit('tap', st);
}
</script>
