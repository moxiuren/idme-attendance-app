# -*- coding: utf-8 -*-
"""
在严格保持 1 页 A4 横向的前提下，实现全表全局加粗 (font-weight: bold)
P1 与 P2 统一样式，无视重轻差异，纯净大气
严禁 Emoji
"""
import sys, os, csv, time
import pypdf
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

CLASSES = [
    {
        "code": "1B",
        "class_name": "1B (TAHUN SATU B)",
        "csv_path": r"C:\Users\Admin\Downloads\1B班_2026全年体高与体重总表_官方一致版.csv",
        "out_pdf": r"C:\Users\Admin\Downloads\1B班_2026全年体高与体重对比总表.pdf",
        "html_path": r"C:\Users\Admin\Downloads\1B_clean_annual_table.html",
    },
    {
        "code": "1D",
        "class_name": "1D (TAHUN SATU D)",
        "csv_path": r"C:\Users\Admin\Downloads\1D班_2026全年体高与体重总表_官方最新核定版.csv",
        "out_pdf": r"C:\Users\Admin\Downloads\1D班_2026全年体高与体重对比总表.pdf",
        "html_path": r"C:\Users\Admin\Downloads\1D_clean_annual_table.html",
    }
]

def make_html(cfg, font_size=11.0, cell_pad_v=3.6, status_font_size=9.5):
    rows = []
    with open(cfg['csv_path'], 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    count = len(rows)

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  @page {{
    size: A4 landscape;
    margin: 5mm 6mm 5mm 6mm;
  }}
  * {{
    box-sizing: border-box;
  }}
  body {{
    font-family: Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #000000;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
    font-size: {font_size}px;
    line-height: 1.1;
    font-weight: bold;
  }}
  .header-box {{
    text-align: center;
    margin-bottom: 4px;
    border-bottom: 1.5px solid #000000;
    padding-bottom: 3px;
  }}
  .title-main {{
    font-size: 14.5px;
    font-weight: bold;
    letter-spacing: 0.5px;
  }}
  .title-sub {{
    font-size: 12px;
    font-weight: bold;
    margin-top: 2px;
  }}
  .meta-bar {{
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    font-weight: bold;
    margin-top: 3px;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 3px;
  }}
  th, td {{
    border: 1px solid #000000;
    padding: {cell_pad_v}px 2px;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
    font-weight: bold;
  }}
  th {{
    background-color: #ffffff;
    font-size: {font_size}px;
  }}
  .th-group {{
    background-color: #f2f2f2;
    font-size: {font_size + 0.5}px;
    letter-spacing: 0.5px;
  }}
  .text-left {{
    text-align: left;
    padding-left: 5px;
    white-space: nowrap;
  }}
  .font-mono {{
    font-family: "Lucida Console", Monaco, monospace;
    font-size: {font_size}px;
  }}
  .status-text {{
    font-size: {status_font_size}px;
    letter-spacing: -0.2px;
  }}
</style>
</head>
<body>

<div class="header-box">
  <div class="title-main">SJK (C) PEI HWA, PERLING</div>
  <div class="title-sub">REKOD PERBANDINGAN KETINGGIAN, BERAT BADAN & STATUS BMI (5-9T) TAHUN 2026</div>
  <div class="meta-bar">
    <div>KELAS: {cfg['class_name']}</div>
    <div>JUMLAH: {count} ORANG</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th rowspan="2" style="width: 2.5%;">BIL</th>
      <th rowspan="2" style="width: 5.5%;">NO.DAFTAR</th>
      <th rowspan="2" style="width: 25.5%;">NAMA MURID</th>
      <th rowspan="2" style="width: 6.5%;">中文名</th>
      <th rowspan="2" style="width: 3%;">JANTINA</th>
      <th colspan="4" class="th-group">PENGGAL 1</th>
      <th colspan="4" class="th-group">PENGGAL 2</th>
    </tr>
    <tr>
      <th style="width: 6%;">TINGGI (m)</th>
      <th style="width: 6%;">BERAT (kg)</th>
      <th style="width: 4.5%;">BMI</th>
      <th style="width: 15%;">STATUS BMI (P1)</th>
      <th style="width: 6%;">TINGGI (m)</th>
      <th style="width: 6%;">BERAT (kg)</th>
      <th style="width: 4.5%;">BMI</th>
      <th style="width: 15%;">STATUS BMI (P2)</th>
    </tr>
  </thead>
  <tbody>
"""
    for r in rows:
        st1 = r['上半年评级']
        st2 = r['下半年评级'].replace(' (正常)', '').replace(' (肥胖)', '').replace(' (超重)', '').replace(' (偏重)', '').replace(' (偏瘦)', '').replace(' (MBPK 学习障碍)', ' (MBPK)')
        html += f"""    <tr>
      <td>{r['序号']}</td>
      <td class="font-mono">{r['学号']}</td>
      <td class="text-left">{r['英文姓名']}</td>
      <td>{r['中文名']}</td>
      <td>{r['性别']}</td>
      <td>{r['上半年体高(m)']}</td>
      <td>{r['上半年体重(kg)']}</td>
      <td>{r['上半年BMI']}</td>
      <td class="status-text">{st1}</td>
      <td>{r['下半年体高(m)']}</td>
      <td>{r['下半年体重(kg)']}</td>
      <td>{r['下半年BMI']}</td>
      <td class="status-text">{st2}</td>
    </tr>
"""
    html += """  </tbody>
</table>

</body>
</html>
"""
    with open(cfg['html_path'], 'w', encoding='utf-8') as f:
        f.write(html)
    return cfg['html_path']

def main():
    print("[开始生成] 全局加粗版 1B 与 1D 对比总表 PDF (严格 1 页)...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel='chrome',
            headless=True,
            args=['--disable-blink-features=AutomationControlled']
        )
        for cfg in CLASSES:
            html_file = make_html(cfg, font_size=11.0, cell_pad_v=3.6, status_font_size=9.5)
            page = browser.new_page()
            page.goto(f"file:///{os.path.abspath(html_file).replace('\\', '/')}", wait_until='domcontentloaded')
            time.sleep(0.5)
            page.pdf(
                path=cfg['out_pdf'],
                format='A4',
                landscape=True,
                print_background=True,
                margin={'top': '5mm', 'bottom': '5mm', 'left': '6mm', 'right': '6mm'}
            )
            print(f"[已生成] {cfg['out_pdf']}")
            page.close()
        browser.close()

    # 检验页数
    for cfg in CLASSES:
        reader = pypdf.PdfReader(cfg['out_pdf'])
        print(f"验证页数 [{cfg['code']}]: {len(reader.pages)} 页")

if __name__ == '__main__':
    main()
