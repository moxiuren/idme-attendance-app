/**
 * idMe 极速点名 · 下载站
 *
 * 站点只有两件交互：切语言、复制签名指纹。刻意不引任何框架 ——
 * 这是一个静态落地页，多一个依赖就多一个打不开的理由。
 *
 * ★ 马来文用词必须与 App 的 src/i18n.js 保持一致（murid 不用 pelajar、
 *   Kemaskini / Sah / PDPR / Laporan Kehadiran Kelas 都用官方原词），
 *   否则教师会怀疑下载到的是另一个应用。站点自身的营销文案属【自拟】，
 *   但同样只用官方词汇。
 */

const I18N = {
  ms: {
    title: 'idMe Kehadiran Pantas · Muat Turun APK',
    desc: 'Alat bantu guru merekod kehadiran murid dalam sistem idMe. Muat turun APK untuk Android.',

    brand: 'idMe Kehadiran Pantas',
    brandSub: 'Kementerian Pendidikan Malaysia · MOE Integrated System',
    tagline: 'Alat bantu guru merekod kehadiran murid — satu ketikan untuk tanda semua hadir, satu butang untuk Kemaskini.',
    dl: 'Muat Turun APK',
    dlNote: 'Perlu Android 7.0 ke atas · Benarkan pemasangan daripada sumber tidak diketahui',
    install: 'Cara Pemasangan',

    navInfo: 'Maklumat Fail',
    navInstall: 'Pemasangan',
    navFeatures: 'Ciri-ciri',
    navFaq: 'Soalan Lazim',

    infoTitle: 'Maklumat Fail',
    fVersion: 'Versi',
    fSize: 'Saiz Fail',
    fReq: 'Keperluan Sistem',
    fUpdated: 'Dikemas kini',
    fPkg: 'Nama Pakej',
    fCert: 'Cap Jari Sijil (SHA-256)',
    copy: 'Salin',
    copied: 'Disalin',
    verifyBody: 'Sebelum memasang, bandingkan cap jari sijil APK ini dengan nilai di atas. Jika berbeza, jangan pasang — muat turun semula daripada sumber asal.',
    upgradeWarn: 'Sudah pasang versi lama? Nyahpasang dahulu. Versi ini ditandatangani dengan kunci baharu, jadi Android tidak membenarkan ia menimpa versi lama — anda hanya akan nampak "Aplikasi tidak dipasang". Rekod draf pada peranti akan hilang.',
    fNotes: 'Perubahan',

    stepTitle: 'Cara Pemasangan',
    stepSub: 'Empat langkah, tidak sampai seminit.',
    step1t: 'Muat turun fail APK',
    step1b: 'Tekan butang muat turun di atas. Fail akan masuk ke folder Muat Turun telefon anda.',
    step2t: 'Benarkan sumber tidak diketahui',
    step2b: 'Buka fail itu. Jika telefon bertanya, benarkan pemasangan daripada sumber tidak diketahui untuk pelayar atau pengurus fail yang anda guna.',
    step3t: 'Tekan "Pasang"',
    step3b: 'Tunggu sehingga selesai, kemudian tekan "Buka".',
    step4t: 'Daftar masuk',
    step4b: 'Masukkan No. Kad Pengenalan dan Kata Laluan idMe anda. Kelayakan disimpan pada peranti sahaja.',

    featTitle: 'Ciri-ciri Utama',
    featSub: 'Yang paling kerap digunakan guru semasa waktu pertama.',
    f1t: 'Satu ketikan, semua hadir',
    f1b: 'Tanda semua murid Hadir sekali ketik, kemudian Kemaskini. Tiada lagi menatal satu-satu.',
    f2t: 'Tiga keadaan kehadiran',
    f2b: 'Hadir, kategori A (PDPR / cuti), dan Tidak Hadir — dipadankan dengan BIL. HADIR yang dipulangkan pelayan.',
    f3t: 'Laporan Bulanan + kalendar',
    f3b: 'Laporan Kehadiran Kelas dengan kalendar bulanan. Ketik mana-mana tarikh untuk terus buka senarai hari itu.',
    f4t: 'Pengesahan Bulanan',
    f4b: 'Simpan & Sahkan untuk mengesahkan rekod sebulan. Butang dikunci sehingga bulan tamat, supaya tidak tersalah tekan.',
    f5t: 'Cetak Laporan (PDF)',
    f5b: 'Jana PDF terus daripada telefon — tiada komputer diperlukan.',
    f6t: 'Dua bahasa',
    f6b: 'Bahasa Melayu (lalai) dan Bahasa Cina. Sebab tidak hadir kekal dalam Bahasa Melayu seperti dalam sistem.',

    faqTitle: 'Soalan Lazim',
    q1: 'Mengapa telefon berkata "sumber tidak diketahui"?',
    a1: 'APK ini diedarkan di luar Google Play, jadi telefon memerlukan kebenaran sekali sahaja. Pergi ke Tetapan → Keselamatan → benarkan pemasangan aplikasi tidak diketahui, kemudian buka semula fail APK.',
    q2: 'Adakah aplikasi ini mengumpul data saya?',
    a2: 'Tidak. No. Kad Pengenalan dan Kata Laluan anda disimpan pada peranti sahaja. Aplikasi hanya berhubung dengan sistem idMe rasmi — tiada pelayan pihak ketiga.',
    q3: 'Adakah ini aplikasi rasmi?',
    a3: 'Bukan. Ini alat bantu tidak rasmi yang dibina untuk kegunaan guru. Semua rekod tetap disimpan dalam sistem idMe rasmi Kementerian Pendidikan Malaysia.',
    q4: 'Pemasangan gagal — apa perlu saya buat?',
    a4: 'Pastikan telefon anda Android 7.0 ke atas dan ada ruang storan mencukupi. Jika versi lama sudah dipasang, nyahpasang dahulu, kemudian pasang semula fail ini.',

    footNote: 'Alat bantu tidak rasmi. Bukan produk rasmi Kementerian Pendidikan Malaysia.',
    footRight: 'Rekod kehadiran kekal dalam sistem idMe rasmi.',
  },

  zh: {
    title: 'idMe 极速点名 · 下载 APK',
    desc: '给教师用的 idMe 点名工具，一键全班出席。下载 Android APK。',

    brand: 'idMe 极速点名',
    brandSub: '马来西亚教育部 · 出勤快捷系统',
    tagline: '给教师用的点名工具 —— 一键全班出席，一个按钮提交。',
    dl: '下载 APK',
    dlNote: '需要 Android 7.0 及以上 · 需允许安装未知来源',
    install: '安装说明',

    navInfo: '文件信息',
    navInstall: '安装',
    navFeatures: '功能',
    navFaq: '常见问题',

    infoTitle: '文件信息',
    fVersion: '版本',
    fSize: '文件大小',
    fReq: '系统要求',
    fUpdated: '更新日期',
    fPkg: '包名',
    fCert: '签名指纹 (SHA-256)',
    copy: '复制',
    copied: '已复制',
    verifyBody: '安装前可以把 APK 的证书指纹和上面这串对比。对不上就不要装，请回到原始来源重新下载。',
    upgradeWarn: '装过旧版？请先卸载再装这一版。本版换了签名密钥，Android 不允许它覆盖旧版 —— 你只会看到「应用未安装」。卸载会丢掉本机草稿。',
    fNotes: '本版变化',

    stepTitle: '安装步骤',
    stepSub: '四步，不到一分钟。',
    step1t: '下载 APK',
    step1b: '点上方下载按钮，文件会存到手机的「下载」文件夹。',
    step2t: '允许「未知来源」',
    step2b: '点开文件。如果系统提示，给浏览器或文件管理器开启「允许安装未知应用」。',
    step3t: '点「安装」',
    step3b: '等安装完成，然后点「打开」。',
    step4t: '登录',
    step4b: '输入 idMe 的身份证号和密码。凭据只保存在本机，不会上传。',

    featTitle: '主要功能',
    featSub: '教师第一节课最常用的几件事。',
    f1t: '一键全班出席',
    f1b: '点一下把所有学生标为出席，再点提交。不用再一行行滑。',
    f2t: '三态出勤',
    f2b: '出席、A 类（PDPR / 假期）、缺席 —— 与服务端返回的 BIL. HADIR 对齐，不会误判。',
    f3t: '月度报表 + 月历',
    f3b: '班级出勤报表带月历，点任意一天直接跳到那天的名单。',
    f4t: '月度封存',
    f4b: '用「Simpan & Sahkan」封存整月记录。月份没结束按钮就锁住，避免误按。',
    f5t: '导出报表 PDF',
    f5b: '直接在手机上生成 PDF，不用开电脑。',
    f6t: '中马双语',
    f6b: '默认马来文，可切中文。缺席假因保留马来文原文，与服务端一致。',

    faqTitle: '常见问题',
    q1: '为什么提示「未知来源」？',
    a1: '这个 APK 不走 Google Play 分发，所以系统需要一次性授权。到「设置 → 安全 → 安装未知应用」里允许，再重新点开 APK。',
    q2: '会收集我的数据吗？',
    a2: '不会。身份证号和密码只存在本机。应用只和官方 idMe 系统通信，没有第三方服务器。',
    q3: '这是官方应用吗？',
    a3: '不是。这是给教师自用的非官方辅助工具。所有记录仍然保存在马来西亚教育部的官方 idMe 系统里。',
    q4: '装不上怎么办？',
    a4: '确认手机是 Android 7.0 及以上、存储空间够。如果装过旧版本，先卸载再装这个文件。',

    footNote: '非官方辅助工具，不是马来西亚教育部的官方产品。',
    footRight: '出勤记录始终保存在官方 idMe 系统内。',
  },
};

const STORE_KEY = 'idme_site_lang';
const nodes = document.querySelectorAll('[data-i18n]');
const buttons = document.querySelectorAll('.lang button');
let current = 'ms';

/* ══════════════ 版本清单 ══════════════
   version.json 由 mobile-app/tools/publish-release.mjs 从 APK 字节算出，
   是版本号 / 体积 / SHA-256 的**唯一事实源**。页面里那些 [data-live] 元素
   只是首屏占位与 file:// 兜底 —— 拉到清单就覆盖掉，不再需要手工同步。

   为什么不用 fetch().then() 直接改 DOM：切语言时 notes 要跟着换语言，
   所以要把清单存起来，由 apply() 在每次切语言时重渲染。 */
let manifest = null;

function fmtSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function renderLive() {
  if (!manifest) return;
  const set = (key, val) => {
    if (val == null) return;
    for (const el of document.querySelectorAll(`[data-live="${key}"]`)) el.textContent = val;
  };
  set('version', manifest.versionName);
  set('code', manifest.versionCode);
  set('size', fmtSize(manifest.size));
  set('sha256', manifest.sha256);
  set('published', manifest.published);

  // 两个下载按钮都指向清单里的真实地址（Release 附件），而不是仓库里的相对路径。
  // 仓库里没有 APK —— 它被 .gitignore 挡掉，只在 Release 里。
  for (const id of ['dlTop', 'dlBottom']) {
    const a = document.getElementById(id);
    if (a && manifest.apk) {
      a.href = manifest.apk;
      a.setAttribute('download', '');
    }
  }

  const notesRow = document.getElementById('notesRow');
  const notesEl = document.getElementById('notes');
  const text = manifest.notes?.[current] || manifest.notes?.en;
  if (notesRow && notesEl && text) {
    notesEl.textContent = text;
    notesRow.hidden = false;
  }
}

/* 清单拉不到不是错误 —— 页面里已有兜底值，照常可用。
   但控制台要留一条，免得「发了新版页面却没变」时无从查起。 */
fetch('version.json', { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
  .then(m => { manifest = m; renderLive(); })
  .catch(e => console.warn('[version.json] 未加载，沿用页面内联值：', e.message));

function apply(code) {
  const dict = I18N[code];
  if (!dict) return;
  current = code;

  document.documentElement.lang = code === 'zh' ? 'zh-CN' : 'ms';
  document.title = dict.title;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', dict.desc);

  for (const el of nodes) {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.textContent = dict[key];
  }
  for (const b of buttons) b.classList.toggle('on', b.dataset.lang === code);

  // 语言变了，复制按钮要回到未复制状态，否则会留着上一个语言的「已复制」
  const copyBtn = document.getElementById('copy');
  if (copyBtn) {
    copyBtn.textContent = dict.copy;
    copyBtn.classList.remove('done');
  }
  try { localStorage.setItem(STORE_KEY, code); } catch { /* 隐私模式忽略 */ }

  // 更新说明要跟着语言走。apply 可能早于清单到达（首屏），
  // 那时 manifest 还是 null，renderLive 自己会跳过。
  renderLive();
}

for (const b of buttons) {
  b.addEventListener('click', () => apply(b.dataset.lang));
}

/* 复制签名指纹 —— 校验 APK 时最常被手抄错的一串 */
const copyBtn = document.getElementById('copy');
const sha = document.getElementById('sha');
if (copyBtn && sha) {
  copyBtn.addEventListener('click', async () => {
    const text = sha.textContent.trim();
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // http:// 或旧浏览器没有 clipboard API，退回选中文本
      try {
        const r = document.createRange();
        r.selectNodeContents(sha);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        ok = document.execCommand('copy');
      } catch { ok = false; }
    }
    if (!ok) return;
    copyBtn.textContent = I18N[current].copied;
    copyBtn.classList.add('done');
    setTimeout(() => {
      copyBtn.textContent = I18N[current].copy;
      copyBtn.classList.remove('done');
    }, 1800);
  });
}

/* 首次访问按浏览器语言猜一次；之后一律听用户自己的选择。
   注意别写成 `saved || isZh ? 'zh' : 'ms'` —— || 优先级高于 ?:，
   存过 'ms' 也会被判成中文。 */
let saved = null;
try { saved = localStorage.getItem(STORE_KEY); } catch { /* 忽略 */ }
let guess = saved;
if (guess !== 'ms' && guess !== 'zh') {
  guess = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'ms';
}
apply(guess);
