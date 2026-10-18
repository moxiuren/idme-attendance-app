# 桌面端只读验证与审计工具

## 为什么需要这些工具

App 跑在 Android WebView 里，`CapacitorHttp` 由 OkHttp 实现（自带重定向跟随与原生 CookieJar）。
Node 环境没有这个原生实现，Web 兜底会丢失跨跳 Cookie，登录第 2 步就返回 419。

`shim-capacitor.mjs` 用 `fetch` 提供等价语义（cookie jar + 手动跟随重定向），
通过 esbuild 的 `--alias` 注入，**不参与 App 构建**。
这样就能在桌面端**真实执行**业务代码（登录 / 解析 / 提交报文组装），而不用装手机。

## 前置条件

1. `../credentials.json` 存在（已被 `.gitignore` 排除，不会提交）
   —— **仅 `verify-live.mjs` 需要**；契约测试完全离线，不需要凭据。
2. 先构建探针 bundle（`dist/` 会被 `vite build` 清空，所以每次都要重建）：

```bash
cd mobile-app
npm run probe      # 产出 dist/_probe.mjs、dist/_sebab.mjs、dist/_flow.mjs
```

3. `make-icon.py` 需要 Pillow，且**只有系统 Python 3.14 装了**（托管运行时没有 venv）：
   `C:/Python314/python.exe tools/make-icon.py`

## 脚本清单

| 脚本 | 用途 | 命令 |
|---|---|---|
| `build-probe.mjs` | 构建验证所需的三个 bundle | `npm run probe` |
| `verify-live.mjs` | 线上只读回归：三态解析 / 提交报文 / **排序断言** / 安全护栏 | `npm run verify:live` |
| `test-submit-flow.mjs` | **离线**契约测试：PDPR 确认后是否真的归档 / 合并按钮弹哪个框 / 护栏不被绕过 / 未来日期导航锁死 / 报表预热 | `npm run test:flow` |
| `test-report-calendar.mjs` | **离线**契约测试：月历格子构造（未来日期不可点、星期对齐）+ 点选跳转的接线 | `npm run test:calendar` |
| `fixtures.mjs` | 上面两个测试共用的**预制响应夹具**（纯数据，无状态） | — |
| `make-icon.py` | 生成应用图标（手账风点名卡）：五档密度 15 个 PNG + 预览图 | `python tools/make-icon.py` |
| `probe-date-range.mjs` | 日期可填窗口探针：确认官方上下界之外服务端怎么响应 | `node tools/probe-date-range.mjs` |
| `probe-order.mjs` | 排序根因探针：`order` 参数 A/B/C 三组对照 | `node tools/probe-order.mjs` |
| `fetch-official-strings.mjs` | 抓官网页面到 `tools/out/`，用于提取马来文原文 | `node tools/fetch-official-strings.mjs` |
| `i18n-audit.mjs` | i18n 完整性：key 缺失 / ms-zh 一致 / 占位符对齐 / 死词条 | `npm run audit:i18n` |
| `shim-capacitor.mjs` | Capacitor 垫片（被上面几个脚本依赖，不单独运行） | — |
| `shim-vue.mjs` | Vue 垫片（仅 `ref` / `computed`），供契约测试使用 | — |
| `shim-preferences.mjs` | `@capacitor/preferences` 垫片，供契约测试使用 | — |

## 契约测试为什么单独存在

`verify-live.mjs` 只覆盖 `submitAttendance` 的**报文组装**（一个函数）。
但「点 PDPR 的 YA 之后到底有没有真的发出写请求」「合并后的提交按钮弹的是哪一个确认框」
这类行为住在 composable（`useAttendance`）里 —— 真机点一遍能发现，但成本高、易漏、无法回归。

`test-submit-flow.mjs` 把 `idme.request` 换成一台**可控路由器**（读接口回放预制 JSON、
写接口只记录参数），于是解析、三态判定、`_snapshot`、`SAFETY_BLOCK` 护栏全是真实代码在跑；
`ask()` 换成假对话框，把「弹了什么、弹了几次、点了什么」全部记下来。

`tools/entry-flow.mjs` 是它的打包入口 —— 关键是让 `useAttendance` 与 `idme`
落在**同一张模块图**里，否则替换的 `idme.request` 对 composable 不可见，断言会假通过。

`test-report-calendar.mjs` 不需要这个 bundle：它测的 `src/reportCalendar.js` 是纯函数，
直接 import 即可。**这就是当初把它从 ReportSheet.vue 抽出来的理由** ——
`.vue` 在 Node 里没有模板编译器，写在组件里的逻辑只能做文本断言，抽出来才能真跑。
组件与 App 的接线仍然只能靠源码结构断言，所以那一节明确标注了是结构检查。

## 行数门禁逼出来的拆分

`fixtures.mjs` 不是设计出来的，是 `test-submit-flow.mjs` 涨到 534 有效行、
撞上「单文件 ≤ 499 有效行」门禁后按审计建议拆的。
造数据与写断言本来就是两件事，拆开后夹具还能被月历测试复用。

## 安全边界

**只调用查询接口**：

- `ajaxloadkehadiranharian`（花名册查询）✅
- `ajax-takhadir`（假因字典）✅
- 各 HTML 页面 GET ✅

**不调用写接口**：`kemaskiniKehadiranHarian`（提交）、`setSemulaKehadiran`（重置）。

`verify-live.mjs` 的护栏验证会把网络层替换成哨兵 ——
**任何真实请求都会抛 `SENTINEL`**，因此那一段在触网前就结束，绝无写入。

`test-submit-flow.mjs` 更进一步：**整个进程从不发起任何网络请求**，
写接口被路由器拦截并记录，只用于断言报文内容。

## 关于 `tools/out/`

`fetch-official-strings.mjs` 的产物（官网页面 HTML / JSON）落在 `tools/out/`，
已被 `.gitignore` 的 `out/` 通配覆盖。它可能含账号相关页面，**不要提交**。
文案出处对照见 `docs/OFFICIAL-STRINGS.md`。
