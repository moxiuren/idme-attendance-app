# -*- coding: utf-8 -*-
"""
前台测试录入第 1 位学生 (MURID CONTOH SATU)，测试输入精度与 Simpan 交互
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
        headless=False,
        args=['--start-maximized', '--disable-blink-features=AutomationControlled']
    )
    context = browser.new_context(
        no_viewport=True,
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    )
    page = context.new_page()

    print('[步骤 1] 登录 idMe 统一网关...')
    page.goto('https://idme.moe.gov.my/login', wait_until='domcontentloaded')
    page.fill('input#ic', ic)
    page.click('button[type="submit"]')
    page.wait_for_load_state('domcontentloaded')
    time.sleep(1)

    page.click('#check_log')
    time.sleep(0.5)
    page.fill('input#password', pw)
    time.sleep(0.5)
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

    print(f'[步骤 2] 前台进入第 1 位学生录入页面: {STUDENT_1_URL} ...')
    sppb_page.goto(STUDENT_1_URL, wait_until='domcontentloaded')
    time.sleep(3)

    # 定位各个输入项
    date_input = sppb_page.locator('input[type="date"]').first
    height_input = sppb_page.locator('input[type="number"]').nth(0)
    weight_input = sppb_page.locator('input[type="number"]').nth(1)
    bmi_display = sppb_page.locator('input[readonly]').first

    print(f'当前日期框默认值: {date_input.input_value()}')
    print('[步骤 3] 设置测试日期为 2026-09-09 (用户指定 9月9日)...')
    date_input.fill('2026-09-09')
    time.sleep(1)

    print('[步骤 4] 填入体高 1.175 (117.5cm)...')
    height_input.fill('1.175')
    time.sleep(1)

    print('[步骤 5] 填入体重 20.55 kg...')
    weight_input.fill('20.55')
    time.sleep(1)

    # 触发失焦计算
    weight_input.blur()
    time.sleep(1)

    calc_bmi = bmi_display.input_value()
    print(f'[计算结果] 系统自动计算的 BMI 评估值: {calc_bmi}')

    print('[步骤 6] 点击 Simpan (保存)...')
    sppb_page.click('button:has-text("Simpan")')
    time.sleep(3)

    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\test_save_student1.png')

    time.sleep(5)
    browser.close()
    print('[完成] 第一位学生测试录入完成')
