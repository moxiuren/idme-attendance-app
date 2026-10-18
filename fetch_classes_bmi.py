# -*- coding: utf-8 -*-
"""
Playwright 抓取 1B 和 1D 班上半年 BMI 数据
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

URL_1B = 'https://moeissppb.moe.gov.my/laporan/segak/individu-skor-bmi/1000001'
URL_1D = 'https://moeissppb.moe.gov.my/laporan/segak/individu-skor-bmi/1000002'

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

    print('[步骤 2] 访问 1B 班上半年 BMI 详情页...')
    sppb_page.goto(URL_1B, wait_until='domcontentloaded')
    time.sleep(4)
    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_1b_page.png')
    with open(r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_1b_page.html', 'w', encoding='utf-8') as f:
        f.write(sppb_page.content())
    print('[1B 班详情页保存完成]')

    print('[步骤 3] 访问 1D 班上半年 BMI 详情页...')
    sppb_page.goto(URL_1D, wait_until='domcontentloaded')
    time.sleep(4)
    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_1d_page.png')
    with open(r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_1d_page.html', 'w', encoding='utf-8') as f:
        f.write(sppb_page.content())
    print('[1D 班详情页保存完成]')

    browser.close()
    print('[全部页面抓取完成]')
