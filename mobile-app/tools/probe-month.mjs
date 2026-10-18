/**
 * 只读探针：导出官方「月度出勤报表」HTML，用于分析可用的逐日数据结构。
 *
 * 用法：node tools/probe-month.mjs [MM] [YYYY]
 * 产物：tools/out/month-report-MM-YYYY.html
 */
import fs from 'node:fs';
import path from 'node:path';

const CRED = JSON.parse(fs.readFileSync(
  'C:/Users/Admin/Documents/Projects/idme-attendance-app/credentials.json', 'utf8'));
if (!fs.existsSync('dist/_probe.mjs')) {
  console.error('缺少 dist/_probe.mjs —— 请先运行：npm run probe');
  process.exit(1);
}
const { idme } = await import('../dist/_probe.mjs');

const mm = process.argv[2] || String(new Date().getMonth() + 1).padStart(2, '0');
const yyyy = process.argv[3] || String(new Date().getFullYear());

await idme.login(CRED.ic, CRED.password, () => {});
const cls = idme.currentClass();
console.log(`班级 ${cls?.name} (${cls?.id})   目标 ${mm}/${yyyy}`);

const OUT = path.join('tools', 'out');
fs.mkdirSync(OUT, { recursive: true });

const urls = [
  ['month-report', `https://moeispel.moe.gov.my/sahsiah/kehadiran/laporankehadiranbulanan/${mm}/${yyyy}`],
  ['month-print-shell', `https://moeispel.moe.gov.my/sahsiah/kehadiran/cetaklaporankehadiranbulanan/${mm}/${yyyy}`],
  ['month-rumusan', `https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru/rumusankesuluruhan?bulan=${mm}&tahun=${yyyy}`],
  ['month-thadir-rumusan', `https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru/rumusanthadirkesuluruhan?bulan=${mm}&tahun=${yyyy}`],
];

for (const [name, url] of urls) {
  try {
    const r = await idme.request('GET', url, null,
      { Referer: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru' });
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    fs.writeFileSync(path.join(OUT, `${name}-${mm}-${yyyy}.html`), body, 'utf8');
    console.log(`  ✓ ${name.padEnd(20)} ${String(body.length).padStart(8)} 字节  ${url.replace(/^https?:\/\/[^/]+/, '')}`);
  } catch (e) {
    console.log(`  ✗ ${name.padEnd(20)} 失败：${e.message}`);
  }
}
