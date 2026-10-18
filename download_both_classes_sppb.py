# -*- coding: utf-8 -*-
"""
完整全自动抓取 1B 与 1D 班上半年官方 BMI 数据与 PDF 报表 (带稳健等待与排障)
严禁 Emoji
"""
import sys, os, time, json, csv
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

CRED_PATH = r'C:\Users\Admin\Documents\Projects\idme-attendance-app\credentials.json'
with open(CRED_PATH, 'r', encoding='utf-8') as f:
    creds = json.load(f)
ic = creds['ic']
pw = creds['password']

DOWNLOAD_DIR = r'C:\Users\Admin\Downloads'

URL_1B = 'https://moeissppb.moe.gov.my/laporan/segak/individu-skor-bmi/1000001'
URL_1D = 'https://moeissppb.moe.gov.my/laporan/segak/individu-skor-bmi/1000002'

def parse_and_save_csv(html_content, out_csv_path):
    soup = BeautifulSoup(html_content, 'html.parser')
    students = []
    tables = soup.find_all('table')
    
    i = 0
    while i < len(tables):
        t = tables[i]
        text = t.get_text()
        if 'Nama Sekolah' in text and 'No. Kad Pengenalan' in text:
            student = {}
            for tr in t.find_all('tr'):
                tds = [td.get_text(strip=True) for td in tr.find_all(['td', 'th'])]
                for j in range(len(tds)):
                    if tds[j] == 'Nama' and j + 2 < len(tds):
                        student['Nama'] = tds[j+2]
                    elif tds[j] == 'No. Kad Pengenalan' and j + 2 < len(tds):
                        student['No. Kad Pengenalan'] = tds[j+2]
                    elif tds[j] == 'Kelas' and j + 2 < len(tds):
                        student['Kelas'] = tds[j+2]
                    elif tds[j] == 'Umur' and j + 2 < len(tds):
                        student['Umur'] = tds[j+2]
                    elif tds[j] == 'Jantina' and j + 2 < len(tds):
                        student['Jantina'] = tds[j+2]

            if i + 1 < len(tables):
                t_score = tables[i+1]
                for tr in t_score.find_all('tr'):
                    tds = [td.get_text(strip=True) for td in tr.find_all(['td', 'th'])]
                    if len(tds) >= 2:
                        k, v = tds[0], tds[1]
                        if 'Berat' in k:
                            student['Berat (kg)'] = v
                        elif 'Tinggi' in k:
                            student['Tinggi (m)'] = v
                        elif k == 'BMI':
                            student['BMI'] = v
                        elif 'Status BMI' in k:
                            student['Status BMI'] = v

            if student.get('Nama') and student.get('No. Kad Pengenalan'):
                students.append(student)
            i += 2
        else:
            i += 1

    if students:
        fields = ['No. Kad Pengenalan', 'Nama', 'Jantina', 'Umur', 'Kelas', 'Tinggi (m)', 'Berat (kg)', 'BMI', 'Status BMI']
        with open(out_csv_path, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            for s in students:
                row = {k: s.get(k, '') for k in fields}
                writer.writerow(row)
    return students

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

    print('[步骤 1] 登录 idMe 统一网关...')
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

    print('[步骤 2] 获取 SPPB 链接并建立安全会话...')
    page.goto('https://idme.moe.gov.my/list_aplikasi', wait_until='domcontentloaded')
    time.sleep(1)
    
    with context.expect_page() as new_page_info:
        page.locator('a[href*="moeissppb"]').first.click()
    sppb_page = new_page_info.value
    sppb_page.wait_for_load_state('domcontentloaded')
    time.sleep(4)
    print(f'[步骤 2.1] SPPB 主页就绪: {sppb_page.url}')

    # 先访问一次 laporan/segak/individu-skor-bmi 确保路由被加载
    print('[步骤 2.2] 导航至个人报表主页...')
    sppb_page.goto('https://moeissppb.moe.gov.my/laporan/segak/individu-skor-bmi', wait_until='domcontentloaded')
    time.sleep(3)

    classes_to_fetch = [
        ('1B', URL_1B, '1B班_上半年_BMI个人报告.pdf', '1B班_上半年_体高与体重.csv'),
        ('1D', URL_1D, '1D班_上半年_BMI个人报告.pdf', '1D班_上半年_体高与体重.csv'),
    ]

    for class_name, url, pdf_name, csv_name in classes_to_fetch:
        print(f'\n[步骤 3] 正在获取 {class_name} 班上半年数据: {url}')
        sppb_page.goto(url, wait_until='domcontentloaded')
        time.sleep(4)
        print(f'[{class_name} 班] 当前页面 URL: {sppb_page.url}')
        
        # 显式等待 Cetak 按钮出现
        cetak_locator = sppb_page.locator('button:has-text("Cetak")')
        cetak_locator.wait_for(state='visible', timeout=15000)
        print(f'[{class_name} 班] Cetak 按钮已就绪，正在点击并捕获打印弹窗...')

        with context.expect_page() as popup_info:
            cetak_locator.click()
        
        popup_page = popup_info.value
        popup_page.wait_for_load_state('domcontentloaded')
        time.sleep(5)
        print(f'[{class_name} 班] 弹窗加载完成，当前 URL: {popup_page.url}')

        # 导出 PDF
        pdf_path = os.path.join(DOWNLOAD_DIR, pdf_name)
        print(f'[{class_name} 班] 正在生成官方矢量 PDF 报告: {pdf_name} ...')
        popup_page.pdf(
            path=pdf_path,
            format='A4',
            print_background=True,
            margin={'top': '10mm', 'bottom': '10mm', 'left': '10mm', 'right': '10mm'}
        )
        print(f'[{class_name} 班] PDF 导出成功: {pdf_path}')

        # 提取 HTML 并保存 CSV
        html_content = popup_page.content()
        csv_path = os.path.join(DOWNLOAD_DIR, csv_name)
        students = parse_and_save_csv(html_content, csv_path)
        print(f'[{class_name} 班] CSV 导出成功，共 {len(students)} 位学生: {csv_path}')
        
        popup_page.close()

    browser.close()
    print('\n[全部完成] 1B 和 1D 班上半年数据已全部下载完毕！')
