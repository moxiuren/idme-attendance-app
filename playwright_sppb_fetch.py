# -*- coding: utf-8 -*-
"""
Playwright 自动化直达 SPPB -> /keputusan/bmi
严禁 Emoji
"""
import sys, os, time, json
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

CRED_PATH = r'C:\Users\Admin\Documents\Projects\idme-attendance-app\credentials.json'
with open(CRED_PATH, 'r', encoding='utf-8') as f:
    creds = json.load(f)
ic = creds['ic']
pw = creds['password']

with sync_playwright() as p:
    browser = p.chromium.launch(
        channel='chrome',
        headless=True,
        args=['--disable-blink-features=AutomationControlled']
    )
    context = browser.new_context(
        viewport={'width': 1280, 'height': 800},
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    )
    page = context.new_page()

    print('[步骤 1] 登录 idMe...')
    page.goto('https://idme.moe.gov.my/login', wait_until='domcontentloaded')
    page.fill('input#ic', ic)
    page.click('button[type="submit"]')
    page.wait_for_load_state('domcontentloaded')
    time.sleep(1)

    page.click('#check_log')
    time.sleep(0.5)
    page.fill('input#password', pw)
    page.click('#log_open_form')
    page.wait_for_load_state('domcontentloaded')
    time.sleep(2)

    print('[步骤 2] 点击 SPPB 链接建立会话...')
    page.goto('https://idme.moe.gov.my/list_aplikasi', wait_until='domcontentloaded')
    time.sleep(1)
    
    with context.expect_page() as new_page_info:
        page.locator('a[href*="moeissppb"]').first.click()
    sppb_page = new_page_info.value
    sppb_page.wait_for_load_state('domcontentloaded')
    time.sleep(3)

    print('[步骤 3] 直接导航进入 https://moeissppb.moe.gov.my/keputusan/bmi ...')
    sppb_page.goto('https://moeissppb.moe.gov.my/keputusan/bmi', wait_until='domcontentloaded')
    time.sleep(4)
    print(f'[步骤 4] 当前页面 URL: {sppb_page.url}')
    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_step7_bmi_direct.png')

    with open(r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_step7_bmi_direct.html', 'w', encoding='utf-8') as f:
        f.write(sppb_page.content())

    browser.close()
    print('[完成]')
