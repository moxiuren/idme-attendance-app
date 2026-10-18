# 马来文文案出处对照（Official Strings Reference）

> **本文件是 i18n 的权威依据。修改 `src/i18n.js` 的 `ms` 字典前必读。**

## 为什么有这个文件

2026-10-16 用户指出：界面上的马来文（如 `Telah Diarkib`）**是拿中文回译出来的生造词**，
官方网站根本没有这种说法。正确做法是 —— **官方网站本来就是马来文，
直接把原文扒下来逐字使用**，不要经过中文中转。

本文件记录每条文案的官方出处，以及官方**没有**对应说法时的处理原则。

## 抓取方式

```bash
cd mobile-app
node tools/fetch-official-strings.mjs   # 只读，产物落在 tools/out/
```

抓取目标（全部为 GET 查询，无写操作）：

| 文件 | 来源 URL | 用途 |
|---|---|---|
| `tabguru.html` | `moeispel.moe.gov.my/sahsiah/kehadiran/tabguru` | 出勤页：表头、按钮、swal 弹窗、状态徽章、分类下拉 |
| `datatable-malay.json` | `moeispel.moe.gov.my/js/datatablemalay.json` | 官方 DataTables 马来文语言包 |
| `moeis-home.html` | `moeispel.moe.gov.my/` | 侧栏菜单、`Peratus Kehadiran` |
| `idme-login.html` | `idme.moe.gov.my/login` | 登录页 |
| `idme-password-step.html` | `idme.moe.gov.my/daftarawam/semakanverification` | 密码步 placeholder |

## 一、曾经造错、已修正的文案（★ 重点）

| 位置 | ❌ 旧（中文回译，错） | ✅ 新（官方原文） | 官方出处 |
|---|---|---|---|
| 日期状态徽章 | `Telah Diarkib` | **`TELAH DISAHKAN`** | `$('#statusBadge').text('TELAH DISAHKAN')` |
| 日期状态徽章 | `Belum Diarkib` | **`MENUNGGU PENGESAHAN`** | 同上，else 分支 |
| 「算出席」标签 | `Dikira Hadir` / `Dikira` | **官方分类名**（A → `PDPR`） | `generateKatSelect()` 下拉选项 |
| 总人数 | `Berdaftar` | **`Jumlah`** | 报表表头 `Jumlah Tidak Hadir` |
| 出席率 | `Peratus` | **`Peratus Kehadiran`** | `moeis-home.html` 图表标题 |
| 提交按钮 | `Hantar` | **`Kemaskini`** | 出勤页按钮 `<button id="kemaskiniKehadiran">Kemaskini</button>` |
| 重置 | `Kembalikan` | **`Set Semula`** | 出勤页按钮 `Set Semula` |
| 归档动作 | `Arkib Bulanan` | **`Simpan & Sahkan`** | 确认弹窗按钮 |
| A 类分类名 | `PEMBELAJARAN DI RUMAH` | **`PDPR`** | `generateKatSelect()` |
| L 类分类名 | `BENCANA ALAM` | **`BENCANA`** | `generateKatSelect()` |

> **全站检索结论**：官方网站 HTML/JS 里**不存在 `arkib`、`dikira`、`berdaftar` 这三个词**。
> 凡看到它们出现在 `ms` 字典里，就是回译残留，必须改掉。

## 二、官方词表（逐字可用）

### 表头 / 字段
`Bil` `Bil.` `Kehadiran` `Nama Murid` `Sebab Tidak Hadir` `Tarikh Tidak Hadir`
`BIL. HADIR` `BIL. TIDAK HADIR` `Jumlah` `Jumlah Tidak Hadir` `Nama` `Kategori` `Sebab`
`Bulan` `TARIKH` `KELAS` `NO. KAD PENGENALAN`

### 按钮 / 动作
`Kemaskini` `Set Semula` `Sahkan` `Simpan` `Simpan & Sahkan` `Cetak` `Cetak Laporan`
`Tutup` `Batal` `Kembali` `Log Keluar` `Tanda Hadir` `Sila Pilih` `Carian:` `Daftar Masuk`

### 状态
`TELAH DISAHKAN` `MENUNGGU PENGESAHAN`

### 提示 / 错误（swal 原文）
```
Adakah anda pasti?
Sila pilih sebab tidak hadir
Sila lengkapkan pemilihan kategori dan sebab tidak hadir sebelum membuat pengesahan
Sila pilih kategori dan sebab tidak hadir.
Rekod kehadiran harian telah berjaya disahkan
Rekod kehadiran telah berjaya diset semula
Rekod ditanda semula sebagai hadir (client-side).
Berjaya  /  Ralat
Gagal memuatkan data. Sila cuba lagi.
Gagal menyimpan data. Sila cuba lagi.
Cuti Penggal. Tiada proses kemasukan dibenarkan
Cuti Peristiwa. Tiada proses kemasukan dibenarkan
Proses tidak dibenarkan. Sila semak tarikh tetapan terlebih dahulu
Tidak dibenarkan.
Tiada data
Tiada pelajar tidak hadir yang direkodkan
Sedang diproses...  /  Diproses...
```

### 弹窗标题
`Pengesahan Kehadiran Harian` `Pengesahan Kehadiran Bulanan`
`Set Semula Rekod Kehadiran Harian` `Senarai Murid Tidak Hadir Perlu Pengesahan`
`Senarai Pelajar Tidak Hadir` `Senarai Sebab Pelajar Tidak Hadir` `Sebab Pelajar Tidak Hadir`
`ANALISA SEBAB TIDAK HADIR KELAS` `Jadual Kehadiran Kelas ${className} Bulan ${bulan}`

### 下拉占位
`---SILA PILIH KATEGORI---` `-- SILA PILIH SEBAB --`

### 登录 / 门户
`Daftar Masuk` `Nombor Kad Pengenalan / Passport` `ID Pengguna` `Kata Laluan`
`Pilih Bahasa` `Bahasa Melayu` `Tetapan`（源 `PENGURUSAN TETAPAN`）`Utama` `Aplikasi` `Bantuan`

## 三、官方 12 分类名（逐字，不得改写）

来源：`tabguru.html` → `generateKatSelect()` 的 `<option>` 列表。

| 码 | 官方名 |
|---|---|
| B | `AKTIVITI LUAR SEKOLAH` |
| K | `ANCAMAN KESELAMATAN` |
| L | `BENCANA` |
| E | `DIGANTUNG SEKOLAH` |
| J | `MASALAH KELUARGA` |
| I | `MASALAH PERIBADI` |
| A | `PDPR` |
| G | `PENGGILIRAN PEPERIKSAAN` |
| M | `KEBENARAN PENGETUA/GURU BESAR` |
| N | `PONTENG` |
| D | `MASALAH KESIHATAN` |
| P | `SEKOLAH DALAM HOSPITAL` |

假因词条（`keterangan`，如 `PEMBELAJARAN DI RUMAH`、`MAKLUMAN IBU BAPA PENJAGA`）
由服务端下发，**一律不翻译**，见 `src/sebab.js`。

## 四、官方无对应文案时的原则

本 App 有一部分交互官方并不存在（一键全班 PDPR、长按批量选择、月度报表导出…）。
这类文案的处理规则：

1. **不经过中文**。直接以马来文撰写。
2. **只用官方词汇**：`murid`（官方用 `Nama Murid`，不用 `pelajar`）、`rekod`、`kemaskini`、
   `simpan`、`set semula`、`papar`、`sah`。
3. **能拼就拼**：如「提交」相关一律用官方按钮词 `Kemaskini`，
   「重置」用 `Set Semula`，不另造动词。
4. **`i18n.js` 里标注 `【自拟】`**，官方原文标注 `【官方】`，便于日后核对。
5. 官方整句若需附上技术错误信息，写成 `官方原句 ({{msg}})`，不破坏原句。

## 五、回归护栏

```bash
cd mobile-app
npm run audit:i18n      # key 完整性 + ms/zh 集合一致 + 占位符对齐 + 死词条
```

改完 `i18n.js` 后必须跑一次；同时 `docs/contrast-audit.py` 与
`docs/touch-target-audit.py` 覆盖文案变长带来的布局回归。
