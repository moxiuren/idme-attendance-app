/**
 * 构建只读验证所需的两个 bundle。
 *
 * 为什么不用 shell 重定向：
 *   `esbuild ... > dist/x.mjs` 在 Windows 下由 cmd.exe 执行重定向，
 *   沙箱会拒绝；而 esbuild 自己写文件同样被拒。
 *   因此这里用 esbuild 的 JS API + write:false，拿到产物文本后由 Node 的 fs 落盘 ——
 *   Node 的写入在所有环境下都可用（fetch-official-strings.mjs 同理）。
 *
 * 产物（均在 dist/，已被 .gitignore 覆盖）：
 *   dist/_probe.mjs  idmeService 全量业务代码，@capacitor/core 替换为桌面垫片
 *   dist/_sebab.mjs  假因字典（护栏验证用）
 *   dist/_flow.mjs   useAttendance + idme 同图打包（提交流程契约测试用）
 *
 * 用法：node tools/build-probe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const OUT_DIR = 'dist';

const BUNDLES = [
  {
    file: '_probe.mjs',
    entry: 'src/idmeService.js',
    alias: { '@capacitor/core': './tools/shim-capacitor.mjs' },
    note: '业务代码（登录 / 出勤 / 提交报文组装）',
  },
  {
    file: '_sebab.mjs',
    entry: 'src/sebab.js',
    note: '假因字典与分类判定',
  },
  {
    file: '_flow.mjs',
    entry: 'tools/entry-flow.mjs',
    // vue 也换成垫片：契约测试不需要响应式，且避免 esm-bundler 的编译期标志；
    // @capacitor/preferences 同样垫掉（i18n.js 会 import 它，原生插件在 Node 下无桥可注册）
    alias: {
      '@capacitor/core': './tools/shim-capacitor.mjs',
      '@capacitor/preferences': './tools/shim-preferences.mjs',
      vue: './tools/shim-vue.mjs',
    },
    note: '提交流程契约（确认后是否真的归档）',
  },
  {
    file: '_draft.mjs',
    entry: 'tools/entry-draft.mjs',
    // draft.js 依赖 Preferences 落盘；真实插件在 Node 下访问 window.localStorage 会崩，
    // 换成内存垫片后，测试跑的仍是 draft.js 的**同一份源码**，只是存储层被替换。
    alias: { '@capacitor/preferences': './tools/shim-preferences.mjs' },
    note: '草稿持久化契约（分键 / 上限 / 过期 / 容错）',
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const b of BUNDLES) {
  const result = await build({
    entryPoints: [b.entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    loader: { '.json': 'json' },
    ...(b.alias ? { alias: b.alias } : {}),
    write: false,          // 关键：不让 esbuild 落盘，改由 Node 写
    logLevel: 'warning',
  });
  const text = result.outputFiles[0].text;
  const target = path.join(OUT_DIR, b.file);
  fs.writeFileSync(target, text, 'utf8');
  console.log(`  ✓ ${target.padEnd(20)} ${String(text.length).padStart(8)} 字节  ← ${b.entry}  (${b.note})`);
}

console.log('完成。');
