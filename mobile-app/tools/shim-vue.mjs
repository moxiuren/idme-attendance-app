/**
 * Vue 最小垫片 —— 仅供 Node 下的契约测试使用（**不参与 App 构建**）。
 *
 * 为什么不用真的 vue：
 *   1. esbuild 打 `vue` 的 esm-bundler 产物会带出 __VUE_OPTIONS_API__ 等
 *      编译期标志，需要额外 define，徒增不确定性；
 *   2. 契约测试只关心「确认后是否真的调用了写接口」，不需要响应式系统。
 * 本文件只实现 composable 实际用到的 ref / computed / watch。
 */

export function ref(initial) {
  let v = initial;
  return {
    get value() { return v; },
    set value(next) { v = next; },
  };
}

export function computed(fn) {
  return {
    get value() { return fn(); },
  };
}

/**
 * watch 的最小实现。
 *
 * 真实的 Vue 会在依赖变化时自动触发；这里没有依赖追踪，所以回调**不会自动跑**。
 * 对于契约测试这没问题 —— 测试直接调用被测函数（如 flushDraft），
 * 不依赖响应式调度。但为了能断言「草稿确实会落盘」，
 * 这里把注册的 watcher 记到 `__watchers`，测试可手动 `__trigger()`。
 *
 * 返回的停止函数与 Vue 语义一致（调用后该 watcher 不再响应 trigger）。
 */
export const __watchers = [];

export function watch(source, cb) {
  const w = { source, cb, active: true };
  __watchers.push(w);
  return () => { w.active = false; };
}

/** 测试辅助：手动触发所有活跃 watcher（模拟一次状态变化） */
export function __trigger() {
  for (const w of __watchers) if (w.active) w.cb(undefined, undefined);
}
