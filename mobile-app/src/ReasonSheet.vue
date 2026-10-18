<template>
  <div v-if="open" class="sheet-mask" @click.self="$emit('close')">
    <div class="sheet">
      <div class="sheet-head">
        <div>
          <div class="sheet-title">{{ title }}</div>
          <div v-if="subtitle" class="sheet-sub">{{ subtitle }}</div>
        </div>
        <button class="sheet-close"
                :aria-label="t('close')" :title="t('close')"
                @click="$emit('close')">
          <Icon name="close" :size="19" />
        </button>
      </div>

      <!-- 一级：常用 / 分类 -->
      <div class="chips">
        <button class="chip" :class="{ 'chip-on': activeCat === '' }" @click="activeCat = ''">
          {{ t('freqUsed') }}
        </button>
        <button v-for="c in categories" :key="c.key"
                class="chip" :class="{ 'chip-on': activeCat === c.key }"
                @click="activeCat = c.key">
          {{ c.name }}
          <span class="chip-count">{{ c.items.length }}</span>
        </button>
      </div>

      <!-- 二级：原因（词条保留马来文原文，与官方下拉逐字对应） -->
      <div class="reason-list">
        <button v-for="r in list" :key="r.code"
                class="reason" :class="{ 'reason-on': selectedCode === r.code }"
                @click="$emit('pick', r)">
          <span class="reason-name">{{ r.name }}</span>
          <span class="reason-code">{{ r.code }}</span>
        </button>
      </div>

      <div class="sheet-foot">
        <button class="btn btn-ghost btn-block" @click="$emit('present')">{{ presentLabel }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 缺勤原因选择抽屉：单人 / 批量共用。
// 无业务状态，选中结果全部上抛（pick / present / close）。
import { ref, computed, watch } from 'vue';
import { groupByCategory, getSebabByCode, QUICK_SEBAB_ALL } from './sebab.js';
import { t } from './i18n.js';
import Icon from './Icon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  selectedCode: { type: String, default: '' },
  presentLabel: { type: String, default: '' },
});

defineEmits(['pick', 'present', 'close']);

const activeCat = ref('');

const categories = computed(() => groupByCategory());
const list = computed(() => {
  const c = categories.value.find(x => x.key === activeCat.value);
  // 未选分类时展示「常用」：PDPR 置顶 + 11 项高频
  return c ? c.items : QUICK_SEBAB_ALL.map(getSebabByCode).filter(Boolean);
});

// 每次打开回到「常用」，避免沿用上一位学生的分类
watch(() => props.open, (v) => { if (v) activeCat.value = ''; });
</script>
