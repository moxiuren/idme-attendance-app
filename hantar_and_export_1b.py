# -*- coding: utf-8 -*-
"""
前台执行 1B 班 Hantar (正式提交) 并验证报表中心解锁与导出
严禁 Emoji
"""
import sys, os, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

ENTRY_1B_URL = "https://moeissppb.moe.gov.my/keputusan/bmi/1000003"
LAPORAN_BMI_URL = "https://moeissppb.moe.gov.my/laporan/segak/individu-skor-bmi"
DOWNLOAD_DIR = r"C:\Users\Admin\Downloads"

with sync_playwright() as p:
    print("[CDP 连接] 正在接管前台运行的 Chrome 浏览器...")
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    context = browser.contexts[0]
    
    sppb_page = None
    for pg in context.pages:
        if 'moeissppb.moe.gov.my' in pg.url and not pg.url.startswith('chrome'):
            sppb_page = pg
            break

    if not sppb_page:
        # 如果当前没有活着的 SPPB tab，在可用 tab 上打开
        for pg in context.pages:
            if 'idme.moe.gov.my' in pg.url:
                sppb_page = pg
                break
        if not sppb_page and context.pages:
            sppb_page = context.pages[0]

    print(f"[接管成功] 当前控制 Tab: {sppb_page.url}")
    print(f"[步骤 1] 正在进入 1B 班录入总览列表: {ENTRY_1B_URL} ...")
    sppb_page.goto(ENTRY_1B_URL, wait_until='domcontentloaded')
    time.sleep(3)

    # 1. 核对 30 位学生是否全绿
    badges = sppb_page.locator('.w-table__cell .w-tag, .w-table__cell div:has-text("DITAKSIR")').all_inner_texts()
    ditaksir_count = sum(1 for b in badges if 'DITAKSIR' in b and 'BELUM' not in b)
    print(f"[状态核验] 1B 班已完成评估人数: {ditaksir_count} / 30")

    # 截图核对
    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\1b_pre_hantar.png', full_page=True)

    # 2. 点击右下角 Hantar 按钮
    print("\n[步骤 2] 正在点击右下角 [Hantar] 提交按钮...")
    hantar_btn = sppb_page.locator('button:has-text("Hantar")').first
    hantar_btn.click(force=True)
    time.sleep(1.5)

    # 3. 处理弹窗确认 (Adakah anda pasti?)
    swal = sppb_page.locator('.swal2-popup')
    if swal.is_visible():
        dialog_text = swal.inner_text().replace('\n', ' ')
        print(f"[提交确认弹窗] {dialog_text}")
        
        # 点击确认按钮 (通常为 Ya, Hantar 或 OK / Confirm)
        confirm_btn = swal.locator('.swal2-confirm, button:has-text("Ya"), button:has-text("Hantar"), button:has-text("OK")').first
        if confirm_btn.count() > 0:
            print("正在点击确认提交...")
            confirm_btn.click(force=True)
            time.sleep(2)

    # 再次检查是否有提交成功的提示弹窗
    swal2 = sppb_page.locator('.swal2-popup')
    if swal2.is_visible():
        success_text = swal2.inner_text().replace('\n', ' ')
        print(f"[系统提示] {success_text}")
        ok_btn = swal2.locator('.swal2-confirm, button:has-text("OK")').first
        if ok_btn.count() > 0:
            ok_btn.click(force=True)
            time.sleep(1)

    # 4. 截图核查提交后的列表状态
    time.sleep(3)
    print(f"\n[步骤 3] 提交后当前页面 URL: {sppb_page.url}")
    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\1b_post_hantar.png', full_page=True)

    # 5. 前往报表中心验证是否解锁导出
    print(f"\n[步骤 4] 正在前往报表中心验证是否已解锁下半年报告导出: {LAPORAN_BMI_URL} ...")
    sppb_page.goto(LAPORAN_BMI_URL, wait_until='domcontentloaded')
    time.sleep(4)

    table = sppb_page.locator('table').first
    rows = table.locator('tr').all_inner_texts()
    print("报表中心最新列表条目:")
    for r in rows:
        print(" ", r.replace('\n', ' | '))

    sppb_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\1b_laporan_unlocked.png', full_page=True)

    # 检查是否有 1B 班下半年条目
    target_row = None
    for tr in table.locator('tr').all():
        t = tr.inner_text()
        if 'KEDUA' in t and 'B' in t:
            target_row = tr
            break

    if target_row:
        print("\n[成功解锁！] 检测到 1B 班下半年 (KEDUA) 报表已成功生成入库！")
        # 查找进入该班报表的链接
        link = target_row.locator('a').first
        if link.count() > 0:
            report_url = link.get_attribute('href')
            print(f"正在进入 1B 班下半年完整报告页面: {report_url} ...")
            sppb_page.goto(report_url, wait_until='domcontentloaded')
            time.sleep(3)

            # 点击 Cetak 按钮捕获打印报告
            cetak_btn = sppb_page.locator('button:has-text("Cetak")').first
            if cetak_btn.count() > 0 and cetak_btn.is_visible():
                print("点击 [Cetak] 打开官方完整个人报告打印视图...")
                with context.expect_page() as popup_info:
                    cetak_btn.click(force=True)
                
                popup_page = popup_info.value
                popup_page.wait_for_load_state('domcontentloaded')
                time.sleep(5)
                print(f"报告打印视图 URL: {popup_page.url}")

                # 导出矢量 PDF
                out_pdf = os.path.join(DOWNLOAD_DIR, "1B班_下半年_官方完整BMI个人报告.pdf")
                print(f"正在保存官方矢量 PDF: {out_pdf} ...")
                popup_page.pdf(
                    path=out_pdf,
                    format='A4',
                    print_background=True,
                    margin={'top': '10mm', 'bottom': '10mm', 'left': '10mm', 'right': '10mm'}
                )
                print(f"[大功告成] 1B 班下半年官方完整个人报告已导出至: {out_pdf}")
                popup_page.close()
    else:
        print("\n[观察] 报表中心暂未直接展示 KEDUA 行，尝试进行筛选联动检索...")

    print("\n[提示] 操作已前台执行完毕，浏览器继续保持常驻！")
