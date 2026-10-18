/**
 * Promise 化的确认对话框。
 *
 * 为什么不用原生 `confirm()`：
 *   真机上是系统默认弹窗（灰底、方角、英文按钮），与手账风格完全割裂；
 *   而且原生 confirm 在 Android WebView 里会**暂停 JS 执行**，
 *   期间界面的 loading 状态是冻结的，用户会以为卡死。
 *
 * 用法：
 *   const { confirmState, ask, answer } = useConfirm();
 *   if (!await ask({ title: 'PDPR', message: '…', danger: true })) return;
 *
 * 组件侧渲染 <ConfirmSheet :state="confirmState" @answer="answer" />。
 */
import { ref } from 'vue';

export function useConfirm() {
  const confirmState = ref(null);
  let resolver = null;

  /**
   * @param {{title?: string, message: string, confirmText?: string,
   *          cancelText?: string, danger?: boolean}} opts
   * @returns {Promise<boolean>} true = 用户确认
   */
  function ask(opts) {
    // 已有对话框在等答复时，先把上一个当「取消」结掉，避免 Promise 悬挂
    if (resolver) { resolver(false); resolver = null; }

    return new Promise((resolve) => {
      resolver = resolve;
      confirmState.value = {
        title: opts.title || '',
        message: opts.message || '',
        confirmText: opts.confirmText || '',
        cancelText: opts.cancelText || '',
        danger: !!opts.danger,
      };
    });
  }

  function answer(ok) {
    const r = resolver;
    resolver = null;
    confirmState.value = null;
    if (r) r(ok);
  }

  return { confirmState, ask, answer };
}
