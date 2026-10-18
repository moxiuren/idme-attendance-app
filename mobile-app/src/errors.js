/**
 * 错误码 → 面向教师的文案（i18n）
 *
 * 为什么单独一个文件：
 *   服务层（idmeCore / idmeAttendance / idmeReport）只负责抛 code + 结构化 detail，
 *   面向教师的文案一律在这里按当前语言组装。这样默认马来文的界面上
 *   不会出现「Gagal log masuk: 登录失败：身份证号或密码不正确」这种中英混杂。
 *
 * 依赖方向（无环）：
 *   errors.js ──> i18n.js   （i18n 只依赖 vue / @capacitor/preferences）
 *            └──> idmeCore.js（只依赖 @capacitor/core）
 *   utils.js 不再依赖 idmeCore，原先放在那里的 errText 已迁到本文件。
 *
 * ★ 新增错误码时必须同步 ERR_KEYS，否则会静默回落到 errUnknown。
 *   tools/i18n-audit.mjs 会扫描本文件 ERR_KEYS 的**字面量**值，确认对应 key
 *   在 ms / zh 两份字典里都存在 —— 所以 key 不能写成动态拼接
 *   （如 `err${code}`），那样审计脚本看不见，缺词条也发现不了。
 *
 * 注：SAFETY_BLOCK 故意不在此表 —— 它不是普通错误，而是「需要用户二次确认」
 *   的业务分支，由 composables/useAttendance.js 按 detail 单独组装文案
 *   （见 i18n.js 的 safetyBlock）。若它真的走到 errText()，说明那条分支被绕过了，
 *   此时回落到 errUnknown 反而是正确的：宁可说「未知错误」，也不假装成普通失败。
 */

import { t } from './i18n.js';
import { IdMeError } from './idmeCore.js';

export const ERR_KEYS = {
  CREDENTIAL_MISSING: 'errCredMissing',
  TOKEN_MISSING: 'errTokenMissing',
  BAD_IC: 'errBadIc',
  BAD_CREDENTIAL: 'errBadCred',
  SSO_ENTRY_MISSING: 'errSsoMissing',
  NOT_LOGGED_IN: 'errNotLoggedIn',
  NO_CLASS: 'errNoClass',
  SESSION_LOST: 'errSessionLost',
  PARSE_ERROR: 'errParse',
  NETWORK: 'errNetwork',
};

/** 未登记错误码的兜底文案 key */
export const ERR_FALLBACK = 'errUnknown';

/** @param {string} code IdMeError.code @returns {string} i18n key */
export function errorKey(code) {
  return ERR_KEYS[code] || ERR_FALLBACK;
}

/**
 * 哪些错误码的 detail.alert（官方页面原文）值得展示给教师。
 *
 * 官方 alert 是马来文原文（如 "Kata laluan tidak sah"），对教师有用；
 * 而 NETWORK 的底层信息是英文技术描述（如 "Failed to fetch"），
 * 展示出来只会增加困惑，故不带。
 */
export const ALERT_CODES = ['BAD_IC', 'BAD_CREDENTIAL'];

/**
 * 取官方 alert 原文，剥掉 extractAlert() 自带的「：」前缀。
 *
 * extractAlert 返回形如 `：Kata laluan tidak sah`，前缀是为了拼进
 * 旧版的中文句子（`登录失败${extractAlert(...)}`）。现在改由 i18n 模板
 * 在 {alert} 处显式加分隔，若不去前缀会渲染成 `Gagal daftar masuk.：Kata laluan tidak sah`。
 *
 * 非空时补一个前导空格，这样模板写成 `'...daftar masuk.{alert}'` 即可自然分隔，
 * 不必在两种语言里各写一遍分隔符；为空时返回空串，句子仍完整。
 */
function alertOf(err) {
  if (!ALERT_CODES.includes(err.code)) return '';
  const raw = err.detail?.alert;
  if (!raw) return '';
  const cleaned = String(raw).replace(/^[\s：:]+/, '').trim();
  return cleaned ? ` ${cleaned}` : '';
}

/**
 * 统一错误文案：返回**完整原因句**（已按当前语言渲染）。
 *
 * 调用方既可以直接展示它（如登录页 bootError），
 * 也可以嵌进外层模板：`t('syncFail', { msg: errText(err) })`。
 *
 * 非 IdMeError（如原生插件抛的异常）取其 message —— 这类信息是英文技术描述，
 * 没有可翻译的语义，硬套马来文模板反而误导，故原样保留。
 */
export function errText(err) {
  if (!(err instanceof IdMeError)) {
    return String(err?.message || err);
  }
  return t(errorKey(err.code), { alert: alertOf(err) });
}
