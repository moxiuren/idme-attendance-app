# -*- coding: utf-8 -*-
"""
idMe 本地可视化点名服务 (桌面端与手机端通用)
"""
import os
import sys
import webbrowser
from datetime import datetime
from flask import Flask, render_template, jsonify, request
from idme_client import IdMeClient

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

app = Flask(__name__)
client = IdMeClient()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/init', methods=['POST'])
def api_init():
    try:
        data = request.json or {}
        ic = data.get('ic')
        pw = data.get('password')
        if not ic or not pw:
            ic, pw = client.load_credentials(interactive=False)
        client.login(ic, pw)
        return jsonify({'success': True, 'classes': client.classes})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/attendance', methods=['GET'])
def api_get_attendance():
    try:
        date_str = request.args.get('date', datetime.now().strftime('%d/%m/%Y'))
        class_id = request.args.get('class_id')
        if not class_id and client.classes:
            class_id = client.classes[0]['id']
        if not class_id:
            return jsonify({'success': False, 'error': '未找到可用班级'}), 400

        data = client.get_attendance(class_id, date_str)
        common_reasons = client.get_common_reasons()
        return jsonify({
            'success': True,
            'class': client.classes[0] if client.classes else {},
            'attendance': data,
            'reasons': common_reasons
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/submit', methods=['POST'])
def api_submit():
    try:
        req = request.json or {}
        class_id = req.get('class_id')
        if not class_id and client.classes:
            class_id = client.classes[0]['id']
        date_str = req.get('date', datetime.now().strftime('%d/%m/%Y'))
        absent_list = req.get('absent_list', [])
        verify = req.get('verify', True)

        res = client.submit_attendance(class_id, date_str, absent_list, verify=verify)
        return jsonify({'success': True, 'result': res})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reset', methods=['POST'])
def api_reset():
    try:
        req = request.json or {}
        class_id = req.get('class_id') or client.classes[0]['id']
        date_str = req.get('date', datetime.now().strftime('%d/%m/%Y'))
        res = client.reset_attendance(class_id, date_str)
        return jsonify({'success': True, 'result': res})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    port = 8765
    print('=' * 66)
    print(f'   idMe 教师极速点名服务已启动: http://127.0.0.1:{port}')
    print('=' * 66)
    app.run(host='0.0.0.0', port=port, debug=False)
