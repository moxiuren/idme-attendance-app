// idMe 假因与月度报表模块
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { mergeRemote } from './sebab.js';
import { parseMonthlyReport } from './monthReport.js';
import { MOEIS_ORIGIN, AJAX_ACCEPT, PdfGenerator } from './idmeCore.js';

// ---------------------------------------------------------------- 月度报表缓存
/**
 * 官方月度报表页面约 350KB，是切月时的主要耗时来源；而导出 PDF 还会
 * **再下载同一个页面**一次。故缓存两层：
 *   _parsed —— 解析结果（很小），命中时界面零网络、秒开
 *   _html   —— 原始 HTML（约 350KB），供导出 PDF 复用，LRU 限 2 份
 *
 * 失效时机（缺一不可，否则会显示过期数据）：
 *   ① 提交某日出勤        → 该日所在月失效
 *   ② 月度封存            → 该月失效
 *   ③ 切换班级 / 重新登录 → 全部失效
 */
const _parsed = new Map();
const _html = new Map();
const HTML_CACHE_MAX = 2;

const cacheKey = (month, year) => `${year}-${month}`;

function putHtml(key, html) {
  _html.delete(key);              // 重新插入以刷新 LRU 顺序
  _html.set(key, html);
  while (_html.size > HTML_CACHE_MAX) {
    _html.delete(_html.keys().next().value);
  }
}

export const withReport = (Base) => class extends Base {
  /** 使某个月的缓存失效 */
  _invalidateMonthReport(month, year) {
    const k = cacheKey(month, year);
    _parsed.delete(k);
    _html.delete(k);
  }

  /** 清空全部月度报表缓存（切班级 / 重新登录时调用） */
  _clearReportCache() {
    _parsed.clear();
    _html.clear();
  }

  /** 该月是否已有缓存 —— 界面据此决定是否显示加载态，命中时零闪烁 */
  hasMonthlyReport(month, year) {
    return _parsed.has(cacheKey(month, year));
  }

  /**
   * 后台预热某月报表缓存（2026-10-16 用户要求：打开 Laporan 要秒开）。
   *
   * 官方月度报表页约 350KB，冷开要 2~3 秒。登录成功后立刻在后台拉一次当前月，
   * 教师点开 Laporan 时 `hasMonthlyReport()` 已为 true —— 界面直接进缓存分支，
   * 不显示加载态、不闪烁。
   *
   * 三条约束：
   *   · **不阻塞**调用方 —— 只发起、不 await
   *   · **不抛错** —— 离线 / 会话失效都只是预热失败，不该弹任何提示
   *   · **不重复拉** —— 已有缓存时直接返回（避免刷新按钮与预热撞车）
   */
  prefetchMonthlyReport(month, year) {
    if (!this.isLoggedIn) return;
    if (this.hasMonthlyReport(month, year)) return;
    this.getMonthlyReport(month, year).catch(() => { /* 预热失败静默 */ });
  }

  // -------------------------------------------------------------- 假因

  /**
   * 逐分类拉取服务端假因并合并进本地字典。
   *
   * 2026-10-18 实测修正（探针 scratch/probe-sebab.py，只读）：
   *   · 官方 tabguru 页调用本接口用的是 jQuery `$.ajax({url})` 默认 **GET**，
   *     无 body、无 _token（见页面快照第 1231 / 1256 行）。
   *     旧实现发 POST → 服务端回 **405**，12 次全部作废。
   *   · 改 GET 后仍是 200 + Imperva 拦截页（10KB HTML，非 JSON）——
   *     说明该接口在当前网络环境下拿不到数据，本地 98 条字典（12 分类全覆盖）
   *     才是实际数据源。
   *   · 12 次串行 **9.8 秒**，并发 2.9 秒。但既然首次就失败，
   *     **首败即停**才是正解：首个失败只要 0.9 秒，跑完 12 次白等 9.8 秒。
   *
   * 这 9.8 秒不是无害的后台任务 —— 实测它与名单加载（ajaxloadkehadiranharian）
   * 和 350KB 的月报预热并发抢带宽，移动网络下直接拖慢首屏。
   *
   * 因此本函数改为「尽力探测」：方法按官方对齐，失败立刻收手，
   * 绝不为了一个拿不到数据的接口拖慢登录。
   */
  async refreshSebab() {
    if (!this.isLoggedIn) return 0;
    const cats = ['B', 'K', 'L', 'E', 'J', 'I', 'A', 'G', 'M', 'N', 'D', 'P'];

    /** 拉单个分类；返回新增条数，null 表示「该接口这次根本不可用」 */
    const fetchOne = async (k) => {
      try {
        const r = await this.request('GET',
          `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru/ajax-takhadir/${k}`,
          null,
          { 'X-Requested-With': 'XMLHttpRequest', Accept: AJAX_ACCEPT });
        // 405 / 5xx / WAF 拦截页都算不可用。旧实现只看 JSON 能否解析，
        // 解析失败就 `continue` 打下一个 —— 等于把 12 次失败全走完。
        if (r.status !== 200) return null;
        let d = r.data;
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch { return null; }   // HTML 拦截页
        }
        const arr = Array.isArray(d) ? d : (d?.data || d?.sebab || []);
        return Array.isArray(arr) ? mergeRemote(arr) : null;
      } catch {
        return null;
      }
    };

    // 探针分类：拿不到就整体放弃，不为 11 个必然失败的请求付 9 秒
    const first = await fetchOne(cats[0]);
    if (first === null) return 0;

    // 探针成功才继续。6 路并发（实测 12 次串行 9.8s → 并发 2.9s）
    let added = first;
    const rest = cats.slice(1);
    for (let i = 0; i < rest.length; i += 6) {
      const got = await Promise.all(rest.slice(i, i + 6).map(fetchOne));
      for (const n of got) if (n !== null) added += n;
    }
    return added;
  }

  // -------------------------------------------------------------- 报表

  /**
   * 月度报表：一次请求同时拿到汇总指标、逐日矩阵、封存状态。
   *
   * 官方该页面约 350KB，故按 YYYY-MM 缓存解析结果 ——
   * 切月来回翻时命中缓存即零网络返回。
   * 解析逻辑抽到 monthReport.js 的纯函数里，便于单测。
   *
   * @param {string} month 两位月份，如 '10'
   * @param {string} year  四位年份，如 '2026'
   * @param {{force?: boolean}} [opts] force=true 强制绕过缓存
   */
  async getMonthlyReport(month, year, { force = false } = {}) {
    const k = cacheKey(month, year);
    if (!force && _parsed.has(k)) return _parsed.get(k);

    const resp = await this.request('GET',
      `${MOEIS_ORIGIN}/sahsiah/kehadiran/laporankehadiranbulanan/${month}/${year}`, null, {
        Referer: `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru`,
      });
    const html = typeof resp.data === 'string' ? resp.data : '';
    putHtml(k, html);

    const parsed = parseMonthlyReport(html);
    _parsed.set(k, parsed);
    return parsed;
  }

  /**
   * 月度封存（官方 Sahkan / sahbulanan）。
   *
   * ⚠ 不可撤销：官方确认后会把 Sahkan 按钮换成「Cetak laporan」，没有撤销入口；
   * swal 原文亦警告「未补齐的缺席信息将不再计入缺席名单」。
   * 因此 UI 侧必须满足两个条件才允许调用：
   *   1. 二次确认对话框（标题与正文取官方 swal 原文，另附不可撤销提示）
   *   2. 已知该月已封存时（stats.isConfirmed）不显示该按钮
   * 报文格式已由 tools/verify-live.mjs 核对（只记录参数、不发送）。
   */
  async submitSahBulanan(month, year) {
    const resp = await this.request('POST',
      `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru/sahbulanan`,
      { _token: this.moeisToken, bulan: month, tahun: year }, {
        'X-Requested-With': 'XMLHttpRequest',
        Origin: MOEIS_ORIGIN,
        Referer: `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru`,
      });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    const done = /berjaya|status|true/i.test(text);
    if (done) this._invalidateMonthReport(month, year);   // 封存后该月状态已变
    return done;
  }

  /** 拼接 A4 横向报表 HTML（供原生打印引擎渲染为矢量 PDF） */
  async _buildReportHtml(month, year) {
    const k = cacheKey(month, year);
    // 数据页（约 350KB）与 getMonthlyReport 是同一份，命中缓存就不重复下载
    const cached = _html.get(k);

    const shellUrl = `${MOEIS_ORIGIN}/sahsiah/kehadiran/cetaklaporankehadiranbulanan/${month}/${year}`;
    const dataUrl = `${MOEIS_ORIGIN}/sahsiah/kehadiran/laporankehadiranbulanan/${month}/${year}`;
    const [rShell, rData] = await Promise.all([
      this.request('GET', shellUrl, null, { Referer: `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru` }),
      cached
        ? Promise.resolve(null)
        : this.request('GET', dataUrl, null, { Referer: `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru` }),
    ]);

    const dataHtml = cached || String(rData?.data || '');
    if (!cached) putHtml(k, dataHtml);

    let html = String(rShell.data || '')
      .replace("<div id='cetak_rumusan'>", `<div id='cetak_rumusan'>\n${dataHtml}`)
      .replace(/<button[^>]*>[\s\S]*?<\/button>/g, '')
      .replace(/<tr class=["']petunjuk["']>[\s\S]*?<\/tr>/g, '')
      .replace(/table-responsive/g, '')
      .replace(/<script>[\s\S]*?<\/script>/g, '');

    const printCss = `<style>
@page { size: A4 landscape; margin: 4mm 5mm; }
html,body{margin:0!important;padding:0!important;background:#fff!important;
font-family:Arial,"Helvetica Neue",Helvetica,sans-serif!important;}
body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;zoom:.90;}
.container-fluid{padding:0!important;width:100%!important;}
table{margin-bottom:2px!important;border-collapse:collapse!important;}
th,td{padding:2px 1.5px!important;font-size:8.8pt!important;line-height:1.2!important;}
#tblKehadiranBulanan th{font-size:8.5pt!important;padding:2px 1px!important;
background-color:#f2f2f2!important;font-weight:bold!important;}
#tblKehadiranBulanan td{font-size:8.5pt!important;padding:1.5px 1px!important;}
img{max-height:46px!important;width:auto!important;}
h5{font-size:13pt!important;font-weight:bold!important;margin:2px 0 4px 0!important;}
</style>`;
    html = html.replace(/<style>[\s\S]*?<\/style>/i, printCss);

    // 平衡分页：第 1 页 (N+6)/2 人，第 2 页余下 + 底表，保证恰好两页
    const rows = [...html.matchAll(/<tr(?:(?!<tr)[\s\S])*?\(\d{12}\)[\s\S]*?<\/tr>/g)];
    if (rows.length > 6) {
      const page1 = Math.min(rows.length - 6, Math.floor((rows.length + 6) / 2));
      const t = rows[page1];
      if (t) {
        const s = t.index, e = s + t[0].length;
        const row = t[0].replace('<tr', '<tr style="page-break-before:always;break-before:page;"');
        html = html.slice(0, s) + row + html.slice(e);
      }
    }
    return html;
  }

  async exportMonthlyReport(month, year) {
    const html = await this._buildReportHtml(month, year);
    const cls = (this.currentClass()?.name || 'KELAS').replace(/\s+/g, '_');
    const base = `MOEIS_月度出勤分析表_${cls}_${year}年${month}月`;
    const pdfName = `${base}.pdf`;

    // 备用：同时落地一份 HTML
    try {
      await Filesystem.writeFile({
        path: `Download/${base}.html`, data: html,
        directory: Directory.ExternalStorage, encoding: 'utf8',
      });
    } catch { /* 忽略 */ }

    if (Capacitor.isNativePlatform() && PdfGenerator) {
      const res = await PdfGenerator.generatePdf({ html, fileName: pdfName, open: true });
      return { success: true, isPdf: true, fileName: pdfName,
        path: res?.path || `/storage/emulated/0/Download/${pdfName}` };
    }
    return { success: true, isPdf: false, fileName: `${base}.html`,
      path: `Download/${base}.html` };
  }

  /**
   * 系统打印 / 另存 PDF（原生 PdfGenerator.print）。
   *
   * 目前**未接入界面**：报表抽屉按用户要求只保留一个动作按钮
   * （未封存 → 封存；已封存 → Cetak Laporan = 导出 PDF）。
   * 导出后的 PDF 由系统查看器打开，其内即可打印，故不重复提供入口。
   * 方法保留备用（若日后要单独提供「直接调起打印」）。
   */
  async printMonthlyReport(month, year) {
    const html = await this._buildReportHtml(month, year);
    const cls = (this.currentClass()?.name || 'KELAS').replace(/\s+/g, '_');
    const jobName = `MOEIS_月度出勤分析表_${cls}_${year}年${month}月`;
    if (Capacitor.isNativePlatform() && PdfGenerator) {
      await PdfGenerator.print({ html, jobName });
    }
  }
};
