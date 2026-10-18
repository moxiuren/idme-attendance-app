<template>
  <div v-if="open" class="sheet-mask" @click.self="$emit('close')">
    <div class="sheet sheet-sm">
      <div class="sheet-head">
        <div class="sheet-title">{{ t('settingsTitle') }}</div>
        <button class="sheet-close"
                :aria-label="t('close')" :title="t('close')"
                @click="$emit('close')">
          <Icon name="close" :size="19" />
        </button>
      </div>

      <!-- 界面语言：默认马来文 -->
      <div class="field">
        <span class="field-label">
          <Icon name="globe" :size="15" class="lbl-ic" />{{ t('language') }}
        </span>
        <div class="lang-seg">
          <!-- 三语并排：按钮等分宽度（flex:1），360px 下每个约 100px。
               显示 label 全名会把 "Bahasa Melayu" 挤成两行、撑破 44px 触控高度，
               故按钮上只放 short（BM / EN / 中），全名交给 aria-label 与 title ——
               读屏软件仍读完整名，视觉上保持等宽。 -->
          <button v-for="l in LANGS" :key="l.code"
                  type="button"
                  class="lang-opt" :class="{ 'lang-on': lang === l.code }"
                  :aria-pressed="lang === l.code"
                  :aria-label="l.label"
                  :title="l.label"
                  @click="setLang(l.code)">
            {{ l.short }}
          </button>
        </div>
      </div>

      <!-- 身份证号：默认脱敏。教师常在课堂上打开设置，明文显示等于把
           身份证号暴露给全班，因此默认只露头尾 4 位，且不可编辑。 -->
      <label class="field">
        <span class="field-label">{{ t('icLabel') }}</span>
        <span class="input-wrap">
          <input :value="revealIc ? ic : maskIc(ic)"
                 type="text"
                 :readonly="!revealIc"
                 inputmode="numeric"
                 class="input"
                 :class="{ 'input-ro': !revealIc }"
                 @input="$emit('update:ic', $event.target.value.trim())" />
          <button type="button" class="input-act"
                  :aria-label="revealIc ? t('hide') : t('show')"
                  :title="revealIc ? t('hide') : t('show')"
                  @click="revealIc = !revealIc">
            <Icon :name="revealIc ? 'eye-off' : 'eye'" :size="19" />
          </button>
        </span>
      </label>

      <label class="field">
        <span class="field-label">{{ t('pwLabel') }}</span>
        <span class="input-wrap">
          <input :value="password"
                 :type="revealPw ? 'text' : 'password'"
                 class="input"
                 @input="$emit('update:password', $event.target.value)" />
          <button type="button" class="input-act"
                  :aria-label="revealPw ? t('hide') : t('show')"
                  :title="revealPw ? t('hide') : t('show')"
                  @click="revealPw = !revealPw">
            <Icon :name="revealPw ? 'eye-off' : 'eye'" :size="19" />
          </button>
        </span>
      </label>

      <div class="sheet-foot sheet-foot-col">
        <button class="btn btn-primary btn-block" @click="$emit('save')">{{ t('saveRelogin') }}</button>
        <button class="btn btn-ghost btn-block" @click="$emit('clear')">{{ t('clearCred') }}</button>
        <!-- 检查更新：放在最下方，与「清除凭据」同为次要操作。
             发现新版本时换成琥珀色 —— 与「算出席」同一语义色，
             教师扫一眼就知道这一项现在有事要做，不用逐个点开看。 -->
        <button class="btn btn-block" :class="updateAvailable ? 'btn-amber' : 'btn-ghost'"
                @click="$emit('check-update')">
          <Icon v-if="updateAvailable" name="refresh" :size="16" />
          {{ updateAvailable
              ? t('updAvailable', { v: updateVersion })
              : t('updCheck') }}
        </button>
      </div>
      <p class="meta-line">{{ t('dictMeta', { sebab: sebabCount, cat: categoryCount }) }}</p>
      <!-- 版本号：教师反馈问题时，让他们报这一行即可定位到具体构建。
           值来自 vite.config.js 从 build.gradle 解析的 versionName。 -->
      <!-- 版本号与作者落款同行：二者是同类信息（这个构建是谁做的、什么版本）。
           教师反馈问题时本来就要报这一行，署名随之一并被带出去。 -->
      <p class="ver-line">
        {{ t('appVersion', { v: ver }) }}<span class="ver-sep">·</span>{{ t('authorSign') }}
      </p>
    </div>
  </div>
</template>

<script setup>
// 设置抽屉：界面语言 / 凭据修改 / 清除（凭据状态由父级持有）
// 身份证号默认脱敏，避免课堂场景下明文外泄；密码提供显隐切换。
import { ref, watch } from 'vue';
import { t, lang, setLang, LANGS } from './i18n.js';
import Icon from './Icon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  ic: { type: String, default: '' },
  password: { type: String, default: '' },
  sebabCount: { type: Number, default: 0 },
  categoryCount: { type: Number, default: 0 },
  // 更新状态由父级（useUpdater）持有 —— 抽屉关闭期间下载仍在继续，
  // 状态不能随组件销毁而丢
  updateAvailable: { type: Boolean, default: false },
  updateVersion: { type: String, default: '' },
});
defineEmits(['close', 'save', 'clear', 'check-update', 'update:ic', 'update:password']);

const revealIc = ref(false);
const revealPw = ref(false);

// __APP_VERSION__ 由 vite.config.js 的 define 在构建期替换成字面量。
// 用 typeof 保护：契约测试 / 单元测试用 esbuild 单独打包时不会注入该常量，
// 若直接裸引用会抛 ReferenceError。
const ver = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// 每次重新打开都回到脱敏状态，不记忆上次的「已显示」
watch(() => props.open, (v) => {
  if (v) { revealIc.value = false; revealPw.value = false; }
});

/** 保留头尾 4 位，中间以圆点填充；不足 8 位则整体遮蔽 */
function maskIc(v) {
  const s = String(v || '');
  if (s.length <= 8) return '•'.repeat(s.length);
  return s.slice(0, 4) + '•'.repeat(s.length - 8) + s.slice(-4);
}
</script>
