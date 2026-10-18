# -*- coding: utf-8 -*-
"""
下载 Google Drive 官方范例及 TAHUN 1 文件夹内的其他老师示例
严禁 Emoji
"""
import sys, os, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

DOWNLOAD_DIR = r"C:\Users\Admin\Downloads"

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    context = browser.contexts[0]
    
    # 找到 Google Drive 页面
    page = None
    for pg in context.pages:
        if 'drive.google.com' in pg.url:
            page = pg
            break

    if not page:
        print("[错误] 未找到 Google Drive 页面")
        sys.exit(1)

    print(f"当前页面: {page.title()} | {page.url}")

    # 1. 查找 TAHUN 1 文件夹并进入
    print("\n正在进入 [TAHUN 1] 文件夹...")
    tahun1_elem = page.locator('div:has-text("TAHUN 1"), [aria-label*="TAHUN 1"]').last
    tahun1_elem.dblclick(force=True)
    time.sleep(4)

    print(f"进入后 URL: {page.url}")
    page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\tahun1_folder.png', full_page=True)

    # 抓取 TAHUN 1 内的文件
    items = page.evaluate('''() => {
        const rows = Array.from(document.querySelectorAll('[data-id], [role="row"], [role="gridcell"]'));
        const files = [];
        rows.forEach(r => {
            const txt = r.innerText.trim();
            if (txt && (txt.includes('1') || txt.includes('.pdf') || txt.includes('.docx') || txt.includes('Laporan'))) {
                files.push(txt.replace(/\\n/g, ' | '));
            }
        });
        return Array.from(new Set(files));
    }''')

    print(f"\n[TAHUN 1] 文件夹内的文件列表 ({len(items)} 个):")
    for it in items:
        print("  -", it)

    time.sleep(3)
