/**
 * 缺勤假因模块 (Sebab Tidak Hadir)
 *
 * 数据来源：MOEIS 官方 12 分类 / 98 词条（逆向自官方 bundle + 服务端字典快照）
 * 设计取向：内置离线兜底 + 运行时动态刷新（服务端更新无需重新打包）
 *
 * 显示语言：按用户要求保留马来文原文，不做中文翻译。
 */

import SEBAB_DICT from './sebab-dictionary.json';

/**
 * 官方 12 分类（字母 → 马来文名）。
 * 名称与顺序**逐字取自官方 tabguru 页 `generateKatSelect()`**：
 *   ' <option value="B" >AKTIVITI LUAR SEKOLAH</option>  ... '
 * 不要改写或翻译 —— 教师提交时看到的下拉就是这一份。
 */
export const SEBAB_CATEGORIES = [
  { key: 'B', name: 'AKTIVITI LUAR SEKOLAH' },
  { key: 'K', name: 'ANCAMAN KESELAMATAN' },
  { key: 'L', name: 'BENCANA' },
  { key: 'E', name: 'DIGANTUNG SEKOLAH' },
  { key: 'J', name: 'MASALAH KELUARGA' },
  { key: 'I', name: 'MASALAH PERIBADI' },
  { key: 'A', name: 'PDPR' },
  { key: 'G', name: 'PENGGILIRAN PEPERIKSAAN' },
  { key: 'M', name: 'KEBENARAN PENGETUA/GURU BESAR' },
  { key: 'N', name: 'PONTENG' },
  { key: 'D', name: 'MASALAH KESIHATAN' },
  { key: 'P', name: 'SEKOLAH DALAM HOSPITAL' },
];

const CATEGORY_NAME = Object.fromEntries(SEBAB_CATEGORIES.map(c => [c.key, c.name]));

/** 默认高频假因（无历史选择时的首选提示） */
export const DEFAULT_SEBAB = 'D0260001'; // MAKLUMAN IBU BAPA PENJAGA

/**
 * 教师日常最常用的快捷项（点按即可，无需进分类）。
 * 清单来源：NAS 侧 idme-mcp 于 2026-10-05 与小莫逐项核对后固化的 11 项高频假因。
 * 全部 code 已确认存在于本地 98 项字典中。
 */
export const QUICK_SEBAB = [
  'D0260001', // MAKLUMAN IBU BAPA PENJAGA（家长通知，最高频）
  'D0260030', // SURAT CUTI SAKIT HOSPITAL/KLINIK（病假单 / MC）
  'D0010075', // DEMAM（发烧）
  'D0020059', // TEMUJANJI HOSPITAL/KLINIK（复诊）
  'B0010073', // WAKIL SEKOLAH（代表学校）
  'J1100037', // BALIK KAMPUNG（回乡）
  'J0050031', // MENJAGA/MENGURUSKAN AHLI KELUARGA（家里有事）
  'J0060032', // MENJAGA AHLI KELUARGA YANG SAKIT（照顾生病家人）
  'J0020028', // KEMATIAN AHLI KELUARGA TERDEKAT（近亲去世）
  'J0040030', // MENGIKUT KELUARGA BERCUTI/BERKURSUS（随家人度假/课程）
  'J0090035', // MASALAH PENGANGKUTAN（交通问题）
];

/**
 * PDPR 居家学习（A 类，官方仍计出席）—— 批量场景最高频，快捷项置顶。
 * 依据：2026-10-16 全班 31 人 A0010072，kehadiran 无勾选但 bilhadir=31。
 */
export const PDPR_SEBAB = 'A0010072';

/** 快捷项全表：PDPR 置顶 + NAS 核定的 11 项高频 */
export const QUICK_SEBAB_ALL = [PDPR_SEBAB, ...QUICK_SEBAB];

/**
 * 官方「算出席」分类（请假记录仍计入 bilhadir，不扣出席率）。
 * 顺序即优先级：名额不足时按此序保留。
 * 依据：官方 12 分类 + 实测（A 类居家学习 10-16 / G 类考试轮换 / E 停学 / P 院内学校）。
 */
export const EXCUSED_CATEGORIES = ['A', 'G', 'E', 'P'];

/** 该分类是否被官方计为出席 */
export function isExcusedCategory(kat) {
  return EXCUSED_CATEGORIES.includes(String(kat || '').charAt(0));
}

/** 分类在「算出席」中的优先级，越小越优先；非算出席分类返回 99 */
export function excusedRank(kat) {
  const i = EXCUSED_CATEGORIES.indexOf(String(kat || '').charAt(0));
  return i < 0 ? 99 : i;
}

/** 内存字典（可被动态刷新覆盖） */
let dict = Array.isArray(SEBAB_DICT) ? SEBAB_DICT.slice() : [];

/** 全量字典（不可变快照语义，返回浅拷贝） */
export function allSebab() {
  return dict.slice();
}

export function getSebabByCode(code) {
  if (!code) return null;
  return dict.find(s => s.code === code) || null;
}

export function categoryName(key) {
  return CATEGORY_NAME[key] || key;
}

/** 按分类字母分组，返回 [{ key, name, items }]，仅含非空分类 */
export function groupByCategory() {
  const map = new Map();
  for (const s of dict) {
    if (!map.has(s.kategori)) map.set(s.kategori, []);
    map.get(s.kategori).push(s);
  }
  return SEBAB_CATEGORIES
    .filter(c => map.has(c.key))
    .map(c => ({ key: c.key, name: c.name, items: map.get(c.key) }));
}

/**
 * 用服务端拉取的假因合并进本地字典。
 * 兼容服务端多种字段命名（id_sebab_thadir / code / id，keterangan / name）。
 * @param {Array} remote 服务端返回的假因数组
 * @returns {number} 新增条数
 */
export function mergeRemote(remote) {
  if (!Array.isArray(remote)) return 0;
  let added = 0;
  for (const item of remote) {
    const code = item.id_sebab_thadir || item.code || item.id;
    if (!code) continue;
    if (dict.some(s => s.code === code)) continue;
    dict.push({
      code,
      name: item.keterangan || item.name || code,
      kategori: item.kategori || String(code).charAt(0),
    });
    added++;
  }
  return added;
}

/** 重置为内置字典（调试/兜底用） */
export function resetDict() {
  dict = Array.isArray(SEBAB_DICT) ? SEBAB_DICT.slice() : [];
}
