# -*- coding: utf-8 -*-
"""
生成 1D 班 2026 全年体高体重对比表 (精简白底黑字 A4 横向矢量 PDF)
严格对应: 上半年 4 列 (高/重/BMI/Status) + 下半年 4 列 (高/重/BMI/Status)
完全移除 +多少 -多少 的变动列
姓名 100% 对应全校官方正版花名册
严禁 Emoji
"""
import sys, os, csv, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

CSV_1D = r"C:\Users\Admin\Downloads\1D班_2026全年体高与体重总表_官方最新核定版.csv"
OUT_PDF_1D = r"C:\Users\Admin\Downloads\1D班_2026全年体高与体重对比总表.pdf"
HTML_1D = r"C:\Users\Admin\Downloads\1D_annual_table_perfect.html"

rows_1d = []
with open(CSV_1D, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for r in reader:
        rows_1d.append(r)

html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  @page {{
    size: A4 landscape;
    margin: 8mm 10mm 8mm 10mm;
  }}
  body {{
    font-family: Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #000000;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
    font-size: 9.5px;
    line-height: 1.15;
  }}
  .header-box {{
    text-align: center;
    margin-bottom: 5px;
    border-bottom: 1.5px solid #000000;
    padding-bottom: 3px;
  }}
  .title-main {{
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 0.5px;
  }}
  .title-sub {{
    font-size: 11px;
    font-weight: bold;
    margin-top: 2px;
  }}
  .meta-bar {{
    display: flex;
    justify-content: space-between;
    font-size: 9.5px;
    font-weight: bold;
    margin-top: 3px;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
  }}
  th, td {{
    border: 1px solid #000000;
    padding: 2.7px 3px;
    text-align: center;
    vertical-align: middle;
  }}
  th {{
    background-color: #ffffff;
    font-weight: bold;
    font-size: 9px;
  }}
  .th-group {{
    background-color: #f7f7f7;
    font-size: 9.5px;
  }}
  .text-left {{
    text-align: left;
    padding-left: 5px;
  }}
  .font-mono {{
    font-family: "Lucida Console", Monaco, monospace;
    font-size: 9px;
  }}
  .fw-bold {{
    font-weight: bold;
  }}
  .footer-summary {{
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    font-size: 9px;
    font-weight: bold;
    border-top: 1px solid #000000;
    padding-top: 3px;
  }}
</style>
</head>
<body>

<div class="header-box">
  <div class="title-main">SJK (C) PEI HWA, PERLING</div>
  <div class="title-sub">REKOD PERBANDINGAN KETINGGIAN, BERAT BADAN & STATUS BMI (5-9T) TAHUN 2026</div>
  <div class="meta-bar">
    <div>KELAS: 1D (TAHUN SATU D)</div>
    <div>GURU: GAN KAI PIN</div>
    <div>UJIAN 1 (PENGGAL 1): 15/04/2026 &nbsp;|&nbsp; UJIAN 2 (PENGGAL 2): 17/09/2026</div>
    <div>JUMLAH: 31 ORANG</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th rowspan="2" style="width: 3%;">BIL</th>
      <th rowspan="2" style="width: 6%;">NO.DAFTAR</th>
      <th rowspan="2" style="width: 22%;">NAMA MURID (英文全名 - 官方花名册)</th>
      <th rowspan="2" style="width: 6%;">中文名</th>
      <th rowspan="2" style="width: 3%;">JANTINA</th>
      <th colspan="4" class="th-group">PENGGAL 1 (上半年官方记录)</th>
      <th colspan="4" class="th-group">PENGGAL 2 (下半年实测录入)</th>
    </tr>
    <tr>
      <th style="width: 6%;">TINGGI (m)</th>
      <th style="width: 6%;">BERAT (kg)</th>
      <th style="width: 5%;">BMI</th>
      <th style="width: 14%;">STATUS BMI (P1)</th>
      <th style="width: 6%;">TINGGI (m)</th>
      <th style="width: 6%;">BERAT (kg)</th>
      <th style="width: 5%;">BMI</th>
      <th style="width: 14%;">STATUS BMI (P2)</th>
    </tr>
  </thead>
  <tbody>
"""

for r in rows_1d:
    st1 = r['上半年评级']
    st2 = r['下半年评级'].replace(' (正常)', '').replace(' (肥胖)', '').replace(' (超重)', '').replace(' (偏瘦)', '')
    html_content += f"""    <tr>
      <td>{r['序号']}</td>
      <td class="font-mono">{r['学号']}</td>
      <td class="text-left fw-bold">{r['英文姓名']}</td>
      <td>{r['中文名']}</td>
      <td>{r['性别']}</td>
      <td>{r['上半年体高(m)']}</td>
      <td>{r['上半年体重(kg)']}</td>
      <td>{r['上半年BMI']}</td>
      <td>{st1}</td>
      <td class="fw-bold">{r['下半年体高(m)']}</td>
      <td class="fw-bold">{r['下半年体重(kg)']}</td>
      <td class="fw-bold">{r['下半年BMI']}</td>
      <td class="fw-bold">{st2}</td>
    </tr>
"""

html_content += """  </tbody>
</table>

<div class="footer-summary">
  <div>RUMUSAN KELAS 1D: &nbsp; BERAT NORMAL: 25 &nbsp;|&nbsp; BERLEBIHAN BERAT: 4 &nbsp;|&nbsp; KURUS: 2 &nbsp;|&nbsp; OBES: 0</div>
  <div>STATUS SISTEM idMe: TELAH DIHANTAR (SEMAKAN) &nbsp;|&nbsp; DISEDIAKAN OLEH: GAN KAI PIN</div>
</div>

</body>
</html>
"""

with open(HTML_1D, 'w', encoding='utf-8') as f:
    f.write(html_content)

print("[HTML 就绪] 正在渲染 1D 班标准 A4 矢量 PDF...")
TEMP_PROFILE = r"C:\Users\Admin\Documents\Projects\idme-attendance-app\temp_pdf_profile"
with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir=TEMP_PROFILE,
        channel='chrome',
        headless=True
    )
    page_d = context.new_page()
    page_d.goto(f"file:///{os.path.abspath(HTML_1D).replace('\\', '/')}", wait_until='domcontentloaded')
    time.sleep(1)
    page_d.pdf(
        path=OUT_PDF_1D,
        format='A4',
        landscape=True,
        print_background=True,
        margin={'top': '8mm', 'bottom': '8mm', 'left': '10mm', 'right': '10mm'}
    )
    print(f"[1D PDF 导出完成] {OUT_PDF_1D}")
    page_d.close()
    context.close()

print("[全部处理完毕]")
