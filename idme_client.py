# -*- coding: utf-8 -*-
"""
idMe Attendance Client Engine
严禁包含 Emoji，符合 Windows 控制台纯文本规范
"""
import os
import sys
import json
import re
import getpass
import requests
from bs4 import BeautifulSoup

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(PROJECT_DIR, 'credentials.json')
OBSIDIAN_NOTE = r'C:\Users\Admin\Documents\ObsidianVault\01-Projects\20260908-idMe-Attendance-App.md'

class IdMeClient:
    def __init__(self):
        self.session = requests.Session()
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,ms;q=0.8',
            'Origin': 'https://idme.moe.gov.my',
            'Referer': 'https://idme.moe.gov.my/login',
        }
        self.moeis_token = None
        self.classes = []
        self.sebab_dict = self._load_sebab_dict()
        self.current_ic = None
        self.current_pw = None

    def _load_sebab_dict(self):
        dict_path = os.path.join(PROJECT_DIR, 'sebab_dictionary.json')
        if os.path.exists(dict_path):
            with open(dict_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []

    def get_common_reasons(self):
        """返回常用缺勤理由 (前5类最常用)"""
        common_ids = ['D0260001', 'D0260030', 'D0010075', 'B0010073', 'N0010024']
        res = []
        for s in self.sebab_dict:
            if s.get('id_sebab_thadir') in common_ids:
                res.append(s)
        # 如果字典没找到特定ID，补充默认基础项
        if not res:
            res = [
                {'id_sebab_thadir': 'D0260001', 'kategori': 'D', 'keterangan': 'MAKLUMAN IBU BAPA PENJAGA (家长通知)'},
                {'id_sebab_thadir': 'D0260030', 'kategori': 'D', 'keterangan': 'SURAT CUTI SAKIT HOSPITAL/KLINIK (病假单)'},
                {'id_sebab_thadir': 'D0010075', 'kategori': 'D', 'keterangan': 'DEMAM (发烧)'},
                {'id_sebab_thadir': 'B0010073', 'kategori': 'B', 'keterangan': 'WAKIL SEKOLAH (代表学校)'},
                {'id_sebab_thadir': 'N0010024', 'kategori': 'N', 'keterangan': 'TIADA MAKLUMAT/SEBAB/KENYATAAN (旷课)'}
            ]
        return res

    def load_credentials(self, interactive=True):
        ic, pw = None, None
        
        # 1. 优先读取本地 credentials.json
        if os.path.exists(CREDENTIALS_FILE):
            try:
                with open(CREDENTIALS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    ic = data.get('ic')
                    pw = data.get('password')
            except Exception:
                pass

        # 2. 从 Obsidian 项目卡片读取
        if (not ic or not pw) and os.path.exists(OBSIDIAN_NOTE):
            try:
                with open(OBSIDIAN_NOTE, 'r', encoding='utf-8') as f:
                    content = f.read()
                ic_match = re.search(r'ID Pengguna / No\. KP.*?:[ \t]*([A-Za-z0-9]+)', content)
                pw_match = re.search(r'Kata Laluan.*?:[ \t]*(\S+)', content)
                if ic_match:
                    ic = ic or ic_match.group(1).strip()
                if pw_match:
                    raw_pw = pw_match.group(1).strip()
                    if raw_pw and not raw_pw.startswith('[') and '<' not in raw_pw:
                        pw = pw or raw_pw
            except Exception:
                pass

        # 3. 交互式输入兜底
        if not ic and interactive:
            print('>> 请输入 idMe 身份证号 (No. KP): ', end='', flush=True)
            ic = input().strip()
        if not pw and interactive:
            print('>> 请输入 idMe 密码 (输入时不回显): ', end='', flush=True)
            pw = getpass.getpass('').strip()

        if not ic or not pw:
            raise ValueError('[错误] 账号或密码为空，无法执行登录')

        self.current_ic = ic
        self.current_pw = pw
        return ic, pw

    def save_credentials(self, ic, pw):
        try:
            with open(CREDENTIALS_FILE, 'w', encoding='utf-8') as f:
                json.dump({'ic': ic, 'password': pw}, f, indent=2)
            print('[已保存] 账号凭据已安全缓存于本地配置文件')
        except Exception as e:
            print('[警告] 凭据保存失败:', e)

    def login(self, ic=None, pw=None):
        if not ic or not pw:
            ic, pw = self.load_credentials()

        print('[步骤 1/4] 连接 idMe 登录入口...')
        r1 = self.session.get('https://idme.moe.gov.my/login', headers=self.headers)
        soup1 = BeautifulSoup(r1.text, 'html.parser')
        token_input = soup1.find('input', {'name': '_token'})
        if not token_input:
            raise RuntimeError('[错误] 无法获取主登录页 CSRF Token')
        token1 = token_input['value']

        print('[步骤 2/4] 验证身份证号有效性...')
        r2 = self.session.post('https://idme.moe.gov.my/daftarawam/semakanverification',
                               data={'_token': token1, 'ic': ic},
                               headers=self.headers)
        soup2 = BeautifulSoup(r2.text, 'html.parser')
        form2 = soup2.find('form')
        if not form2:
            alert = soup2.find(class_=lambda c: c and 'alert' in c)
            err_msg = alert.get_text(strip=True) if alert else '未知校验错误'
            raise RuntimeError(f'[错误] 身份证校验未通过: {err_msg}')
        token2 = soup2.find('input', {'name': '_token'})['value']

        print('[步骤 3/4] 验证密码并建立安全会话...')
        self.headers['Referer'] = r2.url
        login_data = {'_token': token2, 'check': '2', 'ic': ic, 'password': pw}
        r3 = self.session.post('https://idme.moe.gov.my/login', data=login_data, headers=self.headers)
        soup3 = BeautifulSoup(r3.text, 'html.parser')
        if 'login' in r3.url and 'home' not in r3.url:
            alert = soup3.find(class_=lambda c: c and 'alert' in c)
            err = alert.get_text(strip=True) if alert else '身份证与密码不匹配'
            raise RuntimeError(f'[错误] 登录失败: {err}')

        # 登录成功，记忆凭据
        self.save_credentials(ic, pw)

        print('[步骤 4/4] 执行 SSO 握手直达 Pengurusan Murid (MOEIS)...')
        self.headers['Referer'] = r3.url
        r_app = self.session.get('https://idme.moe.gov.my/list_aplikasi', headers=self.headers)
        soup_app = BeautifulSoup(r_app.text, 'html.parser')
        pel_a = soup_app.find('a', href=lambda h: h and 'moeispel' in h)
        if not pel_a:
            raise RuntimeError('[错误] 门户应用列表中未找到 Pengurusan Murid')
        pel_url = pel_a['href']

        # 激活子域 Session
        self.session.get(pel_url, headers=self.headers)

        # 访问出勤主页
        headers_pel = {
            'User-Agent': self.headers['User-Agent'],
            'Referer': 'https://moeispel.moe.gov.my/'
        }
        r_tab = self.session.get('https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru', headers=headers_pel)
        soup_tab = BeautifulSoup(r_tab.text, 'html.parser')
        token_elem = soup_tab.find('input', {'name': '_token'})
        if not token_elem:
            raise RuntimeError('[错误] 无法获取 moeispel 出勤页面 CSRF Token')
        self.moeis_token = token_elem['value']

        # 提取班级
        sel = soup_tab.find('select', {'id': 'txtNamakelas'})
        self.classes = []
        if sel:
            for opt in sel.find_all('option'):
                v = opt.get('value', '').strip()
                t = opt.get_text(strip=True)
                if v and 'pilih' not in t.lower():
                    # 格式化班级名称
                    clean_name = ' '.join(t.split())
                    self.classes.append({'id': v, 'name': clean_name})

        class_names = ', '.join([c['name'] for c in self.classes])
        print(f'[通过] 登录成功！当前负责班级: {class_names}')
        return True

    def get_attendance(self, class_id, date_str):
        ajax_url = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/ajaxloadkehadiranharian'
        payload = {
            '_token': self.moeis_token,
            'id_profile_kelas': str(class_id),
            'tarikhpilihan': date_str,
            'draw': '1',
            'start': '0',
            'length': '100'
        }
        headers_ajax = {
            'User-Agent': self.headers['User-Agent'],
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://moeispel.moe.gov.my',
            'Referer': 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru'
        }
        r = self.session.post(ajax_url, data=payload, headers=headers_ajax)
        if r.status_code != 200:
            raise RuntimeError(f'[错误] 查询出勤数据失败 HTTP {r.status_code}')
        res = r.json()

        raw_students = res.get('data', [])
        cleaned_students = []
        for idx, s in enumerate(raw_students, 1):
            id_p = s.get('id_individu')
            nama = s.get('namamurid') or s.get('individu', {}).get('nama', '')
            kehadiran_html = s.get('kehadiran', '')
            is_present = 'checked' in kehadiran_html
            gender = 'L' if 'L' in id_p else 'P'
            
            cleaned_students.append({
                'index': idx,
                'id': id_p,
                'name': nama,
                'gender': gender,
                'is_present': is_present,
                'sebab_raw': s.get('sebabtidakhadir', '')
            })

        return {
            'bilhadir': res.get('bilhadir', 0),
            'biltidakhadir': res.get('biltidakhadir', 0),
            'statushari': res.get('statushari', 0),
            'tarikhpilihan': res.get('tarikhpilihan', date_str),
            'students': cleaned_students
        }

    def submit_attendance(self, class_id, date_str, absent_list=None, verify=True):
        if absent_list is None:
            absent_list = []
            
        url = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru/kemaskiniKehadiranHarian'
        payload = {
            '_token': self.moeis_token,
            'tarikh': date_str,
            'kelas': str(class_id),
            'statussimpan': 'simpansah' if verify else 'simpan'
        }
        
        headers_ajax = {
            'User-Agent': self.headers['User-Agent'],
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://moeispel.moe.gov.my',
            'Referer': 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru'
        }
        
        post_data = payload.copy()
        for idx, rec in enumerate(absent_list):
            post_data[f'rekodtidakhadir[{idx}][idpelajar]'] = rec['idpelajar']
            post_data[f'rekodtidakhadir[{idx}][namamurid]'] = rec['namamurid']
            post_data[f'rekodtidakhadir[{idx}][kategori]'] = rec['kategori']
            post_data[f'rekodtidakhadir[{idx}][sebab]'] = rec['sebab']

        r = self.session.post(url, data=post_data, headers=headers_ajax)
        if r.status_code != 200:
            raise RuntimeError(f'[错误] 提交出勤接口响应异常 HTTP {r.status_code}')
        return r.json()

    def reset_attendance(self, class_id, date_str):
        url = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru/setSemulaKehadiran'
        payload = {
            '_token': self.moeis_token,
            'id_profile_kelas': str(class_id),
            'tarikhpilihan': date_str
        }
        headers_ajax = {
            'User-Agent': self.headers['User-Agent'],
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://moeispel.moe.gov.my',
            'Referer': 'https://moeispel.moe.gov.my/sahsiah/kehadiran/tabguru'
        }
        r = self.session.post(url, data=payload, headers=headers_ajax)
        return r.json()
