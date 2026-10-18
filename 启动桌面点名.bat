@echo off
chcp 65001 >nul
title idMe 教师极速点名桌面控制台
cd /d "C:\Users\Admin\Documents\Projects\idme-attendance-app"
python -X utf8 attendance_cli.py
pause
