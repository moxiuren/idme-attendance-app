/**
 * 只读探针：对比不同月份的月度报表，找出「未结束」与「已封存」的可靠判据。
 * 用法：node tools/probe-month-state.mjs
 */
import fs from 'node:fs';

const CRED = JSON.parse(fs.readFileSync(
  'C:/Users/Admin/Documents/Projects/idme-attendance-app/credentials.json', 'utf8'));
if (!fs.existsSync('dist/_probe.mjs')) {
  console.error('缺少 dist/_probe.mjs —— 请先运行：npm run probe');
  process.exit(1);
}
const { idme } = await import('../dist/_probe.mjs');
await idme.login(CRED.ic, CRED.password, () => {});

const REF = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru';

for (const [mm, yyyy] of [['09', '2026'], ['10', '2026'], ['08', '2026']]) {
  const r = await idme.request('GET',
    `https://moeispel.moe.gov.my/sahsiah/kehadiran/laporankehadiranbulanan/${mm}/${yyyy}`,
    null, { Referer: REF });
  const h = String(r.data || '');
  const btn = h.match(/<button[^>]*sahlaporanrumusan[^>]*>[\s\S]*?<\/button>/i);
  const cetak = h.match(/<button[^>]*cetakLaporanBulanan[^>]*>[\s\S]*?<\/button>/i);
  const disahkan = h.match(/Disahkan[^<]{0,60}/i);
  console.log(`\n===== ${mm}/${yyyy}  (${h.length} 字节) =====`);
  console.log('  sahlaporanrumusan 按钮 :', btn ? btn[0].replace(/\s+/g, ' ').slice(0, 160) : '（不存在）');
  console.log('  cetakLaporanBulanan   :', cetak ? cetak[0].replace(/\s+/g, ' ').slice(0, 120) : '（不存在）');
  console.log('  Disahkan 文本          :', disahkan ? disahkan[0].trim() : '（无）');
  // 表格存在性 + 天数
  const days = (h.match(/<th rowspan="2">\d{2}<\/th>/g) || []).length;
  console.log('  日列数                 :', days);
}
