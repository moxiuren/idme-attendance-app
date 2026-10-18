// eslint.config.mjs — 前端（Vue 3 + Vite）静态检查（ESLint 9 flat config）
// 安装: npm i -D eslint @eslint/js globals
// 运行: npx eslint src
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      // 前端代码运行在 WebView / 浏览器环境
      globals: {
        ...globals.browser,
        // Vite define 注入的构建期常量（见 vite.config.js）
        __APP_VERSION__: "readonly",
        __APP_VERSION_CODE__: "readonly",
        // 自更新清单地址。构建期可被 define 覆盖，未注入时 updater.js 回落默认值。
        // 声明为 global 而非改用 globalThis：与上面两个常量保持同一写法，
        // 且 `typeof X === 'string'` 在未注入时本来就不会抛 ReferenceError。
        __UPDATE_MANIFEST_URL__: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "eqeqeq": ["error", "smart"],
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "android/**",
      "release/**",
      "**/*.min.js",
    ],
  },
];
