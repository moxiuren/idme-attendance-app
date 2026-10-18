/**
 * 月度报表月历契约测试（**完全离线**）。
 *
 * 覆盖两件事：
 *   [A] `src/reportCalendar.js` 的真实行为 —— 纯函数，可在 Node 里直接跑
 *       （.vue 没有模板编译器，测不了组件，所以逻辑被特意抽了出来）
 *   [B] 组件与 App 的**接线**：月历格必须是 button 才可点、点完要关抽屉再换日期、
 *       有未提交改动要先确认 —— 这些住在 .vue 里，只能用源码结构断言兜住
 *
 * 用法：node tools/test-report-calendar.mjs
 * 前置：无（不依赖 dist/ 的探针 bundle，也不触网）
 */
import fs from 'node:fs';
import { buildCalendarCells } from '../src/reportCalendar.js';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

let PASS = 0;
let FAIL = 0;

function check(label, cond, extra = '') {
  if (cond) { PASS++; console.log(`    ✓ ${label}`); }
  else { FAIL++; console.log(`    ✗ ${label}${extra ? `  ← ${extra}` : ''}`); }
}
function section(title) {
  console.log(`\n${'='.repeat(74)}\n${title}\n${'='.repeat(74)}`);
}

// ================================================================ 夹具
// 2026-10：1 号是周四（Ahd=0 … Kha=4）→ 首日前应有 4 个空格
const YEAR = 2026;
const MONTH = 10;
const NOW = new Date(2026, 9, 17);          // 「今天」= 2026-10-17（周六）
const NO_REC = 'Belum direkod';

/** 造 31 天：day12 无数据、day16 假期、day5 有 1 人缺席，其余满勤 */
function makeDays() {
  return Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    if (day === 12) return { day, hadir: 0, absent: 0, total: 0, holiday: null, holidayColor: null };
    if (day === 16) {
      return {
        day, hadir: 0, absent: 0, total: 0,
        holiday: 'Cuti Umum', holidayColor: '#ff5050',
      };
    }
    if (day === 5) return { day, hadir: 30, absent: 1, total: 31, holiday: null, holidayColor: null };
    return { day, hadir: 31, absent: 0, total: 31, holiday: null, holidayColor: null };
  });
}

const cells = buildCalendarCells({
  days: makeDays(), year: YEAR, month: MONTH, now: NOW, noRecord: NO_REC,
});
const cellOf = (day) => cells.find(c => c.day === day);

// ================================================================ [A] 纯函数
section('[A] buildCalendarCells：格子构造与「能否点」判定');
{
  check('首日前的空格数 = 该月 1 号的星期序（2026-10-01 周四 → 4）',
    cells.length - 31 === 4, `实际 ${cells.length - 31}`);
  check('空格是 day=0 且没有 date / clickable',
    cells.slice(0, 4).every(c => c.day === 0 && c.date === undefined && c.clickable === undefined));
  check('空格带 cal-blank', cells[0].cls === 'cal-blank');

  check('日期串为 DD/MM/YYYY 且补零', cellOf(1).date === '01/10/2026', cellOf(1).date);
  check('两位数日期不加多余前导', cellOf(17).date === '17/10/2026', cellOf(17).date);

  // ---- 可点性：过去 / 今天可点，未来不可点 ----
  check('过去的日期可点', cellOf(5).clickable === true);
  check('今天（10-17）可点', cellOf(17).clickable === true);
  check('明天（10-18）不可点 —— 与主界面「还没到的日期直接过不去」一致',
    cellOf(18).clickable === false);
  check('月末未来日期同样不可点', cellOf(31).clickable === false);
  check('假期只要不是未来就可点（点进去看得到官方不可录入说明）',
    cellOf(16).clickable === true);

  // ---- 数值与状态类 ----
  check('有数据 → value = 出席/应有', cellOf(5).value === '30/31', cellOf(5).value);
  check('有缺席 → cal-alert', cellOf(5).cls.includes('cal-alert'));
  check('满勤 → 无 cal-alert', !cellOf(6).cls.includes('cal-alert'));
  check('无数据 → value 为空 + note 取「未录入」+ cal-empty',
    cellOf(12).value === '' && cellOf(12).note === NO_REC && cellOf(12).cls.includes('cal-empty'));
  check('假期 → cal-holiday + 颜色透传 + 不显示「未录入」',
    cellOf(16).cls.includes('cal-holiday')
    && cellOf(16).color === '#ff5050'
    && cellOf(16).note === '');
  check('有数据的普通日不显示 note', cellOf(6).note === '');

  // ---- 「今天」高亮 ----
  check('当月的今天有 cal-today', cellOf(17).cls.includes('cal-today'));
  check('同月其他日没有 cal-today',
    !cellOf(16).cls.includes('cal-today') && !cellOf(18).cls.includes('cal-today'));

  const other = buildCalendarCells({
    days: makeDays(), year: 2026, month: 9, now: NOW, noRecord: NO_REC,
  });
  check('不是当月（9 月报表 vs 今天 10-17）→ 任何格子都没有 cal-today',
    other.every(c => !c.cls.includes('cal-today')));

  // ---- 边界 ----
  check('days 为空 → 只剩空格，不抛错',
    buildCalendarCells({ days: [], year: YEAR, month: MONTH, now: NOW }).length === 4);
  check('days 非数组也不抛错',
    buildCalendarCells({ days: null, year: YEAR, month: MONTH, now: NOW }).length === 4);
  check('未来月份的整月都不可点',
    buildCalendarCells({
      days: makeDays(), year: 2026, month: 11, now: NOW, noRecord: NO_REC,
    }).filter(c => c.day > 0).every(c => c.clickable === false));
}

// ================================================================ [B] 接线
section('[B] 接线：可点格子是 <button>、点完关抽屉换日期、未提交先确认');
{
  const sheet = read('../src/ReportSheet.vue');
  const app = read('../src/App.vue');
  const css = read('../src/styles/sheets.css');
  const i18n = read('../src/i18n.js');
  const audit = read('../../docs/touch-target-audit.py');

  // ---- ReportSheet：格子渲染 ----
  check('可点格子渲染成 <button>，其余仍是 <span>',
    /:is="c\.clickable \? 'button' : 'span'"/.test(sheet));
  check('只有可点格子加 .cal-cell-btn', /c\.clickable \? 'cal-cell-btn' : ''/.test(sheet));
  check('不可点格子不带 type / title（不进 tab 序、无多余提示）',
    /:type="c\.clickable \? 'button' : null"/.test(sheet)
    && /:title="c\.clickable \?/.test(sheet));
  check('点击处理前再判一次 clickable', /@click="c\.clickable && pickDate\(c\.date\)"/.test(sheet));
  check('声明了 pick-date 事件', /defineEmits\(\['close', 'notify', 'pick-date'\]\)/.test(sheet));
  check('pickDate 在 busy 时不发事件', /if \(busy\.value \|\| !dateStr\) return;/.test(sheet));
  check('月历逻辑已抽到 reportCalendar.js', /from '\.\/reportCalendar\.js'/.test(sheet)
    && !/firstWeekday/.test(sheet));

  // ---- App：跳转与保护 ----
  check('App 监听 @pick-date', /@pick-date="pickReportDate"/.test(app));
  check('跳转前关闭抽屉', /showReport\.value = false;[\s\S]{0,60}await loadAttendance\(dateStr\)/.test(app));
  check('有未提交改动时先确认（att.changed）',
    /att\.changed\.value/.test(app) && /t\('confirmJump'\)/.test(app));
  check('确认框用危险样式（是破坏性操作）', /message: t\('confirmJump'\),\s*danger: true/.test(app));

  // ---- CSS：可点格的按压反馈 ----
  check('定义了 .cal-cell-btn', /\.cal-cell-btn\s*\{/.test(css));
  check('.cal-cell-btn 有 pointer 光标', /\.cal-cell-btn\s*\{[\s\S]{0,200}cursor:\s*pointer/.test(css));
  check('.cal-cell-btn 有 :active 反馈', /\.cal-cell-btn:active\s*\{/.test(css));

  // ---- 触控目标：新交互元素必须进入审计清单 ----
  check('touch-target-audit 已纳入 .cal-cell', /"\.cal-cell",/.test(audit));

  // ---- i18n：新文案在所有已声明语言里齐备 ----
  // 语种数从 LANGS 推导，不写死 2：原先硬编码「ms / zh 各一条」，
  // 2026-10 新增英文后这三个 key 变成 3 条，测试立刻报红 —— 而字典本身是对的。
  // 正确的不变式是「每个 LANGS 里的 code 各有一条」，语言增减都不该改测试。
  const langCodes = [...i18n.matchAll(/\{\s*code:\s*'([^']+)'/g)].map(m => m[1]);
  check('LANGS 至少声明了两种语言', langCodes.length >= 2, `实际 ${langCodes.join('/')}`);
  for (const k of ['openDay', 'confirmJump', 'confirmTitleJump']) {
    const n = (i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length;
    check(`i18n 中 ${k} 在 ${langCodes.join(' / ')} 各一条`, n === langCodes.length,
      `实际 ${n} 条，语言 ${langCodes.length} 种`);
  }
}

// ================================================================ 汇总
section(`结果：${PASS} 通过 / ${FAIL} 失败`);
if (FAIL) console.log('  ✗ 存在失败断言，请检查上方 ✗ 行');
else console.log('  ✓ 报表月历契约全部吻合（未触网）');
process.exit(FAIL ? 1 : 0);
