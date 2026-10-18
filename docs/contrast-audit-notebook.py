#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
idMe 点名 App · 手账风格（ui-notebook-demo.html）WCAG 2.1 AA 对比度审计

用途：验证 docs/ui-notebook-demo.html 中声明的每一组「文字色 / 底色」是否达标。
运行：python docs/contrast-audit-notebook.py
退出码：0 = 全部通过；1 = 存在不合格项
"""

# ---------------- 手账风格设计令牌（与 ui-notebook-demo.html 的 :root 一致） ----------------
TOKENS = {
    # 纸与墨
    "paper":       "#FCF8EC",
    "paper_2":     "#F6F0E0",
    "ink":         "#2E2A24",
    "ink_soft":    "#6B6255",
    # 荧光蓝
    "blue_fill":   "#CFE1F7",
    "blue_edge":   "#9CC0E8",
    "blue_ink":    "#2B4E78",
    # 琥珀
    "amber":       "#D98E1F",
    "amber_fill":  "#FDF0D8",
    "amber_ink":   "#9E5A00",
    # 红
    "red":         "#D24B4B",
    "red_fill":    "#FBE4E2",
    "red_ink":     "#B03434",
    # 绿
    "green_fill":  "#E4F0DA",
    "green_ink":   "#3F6B2C",
    # 便签
    "sticky":      "#FFF0A8",
    "sticky_edge": "#E3C95E",
    # 页面与卡片
    "page_bg":     "#E9E2D4",
    "card":        "#FFFFFF",
    # 演示中出现的裸色值
    "row_excused": "#FFFDF6",
    "row_absent":  "#FEF6F5",
    "pill_excused": "#FFFCF4",
    "pill_absent": "#FFF8F7",
    "idx_green_bg": "#EDEFE7",
    "idx_red_bg":  "#FBEAE8",
    "row_picked":  "#F2F7FD",
    "body_ink":    "#3A342B",
    "muted":       "#665D4E",
    "muted_2":     "#6B6255",
    "tape_ink":    "#7A6516",
    "sticky_ink":  "#6B5711",
    "tbact_ink":   "#4A4438",
    "chip_ink":    "#5D5648",
    "idx_green_ink": "#4C6B3A",
    "edge_neutral": "#C6BDA9",
}

# (用途, 前景, 背景, 字号px, 是否粗体)
CASES = [
    # ── 页面外壳（页头 / 开关 / 说明卡，多为白底或页底） ──
    ("页头正文 .head p",            "muted",       "page_bg",     16,   False),
    ("页头胶带 .head .tape",        "tape_ink",    "sticky",      13,   True),
    ("页头大标题 h1",               "ink",         "page_bg",     42,   True),
    ("字体开关（未选）",             "muted",       "paper",       14.5, True),
    ("字体开关（已选）",             "blue_ink",    "blue_fill",   14.5, True),
    ("说明卡标题 .cap .t",           "body_ink",    "card",        17,   True),
    ("说明卡正文 .cap .d",           "muted",       "card",        14,   False),
    ("章节标题 .sec-t",              "ink",         "card",        24,   True),
    ("章节引言 .sec-p",              "muted",       "card",        15,   False),
    ("卡片列表项 .card li",          "chip_ink",    "card",        14,   False),
    ("色板名称 .swc .n",             "ink",         "card",        13.5, True),
    ("色板色值 .swc .u",             "muted_2",     "card",        11.5, False),
    ("页脚说明",                     "muted",       "page_bg",     14,   False),
    ("全页默认文字",                 "body_ink",    "page_bg",     16,   False),

    # ── 笔记本页：顶栏 / 日期 / 统计 ──
    ("班级名 .tb-class",             "blue_ink",    "blue_fill",   19,   True),
    ("顶栏动作 .tb-act",             "tbact_ink",   "paper",       16,   True),
    ("日期文字 .dtext",              "ink",         "card",        18,   True),
    ("日期标签 .dtag（在线）",        "green_ink",   "green_fill",  12.5, True),
    ("统计数字 .st .n",              "ink",         "card",        26,   True),
    ("统计数字（出席，绿）",          "green_ink",   "card",        26,   True),
    ("统计数字（出席率，蓝）",        "blue_ink",    "card",        26,   True),
    ("统计标签 .st .l",              "ink_soft",    "card",        12.5, False),
    ("说明条 .note（算出席提示）",    "amber_ink",   "paper",       13.5, False),

    # ── 学生行（核心数据区） ──
    ("学生姓名 .row .nm",            "ink",         "card",        17.5, True),
    ("序号 .row .idx",               "blue_ink",    "blue_fill",   16,   True),
    ("行事由 · 算出席",              "amber_ink",   "row_excused", 13,   False),
    ("行事由 · 真缺席",              "red_ink",     "row_absent",  13,   False),
    ("状态标签 · 算出席",            "amber_ink",   "pill_excused", 14.5, True),
    ("状态标签 · 真缺席",            "red_ink",     "pill_absent", 14.5, True),
    ("状态标签 · 出席",              "green_ink",   "green_fill",  14.5, True),
    ("勾选框（已选）",               "blue_ink",    "blue_fill",   16,   True),
    ("批量选中行姓名",               "ink",         "row_picked",  17.5, True),

    # ── 吸底栏 ──
    ("幽灵按钮 .btn.ghost",          "blue_ink",    "blue_fill",   16,   True),
    ("便签提交按钮 .sticky",         "sticky_ink",  "sticky",      15.5, True),

    # ── 抽屉 ──
    ("抽屉标题 .sh-t",               "ink",         "paper",       20,   True),
    ("抽屉副标题 .sh-s",             "ink_soft",    "paper",       13,   False),
    ("假因 chip（未选）",            "chip_ink",    "card",        13.5, True),
    ("假因 chip（已选）",            "blue_ink",    "blue_fill",   13.5, True),
    ("假因列表项 .ritem .rn",        "ink",         "card",        15,   True),
    ("假因计数 .ritem .rc",          "ink_soft",    "card",        12,   False),
    ("假因列表项（已选）名称",        "ink",         "amber_fill",  15,   True),

    # ── 演示中的内联色 ──
    ("序号徽章（绿）",               "idx_green_ink", "idx_green_bg", 16, True),
    ("序号徽章（红）",               "red_ink",     "idx_red_bg",  16,   True),
]


def _lin(c: int) -> float:
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def required(px: float, bold: bool) -> float:
    """WCAG 2.1 AA：大字号(≥24px 或 ≥18.66px 粗体) 3:1，其余 4.5:1"""
    is_large = px >= 24 or (bold and px >= 18.66)
    return 3.0 if is_large else 4.5


def main() -> int:
    print("=" * 92)
    print("idMe 点名 App · 手账风格（ui-notebook-demo.html）WCAG 2.1 AA 对比度审计")
    print("=" * 92)
    print(f"{'用途':<28}{'前景':<10}{'背景':<10}{'字号':>6}{'实测':>7}{'要求':>6}   判定")
    print("-" * 92)

    failures = []
    for name, fg_key, bg_key, px, bold in CASES:
        fg, bg = TOKENS[fg_key], TOKENS[bg_key]
        ratio = contrast(fg, bg)
        need = required(px, bold)
        ok = ratio >= need
        if not ok:
            failures.append((name, fg, bg, ratio, need))
        tag = "B" if bold else " "
        print(f"{name:<28}{fg:<10}{bg:<10}{px:>5.1f}{tag}{ratio:>7.2f}{need:>6.1f}   "
              f"{'PASS' if ok else '**FAIL**'}")

    print()
    print("=" * 92)
    if failures:
        print(f"不合格 {len(failures)} 项：")
        for name, fg, bg, ratio, need in failures:
            print(f"  ✗ {name}  {fg} on {bg} = {ratio:.2f} (需 {need})")
        print()
        print("→ 处置建议见下方 CANDIDATES 候选值评估。")
    else:
        print(f"全部通过 ✅  （共 {len(CASES)} 组）")
    print("=" * 92)

    # ── 候选值评估：把页面上偏灰的文字压深 ──
    print()
    print("=" * 92)
    print("候选值评估：页面次要文字（#7A7161 / #8A8171 已废弃 → 改用 #665D4E / #6B6255）")
    print("=" * 92)
    cands = ["#7A7161", "#6E6555", "#665D4E", "#5F5748", "#59513F",
             "#8A8171", "#6B6255", "#5F5849"]
    print(f"{'候选':<12}{'on页底#E9E2D4':>14}{'on纸底#FCF8EC':>15}{'on白#FFFFFF':>13}   判定")
    print("-" * 92)
    for v in cands:
        a = contrast(v, TOKENS["page_bg"])
        b = contrast(v, TOKENS["paper"])
        c = contrast(v, TOKENS["card"])
        ok = min(a, b, c) >= 4.5
        cur = ""
        if v == "#665D4E":
            cur = "  ← 当前 --muted（已采用）"
        elif v == "#6B6255":
            cur = "  ← 当前 --ink-soft（已采用）"
        elif v in ("#7A7161", "#8A8171"):
            cur = "  ← 已废弃（页底仅 3.74 / 2.98）"
        print(f"{v:<12}{a:>14.2f}{b:>15.2f}{c:>13.2f}   {'OK' if ok else '--'}{cur}")

    print("=" * 92)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
