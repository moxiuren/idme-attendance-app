/**
 * 草稿契约测试的打包入口。
 *
 * 为什么需要单独一个 entry：
 *   `src/draft.js` 直接 import `@capacitor/preferences`，而真实插件在 Node 下
 *   会走到 `PreferencesWeb.impl` → `window.localStorage`，没有 window 就崩。
 *   走 esbuild 打包并把该模块 alias 到 `tools/shim-preferences.mjs`，
 *   既绕开原生桥，又保证测试跑的是**与 App 完全相同的 draft.js 源码**。
 */
export { Preferences } from '@capacitor/preferences';
export {
  snapshotOf, saveDraft, loadDraft, clearDraft, applyDraft,
} from '../src/draft.js';
