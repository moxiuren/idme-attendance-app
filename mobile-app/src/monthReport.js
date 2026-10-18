/**
 * 官方「月度出勤报表」HTML 解析（纯函数，便于单测与复用）。
 *
 * 数据源：GET /sahsiah/kehadiran/laporankehadiranbulanan/{MM}/{YYYY}
 * 该页面约 350KB，含两张表：
 *   1. 汇总表（Peratus / Purata / Bil. Hari Belajar / Bil. Murid）
 *   2. #tblKehadiranBulanan —— 逐学生 × 逐日的出勤矩阵
 *      单元格语义（实测确认）：
 *        「/」                        出席（含官方算出席的请假，带 popover 说明假因）
 *        「0」                        缺席（带 popover 说明假因）
 *        空 + background-color       各类假期，颜色对照见表尾 PETUNJUK 图例
 *        空 + 无颜色                  尚未录入（未来日期）
 *
 * 封存状态判据（实测 2026-08/09/10 三个月确认，无歧义）：
 *   已封存 → sahlaporanrumusan 按钮消失，改为出现 cetakLaporanBulanan
 *   未封存 → sahlaporanrumusan 存在（对未结束的月份官方会加 disabled）
 */

/** 单元格文本 */
const PRESENT = '/';
const ABSENT = '0';

/**
 * @param {string} html 月度报表页面 HTML
 * @returns {{
 *   summary: {peratus:string, purata:string, hariBelajar:string, murid:string},
 *   isConfirmed: boolean,
 *   dayCount: number,
 *   studentCount: number,
 *   days: Array<{day:number, hadir:number, absent:number, total:number, holiday:(string|null)}>,
 *   legend: Record<string,string>,
 * }}
 */
export function parseMonthlyReport(html) {
  const src = typeof html === 'string' ? html : '';

  // ---- 汇总（沿用官方表头文案定位）----
  const pick = (label) => {
    const m = src.match(new RegExp(`${label}<\\/td>\\s*<td[^>]*>([\\d.]+)`, 'i'));
    return m ? m[1] : null;
  };
  const summary = {
    peratus: pick('Peratus Kedatangan') ?? '0.00',
    purata: pick('Purata Kedatangan') ?? '0.00',
    hariBelajar: pick('Bil\\. Hari Belajar Dalam Bulan Ini') ?? '0',
    murid: pick('Bil\\. Murid Dalam Daftar Hujung Bulan') ?? '0',
  };

  // ---- 封存状态 ----
  const isConfirmed = /cetakLaporanBulanan/i.test(src);

  // ---- 假期图例：颜色 → 名称 ----
  const legend = {};
  for (const tr of src.match(/<tr[^>]*class=["']petunjuk["'][\s\S]*?<\/tr>/gi) || []) {
    for (const m of tr.matchAll(/bgcolor=["'](#[0-9a-fA-F]{6})["'][^>]*>\s*<font[^>]*>([^<]+)/gi)) {
      legend[m[1].toLowerCase()] = m[2].trim();
    }
  }

  // ---- 逐日矩阵 ----
  const tbl = src.match(/<table[^>]*id=["']tblKehadiranBulanan["'][\s\S]*?<\/table>/i);
  const empty = { summary, isConfirmed, dayCount: 0, studentCount: 0, days: [], legend };
  if (!tbl) return empty;

  const dayCount = (tbl[0].match(/<th\s+rowspan="2">\d{2}<\/th>/g) || []).length;
  if (!dayCount) return empty;

  const days = Array.from({ length: dayCount }, (_, i) => ({
    day: i + 1, hadir: 0, absent: 0, total: 0, holiday: null, holidayColor: null,
  }));

  let studentCount = 0;
  for (const row of tbl[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    // 学生行 = 1 个姓名格 + dayCount 个日期格 + 4 个合计格；
    // 且姓名格内含 12 位学号（如 <i>(990101011234)</i>），据此排除表头/图例行
    if (tds.length < dayCount + 1) continue;
    if (!/\(\d{12}\)/.test(tds[0][1])) continue;
    studentCount++;

    for (let i = 0; i < dayCount; i++) {
      const cell = tds[i + 1];
      const text = cell[1].replace(/<[^>]+>/g, '').trim();
      if (text === PRESENT) { days[i].hadir++; days[i].total++; }
      else if (text === ABSENT) { days[i].absent++; days[i].total++; }
      else if (!text) {
        const bg = cell[0].match(/background-color:\s*(#[0-9a-fA-F]{6})/i);
        if (bg && !days[i].holiday) {
          days[i].holidayColor = bg[1].toLowerCase();
          days[i].holiday = legend[days[i].holidayColor] || null;
        }
      }
    }
  }

  return { summary, isConfirmed, dayCount, studentCount, days, legend };
}

/** 该月是否已结束（用于「未结束则封存前提醒」） */
export function isMonthOver(month, year, now = new Date()) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return true;
  if (y !== now.getFullYear()) return y < now.getFullYear();
  return m < now.getMonth() + 1;
}
