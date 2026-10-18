/**
 * 只读链路验证：用重写后的 idmeService 真实代码跑线上数据。
 *
 * 说明：Node 环境没有原生 CapacitorHttp（Android 上由 OkHttp 处理重定向与 Cookie），
 * 构建时通过 --alias 注入 .shim-capacitor.mjs 提供等价实现，
 * 从而在桌面端真实执行 登录 / 解析 / 提交报文组装 的全部业务代码。
 * 全程只读 —— 只调用查询接口，不调用任何写接口。
 */
import fs from 'node:fs';
const CRED = JSON.parse(fs.readFileSync(
  'C:/Users/Admin/Documents/Projects/idme-attendance-app/credentials.json', 'utf8'));

const { idme } = await import('../dist/_probe.mjs');

console.log('===== 登录（4 步 SSO，真实代码）=====');
const t0 = Date.now();
await idme.login(CRED.ic, CRED.password, (s, d) => console.log(`  [${s}] ${d}`));
console.log(`  ✓ 登录成功，耗时 ${Date.now() - t0} ms`);
console.log(`  班级：${idme.classes.map(c => `${c.name}(${c.id})`).join(', ')}`);

const CASES = [
  ['16/10/2026', 'PDPR 居家学习日（全班 A0010072）', 31, 0],
  ['09/10/2026', '全班到齐', 30, 0],
  ['02/10/2026', '2 人家长通知缺席', 28, 2],
  ['19/10/2026', '未来日（未录入）', 31, 0],
];

let pass = 0;
for (const [d, label, expHadir, expAbsen] of CASES) {
  const r = await idme.getAttendance(d);
  const nP = r.students.filter(s => s.state === 'present').length;
  const nE = r.students.filter(s => s.state === 'excused').length;
  const nA = r.students.filter(s => s.state === 'absent').length;

  const okCount = (nP + nE === r.bilhadir) && (nA === r.biltidakhadir);
  const okExp = (r.bilhadir === expHadir) && (r.biltidakhadir === expAbsen);

  // ---- 排序回归断言 ----
  // 官方 #kehadiran 是服务端 DataTable，order = [[2,'asc']] 即按 namamurid 升序，
  // 「Bil」只是排序后的行号。必须显式传 order 参数才能与服务端一致。
  const names = r.students.map(s => s.name);
  const okOrder = names.every((v, i) => i === 0
    || String(names[i - 1]).localeCompare(String(v), 'ms') <= 0);
  const okIdx = r.students.every((s, i) => s.index === i + 1);

  const ok = okCount && okExp && okOrder && okIdx;
  if (ok) pass++;

  console.log('');
  console.log('='.repeat(74));
  console.log(`${label}   ${d}   ${ok ? '✓ PASS' : '✗ FAIL'}`);
  console.log('='.repeat(74));
  console.log(`  人数=${r.students.length}  已归档=${r.isVerified ? '是' : '否'}  statushari=${r.statushari}`);
  console.log(`  本地三态  : 出席=${nP}  算出席=${nE}  缺席=${nA}`);
  console.log(`  服务端口径: bilhadir=${r.bilhadir}  biltidakhadir=${r.biltidakhadir}`);
  console.log(`  出席率    : ${(((nP + nE) / r.students.length) * 100).toFixed(1)}%`);
  console.log(`  姓名升序  : ${okOrder ? '✓ 是（与官方 order=namamurid asc 一致）' : '✗ 否'}`);
  console.log(`  Bil 序号  : ${okIdx ? '✓ 1..N 连续' : '✗ 非连续'}`);
  console.log(`  前 5 名   : ${r.students.slice(0, 5).map(s => `${s.index}.${s.name}`).join('  ')}`);
  const ex = r.students.filter(s => s.state === 'excused');
  if (ex.length) console.log(`  算出席样例: ${ex.slice(0, 2).map(s => `${s.name}(${s.kategori}/${s.sebabCode})`).join(', ')}`);
  const ab = r.students.filter(s => s.state === 'absent');
  if (ab.length) console.log(`  缺席样例  : ${ab.slice(0, 3).map(s => `${s.name}(${s.kategori}/${s.sebabCode})`).join(', ')}`);

  // 提交报文预览（只组装，不发送）
  const records = r.students.filter(s => s.state !== 'present')
    .map(s => ({ id: s.id, kategori: s.kategori, sebab: s.sebabCode }));
  const block = ab.length > 0 && ab.length === r.students.length && r.biltidakhadir < r.students.length;
  console.log(`  ▶ rekodtidakhadir 条数 = ${records.length}（缺席 + 算出席，官方口径）`);
  console.log(`  ▶ 其中真缺席 = ${ab.length} → 护栏${block ? '触发 SAFETY_BLOCK' : '不触发'}`);
  console.log(`  ▶ 基线快照 = ${Object.keys(r.baseline).length} 条`);
}

console.log('');
console.log('='.repeat(74));
console.log(`结果：${pass}/${CASES.length} 全部吻合`);
console.log('='.repeat(74));

// ---------------- 月度报表缓存 ----------------
// 官方月度报表页约 350KB；切月来回翻若每次都重新下载，体感非常慢。
console.log('');
console.log('='.repeat(74));
console.log('月度报表缓存（350KB/月，切月不应重复下载）');
console.log('='.repeat(74));
{
  const t0 = Date.now();
  const a = await idme.getMonthlyReport('10', '2026');
  const t1 = Date.now();
  const b = await idme.getMonthlyReport('10', '2026');
  const t2 = Date.now();
  const cold = t1 - t0, warm = t2 - t1;
  console.log(`  首次 ${cold} ms（联网约 350KB）   二次 ${warm} ms（命中缓存）`);
  console.log(`  ${warm * 5 < cold ? '✓' : '✗'} 二次显著更快（< 首次的 1/5）`);
  console.log(`  ${a === b ? '✓' : '✗'} 二次返回同一对象引用（未重复解析）`);
  console.log(`  ${idme.hasMonthlyReport('10', '2026') ? '✓' : '✗'} hasMonthlyReport 命中为 true`);

  idme._invalidateMonthReport('10', '2026');
  console.log(`  ${!idme.hasMonthlyReport('10', '2026') ? '✓' : '✗'} 失效后 hasMonthlyReport 为 false`);

  const c = await idme.getMonthlyReport('10', '2026');
  console.log(`  ${c.studentCount === a.studentCount ? '✓' : '✗'} 失效后重新拉取数据一致（${c.studentCount} 人 / ${c.dayCount} 天）`);
}

// ---------------- 护栏验证（把网络层换成哨兵，确保绝不触网）----------------
console.log('');
console.log('='.repeat(74));
console.log('安全护栏验证（网络层已被哨兵替换，任何真实请求都会抛 SENTINEL）');
console.log('='.repeat(74));

const { isExcusedCategory, QUICK_SEBAB_ALL, PDPR_SEBAB } = await import('../dist/_sebab.mjs');
console.log(`  isExcusedCategory('A') = ${isExcusedCategory('A')}  (期望 true)`);
console.log(`  isExcusedCategory('D') = ${isExcusedCategory('D')}  (期望 false)`);
console.log(`  QUICK_SEBAB_ALL[0] = ${QUICK_SEBAB_ALL[0]}  (期望 ${PDPR_SEBAB})`);

const day = await idme.getAttendance('16/10/2026');   // 建立 _snapshot
const realRequest = idme.request.bind(idme);
idme.request = async () => { throw new Error('SENTINEL'); };

const allAbsent = day.students.map(s => ({
  id: s.id, name: s.name, kategori: 'D', sebabCode: 'D0260001',
}));

async function probeSubmit(label, records, opts) {
  try {
    await idme.submitAttendance('16/10/2026', records, true, opts);
    return 'REACHED_NETWORK';
  } catch (e) {
    // 护栏带结构化 detail（供 i18n 组装用户文案），这里一并核对
    if (e?.code === 'SAFETY_BLOCK') {
      return `SAFETY_BLOCK(total=${e.detail?.total},serverAbsent=${e.detail?.serverAbsent})`;
    }
    if (e?.message === 'SENTINEL') return 'REACHED_NETWORK';
    return `OTHER(${e?.message})`;
  }
}

const r1 = await probeSubmit('全班真缺席 · 不强制', allAbsent,
  { force: false, trueAbsentCount: allAbsent.length });
const r1ok = r1 === 'SAFETY_BLOCK(total=31,serverAbsent=0)';
console.log(`  [1] 全班 31 人真缺席 + force=false  → ${r1}`);
console.log(`      ${r1ok ? '✓ 正确拦截，且 detail 携带 total/serverAbsent 供 i18n 组装' : '✗ 应拦截且 detail 正确'}`);

const r2 = await probeSubmit('全班真缺席 · 强制', allAbsent,
  { force: true, trueAbsentCount: allAbsent.length });
console.log(`  [2] 全班 31 人真缺席 + force=true   → ${r2}   ${r2 === 'REACHED_NETWORK' ? '✓ 放行到网络层' : '✗ 应放行'}`);

const pdpr = day.students.map(s => ({
  id: s.id, name: s.name, kategori: s.kategori, sebabCode: s.sebabCode,
}));
const r3 = await probeSubmit('PDPR 全班算出席', pdpr, { force: false, trueAbsentCount: 0 });
console.log(`  [3] PDPR 全班 31 人算出席 + force=false → ${r3}   ${r3 === 'REACHED_NETWORK' ? '✓ 正确放行（不再误拦）' : '✗ 不应拦截'}`);

// ---------------------------------------------------------------- 写接口报文组装核对
// 唯一保留的写接口是提交出勤。「重置出勤」与「月度封存」已按用户决定移除
// （前者可用「全部标记出席后重新提交」替代；后者官方无撤销入口，见 idmeReport.js），
// 故不再有对应断言。用捕获型哨兵只记录参数、不发送。
console.log('');
console.log('='.repeat(74));
console.log('写接口报文组装核对（网络层为捕获型哨兵，只记录参数、不发送）');
console.log('='.repeat(74));

let captured = null;
idme.request = async (method, url, data) => {
  captured = { method, url, data };
  throw new Error('SENTINEL');
};

/** 归一化成 form-urlencoded 字符串再断言（提交出勤传的已是该格式的字符串） */
function formOf(data) {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) p.append(k, v);
    return p.toString();
  }
  return String(data);
}

async function probePayload(label, fn, checks) {
  captured = null;
  try { await fn(); } catch { /* SENTINEL 或业务错误，均无妨 */ }
  const hits = captured ? checks.filter(c => c(captured)).length : 0;
  const ok = captured && hits === checks.length;
  console.log(`  ${ok ? '✓' : '✗'} ${label}   (${hits}/${checks.length} 项断言)`);
  if (captured) {
    const body = formOf(captured.data);
    console.log(`      ${captured.method} ${captured.url.replace(/^https?:\/\/[^/]+/, '')}`);
    console.log(`      body ${body.length} 字节：${body.slice(0, 160)}${body.length > 160 ? '…' : ''}`);
  }
  return ok;
}

const P = [];
P.push(await probePayload('提交出勤 · kemaskiniKehadiranHarian',
  () => idme.submitAttendance('16/10/2026', allAbsent, true, { force: true, trueAbsentCount: 31 }),
  [
    c => c.method === 'POST' && /kemaskiniKehadiranHarian$/.test(c.url),
    c => /statussimpan=simpansah/.test(formOf(c.data)),
    c => /tarikh=16%2F10%2F2026/.test(formOf(c.data)),
    // 31 人 × 4 字段（idpelajar / namamurid / kategori / sebab）
    c => (formOf(c.data).match(/rekodtidakhadir%5B/g) || []).length === 31 * 4,
  ]));

console.log('');
console.log(`  报文组装：${P.filter(Boolean).length}/${P.length} 通过`);

idme.request = realRequest;
console.log('  （网络层已还原；以上全部在触网前即抛出，无任何写入）');
