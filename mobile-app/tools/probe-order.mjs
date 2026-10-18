/**
 * 只读探针：查清「App 学生顺序 ≠ 官方页面顺序」的根因。
 *
 * 背景：官方 tabguru 页把 #kehadiran 初始化为 DataTable，配置为
 *   "serverSide": true, "order": [[2, 'asc']]   // 第 2 列 = namamurid
 *   "columns": [bil, kehadiran, namamurid, sebabtidakhadir]
 * 且 ajax 会把 order / columns / search 一并 POST 给服务端 —— 即「服务端按姓名排序」。
 * 而「Bil」列的 render 是 meta.row + 1，只是排序后的行号。
 *
 * 我们的 App 只发了 draw/start/length，没发 order/columns，
 * 因此拿到的是服务端默认序，与官方页面不一致。
 *
 * 本脚本用真实账号登录，对同一日期发三组只读请求：
 *   A. 我们的参数（无 order）
 *   B. 官方参数（order[0][column]=2 & dir=asc）
 *   C. 官方参数但 dir=desc（反向验证服务端确实在听 order）
 * 然后打印各自前 12 个姓名，并判定是否严格按姓名升序。
 *
 * 全程只读 —— 只调用查询接口 ajaxloadkehadiranharian。
 */
import fs from 'node:fs';
const CRED = JSON.parse(fs.readFileSync(
  'C:/Users/Admin/Documents/Projects/idme-attendance-app/credentials.json', 'utf8'));

// dist/ 会被 vite build 清空，故这里给出明确的前置提示而不是 MODULE_NOT_FOUND
if (!fs.existsSync('dist/_probe.mjs')) {
  console.error('缺少 dist/_probe.mjs —— 请先运行：npm run probe');
  process.exit(1);
}
const { idme } = await import('../dist/_probe.mjs');

const ORIGIN = 'https://moeispel.moe.gov.my';
const URL_HADIR = `${ORIGIN}/sahsiah/kehadiran/ajaxloadkehadiranharian`;
const HDR = {
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  Origin: ORIGIN,
  Referer: `${ORIGIN}/sahsiah/kehadiran/tabguru`,
};

/** DataTables 1.x 风格的 columns 参数（与官方页一致，4 列） */
function officialColumns() {
  const cols = [
    { data: 'bil', orderable: 'true' },
    { data: 'kehadiran', orderable: 'true' },
    { data: 'namamurid', orderable: 'true' },
    { data: 'sebabtidakhadir', orderable: 'true' },
  ];
  const p = {};
  cols.forEach((c, i) => {
    p[`columns[${i}][data]`] = c.data;
    p[`columns[${i}][name]`] = '';
    p[`columns[${i}][searchable]`] = 'true';
    p[`columns[${i}][orderable]`] = c.orderable;
    p[`columns[${i}][search][value]`] = '';
    p[`columns[${i}][search][regex]`] = 'false';
  });
  p['search[value]'] = '';
  p['search[regex]'] = 'false';
  return p;
}

async function fetchRaw(dateStr, extra) {
  const cls = idme.currentClass();
  const body = {
    _token: idme.moeisToken,
    id_profile_kelas: cls.id,
    tarikhpilihan: dateStr,
    draw: '1',
    start: '0',
    length: '100',
    ...extra,
  };
  const resp = await idme.request('POST', URL_HADIR, body, HDR);
  let j = resp.data;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch { /* keep */ } }
  return j;
}

const parseNames = (j) => (j?.data || []).map(r => ({
  name: String(r.namamurid || r.individu?.nama || '').trim(),
  bil: r.bil,
  id: r.id_individu,
  kehadiran: String(r.kehadiran || '').includes('checked') ? 'C' : '.',
}));

const isAsc = (arr) => arr.every((v, i) => i === 0
  || String(arr[i - 1]).localeCompare(String(v), 'ms') <= 0);

// ---------------------------------------------------------------- 登录
console.log('===== 登录（4 步 SSO，真实代码）=====');
await idme.login(CRED.ic, CRED.password, () => {});
console.log(`  ✓ 登录成功  班级：${idme.classes.map(c => `${c.name}(${c.id})`).join(', ')}`);

const DATE = '16/10/2026';

// ---------------------------------------------------------------- A
const a = parseNames(await fetchRaw(DATE, {}));
// ---------------------------------------------------------------- B
const b = parseNames(await fetchRaw(DATE, {
  'order[0][column]': '2', 'order[0][dir]': 'asc', 'order[0][name]': '',
  ...officialColumns(),
}));
// ---------------------------------------------------------------- C
const c = parseNames(await fetchRaw(DATE, {
  'order[0][column]': '2', 'order[0][dir]': 'desc', 'order[0][name]': '',
  ...officialColumns(),
}));

function report(label, rows) {
  const names = rows.map(r => r.name);
  const bils = rows.map(r => r.bil);
  console.log('');
  console.log('='.repeat(78));
  console.log(`${label}   共 ${rows.length} 人`);
  console.log('='.repeat(78));
  console.log(`  姓名升序？ ${isAsc(names) ? '✓ 是' : '✗ 否'}`);
  const bilNumeric = bils.every(v => v === null || v === undefined || v === '' || Number.isFinite(Number(v)));
  console.log(`  bil 字段： ${JSON.stringify(bils.slice(0, 8))}  ${bilNumeric ? '(全为数字/空)' : '(含非数字)'}`);
  console.log('  前 12 个：');
  rows.slice(0, 12).forEach((r, i) => {
    console.log(`    ${String(i + 1).padStart(2)}. [${r.kehadiran}] ${r.name.padEnd(28)} bil=${r.bil ?? '-'}`);
  });
}

report('A. 我们的参数（无 order / columns）', a);
report('B. 官方参数 order=namamurid asc', b);
report('C. 官方参数 order=namamurid desc', c);

// ---------------------------------------------------------------- 差异
console.log('');
console.log('='.repeat(78));
console.log('差异判定');
console.log('='.repeat(78));
const sameAB = JSON.stringify(a.map(r => r.name)) === JSON.stringify(b.map(r => r.name));
const sameAC = JSON.stringify(a.map(r => r.name)) === JSON.stringify(c.map(r => r.name));
console.log(`  A 与 B 顺序一致？ ${sameAB ? '✓ 是（说明服务端默认序恰好=姓名升序）' : '✗ 否（确认存在排序差异）'}`);
console.log(`  A 与 C 顺序一致？ ${sameAC ? '✓ 是' : '✗ 否'}`);
console.log(`  B 与 C 是否互为逆序？ ${
  JSON.stringify(b.map(r => r.name)) === JSON.stringify([...c.map(r => r.name)].reverse())
    ? '✓ 是（服务端确实按 order 参数排序）' : '✗ 否'}`);

if (!sameAB) {
  console.log('');
  console.log('  A 序 vs B 序 逐位对照（前 15）：');
  console.log(`    ${'A(我们的)'.padEnd(30)} | B(官方)`.padEnd(30));
  for (let i = 0; i < 15; i++) {
    console.log(`    ${String(a[i]?.name || '').padEnd(30)} | ${String(b[i]?.name || '')}`);
  }
  console.log('');
  console.log('  B 序中每个名字在 A 序里的下标（验证是否只是重排）：');
  const idxInA = new Map(a.map((r, i) => [r.name, i]));
  const perm = b.map(r => idxInA.get(r.name));
  console.log(`    ${perm.slice(0, 20).join(', ')}${perm.length > 20 ? ' ...' : ''}`);
  console.log(`    是否同一集合（仅顺序不同）：${perm.every(v => v !== undefined) ? '✓ 是' : '✗ 否（存在缺漏）'}`);
}
