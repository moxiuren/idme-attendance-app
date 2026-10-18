/**
 * 线上更新链路端到端验证（**会触网**，但只读）。
 *
 * 为什么必须有这个脚本：契约测试全部离线，它能证明「逻辑对」，但不能证明
 * 「线上那份清单真的能拉到、里面的哈希真的对得上 Release 附件」。
 * 后者才是老师实际会走的路径 —— 清单地址写错一个字母、Release 传了别的包、
 * Pages 没部署，都只有真拉一次才暴露。
 *
 * 四步，对应客户端启动时的完整路径：
 *   1. 拉线上 version.json（与 App 同一个 URL）
 *   2. normalizeManifest 校验 —— 客户端拒绝就说明线上清单是废的
 *   3. isNewer 判定 —— 分别模拟「已是最新」与「有新版本」两种本地版本
 *   4. 真下载 APK 并算 SHA-256 —— 与清单比对。不一致 = 老师下载完校验失败
 *
 * 用法：node tools/verify-live-update.mjs
 */
import crypto from 'node:crypto';
import { fetchManifest, normalizeManifest, isNewer, MANIFEST_URL, noteFor } from '../src/updater.js';

const LINE = '='.repeat(74);
let PASS = 0;
let FAIL = 0;

function check(label, cond, extra = '') {
  if (cond) { PASS++; console.log(`  [通过] ${label}`); }
  else { FAIL++; console.log(`  [失败] ${label}${extra ? `  <- ${extra}` : ''}`); }
}

console.log(LINE);
console.log('线上更新链路验证');
console.log(LINE);
console.log(`清单地址: ${MANIFEST_URL}\n`);

// ---- 1. 拉清单 ----
let raw;
try {
  raw = await fetchManifest(MANIFEST_URL);
} catch (e) {
  console.log(`  [失败] 拉取清单失败: ${e.message}`);
  process.exit(1);
}
check('线上清单可拉取（HTTP 200 + 合法 JSON）', !!raw);

// ---- 2. 校验 ----
const m = normalizeManifest(raw);
check('清单通过客户端校验（normalizeManifest 非 null）', m !== null);
if (!m) {
  console.log('\n清单不可用，后续步骤跳过。原始内容：');
  console.log(JSON.stringify(raw, null, 2));
  process.exit(1);
}

console.log(`\n  版本      : ${m.versionName} (code ${m.versionCode})`);
console.log(`  APK 地址  : ${m.apk}`);
console.log(`  体积      : ${(m.size / 1048576).toFixed(2)} MB`);
console.log(`  SHA-256   : ${m.sha256}`);
console.log(`  发布日期  : ${m.published}`);
console.log(`  更新说明  : ${noteFor(m, 'zh') || '(无)'}\n`);

check('清单不是占位态（sha256 非全 0、size > 0）',
  !/^0+$/.test(m.sha256) && m.size > 0);
check('APK 是绝对地址（客户端 resolveUrl 后可直接下载）',
  /^https:\/\//i.test(m.apk));
check('三语更新说明齐全', ['ms', 'zh', 'en'].every(k => m.notes?.[k]));

// ---- 3. 版本判定 ----
check('本地 code 与线上相同 → 不提示更新', isNewer(m.versionCode, m.versionCode) === false);
check('本地 code 低一版 → 提示更新', isNewer(m.versionCode, m.versionCode - 1) === true);

// ---- 4. 真下载并校验哈希 ----
// 这是唯一能证明「清单里的哈希对应的是这个包」的方法。
// 客户端下载完会做同一件事，不一致就拒绝安装。
console.log('\n  正在下载 APK 校验哈希...');
const t0 = Date.now();
let buf;
try {
  const r = await fetch(m.apk, { redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  buf = Buffer.from(await r.arrayBuffer());
} catch (e) {
  console.log(`  [失败] 下载失败: ${e.message}`);
  process.exit(1);
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const actual = crypto.createHash('sha256').update(buf).digest('hex');

console.log(`  下载完成 : ${buf.length} 字节，耗时 ${secs}s`);
console.log(`  实际哈希 : ${actual}\n`);

check('下载体积与清单一致', buf.length === m.size,
  `清单 ${m.size} vs 实际 ${buf.length}`);
check('下载内容哈希与清单一致（客户端校验会通过）', actual === m.sha256);

console.log(LINE);
console.log(`结果: ${PASS} 通过 / ${FAIL} 失败`);
console.log(LINE);
process.exit(FAIL === 0 ? 0 : 1);
