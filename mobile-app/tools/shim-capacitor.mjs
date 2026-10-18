/**
 * 桌面端验证专用 shim —— 不参与 App 构建。
 * 用法见 tools/README.md
 *
 * Android 上 CapacitorHttp 由 OkHttp 实现（自动跟随重定向 + 原生 CookieJar）。
 * Node 环境没有原生实现，这里用 fetch 提供等价语义，
 * 以便在桌面端执行 idmeService 的真实业务代码（登录 / 解析 / 报文组装）。
 */
import * as core from '../node_modules/@capacitor/core/dist/index.js';

export * from '../node_modules/@capacitor/core/dist/index.js';

const jars = {};
const originOf = (u) => { try { return new URL(u).origin; } catch { return u; } };

async function doRequest(method, options) {
  const { url, headers: h0 = {}, data } = options;
  const collected = [];
  let cur = url, m = method, body = data, extra = { ...h0 };

  for (let hop = 0; hop < 8; hop++) {
    const jar = (jars[originOf(cur)] ||= {});
    // 服务层自己维护的 Cookie 头合并进 jar
    if (extra.Cookie) {
      for (const p of String(extra.Cookie).split(';')) {
        const i = p.indexOf('=');
        if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
      }
    }
    const h = { ...extra };
    const ck = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (ck) h.Cookie = ck; else delete h.Cookie;

    const res = await fetch(cur, { method: m, headers: h, body: body ?? undefined, redirect: 'manual' });
    const text = await res.text();
    const setc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    collected.push(...setc);
    for (const it of setc) {
      const seg = String(it).split(';')[0];
      const i = seg.indexOf('=');
      if (i > 0) jar[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      cur = new URL(res.headers.get('location'), cur).href;
      m = 'GET'; body = undefined; extra = {};
      continue;
    }
    return { data: text, status: res.status, url: cur, headers: { 'set-cookie': collected } };
  }
  throw new Error('redirect loop');
}

export const CapacitorHttp = {
  get: (o) => doRequest('GET', o),
  post: (o) => doRequest('POST', o),
  request: (o) => doRequest(o.method || 'GET', o),
};

export const CapacitorCookies = core.CapacitorCookies;
export const Capacitor = core.Capacitor;
export const registerPlugin = core.registerPlugin;
export default core;
