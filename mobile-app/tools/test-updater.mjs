/**
 * 自更新契约测试（**完全离线**）。
 *
 * 覆盖 [A] 纯函数：版本比较、URL 解析、清单校验、多语言说明
 *      [B] 接线：原生插件注册、权限声明、FileProvider 路径、UI 状态机
 *
 * 为什么重点测 isNewer / normalizeManifest：
 *   这两处一旦错了，后果不是「界面难看」，而是**给老师推一个装不上的包**
 *   或者**放过一个哈希不对的包**。前者让更新功能形同虚设，
 *   后者是安全问题 —— 绕过应用商店后，SHA-256 是唯一的完整性防线。
 *
 * 用法：node tools/test-updater.mjs
 * 前置：无（不触网、不依赖 dist/）
 */
import fs from 'node:fs';
import {
  isNewer, resolveUrl, normalizeManifest, noteFor,
} from '../src/updater.js';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

let PASS = 0;
let FAIL = 0;

function check(label, cond, extra = '') {
  if (cond) { PASS++; console.log(`    ✓ ${label}`); }
  else { FAIL++; console.log(`    ✗ ${label}${extra ? `  ← ${extra}` : ''}`); }
}
function section(title) {
  console.log(`\n${'='.repeat(74)}\n${title}\n${'='.repeat(74)}`);
}

const SHA = 'a'.repeat(64);
const SHA_NUM = '0123456789abcdef'.repeat(4);   // 64 位合法十六进制

// ================================================================ [A] 纯函数
section('[A] 纯函数：版本比较 / URL / 清单校验 / 说明');

// ---- isNewer：只认 versionCode，且必须是数字 ----
check('versionCode 4 > 3 → 有新版本', isNewer(4, 3) === true);
check('versionCode 3 > 3 → 无更新', isNewer(3, 3) === false);
check('versionCode 3 > 4 → 无更新（不会「降级」）', isNewer(3, 4) === false);
// 这条是核心：字符串比较下 "1.10" < "1.9"，但 versionCode 下 10 > 9
check('字符串 "10" vs "9" 仍按数值比较 → 10 > 9', isNewer('10', '9') === true);
check('数字字符串 "4" vs "3" 可用', isNewer('4', '3') === true);
check('null 视为非法 → false', isNewer(null, 3) === false);
check('undefined 视为非法 → false', isNewer(undefined, 3) === false);
check('"abc" 视为非法 → false', isNewer('abc', 3) === false);
check('NaN 视为非法 → false', isNewer(NaN, 3) === false);
check('空串视为非法 → false', isNewer('', 3) === false);
check('本地版本非法时也返回 false（不误报）', isNewer(5, null) === false);

// ---- resolveUrl：相对 → 绝对 ----
const BASE = 'https://example.github.io/app/version.json';
check('相对路径按清单地址解析',
  resolveUrl(BASE, 'download/a.apk') === 'https://example.github.io/app/download/a.apk');
check('./ 前缀同样正确',
  resolveUrl(BASE, './download/a.apk') === 'https://example.github.io/app/download/a.apk');
check('上级路径 ../ 正确折叠',
  resolveUrl(BASE, '../x/a.apk') === 'https://example.github.io/x/a.apk');
check('绝对 https URL 原样返回',
  resolveUrl(BASE, 'https://github.com/o/r/releases/download/v1/a.apk')
    === 'https://github.com/o/r/releases/download/v1/a.apk');
check('绝对 http URL 也原样返回（不强行升级）',
  resolveUrl(BASE, 'http://x/a.apk') === 'http://x/a.apk');
check('空值 → 空串', resolveUrl(BASE, '') === '');
check('null → 空串', resolveUrl(BASE, null) === '');

// ---- normalizeManifest：合法 ----
const good = {
  versionCode: 4, versionName: '1.3',
  apk: 'download/idMe-v1.3.apk', sha256: SHA_NUM, size: 3900000,
  published: '2026-10-18',
  notes: { ms: 'ms 说明', en: 'en note', zh: '中文说明' },
};
const m = normalizeManifest(good);
check('合法清单通过', !!m);
check('versionCode 转成数字', m.versionCode === 4 && typeof m.versionCode === 'number');
check('sha256 归一化为小写', m.sha256 === SHA_NUM.toLowerCase());
check('size 转成数字', m.size === 3900000);
check('published 透传', m.published === '2026-10-18');
check('notes 透传', m.notes.zh === '中文说明');

// ---- normalizeManifest：必须拒绝的 ----
check('null 拒绝', normalizeManifest(null) === null);
check('字符串拒绝', normalizeManifest('x') === null);
check('缺 versionCode 拒绝', normalizeManifest({ ...good, versionCode: undefined }) === null);
check('versionCode = 0 拒绝（版本号从 1 起）',
  normalizeManifest({ ...good, versionCode: 0 }) === null);
check('versionCode 为负数拒绝', normalizeManifest({ ...good, versionCode: -1 }) === null);
check('versionCode 非整数拒绝', normalizeManifest({ ...good, versionCode: 1.5 }) === null);
check('缺 sha256 拒绝', normalizeManifest({ ...good, sha256: undefined }) === null);
check('sha256 太短拒绝', normalizeManifest({ ...good, sha256: 'abc' }) === null);
check('sha256 含非十六进制字符拒绝',
  normalizeManifest({ ...good, sha256: 'z'.repeat(64) }) === null);
check('sha256 长度 63 拒绝', normalizeManifest({ ...good, sha256: 'a'.repeat(63) }) === null);
check('sha256 长度 65 拒绝', normalizeManifest({ ...good, sha256: 'a'.repeat(65) }) === null);
check('缺 apk 路径拒绝', normalizeManifest({ ...good, apk: '' }) === null);
check('apk 为空白串拒绝', normalizeManifest({ ...good, apk: '   ' }) === null);

// 大写哈希是合法的（有些工具输出大写），但要归一化
// 草稿清单：占位文件的哈希是全 0，格式合法，只能靠 draft 字段拦住
check('draft: true 的清单被拒绝',
  normalizeManifest({ ...good, draft: true }) === null);
check('draft: false 不影响正常清单',
  normalizeManifest({ ...good, draft: false }) !== null);

// 大写 sha256 是合法的（有些工具输出大写），但要归一化
check('大写 sha256 被接受并转小写',
  normalizeManifest({ ...good, sha256: SHA_NUM.toUpperCase() })?.sha256 === SHA_NUM.toLowerCase());

// versionName 缺失时回落到 versionCode，避免界面显示 undefined
check('缺 versionName 时回落到 versionCode',
  normalizeManifest({ ...good, versionName: undefined })?.versionName === '4');

// ---- noteFor：多语言回落 ----
check('取当前语言的说明', noteFor(m, 'zh') === '中文说明');
check('缺该语言时回落到马来文', noteFor(m, 'ja') === 'ms 说明');
check('notes 为空对象 → 空串', noteFor({ notes: {} }, 'zh') === '');
check('manifest 为 null → 空串', noteFor(null, 'zh') === '');

// ================================================================ [B] 接线
section('[B] 接线：原生插件 / 权限 / FileProvider / UI 状态机');
{
  const java = read('../android/app/src/main/java/my/gov/moe/idme/attendance/AppUpdaterPlugin.java');
  const activity = read('../android/app/src/main/java/my/gov/moe/idme/attendance/MainActivity.java');
  const manifestXml = read('../android/app/src/main/AndroidManifest.xml');
  const filePaths = read('../android/app/src/main/res/xml/file_paths.xml');
  const gradle = read('../android/app/build.gradle');
  const sheet = read('../src/UpdateSheet.vue');
  const app = read('../src/App.vue');
  const composable = read('../src/composables/useUpdater.js');

  // ---- 插件能力 ----
  check('插件注册名为 AppUpdater', /@CapacitorPlugin\(name = "AppUpdater"\)/.test(java));
  check('提供 getVersion', /public void getVersion\(PluginCall call\)/.test(java));
  check('提供 download', /public void download\(PluginCall call\)/.test(java));
  check('提供 install', /public void install\(PluginCall call\)/.test(java));
  check('提供 canInstall（权限预检）', /public void canInstall\(PluginCall call\)/.test(java));
  check('提供 openInstallSettings', /public void openInstallSettings\(PluginCall call\)/.test(java));
  check('提供 cancelDownload', /public void cancelDownload\(PluginCall call\)/.test(java));

  // ---- 安全：没有哈希就不下载 ----
  check('download 强制要求 sha256',
    /expectedSha256 == null \|\| expectedSha256\.length\(\) != 64/.test(java));
  check('校验失败时删除临时文件',
    /if \(!actual\.equals\(finalSha\)\)[\s\S]{0,80}tmp\.delete\(\)/.test(java));
  check('先写 .part 再改名（失败不留半成品 APK）',
    /APK_NAME \+ "\.part"/.test(java) && /tmp\.renameTo\(target\)/.test(java));
  check('用 MessageDigest SHA-256 边下边算',
    /MessageDigest\.getInstance\("SHA-256"\)/.test(java));

  // ---- 安装链路 ----
  check('用 FileProvider 生成 content:// URI',
    /FileProvider\.getUriForFile\(/.test(java));
  check('MIME 为 application/vnd.android.package-archive',
    /"application\/vnd\.android\.package-archive"/.test(java));
  check('带 FLAG_GRANT_READ_URI_PERMISSION', /FLAG_GRANT_READ_URI_PERMISSION/.test(java));
  check('带 FLAG_ACTIVITY_NEW_TASK', /FLAG_ACTIVITY_NEW_TASK/.test(java));
  check('安装前防御 0 字节 / 过小文件', /apk\.length\(\) < 1024 \* 100/.test(java));

  // ---- 下载线程不阻塞主线程 ----
  check('下载跑在独立 Thread 上', /new Thread\(\(\) -> \{/.test(java));
  check('进度事件名为 downloadProgress', /notifyListeners\("downloadProgress"/.test(java));
  check('只在百分比变化时推事件（不刷爆桥）', /if \(percent != lastPercent\)/.test(java));

  // ---- 注册与权限 ----
  check('MainActivity 注册了 AppUpdaterPlugin',
    /registerPlugin\(AppUpdaterPlugin\.class\)/.test(activity));
  check('Manifest 声明 REQUEST_INSTALL_PACKAGES',
    /android\.permission\.REQUEST_INSTALL_PACKAGES/.test(manifestXml));
  check('FileProvider 的 authority 与插件一致（${applicationId}.fileprovider）',
    /android:authorities="\$\{applicationId\}\.fileprovider"/.test(manifestXml)
    && /getPackageName\(\) \+ "\.fileprovider"/.test(java));
  // 下载目录是 external-files，file_paths.xml 必须有对应条目
  check('file_paths 含 external-files-path（下载目录需要）',
    /<external-files-path/.test(filePaths));
  check('插件把 APK 下到 getExternalFilesDir',
    /getExternalFilesDir\(Environment\.DIRECTORY_DOCUMENTS\)/.test(java));

  // ---- 签名配置 ----
  check('build.gradle 定义了 signingConfigs.release', /signingConfigs\s*\{/.test(gradle));
  check('release buildType 挂签名配置', /signingConfig signingConfigs\.release/.test(gradle));
  check('签名口令从 keystore.properties 读，不硬编码',
    /rootProject\.file\('keystore\.properties'\)/.test(gradle)
    && !/storePassword\s+"[^"]+"/.test(gradle));
  check('口令缺失时不中断构建（只警告）', /logger\.warn/.test(gradle));

  // ---- UI 状态机 ----
  check('抽屉覆盖 checking / latest / available / downloading / downloaded / error',
    ['checking', 'latest', 'available', 'downloading', 'downloaded', 'error']
      .every(s => new RegExp(`state === '${s}'`).test(sheet)));
  check('下载中不允许关闭抽屉', /if \(props\.state === 'downloading'\) return;/.test(sheet));
  check('总大小未知时用不确定态进度条', /upd-prog-na/.test(sheet));
  check('权限未授予时给出设置入口', /needPerm/.test(sheet) && /updOpenSettings/.test(sheet));
  check('进度条尊重 prefers-reduced-motion', /prefers-reduced-motion/.test(sheet) === false
    && /prefers-reduced-motion/.test(read('../src/styles/sheets.css')));

  // ---- App 接线 ----
  check('App 引入 UpdateSheet', /import UpdateSheet from '\.\/UpdateSheet\.vue'/.test(app));
  check('设置页有 check-update 事件', /@check-update="openUpdate"/.test(app));
  check('启动时静默检查（silent: true）', /updCheck\(\{ silent: true \}\)/.test(app));
  check('静默检查有延迟，不与登录抢带宽', /setTimeout\([\s\S]{0,60}silent: true/.test(app));
  check('返回键层级含更新抽屉',
    /showUpdate\.value && updState\.value !== 'downloading'/.test(app));

  // ---- composable ----
  check('非原生环境不注册插件（浏览器可调试）',
    /if \(!Capacitor\.isNativePlatform\(\)\) return null;/.test(composable));
  check('下载前解绑旧监听（防重复消费）',
    /progressHandle\) \{ await progressHandle\.remove\(\)/.test(composable));
  check('取消不当成错误（回到 available 可重试）',
    /msg\.includes\('已取消'\)/.test(composable));

  // ---- 发布脚本的两道闸门 ----
  // 这两条不是「锦上添花」：未签名包发出去所有老师都装不上；
  // debug 包能装上，但指纹与线上版本不同，此后所有 release 包再也覆盖不了。
  const publish = read('./publish-release.mjs');
  check('发布脚本拒绝未签名 APK',
    /未签名 —— 不能发布/.test(publish) && /META-INF\/MANIFEST\.MF/.test(publish));
  check('发布脚本拒绝 debug 包', /这是 debug 包 —— 不能发布/.test(publish));
  // 真发布生成的清单必须不带 draft —— 否则客户端永久拒绝，更新功能彻底失效
  check('发布脚本不往清单里写 draft 字段',
    !/^\s*draft\s*:/m.test(publish.replace(/\/\/.*$/gm, '')));
  check('发布闸门以非零码退出（否则 CI 里等于没拦）',
    /未签名 —— 不能发布[\s\S]{0,300}process\.exit\(1\)/.test(publish)
    && /这是 debug 包 —— 不能发布[\s\S]{0,200}process\.exit\(1\)/.test(publish));

  // ---- 构建必须把 dist 同步进安卓工程 ----
  // 教训：`vite build` 只写 dist/，Capacitor 不会自动搬进 assets/public/。
  // 结果是构建成功、APK 版本号正确、但前端还是上一次的旧代码 —— 极难发现。
  const pkg = JSON.parse(read('../package.json'));
  check('gate 用的是 build:android 而非裸 build',
    /npm run build:android\s*$/.test(pkg.scripts.gate));
  check('build:android 含 cap copy android',
    /cap copy android/.test(pkg.scripts['build:android'] || ''));

  // ---- 清单与版本号同源 ----
  const siteJson = JSON.parse(read('../../download-site/version.json'));
  check('version.json 的 versionCode 与 build.gradle 一致',
    siteJson.versionCode === Number(/versionCode\s+(\d+)/.exec(gradle)[1]),
    `清单 ${siteJson.versionCode} vs gradle ${/versionCode\s+(\d+)/.exec(gradle)[1]}`);
  check('version.json 的 versionName 与 build.gradle 一致',
    siteJson.versionName === /versionName\s+"([^"]+)"/.exec(gradle)[1]);
  // 仓库里这份 version.json 入库、APK 不入库（*.apk 被 .gitignore 挡掉）。
  // 于是它只允许处于两种状态之一，**没有第三种**：
  //   (a) 占位态 —— draft:true、sha256 全 0、size 0，客户端必然拒绝；
  //   (b) 已发布态 —— 无 draft、哈希与 size 都是真值，客户端可用。
  // 危险的是中间态：既没有 draft、哈希又是全 0 —— 上线后所有老师看到更新提示，
  // 下载完成、校验失败，而报错只写「下载失败」，查不到根因。
  // 所以这里不钉「必须是 draft」，而钉「要么可拒绝、要么真可用」。
  const isPlaceholder = siteJson.draft === true
    && /^0{64}$/.test(siteJson.sha256) && siteJson.size === 0;
  const isReal = siteJson.draft === undefined
    && /^[0-9a-f]{64}$/.test(siteJson.sha256) && siteJson.size > 0;
  check('清单要么是可拒绝的占位态，要么是完整可用的已发布态',
    isPlaceholder || isReal,
    `draft=${siteJson.draft} sha=${siteJson.sha256.slice(0, 8)}… size=${siteJson.size}`);
  check('占位态的清单会被客户端拒绝（不是「看着像清单就能过」）',
    !isPlaceholder || normalizeManifest(siteJson) === null);
  check('已发布态的清单能被客户端接受',
    !isReal || normalizeManifest(siteJson) !== null);
  // 全 0 哈希格式合法这件事本身就是陷阱：格式校验挡不住它，只能靠语义判据。
  check('全 0 哈希能通过格式校验（所以占位态必须靠 draft + size 双判）',
    normalizeManifest({ ...good, sha256: '0'.repeat(64), size: 0 }) !== null);
}

// ================================================================ 汇总
section(`结果：${PASS} 通过 / ${FAIL} 失败`);
if (FAIL) console.log('  ✗ 存在失败断言，请检查上方 ✗ 行');
else console.log('  ✓ 自更新契约全部吻合（未触网）');
process.exit(FAIL ? 1 : 0);
