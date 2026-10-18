# idMe 教师快捷点名 App

面向马来西亚教育部 **idMe（MOEIS / SPS - Pengurusan Murid）** 网页端出勤操作的手机 App，
供班主任快速完成全班点名与提交。

- **形态**：Capacitor + Vue 3 + Vite 套壳，产物为 Android APK
- **包名**：`my.gov.moe.idme.attendance`
- **核心目标**：把官方网页「逐人勾选 + 多次翻页」的流程，压缩为
  「打开 → 一键全勤 / 点按标记缺席 → 提交」，实测 5 秒内完成全班提交

> 仅供个人自用，**禁止分发**。更换签名需先卸载旧版。

---

## 目录结构

```
idme-attendance-app/
├── mobile-app/                  # 手机端主工程（Capacitor + Vue 3）
│   ├── src/
│   │   ├── App.vue              # 主界面（教师友好浅色 UI）
│   │   ├── i18n.js              # 中 / 马双语字典（默认马来文，文案源自官网原文）
│   │   ├── Icon.vue             # 内联 SVG 图标集（8 个，不引第三方库）
│   │   ├── idmeService.js       # API 客户端门面（组装下列模块）
│   │   ├── idmeCore.js          # 认证链路 / Cookie 按域隔离 / HTTP / 令牌提取
│   │   ├── idmeAttendance.js    # 花名册查询 / 官方排序 / 三态解析 / 提交
│   │   ├── idmeReport.js        # 假因拉取 / 月度统计 / 报表导出 / 两级缓存
│   │   ├── monthReport.js       # 月度报表解析（纯函数，逐日出席 + 汇总）
│   │   ├── reportCalendar.js    # 月历格子构造（纯函数，含「未来日期不可点」判定）
│   │   ├── StudentList.vue      # 学生行（三态着色 + 长按进批量）
│   │   ├── ReasonSheet.vue      # 缺勤原因抽屉（单人 / 批量共用）
│   │   ├── ReportSheet.vue      # 月度报表抽屉（月历视图 + 单动作按钮）
│   │   ├── SettingsSheet.vue    # 设置抽屉（语言 / 凭据）
│   │   ├── ClassSheet.vue       # 班级切换抽屉
│   │   ├── sebab.js             # 假因字典（12 分类 / 98 项）与分组工具
│   │   ├── sebab-dictionary.json
│   │   └── styles/              # 样式四分片（base / components / attendance / sheets）
│   ├── tools/                   # 只读验证与审计脚本
│   │   ├── verify-live.mjs      # 线上只读回归（含排序断言 + 提交护栏 + 报表缓存）
│   │   ├── test-submit-flow.mjs # 提交流程契约测试（完全离线，见下）
│   │   ├── test-report-calendar.mjs   # 报表月历契约测试（纯函数单测 + 接线断言）
│   │   ├── fixtures.mjs         # 契约测试的预制响应夹具（纯数据）
│   │   ├── probe-date-range.mjs # 日期可填窗口探针（只读，验证上下界）
│   │   ├── test-month-parser.mjs      # 月度报表解析器单测
│   │   ├── probe-month.mjs      # 月度报表端点探针
│   │   ├── probe-month-state.mjs      # 封存状态判据探针
│   │   ├── probe-order.mjs      # 排序根因探针（order 参数 A/B/C 对照）
│   │   ├── fetch-official-strings.mjs  # 抓取官网页面 → tools/out/
│   │   ├── i18n-audit.mjs       # i18n 完整性审计
│   │   ├── build-probe.mjs      # 打包探针 bundle（_probe / _sebab / _flow）
│   │   ├── make-icon.py         # 生成定制应用图标（Pillow，五档密度 + 预览）
│   │   ├── entry-flow.mjs       # 契约测试打包入口（useAttendance + idme 同图）
│   │   ├── shim-capacitor.mjs   # 桌面端 fetch/cookie 垫片（不参与构建）
│   │   ├── shim-vue.mjs         # Vue 垫片（仅 ref/computed，不参与构建）
│   │   └── shim-preferences.mjs # Preferences 垫片（不参与构建）
│   ├── android/                 # Android 工程（含原生 PDF 打印插件）
│   │   └── app/src/main/java/my/gov/moe/idme/attendance/
│   │       ├── MainActivity.java
│   │       └── PdfGeneratorPlugin.java
│   └── eslint.config.mjs
├── download-site/               # APK 下载落地页（零依赖静态站，见下）
│   ├── index.html
│   ├── styles.css               # 设计令牌取自 mobile-app/src/styles/base.css
│   ├── app.js                   # 仅两件交互：切语言 / 复制签名指纹
│   ├── assets/                  # icon-64 / 192 / 512
│   └── download/                # 放签名好的 APK（**不入库**，见 .gitignore）
├── docs/
│   ├── OFFICIAL-STRINGS.md      # ★ 马来文文案官方出处对照（改 i18n 前必读）
│   ├── UI-REVIEW.md             # UI 设计评审
│   ├── contrast-audit.py        # 对比度审计（64 组，退出码 0 = 全过）
│   ├── touch-target-audit.py    # 触控目标审计（16 个选择器）
│   ├── line-budget-audit.py     # 单文件行数预算（组件拆分护栏）
│   ├── icon-preview.png         # 图标预览（方形 / 圆形 / 三种遮罩，由 make-icon.py 产出）
│   └── screenshots-ui/          # 真机截图（含真实学生姓名，**不入库**，见 .gitignore）
├── idme_client.py               # 早期 Python 客户端（桌面控制台用）
├── attendance_cli.py            # 命令行点名工具
├── server.py                    # 本地网页图形点名服务
├── sebab_dictionary.json        # 全量假因字典（98 项）
├── src-rust/                    # 早期 Rust 桌面控制台（独立仓库，已排除）
└── requirements.txt
```

---

## 认证链路（4 步 SSO）

idMe 采用跨子域 SSO：统一身份门户 `idme.moe.gov.my` → 业务子域 `moeispel.moe.gov.my`，
两域各自持有独立的 Laravel Session Cookie 与 Incapsula 防火墙 Cookie。

1. `GET  idme.moe.gov.my/login` —— 取初始 Session Cookie 与 CSRF `_token`
2. `POST idme.moe.gov.my/daftarawam/semakanverification` —— 提交 `ic`，校验身份证
3. `POST idme.moe.gov.my/login` —— 提交密码 + `check=2` 标志，建立门户会话
4. `GET  idme.moe.gov.my/list_aplikasi` —— 抓取子系统 SSO 令牌，跳转
   `moeispel.moe.gov.my?token_idms=...` 绑定 MOEIS 会话

**关键实现约束**：

- Cookie **按域隔离**存储，重定向时每跳必须重新注入对应域的 Cookie
  （否则 302 跳转后会话丢失，被踢回登录页）
- 登录成功判定**不能只匹配正文关键词** —— 密码错误时服务端 302 回 `/login`，
  正文并无 `tidak sah` 字样。必须结合 URL（是否落到 `/home`）与
  「响应是否仍含 `<form>`」双重判定
- 会话 1~2 小时自然过期后返回 **HTTP 419**（Laravel CSRF），需强制重登重试

---

## 三态出席模型（重要，勿简化）

官方在部分场景下**不勾选复选框，但仍计入出席**（如居家学习 PDPR、官方核准请假）。
因此 `kehadiran.includes('checked')` **不是**出席的唯一判据。

服务层使用三态：

| 状态 | 含义 | 判据 |
|---|---|---|
| `present` | 勾选出席 | `kehadiran` 含 `checked` |
| `excused` | 有请假记录且官方算出席 | 无勾选但有 `laporan_takhadir`，且被计入服务端 `bilhadir` |
| `absent` | 缺席 | 其余 |

**实测规律**：

```
服务端 bilhadir = 勾选出席数 + 「官方算出席」的请假数
```

名额分配算法（不硬编码分类白名单，以服务端计数反推）：

```
候选 = 无勾选但有请假记录者
名额 = bilhadir − 勾选数
按分类优先级 A > G > E > P 取前「名额」个 → excused
其余候选 → absent
```

> **历史缺陷警示**：早期版本仅凭 `checked` 判定出席，在 PDPR 居家学习日
> 实测得到「全班 0 人出席 / 31 人缺席」，教师一提交即把全班误写为缺席、
> **覆盖官方已有归档**。三态模型与「以服务端计数为权威」即为此而设，
> 并配**提交护栏**：拟提交全班缺席而服务端快照并非全班缺席时，直接拒绝提交。

---

## 学生名单排序（勿删 order 参数）

官方 `#kehadiran` 表**是**服务端分页 DataTable，配置为：

```js
"serverSide": true,
"order": [[2, 'asc']],          // 第 2 列 = namamurid
"columns": [bil, kehadiran, namamurid, sebabtidakhadir]
```

ajax 会把 `order` / `columns` / `search` 一并 POST —— **即「由服务端按姓名升序排」**。
「Bil」列的 render 是 `meta.row + meta._iDisplayStart + 1`，只是排序后的行号，
响应里的 `bil` 字段实测为空串。

实测（2026-10-16，31 人班级）：

| 请求 | 返回顺序 |
|---|---|
| 不带 `order` | 服务端默认序（非字母序）：`TAN, NUR, AHMAD, SITI, LEE …` |
| `order[0][column]=2&dir=asc` | 严格姓名升序：`AHMAD, LEE, MUHAMMAD, NUR, SITI …` |
| 同上 `dir=desc` | 与 asc 完全逆序（证明服务端确实按该参数排序） |

早期版本只发 `draw/start/length`，因此名单顺序与官方页面**不一致**。
修复：`idmeAttendance.js` 显式发送官方 `order` + `columns` 参数，
并在本地加一道兜底 —— 若返回结果不是升序，则本地按姓名重排，
序号 `index` 在排序之后生成（对齐官方 `meta.row + 1` 语义）。

`tools/verify-live.mjs` 已加入排序回归断言，跑 `npm run verify:live` 会校验
「姓名升序」与「Bil 1..N 连续」。

---

## 界面文案语言（重要）

界面默认**马来文**，术语必须与官方系统一致。
**马来文文案不是从中文翻译来的，而是逐字取自官方网站抓取结果。**

```bash
cd mobile-app
node tools/fetch-official-strings.mjs   # 只读抓取官网 → tools/out/
npm run audit:i18n                      # key 完整性 / ms-zh 一致 / 占位符对齐
```

> 官方全站**不存在** `arkib`（归档）、`dikira`（算出席）、`berdaftar`（在籍）这三个词。
> 看到它们就是回译残留。正确说法见 `docs/OFFICIAL-STRINGS.md`。

---

## 提交按钮语义（2026-10-16 用户定稿）

吸底栏**常规模式下只有两个按钮**：最左 `PDPR`，其余宽度是唯一的提交按钮。

### 一键 PDPR → 确认后直接归档

点 `PDPR` 弹确认框（文案写明「将覆盖 N 条记录」），点 **Ya 即直接提交归档**，
不再要求教师多点一次 `Kemaskini`。点 `Batal` 则一个字节都不写。
全班已是 PDPR 时不重复写入，只提示。

> 确认框只表达**用户意图**，一律**不置 `force`** —— `force` 仅用于放行服务端
> `SAFETY_BLOCK` 护栏，必须由用户在看到护栏原文后单独确认。
> 这两件事曾经被混在一起，导致「全班缺席」场景下护栏永远不会触发。

### 提交按钮语义随屏幕状态切换

| 屏幕状态 | 按钮外观 | 含义 |
|---|---|---|
| 没有任何缺席 / 请假（`pending === 0`） | 蓝色 · `Kemaskini · Semua hadir` | 全班到齐 **+ 归档**，一次点击完成 |
| 有条目（`pending > 0`） | 琥珀色 · `Kemaskini` + 副行明细 | 按屏幕名单归档 |

原先独立的 `Semua Hadir` 按钮已并入这里（它只改本地状态、还得再点一次提交）。
批量恢复仍可用「长按进批量 → 全选 → 标记出席」。

---

## 日期守卫

### 未来日期：在导航层就锁死

**官方网站自己就不允许选未来日期。** 依据（2026-10-16 从官网 `tabguru` 页原文核实）：

```js
$('#tkh_HH').datetimepicker({ minDate: $('#sebulan').val(), maxDate: new Date(), … });
```

而提交函数 `kemaskini()` **不做任何日期校验** —— 官方对「未来日期」的封锁纯粹是前端的。

本 App 的处理（2026-10-16 用户定稿）：**「下一天」箭头在今天置灰，未来日期根本走不到**，
因此不需要任何「日期未到」的提示文案。兜底还有两道（均静默，不产生任何 UI）：

- `shiftDate(delta > 0)` 内部再判一次 `canGoNext`
- `isFuture` 仍纳入 `readOnly`，`submit()` / `applyAllPdpr()` 直接返回

> 为什么不照抄官方的做法（可选日期、点确认才拦）：教师本来就不该看到未来日期的
> 出勤表 —— 那份「全班到齐」只是服务端的默认渲染，不是真实记录，显示出来反而误导。

### 可录入窗口之外：名单为空

实测（`tools/probe-date-range.mjs`，只读）：

| 日期 | 返回人数 | statushari |
|---|---|---|
| 01/12/2025 | **0** | 0 |
| 05/01/2026 | **0** | 0 |
| 12/01/2026（官方 `minDate` 当天） | 31 | 0 |
| 19/10/2026（未来） | 31 | 0 |

即：**下界之外的日期服务端不报错、也不给 `statushari`，而是直接返回空名单。**
所以「名单为空」就是「该日期不在可录入窗口内」的信号，界面必须给出说明
（`noRoster`），否则教师只看到一片空白。

> 注意：**不要**把可填范围写进任何文案。官方同时设了上下界，写「今天或之前都能填」
> 就是假承诺 —— 学期起始日之前同样填不了。

### 服务端声明不可录入：只读 + 常驻横幅

| 条件 | 判据 | 文案键 |
|---|---|---|
| 官方声明不允许录入 | `statushari === 1` | `notRecordable`【官方】 |
| 学期假 | `statushari === 2` | `holiday`【官方】 |
| 特别假 | `statushari === 3` | `holidayEvent`【官方】 |

这三类日期教师**可以**正常翻到（都在过去），所以必须解释：

- `PDPR` 与提交按钮**一并停用**（`:disabled` 纳入 `readonly`）
- 屏幕上方挂一条**常驻**琥珀色横幅 —— 不能用 `notice`，它 4 秒后就消失了，
  教师只会看到一个按不动的按钮却不知为何
- 学生行也**不可编辑**（点行不开假因抽屉、长按不进批量）——
  「改出一屏缺席却永远提交不了」比不让改更糟
- `submit()` / `applyAllPdpr()` 内部再挡一次（纵深防御），且 `force` 也不例外

> 官方页面还会用 `disabledDates(holidays)` 把公共假期从日期选择器里划掉。
> 本 App 没有假期清单接口，**未实现**这一条 —— 假期当天由服务端 `statushari` 兜住。

#### 非上课日不显示状态徽章（2026-10-17 用户要求）

日期栏右侧原本固定显示 `MENUNGGU PENGESAHAN` / `TELAH DISAHKAN`。
周六周日与假期那天，这个徽章毫无意义（根本没有可确认的出席），只会占位置、误导人。

**判据不是本地算星期几，而是服务端 `statushari`** —— 实测（2026-10-16 探针）：

| 日期 | 星期 | statushari |
|---|---|---|
| 03/10、04/10、17/10、18/10 | Sabtu / Ahad | **1** |
| 16/09（马来西亚日，公共假期） | Rabu | **1** |
| 25/09（Cuti Peristiwa，特别假） | Jumaat | 3 |
| 30/09、16/10（上课日） | — | 0 |

**周末与公共假期都是 `1`** —— 与「官方不允许录入」同一码值。
所以判定只需 `statushari >= 1`，不必再写一套本地星期几运算（本地算反而会漏掉
临时宣布的补课日与特别假）。

```js
const notRecordable = computed(() => statushari.value >= 1);
const showStatusTag  = computed(() => !notRecordable.value && !emptyRoster.value);
```

- `DateBar.vue` 新增 `showTag` prop，徽章整块 `v-if`
- 名单为空（可录入窗口之外）同样不显示 —— 没有可确认的对象
- `readOnlyReason` 对未知码值（如 4）兜底回 `notRecordable`，
  避免出现「按钮灰了却没有任何说明」

真机验证（2026-10-17）：

| 日期 | statushari | 徽章 | 常驻横幅 |
|---|---|---|---|
| 17/10 Sabtu | 1 | 无 ✓ | `Proses tidak dibenarkan…` |
| 25/09 Cuti Peristiwa | 3 | 无 ✓ | `Cuti Peristiwa. Tiada proses kemasukan dibenarkan` |
| 30/09 Rabu（上课日） | 0 | `TELAH DISAHKAN` ✓ | 无 |

---

## 非 JSON 响应：静默重登后重试一次

`ajaxloadkehadiranharian` 是 DataTable 接口，正常必须返回 JSON。
实测（2026-10-16）：**会话在请求途中静默失效时，服务端会返回一整个 HTML 页面**，
而且该页面**不含** `kehadiran` 关键字 —— 于是 `_isSessionLost()` 判不出来，
响应一路落到 `JSON.parse` 抛 `PARSE_ERROR`，教师只看到一句「同步失败」。

修法（**绝不伪造数据**）：

```js
// idmeAttendance.js —— 标为可重试
throw new IdMeError('出勤数据解析失败', 'PARSE_ERROR', true);

// useAttendance.js —— 重试条件同时覆盖两类「像掉线」的错误
const sessionLike = err instanceof IdMeError
  && (err.code === 'SESSION_LOST' || err.code === 'PARSE_ERROR');
if (sessionLike && !retried) { await relogin(); return loadAttendance(dateStr, true); }
```

- 只重试一次（`retried`），不会陷入循环
- 重试仍失败才报错，并且**保留上一次的名单**，不会把 `students` 清空
  —— 解析失败时伪造空名单会让教师误以为当天无人可录入

---

## 月度封存按钮的可用性

官方实现里，未结束的月份 `Sahkan` 按钮直接加 `disabled`。
本 App 起初改成「二次确认 + 提醒」（怕教师确需提前封存），
2026-10-16 用户定稿：**照搬官方，未结束的月份按钮置灰**，防止误触。

| 月份状态 | 按钮 |
|---|---|
| 未结束（含未来月） | `Simpan & Sahkan` **置灰**，上方一行 `Bulan belum tamat` |
| 已结束且未封存 | `Simpan & Sahkan` 可点（二次确认后调用 `sahbulanan`） |
| 已封存 | 换成 `Cetak Laporan` |

「提前封存」这条路径已不存在，相应的确认文案（`confirmSahEarly*`）一并移除；
`sahkan()` 内部仍保留 `if (!monthOver) return` 兜底。

> 实测（2026-10-16）：本账号 8 / 9 月均为 `TELAH DISAHKAN`，当月（10 月）未结束 ——
> 也就是说这个按钮目前**在任何月份都按不下去**，正是想要的效果。
> 只有出现「已结束但未封存」的月份才会真正可点。

---

## 月度报表预热（Laporan 秒开）

官方月度报表页约 350KB，冷开 2~3 秒。登录成功后立刻在后台拉一次当前月：

```js
idme.prefetchMonthlyReport(my.m, my.y);   // 不 await、不抛错、已有缓存则跳过
```

教师点开 `Laporan` 时 `hasMonthlyReport()` 已为 true —— `ReportSheet.load()`
直接走缓存分支，**不显示加载态、不闪烁**。

真机 A/B（2026-10-16，同一次点按后立刻截屏）：

| 月份 | 首帧内容 |
|---|---|
| 10 月（已预热） | 完整报表（98.90% / 30.08 / 22 / 31 + 整月月历） |
| 9 月（未预热） | `Sedang diproses...`，约 3 秒后才出内容 |

**提交出勤后必须重新预热**：`submitAttendance` 会作废该月缓存（否则月历显示旧数据），
随即调一次 `prefetchMonthlyReport`，保证下一次打开仍然秒开。
两步都在 `idmeAttendance.js` 里，顺序不可颠倒。

---

## 月历点选跳转（2026-10-17 用户要求）

报表月历的日期格可以直接点 —— 关掉抽屉，跳到那天的点名名单。
看到「这个月 14 号有 31/31」想核对明细时，不用退出报表再一天天翻。

### 哪些格子能点

| 格子 | 渲染 | 可点 |
|---|---|---|
| 有日期的过去 / 今天 | `<button class="cal-cell cal-cell-btn">` | ✅ |
| 有日期的未来 | `<span class="cal-cell">` | ❌ |
| 首日前补的空格 | `<span class="cal-cell cal-blank">` | ❌ |

未来日期不可点，与主界面「还没到的日期直接过不去」同一条原则
（点进去也只能看到一个只读页面，不如不给点）。判定用 `Date` 比较而不是字符串：

```js
const future = new Date(year, month - 1, d.day) > todayMid;
```

假期**可以**点 —— 与用箭头翻到假期是同一件事，进去能看到官方的不可录入说明。

### 未提交的改动必须先确认

点月历换日期会重新加载名单，**当前未提交的勾选会被丢弃**。
所以走的是与系统返回键同一套保护：

```
点日期 → 有改动？ → 弹「Tukar Tarikh」确认框
                      ├ Batal → 留在原日期，改动保留
                      └ Ya    → 关抽屉、换日期（改动丢弃，如对话框所述）
```

### 为什么逻辑要抽到 `reportCalendar.js`

`ReportSheet.vue` 里那段 `computed` 含两处容易写错的东西：未来日期判定、
格子与星期几的对齐。**`.vue` 在 Node 里没有模板编译器，测不了** ——
抽成纯函数后就能真正跑断言（`npm run test:calendar`，40 项）。
组件与 App 的接线（必须是 `<button>` 才可点、点完先关抽屉再换日期、
有改动先确认）则用源码结构断言兜住。

真机验证（2026-10-17）：

| 操作 | 结果 |
|---|---|
| 点 14 日（月历 31/31） | 跳到 `2026-10-14 Rabu`，统计 31/31/0 —— 与格子一致 ✓ |
| 点 21 日（未来） | 抽屉纹丝不动，不可点 ✓ |
| 有未提交改动时点 7 日 → Batal | 留在 10-14，改动保留 ✓ |
| 同上 → Ya | 跳到 `2026-10-07 Rabu`，统计 29/30 —— 与格子一致 ✓ |

---

## 屏幕方向锁定

`AndroidManifest.xml` 的 `MainActivity` 声明了 `android:screenOrientation="portrait"`，
界面不跟随屏幕旋转。样式系统按 **360dp 宽**预算，横屏会撑破统计格子。

- `targetSdkVersion = 34` → 不受 Android 16「大屏忽略方向锁」规则影响
- 本机 1260×2800 / 560dpi = 360dp 亦属手机形态，锁定稳定生效
- `configChanges` 保留 `orientation|screenSize`：即便系统强制触发配置变更
  （如多窗口），Activity 也不会被重建，WebView 状态不丢

真机验证（2026-10-16）：先用 `wm user-rotation lock 1` 把系统锁到横屏 ——
浏览器转到 `ROTATION_90`（对照组成立），再把 App 拉回前台，屏幕立即转回 `ROTATION_0`。

---

## 应用图标（2026-10-17 定制）

Capacitor 模板自带的是蓝色 X 图标，与「手账风」毫无关系。图标由
`mobile-app/tools/make-icon.py` **程序化生成**（Pillow，不是手绘素材），
配色逐字取自 `base.css` 的设计令牌 —— 换配色只改脚本常量，不必重做素材。

### 图形语义

一张微微倾斜（-4°）的点名卡：上半三条名单墨线，下半一笔绿勾 = 「名单已点完」。
**不放任何文字** —— 48px 下汉字必糊。

| 元素 | 取值 | 对应令牌 |
|---|---|---|
| 底色 | `#2B4E78` | `--blue-ink`（界面主色） |
| 卡片 | `#FCF8EC` | `--paper` |
| 卡片边框 / 名单墨线 | `#2E2A24` | `--ink` |
| 绿勾 | `#3F6B2C` | `--green`（出席） |
| 投影 | `rgba(46,42,36,.18)` 实色偏移 | `--mk`（不模糊） |

圆角带低频抖动模拟手抖，与界面里的 `--r-sk` 是同一套手绘语言。

### 生成

```bash
cd mobile-app
C:/Python314/python.exe tools/make-icon.py            # 写 15 个 PNG + 预览
C:/Python314/python.exe tools/make-icon.py --preview  # 只出 docs/icon-preview.png
```

（Pillow 只装在系统 Python 3.14 上；托管运行时没有。）

### 三种目标必须各自留边，不能共用一张图

| 目标 | 文件 | 倍率 | 理由 |
|---|---|---|---|
| 传统方形 | `ic_launcher.png` | 1.00 | 铺满整块，卡片占 64% |
| 圆形 | `ic_launcher_round.png` | 0.84 | 卡片旋转后包围盒对角半径 528 单位 > 圆半径 500，不收边会被切角 |
| 自适应前景 | `ic_launcher_foreground.png` | 0.875 | 见下 |

自适应图标的坑：**启动器只显示 108dp 图层中央的 72dp 可见区**。
第一版按「内容铺满可见区」写（倍率 1.28），真机上卡片占到可见区的 82%，
蓝底只剩一圈细边 —— 因为卡片始终占内容方块的 64%，`0.64 × 1.28 ≈ 0.82`。
改成 0.875 后卡片约 56%，且旋转后包围盒对角半径 32dp < 圆形遮罩半径 36dp，
换任何遮罩都不会切角。**预览图也必须按这个口径先裁 72dp 再套遮罩**，
否则会误判成「才占 40%，很安全」。

`values/ic_launcher_background.xml` 必须是 `#2B4E78`，否则卡片四周留白会露出模板白底。
（注意 XML 注释里不能出现连续两个减号，写 `blue-ink` 而不是 `--blue-ink`，否则
`mergeReleaseResources` 直接失败。）

### 真机验证（2026-10-17）

vivo V2324HA / Android 16 / 560dpi，`adb install -r` 覆盖安装
（不卸载 → Preferences 里的 SSO 会话保留，无需重新登录）。

用最近任务卡片头部的图标取值（桌面上图标太小）：

| 量 | 实测 |
|---|---|
| 遮罩（vivo 圆角方形） | 74 × 74 px |
| 卡片 | 42 × 47 px |
| 卡片占可见区 | 宽 56.8% / 高 63.5% |
| 居中偏差 | 水平 0.0px / 垂直 −0.5px |
| 四边留白 | 左 16 / 右 16 / 上 13 / 下 14 px |

`docs/icon-preview.png` 里第三行就是按「中央 72dp + 遮罩」渲染的桌面实际所见。

---

## 下载站（2026-10-17）

`download-site/` 是给教师下载 APK 的落地页，单页结构：
首屏 → 文件信息 → 安装四步 → 功能亮点 → FAQ → 页脚。

**零依赖**：不引框架、不引 Google Fonts、不引任何 CDN。整站可以离线打开，
也不给手机多花流量 —— 这和 App 本身「不依赖外部资源」是同一条原则。

### 设计口径

- 观感必须和 App 是同一套东西，否则教师点下载前会怀疑「这是同一个应用吗」
- 中马双语，**默认马来文**（使用者是马来西亚教师），右上角可切中文。
  用词与 `src/i18n.js` 一致：`murid` 不用 `pelajar`，`Kemaskini` / `PDPR` /
  `Laporan Kehadiran Kelas` / `Telah Disahkan` 都用官方原词
- **关掉 JS 也能看**：所有文案在 HTML 里就有马来文兜底，JS 只负责切换语言
- 版本号与体积中马文完全一样，因此**不走 i18n**，只写在 HTML 里 ——
  少两处要同步的地方。改版本时 `grep -n '1\.0\.0\|3\.1 MB' download-site/index.html`
  一次找全

### ★ 不能照搬 App 的 `--r-sk`

App 的 `255px 14px 225px 14px / 14px 225px 14px 255px` 是给 400px 宽的窄卡片调的。
直接搬到网页这种 1000×270 的宽卡片上，`ry=255` 已经超过卡片高度，整条左边缘都在弯，
渲染出来**像被啃掉一角**，而不是手绘。

站点改用「横向略大于纵向」的比例 `38px 18px 46px 16px / 18px 32px 16px 40px`：
四角仍不对称（手绘感来自不对称，不是来自极端半径），但不会失控。

### 发布

```bash
cd mobile-app
C:/Python314/python.exe tools/make-icon.py --site ../download-site/assets
cp release/idMe-rewrite.apk ../download-site/download/idMe-v1.0.0.apk
```

站点上写的证书指纹**必须和 APK 实际一致 —— 写错比不写更糟**：

```bash
apksigner verify --print-certs download-site/download/idMe-v1.0.0.apk | grep SHA-256
```

### 验证手法

页面是纯静态的，用 Playwright 直接开 `file://` 截图即可，不需要起服务器：

```bash
npx playwright screenshot --full-page --viewport-size="1280,900" \
  "file:///.../download-site/index.html" out.png
```

要切语言、量布局、抓控制台报错就写个小脚本跑 `playwright` 包。
本项目查过：控制台零报错、零失败请求，桌面 1280 与手机 390 均无横向溢出。

---

## 回归测试

```bash
cd mobile-app
npm run lint          # eslint，无输出即通过
npm run audit:i18n    # ms/zh 各 117 条，无缺失 / 无死词条
npm run test:flow     # 提交流程契约测试（离线，125 项断言，不触网）
npm run test:calendar # 报表月历契约测试（离线，40 项断言，不触网）
npm run verify:live   # 线上只读回归（需要 credentials.json）
```

```bash
cd ..
python docs/contrast-audit.py      # 64 组，退出码 0
python docs/touch-target-audit.py  # 16 个选择器
python docs/line-budget-audit.py   # 单文件行数预算（49 个文件）
```

### 为什么需要离线的 `test:flow`

`verify:live` 只覆盖 `submitAttendance` 的**报文组装**（一个函数）。
但「点 PDPR 的 Ya 之后到底有没有真的发出写请求」「合并后的提交按钮弹的是哪一个确认框」
这类行为住在 composable（`useAttendance`）里 —— 真机点一遍能发现，但成本高、易漏、无法回归。

`test-submit-flow.mjs` 把 `idme.request` 换成**可控路由器**（读接口回放预制 JSON、
写接口只记录参数），于是解析、三态判定、`_snapshot`、`SAFETY_BLOCK` 护栏全是真实代码在跑；
`ask()` 换成假对话框，把「弹了什么、弹了几次、点了什么」全部记下来。
**整个进程从不发起任何网络请求。**

---

## 构建 APK

```bash
cd mobile-app
npm install
npx vite build                        # 产出 dist/
cp -rf dist/index.html dist/assets android/app/src/main/assets/public/
cd android
./gradlew assembleRelease             # 产出 app/build/outputs/apk/release/app-release-unsigned.apk
zipalign -c -v 4 app-release-unsigned.apk    # 未签名包已天然 4 字节对齐，通常无需再对齐
apksigner sign --ks <keystore> --out idMe.apk app-release-unsigned.apk
apksigner verify --print-certs idMe.apk
```

### 构建踩坑（2026-10-16 实测记录）

1. **新增 Capacitor 插件后必须重新 sync**，否则原生侧不注册、`Capacitor.Plugins.X` 为 undefined：
   ```bash
   npx cap sync android    # 会重写 capacitor.settings.gradle / app/capacitor.build.gradle
   ```
   注意 `cap sync` 会先删后拷 `assets/public/`，若目标文件被占用会报
   `EPERM: operation not permitted` 且留下半空目录 —— 此时手动补拷即可：
   ```bash
   cp -rf dist/index.html dist/assets android/app/src/main/assets/public/
   ```

2. **`zipalign` / `apksigner` 是 Windows 原生程序，不接受 MSYS 的 `/tmp` 路径**，
   会报 `Unable to open '/tmp/xxx.apk' as zip archive`。中间产物请落在项目目录内。

3. `gradlew` 在 Git Bash 下可直接执行；本机 JDK 为 Temurin 17，Android SDK 路径见 `android/local.properties`。

> **凭据与密钥严禁入库**：`credentials.json`、`*.keystore`、`*.jks`、`*.apk`
> 均已在 `.gitignore` 中排除。签名口令请用环境变量或本地文件传递，不得写进源码。

---

## 已知限制

- `ajax-takhadir` 动态假因拉取端点已提取，未做真实调用验证
- 班级切换仅在单班级账号（TAHUN SATU B）下验证
- 统计卡片用 `container-type: inline-size` + `cqw` 自适应字号。Android 16 的
  WebView 支持；更老的 WebView（Chrome < 105）会退到 18px 兜底值

## 刻意不提供的功能

| 功能 | 官方接口 | 不做的理由 |
|---|---|---|
| **重置当天出勤** | `setSemulaKehadiran` | 会清空当天全部记录。本 App 用「全班标记出席 / PDPR 后重新提交」即可达到同样终态，不必新增破坏性入口 |

接口的**报文格式已在源码注释中留档**，日后需要时可恢复。
`npm run verify:live` 仍会核对提交出勤的报文组装（4 项断言，只记录参数不发送）。

## 月度封存（SAHKAN）

2026-10-16 曾按用户要求移除，同日又按用户要求**恢复**：用户需要「封存 + 出报表」
一站式完成。当天稍后又按用户要求把**未结束的月份直接置灰**（详见上文
「月度封存按钮的可用性」），原先的「提前封存」确认框随之移除。

保留的两道保护：

- 二次确认对话框（官方 swal 原文 + 不可撤销提示）
- 未结束的月份按钮置灰（`monthOver`），灰按钮旁一行 `Bulan belum tamat`

报表抽屉底部**只保留一个动作按钮**：未封存显示 `Simpan & Sahkan`，
已封存显示 `Cetak Laporan`。封存后该月缓存立即失效并重新拉取，按钮随之切换。

> 官方 `sahbulanan` 没有撤销入口，swal 原文警告「未补齐的缺席信息将不再计入缺席名单」，
> 因此确认框不可省略。

