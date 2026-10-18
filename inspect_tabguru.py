# -*- coding: utf-8 -*-
import sys
import requests
from bs4 import BeautifulSoup
import test_auth

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

ic, pw = test_auth.get_credentials()
s = requests.Session()
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,ms;q=0.8',
    'Origin': 'https://idme.moe.gov.my',
    'Referer': 'https://idme.moe.gov.my/login',
}

# 1. Login
r1 = s.get('https://idme.moe.gov.my/login', headers=headers)
token1 = BeautifulSoup(r1.text, 'html.parser').find('input', {'name': '_token'})['value']

r2 = s.post('https://idme.moe.gov.my/daftarawam/semakanverification', data={'_token': token1, 'ic': ic}, headers=headers)
soup2 = BeautifulSoup(r2.text, 'html.parser')
token2 = soup2.find('input', {'name': '_token'})['value']

headers['Referer'] = r2.url
login_data = {'_token': token2, 'check': '2', 'ic': ic, 'password': pw}
r3 = s.post('https://idme.moe.gov.my/login', data=login_data, headers=headers)

# 2. Get SSO link to moeispel
r_app = s.get('https://idme.moe.gov.my/list_aplikasi', headers=headers)
pel_url = BeautifulSoup(r_app.text, 'html.parser').find('a', href=lambda h: h and 'moeispel' in h)['href']
print('[SSO 成功获取目标]:', pel_url)

# 3. Enter moeispel
s.get(pel_url, headers=headers)

# 4. Enter tabguru
headers['Referer'] = 'https://moeispel.moe.gov.my/'
r_tab = s.get('https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru', headers=headers)
print('[tabguru 状态码]:', r_tab.status_code)
print('[tabguru 最终 URL]:', r_tab.url)

soup_tab = BeautifulSoup(r_tab.text, 'html.parser')

with open('tabguru_dump.html', 'w', encoding='utf-8') as f:
    f.write(r_tab.text)
print('[已保存 HTML 快照]: tabguru_dump.html')

print('\n=== [表单 (Forms)] ===')
for f in soup_tab.find_all('form'):
    print('  Form Action:', f.get('action'), '| Method:', f.get('method'), '| ID:', f.get('id'))
    for inp in f.find_all(['input', 'select', 'button']):
        print('    - Field:', inp.get('name'), '| ID:', inp.get('id'), '| Tag:', inp.name)

print('\n=== [表格 (Tables)] ===')
for i, t in enumerate(soup_tab.find_all('table'), 1):
    print(f'  Table {i} ID={t.get("id")} Class={t.get("class")}')
    for tr in t.find_all('tr')[:5]:
        row_text = ' | '.join([c.get_text(strip=True) for c in tr.find_all(['th', 'td'])])
        if row_text:
            print('    TR:', row_text)

print('\n=== [关键脚本与 AJAX URL] ===')
for sc in soup_tab.find_all('script'):
    content = sc.string or ''
    for line in content.splitlines():
        line = line.strip()
        if any(k in line.lower() for k in ['url:', 'url :', '$.ajax', 'fetch(', '/sahsiah/', '/kehadiran/']):
            if len(line) < 200:
                print('   JS:', line)
