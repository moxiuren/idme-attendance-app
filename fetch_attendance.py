# -*- coding: utf-8 -*-
import os
import sys
import json
import requests
from bs4 import BeautifulSoup
import test_auth

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

ic, pw = test_auth.get_credentials()
s = requests.Session()
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Origin': 'https://idme.moe.gov.my',
    'Referer': 'https://idme.moe.gov.my/login',
}

# 1. idMe Login
r1 = s.get('https://idme.moe.gov.my/login', headers=headers)
token1 = BeautifulSoup(r1.text, 'html.parser').find('input', {'name': '_token'})['value']

r2 = s.post('https://idme.moe.gov.my/daftarawam/semakanverification', data={'_token': token1, 'ic': ic}, headers=headers)
token2 = BeautifulSoup(r2.text, 'html.parser').find('input', {'name': '_token'})['value']

headers['Referer'] = r2.url
s.post('https://idme.moe.gov.my/login', data={'_token': token2, 'check': '2', 'ic': ic, 'password': pw}, headers=headers)

# 2. SSO to moeispel
r_app = s.get('https://idme.moe.gov.my/list_aplikasi', headers=headers)
pel_url = BeautifulSoup(r_app.text, 'html.parser').find('a', href=lambda h: h and 'moeispel' in h)['href']
s.get(pel_url, headers=headers)

# 3. Get tabguru page and its CSRF token
headers_pel = {
    'User-Agent': headers['User-Agent'],
    'Referer': 'https://moeispel.moe.gov.my/'
}
r_tab = s.get('https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru', headers=headers_pel)
soup_tab = BeautifulSoup(r_tab.text, 'html.parser')
moeis_token = soup_tab.find('input', {'name': '_token'})['value']
print('[moeispel CSRF Token]:', moeis_token)

# 4. Call ajaxloadkehadiranharian for the class in IDME_CLASS_ID, date 08/09/2026
#    班级 ID 属真实数据、不入库 —— 运行时用环境变量传入，默认值是占位符。
class_id = os.environ.get('IDME_CLASS_ID', '0000000')
ajax_url = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/ajaxloadkehadiranharian'
payload = {
    '_token': moeis_token,
    'id_profile_kelas': class_id,
    'tarikhpilihan': '08/09/2026',
    'draw': '1',
    'start': '0',
    'length': '100'
}
headers_ajax = {
    'User-Agent': headers['User-Agent'],
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': 'https://moeispel.moe.gov.my',
    'Referer': 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru'
}

r_data = s.post(ajax_url, data=payload, headers=headers_ajax)
print('[出勤数据接口状态码]:', r_data.status_code)
try:
    res_json = r_data.json()
    print('[返回 JSON 顶层键]:', list(res_json.keys()))
    print(f"[出勤统计]: 出席 {res_json.get('bilhadir')} 人, 缺席 {res_json.get('biltidakhadir')} 人, 状态: {res_json.get('statushari')}")
    
    students = res_json.get('data', [])
    print(f'[学生总数]: {len(students)} 名学生')
    for i, st in enumerate(students[:5], 1):
        print(f"  [{i}] ID={st.get('id')} / {st.get('id_murid')} | 姓名: {st.get('nama')} | 状态: {st.get('kehadiran')} | 原因: {st.get('sebab')}")
        
    with open('students_sample.json', 'w', encoding='utf-8') as f:
        json.dump(res_json, f, ensure_ascii=False, indent=2)
    print('[已保存样例数据]: students_sample.json')
except Exception as e:
    print('[解析失败]:', e)
    print('Raw response:', r_data.text[:500])
