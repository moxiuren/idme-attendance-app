/**
 * 自更新的状态编排（检查 / 下载 / 安装）。
 *
 * 状态机（单向、无回退箭头）：
 *   idle → checking → latest            （无更新，结束）
 *                   → available → downloading → downloaded → (调起安装器)
 *                   → error
 *   任意状态 → idle（用户关闭抽屉或重新检查）
 *
 * 为什么状态放 composable 而不是组件里：设置页的「检查更新」按钮与启动时的
 * 静默检查共用同一份状态。若状态在 UpdateSheet 内部，关闭抽屉再打开会重置，
 * 正在进行的下载进度就丢了 —— 而下载是几十秒的事，用户很可能中途切出去。
 */
import { ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import {
  fetchManifest, normalizeManifest, isNewer, resolveUrl, MANIFEST_URL,
} from '../updater.js';

// 延迟到调用时才 registerPlugin：Web 端（vite dev）没有这个原生实现，
// 提前注册会让整个模块在浏览器里炸掉。Capacitor 的 registerPlugin 是幂等的。
let plugin = null;
function native() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!plugin) plugin = Capacitor.registerPlugin('AppUpdater');
  return plugin;
}

export function useUpdater() {
  /** @type {import('vue').Ref<'idle'|'checking'|'latest'|'available'|'downloading'|'downloaded'|'error'>} */
  const state = ref('idle');
  const manifest = ref(null);
  const progress = ref({ percent: -1, received: 0, total: 0 });
  const errorKey = ref('');        // i18n key，不存已翻译的文本（切语言要跟着变）
  const localCode = ref(0);
  const localName = ref('');

  let progressHandle = null;

  /** 读当前安装包的版本。从 PackageManager 读，不信任 bundle 里的常量。 */
  async function readLocalVersion() {
    const p = native();
    if (!p) return null;
    try {
      const v = await p.getVersion();
      localCode.value = Number(v.versionCode) || 0;
      localName.value = String(v.versionName || '');
      return v;
    } catch {
      return null;
    }
  }

  /**
   * 检查更新。
   * @param {{silent?: boolean}} opts silent = 启动时的后台检查：
   *        失败不弹错、无更新不打扰，只有真的发现新版本才切到 available。
   * @returns {Promise<boolean>} 是否发现新版本
   */
  async function check({ silent = false } = {}) {
    if (state.value === 'downloading') return false;   // 下载中不重入

    state.value = 'checking';
    errorKey.value = '';

    try {
      if (!(await readLocalVersion())) {
        // 非原生环境（浏览器调试）：没有可比对的本地版本，直接静默结束
        state.value = silent ? 'idle' : 'error';
        if (!silent) errorKey.value = 'updOnlyOnDevice';
        return false;
      }

      const raw = await fetchManifest(MANIFEST_URL);
      const m = normalizeManifest(raw);
      if (!m) {
        state.value = silent ? 'idle' : 'error';
        if (!silent) errorKey.value = 'updBadManifest';
        return false;
      }

      // 清单里的 apk 可能是相对路径，按清单自身地址解析成绝对 URL
      m.apkUrl = resolveUrl(MANIFEST_URL, m.apk);

      if (!isNewer(m.versionCode, localCode.value)) {
        state.value = 'latest';
        manifest.value = m;      // 保留清单：设置页要显示「已是最新 v1.3」
        return false;
      }

      manifest.value = m;
      state.value = 'available';
      return true;
    } catch {
      // 静默检查的网络失败是常态（老师可能在没网的教学楼里），不打扰
      state.value = silent ? 'idle' : 'error';
      if (!silent) errorKey.value = 'updCheckFailed';
      return false;
    }
  }

  /** 下载 APK。进度通过原生事件回推，写入 progress。 */
  async function download() {
    const p = native();
    const m = manifest.value;
    if (!p || !m) return;

    state.value = 'downloading';
    progress.value = { percent: -1, received: 0, total: m.size || 0 };
    errorKey.value = '';

    // 先解绑上一次的监听，避免重复调用时同一事件被消费多次
    if (progressHandle) { await progressHandle.remove(); progressHandle = null; }
    progressHandle = await p.addListener('downloadProgress', (d) => {
      progress.value = {
        percent: Number(d.percent),
        received: Number(d.received) || 0,
        total: Number(d.total) || 0,
      };
    });

    try {
      await p.download({ url: m.apkUrl, sha256: m.sha256 });
      state.value = 'downloaded';
    } catch (e) {
      const msg = String(e?.message || '');
      // 取消不是错误，回到「有新版本」让用户重试
      if (msg.includes('已取消')) state.value = 'available';
      else { state.value = 'error'; errorKey.value = 'updDownloadFailed'; }
    } finally {
      if (progressHandle) { await progressHandle.remove(); progressHandle = null; }
    }
  }

  /** 取消下载 */
  async function cancel() {
    const p = native();
    if (!p) return;
    try { await p.cancelDownload(); } catch { /* 忽略 */ }
  }

  /**
   * 调起系统安装器。
   * 先查「安装未知应用」权限：未授予时系统会静默拦掉，用户看不到任何反应。
   * 返回 'needsPermission' 时由 UI 引导去设置页。
   * @returns {Promise<'launched'|'needsPermission'|'failed'>}
   */
  async function install() {
    const p = native();
    if (!p) return 'failed';
    try {
      const { granted } = await p.canInstall();
      if (!granted) return 'needsPermission';
      await p.install();
      return 'launched';
    } catch {
      return 'failed';
    }
  }

  /** 跳系统设置页授予安装权限 */
  async function openInstallSettings() {
    const p = native();
    if (!p) return;
    try { await p.openInstallSettings(); } catch { /* 忽略 */ }
  }

  /** 清理已下载的包并回到 idle */
  async function reset() {
    const p = native();
    if (p) { try { await p.clean(); } catch { /* 忽略 */ } }
    state.value = 'idle';
    progress.value = { percent: -1, received: 0, total: 0 };
    errorKey.value = '';
  }

  return {
    state, manifest, progress, errorKey, localCode, localName,
    check, download, cancel, install, openInstallSettings, reset,
  };
}
