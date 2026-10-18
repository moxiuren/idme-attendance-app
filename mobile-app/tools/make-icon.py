#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「idMe 极速点名」的定制应用图标（手账风）。

配色与几何逐字取自 src/styles/base.css 的设计令牌，不另起一套：
    纸底 --paper    #FCF8EC      墨线 --ink    #2E2A24
    主色 --blue-ink #2B4E78      完成 --green  #3F6B2C
投影用 --mk 的「实色偏移、不模糊」写法（2.5px 3px 0 rgba(46,42,36,.16)），
圆角带轻微抖动模拟手抖 —— 与界面里的 --r-sk 是同一套手绘语言。

图标语义：一张微微倾斜的点名卡。上半是三条名单墨线，下半一笔绿勾，
即「名单已点完」。全部用几何形状表达，不放文字：48px 下汉字必糊。

输出 Android 五档密度（覆盖 Capacitor 模板默认的蓝色 X 图标）：
    mipmap-*/ic_launcher.png             48 / 72 / 96 / 144 / 192
    mipmap-*/ic_launcher_round.png       48 / 72 / 96 / 144 / 192
    mipmap-*/ic_launcher_foreground.png 108 / 162 / 216 / 324 / 432
另出 docs/icon-preview.png 供人工确认。

用法：
    python tools/make-icon.py             # 生成并写入 android 资源目录
    python tools/make-icon.py --preview   # 只出预览图，不碰 android 目录
"""

import argparse
import math
import os
import random
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("需要 Pillow：C:/Python314/python.exe -m pip install pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
RES = os.path.join(APP, "android", "app", "src", "main", "res")
DOCS = os.path.abspath(os.path.join(APP, os.pardir, "docs"))

# ── 配色：与 src/styles/base.css 的令牌逐字一致 ──────────────────
PAPER = (252, 248, 236, 255)   # --paper
INK = (46, 42, 36, 255)        # --ink
BLUE = (43, 78, 120, 255)      # --blue-ink（界面主色）
GREEN = (63, 107, 44, 255)     # --green（出席）
SHADOW = (46, 42, 36, 46)      # --mk 的实色偏移投影

# ── 几何：以「可见区 1000×1000 单位」为坐标空间 ──────────────────
UNIT = 1000.0
MASTER = 2048                  # 可见区的渲染分辨率（再降采样到各档）
FG_SCALE = 0.875               # 自适应前景在 108dp 图层里的缩放（见 make_foreground）
ROUND_SCALE = 0.84             # 圆形图标要额外收边（见 make_round）
TILT = -4.0                    # 手账里的纸片从不摆正
CARD_W, CARD_H, CARD_R = 640.0, 720.0, 66.0
ROWS = [(-250.0, 480.0), (-160.0, 452.0), (-70.0, 468.0)]   # (y, 长度)
CHECK = ((-165.0, 130.0), (-30.0, 255.0), (215.0, 20.0))    # 起 / 折 / 终
ROW_W, CHECK_W, OUTLINE_W = 50.0, 92.0, 15.0

# (目录后缀, 传统图标 px, 自适应前景 px)
DENSITIES = [
    ("mdpi", 48, 108),
    ("hdpi", 72, 162),
    ("xhdpi", 96, 216),
    ("xxhdpi", 144, 324),
    ("xxxhdpi", 192, 432),
]


# ══════════════════════════════════════════════════════════════
# 手绘几何工具
# ══════════════════════════════════════════════════════════════

def _rrect(cx, cy, w, h, r, seg=14):
    """圆角矩形轮廓点（顺时针）。四角用等分圆弧，便于后续抖动。"""
    x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    pts = []
    for ax, ay, a0, a1 in (
        (x1 - r, y0 + r, -90, 0),
        (x1 - r, y1 - r, 0, 90),
        (x0 + r, y1 - r, 90, 180),
        (x0 + r, y0 + r, 180, 270),
    ):
        for i in range(seg + 1):
            a = math.radians(a0 + (a1 - a0) * i / seg)
            pts.append((ax + r * math.cos(a), ay + r * math.sin(a)))
    return pts


def _wobble(pts, amp, seed):
    """给轮廓加低频抖动。直接逐点随机会让线看起来像锯齿，
    所以先取随机量再做一次滑动平均，得到缓慢起伏的「手抖」。"""
    if amp <= 0:
        return pts
    rnd = random.Random(seed)
    n = len(pts)
    dx = [rnd.uniform(-amp, amp) for _ in range(n)]
    dy = [rnd.uniform(-amp, amp) for _ in range(n)]

    def smooth(a):
        out = []
        for i in range(n):
            out.append((a[i - 1] + 2 * a[i] + a[(i + 1) % n]) / 4.0)
        return out

    dx, dy = smooth(smooth(dx)), smooth(smooth(dy))
    return [(x + dx[i], y + dy[i]) for i, (x, y) in enumerate(pts)]


def _stroke(d, pts, color, width, cap=True):
    """折线描边。PIL 的 joint='curve' 只处理拐点，端点要自己补圆头，
    否则绿勾的两端会是方口，不像马克笔。"""
    if len(pts) < 2:
        return
    w = max(1, int(round(width)))
    d.line(pts, fill=color, width=w, joint="curve")
    if cap:
        r = w / 2.0
        for p in (pts[0], pts[-1]):
            d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def _qbez(p0, p1, p2, n=26):
    """二次贝塞尔采样。勾的两笔各用一条，避免折线显得生硬。"""
    return [
        (
            (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
        )
        for t in (i / n for i in range(n + 1))
    ]


# ══════════════════════════════════════════════════════════════
# 内容层：倾斜的点名卡（透明底，尺寸 = 可见区）
# ══════════════════════════════════════════════════════════════

def render_content(px=MASTER):
    """画在透明层上。可见区 px×px 居中，卡片按 TILT 倾斜。"""
    u = px / UNIT
    c = px / 2.0
    layer = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    w, h, r = CARD_W * u, CARD_H * u, CARD_R * u

    body = _wobble(_rrect(c, c, w, h, r), 2.4 * u, seed=17)

    # 实色偏移投影 —— 先画，后被卡片本体盖住大半，只在右下露出一条边
    d.polygon([(x + 17 * u, y + 23 * u) for x, y in body], fill=SHADOW)

    d.polygon(body, fill=PAPER)
    _stroke(d, body + [body[0]], INK, OUTLINE_W * u, cap=False)

    # 名单墨线：长度刻意各不相同，像随手画的三行。
    # alpha 压到 100 而非实心：实心墨线在 48px 下会和卡片边框糊成一根黑条。
    for i, (ry, rlen) in enumerate(ROWS):
        x0, x1 = c - rlen * u / 2, c + rlen * u / 2
        _stroke(d, [(x0, c + ry * u), (x1, c + ry * u)],
                (46, 42, 36, 100), ROW_W * u)

    # 绿勾：两笔贝塞尔，圆头，稍微压出卡片一点点弧度感
    a, b, e = [(c + p[0] * u, c + p[1] * u) for p in CHECK]
    left = _qbez(a, (a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.42), b)
    right = _qbez(b, (b[0] + (e[0] - b[0]) * 0.16, b[1] + (e[1] - b[1]) * 0.34), e)
    _stroke(d, left + right[1:], GREEN, CHECK_W * u)

    return layer.rotate(TILT, resample=Image.BICUBIC, center=(c, c))


# ══════════════════════════════════════════════════════════════
# 背景层 / 遮罩
# ══════════════════════════════════════════════════════════════

def render_bg(px=MASTER):
    """纯色深蓝底。

    曾试过在蓝底上叠一层手账方格，实测在 96px 以下会糊成一片噪点，
    在 192px 上又和卡片抢注意力 —— 图标底不需要纹理，去掉。
    """
    return Image.new("RGBA", (px, px), BLUE)


def _circle_mask(px):
    m = Image.new("L", (px, px), 0)
    ImageDraw.Draw(m).ellipse([0, 0, px - 1, px - 1], fill=255)
    return m


def _superellipse_mask(px, n=4.0):
    """方形遮罩（squircle）。Android 8+ 默认遮罩就长这样，
    预览里用它来确认「四角不会被切到」。"""
    m = Image.new("L", (px, px), 0)
    d = ImageDraw.Draw(m)
    c, a = px / 2.0, px / 2.0
    pts = []
    for i in range(721):
        t = 2 * math.pi * i / 720
        ct, st = math.cos(t), math.sin(t)
        pts.append((
            c + a * math.copysign(abs(ct) ** (2.0 / n), ct),
            c + a * math.copysign(abs(st) ** (2.0 / n), st),
        ))
    d.polygon(pts, fill=255)
    return m


def _rounded_mask(px, ratio=0.30):
    m = Image.new("L", (px, px), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, px - 1, px - 1],
                                        radius=int(px * ratio), fill=255)
    return m


# ══════════════════════════════════════════════════════════════
# 组装
# ══════════════════════════════════════════════════════════════

_CACHE = {}


def content(px):
    """按需渲染内容层并缓存（传统图标与自适应前景要两种尺寸）。"""
    if px not in _CACHE:
        _CACHE[px] = render_content(px)
    return _CACHE[px]


def _shrink(img, size):
    """大倍率降采样：reducing_gap 让 LANCZOS 先逐级缩，避免边缘振铃。"""
    return img.resize((size, size), Image.LANCZOS, reducing_gap=3.0)


def legacy_master():
    return Image.alpha_composite(render_bg(), content(MASTER))


def make_square(size):
    return _shrink(legacy_master(), size)


def make_round(size):
    """圆形图标。

    直接给方形图标套圆形遮罩会切掉卡片四角 —— 卡片旋转后的包围盒对角
    半径约 528 单位，而圆半径只有 500。所以内容按 ROUND_SCALE 缩一圈
    （528×0.84≈443，留 11% 边距），再裁圆。
    """
    inner = int(round(MASTER * ROUND_SCALE))
    canvas = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    off = (MASTER - inner) // 2
    canvas.paste(content(inner), (off, off))
    img = Image.alpha_composite(render_bg(), canvas)
    img.putalpha(_circle_mask(MASTER))
    return _shrink(img, size)


def make_foreground(size):
    """前景层画布是 108dp，启动器只显示中央 72dp 可见区。

    FG_SCALE 是「内容方块」相对可见区的倍率 —— 1.0 表示内容方块正好铺满
    72dp 可见区，此时卡片占可见区 64%（= CARD_W/UNIT）。

    真机实测（2026-10-17，vivo 启动器）：取 1.28 时卡片占到可见区的 82%，
    蓝底只剩一圈细边，正是 0.64×1.28。改成 0.875 后卡片约 56%，
    与「传统方形图标里卡片占 64%」的观感接近，且卡片旋转后的包围盒
    对角半径 32dp < 圆形遮罩半径 36dp，换任何遮罩都不会切角。
    """
    layer = MASTER * 3 // 2
    inner = int(round(MASTER * FG_SCALE))
    canvas = Image.new("RGBA", (layer, layer), (0, 0, 0, 0))
    off = (layer - inner) // 2
    canvas.paste(content(inner), (off, off))
    return _shrink(canvas, size)


# ══════════════════════════════════════════════════════════════
# 预览图
# ══════════════════════════════════════════════════════════════

def _font(size):
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf", "segoeui.ttf"):
        p = os.path.join("C:/Windows/Fonts", name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def _visible_window(fg):
    """启动器只显示 108dp 图层中央的 72dp 可见区。

    预览必须按这个口径裁一刀再套遮罩，否则会以为「卡片占图层 40%」
    很安全，实际在桌面上看到的是 82% 已经快顶到边了。
    """
    px = fg.width
    inner = int(round(px * 72.0 / 108.0))
    off = (px - inner) // 2
    return fg.crop((off, off, off + inner, off + inner))


def write_preview(path):
    """一张图看全：五档尺寸的方形 / 圆形，以及三种遮罩下的自适应图标。"""
    bg = (246, 242, 232, 255)
    pad, gap = 34, 26
    big = 192
    smalls = [144, 96, 72, 48]
    row1_h = big
    row2_h = big
    row3_h = big
    title_h = 30

    f_t = _font(21)
    f_s = _font(16)

    w = pad * 2 + big + gap + sum(smalls) + gap * (len(smalls) - 1)
    h = pad * 2 + title_h * 3 + row1_h + row2_h + row3_h + gap * 3

    sheet = Image.new("RGBA", (w, h), bg)
    d = ImageDraw.Draw(sheet)

    def paste(img, x, y, label):
        sheet.alpha_composite(img, (x, y))
        if label:
            tw = d.textlength(label, font=f_s)
            d.text((x + (img.width - tw) / 2, y + img.height + 6),
                   label, font=f_s, fill=(110, 100, 86, 255))

    sq = make_square(big)
    rd = make_round(big)
    fg = make_foreground(324)

    y = pad
    d.text((pad, y), "① 传统方形图标（五档密度，各取一枚）", font=f_t, fill=(46, 42, 36, 255))
    y += title_h
    paste(sq, pad, y, "192")
    x = pad + big + gap
    for s in smalls:
        paste(make_square(s), x, y + (big - s) // 2, str(s))
        x += s + gap
    y += row1_h + gap

    d.text((pad, y), "② 圆形图标（ic_launcher_round）", font=f_t, fill=(46, 42, 36, 255))
    y += title_h
    paste(rd, pad, y, "192")
    x = pad + big + gap
    for s in smalls[:3]:
        paste(make_round(s), x, y + (big - s) // 2, str(s))
        x += s + gap
    y += row2_h + gap

    d.text((pad, y), "③ 自适应图标（中央 72dp 可见区 + 遮罩，即桌面实际所见）",
           font=f_t, fill=(46, 42, 36, 255))
    y += title_h
    for i, (mask, name) in enumerate((
        (_circle_mask, "圆形遮罩"),
        (_superellipse_mask, "方形遮罩"),
        (_rounded_mask, "圆角方形"),
    )):
        img = _visible_window(fg)
        # 先叠上自适应背景色，再套遮罩。
        # ★ 不能只 putalpha：putalpha 只换 alpha 通道，透明区的 RGB 还是
        #   (0,0,0)，一变成不透明就成了黑块 —— 预览会误显示成黑底图标。
        img = Image.alpha_composite(Image.new("RGBA", img.size, BLUE), img)
        img.putalpha(mask(img.width))
        img = _shrink(img, big)
        paste(img, pad + i * (big + gap), y, name)
    y += row3_h + gap

    sheet.convert("RGB").save(path, optimize=True)
    return path


def write_site_assets(folder):
    """下载站要用的图标：站点必须自包含，不能反向引用 android 资源目录。

    64 给 favicon，192 给页面展示，512 给社交分享卡片 / PWA manifest。
    """
    os.makedirs(folder, exist_ok=True)
    for px in (64, 192, 512):
        make_square(px).save(os.path.join(folder, f"icon-{px}.png"), optimize=True)
    return folder


# ══════════════════════════════════════════════════════════════
# 入口
# ══════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(description="生成 idMe 极速点名 的定制图标")
    ap.add_argument("--preview", action="store_true", help="只出预览图，不写 android 资源")
    ap.add_argument("--site", metavar="DIR",
                    help="额外把站点用图标（64/192/512）写到 DIR 下")
    args = ap.parse_args()

    os.makedirs(DOCS, exist_ok=True)
    prev = write_preview(os.path.join(DOCS, "icon-preview.png"))
    print(f"预览  {os.path.relpath(prev, APP)}")

    if args.site:
        folder = write_site_assets(args.site)
        print(f"站点  {os.path.relpath(folder, APP)}  icon-64 / icon-192 / icon-512")

    if args.preview:
        return

    written = 0
    for dens, sq_px, fg_px in DENSITIES:
        folder = os.path.join(RES, f"mipmap-{dens}")
        if not os.path.isdir(folder):
            print(f"跳过  mipmap-{dens}（目录不存在）")
            continue
        make_square(sq_px).save(os.path.join(folder, "ic_launcher.png"), optimize=True)
        make_round(sq_px).save(os.path.join(folder, "ic_launcher_round.png"), optimize=True)
        make_foreground(fg_px).save(os.path.join(folder, "ic_launcher_foreground.png"),
                                    optimize=True)
        written += 3
        print(f"写入  mipmap-{dens}  {sq_px}×{sq_px} ×2  +  前景 {fg_px}×{fg_px}")

    print(f"完成  共 {written} 个 PNG")
    print("提示  values/ic_launcher_background.xml 需与图标底色一致（#2B4E78）")


if __name__ == "__main__":
    main()
