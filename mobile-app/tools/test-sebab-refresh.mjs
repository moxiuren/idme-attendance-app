/**
 * 性能回归测试：refreshSebab 的失败路径成本（完全离线）。
 *
 * 为什么单测这个：
 *   旧实现 12 次串行 POST，每次 405 —— 真实网络探针实测合计 **9.8 秒**
 *   （scratch/probe-sebab.py）。这段时间与名单加载、350KB 月报预热并发抢带宽，
 *   移动网络下直接拖慢首屏。
 *
 * 新实现「首败即停」，预期只花 1 次请求的时间。
 *
 * 做法：把 idme.request 换成计数桩，数它被调用几次、用什么方法。
 *   不触网、不依赖服务端状态，可重复执行。
 *
 * 前置：node tools/build-probe.mjs
 * 用法：node tools/test-sebab-refresh.mjs
 */
import { idme } from '../dist/_probe.mjs';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`    ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

/** 把单例恢复成可测状态，并换上一台记录调用、返回固定响应的桩 */
function stub(status, body = '') {
  idme.isLoggedIn = true;
  idme.moeisToken = 'stub-token';
  const calls = [];
  idme.request = async (method, url, data) => {
    calls.push({ method, url, data });
    return { status, data: body, headers: {}, url };
  };
  return calls;
}

console.log('='.repeat(74));
console.log('[A] 405（当前生产实际响应）：首败即停，不该跑满 12 次');
console.log('='.repeat(74));

{
  const calls = stub(405);
  const added = await idme.refreshSebab();
  check('返回 0（没拿到新词条）', added === 0, `added=${added}`);
  check('只发 1 次请求', calls.length === 1, `实际 ${calls.length} 次`);
  check('用 GET（与官方 jQuery $.ajax 默认一致）',
    calls[0]?.method === 'GET', `实际 ${calls[0]?.method}`);
  check('GET 不带 body', calls[0]?.data === null || calls[0]?.data === undefined,
    `实际 ${JSON.stringify(calls[0]?.data)}`);
}

console.log('');
console.log('='.repeat(74));
console.log('[B] 200 + HTML 拦截页（Imperva）：同样判为不可用，立即停');
console.log('='.repeat(74));

{
  const calls = stub(200, '<html><head><title>Kementerian Pendidikan Malaysia</title></head></html>');
  const added = await idme.refreshSebab();
  check('返回 0', added === 0, `added=${added}`);
  check('只发 1 次请求', calls.length === 1, `实际 ${calls.length} 次`);
}

console.log('');
console.log('='.repeat(74));
console.log('[C] 200 + 正常 JSON：12 分类全部拉完并合并');
console.log('='.repeat(74));

{
  idme.isLoggedIn = true;
  idme.moeisToken = 'stub-token';
  const calls = [];
  idme.request = async (method, url) => {
    calls.push(url);
    const kat = url.split('/').pop();
    return {
      status: 200,
      data: [{ id_sebab_thadir: `X${kat}0001`, keterangan: `NEW ${kat}`, kategori: kat }],
      headers: {},
    };
  };
  const added = await idme.refreshSebab();
  check('12 分类全部请求到', calls.length === 12, `实际 ${calls.length} 次`);
  check('12 条全部合并进字典', added === 12, `added=${added}`);
}

console.log('');
console.log('='.repeat(74));
console.log('[D] 探针成功、后续失败：不该整体放弃');
console.log('='.repeat(74));

{
  idme.isLoggedIn = true;
  idme.moeisToken = 'stub-token';
  const calls = [];
  idme.request = async (method, url) => {
    calls.push(url);
    const kat = url.split('/').pop();
    if (kat === 'B') {
      return {
        status: 200,
        data: [{ id_sebab_thadir: 'XBB0001', keterangan: 'NEW B', kategori: 'B' }],
        headers: {},
      };
    }
    return { status: 405, data: '', headers: {} };
  };
  const added = await idme.refreshSebab();
  check('探针成功 → 继续尝试其余分类', calls.length === 12, `实际 ${calls.length} 次`);
  check('只合并成功的那一条', added === 1, `added=${added}`);
}

console.log('');
console.log('='.repeat(74));
console.log('[E] 未登录：直接返回，不发任何请求');
console.log('='.repeat(74));

{
  idme.isLoggedIn = false;
  const calls = [];
  idme.request = async (method, url) => { calls.push(url); return { status: 200, data: [] }; };
  const added = await idme.refreshSebab();
  check('返回 0', added === 0, `added=${added}`);
  check('零请求', calls.length === 0, `实际 ${calls.length} 次`);
}

console.log('');
console.log('='.repeat(74));
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(74));
process.exit(fail ? 1 : 0);
