#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
idMe 点名 App · 源文件行数门禁

背景：项目约定「所有源文件 ≤ 499 行」。
2026-10-16 发现 App.vue 已涨到 592 行且无人拦住 —— 因为当时没有任何自动化护栏：
  · ESLint flat config 默认只处理 **/*.js|mjs|cjs，**不解析 .vue**，
    所以 max-lines 规则盖不住 .vue（要盖住得引入 eslint-plugin-vue）；
  · CI 只查 Python 语法与前端构建，不看行数。
故改用与 contrast / touch-target 一致的审计脚本方式，统一覆盖 .js/.vue/.css。

判定：去掉空行与整行注释后的有效行数 ≤ 499。
      为什么去空行/注释：门禁的目的是控制「单个文件的认知负担」，
      注释多不代表难懂；且注释是我们主动要求写厚的。

运行：python docs/line-budget-audit.py
退出码：0 = 全部通过；1 = 存在超标文件
"""

import re
import sys
from pathlib import Path

# Windows 控制台默认 GBK，打印非 ASCII 会抛 UnicodeEncodeError ——
# 而那个异常穿透 sys.exit(main())，导致「门禁全绿却退出码 1」。
# 2026-10-18 实测：最后一行 print("全部通过 ✅ ...") 在 GBK 下必炸，
# 于是 npm run audit:lines 永远返回 1，任何 && 链条都被它卡死。
# 加固：显式重配 stdout，遇到无法编码的字符降级为 ?，绝不让打印失败改变退出码。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent / "mobile-app"
SRC = ROOT / "src"
TOOLS = ROOT / "tools"

MAX_LINES = 499

# 需要计入门禁的文件类型
EXTS = {".js", ".mjs", ".vue", ".css"}

# 豁免：字典/数据类文件，行数由内容量决定，拆开反而更难维护
EXEMPT = {
    "i18n.js": "中/马双语字典，条目数与官方词表一一对应，拆分无意义",
}


def effective_lines(text: str) -> int:
    """去掉空行与整行注释（// /* * # 开头的行）后的行数"""
    n = 0
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("//") or s.startswith("/*") or s.startswith("*") or s.startswith("#"):
            continue
        n += 1
    return n


def collect():
    rows = []
    for base in (SRC, TOOLS):
        if not base.is_dir():
            continue
        for f in sorted(base.rglob("*")):
            if not f.is_file() or f.suffix not in EXTS:
                continue
            text = f.read_text(encoding="utf-8", errors="replace")
            rows.append((
                f.relative_to(ROOT).as_posix(),
                len(text.splitlines()),
                effective_lines(text),
            ))
    return rows


def main() -> int:
    rows = collect()
    if not rows:
        print(f"未找到源文件：{SRC}")
        return 1

    print("=" * 84)
    print(f"idMe 点名 App · 源文件行数门禁（有效行 ≤ {MAX_LINES}）")
    print("=" * 84)
    print(f"扫描目录：{SRC}  +  {TOOLS}")
    print("有效行 = 去掉空行与整行注释后的行数\n")

    print(f"{'文件':<34}{'总行':>7}{'有效行':>9}   判定")
    print("-" * 84)

    failures = []
    for path, total, eff in sorted(rows, key=lambda r: -r[2]):
        name = Path(path).name
        if name in EXEMPT:
            verdict = "EXEMPT"
        elif eff <= MAX_LINES:
            verdict = "PASS"
        else:
            verdict = "**FAIL**"
            failures.append((path, eff))
        print(f"{path:<34}{total:>7}{eff:>9}   {verdict}")

    print()
    if EXEMPT:
        print("豁免说明：")
        for name, why in EXEMPT.items():
            print(f"  · {name} —— {why}")
        print()

    print("=" * 84)
    if failures:
        print(f"超标 {len(failures)} 个文件：")
        for path, eff in failures:
            print(f"  [FAIL] {path}  {eff} 有效行 > {MAX_LINES}")
        print("\n拆分建议：按职责提取子组件 / composable，不要靠压缩注释过关。")
        print("=" * 84)
        return 1

    print(f"[通过] 全部通过 —— 已校验 {len(rows)} 个文件，豁免 {len(EXEMPT)} 个")
    print("=" * 84)
    return 0


if __name__ == "__main__":
    sys.exit(main())
