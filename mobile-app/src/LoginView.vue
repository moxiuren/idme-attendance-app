<template>
  <div class="boot">
    <div class="boot-card">
      <div class="boot-logo">idMe</div>
      <h1 class="boot-title">{{ t('appTitle') }}</h1>

      <div v-if="error" class="alert alert-red">{{ error }}</div>

      <label class="field">
        <span class="field-label">{{ t('icLabel') }}</span>
        <input :value="ic" type="text" inputmode="numeric" class="input"
               :placeholder="t('icPh')"
               @input="$emit('update:ic', $event.target.value.trim())"
               @keyup.enter="$emit('submit')" />
      </label>

      <label class="field">
        <span class="field-label">{{ t('pwLabel') }}</span>
        <span class="input-wrap">
          <input :value="password"
                 :type="revealPw ? 'text' : 'password'"
                 class="input"
                 :placeholder="t('pwPh')"
                 @input="$emit('update:password', $event.target.value)"
                 @keyup.enter="$emit('submit')" />
          <button type="button" class="input-act"
                  :aria-label="revealPw ? t('hide') : t('show')"
                  :title="revealPw ? t('hide') : t('show')"
                  @click="revealPw = !revealPw">
            <Icon :name="revealPw ? 'eye-off' : 'eye'" :size="19" />
          </button>
        </span>
      </label>

      <button class="btn btn-primary btn-lg btn-block" :disabled="busy" @click="$emit('submit')">
        {{ busy ? t('loggingIn') : t('login') }}
      </button>

      <p v-if="progress" class="boot-progress">{{ progress }}</p>
      <p class="boot-note">{{ t('credNote') }}</p>

      <!-- 作者落款：手账本的题签位置。
           刻意右对齐、手写体、微微倾斜 —— 居中的灰色小字是
           「AI 生成页脚」的典型长相，手写签名永远落在角落。
           字体是自带子集（只有「小莫出品」四字），见 styles/fonts.css。
           用 aria-hidden 以外的普通文本：它是给人看的，不是装饰。 -->
      <p class="boot-sign">{{ t('authorSign') }}</p>
    </div>
  </div>
</template>

<script setup>
// 启动 / 登录页：纯展示 + 事件上抛，凭据状态由父级持有
import { ref } from 'vue';
import { t } from './i18n.js';
import Icon from './Icon.vue';

defineProps({
  ic: { type: String, default: '' },
  password: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  progress: { type: String, default: '' },
});
defineEmits(['update:ic', 'update:password', 'submit']);

const revealPw = ref(false);
</script>
