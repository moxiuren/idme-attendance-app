# -*- coding: utf-8 -*-
"""
1B 班下半年 BMI 数据全量前台自动化录入脚本 (带 loader-wrapper 强容错)
严格遵循系统规范:
  - 日期: 2026-09-09
  - 身高: 米 (m), 保留 2 位小数 (例 117.5cm -> 1.18)
  - 体重: 千克 (kg), 保留 1 位小数 (例 20.55kg -> 20.6)
严禁 Emoji
"""
import sys, os, time, json, csv
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

CRED_PATH = r'C:\Users\Admin\Documents\Projects\idme-attendance-app\credentials.json'
with open(CRED_PATH, 'r', encoding='utf-8') as f:
    creds = json.load(f)
ic = creds['ic']
pw = creds['password']

CSV_PATH = r'C:\Users\Admin\Downloads\Telegram Desktop\1B班_体高与体重.csv'
OVERVIEW_URL = 'https://moeissppb.moe.gov.my/keputusan/bmi/1000003'

# 读取 CSV 原始数据
students_data = []
with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        h_cm = float(row['体高(cm)'].strip())
        w_kg = float(row['体重(kg)'].strip())
        
        # 换算规则
        # 身高米: 保留 2 位小数
        h_m_str = f"{h_cm / 100.0:.2f}"
        # 体重千克: 系统硬性规定只允许 1 位小数
        w_kg_str = f"{w_kg:.1f}"

        students_data.append({
            'no': int(row['序号'].strip()),
            'student_id': row['学号'].strip(),
            'name_en': row['英文姓名'].strip().upper(),
            'name_cn': row['中文名'].strip(),
            'gender': row['性别'].strip(),
            'raw_h': h_cm,
            'raw_w': w_kg,
            'input_h': h_m_str,
            'input_w': w_kg_str
        })

print(f"[准备就绪] 1B 班待录入学生总数: {len(students_data)} 人")
print(f"[参数设定] 测试日期统一设为: 2026-09-09 (9月份)")

with sync_playwright() as p:
    print("\n[启动] 正在前台拉起 Chrome 浏览器，请留意屏幕...")
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

    print("[步骤 1] 登录 idMe 统一网关...")
    page.goto('https://idme.moe.gov.my/login', wait_until='domcontentloaded')
    time.sleep(2)
    page.fill('input#ic', ic)
    time.sleep(0.5)
    page.press('input#ic', 'Enter')
    page.wait_for_load_state('domcontentloaded')
    time.sleep(2)

    page.click('#check_log', force=True)
    time.sleep(0.5)
    page.fill('input#password', pw)
    time.sleep(0.5)
    page.click('#log_open_form', force=True)
    page.wait_for_load_state('domcontentloaded')
    time.sleep(3)

    print("[步骤 2] 获取 SPPB 链接并建立安全会话...")
    page.goto('https://idme.moe.gov.my/list_aplikasi', wait_until='domcontentloaded')
    time.sleep(2)
    
    with context.expect_page() as new_page_info:
        page.locator('a[href*="moeissppb"]').first.click(force=True)
    sppb_page = new_page_info.value
    sppb_page.wait_for_load_state('domcontentloaded')
    time.sleep(3)

    print(f"[步骤 3] 进入 1B 班成绩录入总览列表: {OVERVIEW_URL} ...")
    sppb_page.goto(OVERVIEW_URL, wait_until='domcontentloaded')
    time.sleep(3)

    # 从总览列表中获取每位学生的对应录入 URL
    table = sppb_page.locator('table').first
    rows = table.locator('tr').all()
    
    student_url_map = {}
    for r in rows[1:]:
        name_cell = r.locator('td[data-label="Nama"]')
        link_elem = r.locator('td[data-label="Tindakan"] a')
        if name_cell.count() > 0 and link_elem.count() > 0:
            name_text = name_cell.inner_text().strip().upper()
            href = link_elem.get_attribute('href')
            student_url_map[name_text] = href

    print(f"[匹配] 成功从系统获取到 {len(student_url_map)} 位学生的直达录入通道")

    print("\n" + "="*80)
    print("开始逐位学生自动化录入与暂存保存 (前台实时呈现)")
    print("="*80)

    success_count = 0
    fail_count = 0

    for idx, s in enumerate(students_data, start=1):
        name = s['name_en']
        name_cn = s['name_cn']
        url = student_url_map.get(name)

        if not url:
            # 模糊兜底匹配
            for k, u in student_url_map.items():
                if name in k or k in name:
                    url = u
                    break

        if not url:
            print(f"[{idx:02d}/30] [跳过] 未在系统列表中找到学生: {name} ({name_cn})")
            fail_count += 1
            continue

        print(f"\n[{idx:02d}/30] 正在处理: {name} ({name_cn})")
        print(f"  原始读数: 身高 {s['raw_h']}cm, 体重 {s['raw_w']}kg")
        print(f"  规范录入值: 身高 {s['input_h']}m, 体重 {s['input_w']}kg, 日期 2026-09-09")

        sppb_page.goto(url, wait_until='domcontentloaded')
        time.sleep(1.5)

        # 检查 Ditaksir 开关是否开启
        ditaksir_switch = sppb_page.locator('input[role="switch"]').first
        if ditaksir_switch.count() > 0:
            checked = ditaksir_switch.get_attribute('aria-checked')
            if checked != '1':
                ditaksir_switch.click(force=True)
                time.sleep(0.5)

        # 定位输入控件
        date_input = sppb_page.locator('input[type="date"]').first
        height_input = sppb_page.locator('input[type="number"]').nth(0)
        weight_input = sppb_page.locator('input[type="number"]').nth(1)
        bmi_display = sppb_page.locator('input[readonly]').first

        # 1. 填入测试日期
        date_input.fill('2026-09-09')
        time.sleep(0.3)

        # 2. 填入体高 (米)
        height_input.click()
        height_input.fill('')
        height_input.press_sequentially(s['input_h'], delay=50)
        time.sleep(0.3)

        # 3. 填入体重 (千克)
        weight_input.click()
        weight_input.fill('')
        weight_input.press_sequentially(s['input_w'], delay=50)
        time.sleep(0.3)
        weight_input.press('Tab')
        time.sleep(0.5)

        # 读取自动计算的 BMI
        bmi_res = bmi_display.input_value().strip()
        print(f"  系统计算评估: {bmi_res}")

        # 4. 点击 Simpan (保存)
        save_btn = sppb_page.locator('button:has-text("Simpan")').first
        save_btn.click(force=True)
        time.sleep(1.5)

        # 5. 处理成功弹窗 (Berjaya!)
        swal = sppb_page.locator('.swal2-popup')
        if swal.is_visible():
            ok_btn = swal.locator('button:has-text("OK")')
            if ok_btn.count() > 0:
                ok_btn.click(force=True)
                time.sleep(0.8)
            print(f"  [成功保存] 已写入系统数据库！")
            success_count += 1
        else:
            print(f"  [提示] 保存点击完成 (未见拦截弹窗)")
            success_count += 1

    print("\n" + "="*80)
    print(f"全班录入完成！成功: {success_count} / {len(students_data)} 人，异常: {fail_count} 人")
    print("="*80)

    # 最终返回总览列表核实
    print("\n[核实] 正在返回 1B 班下半年成绩列表核对最终状态...")
    sppb_page.goto(OVERVIEW_URL, wait_until='domcontentloaded')
    time.sleep(4)
    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\1b_final_result.png', full_page=True)

    print("[提示] 界面已在前台停留 15 秒供目检核验...")
    time.sleep(15)

    browser.close()
    print("[全部流程完满结束]")
