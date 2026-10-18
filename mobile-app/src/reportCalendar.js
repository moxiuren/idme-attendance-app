/**
 * 月度报表月历的格子构造。
 *
 * 为什么单独成模块：原先是 ReportSheet.vue 里的一段 computed，含两处容易写错的逻辑
 * （「是否未来日期」的判定、格子与星期几的对齐）。.vue 在 Node 里没有模板编译器，
 * 抽成纯函数后就能**真正跑断言**，而不是只做文本层面的结构检查。
 *
 * 只负责「算出每格长什么样」，不碰 DOM、不碰网络、不依赖 Vue。
 */

/** DD/MM/YYYY */
function fmt(d, m, y) {
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/**
 * @param {object}   o
 * @param {Array<{day:number,hadir:number,absent:number,total:number,
 *                holiday:(string|null),holidayColor:(string|null)}>} o.days 官方解析出的每日汇总
 * @param {number}   o.year   报表年（如 2026）
 * @param {number}   o.month  报表月（1~12）
 * @param {Date}     [o.now]  参照「今天」（注入以便测试）
 * @param {string}   [o.noRecord] 「未录入」文案（由 i18n 注入，本模块不依赖 i18n）
 * @returns {Array<{day:number,date?:string,clickable?:boolean,value:string,absent:number,
 *                  note:string,color:(string|null),cls:string}>}
 */
export function buildCalendarCells({ days, year, month, now = new Date(), noRecord = '' }) {
  const list = Array.isArray(days) ? days : [];

  // 今天 0 点：用 Date 比较而不是字符串，避免受本地化与月份天数影响
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isThisMonth = now.getFullYear() === year && now.getMonth() + 1 === month;

  // 官方月报表以 Ahad（周日）为一周之始，与 WEEKDAY_SHORT 一致
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells = Array.from({ length: firstWeekday }, () => ({ day: 0, cls: 'cal-blank' }));

  for (const d of list) {
    const hasData = d.total > 0;
    // 未来日期不可点：点进去也只是只读，与主界面「还没到的日期直接过不去」保持一致
    const future = new Date(year, month - 1, d.day) > todayMid;
    cells.push({
      day: d.day,
      date: fmt(d.day, month, year),
      clickable: !future,
      value: hasData ? `${d.hadir}/${d.total}` : '',
      absent: d.absent,
      note: hasData || d.holiday ? '' : noRecord,
      color: d.holidayColor,
      cls: [
        d.holiday ? 'cal-holiday' : '',
        hasData ? '' : 'cal-empty',
        d.absent > 0 ? 'cal-alert' : '',
        isThisMonth && now.getDate() === d.day ? 'cal-today' : '',
      ].filter(Boolean).join(' '),
    });
  }
  return cells;
}
