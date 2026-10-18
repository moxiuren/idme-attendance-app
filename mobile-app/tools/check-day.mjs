/**
 * 只读：打印指定日期的服务端口径与逐人状态，用于写操作前后对比。
 *
 * 用法：node tools/check-day.mjs 16/10/2026 [--all]
 *   --all  逐人列出（默认只列非出席者）
 *
 * 只调用查询接口 ajaxloadkehadiranharian，无任何写入。
 */
import fs from 'node:fs';

const CRED = JSON.parse(fs.readFileSync(
  'C:/Users/Admin/Documents/Projects/idme-attendance-app/credentials.json', 'utf8'));

if (!fs.existsSync('dist/_probe.mjs')) {
  console.error('缺少 dist/_probe.mjs —— 请先运行：npm run probe');
  process.exit(1);
}
const { idme } = await import('../dist/_probe.mjs');

const date = process.argv[2];
const showAll = process.argv.includes('--all');
if (!date) {
  console.error('用法：node tools/check-day.mjs DD/MM/YYYY [--all]');
  process.exit(1);
}

await idme.login(CRED.ic, CRED.password, () => {});
const r = await idme.getAttendance(date);

const nP = r.students.filter(s => s.state === 'present').length;
const nE = r.students.filter(s => s.state === 'excused').length;
const nA = r.students.filter(s => s.state === 'absent').length;

console.log('='.repeat(70));
console.log(`日期 ${date}   班级 ${idme.currentClass()?.name}`);
console.log('='.repeat(70));
console.log(`  已确认(TELAH DISAHKAN) : ${r.isVerified ? '是' : '否'}`);
console.log(`  人数                   : ${r.students.length}`);
console.log(`  服务端口径             : bilhadir=${r.bilhadir}  biltidakhadir=${r.biltidakhadir}`);
console.log(`  本地三态               : 出席=${nP}  算出席=${nE}  缺席=${nA}`);
console.log(`  出席率                 : ${(((nP + nE) / r.students.length) * 100).toFixed(1)}%`);

const rows = showAll ? r.students : r.students.filter(s => s.state !== 'present');
if (rows.length) {
  console.log('');
  console.log(`  ${showAll ? '全部' : '非出席'}学生（${rows.length} 人）：`);
  for (const s of rows) {
    console.log(`    ${String(s.index).padStart(2)}. ${s.name.padEnd(38)} `
      + `${s.state.padEnd(8)} ${s.kategori || '-'} ${s.sebabCode || '-'} ${s.sebabName || ''}`);
  }
}

// 提交报文预览（只组装，不发送）
const records = r.students.filter(s => s.state !== 'present')
  .map(s => ({ id: s.id, kategori: s.kategori, sebab: s.sebabCode }));
console.log('');
console.log(`  ▶ rekodtidakhadir 将发送 ${records.length} 条（缺席 + 算出席，官方口径）`);
