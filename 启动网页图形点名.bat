@echo off
chcp 65001 >nul
title idMe 教师可视化点名服务
cd /d "C:\Users\Admin\Documents\Projects\idme-attendance-app"
echo ============================================================
echo   正在启动 idMe 教师点名工作台...
echo   服务地址: http://127.0.0.1:8765
echo ============================================================
start http://127.0.0.1:8765
python -X utf8 server.py
pause
