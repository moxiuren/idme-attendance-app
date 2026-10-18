/**
 * 未提交点名草稿的持久化。
 *
 * 要解决的问题（真机上会真实发生）：
 *   教师点了一半名，接个电话 / 切到 WhatsApp / 系统回收 WebView 进程，
 *   回来发现整节课的改动全没了。当前 students 只是内存里的 ref，
 *   进程一死就归零。
 *
 * 设计取舍：
 *   · **只存状态，不存整份学生对象** —— 姓名 / 性别 / 序号都以服务端为准，
 *     草稿只记 {id → state/sebab}。这样即使官方改了学生姓名也不会显示旧名。
 *   · **按 date + classId 分键** —— 教师可能今天点 A 班、明天点 B 班，
 *     切回来时各自的草稿互不覆盖。
 *   · **最多 5 条、7 天过期** —— 草稿是临时安全网，不是历史档案。
 *     留太久反而会在半年后弹出一个莫名其妙的恢复提示。
 *   · **任何 IO 失败都静默** —— 存不下草稿绝不能让点名本身失败。
 *
 * 与 baseline 的关系：
 *   草稿只在「与服务端不一致」时才写入（调用方判断 changed），
 *   所以恢复草稿后 changed 必然为 true，教师能正常提交。
 */
import { Preferences } from '@capacitor/preferences';

const STORE_KEY = 'idme_drafts';
const MAX_DRAFTS = 5;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const keyOf = (date, classId) => `${date}|${classId}`;

async function readAll() {
  try {
    const { value } = await Preferences.get({ key: STORE_KEY });
    if (!value) return [];
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeAll(arr) {
  try {
    await Preferences.set({ key: STORE_KEY, value: JSON.stringify(arr) });
  } catch { /* 存不下不能影响点名 */ }
}

/** 从当前学生列表提取可持久化的状态快照 */
export function snapshotOf(students) {
  const out = {};
  for (const s of students) {
    out[s.id] = {
      state: s.state,
      sebabCode: s.sebabCode || '',
      sebabName: s.sebabName || '',
      kategori: s.kategori || '',
    };
  }
  return out;
}

/** 写入（覆盖同 date+classId 的旧草稿，最新的排在最前） */
export async function saveDraft({ date, classId, className, students }) {
  if (!date || !classId) return;
  const k = keyOf(date, classId);
  const arr = (await readAll()).filter(d => keyOf(d.date, d.classId) !== k);
  arr.unshift({ date, classId, className: className || '', savedAt: Date.now(), students });
  await writeAll(arr.slice(0, MAX_DRAFTS));
}

/**
 * 读取某天某班的草稿；顺手清理过期条目。
 * @returns {Promise<null | {date, classId, className, savedAt, students}>}
 */
export async function loadDraft(date, classId) {
  if (!date || !classId) return null;
  const now = Date.now();
  const all = await readAll();
  const fresh = all.filter(d => now - (d.savedAt || 0) < TTL_MS);
  if (fresh.length !== all.length) await writeAll(fresh);
  return fresh.find(d => keyOf(d.date, d.classId) === keyOf(date, classId)) || null;
}

/** 删除某天某班的草稿（提交成功 / 草稿已无意义时调用） */
export async function clearDraft(date, classId) {
  if (!date || !classId) return;
  const k = keyOf(date, classId);
  const arr = (await readAll()).filter(d => keyOf(d.date, d.classId) !== k);
  await writeAll(arr);
}

/**
 * 把草稿状态合并进当前学生列表（**纯函数**，不改草稿本身）。
 *
 * 按 id 匹配：草稿里有、当前名单没有的（转学 / 调班）计入 missing 并丢弃；
 * 当前名单里有、草稿里没有的（新转入）保持服务端状态不变。
 *
 * @returns {{ applied: number, missing: number, diff: number }}
 *   applied 覆盖到的学生数；missing 已不在名单的草稿条目数；
 *   diff 状态真正不同的学生数（diff=0 说明草稿已无意义）
 */
export function applyDraft(students, draft) {
  const saved = draft?.students || {};
  const currentIds = new Set(students.map(s => s.id));
  let applied = 0;
  let diff = 0;

  for (const st of students) {
    const o = saved[st.id];
    if (!o) continue;
    applied++;
    if (o.state !== st.state || (o.sebabCode || '') !== (st.sebabCode || '')) diff++;
    st.state = o.state;
    st.isPresent = o.state !== 'absent';
    st.sebabCode = o.sebabCode || '';
    st.sebabName = o.sebabName || '';
    st.kategori = o.kategori || '';
  }

  const missing = Object.keys(saved).filter(id => !currentIds.has(id)).length;
  return { applied, missing, diff };
}
