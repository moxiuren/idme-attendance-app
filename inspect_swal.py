# -*- coding: utf-8 -*-
"""
查看页面弹窗内容与计算逻辑
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

STUDENT_1_URL = 'https://moeissppb.moe.gov.my/keputusan/bmi-skor/1000004'

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

    sppb_page.goto(STUDENT_1_URL, wait_until='domcontentloaded')
    time.sleep(3)

    # 检查是否有 swal2 弹窗
    swal = sppb_page.locator('.swal2-container')
    if swal.count() > 0 and swal.is_visible():
        print('[发现弹窗] 弹窗文本:\n', swal.inner_text())
        sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\swal_popup.png')
    else:
        print('[提示] 进入页面时没有可见的 swal2 弹窗')

    # 查看前端计算 BMI 的 JS 函数
    print('\n[检查前端计算逻辑] ...')
    calc_func = sppb_page.evaluate('''() => {
        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
        return scripts.filter(s => s.includes('Tinggi') || s.includes('Berat') || s.includes('BMI') || s.includes('taksiran'));
    }''')
    print('相关内嵌脚本数量:', len(calc_func))
    for s in calc_func[:3]:
        print(s[:300])

    browser.close()
    print('[完成]')
