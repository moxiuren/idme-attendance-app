/**
 * 只读：抓取官方网站页面，用于提取**马来文原文**，替换我们回译出来的生造文案。
 *
 * 输出到 tools/out/ 供人工比对与逐字引用。
 * 只调用 GET 查询页面，无任何写操作。
 */
import fs from 'node:fs';
import path from 'node:path';
const CRED = JSON.parse(fs.readFileSync(
  'C:/Users/Admin/Documents/Projects/idme-attendance-app/credentials.json', 'utf8'));

// dist/ 会被 vite build 清空，故这里给出明确的前置提示而不是 MODULE_NOT_FOUND
if (!fs.existsSync('dist/_probe.mjs')) {
  console.error('缺少 dist/_probe.mjs —— 请先运行：npm run probe');
  process.exit(1);
}
const { idme } = await import('../dist/_probe.mjs');

const OUT = 'tools/out';
fs.mkdirSync(OUT, { recursive: true });

const MOEIS = 'https://moeispel.moe.gov.my';
const IDME = 'https://idme.moe.gov.my';

console.log('登录…');
await idme.login(CRED.ic, CRED.password, () => {});
console.log('  ✓ 已登录');

const TARGETS = [
  ['tabguru.html', `${MOEIS}/sahsiah/kehadiran/tabguru`, `${MOEIS}/`],
  ['moeis-home.html', `${MOEIS}/`, `${MOEIS}/`],
  ['datatable-malay.json', `${MOEIS}/js/datatablemalay.json`, `${MOEIS}/sahsiah/kehadiran/tabguru`],
  ['idme-list-aplikasi.html', `${IDME}/list_aplikasi`, `${IDME}/home`],
  ['idme-home.html', `${IDME}/home`, `${IDME}/`],
  ['idme-login.html', `${IDME}/login`, `${IDME}/`],
];

for (const [file, url, ref] of TARGETS) {
  try {
    const r = await idme.request('GET', url, null, { Referer: ref });
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    fs.writeFileSync(path.join(OUT, file), body, 'utf8');
    console.log(`  ✓ ${file.padEnd(28)} ${String(body.length).padStart(8)} 字节  ← ${url}`);
  } catch (e) {
    console.log(`  ✗ ${file.padEnd(28)} 失败：${e.message}`);
  }
}

// 密码步页面：需要先提交身份证校验才会返回（用于取 Kata Laluan / ID Pengguna 等原文）
try {
  const r1 = await idme.request('GET', `${IDME}/login`);
  const tk = idme.extractToken(r1.data);
  const r2 = await idme.request('POST', `${IDME}/daftarawam/semakanverification`,
    { _token: tk, ic: CRED.ic }, { Origin: IDME, Referer: `${IDME}/login` });
  const body = typeof r2.data === 'string' ? r2.data : JSON.stringify(r2.data);
  fs.writeFileSync(path.join(OUT, 'idme-password-step.html'), body, 'utf8');
  console.log(`  ✓ ${'idme-password-step.html'.padEnd(28)} ${String(body.length).padStart(8)} 字节  ← semakanverification`);
} catch (e) {
  console.log(`  ✗ idme-password-step.html       失败：${e.message}`);
}

// 月度报表 / 分析页（用于「报表」相关术语）
const EXTRA = [
  ['kehadiran-bulanan.html', `${MOEIS}/sahsiah/kehadiran/laporanbulanan`],
  ['kehadiran-analisa.html', `${MOEIS}/sahsiah/kehadiran/analisakehadiran`],
  ['kehadiran-index.html', `${MOEIS}/sahsiah/kehadiran`],
  ['sahsiah-index.html', `${MOEIS}/sahsiah`],
];
for (const [file, url] of EXTRA) {
  try {
    const r = await idme.request('GET', url, null, { Referer: `${MOEIS}/sahsiah/kehadiran/tabguru` });
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    fs.writeFileSync(path.join(OUT, file), body, 'utf8');
    console.log(`  ✓ ${file.padEnd(28)} ${String(body.length).padStart(8)} 字节  ← ${url}`);
  } catch (e) {
    console.log(`  ✗ ${file.padEnd(28)} 失败：${e.message}`);
  }
}

console.log('\n完成。输出目录：' + path.resolve(OUT));
