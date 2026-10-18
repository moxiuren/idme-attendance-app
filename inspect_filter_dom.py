# -*- coding: utf-8 -*-
"""
查看 /keputusan/bmi 页面顶部的筛选器结构
严禁 Emoji
"""
from bs4 import BeautifulSoup

with open(r'C:\Users\Admin\Documents\Projects\idme-attendance-app\sppb_step7_bmi_direct.html', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')

print('=== 页面所有带标签或选择的元素 ===')
for form_el in soup.find_all(class_=lambda c: c and ('form-el' in c or 'select' in c or 'input' in c)):
    label = form_el.find('label') or form_el.find(class_=lambda c: c and 'label' in c)
    txt = form_el.get_text(strip=True)
    if any(k in txt.lower() for k in ['sesi', 'aktiviti', 'tahun', 'kelas', 'status']):
        print(f"Tag: {form_el.name} | Class: {form_el.get('class')} | Text: {txt[:50]}")
