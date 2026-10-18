# -*- coding: utf-8 -*-
"""
idMe Attendance Prototype & Protocol Sniffer
针对 idMe (MOEIS) 教师登录与点名接口的探测与分析脚本
"""
import sys
import re
import os
import requests
from bs4 import BeautifulSoup

# 保证控制台 UTF-8 纯文本输出
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

OBSIDIAN_NOTE = r'C:\Users\Admin\Documents\ObsidianVault\01-Projects\20260908-idMe-Attendance-App.md'

def get_credentials():
    if not os.path.exists(OBSIDIAN_NOTE):
        print('[错误] 未找到 Obsidian 项目卡片:', OBSIDIAN_NOTE)
        return None, None
    with open(OBSIDIAN_NOTE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    ic_match = re.search(r'ID Pengguna / No\. KP.*?:[ \t]*([A-Za-z0-9]+)', content)
    pw_match = re.search(r'Kata Laluan.*?:[ \t]*(\S+)', content)
    
    ic = ic_match.group(1).strip() if ic_match else None
    pw = pw_match.group(1).strip() if pw_match else None
    return ic, pw

def inspect_login():
    ic, pw = get_credentials()
    if not ic or not pw:
        print('[待填写] 请先在 Obsidian 笔记中填写测试账号与密码：')
        print('  文件路径:', OBSIDIAN_NOTE)
        return

    print('[信息] 读取到测试账号 IC:', ic[:4] + '****' + ic[-2:] if len(ic) > 6 else '****')
    
    s = requests.Session()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ms;q=0.8',
        'Origin': 'https://idme.moe.gov.my',
        'Referer': 'https://idme.moe.gov.my/login',
    }
    
    print('>> [步骤 1] 访问登录首页获取 CSRF Token 与会话 Cookie...')
    r1 = s.get('https://idme.moe.gov.my/login', headers=headers)
    soup1 = BeautifulSoup(r1.text, 'html.parser')
    token_input = soup1.find('input', {'name': '_token'})
    if not token_input:
        print('[错误] 未在登录页解析到 _token')
        return
    token = token_input['value']
    print('[成功] 获得 _token:', token[:8] + '...')
    
    print('>> [步骤 2] 提交 IC 执行 semakanverification 身份校验...')
    step2_payload = {
        '_token': token,
        'ic': ic
    }
    r2 = s.post('https://idme.moe.gov.my/daftarawam/semakanverification', data=step2_payload, headers=headers)
    print('[返回] 状态码:', r2.status_code, '| 最终 URL:', r2.url)
    
    soup2 = BeautifulSoup(r2.text, 'html.parser')
    alerts = soup2.find_all(class_=lambda c: c and ('alert' in c or 'error' in c or 'toast' in c))
    for a in alerts:
        txt = a.get_text(strip=True)
        if txt:
            print('[系统提示]', txt)
            
    forms = soup2.find_all('form')
    print('[分析] 当前页面表单数量:', len(forms))
    for i, form in enumerate(forms, 1):
        print(f'  [表单 {i}] Action:', form.get('action'), '| Method:', form.get('method'))
        for inp in form.find_all(['input', 'button']):
            print('    - 字段:', inp.get('name'), '| 类型:', inp.get('type'), '| 默认值:', inp.get('value', ''))

if __name__ == '__main__':
    inspect_login()
