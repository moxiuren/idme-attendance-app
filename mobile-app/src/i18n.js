/**
 * 界面语言（i18n）
 *
 * 默认马来文（ms）—— 使用者是马来西亚教师，界面术语必须与官方系统一致。
 * 中文（zh）供本人 / 华文教师使用。
 *
 * ★★ 文案来源规则（重要）★★
 * 马来文**不是**从中文翻译过来的，而是**逐字取自官方网站抓取结果**
 * （见 tools/fetch-official-strings.mjs，产物在 tools/out/）。
 * 每条按来源标注：
 *   【官方】= 与官网逐字一致（页面可见文本、swal 弹窗、DataTables 语言包等）
 *   【自拟】= 官方无对应文案（本 App 新增的交互），
 *             直接以马来文撰写，并只使用官方词汇（murid / rekod / kemaskini …）
 * 参考来源：
 *   tabguru.html            出勤页：表头、按钮、swal 弹窗、状态徽章
 *   datatable-malay.json    官方 DataTables 马来文语言包
 *   moeis-home.html         MOEIS 首页：Peratus Kehadiran
 *   idme-login.html         登录页：Daftar Masuk / Nombor Kad Pengenalan
 *   idme-password-step.html 密码步：Kata Laluan / ID Pengguna
 *
 * 注意：**缺勤假因词条不做翻译**，一律保留马来文原文
 * （见 sebab.js 头部说明），因为教师提交时要与服务端下拉逐字对应。
 *
 * 用法：
 *   import { t, lang, setLang } from './i18n.js';
 *   t('submit')                  // 无参数
 *   t('selCount', { n: 5 })      // {n} 占位符
 */

import { ref, computed } from 'vue';
import { Preferences } from '@capacitor/preferences';

const STORE_KEY = 'idme_lang';
// 语言列表。设置页的语言切换是 v-for 驱动的（见 SettingsSheet.vue），
// 故新增语言只需在此追加一项 + 在 DICT 里加同名区块，无需改任何 UI 代码。
export const LANGS = [
  { code: 'ms', label: 'Bahasa Melayu', short: 'BM' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh', label: '中文', short: '中' },
];

/** 当前语言，默认马来文 */
export const lang = ref('ms');

const DICT = {
  ms: {
    // ── 启动 / 登录 ──
    // 登录页 h1。上方已有 logo「idMe」，故这里只写后半段 ——
    // 视觉上拼起来就是完整名 "idMe Attendance"。
    appTitle: 'Attendance',                      // 【自拟】品牌名
    // 注：曾有 appSub（登录页副标题「Alat bantu guru · bukan produk rasmi」）。
    // 2026-10-18 按用户要求从封面移除 —— 标题下方只留 logo 与标题本身，
    // 少一行说明反而更像一张手账封面。键已随之删除，不留死词条。
    // 登录四步进度。原本硬编码在 idmeCore.login() 的中文里，绕过 i18n，
    // 导致国文界面下仍冒出中文。改为 key 后由 App.vue 用 t() 翻译。
    bootStep1: 'Menyambung ke portal idMe…',
    bootStep2: 'Mengesahkan No. Kad Pengenalan…',
    bootStep3: 'Mengesahkan kata laluan dan membuka sesi…',
    // 第 4 步内部其实是三跳串行（门户应用列表 → SSO 直通 → 出勤页）。
    // 出勤页 195 KB，慢网下要等好几秒；只显示一个静止的「4/4」会让教师以为卡死。
    // 故拆成三个子进度，让等待过程可见 —— 原本的单一 bootStep4 已无引用，移除。
    bootStep4a: 'Membuka portal aplikasi…',
    bootStep4b: 'Memindahkan sesi ke sistem kehadiran…',
    bootStep4c: 'Memuatkan senarai kelas…',
    icLabel: 'No. Kad Pengenalan',               // 【官方】表头 NO. KAD PENGENALAN
    pwLabel: 'Kata Laluan',                      // 【官方】登录步字段名
    icPh: 'Nombor Kad Pengenalan / Passport',    // 【官方】登录页 placeholder
    pwPh: 'Kata Laluan',                         // 【官方】密码步 placeholder
    login: 'Daftar Masuk',                       // 【官方】登录按钮
    loggingIn: 'Sedang diproses...',             // 【官方】DataTables sProcessing
    credNote: 'Kelayakan disimpan pada peranti sahaja.', // 【自拟】
    needCred: 'Sila masukkan No. Kad Pengenalan dan Kata Laluan', // 【自拟】

    // ── 顶栏 / 吸底 ──
    noClass: 'Kelas tidak dijumpai',             // 【自拟】
    actPdpr: 'PDPR',                             // 【官方】A 类分类名（按钮文字）
    actPdprFull: 'Tanda semua murid sebagai PDPR', // 【自拟】
    actReport: 'Laporan',                        // 【官方】侧栏
    actSettings: 'Tetapan',                      // 【官方】PENGURUSAN TETAPAN
    actDone: 'Selesai',                          // 【自拟】
    online: 'Dalam talian',                      // 【自拟】
    offline: 'Luar talian',                      // 【自拟】

    // ── 日期 ──
    // ★ 官方状态徽章原文（tabguru 页 statusBadge），不是「Diarkib」——
    //   官方网站里没有 arkib 这个词，确认动作用的是 Sah / Pengesahan。
    archived: 'TELAH DISAHKAN',                  // 【官方】statusBadge badge-success
    notArchived: 'MENUNGGU PENGESAHAN',          // 【官方】statusBadge badge-warning
    jumpToday: 'Tarikh semasa',                  // 【官方】
    prevDay: 'Hari sebelumnya',                  // 【自拟】
    nextDay: 'Hari seterusnya',                  // 【自拟】
    prevMonth: 'Bulan sebelumnya',               // 【自拟】
    nextMonth: 'Bulan seterusnya',               // 【自拟】
    jumpThisMonth: 'Bulan semasa',               // 【自拟】

    // ── 统计 ──
    statTotal: 'Jumlah',                         // 【官方】报表表头
    statPresent: 'Hadir',                        // 【官方】BIL. HADIR
    statAbsent: 'Tidak Hadir',                   // 【官方】BIL. TIDAK HADIR
    statRate: 'Peratus',                         // 【官方】Peratus Kehadiran（窄栏取词干）
    statNote: 'BIL. HADIR termasuk {n} murid PDPR / cuti', // 【自拟】

    // ── 三态 ──
    // present / absent 用官方词；excused 是本站内部判读（官方无此标签），
    // 实际渲染改用官方**分类名**（A → PDPR），见 StudentList.vue。
    // 这里的 excused 仅作分类缺失时的兜底，取官方计数的说法 Hadir。
    present: 'Hadir',                            // 【官方】
    excused: 'Hadir',                            // 【官方】（兜底）
    absent: 'Tidak Hadir',                       // 【官方】

    // ── 列表 ──
    loading: 'Sedang diproses...',               // 【官方】sProcessing
    empty: 'Tiada data',                         // 【官方】sEmptyTable
    // 空态副行：告诉教师「下一步该看哪里」。
    // 官方 sEmptyTable 只有一句 Tiada data，教师无从判断是选错日期还是系统没数据，
    // 所以这里必须补一句可执行的说明（本句为自拟，不冒充官方文案）。
    emptyHint: 'Pastikan tarikh ini hari persekolahan, atau muat semula senarai.',

    // ── 批量 ──
    selCount: 'Dipilih {n} / {total}',           // 【自拟】
    selectAll: 'Pilih Semua',                    // 【自拟】
    invertSelect: 'Songsang',                    // 【自拟】
    selectNone: 'Kosongkan',                     // 【自拟】
    cancel: 'Batal',                             // 【官方】
    markPresent: 'Tanda Hadir',                  // 【官方】按钮
    markAbsent: 'Tanda Tidak Hadir',             // 【自拟】（承官方 BIL. TIDAK HADIR）

    // ── 吸底 ──
    // 常规模式只有两个按钮：PDPR + 提交。提交按钮语义随屏幕状态切换：
    // 无缺席/请假 → submitAllPresent（全班到齐 + 归档）；有条目 → submit + 明细。
    // 提交按钮改为主行（官方动词 Kemaskini）+ 副行（明细）两段式：
    // 马来文明细较长，单行会折成 3 行撑破 60px 按钮高度。
    submitting: 'Sedang diproses...',            // 【官方】
    submit: 'Kemaskini',                         // 【官方】出勤页按钮
    submitDetail: '{absent} tidak hadir',                              // 【官方】BIL. TIDAK HADIR
    submitDetailEx: '{absent} tidak hadir · {excused} PDPR/cuti',      // 【官方】+【自拟】
    submitAllPresent: 'Kemaskini · Semua hadir', // 【官方】+【自拟】

    // ── 假因抽屉 ──
    reasonTitleOne: 'Sebab Pelajar Tidak Hadir',            // 【官方】
    reasonTitleBatch: 'Senarai Sebab Pelajar Tidak Hadir',  // 【官方】
    reasonStudents: '{n} murid: {names}',                   // 【自拟】
    reasonStudentsMore: '{n} murid: {names} dsb.',          // 【自拟】
    freqUsed: 'Kerap Digunakan',                            // 【自拟】
    close: 'Tutup',                                         // 【官方】
    refresh: 'Muat semula',                                 // 【自拟】
    restoreOne: 'Set semula sebagai Hadir',                 // 【官方】Set Semula
    restoreMany: 'Set semula semua sebagai Hadir ({n} murid)', // 【官方】+【自拟】

    // ── 班级抽屉 ──
    pickClass: 'Pilih Kelas',                    // 【官方】KELAS + Sila Pilih

    // ── 报表 ──
    reportTitle: 'Laporan Kehadiran Kelas',      // 【官方】Laporan Kehadiran Kelas X Bulan Y
    avgPresent: 'Purata Hadir',                  // 【自拟】官方 Purata Kedatangan，窄栏取官方词 Purata + Hadir
    schoolDays: 'Hari Belajar',                  // 【官方】Bil. Hari Belajar Dalam Bulan Ini（取词干）
                                                 //   注意：官方全站不存在 "persekolahan"，勿回译
    totalEndMonth: 'Jumlah Murid',               // 【官方】Jumlah + Murid
    exportPdf: 'Cetak Laporan',                  // 【官方】
    sahBulanan: 'Simpan & Sahkan',               // 【官方】按钮
    // 月度封存二次确认。前两句取官方 swal 原文，末句为不可撤销提示（自拟）
    confirmSahTitle: 'Pengesahan Kehadiran Bulanan',  // 【官方】
    confirmSah: 'Adakah anda pasti? Maklumat pelajar tidak hadir yang tidak lengkap, tidak akan direkodkan dalam senarai pelajar tidak hadir. Pengesahan {m}/{y} ini tidak boleh dibatalkan.', // 【官方】+【自拟】
    // 月份未结束时提前提醒（官方此时直接把按钮置 disabled，这里交教师判断）
    sahNotOver: 'Bulan belum tamat',             // 【自拟】灰按钮旁的一行说明
    // 月历
    noRecord: 'Belum direkod',                   // 【自拟】
    openDay: 'Buka senarai kehadiran',           // 【自拟】月历格子的提示 / 无障碍标签
    legend: 'Petunjuk',                          // 【官方】月度报表页图例标题
    reportFail: 'Gagal memuatkan data. Sila cuba lagi.',  // 【官方】

    // ── 设置 ──
    settingsTitle: 'Tetapan',                    // 【官方】
    language: 'Pilih Bahasa',                    // 【官方】idMe 门户
    show: 'Tunjuk',                              // 【自拟】
    hide: 'Sembunyi',                            // 【自拟】
    saveRelogin: 'Simpan & Log Masuk Semula',    // 【官方】Simpan + Log Masuk
    clearCred: 'Padam Kelayakan Peranti',        // 【自拟】
    dictMeta: 'Sebab: {sebab} item · {cat} kategori', // 【自拟】
    appVersion: 'Versi {v}',                          // 【自拟】设置页版本号

    // ── 应用内更新 ──
    // 官方系统里没有这套交互，全部【自拟】，只用官方词汇（kemas kini / muat turun）。
    updCheck: 'Semak Kemas Kini',                // 【自拟】
    updChecking: 'Menyemak kemas kini…',         // 【自拟】
    updLatest: 'Aplikasi sudah versi terkini ({v})',  // 【自拟】
    updAvailable: 'Versi baharu {v} tersedia',   // 【自拟】
    updCurrent: 'Versi semasa: {v}',             // 【自拟】
    updDownload: 'Muat Turun',                   // 【自拟】
    updDownloading: 'Memuat turun… {p}%',        // 【自拟】
    updDownloadingNa: 'Memuat turun…',           // 【自拟】服务器未给总大小时
    updDownloaded: 'Muat turun selesai',         // 【自拟】
    updInstall: 'Pasang',                        // 【自拟】
    updInstalling: 'Membuka pemasang…',          // 【自拟】
    updCancel: 'Batal',                          // 【自拟】
    updRetry: 'Cuba Lagi',                       // 【自拟】
    updClose: 'Tutup',                           // 【自拟】
    updNeedPermission: 'Benarkan pemasangan dari sumber ini dalam tetapan, kemudian tekan Pasang semula.', // 【自拟】
    updOpenSettings: 'Buka Tetapan',             // 【自拟】
    updNotes: 'Perubahan',                       // 【自拟】
    updCheckFailed: 'Gagal menyemak kemas kini. Sila cuba lagi.',  // 【自拟】
    updDownloadFailed: 'Gagal memuat turun. Sila cuba lagi.',      // 【自拟】
    updBadManifest: 'Maklumat kemas kini tidak sah.',              // 【自拟】
    updOnlyOnDevice: 'Kemas kini hanya tersedia dalam aplikasi.',  // 【自拟】
    updShaNote: 'Pakej disemak SHA-256 sebelum dipasang',          // 【自拟】

    // 作者落款。**刻意不翻译**：品牌名与语言无关，
    // 马来文界面下也显示「小莫出品」。两条字典取同值，
    // 是为了让 audit:i18n 的「ms/zh 键必须一一对应」继续成立 ——
    // 若只在一边定义，审计会把另一边报成缺键。
    authorSign: '小莫出品',                            // 【自拟】

    // ── 提示 / 确认 ──
    toastPdprApplied: 'Semua {n} murid ditanda PDPR',              // 【自拟】
    toastPdprAlready: 'Semua murid sudah ditanda PDPR',            // 【自拟】
    toastMarked: 'Ditanda "{name}"',                               // 【自拟】
    toastMarkedBatch: '{n} murid ditanda "{name}"',                // 【自拟】
    toastRestoredOne: 'Ditanda semula sebagai Hadir',              // 【官方】Rekod ditanda semula sebagai hadir
    toastRestoredMany: '{n} murid ditanda semula sebagai Hadir',   // 【官方】+【自拟】
    toastMarkedPresent: '{n} murid ditanda Hadir, sila Kemaskini', // 【自拟】
    toastNoChange: 'Tiada perubahan berbanding rekod pelayan',     // 【自拟】
    toastSubmitted: 'Rekod kehadiran telah berjaya disimpan',      // 【官方】
    toastSubmittedEx: 'Rekod kehadiran harian telah berjaya disahkan', // 【官方】
    toastExported: 'Disimpan: {file}',                             // 【自拟】
    toastSahOk: 'Pengesahan Kehadiran Bulanan {m}/{y} telah berjaya direkodkan.', // 【官方】
    toastSahUnknown: 'Pelayan tidak memulangkan status',           // 【自拟】
    confirmPdpr: 'Adakah anda pasti? Semua {total} murid akan ditanda PDPR. {overwrite} rekod sedia ada akan ditulis ganti.', // 【官方】Adakah anda pasti? + 【自拟】
    confirmAllPresentSubmit: 'Adakah anda pasti? Semua {total} murid akan ditanda Hadir, kemudian rekod kehadiran dikemaskini.', // 【官方】Adakah anda pasti? + 【自拟】
    confirmAllAbsent: 'Adakah anda pasti? Semua {n} murid akan ditanda sebagai Tidak Hadir.', // 【官方】+【自拟】
    confirmOverwrite: 'Rekod tarikh ini TELAH DISAHKAN. Menyimpan akan menulis ganti rekod sedia ada. Adakah anda pasti?', // 【官方】+【自拟】
    confirmExit: 'Ada perubahan kehadiran yang belum disimpan. Keluar akan menghilangkannya. Adakah anda pasti?', // 【官方】+【自拟】
    confirmJump: 'Ada perubahan kehadiran yang belum disimpan. Bertukar tarikh akan menghilangkannya. Adakah anda pasti?', // 【官方】+【自拟】
    confirmForceSuffix: 'Teruskan juga?',                          // 【自拟】
    // 草稿恢复：教师在点名途中被电话 / 系统回收打断后重新进入时显示
    draftRestored: 'Perubahan yang belum disimpan telah dipulihkan. Sila Kemaskini.', // 【自拟】
    // ── 确认对话框（自建，替代原生 confirm）──
    confirmOk: 'Ya',                             // 【官方】swal 里的「Ya」
    confirmTitlePdpr: 'PDPR',                    // 【官方】A 类分类名
    confirmTitlePresent: 'Tanda Hadir',          // 【官方】按钮
    confirmTitleAbsent: 'Tanda Tidak Hadir',     // 【自拟】承官方 BIL. TIDAK HADIR
    confirmTitleVerified: 'TELAH DISAHKAN',      // 【官方】statusBadge
    confirmTitleExit: 'Keluar',                  // 【自拟】
    confirmTitleJump: 'Tukar Tarikh',            // 【自拟】从报表月历跳到某天
    confirmTitleBlocked: 'Tidak dibenarkan.',    // 【官方】swal 标题
    // 安全护栏正文：由服务层抛出的 detail（total / serverAbsent）组装。
    // 服务层的 message 是开发者向中文说明，不可直接展示。
    safetyBlock: 'Semua {total} murid akan ditanda Tidak Hadir, tetapi rekod pelayan bagi tarikh ini hanya menunjukkan {serverAbsent} tidak hadir. Jika hari ini PDPR / cuti, sila gunakan kategori berkenaan.',
    holiday: 'Cuti Penggal. Tiada proses kemasukan dibenarkan',    // 【官方】
    holidayEvent: 'Cuti Peristiwa. Tiada proses kemasukan dibenarkan', // 【官方】
    notRecordable: 'Proses tidak dibenarkan. Sila semak tarikh tetapan terlebih dahulu', // 【官方】
    // 【自拟】官方选择器下界（minDate = #sebulan，学期起始日）之外的日期，
    // 服务端不报错、也不给 statushari，而是直接返回**空名单**（实测 2026-10-16：
    // 05/01/2026 与 01/12/2025 均返回 0 人，12/01/2026 起才有 31 人）。
    // 因此「名单为空」就是「该日期不在可录入窗口内」的信号，必须给出说明，
    // 否则教师只看到一片空白。
    noRoster: 'Tiada senarai murid untuk tarikh ini.',
    // 注：官方这几句是完整整句，不含占位符。
    // 但真机排查需要看到具体错误，故在官方原文后补上 ({msg})。
    // 外层模板只给「哪个操作失败」，{msg} 由 errors.js 的 errText() 填**完整原因句**。
    // 官方原文是 'Gagal memuatkan data. Sila cuba lagi.' —— 这里去掉后半句，
    // 因为原因句本身多半已含「请重试」，拼起来会重复。
    syncFail: 'Gagal memuatkan data: {msg}',   // 【官方】+【自拟】连接
    submitFail: 'Gagal menyimpan data: {msg}',
    queryFail: 'Gagal memuatkan data: {msg}',
    exportFail: 'Cetak gagal: {msg}',                            // 【自拟】
    sahFail: 'Gagal menyimpan data: {msg}',
    reloginFail: 'Gagal log masuk semula: {msg}',                // 【自拟】

    // ── 错误原因（按 IdMeError.code 映射，见 errors.js）──
    // 【自拟】官方无逐条对应文案，全部以马来文撰写并只用官方词汇
    // （murid / rekod / daftar masuk / No. Kad Pengenalan / Kata Laluan）。
    // {alert} 仅在 BAD_IC / BAD_CREDENTIAL 时非空，内容是官方页面 alert 原文。
    errCredMissing: 'Sila masukkan No. Kad Pengenalan dan Kata Laluan.',
    errTokenMissing: 'Gagal menyediakan sesi keselamatan. Sila cuba lagi.',
    errBadIc: 'No. Kad Pengenalan tidak dapat disahkan.{alert}',
    errBadCred: 'Gagal daftar masuk.{alert}',
    errSsoMissing: 'Aplikasi Pengurusan Murid tidak dijumpai dalam portal idMe.',
    errNotLoggedIn: 'Sesi telah tamat. Sila daftar masuk semula.',
    errNoClass: 'Tiada kelas untuk akaun ini.',
    errSessionLost: 'Sesi telah tamat. Sila daftar masuk semula.',
    errParse: 'Gagal membaca data kehadiran daripada pelayan.',
    errNetwork: 'Tiada sambungan internet atau pelayan tidak dapat dihubungi.',
    errUnknown: 'Ralat tidak dijangka. Sila cuba lagi.',
  },

  zh: {
    // ── 启动 / 登录 ──
    // 品牌名不翻译：中文界面下同样显示 "idMe Attendance"，与 authorSign 同理。
    appTitle: 'Attendance',
    // 封面副标题已按用户要求移除（见 ms 字典同处的说明）。
    bootStep1: '正在连接 idMe 门户…',
    bootStep2: '正在校验身份证号…',
    bootStep3: '正在验证密码并建立会话…',
    bootStep4a: '正在打开应用门户…',
    bootStep4b: '正在把会话转移到出勤系统…',
    bootStep4c: '正在加载班级名单…',
    icLabel: '身份证号 / No. Kad Pengenalan',
    pwLabel: '密码 / Kata Laluan',
    icPh: '请输入 12 位身份证号',
    pwPh: '请输入 idMe 密码',
    login: '登录并同步出勤',
    loggingIn: '正在登录…',
    credNote: '凭据仅保存在本机，用于自动续期登录。',
    needCred: '请填写身份证号与密码',

    // ── 顶栏 / 吸底 ──
    noClass: '未获取班级',
    actPdpr: 'PDPR',
    actPdprFull: '一键把全班设为 PDPR（居家学习）',
    actReport: '报表',
    actSettings: '设置',
    actDone: '完成',
    online: '在线',
    offline: '离线',

    // ── 日期 ──
    archived: '已确认',
    notArchived: '等待确认',
    jumpToday: '回到今天',
    prevDay: '前一天',
    nextDay: '后一天',
    prevMonth: '上个月',
    nextMonth: '下个月',
    jumpThisMonth: '回到本月',

    // ── 统计 ──
    statTotal: '总人数',
    statPresent: '出席',
    statAbsent: '缺席',
    statRate: '出席率',
    statNote: '出席人数含 {n} 人 PDPR / 请假（官方计入 BIL. HADIR）',

    // ── 三态 ──
    present: '出席',
    excused: '出席',
    absent: '缺席',

    // ── 列表 ──
    loading: '正在同步出勤数据…',
    // 与 ms 侧保持同一结构：empty 只陈述事实，emptyHint 给下一步动作。
    // 原中文把两句压在一行，界面一加图标就会变成一坨，故拆开。
    empty: '没有学生数据',
    emptyHint: '请确认该日期是上课日，或重新同步名单。',

    // ── 批量 ──
    selCount: '已选 {n} / {total}',
    selectAll: '全选',
    invertSelect: '反选',
    selectNone: '清空',
    cancel: '取消',
    markPresent: '标记出席',
    markAbsent: '标记缺勤',

    // ── 吸底 ──
    submitting: '提交中…',
    submit: '提交归档',
    submitDetail: '{absent} 人缺席',
    submitDetailEx: '{absent} 人缺席 · {excused} 人 PDPR/请假',
    submitAllPresent: '全班到齐 · 提交归档',

    // ── 假因抽屉 ──
    reasonTitleOne: '选择缺勤原因',
    reasonTitleBatch: '批量设置缺勤原因',
    reasonStudents: '{n} 名学生：{names}',
    reasonStudentsMore: '{n} 名学生：{names} 等',
    freqUsed: '常用',
    close: '关闭',
    refresh: '刷新数据',
    restoreOne: '恢复正常出席',
    restoreMany: '全部恢复为出席（{n} 人）',

    // ── 班级抽屉 ──
    pickClass: '选择班级',

    // ── 报表 ──
    reportTitle: '月度出勤报表',
    avgPresent: '日均出席',
    schoolDays: '上课日',
    totalEndMonth: '总人数',
    exportPdf: '导出 A4 出勤分析表 (PDF)',
    sahBulanan: '封存归档 (Sahkan)',
    confirmSahTitle: '月度出勤确认',
    confirmSah: '确定要封存 {y} 年 {m} 月吗？未补齐的缺席信息将不再计入缺席名单。此操作不可撤销。',
    sahNotOver: '本月尚未结束',
    noRecord: '未录入',
    openDay: '打开该日点名名单',
    legend: '图例',
    reportFail: '加载失败，请重试',
    toastSahOk: '{y} 年 {m} 月已成功封存归档',
    toastSahUnknown: '服务端未返回明确状态',
    sahFail: '封存失败：{msg}',

    // ── 设置 ──
    settingsTitle: '设置',
    language: '界面语言',
    show: '显示',
    hide: '隐藏',
    saveRelogin: '保存并重新登录',
    clearCred: '清除本机凭据',
    dictMeta: '假因词条：{sebab} 项 · {cat} 分类',
    appVersion: '版本 {v}',

    // ── 应用内更新 ──
    updCheck: '检查更新',
    updChecking: '正在检查更新…',
    updLatest: '已是最新版本（{v}）',
    updAvailable: '发现新版本 {v}',
    updCurrent: '当前版本：{v}',
    updDownload: '下载',
    updDownloading: '正在下载… {p}%',
    updDownloadingNa: '正在下载…',
    updDownloaded: '下载完成',
    updInstall: '安装',
    updInstalling: '正在打开安装程序…',
    updCancel: '取消',
    updRetry: '重试',
    updClose: '关闭',
    updNeedPermission: '请先在系统设置中允许本应用安装应用，然后再次点「安装」。',
    updOpenSettings: '打开设置',
    updNotes: '更新内容',
    updCheckFailed: '检查更新失败，请重试',
    updDownloadFailed: '下载失败，请重试',
    updBadManifest: '更新信息无效',
    updOnlyOnDevice: '应用内更新仅在手机上可用',
    updShaNote: '安装前会校验 SHA-256',

    authorSign: '小莫出品',   // 品牌名，与语言无关；见 ms 字典同键说明

    // ── 提示 / 确认 ──
    toastPdprApplied: '已将全班 {n} 人标记为 PDPR',
    toastPdprAlready: '全班已是 PDPR，无需重复操作',
    toastMarked: '已标记「{name}」',
    toastMarkedBatch: '已将 {n} 人标记为「{name}」',
    toastRestoredOne: '已恢复出席',
    toastRestoredMany: '已将 {n} 人恢复为出席',
    toastMarkedPresent: '已将 {n} 人标记为出席，请点提交归档',
    toastNoChange: '当前状态与服务端记录一致，无需重复提交',
    toastSubmitted: '出勤记录已成功保存',
    toastSubmittedEx: '每日出勤记录已成功确认',
    toastExported: '已导出：{file}',
    confirmPdpr: '将把全班 {total} 人设为「PDPR（居家学习）」。\n\n其中 {overwrite} 条现有记录会被覆盖。确认继续？',
    confirmAllPresentSubmit: '确认把全班 {total} 人标记为「出席」并提交归档？',
    confirmAllAbsent: '即将把全班 {n} 人标记为「缺席」并提交，确认继续？',
    confirmOverwrite: '该日期已确认归档，提交将覆盖服务端现有记录。确认继续？',
    confirmExit: '有尚未提交的出勤改动，退出将丢失。确认退出？',
    confirmJump: '有尚未提交的出勤改动，切换日期将丢失。确认切换？',
    confirmForceSuffix: '是否仍要强制提交？',
    draftRestored: '已恢复未提交的改动，请记得提交。',
    // ── 确认对话框 ──
    confirmOk: '确定',
    confirmTitlePdpr: 'PDPR',
    confirmTitlePresent: '标记出席',
    confirmTitleAbsent: '标记缺席',
    confirmTitleVerified: '已确认归档',
    confirmTitleExit: '退出',
    confirmTitleJump: '切换日期',
    confirmTitleBlocked: '操作被拒绝',
    safetyBlock: '即将把全班 {total} 人标记为「缺席」，但服务端当天记录仅 {serverAbsent} 人缺席。若当天是 PDPR / 请假等官方算出席的情形，请改用对应分类。',
    holiday: '当天为学期假（Cuti Penggal），不可录入',
    holidayEvent: '当天为特别假期（Cuti Peristiwa），不可录入',
    notRecordable: '当天不可录入出勤',
    noRoster: '此日期没有学生名单（不在学期可录入范围内）',
    syncFail: '同步失败：{msg}',
    submitFail: '提交失败：{msg}',
    queryFail: '查询失败：{msg}',
    exportFail: '导出失败：{msg}',
    reloginFail: '自动重连失败：{msg}',

    // ── 错误原因（按 IdMeError.code 映射，见 errors.js）──
    // {alert} 仅在 BAD_IC / BAD_CREDENTIAL 时非空，内容是官方页面 alert 原文
    // （马来文），保留原文是因为它比自拟译文更贴近服务端真实判定。
    errCredMissing: '请先填写身份证号与密码。',
    errTokenMissing: '安全会话初始化失败，请重试。',
    errBadIc: '身份证号校验未通过。{alert}',
    errBadCred: '登录失败。{alert}',
    errSsoMissing: 'idMe 门户中未找到 Pengurusan Murid 应用入口。',
    errNotLoggedIn: '会话已失效，请重新登录。',
    errNoClass: '此账号没有负责的班级。',
    errSessionLost: '会话已失效，请重新登录。',
    errParse: '无法解析服务端返回的出勤数据。',
    errNetwork: '网络不可用或服务器无法连接。',
    errUnknown: '发生未知错误，请重试。',
  },

  // 英文界面。
  // ★ 取舍说明：官方术语（Kemaskini / Hadir / TELAH DISAHKAN …）在官网是马来文，
  //   教师提交后回到服务端看到的仍是马来文。本字典把这些**译成英文** ——
  //   因为英文用户读不懂马来文，保留原文等于没做英文界面。
  //   仅两类不译：
  //     ① PDPR —— 马来文缩写（Pembelajaran Di Rumah），官方系统里就是这个代号；
  //     ② Pengurusan Murid —— 官方应用名，属专名，译了反而对不上门户里的入口。
  //   因此英文界面下，界面词与服务端词汇存在差异，这是刻意接受的代价。
  en: {
    // ── 启动 / 登录 ──
    appTitle: 'Attendance',                       // 品牌名，与语言无关
    // 封面副标题已按用户要求移除（见 ms 字典同处的说明）。
    bootStep1: 'Connecting to idMe portal…',
    bootStep2: 'Verifying IC number…',
    bootStep3: 'Verifying password and opening session…',
    bootStep4a: 'Opening application portal…',
    bootStep4b: 'Transferring session to attendance system…',
    bootStep4c: 'Loading class list…',
    icLabel: 'IC No.',
    pwLabel: 'Password',
    icPh: 'IC number / Passport',
    pwPh: 'Password',
    login: 'Sign In',
    loggingIn: 'Processing…',
    credNote: 'Credentials are stored on this device only.',
    needCred: 'Please enter IC number and password',

    // ── 顶栏 / 吸底 ──
    noClass: 'No class found',
    actPdpr: 'PDPR',
    actPdprFull: 'Mark all students as PDPR',
    actReport: 'Report',
    actSettings: 'Settings',
    actDone: 'Done',
    online: 'Online',
    offline: 'Offline',

    // ── 日期 ──
    archived: 'VERIFIED',
    notArchived: 'PENDING VERIFICATION',
    jumpToday: 'Today',
    prevDay: 'Previous day',
    nextDay: 'Next day',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    jumpThisMonth: 'This month',

    // ── 统计 ──
    statTotal: 'Total',
    statPresent: 'Present',
    statAbsent: 'Absent',
    statRate: 'Rate',
    statNote: 'PRESENT includes {n} students on PDPR / leave',

    // ── 三态 ──
    present: 'Present',
    excused: 'Present',
    absent: 'Absent',

    // ── 列表 ──
    loading: 'Syncing attendance data…',
    empty: 'No data',
    emptyHint: 'Make sure this date is a school day, or reload the list.',

    // ── 批量 ──
    selCount: 'Selected {n} / {total}',
    selectAll: 'Select all',
    invertSelect: 'Invert',
    selectNone: 'Clear',
    cancel: 'Cancel',
    markPresent: 'Mark Present',
    markAbsent: 'Mark Absent',

    // ── 吸底 ──
    submitting: 'Processing…',
    submit: 'Update',
    submitDetail: '{absent} absent',
    submitDetailEx: '{absent} absent · {excused} PDPR/leave',
    submitAllPresent: 'Update · All present',

    // ── 假因抽屉 ──
    reasonTitleOne: 'Reason for Absence',
    reasonTitleBatch: 'Absence Reasons',
    reasonStudents: '{n} students: {names}',
    reasonStudentsMore: '{n} students: {names} etc.',
    freqUsed: 'Frequently Used',
    close: 'Close',
    refresh: 'Reload',
    restoreOne: 'Reset to Present',
    restoreMany: 'Reset all to Present ({n} students)',

    // ── 班级抽屉 ──
    pickClass: 'Select Class',

    // ── 报表 ──
    reportTitle: 'Class Attendance Report',
    avgPresent: 'Average Present',
    schoolDays: 'School Days',
    totalEndMonth: 'Total Students',
    exportPdf: 'Print Report',
    sahBulanan: 'Save & Verify',
    confirmSahTitle: 'Monthly Attendance Verification',
    confirmSah: 'Are you sure? Incomplete absence records will not be saved to the absence list. Verification for {m}/{y} cannot be undone.',
    sahNotOver: 'Month not yet ended',
    noRecord: 'Not recorded',
    openDay: 'Open attendance list for this day',
    legend: 'Legend',
    reportFail: 'Failed to load data. Please try again.',

    // ── 设置 ──
    settingsTitle: 'Settings',
    language: 'Language',
    show: 'Show',
    hide: 'Hide',
    saveRelogin: 'Save & Sign In Again',
    clearCred: 'Delete Device Credentials',
    dictMeta: 'Reasons: {sebab} items · {cat} categories',
    appVersion: 'Version {v}',

    // ── In-app update ──
    updCheck: 'Check for Updates',
    updChecking: 'Checking for updates…',
    updLatest: 'You are on the latest version ({v})',
    updAvailable: 'New version {v} available',
    updCurrent: 'Current version: {v}',
    updDownload: 'Download',
    updDownloading: 'Downloading… {p}%',
    updDownloadingNa: 'Downloading…',
    updDownloaded: 'Download complete',
    updInstall: 'Install',
    updInstalling: 'Opening installer…',
    updCancel: 'Cancel',
    updRetry: 'Retry',
    updClose: 'Close',
    updNeedPermission: 'Allow installing from this source in system settings, then tap Install again.',
    updOpenSettings: 'Open Settings',
    updNotes: "What's new",
    updCheckFailed: 'Could not check for updates. Please try again.',
    updDownloadFailed: 'Download failed. Please try again.',
    updBadManifest: 'Update information is invalid.',
    updOnlyOnDevice: 'In-app update is only available on the phone.',
    updShaNote: 'Package is verified with SHA-256 before install',

    authorSign: '小莫出品',                        // 品牌名，与语言无关

    // ── 提示 / 确认 ──
    toastPdprApplied: 'All {n} students marked as PDPR',
    toastPdprAlready: 'All students already marked as PDPR',
    toastMarked: 'Marked "{name}"',
    toastMarkedBatch: '{n} students marked "{name}"',
    toastRestoredOne: 'Reset to Present',
    toastRestoredMany: '{n} students reset to Present',
    toastMarkedPresent: '{n} students marked Present, please Update',
    toastNoChange: 'No changes compared to server records',
    toastSubmitted: 'Attendance record saved successfully',
    toastSubmittedEx: 'Daily attendance record verified successfully',
    toastExported: 'Saved: {file}',
    toastSahOk: 'Monthly verification for {m}/{y} recorded successfully.',
    toastSahUnknown: 'Server did not return a status',
    confirmPdpr: 'Are you sure? All {total} students will be marked PDPR. {overwrite} existing records will be overwritten.',
    confirmAllPresentSubmit: 'Are you sure? All {total} students will be marked Present, then the attendance record updated.',
    confirmAllAbsent: 'Are you sure? All {n} students will be marked Absent.',
    confirmOverwrite: 'The record for this date is already VERIFIED. Saving will overwrite the existing record. Are you sure?',
    confirmExit: 'There are unsaved attendance changes. Leaving will discard them. Are you sure?',
    confirmJump: 'There are unsaved attendance changes. Changing date will discard them. Are you sure?',
    confirmForceSuffix: 'Continue anyway?',
    draftRestored: 'Unsaved changes have been restored. Please Update.',
    // ── 确认对话框 ──
    confirmOk: 'Yes',
    confirmTitlePdpr: 'PDPR',
    confirmTitlePresent: 'Mark Present',
    confirmTitleAbsent: 'Mark Absent',
    confirmTitleVerified: 'VERIFIED',
    confirmTitleExit: 'Exit',
    confirmTitleJump: 'Change Date',
    confirmTitleBlocked: 'Not allowed.',
    safetyBlock: 'All {total} students will be marked Absent, but the server record for this date shows only {serverAbsent} absent. If today is PDPR / a holiday, please use the relevant category.',
    holiday: 'Mid-term break. No entry allowed',
    holidayEvent: 'Special holiday. No entry allowed',
    notRecordable: 'Entry not allowed. Please check the date settings first',
    noRoster: 'No student list for this date.',
    syncFail: 'Failed to load data: {msg}',
    submitFail: 'Failed to save data: {msg}',
    queryFail: 'Failed to load data: {msg}',
    exportFail: 'Print failed: {msg}',
    sahFail: 'Failed to save data: {msg}',
    reloginFail: 'Failed to sign in again: {msg}',

    // ── 错误原因（按 IdMeError.code 映射，见 errors.js）──
    errCredMissing: 'Please enter IC number and password.',
    errTokenMissing: 'Failed to set up secure session. Please try again.',
    errBadIc: 'IC number could not be verified.{alert}',
    errBadCred: 'Sign in failed.{alert}',
    errSsoMissing: 'Pengurusan Murid application not found in the idMe portal.',
    errNotLoggedIn: 'Session expired. Please sign in again.',
    errNoClass: 'No class assigned to this account.',
    errSessionLost: 'Session expired. Please sign in again.',
    errParse: 'Failed to read attendance data from the server.',
    errNetwork: 'No internet connection or server unreachable.',
    errUnknown: 'Unexpected error. Please try again.',
  },
};

/**
 * 取当前语言的文案，支持 {name} 占位符。
 * 在模板中调用会随 lang 变化自动重渲染（内部读取 lang.value）。
 */
export function t(key, params) {
  const table = DICT[lang.value] || DICT.ms;
  let s = table[key];
  if (s === undefined) s = DICT.ms[key];
  if (s === undefined) return key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

/** 语言中文名，用于设置页展示 */
export const langLabel = computed(() => LANGS.find(l => l.code === lang.value)?.label || 'Bahasa Melayu');

/** 从本机读取语言偏好（默认马来文） */
export async function loadLang() {
  try {
    const { value } = await Preferences.get({ key: STORE_KEY });
    if (value && DICT[value]) lang.value = value;
  } catch { /* 忽略，保持默认 */ }
  return lang.value;
}

/** 切换并持久化语言 */
export async function setLang(code) {
  if (!DICT[code]) return;
  lang.value = code;
  try {
    await Preferences.set({ key: STORE_KEY, value: code });
  } catch { /* 忽略 */ }
}
