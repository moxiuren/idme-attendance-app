/**
 * @capacitor/preferences 最小垫片 —— 仅供 Node 下的契约测试使用（**不参与 App 构建**）。
 *
 * i18n.js 会 import Preferences 来持久化语言偏好。
 * 契约测试跑在 Node 里，既没有原生存储也不需要持久化，
 * 这里给一个「永远读不到值、写入丢弃」的内存实现即可，
 * 避免把真实的 Capacitor 插件打进 bundle（其注册过程依赖原生桥）。
 */

const store = new Map();

export const Preferences = {
  async get({ key }) {
    return { value: store.has(key) ? store.get(key) : null };
  },
  async set({ key, value }) {
    store.set(key, value);
  },
  async remove({ key }) {
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
  async keys() {
    return { keys: [...store.keys()] };
  },
};

export default { Preferences };
