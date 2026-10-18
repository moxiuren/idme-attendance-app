<template>
  <div v-if="open" class="sheet-mask" @click.self="$emit('close')">
    <div class="sheet sheet-sm">
      <div class="sheet-head">
        <div class="sheet-title">{{ t('pickClass') }}</div>
        <button class="sheet-close"
                :aria-label="t('close')" :title="t('close')"
                @click="$emit('close')">
          <Icon name="close" :size="19" />
        </button>
      </div>
      <button v-for="(c, i) in classes" :key="c.id"
              class="reason" :class="{ 'reason-on': i === current }"
              @click="$emit('choose', i)">
        <span class="reason-name">{{ c.name }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
// 班级切换抽屉（无内部状态，纯展示 + 事件上抛）
import { t } from './i18n.js';
import Icon from './Icon.vue';

defineProps({
  open: { type: Boolean, default: false },
  classes: { type: Array, default: () => [] },
  current: { type: Number, default: 0 },
});
defineEmits(['close', 'choose']);
</script>
