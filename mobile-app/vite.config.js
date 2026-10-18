import fs from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 版本号的**唯一事实源**是 android/app/build.gradle。
 *
 * 为什么不从 package.json 读：真正决定「能不能覆盖安装」的是 versionCode，
 * 它只存在于 build.gradle。若两处各写一份，必然会出现改了 gradle 忘了改
 * package.json 的情况，而设置页显示的又恰恰是 package.json 那一份 ——
 * 教师报上来的版本号就成了假的。
 *
 * 解析失败直接抛错：静默注入 undefined 会让设置页显示 "vundefined"，
 * 比构建失败更糟。
 */
function readAndroidVersion() {
  const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
  const code = /versionCode\s+(\d+)/.exec(gradle);
  const name = /versionName\s+"([^"]+)"/.exec(gradle);
  if (!code || !name) {
    throw new Error('vite.config.js: 无法从 android/app/build.gradle 解析 versionCode / versionName');
  }
  return { code: Number(code[1]), name: name[1] };
}

const ANDROID_VERSION = readAndroidVersion();

export default defineConfig({
  plugins: [vue()],
  base: './',
  define: {
    // 构建期常量，模板里直接用 __APP_VERSION__ / __APP_VERSION_CODE__
    __APP_VERSION__: JSON.stringify(ANDROID_VERSION.name),
    __APP_VERSION_CODE__: JSON.stringify(ANDROID_VERSION.code),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});
