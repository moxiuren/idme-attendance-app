const fs = require('fs');
const { JSDOM } = require('jsdom');
const BM = fs.readFileSync('C:/Users/Admin/Documents/Projects/idme-attendance-app/download-site/bm.js', 'utf8');

const html = `<!DOCTYPE html><html><head></head><body>
  <input type="hidden" name="_token" value="TOK">
  <input type="hidden" name="txtNamakelas" value="1136744">
  <input type="text" id="tkh_HH" value="19/10/2026">
</body></html>`;
const dom = new JSDOM(html, { url: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru',
                              runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
let fetchCount = 0;
w.fetch = () => {
  fetchCount++;
  return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({
    draw: 1, bilhadir: 3, biltidakhadir: 0, statushari: 0, rekodSahHadirBulanan: 0,
    data: [1,2,3].map(i => ({ id_individu: 'P'+i, namamurid: 'M'+i, kehadiran: '<input checked>', laporan_takhadir: [] }))
  })) });
};
w.alert = () => {};
w.confirm = () => true;

new w.Function(BM).call(w);

setTimeout(() => {
  console.log('=== 1. 首次挂载 ===');
  console.log('面板存在:', !!w.document.getElementById('idme-bm'));
  console.log('样式表存在:', !!w.document.getElementById('idme-bm-style'));
  console.log('fetch 次数:', fetchCount);
  console.log('全局标记:', typeof w.__idmeBM__);

  // 模拟再次点书签（关闭）
  new w.Function(BM).call(w);
  setTimeout(() => {
    console.log('');
    console.log('=== 2. 二次点击（应关闭）===');
    console.log('面板存在:', !!w.document.getElementById('idme-bm'));
    console.log('样式表存在:', !!w.document.getElementById('idme-bm-style'));
    console.log('全局标记:', w.__idmeBM__);

    // 三次点击（应重新打开）
    const before = fetchCount;
    new w.Function(BM).call(w);
    setTimeout(() => {
      console.log('');
      console.log('=== 3. 三次点击（应重开）===');
      console.log('面板存在:', !!w.document.getElementById('idme-bm'));
      console.log('样式表数量:', w.document.querySelectorAll('#idme-bm-style').length, '(应为 1，无重复)');
      console.log('面板数量:', w.document.querySelectorAll('#idme-bm').length, '(应为 1)');
      console.log('新增 fetch:', fetchCount - before, '(应为 1)');

      // ESC 关闭
      w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setTimeout(() => {
        console.log('');
        console.log('=== 4. ESC 关闭 ===');
        console.log('面板存在:', !!w.document.getElementById('idme-bm'));

        // 反复开关 20 次，检查 DOM 泄漏
        for (let i = 0; i < 20; i++) new w.Function(BM).call(w);
        setTimeout(() => {
          console.log('');
          console.log('=== 5. 开关 20 次后 ===');
          // 第 4 步 ESC 已把面板关掉，之后 20 次开关是偶数 → 最终落在「关」。
          // 所以这里的正确期望是 0：既不残留面板，也不残留样式表。
          console.log('残留面板数:', w.document.querySelectorAll('#idme-bm').length, '(应为 0)');
          console.log('残留样式数:', w.document.querySelectorAll('#idme-bm-style').length, '(应为 0)');
          process.exit(0);
        }, 600);
      }, 100);
    }, 400);
  }, 100);
}, 400);
