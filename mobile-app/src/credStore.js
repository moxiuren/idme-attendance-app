/**
 * 凭据存储：Android Keystore 加密后落盘。
 *
 * 为什么不能用 @capacitor/preferences 存密码：
 *   Preferences 在 Android 上写的是 shared_prefs/*.xml，**纯明文**。
 *   任何能执行 `run-as` 的场景（debug 包无需 root）、root 设备、或 adb 备份，
 *   都能直接读出教师的 MOEIS 密码。项目里 credentials.json 早已被 .gitignore
 *   挡住不上传，说明设计意图就是「凭据不外泄」—— 但运行时明文落盘把这条边界破了。
 *   2026-10-18 真机实测：`shared_prefs/CapacitorStorage.xml` 里能直接看到
 *   `idme_ic` 与 `idme_pw` 两行明文。
 *
 * 加密方案：@aparajita/capacitor-secure-storage
 *   Android 侧用 AES/GCM/NoPadding，密钥由 AndroidKeyStore 生成（永不离开 Keystore，
 *   由 TEE/StrongBox 保护），磁盘上只有 Base64 密文 + IV。
 *   GCM 是带认证的加密 —— 密文被篡改会解密失败，而不是解出垃圾再拿去登录。
 *
 * 浏览器回退：
 *   SecureStorage 在 Web 上抛 "not implemented"。而本项目的 Web 构建是给
 *   开发调试与 Playwright 测试用的，不是交付形态。回退到 Preferences
 *   （同样是明文）是为了不破坏这条路径 —— 但**只在非原生环境**回退，
 *   真机（Capacitor.isNativePlatform() === true）永远走加密分支。
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/**
 * Keystore 别名 = 这份数据的存储键名。
 *
 * ★ 一旦写入就**不能再改**：插件的 getSecretKey(prefixedKey) 直接拿键名当
 *   Keystore 别名。改名会生成一把新密钥，旧密文从此解不开（表现为「密码突然没了」，
 *   用户只能重输）。所以这两个常量是**持久化契约**，改它们等于清空用户的登录态。
 */
const KEY_IC = 'idme_ic';
const KEY_PW = 'idme_pw';

const isNative = () => Capacitor.isNativePlatform();

async function readOne(key) {
  if (isNative()) {
    // SecureStorage 在键不存在时返回 null（不是抛错），与 Preferences 的
    // { value: undefined } 不同 —— 这里统一成「取不到就是空串」。
    const v = await SecureStorage.get(key);
    return v == null ? '' : String(v);
  }
  const { value } = await Preferences.get({ key });
  return value == null ? '' : String(value);
}

async function writeOne(key, value) {
  if (isNative()) {
    await SecureStorage.set(key, String(value));
    return;
  }
  await Preferences.set({ key, value: String(value) });
}

async function removeOne(key) {
  if (isNative()) {
    await SecureStorage.remove(key);
    return;
  }
  await Preferences.remove({ key });
}

/** 读取已保存的凭据。任一字段缺失都按「没存过」处理，返回空串。 */
export async function loadCred() {
  try {
    return {
      ic: await readOne(KEY_IC),
      password: await readOne(KEY_PW),
    };
  } catch {
    // 解密失败（Keystore 密钥被系统清掉、备份恢复到新设备、密文损坏）时
    // 不能让 App 起不来 —— 当作没存过，让用户重输一次。
    return { ic: '', password: '' };
  }
}

/** 保存凭据。写失败不抛错：登录已经成功了，存不上只影响下次是否免输。 */
export async function saveCred({ ic, password }) {
  try {
    await writeOne(KEY_IC, ic);
    await writeOne(KEY_PW, password);
    return true;
  } catch {
    return false;
  }
}

/** 清除凭据。退出登录 / 换账号时调用。 */
export async function clearCred() {
  try {
    await removeOne(KEY_IC);
    await removeOne(KEY_PW);
  } catch { /* 清不掉也不该阻断退出 */ }
}

/**
 * 一次性迁移：把旧版明文 Preferences 里的凭据搬到加密存储，然后删掉明文。
 *
 * 为什么需要：已经装过旧版本的用户，凭据还躺在 CapacitorStorage.xml 里。
 * 只改读取逻辑不会删掉那份明文 —— 明文会一直留着，等于没修。
 * 迁移是幂等的：加密存储里已有值就跳过写入，明文键无论如何都删。
 *
 * 返回是否发生了迁移（仅供日志/测试观察，界面不依赖）。
 */
export async function migrateLegacyCred() {
  if (!isNative()) return false;
  let migrated = false;
  for (const key of [KEY_IC, KEY_PW]) {
    const { value } = await Preferences.get({ key });
    if (value == null) continue;
    // 加密存储里没有才写 —— 否则会把更新的值覆盖成旧值
    const existing = await SecureStorage.get(key);
    if (existing == null) await SecureStorage.set(key, value);
    await Preferences.remove({ key });
    migrated = true;
  }
  return migrated;
}
