#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
idMe 点名 App · 触控目标尺寸审计（P0-4 回归护栏）

规则：任何可点击元素的有效高度必须 ≥ 44px
      （WCAG 2.5.5 AAA 建议 44×44；Android Material 建议 48dp）

做法：从 styles/*.css 解析出交互类的高度声明，解析 var() 引用后判定。
运行：python docs/touch-target-audit.py
退出码：0 = 全部通过；1 = 存在不合格项
"""

import re
import sys
from pathlib import Path

# Windows 控制台默认 GBK，打印非 ASCII 会抛 UnicodeEncodeError，
# 异常穿透 SystemExit 后让「全部通过」也返回 1（2026-10-18 实测）。
# 显式重配 stdout：无法编码的字符降级为 ?，打印失败绝不改变退出码。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

CSS_DIR = Path(__file__).resolve().parent.parent / "mobile-app" / "src" / "styles"

# 需要校验的交互类（可点击 / 可聚焦）
INTERACTIVE = {
    ".btn", ".btn-lg", ".btn-primary", ".btn-amber", ".btn-ghost", ".btn-block",
    ".icon-btn", ".icon-btn-on",
    ".topbar-class",
    ".date-arrow", ".date-main",
    ".selbar-btn",
    ".row", ".row-check",
    ".chip",
    ".reason",
    ".sheet-close",
    ".lang-opt",
    ".input", ".input-sm", ".input-act",
    # 月历日期格：点它跳到那天的点名名单（min-height 46px）
    ".cal-cell",
}

MIN_PX = 44.0

# 例外：本体小于 44px，但整行（更大的父元素）才是真实点击目标
EXEMPT = {
    ".row-check": "复选框本体 30px，真实点击目标是整行 .row（min-height 62px）",
}


def strip_comments(text: str) -> str:
    """去掉 /* ... */ 注释，否则注释会被并入选择器导致匹配失败"""
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def parse_root_vars(text: str) -> dict:
    """解析 :root 里的自定义属性"""
    out = {}
    m = re.search(r":root\s*\{(.*?)\}", text, re.S)
    if not m:
        return out
    for name, val in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", m.group(1)):
        out[name] = val.strip()
    return out


def resolve(value: str, vars_: dict, depth: int = 0) -> str:
    """把 var(--x) 展开成字面量，支持一层嵌套"""
    if depth > 5:
        return value
    m = re.fullmatch(r"var\(\s*(--[\w-]+)\s*\)", value.strip())
    if m and m.group(1) in vars_:
        return resolve(vars_[m.group(1)], vars_, depth + 1)
    return value


def to_px(value: str):
    m = re.match(r"^([\d.]+)px$", value.strip())
    return float(m.group(1)) if m else None


def main() -> int:
    if not CSS_DIR.is_dir():
        print(f"找不到样式目录：{CSS_DIR}")
        return 1

    files = sorted(CSS_DIR.glob("*.css"))
    vars_ = {}
    for f in files:
        vars_.update(parse_root_vars(strip_comments(f.read_text(encoding="utf-8"))))

    print("=" * 84)
    print("idMe 点名 App · 触控目标尺寸审计（阈值 44px）")
    print("=" * 84)
    print(f"样式目录：{CSS_DIR}")
    print(f"已解析 :root 变量 {len(vars_)} 个\n")

    rows = []
    for f in files:
        text = strip_comments(f.read_text(encoding="utf-8"))
        # 逐条规则匹配：选择器 { 声明块 }
        for sel_raw, body in re.findall(r"([^{}]+)\{([^{}]*)\}", text):
            sel_raw = sel_raw.strip()
            if sel_raw.startswith("@") or sel_raw.startswith(":"):
                continue
            sels = [s.strip() for s in sel_raw.split(",")]
            hit = [s for s in sels if s in INTERACTIVE]
            if not hit:
                continue
            # 取 min-height，其次 height
            mh = re.search(r"min-height\s*:\s*([^;]+);", body)
            h = re.search(r"(?<![-\w])height\s*:\s*([^;]+);", body)
            raw = None
            kind = None
            if mh:
                raw, kind = mh.group(1).strip(), "min-height"
            elif h:
                raw, kind = h.group(1).strip(), "height"
            if raw is None:
                continue
            px = to_px(resolve(raw, vars_))
            if px is None:
                continue
            for s in hit:
                rows.append((f.name, s, kind, raw, px))

    # 同一选择器取最大值（后定义的覆盖前面）
    best = {}
    for fname, sel, kind, raw, px in rows:
        if sel not in best or px > best[sel][4]:
            best[sel] = (fname, sel, kind, raw, px)

    print(f"{'选择器':<18}{'文件':<16}{'属性':<12}{'声明':<16}{'解析':>8}   判定")
    print("-" * 84)
    failures = []
    for sel in sorted(best):
        fname, _, kind, raw, px = best[sel]
        if sel in EXEMPT:
            verdict = "EXEMPT"
        elif px >= MIN_PX:
            verdict = "PASS"
        else:
            verdict = "**FAIL**"
            failures.append((sel, px, fname))
        print(f"{sel:<18}{fname:<16}{kind:<12}{raw:<16}{px:>7.0f}px   {verdict}")

    print()
    if EXEMPT:
        print("豁免说明：")
        for sel, why in EXEMPT.items():
            print(f"  · {sel} —— {why}")
        print()

    print("=" * 84)
    if failures:
        print(f"不合格 {len(failures)} 项：")
        for sel, px, fname in failures:
            print(f"  ✗ {sel}  {px:.0f}px < {MIN_PX:.0f}px  ({fname})")
    else:
        checked = len([s for s in best if s not in EXEMPT])
        print(f"[通过] 全部通过 —— 已校验 {checked} 个交互选择器，豁免 {len(EXEMPT)} 个")
    print("=" * 84)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
