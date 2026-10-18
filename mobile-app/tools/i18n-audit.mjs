#!/usr/bin/env node
/**
 * i18n 完整性审计
 *
 * 检查三件事：
 *   1. 代码里用到的 t('key') 是否在 ms / zh 两份字典里都存在
 *   2. 两份字典的 key 集合是否一致（防止切到中文时静默回落成马来文）
 *   3. 占位符是否对齐（ms 里有 {n}，zh 里也必须有 {n}，否则渲染出字面量）
 *   4. 有无定义了但没人用的 key（死词条）
 *
 * 退出码 0 = 全过。
 * 用法：node tools/i18n-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const I18N = path.join(SRC, 'i18n.js');

const src = fs.readFileSync(I18N, 'utf8');

/** 从源码里切出 `ms: { ... },` / `zh: { ... },` 两个顶层块 */
function sliceLangBlock(code, name) {
  const start = code.indexOf(`\n  ${name}: {`);
  if (start < 0) return null;
  // 顶层块以 "\n  }," 结束（缩进 2 空格）
  const end = code.indexOf('\n  },', start);
  if (end < 0) return null;
  return code.slice(start, end);
}

function parseEntries(block) {
  const out = new Map();
  const re = /^\s{4}(\w+):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,/gm;
  let m;
  while ((m = re.exec(block))) {
    const val = (m[2] !== undefined ? m[2] : m[3]) || '';
    out.set(m[1], val);
  }
  return out;
}

// 语言清单从 i18n.js 的 LANGS 导出里读，新增语言时审计自动跟上，
// 不需要在脚本里再改一遍（改两处必然漏一处）。
const langCodes = [...src.matchAll(/\{\s*code:\s*'(\w+)'/g)].map(m => m[1]);
const DICTS = new Map(langCodes.map(c => [c, parseEntries(sliceLangBlock(src, c) || '')]));
const ms = DICTS.get('ms');
const zh = DICTS.get('zh');
const OTHER = langCodes.filter(c => c !== 'ms');   // 以 ms 为基准，其余语言必须齐平

if (!ms.size || !zh.size) {
  console.error('✗ 未能解析出字典块，请检查 i18n.js 结构');
  process.exit(1);
}

/** 递归收集源码文件（必须递归 —— composables/ 子目录也在用 t()） */
function collectSources(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectSources(full));
    else if (/\.(vue|js)$/.test(e.name) && e.name !== 'i18n.js') out.push(full);
  }
  return out;
}

/**
 * 收集源码里所有 t('key') 调用
 *
 * 除了字面量 t('key')，还要收集 errors.js 里 ERR_KEYS 映射表的**值** ——
 * 那边是 t(errorKey(err.code)) 动态取 key，正则看不见。
 * 若不收集，这 11 条错误文案会被误判成死词条，而真正的拼写错误反而查不出来。
 */
const used = new Map();   // key -> [文件]
for (const full of collectSources(SRC)) {
  const text = fs.readFileSync(full, 'utf8');
  const f = path.relative(SRC, full).replace(/\\/g, '/');

  // 形如 t('updCheck')
  const re = /\bt\(\s*'([A-Za-z]\w*)'/g;
  let m;
  while ((m = re.exec(text))) {
    if (!used.has(m[1])) used.set(m[1], []);
    if (!used.get(m[1]).includes(f)) used.get(m[1]).push(f);
  }

  // 形如 errorKey.value = 'updCheckFailed' —— 状态机里「先存 key、后由模板翻译」的写法。
  // 这类引用藏在赋值右侧，t('key') 正则看不见，会把 updOnlyOnDevice 等误判成死词条。
  // 收进来是安全的：key 若拼错，第 1 项「代码引用但字典缺失」会立刻报红。
  const reKey = /\b\w*[Kk]ey\.value\s*=\s*'([A-Za-z]\w*)'/g;
  while ((m = reKey.exec(text))) {
    if (!used.has(m[1])) used.set(m[1], []);
    if (!used.get(m[1]).includes(f)) used.get(m[1]).push(f);
  }
}

// ---- 收集动态 key：errors.js 的 ERR_KEYS 值 + ERR_FALLBACK ----
const ERRORS = path.join(SRC, 'errors.js');
if (fs.existsSync(ERRORS)) {
  const code = fs.readFileSync(ERRORS, 'utf8');
  const f = path.relative(SRC, ERRORS).replace(/\\/g, '/');
  const mapStart = code.indexOf('export const ERR_KEYS = {');
  if (mapStart >= 0) {
    const mapEnd = code.indexOf('};', mapStart);
    const block = mapEnd > mapStart ? code.slice(mapStart, mapEnd) : '';
    // 形如：  BAD_IC: 'errBadIc',
    const re = /^\s*\w+:\s*'([A-Za-z]\w*)'\s*,/gm;
    let m;
    while ((m = re.exec(block))) {
      if (!used.has(m[1])) used.set(m[1], []);
      if (!used.get(m[1]).includes(f)) used.get(m[1]).push(f);
    }
  }
  // 兜底 key：export const ERR_FALLBACK = 'errUnknown';
  const fb = /export const ERR_FALLBACK = '([A-Za-z]\w*)'/.exec(code);
  if (fb) {
    if (!used.has(fb[1])) used.set(fb[1], []);
    if (!used.get(fb[1]).includes(f)) used.get(fb[1]).push(f);
  }
}

// ---- 收集「以参数形式传递」的 key：idmeCore.js 的 onProgress('1/4', 'bootStep1') ----
// 服务层不持有界面语言，故把 i18n key 当数据抛给调用方，由 App.vue 用 t() 翻译。
// 正则 t('key') 看不见这种间接引用，会把 bootStep1..4 误报成死词条 ——
// 而误报比漏报更危险：维护者看到「死词条」就会删掉它，可它正在使用中。
const CORE = path.join(SRC, 'idmeCore.js');
if (fs.existsSync(CORE)) {
  const code = fs.readFileSync(CORE, 'utf8');
  const f = path.relative(SRC, CORE).replace(/\\/g, '/');
  // 形如：  onProgress('1/4', 'bootStep1');
  const re = /onProgress\(\s*'[^']*'\s*,\s*'([A-Za-z]\w*)'\s*\)/g;
  let m;
  while ((m = re.exec(code))) {
    if (!used.has(m[1])) used.set(m[1], []);
    if (!used.get(m[1]).includes(f)) used.get(m[1]).push(f);
  }
}

const placeholders = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(x => x[1]))].sort();
const sameSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

let fail = 0;

// ---- 1. 代码用到的 key 是否都存在 ----
console.log('='.repeat(84));
console.log('1. 代码引用但字典缺失的 key');
console.log('='.repeat(84));
const missing = [];
for (const [k, where] of [...used].sort()) {
  const lacks = OTHER.filter(c => !DICTS.get(c).has(k));
  if (lacks.length) missing.push([k, lacks, where]);
}
if (missing.length) {
  fail += missing.length;
  for (const [k, lacks, where] of missing) {
    console.log(`  ✗ ${k.padEnd(22)} 缺于 ${lacks.join('/')}   ← ${where.join(', ')}`);
  }
} else {
  console.log(`  ✓ 全部存在（共 ${used.size} 个 key，语言 ${langCodes.join('/')}）`);
}

// ---- 2. 各语言字典 key 集合是否与 ms 一致 ----
console.log('');
console.log('='.repeat(84));
console.log(`2. 各语言字典 key 集合差异（基准 = ms）`);
console.log('='.repeat(84));
const diffs = [];
for (const c of OTHER) {
  const d = DICTS.get(c);
  const onlyBase = [...ms.keys()].filter(k => !d.has(k)).sort();
  const onlyThis = [...d.keys()].filter(k => !ms.has(k)).sort();
  if (onlyBase.length || onlyThis.length) diffs.push([c, onlyBase, onlyThis]);
}
if (diffs.length) {
  for (const [c, onlyBase, onlyThis] of diffs) {
    fail += onlyBase.length + onlyThis.length;
    onlyBase.forEach(k => console.log(`  ✗ ${c} 缺：${k}`));
    onlyThis.forEach(k => console.log(`  ✗ ${c} 多出：${k}`));
  }
} else {
  console.log(`  ✓ 完全一致（${langCodes.map(c => `${c}=${DICTS.get(c).size}`).join(' / ')}）`);
}

// ---- 3. 占位符是否对齐 ----
console.log('');
console.log('='.repeat(84));
console.log('3. 占位符对齐（{n} 等必须各语言都有）');
console.log('='.repeat(84));
const phDiff = [];
for (const k of ms.keys()) {
  const base = placeholders(ms.get(k));
  for (const c of OTHER) {
    const d = DICTS.get(c);
    if (!d.has(k)) continue;
    const b = placeholders(d.get(k));
    if (!sameSet(base, b)) phDiff.push([k, c, base, b]);
  }
}
if (phDiff.length) {
  fail += phDiff.length;
  for (const [k, c, a, b] of phDiff) {
    console.log(`  ✗ ${k.padEnd(22)} ms=[${a}]  ${c}=[${b}]`);
  }
} else {
  console.log('  ✓ 全部对齐');
}

// ---- 4. 定义但未使用 ----
console.log('');
console.log('='.repeat(84));
console.log('4. 定义了但代码未引用的 key（死词条）');
console.log('='.repeat(84));
const unused = [...ms.keys()].filter(k => !used.has(k)).sort();
if (unused.length) {
  console.log(`  · ${unused.length} 个：${unused.join(', ')}`);
} else {
  console.log('  ✓ 无');
}

// ---- 结果 ----
console.log('');
console.log('='.repeat(84));
if (fail) {
  console.log(`结果：✗ ${fail} 处问题`);
  console.log('='.repeat(84));
  process.exit(1);
}
console.log(`结果：全部通过 ✅  （${langCodes.map(c => `${c}=${DICTS.get(c).size}`).join(' / ')} 条，代码引用 ${used.size} 条）`);
console.log('='.repeat(84));
