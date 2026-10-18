/**
 * 发布一条更新：算 SHA-256 → 拷 APK 到暂存区 → 生成 version.json → 打印部署命令。
 *
 * 为什么要有这个脚本：version.json 里的 sha256 与 size 必须与 APK 字节**完全一致**，
 * 手填一定出错。而且错了的表现极其难查 —— 下载 100% 完成，然后安装器报
 * 「应用未安装」或前端报「校验失败」，看不出是哪一环。让脚本从文件本身算，
 * 是唯一可靠的做法。
 *
 * 包体为什么不进 git：APK 约 4MB，而 git 历史不可删除 —— 每次发版都是永久 +4MB。
 * 故清单（几百字节）走 GitHub Pages，包体挂 GitHub Release 附件。
 *
 * 用法：
 *   node tools/publish-release.mjs release/idMe-rewrite.apk
 *
 *   # 指定 Release 的下载地址（默认按 GitHub 约定拼接）
 *   node tools/publish-release.mjs release/idMe-rewrite.apk --repo moxiuren/idme-attendance-app
 *
 * 产物：
 *   ../download-site/download/idMe-v<versionName>.apk   （上传 Release 用）
 *   ../download-site/version.json                        （Pages 用，App 拉这份）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const SITE_ROOT = path.resolve(APP_ROOT, '..', 'download-site');

// ---- 参数 ----
const args = process.argv.slice(2);
const apkArg = args.find(a => !a.startsWith('--'));
const repoIdx = args.indexOf('--repo');
const repo = repoIdx >= 0 ? args[repoIdx + 1] : 'moxiuren/idme-attendance-app';

if (!apkArg) {
  console.error('用法: node tools/publish-release.mjs <apk路径> [--repo owner/name]');
  process.exit(1);
}

// ---- 版本号：与 vite.config.js 同源，从 build.gradle 读 ----
// 注意：这里只校验「文件名/目录不像 debug 包」，不解析 APK 内部的 versionCode。
// 要解析得调 aapt2（跨平台路径难定位）。但真正致命的场景 ——
// 发了旧构建产物，导致「检测到更新 → 装完还是老版本 → 再检测到更新」死循环 ——
// 已由下面这条 debug 目录检查挡住：release 目录里只会躺着当前这次构建。
const gradle = fs.readFileSync(path.join(APP_ROOT, 'android/app/build.gradle'), 'utf8');
const codeM = /versionCode\s+(\d+)/.exec(gradle);
const nameM = /versionName\s+"([^"]+)"/.exec(gradle);
if (!codeM || !nameM) {
  console.error('[错误] 无法从 android/app/build.gradle 解析 versionCode / versionName');
  process.exit(1);
}
const versionCode = Number(codeM[1]);
const versionName = nameM[1];

// ---- 输入 APK ----
const apkPath = path.resolve(APP_ROOT, apkArg);
if (!fs.existsSync(apkPath)) {
  console.error(`[错误] 找不到 APK: ${apkPath}`);
  process.exit(1);
}

// debug 包用 debug keystore 签名，指纹与线上版本不同 —— 装了它之后，
// 后续所有 release 包都再也覆盖不上去（只能卸载重装，老师的数据全丢）。
// 这条比「未签名」更隐蔽：debug 包是签过名的，能装上，问题要到下次更新才爆。
if (/[\\/]debug[\\/]/.test(apkPath) || /-debug\.apk$/.test(apkPath)) {
  console.error('[错误] 这是 debug 包 —— 不能发布。');
  console.error('       debug keystore 的指纹与线上版本不同，装上之后再也覆盖不了 release 包，');
  console.error('       老师只能卸载重装（本地草稿与设置全丢）。');
  process.exit(1);
}

const buf = fs.readFileSync(apkPath);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
const size = buf.length;

// ---- 签名闸门：未签名的包发出去，所有老师都装不上 ----
// 这不是「检查一下更稳妥」，而是发布流程里唯一能挡住灾难的关口：
// Android 拒绝安装 unsigned APK，而下载站上看到的只是「安装失败」四个字，
// 没人会想到是发布端发错了文件。必须在本地就拦住。
const sigFiles = ['META-INF/MANIFEST.MF', 'META-INF/CERT.RSA', 'META-INF/CERT.SF'];
const hasSig = sigFiles.some(f => buf.includes(Buffer.from(f)));
if (!hasSig) {
  console.error('[错误] 该 APK 未签名 —— 不能发布。');
  console.error('       Android 只允许安装已签名的包，发出去老师只会看到「应用未安装」。');
  console.error('       签名步骤：在 android/keystore.properties 填好口令后');
  console.error('                 cd android && ./gradlew assembleRelease');
  process.exit(1);
}

// ---- 拷到暂存区（Release 上传用）----
const dlDir = path.join(SITE_ROOT, 'download');
fs.mkdirSync(dlDir, { recursive: true });
const apkName = `idMe-v${versionName}.apk`;
const destApk = path.join(dlDir, apkName);
fs.copyFileSync(apkPath, destApk);

// ---- 更新说明：同版本重复发布时保留人工写的内容 ----
const jsonPath = path.join(SITE_ROOT, 'version.json');
let notes = {
  ms: `Kemas kini versi ${versionName}.`,
  en: `Version ${versionName} update.`,
  zh: `${versionName} 版本更新。`,
};
if (fs.existsSync(jsonPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (prev.versionName === versionName && prev.notes) notes = prev.notes;
  } catch { /* 旧文件坏了就用默认值 */ }
}

// ---- 清单：apk 指向 Release 的稳定 URL ----
// 用绝对 URL 而非相对路径：包体在 Release、清单在 Pages，两者不同域。
// GitHub 会在下载时 302 到 objects.githubusercontent.com，
// 原生侧已开 setInstanceFollowRedirects(true)。
const apkUrl = `https://github.com/${repo}/releases/download/v${versionName}/${apkName}`;

// 注意：这里**不写** draft 字段。draft 只存在于仓库里那份占位清单，
// 真发布必须让它消失 —— 否则客户端会一直拒绝这份清单，更新功能永久失效。
const manifest = {
  versionCode,
  versionName,
  apk: apkUrl,
  sha256,
  size,
  published: new Date().toISOString().slice(0, 10),
  notes,
};
fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('==== 发布准备完成 ====');
console.log(`版本      : ${versionName} (versionCode ${versionCode})`);
console.log(`APK       : ${path.relative(SITE_ROOT, destApk)}  ${(size / 1048576).toFixed(2)} MB`);
console.log(`SHA-256   : ${sha256}`);
console.log(`清单      : ${path.relative(SITE_ROOT, jsonPath)}`);
console.log(`下载地址  : ${apkUrl}`);
console.log('');
console.log('下一步（两条命令）：');
console.log('');
console.log(`  gh release create v${versionName} "${destApk}" \\`);
console.log(`    --repo ${repo} --title "v${versionName}" --notes "见 version.json"`);
console.log('');
console.log('  然后提交 download-site/ 并推送，GitHub Pages 会自动更新 version.json。');
console.log('');
console.log('注意：APK 不要 git add —— 它已被 .gitignore 挡掉，走 Release 附件。');
