/**
 * 凭据存储契约测试（**完全离线**）。
 *
 * 为什么这条测试必须有：
 *   2026-10-18 真机实测发现 `shared_prefs/CapacitorStorage.xml` 里躺着教师的
 *   MOEIS 明文密码。修法是把凭据改走 Android Keystore 加密，但「改好了」这件事
 *   极容易在后续迭代里被悄悄改回去 —— 比如有人觉得 SecureStorage 在浏览器里
 *   不能用、图省事直接换回 Preferences。那等于安全修复被静默回滚，而且没有任何
 *   报错。所以这里钉的是**源码层面的结构约束**，不是运行时行为。
 *
 * 测什么：
 *   [A] 源码不再有明文凭据落盘
 *   [B] 加密路径确实被用上，且回退分支被 isNative 守住
 *   [C] 迁移逻辑存在且顺序正确（先迁移再读）
 *   [D] 键名是持久化契约，不能被随手改
 *
 * 用法：node tools/test-credstore.mjs
 */
import fs from 'node:fs';

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

const app = read('../src/App.vue');
const cred = read('../src/credStore.js');

// ================================================================ [A] 明文已清除
section('[A] 源码里不再有明文凭据落盘');

// App.vue 曾经这样写：await Preferences.set({ key: 'idme_pw', value: ... })
// 这行的后果是密码以明文进入 shared_prefs/*.xml。
check('App.vue 不再直接 import Preferences',
  !/from '@capacitor\/preferences'/.test(app));
check('App.vue 不再出现 idme_ic / idme_pw 字面量',
  !/idme_ic|idme_pw/.test(app));
check('App.vue 不再调用 Preferences.set / get / remove',
  !/Preferences\.(set|get|remove)\(/.test(app));

// 全仓库扫描：除 credStore.js 外，任何地方都不该再碰这两个键
const srcFiles = fs.readdirSync(new URL('../src/', import.meta.url))
  .filter(f => f.endsWith('.js') || f.endsWith('.vue'));
const offenders = srcFiles.filter(f => {
  if (f === 'credStore.js') return false;
  const t = read(`../src/${f}`);
  return /idme_ic|idme_pw/.test(t);
});
check('除 credStore.js 外没有任何文件引用凭据键名',
  offenders.length === 0, offenders.join(', '));

// ================================================================ [B] 加密路径
section('[B] 加密路径与浏览器回退');

check('credStore 引入 SecureStorage',
  /from '@aparajita\/capacitor-secure-storage'/.test(cred));
check('原生环境走 SecureStorage.get', /if \(isNative\(\)\)[\s\S]{0,200}SecureStorage\.get/.test(cred));
check('原生环境走 SecureStorage.set', /if \(isNative\(\)\)[\s\S]{0,200}SecureStorage\.set/.test(cred));
check('原生环境走 SecureStorage.remove', /if \(isNative\(\)\)[\s\S]{0,200}SecureStorage\.remove/.test(cred));
check('回退分支被 isNative() 守住（真机不可能落到明文）',
  /const isNative = \(\) => Capacitor\.isNativePlatform\(\)/.test(cred));
// 每一处 Preferences 调用都必须有 isNative() 守卫。
// 不数次数 —— 数数守不住真正的风险（把明文调用挪进原生分支），
// 而且加一行迁移逻辑就会误报。改成按函数切块，逐个查守卫。
const fnBlocks = cred.split(/\n(?=(?:export )?async function )/).filter(b => /Preferences\./.test(b));
const unguarded = fnBlocks.filter(b => !/isNative\(\)/.test(b));
check('每一处 Preferences 调用都在 isNative() 守卫下（明文到不了真机）',
  fnBlocks.length > 0 && unguarded.length === 0,
  unguarded.length ? `未守卫：${unguarded.map(b => /function (\w+)/.exec(b)?.[1]).join(', ')}` : '');
// 迁移函数是唯一「先读明文再写加密」的地方，它自己也必须整段守住
check('migrateLegacyCred 在非原生环境直接返回',
  /export async function migrateLegacyCred\(\) \{\s*if \(!isNative\(\)\) return false;/.test(cred));

// ================================================================ [C] 迁移
section('[C] 旧版明文迁移');

check('提供 migrateLegacyCred', /export async function migrateLegacyCred\(\)/.test(cred));
check('迁移会删除明文键', /Preferences\.remove\(\{ key \}\)/.test(cred));
// 幂等：加密存储里已有值就不覆盖，否则会把新密码写成旧密码
check('迁移幂等（已有加密值时不覆盖）',
  /const existing = await SecureStorage\.get\(key\)[\s\S]{0,120}if \(existing == null\)/.test(cred));
// 顺序：init 里必须先迁移再读，反过来老用户升级后会看到空表单
check('init 先迁移再读取',
  /await migrateLegacyCred\(\)[\s\S]{0,200}await loadStoredCred\(\)/.test(app));

// ================================================================ [D] 键名契约
section('[D] Keystore 别名即键名 —— 改名等于清空登录态');

// 插件的 getSecretKey(prefixedKey) 直接拿键名当 Keystore 别名。
// 改名会生成新密钥，旧密文再也解不开。所以这两个值必须显式、稳定。
check('KEY_IC 与 KEY_PW 是模块级常量',
  /const KEY_IC = 'idme_ic'/.test(cred) && /const KEY_PW = 'idme_pw'/.test(cred));
check('键名保持与旧版一致（否则老用户的密文对不上）',
  /const KEY_IC = 'idme_ic'/.test(cred) && /const KEY_PW = 'idme_pw'/.test(cred));
check('代码里说明了改名后果',
  /改名会生成一把新密钥|不能再改|持久化契约/.test(cred));

// ================================================================ [E] 依赖
section('[E] 依赖与原生同步');

const pkg = JSON.parse(read('../package.json'));
const dep = pkg.dependencies['@aparajita/capacitor-secure-storage'];
check('package.json 声明了安全存储插件', !!dep);
// Capacitor 6 项目必须用 6.x 的插件；7.x/8.x 的对等依赖是 core ^7/^8，
// 版本错配时 npm 会警告但构建仍「成功」，运行时才炸。
check('插件版本锁定在 6.x（与 @capacitor/core 6.2 对齐）',
  /^\^?6\./.test(dep || ''), `实际 ${dep}`);

// 原生工程里必须真的存在这个模块，否则 cap copy 后运行时找不到
const capPkg = JSON.parse(read('../android/app/src/main/assets/capacitor.plugins.json'));
check('capacitor.plugins.json 里已注册插件',
  Array.isArray(capPkg) && capPkg.some(p => /secure-storage/i.test(p.pkg || p.classpath || '')),
  JSON.stringify(capPkg.map(p => p.pkg)));

// ================================================================ 汇总
section(`结果：${PASS} 通过 / ${FAIL} 失败`);
if (FAIL) console.log('  ✗ 存在失败断言，请检查上方 ✗ 行');
else console.log('  ✓ 凭据存储契约全部吻合（未触网）');
process.exit(FAIL ? 1 : 0);
