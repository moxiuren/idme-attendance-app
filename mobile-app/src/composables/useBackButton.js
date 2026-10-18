/**
 * 系统返回键分层消费。
 *
 * 真机实测（2026-10-16，vivo V2324HA / Android 16）：旧版未接管 backButton，
 * 抽屉打开时按返回键会**直接退出到桌面**（topResumedActivity 变成 launcher），
 * 已填好的整班出勤全部丢失。
 *
 * 做法：按「由内到外」的顺序传一组层，谁开着就先关谁；全关完才真正退出。
 */
import { onMounted, onUnmounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

/**
 * @param {Array<{isOpen: () => boolean, close: () => void}>} layers 由内到外排列
 * @param {() => void} onExit 全部层关闭后执行（真正退出 App）
 * @returns {{ handleBack: () => void }}
 */
export function useBackButton(layers, onExit) {
  function handleBack() {
    for (const layer of layers) {
      if (layer.isOpen()) { layer.close(); return; }
    }
    onExit();
  }

  let listener = null;

  onMounted(async () => {
    if (!Capacitor.isNativePlatform()) return;   // 浏览器调试保留默认行为
    listener = await CapApp.addListener('backButton', handleBack);
  });

  onUnmounted(async () => {
    if (listener) { await listener.remove(); listener = null; }
  });

  return { handleBack };
}
