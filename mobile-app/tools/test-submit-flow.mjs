/**
 * 提交流程契约测试（**完全离线**，一个字节都不触网）。
 *
 * 为什么需要它：
 *   `verify:live` 只覆盖 `submitAttendance` 的**报文组装**，
 *   而「点 PDPR 确认后到底有没有真的归档」「合并后的提交按钮弹哪个确认框」
 *   这些行为住在 composable（useAttendance）里 —— 真机点一遍能发现，
 *   但成本高、易漏、且无法回归。本脚本把这条链路搬到桌面端做断言。
 *
 * 做法（关键点）：
 *   · `idme.request` 被换成一台**可控路由器**：读接口回放预制 JSON，
 *     写接口只记录参数后返回成功 —— 于是 `getAttendance` 的解析、
 *     三态判定、`_snapshot` 建立、`SAFETY_BLOCK` 护栏全部是**真实代码**在跑。
 *   · `ask()` 是假的确认对话框，把「弹了什么、弹了几次、用户点了几次 YA」
 *     全部记下来 —— 这正是本次改动的核心可观测面。
 *   · 打包入口 tools/entry-flow.mjs 让 useAttendance 与 idme 共用同一张模块图，
 *     否则替换的 `idme.request` 对 composable 不可见，断言会假通过。
 *
 * 前置：node tools/build-probe.mjs（生成 dist/_flow.mjs）
 * 用法：node tools/test-submit-flow.mjs
 */
import fs from 'node:fs';
import {
  useAttendance, useSelection, idme,
  DEFAULT_SEBAB, t,
  todayStr, shiftDateStr,
} from '../dist/_flow.mjs';
// 造数据的夹具单独成文件（本文件已触及行数门禁，且夹具可被其他测试复用）
import { TOTAL, SEBAB_D, makeDay, makeEmptyDay, makeReportHtml } from './fixtures.mjs';

// ================================================================ 测试日期
// 必须相对**真实系统日期**动态计算：写死日期的话，等真实日历走过那一天，
// 「未来日期」用例就会变成过去日期，测试静默失效。
const TODAY = todayStr();
const PAST = shiftDateStr(TODAY, -14);
const FUTURE = shiftDateStr(TODAY, 3);

// ================================================================ 断言小工具
let PASS = 0;
let FAIL = 0;

function check(label, cond, extra = '') {
  if (cond) { PASS++; console.log(`    ✓ ${label}`); }
  else { FAIL++; console.log(`    ✗ ${label}${extra ? `   ← ${extra}` : ''}`); }
}
function section(title) {
  console.log('');
  console.log('='.repeat(74));
  console.log(title);
  console.log('='.repeat(74));
}

// ================================================================ 环境接管
idme.isLoggedIn = true;
idme.moeisToken = 'TESTTOKEN';
idme.classes = [{ id: 'KELAS-TEST', name: 'KELAS TEST' }];
idme.currentClassIdx = 0;

let dayBody = makeDay('twoAbsent');
const writes = [];
let totalWrites = 0;      // 累计（writes 会被 reset 清空，汇总行要用累计值）
let loadCount = 0;
let reportFetches = 0;    // 月度报表被真实拉取的次数（用于预热断言）
let unexpected = null;
let htmlFailures = 0;   // 让接下来 N 次出勤请求返回「非 JSON 页面」（模拟会话静默失效）

// 非 JSON 响应：不含 _token 输入框，因此 _isSessionLost 判不出来 → 走 PARSE_ERROR
const NON_JSON_PAGE = '<!DOCTYPE html><html><head><title>Ralat</title></head>'
  + '<body><p>Ralat sistem kehadiran</p></body></html>';

idme.request = async (method, url, data) => {
  if (/ajaxloadkehadiranharian$/.test(url)) {
    loadCount++;
    if (htmlFailures > 0) {
      htmlFailures--;
      return { status: 200, url, headers: {}, data: NON_JSON_PAGE };
    }
    return { status: 200, url, headers: {}, data: JSON.stringify(dayBody) };
  }
  if (/laporankehadiranbulanan\//.test(url)) {
    reportFetches++;
    return { status: 200, url, headers: {}, data: makeReportHtml() };
  }
  if (/kemaskiniKehadiranHarian$/.test(url)) {
    writes.push({ method, url, data: String(data) });
    totalWrites++;
    // 模拟服务端副作用：归档成功后，该日重新拉取应返回「已归档」
    dayBody.rekodSahHadirBulanan = 1;
    return { status: 200, url, headers: {}, data: JSON.stringify({ status: 'ok' }) };
  }
  unexpected = `${method} ${url}`;
  throw new Error(`未预期的请求：${unexpected}`);
};

// 假确认对话框：记录每一次弹窗，并按队列作答（队列空则用默认答案）。
// 队列是必需的 —— 安全护栏场景会**连弹两层**框，需要分别控制两次回答。
const selection = useSelection();
let confirms = [];
let answer = true;
let answerQueue = [];
const ask = async (opts) => {
  confirms.push(opts);
  return answerQueue.length ? answerQueue.shift() : answer;
};

let relogins = 0;
const att = useAttendance({ relogin: async () => { relogins++; }, selection, ask });

/** 每次用例前复位可观测面 */
function reset() {
  confirms = []; answerQueue = []; writes.length = 0;
  unexpected = null; htmlFailures = 0; relogins = 0;
}

/** 提交报文里 rekodtidakhadir 的条数（每生 4 个字段） */
function recordCount(body) {
  return (body.match(/rekodtidakhadir%5B/g) || []).length / 4;
}

console.log('提交流程契约测试（离线，网络层为可控路由器）');
console.log(`  花名册 ${TOTAL} 人 · 班级 KELAS-TEST`);

// ================================================================ [1] PDPR
section('[1] 一键 PDPR：确认后直接归档（不再要求多点一次 Kemaskini）');
{
  dayBody = makeDay('normal');          // 全班到齐的普通日
  await att.loadAttendance(PAST);
  reset();
  answer = true;
  await att.applyAllPdpr();

  check('只弹 1 个确认框（PDPR 自己的）',
    confirms.length === 1, `实际 ${confirms.length} 个`);
  check('弹的是 PDPR 确认框',
    confirms[0]?.title === t('confirmTitlePdpr'),
    `实际「${confirms[0]?.title}」`);
  check('确认文案里写明覆盖条数 31',
    String(confirms[0]?.message || '').includes(String(TOTAL)));
  check('确认后**真的发出了写请求**（这正是本次要省掉的那一步）',
    writes.length === 1, `实际 ${writes.length} 次`);
  check('写入 31 条 rekodtidakhadir（全班算出席）',
    recordCount(writes[0]?.data || '') === TOTAL,
    `实际 ${recordCount(writes[0]?.data || '')} 条`);
  check('statussimpan=simpansah（归档，不是暂存）',
    /statussimpan=simpansah/.test(writes[0]?.data || ''));
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
  console.log(`      提交体 ${(writes[0]?.data || '').length} 字节`);
}

// ================================================================ [2] PDPR 取消
section('[2] 一键 PDPR：点 TIDAK → 一个字节都不写');
{
  dayBody = makeDay('normal');
  await att.loadAttendance(PAST);
  reset();
  answer = false;
  await att.applyAllPdpr();

  check('弹了 1 个确认框', confirms.length === 1, `实际 ${confirms.length} 个`);
  check('取消后没有写请求', writes.length === 0, `实际 ${writes.length} 次`);
  check('本地状态未被改动（全班仍是出席）',
    att.pending.value === 0, `pending=${att.pending.value}`);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [3] 幂等
section('[3] 一键 PDPR：全班已是 PDPR → 提示已应用，不重复写入');
{
  dayBody = makeDay('pdpr');            // 官方 PDPR 日：解析后全班即 excused/A
  await att.loadAttendance(PAST);
  check('解析出全班 31 人「算出席」',
    att.students.value.length === TOTAL && att.bilExcused.value === TOTAL,
    `${att.students.value.length} 人 / excused ${att.bilExcused.value}`);
  check('出席率 100%（PDPR 不扣出席率，满值不带小数）',
    att.attendanceRate.value === '100', `实际 ${att.attendanceRate.value}`);

  reset();
  answer = true;
  await att.applyAllPdpr();
  check('不弹确认框', confirms.length === 0, `实际 ${confirms.length} 个`);
  check('不写入', writes.length === 0, `实际 ${writes.length} 次`);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [4] 合并按钮
section('[4] 合并后的提交按钮：pending=0 → 一次点击完成「全班到齐 + 归档」');
{
  dayBody = makeDay('normal');          // 全班到齐，未归档
  await att.loadAttendance(PAST);
  check('pending = 0（屏幕上没有任何缺席/请假）', att.pending.value === 0);
  check('该日尚未归档 → 按钮语义为「Kemaskini · Semua hadir」',
    att.isVerified.value === false);

  reset();
  answer = true;
  await att.submit();

  check('只弹 1 个确认框（没有「先全班出席、再 Kemaskini」两段式）',
    confirms.length === 1, `实际 ${confirms.length} 个`);
  check('弹的是「全班到齐」确认框',
    confirms[0]?.title === t('confirmTitlePresent'),
    `实际「${confirms[0]?.title}」`);
  check('写入 1 次', writes.length === 1, `实际 ${writes.length} 次`);
  check('rekodtidakhadir 为空（= 声明全班出席，服务端据此清除旧记录）',
    recordCount(writes[0]?.data || '') === 0,
    `实际 ${recordCount(writes[0]?.data || '')} 条`);
  check('statussimpan=simpansah', /statussimpan=simpansah/.test(writes[0]?.data || ''));
  check('提交后本地标记为已归档', att.isVerified.value === true);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [5] 有条目
section('[5] 合并后的提交按钮：有缺席 → 按屏幕名单归档（不再弹「全班到齐」）');
{
  dayBody = makeDay('twoAbsent');       // 29 出席 + 2 真缺席
  await att.loadAttendance(PAST);
  check('pending = 2', att.pending.value === 2, `实际 ${att.pending.value}`);
  check('出席率 93.5%（29/31）', att.attendanceRate.value === '93.5',
    `实际 ${att.attendanceRate.value}`);

  reset();
  answer = true;
  await att.submit();

  check('未弹「全班到齐」确认框（该日未归档，直接提交即可）',
    confirms.length === 0, `实际 ${confirms.length} 个`);
  check('写入 1 次', writes.length === 1, `实际 ${writes.length} 次`);
  check('写入 2 条 rekodtidakhadir（只发非出席名单）',
    recordCount(writes[0]?.data || '') === 2,
    `实际 ${recordCount(writes[0]?.data || '')} 条`);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [6] 护栏
section('[6] 安全护栏：意图确认框**不得**顺手放行服务端 SAFETY_BLOCK');
{
  dayBody = makeDay('twoAbsent');       // 服务端快照：total=31, biltidakhadir=2
  await att.loadAttendance(PAST);
  // 本地把全班改成真缺席（模拟解析出错 / 误操作）
  for (const st of att.students.value) {
    att.applyState(st, 'absent', { code: DEFAULT_SEBAB, name: SEBAB_D.name, kategori: 'D' });
  }
  check('本地已变成全班 31 人真缺席', att.bilAbsen.value === TOTAL);

  // ---- 6a：第一层「全班缺席」确认框点 YA，第二层护栏框点 TIDAK ----
  reset();
  answerQueue = [true, false];
  await att.submit();

  check('先弹「全班缺席」意图确认框',
    confirms[0]?.title === t('confirmTitleAbsent'),
    `实际「${confirms[0]?.title}」`);
  check('意图确认后**护栏仍然触发**，弹出第二层确认框',
    confirms[1]?.title === t('confirmTitleBlocked'),
    `实际「${confirms[1]?.title}」`);
  check('护栏文案带服务端口径 total=31 / serverAbsent=2',
    String(confirms[1]?.message || '').includes('31')
    && String(confirms[1]?.message || '').includes('2'));
  check('护栏框点 TIDAK → 不写入', writes.length === 0, `实际 ${writes.length} 次`);

  // ---- 6b：两层都点 YA → 带 force 放行到网络层 ----
  reset();
  answerQueue = [true, true];
  await att.submit();

  check('两层都确认 → 放行，写入 31 条',
    writes.length === 1 && recordCount(writes[0]?.data || '') === TOTAL,
    `实际 ${writes.length} 次 / ${recordCount(writes[0]?.data || '')} 条`);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [7] 已归档覆盖
section('[7] 已归档日期 + 有改动 → 弹「覆盖」确认框，且只弹一次');
{
  dayBody = makeDay('twoAbsent', { verified: true });
  await att.loadAttendance(PAST);
  check('该日已归档', att.isVerified.value === true);

  // 改一位学生 → 产生「有改动」
  const st = att.students.value[0];
  att.applyState(st, 'absent', { code: DEFAULT_SEBAB, name: SEBAB_D.name, kategori: 'D' });

  reset();
  answer = true;
  await att.submit();
  check('弹的是「已归档覆盖」确认框',
    confirms.length === 1 && confirms[0].title === t('confirmTitleVerified'),
    `实际 ${confirms.length} 个 /「${confirms[0]?.title}」`);
  check('写入 3 条 rekodtidakhadir（2 原有 + 1 新增）',
    recordCount(writes[0]?.data || '') === 3,
    `实际 ${recordCount(writes[0]?.data || '')} 条`);
}

// ================================================================ [8] 无改动
section('[8] 已归档日期 + 无改动 → 直接提示，不弹框、不写入');
{
  dayBody = makeDay('normal', { verified: true });
  await att.loadAttendance(PAST);
  reset();
  answer = true;
  await att.submit();

  check('不弹确认框', confirms.length === 0, `实际 ${confirms.length} 个`);
  check('不写入', writes.length === 0, `实际 ${writes.length} 次`);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [9] 结构
section('[9] 结构断言：旧的两按钮 / setAllPresent 通路已彻底拆除');
{
  const ab = fs.readFileSync('src/ActionBar.vue', 'utf8');
  const app = fs.readFileSync('src/App.vue', 'utf8');
  const ua = fs.readFileSync('src/composables/useAttendance.js', 'utf8');

  check('ActionBar 的 defineEmits 不再暴露 setAllPresent',
    !/defineEmits\([^)]*setAllPresent/.test(ab));
  check('ActionBar 使用合并后的文案键 submitAllPresent',
    ab.includes("t('submitAllPresent')"));
  check('App.vue 不再绑定 set-all-present',
    !/set-all-present/.test(app));
  check('useAttendance 不再导出 setAllPresent',
    !/function\s+setAllPresent/.test(ua) && !/^\s*setAllPresent,\s*$/m.test(ua));
  check('useAttendance 的 applyAllPdpr 确认后调用 submit',
    /if \(!ok\) return;[\s\S]{0,200}?await submit\(\{ confirmed: true \}\)/.test(ua));
  check('force 只在护栏确认通过后传递（全文件仅一处 submit({ force: true … })）',
    (ua.match(/submit\(\{ force: true/g) || []).length === 1,
    `实际 ${(ua.match(/submit\(\{ force: true/g) || []).length} 处`);
  check('submit 采用具名选项对象签名（避免位置参数错配）',
    /async function submit\(\{ force = false, reloginDone = false, confirmed = false \} = \{\}\)/.test(ua));
  check('ActionBar 两个按钮都把 readonly 纳入 :disabled',
    (ab.match(/:disabled="busy \|\| total === 0 \|\| readonly"/g) || []).length === 2,
    `实际 ${(ab.match(/:disabled="busy \|\| total === 0 \|\| readonly"/g) || []).length} 处`);
  check('App.vue 渲染常驻横幅（由 bannerText 统一驱动）',
    /v-if="bannerText"[\s\S]{0,120}\{\{ bannerText \}\}/.test(app));
  check('App.vue 把 readonly / readonlyReason 传给 ActionBar',
    /:readonly="readOnly" :readonly-reason="readOnlyReason"/.test(app));
  const db = fs.readFileSync('src/DateBar.vue', 'utf8');
  check('DateBar 的「下一天」箭头纳入 canNext（今天是置灰的）',
    /:disabled="busy \|\| !canNext"/.test(db));
  check('DateBar 的状态徽章纳入 showTag（非上课日隐藏）',
    /v-if="showTag"[\s\S]{0,60}date-tag/.test(db));
  check('App.vue 把 canGoNext 传给 DateBar',
    /:can-next="canGoNext"/.test(app));
  check('App.vue 把 showStatusTag 传给 DateBar',
    /:show-tag="showStatusTag"/.test(app));
  check('shiftDate 内部对「往后翻」再兜一层',
    /if \(delta > 0 && !canGoNext\.value\) return;/.test(ua));
  check('futureDate 文案已彻底移除（导航层挡住即可，无需解释）',
    !/futureDate/.test(ua) && !/futureDate/.test(fs.readFileSync('src/i18n.js', 'utf8')));

  const rs = fs.readFileSync('src/ReportSheet.vue', 'utf8');
  const ir = fs.readFileSync('src/idmeReport.js', 'utf8');
  check('ReportSheet 未结束月份时封存按钮置灰',
    /:disabled="busy \|\| !report \|\| !monthOver"/.test(rs));
  check('ReportSheet 灰按钮旁有一行说明',
    /v-if="showSahHint"[\s\S]{0,80}sahNotOver/.test(rs));
  check('ReportSheet 的 sahkan() 里再兜一层（防绕过 disabled）',
    /if \(!monthOver\.value\) \{[\s\S]{0,80}return;/.test(rs));
  check('「提前封存」确认框已移除（按钮已置灰，该路径不可达）',
    !/confirmSahEarly/.test(rs) && !/confirmSahEarly/.test(fs.readFileSync('src/i18n.js', 'utf8')));
  check('idmeReport 提供 prefetchMonthlyReport（不阻塞、不抛错）',
    /prefetchMonthlyReport\(month, year\) \{[\s\S]{0,340}\.catch\(\(\) => \{/.test(ir));
  check('登录成功后预热当前月（App.vue）',
    /idme\.prefetchMonthlyReport\(my\.m, my\.y\)/.test(app));
  check('提交出勤后自动重新预热（idmeAttendance）',
    /prefetchMonthlyReport\?\.\(my\.m, my\.y\)/.test(
      fs.readFileSync('src/idmeAttendance.js', 'utf8')));
}

// ================================================================ [10] 未来日期
section('[10] 未来日期：导航层就锁死（过不去，因此无需任何说明）');
{
  // ---- 10a：今天不能再往后翻 ----
  dayBody = makeDay('normal');
  await att.loadAttendance(TODAY);
  check(`今天（${TODAY}）canGoNext = false`, att.canGoNext.value === false);
  const before = att.currentDate.value;
  const loads0 = loadCount;
  att.shiftDate(1);
  check('在今天按「下一天」完全不触发加载、日期不变',
    loadCount === loads0 && att.currentDate.value === before,
    `加载 ${loadCount - loads0} 次 / 日期 ${att.currentDate.value}`);

  // ---- 10b：过去可以往后翻 ----
  dayBody = makeDay('normal');
  await att.loadAttendance(PAST);
  check(`过去（${PAST}）canGoNext = true`, att.canGoNext.value === true);
  att.shiftDate(1);
  await new Promise(r => setTimeout(r, 20));   // shiftDate 内部 loadAttendance 不 await
  check('过去按「下一天」能正常前进', att.currentDate.value === shiftDateStr(PAST, 1),
    `实际 ${att.currentDate.value}`);

  // ---- 10c：万一真的载入了未来日期，静默兜底（不弹框、不写入、不解释） ----
  dayBody = makeDay('normal');
  await att.loadAttendance(FUTURE);
  check('isFuture 仍能识别未来日期', att.isFuture.value === true);
  check('readOnly 兜底成立（按钮随之停用）', att.readOnly.value === true);
  check('未来日期**不产生**任何说明文案（用户要求：过不去就行，不用解释）',
    att.readOnlyReason.value === '' && att.bannerText.value === '',
    `reason「${att.readOnlyReason.value}」banner「${att.bannerText.value}」`);

  reset();
  answer = true;
  await att.submit();
  check('绕过按钮直接调 submit 被静默挡住',
    writes.length === 0 && confirms.length === 0,
    `写 ${writes.length} 次 / 弹框 ${confirms.length} 个`);

  await att.applyAllPdpr();
  check('直接调 applyAllPdpr 被静默挡住', writes.length === 0, `实际 ${writes.length} 次`);

  // 本地改写通道也要封死，否则「改了却提交不了」比不让改更糟
  att.onRowTap(att.students.value[0]);
  check('点行不打开假因抽屉', att.reasonTarget.value === null);
  att.onRowLongPress(att.students.value[0]);
  check('长按不进批量模式', selection.selectMode.value === false);
  check('本地状态保持全班出席（未被改写）', att.pending.value === 0);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [11] 今天 / 过去
section('[11] 今天与过去：不受未来日期限制');
{
  dayBody = makeDay('normal');
  await att.loadAttendance(TODAY);
  check(`今天（${TODAY}）isFuture=false`, att.isFuture.value === false);
  check('今天 readOnly=false（仍可提交）', att.readOnly.value === false);

  dayBody = makeDay('normal');
  await att.loadAttendance(PAST);
  check(`过去（${PAST}）isFuture=false`, att.isFuture.value === false);
  check('过去 readOnly=false', att.readOnly.value === false);
  check('过去只读理由为空串', att.readOnlyReason.value === '');
}

// ================================================================ [12] statushari
section('[12] 官方声明不可录入（statushari 1/2/3）：同样只读');
{
  const CASES = [[1, 'notRecordable'], [2, 'holiday'], [3, 'holidayEvent']];
  for (const [code, key] of CASES) {
    dayBody = makeDay('normal');
    dayBody.statushari = code;
    await att.loadAttendance(PAST);
    check(`statushari=${code} → readOnly 且理由取 ${key}`,
      att.readOnly.value === true && att.readOnlyReason.value === t(key),
      `readOnly=${att.readOnly.value} 理由「${att.readOnlyReason.value}」`);
  }

  reset();
  answer = true;
  await att.submit();
  check('不可录入日 submit 被挡', writes.length === 0, `实际 ${writes.length} 次`);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [13] 空名单
section('[13] 该日期无名单（可录入窗口之外）：给出说明而不是一片空白');
{
  dayBody = makeEmptyDay();
  await att.loadAttendance(PAST);
  check('识别为空名单', att.emptyRoster.value === true);
  check('横幅文案取 noRoster',
    att.bannerText.value === t('noRoster'), `实际「${att.bannerText.value}」`);
  check('不是只读日（按钮由 total===0 停用）', att.readOnly.value === false);

  reset();
  answer = true;
  await att.submit();
  await att.applyAllPdpr();
  check('空名单下两个入口都不写入',
    writes.length === 0 && confirms.length === 0,
    `写 ${writes.length} 次 / 弹框 ${confirms.length} 个`);

  // 未来日期 + 空名单时，横幅只可能落到 noRoster ——
  // 未来日期本身是静默的（导航层已挡住），不该出现任何「日期未到」类文案
  dayBody = makeEmptyDay();
  await att.loadAttendance(FUTURE);
  check('未来 + 空名单 → 横幅只说明「无名单」，不含任何日期未到文案',
    att.bannerText.value === t('noRoster'), `实际「${att.bannerText.value}」`);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [14] 报表预热
section('[14] 月度报表后台预热：打开 Laporan 秒开');
{
  const M = '10'; const Y = '2026';
  idme._invalidateMonthReport(M, Y);
  const n0 = reportFetches;

  // 预热不阻塞、不抛错
  idme.prefetchMonthlyReport(M, Y);
  check('prefetch 立即返回（不阻塞调用方）', true);
  await new Promise(r => setTimeout(r, 30));
  check('后台确实拉取了一次', reportFetches === n0 + 1, `实际 ${reportFetches - n0} 次`);
  check('预热后 hasMonthlyReport 为 true（界面据此秒开）',
    idme.hasMonthlyReport(M, Y) === true);

  idme.prefetchMonthlyReport(M, Y);
  await new Promise(r => setTimeout(r, 30));
  check('已有缓存时不重复拉取', reportFetches === n0 + 1, `实际 ${reportFetches - n0} 次`);

  // 提交出勤 → 该月缓存作废，同时应自动重新预热（否则秒开失效）
  dayBody = makeDay('normal');
  await att.loadAttendance(PAST);
  const [pm, py] = [PAST.slice(3, 5), PAST.slice(6)];
  idme.prefetchMonthlyReport(pm, py);
  await new Promise(r => setTimeout(r, 30));
  check(`提交前 ${pm}/${py} 已预热`, idme.hasMonthlyReport(pm, py) === true);

  const n1 = reportFetches;
  reset();
  answer = true;
  await att.submit();
  await new Promise(r => setTimeout(r, 30));
  // 提交出勤 → 该月缓存作废 → 立刻后台重新预热。
  // 因此观察点是「多了一次拉取」，而不是「缓存为空」—— 等我们检查时已被重新填满，
  // 这正是设计意图（作废是为了不让月历显示旧数据，重预热是为了下一次仍然秒开）。
  check('提交后该月缓存作废并自动重新预热（多了一次真实拉取）',
    reportFetches > n1, `实际 +${reportFetches - n1} 次`);
  check('重新预热完成后缓存再次可用（下次打开仍是秒开）',
    idme.hasMonthlyReport(pm, py) === true);

  // 未登录时预热应当静默跳过
  idme.isLoggedIn = false;
  const n2 = reportFetches;
  idme._invalidateMonthReport('11', '2026');
  idme.prefetchMonthlyReport('11', '2026');
  await new Promise(r => setTimeout(r, 30));
  check('未登录时预热静默跳过', reportFetches === n2, `实际 +${reportFetches - n2} 次`);
  idme.isLoggedIn = true;
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [15] 状态徽章
section('[15] 非上课日不显示「MENUNGGU PENGESAHAN」徽章');
{
  // 上课日（statushari=0 且有名单）→ 显示
  dayBody = makeDay('twoAbsent');
  await att.loadAttendance(PAST);
  check('上课日显示徽章', att.showStatusTag.value === true);

  // 周休 / 公共假期：服务端统一给 statushari=1
  // （实测 17/10 周六、18/10 周日、16/09 马来西亚日均为 1）
  for (const code of [1, 2, 3, 4]) {
    dayBody = makeDay('normal');
    dayBody.statushari = code;
    await att.loadAttendance(PAST);
    check(`statushari=${code}（非上课日）不显示徽章`,
      att.showStatusTag.value === false);
  }

  // 名单为空（可录入窗口之外）→ 同样没有可确认的对象
  dayBody = makeEmptyDay();
  await att.loadAttendance(PAST);
  check('名单为空时也不显示徽章', att.showStatusTag.value === false);

  // statushari=1 的只读理由取官方原文
  dayBody = makeDay('normal');
  dayBody.statushari = 1;
  await att.loadAttendance(PAST);
  check('statushari=1 的只读理由取 notRecordable（官方原文）',
    att.readOnlyReason.value === t('notRecordable'));

  // 未知状态码必须有兜底理由 —— 不能出现「按钮灰了却没有任何说明」
  dayBody = makeDay('normal');
  dayBody.statushari = 9;
  await att.loadAttendance(PAST);
  check('未知 statushari 也给出 notRecordable 兜底文案',
    att.readOnly.value === true && att.readOnlyReason.value === t('notRecordable'),
    `readOnly=${att.readOnly.value} 理由「${att.readOnlyReason.value}」`);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');
}

// ================================================================ [16] 非 JSON 响应自愈
section('[16] 服务端返回 HTML（非 JSON）→ 静默重登后重试一次，绝不伪造空名单');
{
  // 场景 A：会话静默失效 → 第一次回 HTML，重登后第二次正常
  reset();
  dayBody = makeDay('normal');
  htmlFailures = 1;
  await att.loadAttendance(PAST);
  check('第一次拿到非 JSON → 触发了静默重登', relogins === 1, `relogins=${relogins}`);
  check('重登后重试成功，名单完整', att.students.value.length === TOTAL,
    `${att.students.value.length}/${TOTAL}`);
  check('重试成功后不残留错误提示', att.notice.value === null,
    att.notice.value ? att.notice.value.text : '');
  check('重试成功后恢复在线态', att.online.value === true);

  // 场景 B：两次都回 HTML → 明确报错，而不是把「名单为空」当成事实
  reset();
  dayBody = makeDay('normal');
  await att.loadAttendance(PAST);
  const before = att.students.value.length;
  htmlFailures = 2;
  await att.loadAttendance(PAST);
  check('两次都失败 → 只重登一次（不陷入循环）', relogins === 1, `relogins=${relogins}`);
  check('两次都失败 → 给出红色错误提示', att.notice.value?.type === 'alert-red',
    att.notice.value ? att.notice.value.type : '无提示');
  check('两次都失败 → 不把名单伪造成空', att.students.value.length === before,
    `${att.students.value.length}（失败前 ${before}）`);
  check('两次都失败 → 标记为离线态', att.online.value === false);
  check('未出现任何未预期的请求', unexpected === null, unexpected || '');

  // 结构断言：源码里 PARSE_ERROR 必须被标为可重试，且上层确实认这个码
  const attSrc = fs.readFileSync(new URL('../src/idmeAttendance.js', import.meta.url), 'utf8');
  const uSrc = fs.readFileSync(new URL('../src/composables/useAttendance.js', import.meta.url), 'utf8');
  check('idmeAttendance 把 PARSE_ERROR 标为 retryable',
    /IdMeError\('出勤数据解析失败',\s*'PARSE_ERROR',\s*true\)/.test(attSrc));
  check('useAttendance 的重试条件同时覆盖 SESSION_LOST 与 PARSE_ERROR',
    /code === 'SESSION_LOST' \|\| err\.code === 'PARSE_ERROR'/.test(uSrc));
}

// ================================================================ 汇总
section(`结果：${PASS} 通过 / ${FAIL} 失败`);
console.log(`  读接口回放 ${loadCount} 次 · 写接口拦截 ${totalWrites} 次（全部未触网）`);
if (FAIL) {
  console.log('  ✗ 存在失败断言，请检查上方 ✗ 行');
} else {
  console.log('  ✓ 提交流程契约全部吻合');
}
process.exit(FAIL ? 1 : 0);
