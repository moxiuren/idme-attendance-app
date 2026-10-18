# -*- coding: utf-8 -*-
"""
前台访问体育科 Google Drive 文件夹查看其他老师上传的范例
严禁 Emoji
"""
import sys, os, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

DRIVE_URL = "https://drive.google.com/drive/folders/1oLqV6vdgf_TgyGHsZI_sH5Y2Ez14Ldz-?usp=drive_link"

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    context = browser.contexts[0]
    
    # 新建或复用页面
    page = context.new_page()

    print(f"[CDP 访问] 正在前台打开 Google Drive: {DRIVE_URL} ...")
    page.goto(DRIVE_URL, wait_until='domcontentloaded')
    time.sleep(5)

    print(f"当前页面 URL: {page.url}")
    print(f"当前页面标题: {page.title()}")

    # 截图
    page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\gdrive_overview.png', full_page=True)

    # 抓取页面上的文件名
    files = page.evaluate('''() => {
        const els = Array.from(document.querySelectorAll('[data-id], [role="row"], [role="gridcell"], [aria-label]'));
        const names = [];
        els.forEach(el => {
            const txt = el.getAttribute('aria-label') || el.innerText || '';
            if (txt.includes('Laporan') || txt.includes('BMI') || txt.includes('SEGAK') || txt.includes('.pdf') || txt.includes('.docx')) {
                names.push(txt.trim().replace(/\\n/g, ' '));
            }
        });
        return Array.from(new Set(names));
    }''')

    print(f"\n找到的 Drive 文件/文件夹列表 ({len(files)} 个):")
    for f in files:
        print("  -", f)

    time.sleep(3)
