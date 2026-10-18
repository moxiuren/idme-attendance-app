# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    context = browser.contexts[0]
    
    sppb_page = None
    for pg in context.pages:
        if 'moeissppb.moe.gov.my' in pg.url and not pg.url.startswith('chrome'):
            sppb_page = pg
            break

    # 打印弹窗 HTML
    html = sppb_page.evaluate('''() => {
        const dialog = document.querySelector('.w-dialog, [role="dialog"], .w-card--shadow');
        return dialog ? dialog.outerHTML : 'no dialog';
    }''')
    print("弹窗 HTML:\n", html)
