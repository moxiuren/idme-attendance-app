# -*- coding: utf-8 -*-
"""
Playwright 访问 1B 班录入页面 /keputusan/bmi/1000003 并分析结构
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

ENTRY_URL = 'https://moeissppb.moe.gov.my/keputusan/bmi/1000003'

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

    page.goto('https://idme.moe.gov.my/list_aplikasi', wait_until='domcontentloaded')
    time.sleep(1)
    
    with context.expect_page() as new_page_info:
        page.locator('a[href*="moeissppb"]').first.click()
    sppb_page = new_page_info.value
    sppb_page.wait_for_load_state('domcontentloaded')
    time.sleep(3)

    print(f'[步骤 2] 访问录入入口: {ENTRY_URL} ...')
    sppb_page.goto(ENTRY_URL, wait_until='domcontentloaded')
    time.sleep(4)
    print(f'[步骤 2.1] 当前 URL: {sppb_page.url}')
    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_1b_entry.png', full_page=True)

    with open(r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_1b_entry.html', 'w', encoding='utf-8') as f:
        f.write(sppb_page.content())

    browser.close()
    print('[完成] 页面抓取与截图完成')
