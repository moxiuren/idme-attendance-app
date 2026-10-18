// 纯工具函数（无状态、无副作用、无依赖）
//
// 注：错误文案已迁至 errors.js（需要读当前语言，属 UI 层职责）。
// 本文件保持零 import —— idmeAttendance.js / idmeReport.js 等服务层
// 都依赖它，若在此引入 i18n 会让服务层间接耦合到 UI。

/** 今天，DD/MM/YYYY */
export function todayStr() {
  const t = new Date();
  return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
}

/** 日期字符串平移 N 天，保持 DD/MM/YYYY */
export function shiftDateStr(dStr, delta) {
  const [d, m, y] = dStr.split('/').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

/**
 * DD/MM/YYYY → 可直接比大小的数字 YYYYMMDD。
 * 用于「所选日期是否晚于今天」这类先后判断 —— 字符串比较在 DD/MM/YYYY 下不成立。
 * 非法输入返回 NaN，比较结果一律为 false（宁可放行，也不误锁界面）。
 */
export function dateNum(dStr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dStr || ''));
  if (!m) return NaN;
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

/**
 * DD/MM/YYYY → { m: 'MM', y: 'YYYY' }，即月度报表接口的月份 / 年份参数。
 * 非法输入返回 null（调用方自行决定跳过）。
 */
export function monthYearOf(dStr) {
  const m = /^\d{2}\/(\d{2})\/(\d{4})$/.exec(String(dStr || ''));
  return m ? { m: m[1], y: m[2] } : null;
}

/**
 * 出席率显示格式：满 100 显示整数「100」，低于 100 才保留一位小数（如 99.5）。
 *
 * 为什么统一在这里做 —— 百分比有两个来源：主界面是本地算出的 number，
 * 月度报表是从服务端 HTML 里抠出的**字符串**（'100.00'）。三处界面各写一遍
 * toFixed 必然走样，故收敛成一个函数，number / string 都吃得下。
 *
 * 「是否满值」按**舍入后**判断，而不是原始值：31 人的班级未满员时最高只有
 * 96.8%，能舍入到 100 的必然是真的全员出席，不会出现 99.96 被显示成 100
 * 的失真。反过来，99.95 这类值仍会显示 100 —— 这在一位小数的精度下本就
 * 无法与 100 区分，显示 100.0 同样如此。
 *
 * 非法输入返回 '0'（宁可显示 0，也不在界面上留 NaN）。
 */
export function formatPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 10) / 10;
  return r >= 100 ? '100' : r.toFixed(1);
}
