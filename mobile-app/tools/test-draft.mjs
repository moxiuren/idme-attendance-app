/**
 * 草稿持久化契约测试（**完全离线**）。
 *
 * 覆盖 `src/draft.js` 的纯逻辑 + Preferences 交互：
 *   [A] applyDraft —— 按 id 合并、缺员统计、diff 判定
 *   [B] snapshotOf —— 只提取可持久化字段，不夹带学生对象
 *   [C] save/load/clear —— 按 date+classId 分键、LRU 上限、过期清理
 *
 * 为什么值得单独测：草稿是「教师点了半节课被打断」的最后一道保险，
 * 它悄悄坏掉时不会有任何报错，只会在某天该恢复时什么都没恢复。
 *
 * 用法：node tools/build-probe.mjs && node tools/test-draft.mjs
 * 前置：dist/_draft.mjs（Preferences 用内存垫片，不触网、不碰真实存储）
 *
 * 为什么不直接 import '../src/draft.js'：
 *   draft.js 依赖真实的 @capacitor/preferences，其 web 实现在 Node 下
 *   访问 `window.localStorage` 会抛 ReferenceError。走 esbuild 打包 +
 *   alias 到 tools/shim-preferences.mjs，被测的仍是同一份 draft.js 源码。
 */
import {
  Preferences,
  snapshotOf, saveDraft, loadDraft, clearDraft, applyDraft,
} from '../dist/_draft.mjs';

let PASS = 0;
let FAIL = 0;

function check(label, cond, extra = '') {
  if (cond) { PASS++; console.log(`    ✓ ${label}`); }
  else { FAIL++; console.log(`    ✗ ${label}${extra ? `  ← ${extra}` : ''}`); }
}
function section(title) {
  console.log(`\n${'='.repeat(74)}\n${title}\n${'='.repeat(74)}`);
}

const STORE = 'idme_drafts';
const reset = () => Preferences.remove({ key: STORE });
const raw = async () => {
  const { value } = await Preferences.get({ key: STORE });
  return value ? JSON.parse(value) : [];
};

/** 造一个学生对象（字段与 idmeAttendance.js 的产出保持一致） */
const stu = (id, name, state = 'present', sebab = '') => ({
  index: 0, id, name, gender: '男',
  checked: state === 'present', hasRecord: !!sebab,
  sebabCode: sebab, kategori: sebab ? sebab.charAt(0) : '',
  sebabName: sebab ? `Sebab ${sebab}` : '',
  state, isPresent: state !== 'absent',
});

// ================================================================ A. applyDraft
section('[A] applyDraft —— 把草稿状态合并进当前名单');

await reset();
{
  const current = [stu('A1', 'AHMAD'), stu('A2', 'BETI'), stu('A3', 'CHONG')];
  const draft = {
    students: {
      A1: { state: 'absent', sebabCode: 'D0260001', sebabName: 'Sakit', kategori: 'D' },
      A2: { state: 'present', sebabCode: '', sebabName: '', kategori: '' },
    },
  };
  const r = applyDraft(current, draft);

  check('A1 被改成缺席', current[0].state === 'absent');
  check('A1 的假因一并恢复', current[0].sebabCode === 'D0260001');
  check('A1 的 isPresent 同步为 false', current[0].isPresent === false);
  check('A2 保持出席（与草稿一致，但仍计入 applied）', current[1].state === 'present');
  check('A3 草稿里没有 → 不受影响', current[2].state === 'present');
  check('applied = 2（草稿命中的条数）', r.applied === 2, `实际 ${r.applied}`);
  check('diff = 1（真正改变状态的只有 A1）', r.diff === 1, `实际 ${r.diff}`);
  check('missing = 0', r.missing === 0, `实际 ${r.missing}`);
}

{
  // 草稿里有、当前名单没有（转学 / 调班）→ 计入 missing，不凭空造学生
  const current = [stu('A1', 'AHMAD')];
  const r = applyDraft(current, {
    students: {
      A1: { state: 'absent', sebabCode: 'D1' },
      GONE: { state: 'excused', sebabCode: 'A0010072' },
    },
  });
  check('已不在名单的草稿条目计入 missing', r.missing === 1, `实际 ${r.missing}`);
  check('不会把已转学的学生塞回名单', current.length === 1);
}

{
  // 草稿与当前完全一致 → diff = 0（调用方据此静默丢弃，不弹「已恢复」）
  const current = [stu('A1', 'AHMAD', 'present')];
  const r = applyDraft(current, {
    students: { A1: { state: 'present', sebabCode: '', sebabName: '', kategori: '' } },
  });
  check('状态一致时 diff = 0', r.diff === 0, `实际 ${r.diff}`);
}

{
  // 草稿为空 / 缺失 → 安全空操作
  const current = [stu('A1', 'AHMAD')];
  const r1 = applyDraft(current, null);
  const r2 = applyDraft(current, {});
  check('null 草稿不抛错且 applied=0', r1.applied === 0);
  check('空对象草稿不抛错且 applied=0', r2.applied === 0);
  check('名单未被改动', current[0].state === 'present');
}

// ================================================================ B. snapshotOf
section('[B] snapshotOf —— 只提取可持久化字段');

{
  const list = [stu('A1', 'AHMAD', 'absent', 'D0260001')];
  const snap = snapshotOf(list);
  const rec = snap.A1;
  check('按 id 建键', !!rec);
  check('保留 state', rec.state === 'absent');
  check('保留 sebabCode', rec.sebabCode === 'D0260001');
  check('保留 kategori', rec.kategori === 'D');
  check('不夹带学生姓名（姓名以服务端为准）', rec.name === undefined);
  check('不夹带序号 / 性别等展示字段', rec.index === undefined && rec.gender === undefined);
  check('快照是纯 JSON 可序列化对象', (() => {
    try { JSON.parse(JSON.stringify(snap)); return true; } catch { return false; }
  })());
}

// ================================================================ C. save / load / clear
section('[C] save / load / clear —— 分键、上限、过期');

await reset();
{
  await saveDraft({ date: '16/10/2026', classId: 'K1', className: 'TAHUN SATU B',
    students: { A1: { state: 'absent', sebabCode: 'D1' } } });

  const got = await loadDraft('16/10/2026', 'K1');
  check('按 date+classId 能读回', !!got);
  check('班级名一并保存', got.className === 'TAHUN SATU B');
  check('savedAt 是时间戳', typeof got.savedAt === 'number' && got.savedAt > 0);
  check('学生状态完整保留', got.students.A1.state === 'absent');

  check('不同日期读不到', (await loadDraft('17/10/2026', 'K1')) === null);
  check('不同班级读不到', (await loadDraft('16/10/2026', 'K2')) === null);
}

{
  // 同 date+classId 再存一次 → 覆盖而非追加
  await saveDraft({ date: '16/10/2026', classId: 'K1', className: 'X',
    students: { A1: { state: 'present', sebabCode: '' } } });
  const all = await raw();
  const same = all.filter(d => d.date === '16/10/2026' && d.classId === 'K1');
  check('同一日期+班级只保留一条', same.length === 1, `实际 ${same.length}`);
  check('内容被最新一次覆盖', same[0].students.A1.state === 'present');
}

{
  // 超过 5 条 → 丢最旧的
  await reset();
  for (let i = 1; i <= 7; i++) {
    await saveDraft({ date: `${String(i).padStart(2, '0')}/10/2026`, classId: 'K1',
      className: 'X', students: {} });
  }
  const all = await raw();
  check('最多保留 5 条', all.length === 5, `实际 ${all.length}`);
  check('保留的是最新的（07/10 在）', all.some(d => d.date === '07/10/2026'));
  check('最旧的被丢弃（01/10 不在）', !all.some(d => d.date === '01/10/2026'));
}

{
  // 过期清理：把 savedAt 改成 8 天前，load 时应被清掉
  await reset();
  await saveDraft({ date: '01/09/2026', classId: 'K1', className: 'X', students: {} });
  const arr = await raw();
  arr[0].savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  await Preferences.set({ key: STORE, value: JSON.stringify(arr) });

  const got = await loadDraft('01/09/2026', 'K1');
  check('超过 7 天的草稿读不到', got === null);
  check('过期条目已被顺手清出存储', (await raw()).length === 0);
}

{
  await reset();
  await saveDraft({ date: '16/10/2026', classId: 'K1', className: 'X', students: {} });
  await clearDraft('16/10/2026', 'K1');
  check('clearDraft 后读不到', (await loadDraft('16/10/2026', 'K1')) === null);

  await clearDraft('16/10/2026', 'K1');   // 重复清除不应抛错
  check('重复 clearDraft 不抛错', true);
}

{
  // 缺参数时安全空操作（避免 undefined 变成字符串键 "undefined|undefined"）
  await reset();
  await saveDraft({ date: '', classId: 'K1', students: {} });
  await saveDraft({ date: '16/10/2026', classId: '', students: {} });
  check('date 或 classId 为空时不写入', (await raw()).length === 0);
  check('loadDraft 缺参数返回 null', (await loadDraft('', '')) === null);
}

{
  // 存储里是坏 JSON → 不能让整个点名崩掉
  await Preferences.set({ key: STORE, value: '{ 这不是 JSON' });
  const got = await loadDraft('16/10/2026', 'K1');
  check('坏数据不抛错，返回 null', got === null);
}

await reset();

// ================================================================ 结果
console.log(`\n${'='.repeat(74)}`);
console.log(`结果：${PASS} 通过 / ${FAIL} 失败`);
console.log('='.repeat(74));
if (FAIL) process.exit(1);
