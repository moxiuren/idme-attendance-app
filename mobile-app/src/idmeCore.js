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
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRY = 2;
/** 出勤类接口的 Accept：必须让 Laravel 判定为 JSON 请求，否则可能回 HTML */
const AJAX_ACCEPT = 'application/json, text/javascript, */*; q=0.01';

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
        const seg = p.trim().split(';')[0];
        const eq = seg.indexOf('=');
        if (eq > 0) {
          const k = seg.slice(0, eq).trim();
          const v = seg.slice(eq + 1).trim();
          if (k && v) jar[k] = v;
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

  cookieHeaderFor(url) {
    const jar = this.cookies[originOf(url)] || {};
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // --------------------------------------------------------------- Request

  async request(method, url, data = null, extraHeaders = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'Accept-Language': 'ms,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6',
      ...extraHeaders,
    };
    const cookieStr = this.cookieHeaderFor(url);
    if (cookieStr) headers['Cookie'] = cookieStr;

    const options = { url, headers, connectTimeout: REQUEST_TIMEOUT_MS, readTimeout: REQUEST_TIMEOUT_MS };

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

    let lastErr;
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        const resp = method === 'POST'
          ? await CapacitorHttp.post(options)
          : await CapacitorHttp.get(options);
        this.parseCookies(url, resp.headers);
        await this.syncNativeCookies(url);
        return resp;
      } catch (err) {
        lastErr = err;
        // 仅对网络层失败重试；应用层错误不重试
        if (attempt < MAX_RETRY) await sleep(400 * (attempt + 1));
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
   * 完整登录链路：CSRF → 验 IC → 密码 → SSO 直通 → 取出勤 token 与班级。
   * @param {string} ic 身份证号
   * @param {string} password 密码
   * @param {(step:string, descKey:string)=>void} onProgress
   *   第二个参数是 **i18n key**（如 'bootStep1'），不是成品文案。
   *   服务层不持有界面语言，翻译由调用方（App.vue）用 t() 完成 ——
   *   原先这里直接写中文，导致国文界面下登录进度仍显示中文。
   */
  async login(ic, password, onProgress = () => {}) {
    if (!ic || !password) {
      throw new IdMeError('请先填写身份证号与密码', 'CREDENTIAL_MISSING');
    }
    this.isLoggedIn = false;

    onProgress('1/4', 'bootStep1');
    const r1 = await this.request('GET', `${IDME_ORIGIN}/login`);
    const token1 = this.extractToken(r1.data);
    if (!token1) throw new IdMeError('未能从登录页提取 CSRF Token', 'TOKEN_MISSING');

    onProgress('2/4', 'bootStep2');
    const r2 = await this.request('POST', `${IDME_ORIGIN}/daftarawam/semakanverification`,
      { _token: token1, ic }, {
        Origin: IDME_ORIGIN,
        Referer: `${IDME_ORIGIN}/login`,
      });
    const body2 = typeof r2.data === 'string' ? r2.data : '';
    // 官方通过校验才返回表单页；无 form 即 IC 无效（与 NAS 版实现一致）
    if (!/<form/i.test(body2)) {
      // detail.alert 携带官方页面原文（马来文），供 i18n 层拼进用户文案；
      // message 仍是开发者向中文，两者不共用。
      throw new IdMeError(`身份证校验未通过${extractAlert(body2)}`, 'BAD_IC', false,
        { alert: extractAlert(body2) });
    }
    const token2 = this.extractToken(body2) || token1;

    onProgress('3/4', 'bootStep3');
    const r3 = await this.request('POST', `${IDME_ORIGIN}/login`,
      { _token: token2, check: '2', ic, password }, {
        Origin: IDME_ORIGIN,
        Referer: `${IDME_ORIGIN}/daftarawam/semakanverification`,
      });
    const body3 = typeof r3.data === 'string' ? r3.data : '';
    // 官方判定登录成功的方式是重定向到 /home；仅靠文本匹配会漏判
    // （实测：密码错时服务端 302 回 /login，正文并无 "tidak sah" 字样）
    const finalUrl = r3.url || '';
    const loggedIn = finalUrl
      ? (/\/home/.test(finalUrl) || !/\/login/.test(finalUrl))
      : !/Kata laluan tidak sah|tidak sepadan/i.test(body3);
    if (!loggedIn) {
      // 密码错时服务端 302 回 /login，正文通常不含 alert 块，故 detail.alert 可能为空 ——
      // 此时 i18n 模板的 {alert} 渲染成空串，整句仍是完整的（见 i18n.js errBadCred）。
      throw new IdMeError(`登录失败${extractAlert(body3) || '：身份证号或密码不正确'}`, 'BAD_CREDENTIAL',
        false, { alert: extractAlert(body3) });
    }

    // 第 4 步是整条登录链路里最慢的一段：三跳串行，且最后一跳
    // 要下载 195 KB 的出勤页（68 个 <script>，Laravel 服务端渲染）。
    // 每一步各报一次进度 —— 否则界面上只有一个静止的「4/4」，
    // 教师会以为卡死而反复点登录（那反而会触发 Imperva WAF 的速率判定）。
    onProgress('4/4', 'bootStep4a');
    const rApp = await this.request('GET', `${IDME_ORIGIN}/list_aplikasi`, null, {
      Referer: `${IDME_ORIGIN}/home`,
    });
    const ssoUrl = this.extractSsoUrl(typeof rApp.data === 'string' ? rApp.data : '');
    if (!ssoUrl) {
      throw new IdMeError('门户应用列表中未找到 Pengurusan Murid 入口', 'SSO_ENTRY_MISSING');
    }

    onProgress('4/4', 'bootStep4b');
    await this.request('GET', ssoUrl, null, { Referer: `${IDME_ORIGIN}/list_aplikasi` });

    onProgress('4/4', 'bootStep4c');
    const rTab = await this.request('GET', `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru`, null, {
      Referer: `${MOEIS_ORIGIN}/`,
    });
    const htmlTab = typeof rTab.data === 'string' ? rTab.data : '';
    this.moeisToken = this.extractToken(htmlTab);
    if (!this.moeisToken) {
      throw new IdMeError('未能从出勤页提取 CSRF Token', 'TOKEN_MISSING');
    }

    this._parseClasses(htmlTab);
    this._parseTeacherInfo(htmlTab);
    // 登录后必须能定位到班级，否则后续每次操作都会在 currentClass() 处失败，
    // 而那时的报错（「未获取到负责班级」）已经丢失了真正的上下文。
    // 在这里就分两种情形给出精确 code（见 _parseClasses 的注释）。
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
