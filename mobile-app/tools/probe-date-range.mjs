/**
 * 日期响应探针（只读）。
 *
 * 回答两个问题：
 *   ① 官方可填窗口的上下界之外，服务端怎么响应？
 *      官方 tabguru 页的日期选择器同时设了上下界 ——
 *        minDate: $('#sebulan').val()   // 学期起始日（页面上是 2026-01-12）
 *        maxDate: new Date()            // 今天
 *      上界（未来日期）本 App 已在前端封锁（DateBar 的「下一天」在今天置灰）。
 *      下界**不能靠前端猜** —— 学期起始日由服务端渲染进页面，不同学校/学年都不同。
 *   ② 周休（周六日）与各类假期，服务端给什么 statushari / 是否算「已归档」？
 *      主界面日期栏的「MENUNGGU PENGESAHAN」徽章据此决定要不要显示。
 *
 * 全程只读：只调 ajaxloadkehadiranharian，不碰任何写接口。
 * 用法：npm run probe  之后 node tools/probe-date-range.mjs
 */
import fs from 'node:fs';

const CRED = JSON.parse(fs.readFileSync(
  'C:/Users/Admin/Documents/Projects/idme-attendance-app/credentials.json', 'utf8'));

const { idme } = await import('../dist/_probe.mjs');

await idme.login(CRED.ic, CRED.password);
console.log(`班级：${idme.classes.map(c => `${c.name}(${c.id})`).join(', ')}`);

const WD = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

// [DD/MM/YYYY, 备注]；假期分类取自 tools/out 的月报表（Cuti Mingguan = 周休）
const DATES = [
  ['01/12/2025', '学年开始之前（远早于 2026-01-12）'],
  ['05/01/2026', '学期起始日之前一周'],
  ['12/01/2026', '官方 minDate 当天（学期起始）'],
  ['13/01/2026', '官方 minDate 次日'],
  ['01/09/2026', 'Cuti Penggal（学期假）'],
  ['16/09/2026', 'Cuti Umum（公共假期 · 马来西亚日）'],
  ['25/09/2026', 'Cuti Sekolah/Peristiwa（特别假）'],
  ['30/09/2026', '常规上课日（周三）'],
  ['03/10/2026', 'Cuti Mingguan（周六）'],
  ['04/10/2026', 'Cuti Mingguan（周日）'],
  ['16/10/2026', '今天（周五 · PDPR 日）'],
  ['17/10/2026', 'Cuti Mingguan（周六）'],
  ['18/10/2026', 'Cuti Mingguan（周日）'],
  ['19/10/2026', '未来日（官方上界之外 · 周一）'],
];

const LABEL = { 0: '可录入', 1: '不允许录入', 2: '学期假', 3: '特别假' };

console.log('');
console.log('='.repeat(92));
console.log('日期'.padEnd(13) + '星期'.padEnd(8) + '人数'.padEnd(6)
  + '已归档'.padEnd(8) + 'statushari'.padEnd(13) + '含义');
console.log('='.repeat(92));

for (const [ddmm, note] of DATES) {
  try {
    const r = await idme.getAttendance(ddmm);
    const [d, m, y] = ddmm.split('/').map(Number);
    const wd = WD[new Date(y, m - 1, d).getDay()];
    console.log(`${ddmm.padEnd(13)}${wd.padEnd(8)}${String(r.students.length).padEnd(6)}`
      + `${(r.isVerified ? '是' : '否').padEnd(8)}`
      + `${String(r.statushari).padEnd(13)}${LABEL[r.statushari] || '?'}`);
    console.log(`${' '.repeat(13)}↳ ${note}`);
  } catch (e) {
    console.log(`${ddmm.padEnd(13)}请求失败：${e.message}   ← ${note}`);
  }
}

console.log('');
console.log('说明：');
console.log('  · 下界之外的日期返回 0 人且 statushari=0 → 只能靠「名单为空」识别。');
console.log('  · 周休 / 假期若不返回「已归档」，主界面不应显示 MENUNGGU PENGESAHAN。');
