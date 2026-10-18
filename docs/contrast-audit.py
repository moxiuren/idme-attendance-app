#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
idMe 点名 App · WCAG 2.1 AA 对比度审计

用途：改动 styles/*.css 的颜色令牌后复跑本脚本，确认没有回归。
运行：python docs/contrast-audit.py
退出码：0 = 全部通过；1 = 存在不合格项

2026-10-16 更新：切换到手账风格调色板（清晰体方案）。
"""

import sys

# Windows 控制台默认 GBK，打印非 ASCII 会抛 UnicodeEncodeError，
# 异常穿透 SystemExit 后让「全部通过」也返回 1（2026-10-18 实测）。
# 显式重配 stdout：无法编码的字符降级为 ?，打印失败绝不改变退出码。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

# ---------------- 当前设计令牌（与 styles/base.css 的 :root 保持一致） ----------------
TOKENS = {
    # 纸与墨
    "paper":       "#fcf8ec",
    "paper_2":     "#f6f0e0",
    "line":        "#c6bda9",
    "surface":     "#ffffff",
    "text":        "#2e2a24",
    "text_dim":    "#6b6255",
    # 荧光笔蓝
    "blue_fill":   "#cfe1f7",
    "blue_edge":   "#9cc0e8",
    "primary":     "#2b4e78",
    # 出席
    "green":       "#3f6b2c",
    "green_bg":    "#e4f0da",
    "green_edge":  "#8fb878",
    # 算出席（琥珀）
    "amber":       "#9e5a00",
    "amber_bg":    "#fdf0d8",
    "amber_edge":  "#d98e1f",
    # 缺席（红）
    "red":         "#b03434",
    "red_bg":      "#fbe4e2",
    "red_edge":    "#d24b4b",
    # 便签
    "sticky":      "#fff0a8",
    "sticky_ink":  "#6b5711",
    # 批量选中行
    "picked":      "#f2f7fd",
}

# (用途, 前景令牌, 背景令牌, 字号px, 是否粗体)
CASES = [
    # ── 基础文字 ──
    ("正文 on 纸底",                "text",      "paper",     15,   False),
    ("学生姓名 .row-name",          "text",      "surface",   17,   False),
    ("次要文字 on 纸底",            "text_dim",  "paper",     13,   False),
    ("统计标签 .stat-lbl",          "text_dim",  "surface",   11.5, False),
    ("表单标签 .field-label",       "text_dim",  "surface",   13,   True),
    ("空态 .empty",                 "text_dim",  "paper",     14,   False),
    ("抽屉副标题 .sheet-sub",       "text_dim",  "paper",     13,   False),
    ("假因计数 .reason-code",       "text_dim",  "surface",   12,   False),
    ("序号 .row-idx",               "text_dim",  "surface",   14,   True),
    ("meta 行",                     "text_dim",  "paper",     12,   False),
    ("幽灵按钮 .btn-ghost",         "text_dim",  "paper",     16,   True),

    # ── 主操作按钮 ──
    ("主按钮 .btn-primary",         "primary",   "blue_fill", 17,   True),
    ("提交按钮 .btn-amber(便签)",    "sticky_ink", "sticky",   17,   True),
    ("顶栏班级 .topbar-class",       "primary",   "blue_fill", 18,   True),
    ("日期箭头 .date-arrow",         "primary",   "blue_fill", 24,   False),
    ("图标按钮 .icon-btn",           "primary",   "paper",     14,   True),
    ("图标按钮选中 .icon-btn-on",    "primary",   "blue_fill", 14,   True),
    ("输入框动作 .input-act",        "primary",   "blue_fill", 13,   True),
    ("一键 PDPR .btn-pdpr",          "amber",     "surface",   14,   True),
    ("抽屉关闭 .sheet-close",        "text_dim",  "surface",   14,   True),
    ("危险按钮 .btn-danger",         "red",       "red_bg",    14,   True),
    ("对话框标题 .dialog-title",     "text",      "paper",     17,   True),
    ("对话框正文 .dialog-msg",       "text_dim",  "paper",     14.5, True),
    ("对话框图标·危险",              "red",       "red_bg",    14,   False),
    ("对话框图标·询问",              "amber",     "amber_bg",  14,   False),
    # 月历（月度报表抽屉）
    ("月历星期头 .cal-wd",           "text_dim",  "paper",     10.5, True),
    ("月历日号 .cal-day",            "text_dim",  "surface",   11,   True),
    ("月历日号·假期",                "text_dim",  "paper_2",   11,   True),
    ("月历数值 .cal-val",            "text",      "surface",   11.5, True),
    ("月历数值·有缺席",              "red",       "surface",   11.5, True),
    ("月历未录入 .cal-note",         "text_dim",  "paper",     9.5,  False),
    ("图例标题 .cal-legend-t",       "text",      "paper",     11,   True),
    ("图例项 .cal-legend-i",         "text_dim",  "paper",     11,   False),
    ("语言选项（未选）",              "text_dim",  "surface",   14,   True),
    ("语言选项（已选）",              "primary",   "blue_fill", 14,   True),
    ("批量条 .selbar-count",         "primary",   "blue_fill", 14,   False),
    ("批量条按钮 .selbar-btn",       "primary",   "surface",   14,   True),

    # ── 三态标签 ──
    ("标签 出席 .state-present",     "green",     "green_bg",  13,   True),
    ("标签 缺席 .state-absent",      "red",       "surface",   13,   True),
    ("标签 算出席 .state-excused",   "amber",     "surface",   13,   True),
    ("行事由 · 缺席行",              "red",       "red_bg",    12.5, False),
    ("行事由 · 算出席行",            "amber",     "amber_bg",  12.5, False),
    ("行事由 · 默认",                "text_dim",  "surface",   12.5, False),
    ("选中行姓名 .row-picked",       "text",      "picked",    17,   False),

    # ── 统计数字（大字号，阈值 3:1） ──
    ("统计数字 默认",                "text",      "surface",   24,   True),
    ("统计数字 出席 c-green",         "green",     "surface",   24,   True),
    ("统计数字 缺席 c-red",           "red",       "surface",   24,   True),
    ("统计数字 出席率 c-blue",        "primary",   "surface",   24,   True),

    # ── 日期 / 说明 ──
    ("日期文字 .date-text",          "text",      "surface",   16,   True),
    ("日期标签 .tag-green",          "green",     "green_bg",  11,   True),
    ("日期标签 .tag-amber",          "amber",     "amber_bg",  11,   True),
    ("说明条 .stat-note",            "amber",     "amber_bg",  12.5, True),

    # ── 抽屉 ──
    ("chip 未选",                    "text_dim",  "surface",   13,   True),
    ("chip 选中 .chip-on",           "primary",   "blue_fill", 13,   True),
    ("假因名 .reason-name",          "text",      "surface",   15,   True),
    ("假因选中 .reason-on",          "text",      "amber_bg",  15,   True),
    ("抽屉标题 .sheet-title",        "text",      "paper",     19,   True),

    # ── 提示条 ──
    ("提示 .alert-red",              "red",       "red_bg",    14,   True),
    ("提示 .alert-green",            "green",     "green_bg",  14,   True),
    ("提示 .alert-amber",            "amber",     "amber_bg",  14,   True),
    ("提示 .alert-blue",             "primary",   "blue_fill", 14,   True),

    # ── 启动页 ──
    # 副标题 .boot-sub 已于 2026-10-18 从封面移除（键与样式一并删除），
    # 换成同位置的手写落款 —— 它才是现在封面上的有色小字。
    ("启动页落款 .boot-sign",         "text_dim",  "surface",   16,   False),
    ("启动页进度 .boot-progress",     "primary",   "surface",   13,   False),
    ("启动页 logo .boot-logo",        "primary",   "blue_fill", 15,   True),
]

# 待评估的候选值（历史对比：旧琥珀为何被替换）
CANDIDATES = {
    "amber": ["#b26a00", "#a86300", "#9e5a00", "#965700", "#8f5400"],
}


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
    print("idMe 点名 App · WCAG 2.1 AA 对比度审计（手账风格 / 清晰体方案）")
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
    print("历史对比：旧 --amber 为何被替换")
    print("=" * 92)
    print(f"{'候选':<12}{'on琥珀底#fdf0d8':>16}{'on白#FFFFFF':>14}{'on红底#fbe4e2':>15}   判定")
    print("-" * 92)
    for v in CANDIDATES["amber"]:
        a = contrast(v, TOKENS["amber_bg"])
        b = contrast(v, TOKENS["surface"])
        c = contrast(v, TOKENS["red_bg"])
        ok = min(a, b, c) >= 4.5
        cur = ""
        if v == "#b26a00":
            cur = "  ← 旧值（琥珀底仅 3.76，不达标）"
        elif v == TOKENS["amber"]:
            cur = "  ← 当前值（已采用）"
        print(f"{v:<12}{a:>16.2f}{b:>14.2f}{c:>15.2f}   {'OK' if ok else '--'}{cur}")

    print()
    print("=" * 92)
    if failures:
        print(f"不合格 {len(failures)} 项：")
        for name, fg, bg, ratio, need in failures:
            print(f"  [FAIL] {name}  {fg} on {bg} = {ratio:.2f} (需 {need})")
    else:
        print(f"[通过] 全部通过 —— 共 {len(CASES)} 组")
    print("=" * 92)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
