# -*- coding: utf-8 -*-
"""
查看 1B 班提交后的实时状态
严禁 Emoji
"""
import sys, os, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    context = browser.contexts[0]
    
    sppb_page = None
    for pg in context.pages:
        if 'moeissppb.moe.gov.my' in pg.url and not pg.url.startswith('chrome'):
            sppb_page = pg
            break

    print("进入 /keputusan/bmi ...")
    sppb_page.goto('https://moeissppb.moe.gov.my/keputusan/bmi', wait_until='domcontentloaded')
    time.sleep(3)

    rows = sppb_page.evaluate('''() => {
        const trs = Array.from(document.querySelectorAll('table tbody tr'));
        return trs.map(tr => tr.innerText.replace(/\\n/g, ' | '));
    }''')

    print(f"当前列表共有 {len(rows)} 行:")
    for i, r in enumerate(rows):
        print(f"  Row {i+1}: {r}")

    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\bmi_after_hantar.png', full_page=True)
