@echo off
chcp 65001 >nul
title 直达下半年 PBD 录入入口 - idMe / SPPB
echo [正在启动] 正在自动连接 idMe 并打开下半年 PBD 录入界面...
python -X utf8 "%~dp0open_pbd_in_browser.py"
pause
