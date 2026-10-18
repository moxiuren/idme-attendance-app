/**
 * 契约测试用的**纯数据夹具**（无状态、无副作用、不触网）。
 *
 * 为什么单独成文件：`test-submit-flow.mjs` 已触及行数门禁（≤ 499 有效行）。
 * 审计脚本的建议是「按职责提取」而不是压缩注释 —— 造数据与断言本就是两件事，
 * 且这些夹具对 `test-report-badges` 之类的后续测试同样可复用。
 *
 * 只放「造一个服务端响应长什么样」的东西；任何计数器、路由、断言都留在测试文件里。
 */
import { PDPR_SEBAB, DEFAULT_SEBAB } from '../dist/_flow.mjs';

// 31 人（与真机班级同规模）。姓名预排为马来文升序，
// 与官方 order=namamurid asc 的服务端序一致，避免解析器的兜底排序干扰断言。
const SURNAME = ['ADAM', 'AIMAN', 'ALIF', 'AMIR', 'AQIL', 'ARIF', 'AZAM', 'BILAL',
  'DANIAL', 'DANISH', 'FARIS', 'FAUZAN', 'HAFIZ', 'HAKIM', 'HARITH', 'IDRIS',
  'ILHAM', 'IMRAN', 'IRFAN', 'IZZAT', 'LUQMAN', 'MIKHAIL', 'NAUFAL', 'NURIN',
  'RAYYAN', 'RIDZWAN', 'SAIF', 'SYAFIQ', 'UMAIR', 'YUSUF', 'ZAFRAN'];
const NAMES = SURNAME
  .map((f, i) => `${f} BIN MURID ${String(i + 1).padStart(2, '0')}`)
  .sort((a, b) => a.localeCompare(b, 'ms'));

/** 花名册人数（31） */
export const TOTAL = NAMES.length;

/** D 类「家长通知」假因（真缺席） */
export const SEBAB_D = { code: DEFAULT_SEBAB, kat: 'D', name: 'MAKLUMAN IBU BAPA PENJAGA' };
/** A 类「居家学习 PDPR」假因（官方仍算出席） */
const SEBAB_A = { code: PDPR_SEBAB, kat: 'A', name: 'PEMBELAJARAN DI RUMAH' };

/**
 * 造一天的官方 ajaxloadkehadiranharian 响应。
 * @param {'normal'|'pdpr'|'twoAbsent'} mode
 * @param {{verified?: boolean}} opts verified=true 表示该日已归档
 */
export function makeDay(mode, { verified = false } = {}) {
  const data = NAMES.map((name, i) => {
    const base = { id_individu: `M${1000 + i}`, namamurid: name, kehadiran: '' };

    if (mode === 'pdpr') {
      // PDPR 日：kehadiran 一个都没勾，但官方把 A 类算出席 → bilhadir = 31
      return {
        ...base,
        laporan_takhadir: [{
          id_sebab_thadir: SEBAB_A.code,
          thadir: { id_kat_thadir: SEBAB_A.kat, keterangan: SEBAB_A.name },
        }],
        sebabtidakhadir: SEBAB_A.name,
      };
    }
    if (mode === 'twoAbsent' && i >= TOTAL - 2) {
      // 末两位家长通知缺席（D 类，真缺席）
      return {
        ...base,
        laporan_takhadir: [{
          id_sebab_thadir: SEBAB_D.code,
          thadir: { id_kat_thadir: SEBAB_D.kat, keterangan: SEBAB_D.name },
        }],
        sebabtidakhadir: SEBAB_D.name,
      };
    }
    return { ...base, kehadiran: '<input type="checkbox" checked>' };
  });

  const checked = data.filter(d => d.kehadiran).length;
  return {
    data,
    bilhadir: mode === 'twoAbsent' ? checked : TOTAL,   // twoAbsent: 29；其余: 31
    biltidakhadir: mode === 'twoAbsent' ? 2 : 0,
    statushari: 0,
    rekodSahHadirBulanan: verified ? 1 : 0,
  };
}

/**
 * 官方可录入窗口之外的日期（学期起始日之前）。
 * 实测：服务端既不报错也不给 statushari，而是直接回**空名单**。
 */
export function makeEmptyDay() {
  return { data: [], bilhadir: 0, biltidakhadir: 0, statushari: 0, rekodSahHadirBulanan: 0 };
}

/**
 * 极简月度报表 HTML。
 * parseMonthlyReport 对残缺页面是容错的（找不到 #tblKehadiranBulanan 就返回空结果），
 * 所以这里只要够让 getMonthlyReport 成功入缓存即可 —— 本测试关心的是
 * 「预热有没有发生、有没有重复发生」，不是解析正确性（那由 test-month-parser 负责）。
 */
export function makeReportHtml() {
  return '<table id="tblKehadiranBulanan"><thead><tr>'
    + '<th rowspan="2">01</th><th rowspan="2">02</th></tr></thead><tbody>'
    + '<tr><td>MURID CONTOH SATU<i>(990101011234)</i></td>'
    + '<td>/</td><td>0</td><td>1</td><td>1</td><td>2</td><td>1</td></tr>'
    + '</tbody></table>';
}
