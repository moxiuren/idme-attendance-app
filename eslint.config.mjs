// eslint.config.mjs — JS/TS 统一静态检查（ESLint 9 flat config）
// 安装: npm i -D eslint @eslint/js globals
// 运行: npx eslint .
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      // 必须显式声明 Node 全局。只写 ecmaVersion / sourceType 时，`console` /
      // `process` / `Buffer` / `__dirname` 等一律被报 `no-undef` —— 一个普通 Node
      // 项目实测一次 60 条，真正的告警全被噪声淹没（2026-10-11 dsh-auto-continue 实测）。
      // 浏览器项目请把 globals.node 换成 globals.browser。
      globals: {
        ...globals.node,
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
      "build/**",
      "out/**",
      "**/*.min.js",
      "**/vendor/**",
      // dsh-purge 就地改 node_modules 模块源码时留下的备份副本，不是项目代码
      "**/*.dshpurge.bak",
    ],
  },
];
