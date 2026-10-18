/**
 * 手写字体覆盖检查（**完全离线**）。
 *
 * 为什么需要这条检查：
 *   src/assets/hand-sign.woff2 是「小莫出品」四字的**子集**，只有 1728 字节。
 *   一旦落款文案改动（改成「小莫手作」、或加个字），子集里没有的字会
 *   **静默回落**到系统黑体 —— 不报错、不警告，界面上一半手写一半黑体。
 *   这种瑕疵肉眼一眼就能看出，但构建流程毫无感知。所以把覆盖关系做成断言。
 *
 * 检查两件事：
 *   [A] i18n 里所有 authorSign 的每个字符都在 unicode-range 里
 *   [B] 字体文件真实存在且是 woff2（防止有人误删 assets 后仍能构建通过）
 *
 * 用法：node tools/check-hand-font.mjs
 */
import fs from 'node:fs';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const readBuf = (rel) => fs.readFileSync(new URL(rel, import.meta.url));

let PASS = 0;
let FAIL = 0;
function check(label, cond, extra = '') {
  if (cond) { PASS++; console.log(`    ✓ ${label}`); }
  else { FAIL++; console.log(`    ✗ ${label}${extra ? `  ← ${extra}` : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`); }

section('[A] 落款文案的每个字都在字体子集内');

const fonts = read('../src/styles/fonts.css');
const i18n = read('../src/i18n.js');

// 从 fonts.css 的 unicode-range 解析出可用码点集合
const rangeLine = /unicode-range:\s*([^;]+);/.exec(fonts);
check('fonts.css 声明了 unicode-range（限定子集，不误伤其它文本）', !!rangeLine);
const covered = new Set();
for (const part of (rangeLine?.[1] || '').split(',')) {
  const m = /U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/.exec(part.trim());
  if (!m) continue;
  const lo = parseInt(m[1], 16);
  const hi = m[2] ? parseInt(m[2], 16) : lo;
  for (let c = lo; c <= hi; c++) covered.add(c);
}
check('解析出可用码点', covered.size > 0, `共 ${covered.size} 个`);

// 抓 i18n 里所有 authorSign 的值（三种语言各一份，值应相同）
const signs = [...i18n.matchAll(/authorSign:\s*'([^']*)'/g)].map(m => m[1]);
check('i18n 中存在 authorSign', signs.length > 0, `找到 ${signs.length} 处`);

const missing = new Set();
for (const s of signs) {
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    // 跳过空白与标点（不参与手写感判断）
    if (/\s/.test(ch)) continue;
    if (!covered.has(cp)) missing.add(`${ch}(U+${cp.toString(16).toUpperCase()})`);
  }
}
check('落款每个字都有字形（缺字会静默回落成黑体）',
  missing.size === 0, `缺失：${[...missing].join(' ')}`);

// 三种语言的落款应完全一致 —— 它是品牌名，不随语言变
check('三种语言的落款文案一致',
  new Set(signs).size === 1, [...new Set(signs)].join(' / '));

section('[B] 字体文件本体');

let buf = null;
try { buf = readBuf('../src/assets/hand-sign.woff2'); } catch { /* 下面报 */ }
check('src/assets/hand-sign.woff2 存在', !!buf);
if (buf) {
  // wOF2 = 77 4F 46 32
  check('文件是 woff2 格式（魔数 wOF2）',
    buf[0] === 0x77 && buf[1] === 0x4F && buf[2] === 0x46 && buf[3] === 0x32,
    `实际 ${buf.subarray(0, 4).toString('hex')}`);
  // 子集字体应当很小；超过 100KB 说明有人换成了完整字体，包体会膨胀
  check('字体体积在子集范围内（< 100KB）',
    buf.length < 100 * 1024, `实际 ${buf.length} 字节`);
}

section(`结果：${PASS} 通过 / ${FAIL} 失败`);
if (FAIL) console.log('  ✗ 存在失败断言，请检查上方 ✗ 行');
else console.log('  ✓ 手写落款字体覆盖完整（未触网）');
process.exit(FAIL ? 1 : 0);
