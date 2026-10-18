<template>
  <div v-if="open" class="sheet-mask" @click.self="onClose">
    <div class="sheet sheet-sm">
      <div class="sheet-head">
        <div>
          <div class="sheet-title">{{ t('updCheck') }}</div>
          <!-- 当前版本：教师报问题时本来就要报这一行，放在标题下最省事 -->
          <div class="sheet-sub">{{ t('updCurrent', { v: localName || ver }) }}</div>
        </div>
        <button class="sheet-close"
                :aria-label="t('updClose')" :title="t('updClose')"
                @click="onClose">
          <Icon name="close" :size="19" />
        </button>
      </div>

      <!-- ============ 检查中 ============ -->
      <div v-if="state === 'checking'" class="upd-body">
        <p class="upd-line upd-dim">{{ t('updChecking') }}</p>
      </div>

      <!-- ============ 已是最新 ============ -->
      <div v-else-if="state === 'latest'" class="upd-body">
        <p class="upd-line upd-ok">
          <Icon name="check" :size="17" class="upd-ic" />{{ t('updLatest', { v: manifest?.versionName || ver }) }}
        </p>
      </div>

      <!-- ============ 有新版本 / 下载中 / 已下载 ============ -->
      <div v-else-if="state === 'available' || state === 'downloading' || state === 'downloaded'"
           class="upd-body">
        <p class="upd-line upd-strong">{{ t('updAvailable', { v: manifest?.versionName }) }}</p>

        <!-- 更新说明：只显示当前语言的段落，缺了就退回马来文（见 noteFor） -->
        <div v-if="notes" class="upd-notes">
          <div class="upd-notes-h">{{ t('updNotes') }}</div>
          <p class="upd-notes-b">{{ notes }}</p>
        </div>

        <!-- 进度条：只在下载中出现。
             服务器未给 Content-Length 时 percent = -1，此时改用不确定态
             （宽度固定 35% 循环滑动），而不是显示一个假的 0%。 -->
        <div v-if="state === 'downloading'" class="upd-prog-wrap">
          <div class="upd-prog" :class="{ 'upd-prog-na': progress.percent < 0 }">
            <div class="upd-prog-fill"
                 :style="progress.percent >= 0 ? { width: progress.percent + '%' } : null"></div>
          </div>
          <div class="upd-prog-txt">
            {{ progress.percent >= 0
                ? t('updDownloading', { p: progress.percent })
                : t('updDownloadingNa') }}
            <span v-if="progress.total > 0" class="upd-prog-size">
              {{ mb(progress.received) }} / {{ mb(progress.total) }}
            </span>
          </div>
        </div>

        <p v-else-if="state === 'downloaded'" class="upd-line upd-ok">
          <Icon name="check" :size="17" class="upd-ic" />{{ t('updDownloaded') }}
        </p>

        <!-- 安全说明：让教师知道包体是核对过的，而不是「随便下个东西装上去」 -->
        <p class="upd-sha">{{ t('updShaNote') }}</p>
      </div>

      <!-- ============ 错误 ============ -->
      <div v-else-if="state === 'error'" class="upd-body">
        <p class="upd-line upd-err">
          <Icon name="alert" :size="17" class="upd-ic" />{{ t(errorKey || 'updCheckFailed') }}
        </p>
      </div>

      <!-- ============ 权限引导 ============ -->
      <div v-if="needPerm" class="upd-perm">{{ t('updNeedPermission') }}</div>

      <!-- ============ 动作区 ============ -->
      <div class="sheet-foot sheet-foot-col">
        <button v-if="state === 'available'" class="btn btn-primary btn-block"
                @click="$emit('download')">{{ t('updDownload') }}</button>

        <button v-else-if="state === 'downloading'" class="btn btn-ghost btn-block"
                @click="$emit('cancel')">{{ t('updCancel') }}</button>

        <template v-else-if="state === 'downloaded'">
          <button v-if="needPerm" class="btn btn-amber btn-block"
                  @click="$emit('open-settings')">{{ t('updOpenSettings') }}</button>
          <!-- 调起安装器是毫秒级的，但连点会重复起 Activity（系统会拒第二个）。
               禁用 + 换文案是这段时间里唯一能让用户看出「点到了」的反馈。 -->
          <button class="btn btn-primary btn-block" :disabled="installing"
                  @click="$emit('install')">
            {{ installing ? t('updInstalling') : t('updInstall') }}
          </button>
        </template>

        <button v-else-if="state === 'error' || state === 'latest'" class="btn btn-ghost btn-block"
                @click="$emit('recheck')">{{ t('updRetry') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 更新抽屉：纯展示 + 事件上抛。
 *
 * 状态全部由 useUpdater 持有（见 composables/useUpdater.js）——
 * 组件本身不存任何状态，这样关掉抽屉再打开，正在进行的下载进度不会丢。
 * 下载是几十秒的事，用户很可能中途去看别的界面。
 */
import { computed } from 'vue';
import { t, lang } from './i18n.js';
import { noteFor } from './updater.js';
import Icon from './Icon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  state: { type: String, default: 'idle' },
  manifest: { type: Object, default: null },
  progress: { type: Object, default: () => ({ percent: -1, received: 0, total: 0 }) },
  errorKey: { type: String, default: '' },
  localName: { type: String, default: '' },
  needPerm: { type: Boolean, default: false },
  installing: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'download', 'cancel', 'install', 'open-settings', 'recheck']);

// 构建期常量；用 typeof 保护，契约测试单独打包时不会注入（同 SettingsSheet）
const ver = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// lang 是 ref，模板里读 t() 已经会随语言变化重渲染；
// 但 noteFor 是纯函数，必须显式依赖 lang.value 才能触发重算
const notes = computed(() => noteFor(props.manifest, lang.value));

/** 字节 → MB，保留一位小数。下载量级是 3~4MB，用 MB 比 KB 直观 */
function mb(n) {
  const v = Number(n) || 0;
  return (v / 1048576).toFixed(1) + ' MB';
}

/** 下载中直接关抽屉会让人以为下载停了 —— 只允许在非下载态关闭 */
function onClose() {
  if (props.state === 'downloading') return;
  emit('close');
}
</script>
