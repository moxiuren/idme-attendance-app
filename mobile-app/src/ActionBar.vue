<template>
  <footer class="actionbar">
    <!-- ============ 批量模式 ============ -->
    <template v-if="selectMode">
      <button class="btn btn-ghost" @click="$emit('cancel')">{{ t('cancel') }}</button>
      <button class="btn flex1" :disabled="selCount === 0 || busy" @click="$emit('markPresent')">
        {{ t('markPresent') }}
      </button>
      <button class="btn btn-amber flex1" :disabled="selCount === 0 || busy" @click="$emit('openReason')">
        {{ t('markAbsent') }}
      </button>
    </template>

    <!-- ============ 常规模式 ============ -->
    <template v-else>
      <!-- 一键全班 PDPR（居家学习，官方 A 类，仍计出席）。
           置于最左：整班场景的第一步是先定「今天是否居家学习」，
           再处理个别例外。确认后**直接归档**，不再要求再点一次 Kemaskini。 -->
      <button class="btn btn-pdpr"
              :disabled="busy || total === 0 || readonly"
              :aria-label="t('actPdprFull')" :title="readonly ? readonlyReason : t('actPdprFull')"
              @click="$emit('pdpr')">
        {{ t('actPdpr') }}
      </button>

      <!-- 唯一提交按钮：语义随屏幕状态切换（2026-10-16 用户定稿）——
           屏幕上没有任何缺席/请假 → 「全班到齐 + 归档」，一次点击完成；
           有条目                → 「Kemaskini」，按屏幕名单归档。
           原先独立的「Semua Hadir」按钮已并入这里。
           readonly（未来日期 / 官方不允许录入）时两个按钮一并停用，
           理由由 App.vue 的常驻横幅给出，这里再用 title 兜一层。 -->
      <button class="btn btn-lg flex1"
              :class="pending > 0 ? 'btn-amber' : 'btn-primary'"
              :disabled="busy || total === 0 || readonly"
              :title="readonly ? readonlyReason : undefined"
              @click="$emit('submit')">
        <span v-if="busy">{{ t('submitting') }}</span>
        <!-- 主行 + 副行两段式：马来文提交文案较长，单行会折成 3 行撑破按钮 -->
        <span v-else-if="pending > 0" class="btn-2line">
          <span class="btn-2line-a">{{ t('submit') }}</span>
          <span class="btn-2line-b">{{ submitDetail }}</span>
        </span>
        <span v-else>{{ t('submitAllPresent') }}</span>
      </button>
    </template>
  </footer>
</template>

<script setup>
// 吸底操作栏：批量模式与常规模式互斥。
// 常规模式只有两个按钮：PDPR（最左）+ 提交（占满剩余宽度，语义随状态切换）。
import { computed } from 'vue';
import { t } from './i18n.js';

const props = defineProps({
  selectMode: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  pending: { type: Number, default: 0 },     // 缺席 + 算出席
  total: { type: Number, default: 0 },       // 学生总数
  absent: { type: Number, default: 0 },
  excused: { type: Number, default: 0 },
  selCount: { type: Number, default: 0 },
  // 只读：日期尚未到来，或官方声明当天不可录入 → 两个按钮一并停用
  readonly: { type: Boolean, default: false },
  readonlyReason: { type: String, default: '' },
});
defineEmits(['cancel', 'markPresent', 'openReason', 'pdpr', 'submit']);

/** 提交按钮副行：把「几人缺席 / 几人 PDPR」拆到第二行，主行动词固定为 Kemaskini */
const submitDetail = computed(() => (props.excused
  ? t('submitDetailEx', { absent: props.absent, excused: props.excused })
  : t('submitDetail', { absent: props.absent })));
</script>
