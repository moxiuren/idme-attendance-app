# -*- coding: utf-8 -*-
"""
登录后通过 CDP 自动上传 1B 和 1D 干预报告至 Google Drive 的 TAHUN 1 文件夹
严禁 Emoji
"""
import sys, os, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

FILE_1B = r"C:\Users\Admin\Downloads\1B Laporan Intervensi BMI 5-9T.docx"
FILE_1D = r"C:\Users\Admin\Downloads\1D Laporan Intervensi BMI 5-9T.docx"

TAHUN1_FOLDER_URL = "https://drive.google.com/drive/folders/11HQY0fPsuD6LnDPOVJ1so_RHRUewleVF"

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    context = browser.contexts[0]
    
    # 找到 Google Drive 页面
    drive_page = None
    for pg in context.pages:
        if 'drive.google.com' in pg.url:
            drive_page = pg
            break

    if not drive_page:
        drive_page = context.pages[0]

    print(f"[CDP 连接] 当前页面: {drive_page.url}")
    if TAHUN1_FOLDER_URL not in drive_page.url:
        print(f"正在导航进入 TAHUN 1 文件夹: {TAHUN1_FOLDER_URL} ...")
        drive_page.goto(TAHUN1_FOLDER_URL, wait_until='domcontentloaded')
        time.sleep(3)

    print("已确认位于 TAHUN 1 文件夹页面！")
    time.sleep(2)

    # 查找 + New 按钮或文件上传输入框
    print("[步骤] 触发文件上传...")
    
    # 尝试找到页面上的 New 按钮 (带 + 号或 New/Baru)
    new_btn = drive_page.locator('button:has-text("New"), button:has-text("Baru"), [aria-label*="New"], [aria-label*="Baru"], div[role="button"]:has-text("New"), div[role="button"]:has-text("Baru")')
    print(f"New 按钮数量: {new_btn.count()}")

    uploaded = False

    # 方案 1: 如果有 file input
    file_input = drive_page.locator('input[type="file"]')
    if file_input.count() > 0:
        print("检测到 file input，正在直接注入上传文件...")
        file_input.first.set_input_files([FILE_1B, FILE_1D])
        uploaded = True
    elif new_btn.count() > 0 and new_btn.first.is_visible():
        print("点击 [+ New] 按钮...")
        new_btn.first.click(force=True)
        time.sleep(1.5)
        
        # 寻找 File upload 选项并触发 file chooser
        with drive_page.expect_file_chooser(timeout=10000) as fc_info:
            upload_opt = drive_page.locator('text="File upload", text="Muat naik fail", [aria-label*="upload"], [aria-label*="fail"]').first
            upload_opt.click(force=True)
        
        file_chooser = fc_info.value
        file_chooser.set_files([FILE_1B, FILE_1D])
        uploaded = True

    if not uploaded:
        # 方案 3: 如果上述方法没触发，通过快捷方式或拖拽
        print("尝试备用快捷上传...")
        # 在 Google Drive 页面上按快捷键 c (Create/New)
        with drive_page.expect_file_chooser(timeout=10000) as fc_info:
            drive_page.keyboard.press("c")
            time.sleep(1)
            drive_page.locator('text="File upload", text="Muat naik fail"').first.click(force=True)
        file_chooser = fc_info.value
        file_chooser.set_files([FILE_1B, FILE_1D])

    print("[上传进行中] 正在上传文件至 Google Drive，等待服务器接收完成...")
    time.sleep(10)

    # 截图看上传状态与通知
    drive_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\gdrive_upload_status.png')

    # 刷新页面验证
    print("刷新 TAHUN 1 页面验证上传结果...")
    drive_page.reload(wait_until='domcontentloaded')
    time.sleep(5)

    files_in_folder = drive_page.evaluate('''() => {
        const rows = Array.from(document.querySelectorAll('[data-id], [role="row"], [role="gridcell"]'));
        const names = [];
        rows.forEach(r => {
            const txt = r.innerText.trim();
            if (txt && (txt.includes('1B') || txt.includes('1D') || txt.includes('Laporan') || txt.includes('.docx'))) {
                names.push(txt.replace(/\\n/g, ' | '));
            }
        });
        return Array.from(new Set(names));
    }''')

    print(f"\n[验证] 当前 TAHUN 1 文件夹中包含的文件列表:")
    for fn in files_in_folder:
        print("  *", fn)

    drive_page.screenshot(path=r'C:\Users\Admin\Documents\Projects\idme-attendance-app\gdrive_tahun1_uploaded_final.png', full_page=True)
    print("\n[完成] 自动上传与核验完毕！")
