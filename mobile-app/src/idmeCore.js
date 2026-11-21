/**
 * idMe / MOEIS 出勤服务层
 *
 * 契约依据：C:\Users\Admin\Documents\Projects\idme-reverse-2026\API-SPEC.md
 * 重写要点（相对旧版）：
 *   1. 清除全部硬编码凭据 / 教师名 / 校名 / 班级 fallback
 *   2. Cookie 按域隔离（idme.moe.gov.my 与 moeispel.moe.gov.my 各自独立）
 *   3. 请求级重试 + 会话自愈（401/失效自动重登并重放）
 *   4. 假因改为运行时动态拉取 + 本地字典兜底
 *   5. 消除 "30 - absent.length" 之类的假数据兜底
 */

import { Capacitor, CapacitorHttp, CapacitorCookies, registerPlugin } from '@capacitor/core';

const PdfGenerator = registerPlugin('PdfGenerator');

const IDME_ORIGIN = 'https://idme.moe.gov.my';
const MOEIS_ORIGIN = 'https://moeispel.moe.gov.my';
const REQUEST_TIMEOUT_MS = 12000;
const RESUME_TIMEOUT_MS = 10000;
const MAX_RETRY = 1;
/** 出勤类接口的 Accept：必须让 Laravel 判定为 JSON 请求，否则可能回 HTML */
const AJAX_ACCEPT = 'application/json, text/javascript, */*; q=0.01';

/**
 * 识别 Imperva / Incapsula WAF 拦截或 JS 挑战页。
 * 注意：官网正常页面底部也会挂载 `/_Incapsula_Resource?SWJIYLWA=...` 探针脚本，
 * 绝不能只凭 `_Incapsula_Resource` 误判 —— 必须命中明确拦截文案，
 * 或是「含 _Incapsula_Resource 且极短(<4KB)且无业务特征(_token/moeispel)」的纯挑战页。
 */
function isWafBlock(html) {
  if (!html || typeof html !== 'string') return false;
  if (/Incapsula incident ID|Request unsuccessful\./i.test(html)) return true;
  if (/_Incapsula_Resource/i.test(html) && html.length < 4000
      && !/name=["']_token["']|moeispel/i.test(html)) {
    return true;
  }
  return false;
}

/** 从 HTML 中提取官方 alert 提示文本 */
function extractAlert(html) {
  if (!html || typeof html !== 'string') return '';
  const m = html.match(/class=["'][^"']*alert[^"']*["'][^>]*>([\s\S]{0,200}?)</i);
  if (!m) return '';
  const txt = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return txt ? `：${txt}` : '';
}

/**
 * 带分类的错误，便于上层区分「凭据错」与「网络错」。
 *
 * message 是**开发者向**的说明（中文），不要直接展示给用户 ——
 * 面向用户的文案由 i18n 层按 code + detail 组装（见 composables/useAttendance.js）。
 */
export class IdMeError extends Error {
  constructor(message, code = 'UNKNOWN', retryable = false, detail = null) {
    super(message);
    this.name = 'IdMeError';
    this.code = code;
    this.retryable = retryable;
    this.detail = detail;   // 结构化上下文，供 i18n 组装用户文案
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const originOf = url => {
  try { return new URL(url).origin; } catch { return url; }
};

class IdMeService {
  constructor() {
    this.cookies = {};          // { origin: { k: v } }
    this.moeisToken = '';
    this.classes = [];
    this.currentClassIdx = 0;
    this.teacherName = '';
    this.schoolName = '';
    this.isLoggedIn = false;
    this._loginLock = null;     // 防止并发重复登录
  }

  // ---------------------------------------------------------------- Cookie

  _jar(url) {
    const o = originOf(url);
    if (!this.cookies[o]) this.cookies[o] = {};
    return this.cookies[o];
  }

  parseCookies(url, headers) {
    if (!headers) return;
    let list = [];
    if (typeof headers.getSetCookie === 'function') {
      list = headers.getSetCookie();
    } else {
      const raw = headers['Set-Cookie'] || headers['set-cookie'];
      if (raw) list = Array.isArray(raw) ? raw : [raw];
    }
    const jar = this._jar(url);
    for (const item of list) {
      // 一个 Set-Cookie 头可能含多个 cookie，按 ,名字= 切分
      for (const p of String(item).split(/,(?=[A-Za-z0-9_-]+=)/)) {
        const parts = p.trim().split(';');
        const seg = parts[0];
        const eq = seg.indexOf('=');
        if (eq > 0) {
          const k = seg.slice(0, eq).trim();
          const v = seg.slice(eq + 1).trim();
          if (k && v) {
            const isShared = parts.slice(1).some(a => /domain\s*=\s*\.?moe\.gov\.my/i.test(a));
            if (isShared) {
              if (!this.cookies['.moe.gov.my']) this.cookies['.moe.gov.my'] = {};
              this.cookies['.moe.gov.my'][k] = v;
            }
            jar[k] = v;
          }
        }
      }
    }
  }

  /** 把原生 WebView 的 cookie 同步进内存 jar（原生侧自动持久化） */
  async syncNativeCookies(url) {
    try {
      if (Capacitor.isNativePlatform() && CapacitorCookies) {
        const res = await CapacitorCookies.getCookies({ url });
        const jar = this._jar(url);
        for (const [k, v] of Object.entries(res || {})) {
          if (k && typeof v === 'string') jar[k] = v;
        }
      }
    } catch { /* 非致命 */ }
  }

  /** 清空内存与原生 Cookie，防止旧会话/WAF 残留引发双轨冲突与 419 */
  async _clearCookies() {
    this.cookies = {};
    try {
      if (Capacitor.isNativePlatform() && CapacitorCookies?.clearAllCookies) {
        await CapacitorCookies.clearAllCookies();
      }
    } catch { /* 非致命 */ }
  }

  cookieHeaderFor(url) {
    const o = originOf(url);
    const merged = {};
    // 兼容 .moe.gov.my 跨子域 Cookie（如 Imperva WAF 与负载均衡粘性 Cookie）
    if (o.endsWith('.moe.gov.my')) {
      Object.assign(merged, this.cookies['.moe.gov.my'] || {});
    }
    Object.assign(merged, this.cookies[o] || {});
    return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** 检查官方网关级异常（Imperva WAF 拦截 / 419 / 5xx） */
  _checkGatewayError(resp) {
    if (!resp) return;
    const body = typeof resp.data === 'string' ? resp.data : '';
    if (isWafBlock(body)) {
      throw new IdMeError('触发官方安全防火墙拦截，请稍候片刻再试', 'WAF_BLOCKED', true);
    }
    if (resp.status === 419) {
      throw new IdMeError('会话令牌已过期，请重试登录', 'SESSION_LOST', true);
    }
    if (resp.status >= 500) {
      throw new IdMeError(`官方服务器暂时繁忙（HTTP ${resp.status}）`, 'SERVER_BUSY', true);
    }
  }

  // --------------------------------------------------------------- Request

  async request(method, url, data = null, extraHeaders = {}, opts = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'Accept-Language': 'ms,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6',
      ...extraHeaders,
    };
    // 原生端启用 CapacitorHttp 时由 Android CookieManager 自动收发 Cookie；
    // 手动再拼 headers['Cookie'] 会导致同名 Cookie 重复发送并触发 419，故仅非原生端手动注入。
    if (!Capacitor.isNativePlatform()) {
      const cookieStr = this.cookieHeaderFor(url);
      if (cookieStr) headers['Cookie'] = cookieStr;
    }

    const timeout = opts.timeoutMs || REQUEST_TIMEOUT_MS;
    const options = { url, headers, connectTimeout: timeout, readTimeout: timeout };

    if (method === 'POST') {
      if (typeof data === 'string') {
        options.data = data;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (data && typeof data === 'object') {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(data)) p.append(k, v);
        options.data = p.toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    // 仅幂等 GET 默认重试；POST 不自动重试，避免消耗 CSRF token 后重发触发 419 误报密码错
    const maxRetry = opts.retry ?? (method === 'GET' ? MAX_RETRY : 0);
    let lastErr;
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
      try {
        const resp = method === 'POST'
          ? await CapacitorHttp.post(options)
          : await CapacitorHttp.get(options);
        if (!Capacitor.isNativePlatform()) {
          this.parseCookies(url, resp.headers);
        }
        return resp;
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetry) await sleep(400 * (attempt + 1));
      }
    }
    throw new IdMeError(`网络请求失败：${lastErr?.message || lastErr}`, 'NETWORK', true);
  }

  /** 从 HTML 中提取 Laravel CSRF token（兼容三种属性顺序） */
  extractToken(html) {
    if (!html || typeof html !== 'string') return null;
    const m1 = html.match(/name=["']_token["'][^>]*?value=["']([^"']+)["']/i);
    if (m1) return m1[1];
    const m2 = html.match(/value=["']([^"']+)["'][^>]*?name=["']_token["']/i);
    if (m2) return m2[1];
    const tag = html.match(/<input[^>]*?name=["']_token["'][^>]*>/i);
    if (tag) {
      const mv = tag[0].match(/value=["']([^"']+)["']/i);
      if (mv) return mv[1];
    }
    return null;
  }

  /**
   * 从门户应用列表页解析 MOEIS SSO 入口。
   * 兼容多种形态：裸域+query / 带路径 / JS 跳转 / 多入口。
   */
  extractSsoUrl(html) {
    if (!html || typeof html !== 'string') return null;
    const urls = (html.match(/https?:\/\/moeispel\.moe\.gov\.my[^"'\s<>]*/gi) || [])
      .map(u => u.replace(/&amp;/g, '&'));
    if (!urls.length) return null;
    const scored = urls.map(u => {
      const around = html.slice(Math.max(0, html.indexOf(u) - 300), html.indexOf(u) + 300).toUpperCase();
      let score = 0;
      if (around.includes('MURID') || around.includes('PENGURUSAN')) score += 2;
      if (u.includes('token_idms')) score += 1;
      return { u, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0].u;
  }

  // ------------------------------------------------------------ Auth (4 步)

  /**
   * 冷启动会话复用探测（秒进机制）：
   * 若原生 CookieManager 中的 MOEIS 会话尚未过期，直接一次 GET 拿到 token 与班级，
   * 跳过 5 步串行 SSO 握手；任何异常静默返回 false，交由完整 login() 兜底。
   */
  async tryResumeSession(onProgress = () => {}) {
    try {
      onProgress('', 'bootResume');
      const rTab = await this.request('GET', `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru`, null, {
        Referer: `${MOEIS_ORIGIN}/`,
      }, { retry: 0, timeoutMs: RESUME_TIMEOUT_MS });
      if (!rTab || rTab.status !== 200) return false;
      const htmlTab = typeof rTab.data === 'string' ? rTab.data : '';
      if (isWafBlock(htmlTab)) return false;
      const token = this.extractToken(htmlTab);
      if (!token) return false;
      this._parseClasses(htmlTab);
      if (!this.classes.length) return false;
      this.moeisToken = token;
      this._parseTeacherInfo(htmlTab);
      this.isLoggedIn = true;
      this.refreshSebab().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 完整登录链路：清场 → CSRF → 验 IC → 密码 → SSO 直通 → 取出勤 token 与班级。
   * 统一由 _loginLock 互斥保护，防止界面手动登录与后台会话自愈并发覆盖。
   */
  async login(ic, password, onProgress = () => {}) {
    if (!ic || !password) {
      throw new IdMeError('请先填写身份证号与密码', 'CREDENTIAL_MISSING');
    }
    if (!this._loginLock) {
      this._loginLock = this._doLogin(ic, password, onProgress).finally(() => {
        this._loginLock = null;
      });
    }
    return this._loginLock;
  }

  async _doLogin(ic, password, onProgress = () => {}) {
    this.isLoggedIn = false;
    await this._clearCookies();

    onProgress('1/4', 'bootStep1');
    const r1 = await this.request('GET', `${IDME_ORIGIN}/login`);
    this._checkGatewayError(r1);
    const token1 = this.extractToken(r1.data);
    if (!token1) throw new IdMeError('未能从登录页提取 CSRF Token', 'TOKEN_MISSING');

    onProgress('2/4', 'bootStep2');
    const r2 = await this.request('POST', `${IDME_ORIGIN}/daftarawam/semakanverification`,
      { _token: token1, ic }, {
        Origin: IDME_ORIGIN,
        Referer: `${IDME_ORIGIN}/login`,
      }, { retry: 0 });
    this._checkGatewayError(r2);
    const body2 = typeof r2.data === 'string' ? r2.data : '';
    // 官方通过校验才返回表单页；无 form 即 IC 无效（与 NAS 版实现一致）
    if (!/<form/i.test(body2)) {
      throw new IdMeError(`身份证校验未通过${extractAlert(body2)}`, 'BAD_IC', false,
        { alert: extractAlert(body2) });
    }
    const token2 = this.extractToken(body2) || token1;

    onProgress('3/4', 'bootStep3');
    const r3 = await this.request('POST', `${IDME_ORIGIN}/login`,
      { _token: token2, check: '2', ic, password }, {
        Origin: IDME_ORIGIN,
        Referer: `${IDME_ORIGIN}/daftarawam/semakanverification`,
      }, { retry: 0 });
    this._checkGatewayError(r3);
    const body3 = typeof r3.data === 'string' ? r3.data : '';
    // 官方判定登录成功的方式是重定向到 /home；仅靠文本匹配会漏判
    const finalUrl = r3.url || '';
    const loggedIn = finalUrl
      ? (/\/home/.test(finalUrl) || !/\/login/.test(finalUrl))
      : !/Kata laluan tidak sah|tidak sepadan/i.test(body3);
    if (!loggedIn) {
      throw new IdMeError(`登录失败${extractAlert(body3) || '：身份证号或密码不正确'}`, 'BAD_CREDENTIAL',
        false, { alert: extractAlert(body3) });
    }

    onProgress('4/4', 'bootStep4a');
    const rApp = await this.request('GET', `${IDME_ORIGIN}/list_aplikasi`, null, {
      Referer: `${IDME_ORIGIN}/home`,
    });
    this._checkGatewayError(rApp);
    const ssoUrl = this.extractSsoUrl(typeof rApp.data === 'string' ? rApp.data : '');
    if (!ssoUrl) {
      throw new IdMeError('门户应用列表中未找到 Pengurusan Murid 入口', 'SSO_ENTRY_MISSING');
    }

    onProgress('4/4', 'bootStep4b');
    const rSso = await this.request('GET', ssoUrl, null, { Referer: `${IDME_ORIGIN}/list_aplikasi` });
    this._checkGatewayError(rSso);

    onProgress('4/4', 'bootStep4c');
    const rTab = await this.request('GET', `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru`, null, {
      Referer: `${MOEIS_ORIGIN}/`,
    });
    this._checkGatewayError(rTab);
    const htmlTab = typeof rTab.data === 'string' ? rTab.data : '';
    this.moeisToken = this.extractToken(htmlTab);
    if (!this.moeisToken) {
      throw new IdMeError('未能从出勤页提取 CSRF Token', 'TOKEN_MISSING');
    }

    this._parseClasses(htmlTab);
    this._parseTeacherInfo(htmlTab);
    if (!this.classes.length) {
      throw new IdMeError(
        this._classParseState === 'no-select'
          ? '出勤页中未找到班级下拉框（页面结构可能与预期不符）'
          : '账号下没有负责班级',
        this._classParseState === 'no-select' ? 'PARSE_ERROR' : 'NO_CLASS',
      );
    }
    this.isLoggedIn = true;

    // 后台尝试拉取服务端最新假因（失败静默，保留本地字典）
    this.refreshSebab().catch(() => {});

    return { success: true, classes: this.classes, currentClass: this.currentClass() };
  }

  _parseClasses(html) {
    // 重新登录可能是另一个账号/另一批班级，旧的月度报表缓存一律作废
    this._clearReportCache?.();
    this.classes = [];
    this._classParseState = 'ok';   // ok | no-select | empty

    // 官方页面用 <select id="txtNamakelas"> 承载班级列表。
    // 实测（2026-10-16，单班级账号 TAHUN SATU B）该 select 存在且仅一个有效 option。
    //
    // ★ 必须区分两种「拿不到班级」：
    //   ① select 元素根本不存在 → 页面结构与预期不符（官方改版 / 会话异常），
    //      属**解析失败**，报 PARSE_ERROR 才能让教师知道该反馈而不是自查账号；
    //   ② select 存在但没有有效 option → 账号确实没有负责班级，报 NO_CLASS。
    //   旧版把两者混为「未获取到负责班级」，教师会以为是自己账号的问题。
    const sel = html.match(/<select[^>]*id=["']txtNamakelas["'][^>]*>([\s\S]*?)<\/select>/i);
    if (!sel) { this._classParseState = 'no-select'; return; }
    const re = /<option\s+value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let m;
    while ((m = re.exec(sel[1])) !== null) {
      const val = m[1].trim();
      const txt = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (val && txt && !/pilih/i.test(txt)) this.classes.push({ id: val, name: txt });
    }
    if (!this.classes.length) this._classParseState = 'empty';
    if (this.currentClassIdx >= this.classes.length) this.currentClassIdx = 0;
  }

  _parseTeacherInfo(html) {
    // 教师名/校名从页面结构化位置提取，取不到就留空（不再硬编码）
    const nameM = html.match(/GURU[^<]{0,20}[:：]\s*<\/?[^>]*>?\s*([A-Z][A-Z\s@.'/]{3,60})/i)
      || html.match(/Nama\s*Guru[^A-Z]{0,30}([A-Z][A-Z\s@.'/]{3,60})/i);
    if (nameM) this.teacherName = nameM[1].trim();
    const schM = html.match(/(SJ[KC]\([^)]+\)[^<]{0,60})/i) || html.match(/(SEKOLAH[^<]{3,60})/i);
    if (schM) this.schoolName = schM[1].trim();
  }

  currentClass() {
    return this.classes[this.currentClassIdx] || null;
  }

  switchClass(idx) {
    if (idx >= 0 && idx < this.classes.length) {
      this.currentClassIdx = idx;
      this._clearReportCache?.();   // 换班级后月度报表数据完全不同，缓存必须清空
      return this.currentClass();
    }
    return null;
  }

  /** 会话自愈：未登录或被踢出时静默重登 */
  async ensureSession(ic, password) {
    if (this.isLoggedIn && this.moeisToken) return true;
    if (!this._loginLock) {
      this._loginLock = this.login(ic, password).finally(() => { this._loginLock = null; });
    }
    await this._loginLock;
    return true;
  }

  /** 判断响应是否表示会话失效 */
  _isSessionLost(resp) {
    if (!resp) return true;
    const code = resp.status;
    if (code === 401 || code === 419 || code === 302) return true;
    const d = typeof resp.data === 'string' ? resp.data : '';
    if (code === 200 && /name=["']_token["']/i.test(d) && !/kehadiran/i.test(d)) return true;
    return false;
  }

}

export {
  AJAX_ACCEPT,
  IDME_ORIGIN,
  MOEIS_ORIGIN,
  REQUEST_TIMEOUT_MS,
  MAX_RETRY,
  PdfGenerator,
  IdMeService,
};
