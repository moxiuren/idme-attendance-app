# -*- coding: utf-8 -*-
"""
一键自动登录 idMe 并直达 2026 下半年 PBD / UASA 成绩录入入口
严禁 Emoji
"""
import sys
import os
import time
import json
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

CRED_PATH = r'C:\Users\Admin\Documents\Projects\idme-attendance-app\credentials.json'
if not os.path.exists(CRED_PATH):
    print(f'[错误] 未找到凭据文件: {CRED_PATH}')
    sys.exit(1)

with open(CRED_PATH, 'r', encoding='utf-8') as f:
    creds = json.load(f)

ic = creds.get('ic', '')
pw = creds.get('password', '')

TARGET_PBD_URL = 'https://moeissppb.moe.gov.my/keputusan/pbd/pbd'

print('[步骤 1/4] 启动 Chrome 浏览器...')
with sync_playwright() as p:
    browser = p.chromium.launch(
        channel='chrome',
        headless=False,
        args=['--start-maximized', '--disable-blink-features=AutomationControlled']
    )
    context = browser.new_context(
        no_viewport=True,
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    )
    page = context.new_page()

    print('[步骤 2/4] 正在登录 idMe 统一身份网关...')
    page.goto('https://idme.moe.gov.my/login', wait_until='domcontentloaded')
    time.sleep(1)
    page.fill('input#ic', ic)
    page.click('button[type="submit"]')
    page.wait_for_load_state('domcontentloaded')
    time.sleep(1.5)

    page.click('#check_log')
    time.sleep(0.5)
    page.fill('input#password', pw)
    page.click('#log_open_form')
    page.wait_for_load_state('domcontentloaded')
    time.sleep(2)

    print('[步骤 3/4] 穿透单点登录 (SSO) 建立 SPPB 评估系统会话...')
    page.goto('https://idme.moe.gov.my/list_aplikasi', wait_until='domcontentloaded')
    time.sleep(1)

    with context.expect_page() as new_page_info:
        page.locator('a[href*="moeissppb"]').first.click()
    sppb_page = new_page_info.value
    sppb_page.wait_for_load_state('domcontentloaded')
    time.sleep(3)

    print('[步骤 4/4] 直达下半年 PBD / UASA 录入总入口...')
    sppb_page.goto(TARGET_PBD_URL, wait_until='domcontentloaded')
    time.sleep(2)

    print('\n======================================================')
    print('[成功] 已直达下半年 PBD 录入页面！')
    print(f'当前页面: {sppb_page.url}')
    print('活动类型: PENTAKSIRAN BERTERUSAN (AKHIR SESI AKADEMIK)')
    print('提示: 浏览器将保持打开，您可直接在窗口中进行各科目成绩打分与填报。')
    print('      如需退出，直接关闭浏览器窗口或在此控制台按 Ctrl+C 即可。')
    print('======================================================\n')

    # 保持浏览器运行，直到用户主动关闭窗口
    try:
        while len(context.pages) > 0:
            time.sleep(1)
    except Exception:
        pass
