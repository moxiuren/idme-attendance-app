/**
 * 应用内自更新：检查 → 下载 → 安装的编排层。
 *
 * 分三层，职责严格分开：
 *   1. 纯函数（isNewer / resolveUrl / normalizeManifest）—— 不依赖任何平台，
 *      可在 Node 里直接测。版本比较的坑全在这里，必须可测。
 *   2. 网络（fetchManifest）—— 只负责拉 JSON 并超时。
 *   3. 原生（AppUpdater 插件）—— 下载、校验 SHA-256、调起安装器。
 *
 * 为什么版本比较不用字符串：「1.10」和「1.9」按字符串比是 1.10 < 1.9，
 * 而 Android 只认 versionCode（整数）。清单里必须带 versionCode，
 * versionName 纯粹是给人看的。
 */

/** 清单地址。构建期可由 vite define 覆盖，未注入时回落到默认值。 */
export const MANIFEST_URL =
  typeof __UPDATE_MANIFEST_URL__ === 'string'
    ? __UPDATE_MANIFEST_URL__
    : 'https://moxiuren.github.io/idme-attendance-app/version.json';

/** 检查超时：启动时后台跑，不能让老师等。8 秒足够慢网拉一个几百字节的 JSON。 */
const FETCH_TIMEOUT_MS = 8000;

/**
 * 版本号 → 正整数，非法返回 NaN。
 *
 * 不能直接用 Number()：`Number(null)` 是 0、`Number('')` 是 0、
 * `Number(false)` 是 0 —— 而 0 是合法数值，会静默通过 isFinite 检查。
 * 结果是本地版本读不到时（null）被当成「0 版」，远端任何版本都比它新，
 * 于是每次启动都误报有更新。必须先挡掉这些「看起来像数字的假值」。
 */
function toVersion(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return NaN;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

/**
 * 远端版本是否比本地新。
 * 只比 versionCode —— 它才是 Android 判断「能否覆盖安装」的依据。
 * 非法输入一律返回 false（宁可漏报一次更新，也不误报让用户下载一个装不上的包）。
 */
export function isNewer(remoteCode, localCode) {
  const r = toVersion(remoteCode);
  const l = toVersion(localCode);
  if (!Number.isFinite(r) || !Number.isFinite(l)) return false;
  return r > l;
}

/**
 * 相对路径 → 绝对 URL。
 * 清单里的 apk 写成相对路径（如 `download/idMe-v1.4.apk`），
 * 这样换域名、换子目录都不用改清单内容。
 */
export function resolveUrl(base, rel) {
  if (!rel) return '';
  if (/^https?:\/\//i.test(rel)) return rel;
  try {
    return new URL(rel, base).toString();
  } catch {
    return '';
  }
}

/**
 * 校验并规范化清单。
 * 返回 null 表示清单不可用 —— 字段缺失、哈希格式不对、versionCode 非正数。
 *
 * sha256 必须严格 64 位十六进制：这是唯一的安全边界，宽松匹配等于没有校验。
 */
export function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // 草稿清单一律拒绝。
  // 仓库里的 version.json 在真正发布前是占位文件（sha256 全 0、size 0）。
  // 全 0 恰好是合法的 64 位十六进制，能通过下面的哈希格式校验 ——
  // 于是「误把占位文件部署上线」的表现是：所有老师看到更新提示，
  // 下载完成、哈希校验失败、提示下载失败。查起来要从发布端一路翻到客户端。
  // 用一个显式 draft 标记把它挡在源头，代价只是一个字段。
  if (raw.draft === true) return null;

  const versionCode = Number(raw.versionCode);
  if (!Number.isInteger(versionCode) || versionCode <= 0) return null;

  const sha = String(raw.sha256 || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;

  const apk = String(raw.apk || '').trim();
  if (!apk) return null;

  return {
    versionCode,
    versionName: String(raw.versionName || versionCode),
    apk,
    sha256: sha,
    size: Number(raw.size) || 0,
    notes: (raw.notes && typeof raw.notes === 'object') ? raw.notes : {},
    published: String(raw.published || ''),
  };
}

/** 按当前语言取更新说明；缺失时回落到马来文，再缺失返回空串。 */
export function noteFor(manifest, lang) {
  const n = manifest?.notes;
  if (!n) return '';
  return String(n[lang] || n.ms || '');
}

/** 拉清单，带超时。失败一律抛错，由调用方决定是否静默。 */
export async function fetchManifest(url = MANIFEST_URL) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // cache: 'no-store' —— 清单必须实时。GitHub Pages 的 CDN 会缓存 JSON，
    // 而这份文件恰恰是「有没有新版本」的唯一判据，读缓存等于永远看不到更新。
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
