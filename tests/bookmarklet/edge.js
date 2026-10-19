const fs = require('fs');
const { JSDOM } = require('jsdom');
const BM = fs.readFileSync('C:/Users/Admin/Documents/Projects/idme-attendance-app/download-site/bm.js', 'utf8');

function build(opts) {
  const o = opts || {};
  const html = `<!DOCTYPE html><html><head></head><body>
    <input type="hidden" name="_token" value="TOK">
    <input type="hidden" name="txtNamakelas" value="1136744">
    <input type="text" id="tkh_HH" value="19/10/2026">
  </body></html>`;
  const dom = new JSDOM(html, { url: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru',
                                runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const calls = [];
  w.fetch = (url, opt) => {
    calls.push({ url: String(url), body: opt && opt.body });
    if (String(url).indexOf('ajaxloadkehadiranharian') >= 0) {
      if (o.session) return Promise.resolve({ text: () => Promise.resolve('<html>login</html>') });
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(o.roster)) });
    }
    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ bilhadir: 0, biltidakhadir: 30 })) });
  };
  w.alert = (m) => calls.push({ alert: m });
  w.confirm = (m) => { calls.push({ confirm: m }); return o.confirm !== false; };
  return { w, calls, dom };
}

function rosterAllAbsent() {
  const rows = [];
  for (let i = 1; i <= 30; i++) {
    rows.push({ id_individu: 'P' + i, namamurid: 'MURID ' + String(i).padStart(2, '0'),
                kehadiran: '', laporan_takhadir: [] });
  }
  // 服务端说只有 0 人缺席（典型 PDPR 日：官方全算出席）
  return { draw: 1, data: rows, bilhadir: 30, biltidakhadir: 0, statushari: 0, rekodSahHadirBulanan: 0 };
}

function rosterNormal() {
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    rows.push({ id_individu: 'P' + i, namamurid: 'MURID ' + i, kehadiran: '<input checked>', laporan_takhadir: [] });
  }
  return { draw: 1, data: rows, bilhadir: 5, biltidakhadir: 0, statushari: 0, rekodSahHadirBulanan: 0 };
}

// ---------- 测试 A：安全护栏 ----------
(function () {
  const { w, calls } = build({ roster: rosterAllAbsent() });
  new w.Function(BM).call(w);
  setTimeout(() => {
    const root = w.document.getElementById('idme-bm');
    const btn = root.querySelector('[data-act="submit"]');
    console.log('=== A. 全班缺席安全护栏 ===');
    console.log('按钮文案:', btn.textContent.trim());
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    setTimeout(() => {
      const al = calls.find(c => c.alert);
      const sub = calls.find(c => c.url && c.url.indexOf('kemaskini') >= 0);
      console.log('拦截提示:', al ? '有' : '无');
      if (al) console.log('提示首行:', al.alert.split('\n')[0]);
      console.log('是否发出提交请求:', sub ? '是（护栏失效）' : '否（护栏生效）');
      testB();
    }, 200);
  }, 400);
})();

// ---------- 测试 B：全班出席 + 假因选择 ----------
function testB() {
  const { w, calls } = build({ roster: rosterNormal() });
  new w.Function(BM).call(w);
  setTimeout(() => {
    const root = w.document.getElementById('idme-bm');
    console.log('');
    console.log('=== B. 全班出席 + 假因选择 ===');
    let rows = [...root.querySelectorAll('.bm-row')];
    console.log('初始缺席行:', rows.filter(r => r.classList.contains('a')).length, '(应为 0)');

    // 点第 2 行的「假因」按钮
    const row2 = rows[1];
    row2.querySelector('[data-act="sebab"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    setTimeout(() => {
      const sheet = root.querySelector('.bm-sheet');
      console.log('假因面板打开:', !!sheet);
      const cats = [...root.querySelectorAll('.bm-cat')].map(c => c.textContent.trim());
      console.log('分类数:', cats.length, '| 前3:', cats.slice(0, 3).join(' / '));

      // 选 D 类
      const dCat = [...root.querySelectorAll('.bm-cat')].find(c => c.getAttribute('data-kat') === 'D');
      dCat.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

      setTimeout(() => {
        const items = [...root.querySelectorAll('.bm-sebab[data-code]')];
        console.log('D 类条目数:', items.length, '(含常用重复)');
        const pick = items.find(e => e.getAttribute('data-code') === 'D0260030');
        pick.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

        setTimeout(() => {
          rows = [...root.querySelectorAll('.bm-row')];
          const r2 = rows[1];
          console.log('第2行状态:', r2.className.replace('bm-row ', ''));
          console.log('第2行假因:', r2.querySelector('.bm-why') ? r2.querySelector('.bm-why').textContent : '(无)');
          console.log('面板已关闭:', !root.querySelector('.bm-sheet'));
          console.log('提交按钮:', root.querySelector('[data-act="submit"]').textContent.trim());
          testC();
        }, 150);
      }, 150);
    }, 150);
  }, 400);
}

// ---------- 测试 C：会话失效 ----------
function testC() {
  const { w, calls } = build({ roster: rosterNormal(), session: true });
  new w.Function(BM).call(w);
  setTimeout(() => {
    const root = w.document.getElementById('idme-bm');
    console.log('');
    console.log('=== C. 会话失效处理 ===');
    const note = root.querySelector('.bm-note');
    console.log('错误提示:', note ? note.textContent.trim() : '(无)');
    const btn = root.querySelector('[data-act="submit"]');
    console.log('提交按钮禁用:', btn.disabled);
    testD();
  }, 400);
}

// ---------- 测试 D：搜索过滤 ----------
function testD() {
  const { w } = build({ roster: rosterNormal() });
  new w.Function(BM).call(w);
  setTimeout(() => {
    const root = w.document.getElementById('idme-bm');
    console.log('');
    console.log('=== D. 搜索过滤 ===');
    const inp = root.querySelector('.bm-search');
    inp.value = 'MURID 3';
    inp.dispatchEvent(new w.Event('input', { bubbles: true }));
    setTimeout(() => {
      const rows = [...root.querySelectorAll('.bm-row')];
      console.log('过滤后行数:', rows.length, '(应为 1)');
      console.log('结果:', rows.map(r => r.querySelector('.bm-name').textContent));
      process.exit(0);
    }, 150);
  }, 400);
}
