/**
 * 月度报表解析器回归测试（只读）。
 *
 * 优先用 tools/out/ 里已抓取的 HTML 做离线校验；缺失时自动联网抓取。
 * 联网只调用查询接口 laporankehadiranbulanan，无任何写入。
 *
 * 用法：node tools/test-month-parser.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseMonthlyReport, isMonthOver } from '../src/monthReport.js';

const OUT = path.join('tools', 'out');
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? '   ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/** 取 HTML：本地 fixture 优先，缺失则联网 */
async function htmlFor(mm, yyyy) {
  const f = path.join(OUT, `month-report-${mm}-${yyyy}.html`);
  if (fs.existsSync(f)) return { html: fs.readFileSync(f, 'utf8'), from: 'fixture' };

  const CRED = JSON.parse(fs.readFileSync(
    'C:/Users/Admin/Documents/Projects/idme-attendance-app/credentials.json', 'utf8'));
  if (!fs.existsSync('dist/_probe.mjs')) {
    console.error('缺少 dist/_probe.mjs —— 请先运行：npm run probe');
    process.exit(1);
  }
  const { idme } = await import('../dist/_probe.mjs');
  await idme.login(CRED.ic, CRED.password, () => {});
  const r = await idme.request('GET',
    `https://moeispel.moe.gov.my/sahsiah/kehadiran/laporankehadiranbulanan/${mm}/${yyyy}`,
    null, { Referer: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru' });
  const html = typeof r.data === 'string' ? r.data : '';
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(f, html, 'utf8');
  return { html, from: 'live' };
}

console.log('='.repeat(74));
console.log('月度报表解析器回归测试');
console.log('='.repeat(74));

// ---------------- 已封存月份：09/2026（fixture 缺失时跳过该段） ----------------
{
  const { html, from } = await htmlFor('09', '2026');
  console.log(`\n【09/2026 · 已封存】  来源 ${from}  ${html.length} 字节`);
  const r = parseMonthlyReport(html);
  check('识别为已封存', r.isConfirmed === true);
  check('解析出日列数 30', r.dayCount === 30, `实际 ${r.dayCount}`);
  check('解析出学生数 > 0', r.studentCount > 0, `实际 ${r.studentCount}`);
  check('汇总四项均非空',
    ['peratus', 'purata', 'hariBelajar', 'murid'].every(k => r.summary[k] !== null),
    JSON.stringify(r.summary));
  check('假期图例解析出 8 种', Object.keys(r.legend).length === 8,
    `实际 ${Object.keys(r.legend).length}`);
  // 不变式：total 恒等于 hadir + absent，且不超过班级人数
  // （不能要求 total === 学生数 —— 月初有学生尚未在册，实测 10 月 1/2/7 日为 30 而非 31）
  const bad = r.days.filter(d => d.total !== d.hadir + d.absent || d.total > r.studentCount);
  check('每日 total === hadir + absent 且 ≤ 学生数', bad.length === 0,
    bad.length ? `异常 ${bad.length} 天：${bad.slice(0, 3).map(d => d.day + ':' + d.total).join(', ')}` : '');
}

// ---------------- 未封存月份：10/2026 ----------------
{
  const { html, from } = await htmlFor('10', '2026');
  console.log(`\n【10/2026 · 未封存】  来源 ${from}  ${html.length} 字节`);
  const r = parseMonthlyReport(html);
  check('识别为未封存', r.isConfirmed === false);
  check('解析出日列数 31', r.dayCount === 31, `实际 ${r.dayCount}`);
  check('解析出学生数 31', r.studentCount === 31, `实际 ${r.studentCount}`);

  const bad = r.days.filter(d => d.total !== d.hadir + d.absent || d.total > r.studentCount);
  check('每日 total === hadir + absent 且 ≤ 学生数', bad.length === 0,
    bad.length ? `异常 ${bad.length} 天` : '');

  // 02/10 已知 2 人家长通知缺席（verify-live 的基线）
  const d2 = r.days.find(d => d.day === 2);
  check('02/10 缺席 2 人', d2?.absent === 2, `实际 ${d2?.absent}`);
  // 03/10 是周六 → 假期
  const d3 = r.days.find(d => d.day === 3);
  check('03/10 识别为假期', !!d3?.holiday, `实际 ${d3?.holiday}`);
  check('03/10 无录入', d3?.total === 0);
  // 16/10 全班 PDPR（官方算出席）→ 31/31
  const d16 = r.days.find(d => d.day === 16);
  check('16/10 全班 31 出席', d16?.hadir === 31 && d16?.absent === 0,
    `实际 ${d16?.hadir}/${d16?.total}`);

  console.log('\n  逐日明细：');
  for (const d of r.days) {
    const tag = d.holiday ? `假期 · ${d.holiday}` : (d.total ? '' : '未录入');
    console.log(`    ${String(d.day).padStart(2)}日  ${String(d.hadir).padStart(2)}/${String(d.total).padStart(2)}`
      + `  缺席 ${d.absent}  ${tag}`);
  }
}

// ---------------- 月份是否结束 ----------------
console.log('\n【isMonthOver】');
check('10/2026 未结束（今天是 10-16）', isMonthOver('10', '2026') === false);
check('09/2026 已结束', isMonthOver('09', '2026') === true);
check('08/2026 已结束', isMonthOver('08', '2026') === true);

console.log('\n' + '='.repeat(74));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(74));
process.exit(fail ? 1 : 0);
