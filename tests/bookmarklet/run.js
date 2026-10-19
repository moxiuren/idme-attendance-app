const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BM = fs.readFileSync('C:/Users/Admin/Documents/Projects/idme-attendance-app/download-site/bm.js', 'utf8');

// ---- 构造官方页面 fixture（锚点逐字取自 tabguru_dump.html）----
const html = `<!DOCTYPE html><html><head><title>tabguru</title></head><body>
<form>
  <input type="hidden" name="_token" value="TESTTOKEN123">
  <input type="hidden" name="txtNamakelas" value="1136744">
  <input type="text" id="tkh_HH" value="19/10/2026">
  <span id="tarikhpilihan"></span>
</form>
</body></html>`;

// 30 人：2 人 PDPR(A) 有记录未勾选，1 人病假(D) 有记录，其余勾选
function roster() {
  const rows = [];
  for (let i = 1; i <= 30; i++) {
    const id = 'P' + String(1000 + i);
    const name = 'MURID ' + String(i).padStart(2, '0');
    let item = { id_individu: id, namamurid: name, kehadiran: '<input checked>', laporan_takhadir: [] };
    if (i === 3) {
      item.kehadiran = '';
      item.laporan_takhadir = [{ id_sebab_thadir: 'A0010072', thadir: { id_kat_thadir: 'A', id_sebab_thadir: 'A0010072', keterangan: 'PEMBELAJARAN DI RUMAH' } }];
    }
    if (i === 4) {
      item.kehadiran = '';
      item.laporan_takhadir = [{ id_sebab_thadir: 'A0010072', thadir: { id_kat_thadir: 'A', id_sebab_thadir: 'A0010072', keterangan: 'PEMBELAJARAN DI RUMAH' } }];
    }
    if (i === 7) {
      item.kehadiran = '';
      item.laporan_takhadir = [{ id_sebab_thadir: 'D0260030', thadir: { id_kat_thadir: 'D', id_sebab_thadir: 'D0260030', keterangan: 'SURAT CUTI SAKIT HOSPITAL/KLINIK' } }];
    }
    rows.push(item);
  }
  return { draw: 1, recordsTotal: 30, recordsFiltered: 30, data: rows,
           bilhadir: 29, biltidakhadir: 1, statushari: 0, rekodSahHadirBulanan: 0 };
}

const dom = new JSDOM(html, { url: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru',
                              runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

// stub fetch
const calls = [];
window.fetch = (url, opts) => {
  calls.push({ url, body: opts && opts.body });
  if (String(url).indexOf('ajaxloadkehadiranharian') >= 0) {
    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(roster())) });
  }
  return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ bilhadir: 29, biltidakhadir: 1 })) });
};
window.alert = (m) => calls.push({ alert: m });
window.confirm = (m) => { calls.push({ confirm: m }); return true; };

// 注入 bm.js
const script = new window.Function(BM);
script.call(window);

setTimeout(() => {
  const root = window.document.getElementById('idme-bm');
  console.log('=== 1. 面板是否挂载 ===');
  console.log(root ? '已挂载 #idme-bm' : '未挂载');
  if (!root) { process.exit(1); }

  const stats = [...root.querySelectorAll('.bm-stat')].map(e => e.textContent.trim());
  console.log('=== 2. 计数条 ===');
  console.log(JSON.stringify(stats));

  const rows = [...root.querySelectorAll('.bm-row')];
  console.log('=== 3. 名单行数 ===', rows.length);
  const bad = rows.filter(r => {
    const cls = r.className;
    return !/bm-row (p|e|a)/.test(cls);
  });
  console.log('无状态色的行:', bad.length);

  const absentRows = rows.filter(r => r.classList.contains('a'));
  const excusedRows = rows.filter(r => r.classList.contains('e'));
  console.log('缺席行:', absentRows.length, '请假行:', excusedRows.length);
  console.log('请假行文本:', excusedRows.map(r => r.querySelector('.bm-name').textContent));

  console.log('=== 4. 提交请求体（前 200 字符）===');
  const sub = calls.find(c => c.url && String(c.url).indexOf('kemaskini') >= 0);
  console.log('尚未提交，符合预期（按钮需手动点）');

  // 点提交
  const btn = root.querySelector('[data-act="submit"]');
  console.log('=== 5. 提交按钮文案 ===');
  console.log(btn.textContent.trim());
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  setTimeout(() => {
    const sub2 = calls.find(c => c.url && String(c.url).indexOf('kemaskini') >= 0);
    console.log('=== 6. 提交请求 ===');
    if (sub2) {
      const p = new URLSearchParams(sub2.body);
      console.log('tarikh =', p.get('tarikh'));
      console.log('kelas  =', p.get('kelas'));
      console.log('statussimpan =', p.get('statussimpan'));
      let n = 0;
      while (p.has(`rekodtidakhadir[${n}][idpelajar]`)) n++;
      console.log('rekodtidakhadir 条数 =', n, '(应为 3：2 PDPR + 1 病假)');
      for (let i = 0; i < n; i++) {
        console.log('  ', p.get(`rekodtidakhadir[${i}][namamurid]`),
                    p.get(`rekodtidakhadir[${i}][kategori]`),
                    p.get(`rekodtidakhadir[${i}][sebab]`));
      }
    } else {
      console.log('未发出提交请求');
    }
    const cf = calls.filter(c => c.confirm);
    console.log('=== 7. 确认框出现次数 ===', cf.length);
    process.exit(0);
  }, 300);
}, 500);
