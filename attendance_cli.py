# -*- coding: utf-8 -*-
"""
idMe 教师快捷点名桌面控制台 (CLI)
严禁使用 Unicode Emoji，符合 Windows 控制台显示规范
"""
import sys
import os
import unicodedata
from datetime import datetime
from idme_client import IdMeClient

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def display_width(text):
    """计算中英文字符在终端中的视觉真实宽度"""
    w = 0
    for ch in text:
        w += 2 if unicodedata.east_asian_width(ch) in ('F', 'W') else 1
    return w

def pad_string(text, width):
    dw = display_width(text)
    if dw >= width:
        return text
    return text + ' ' * (width - dw)

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_banner(class_name, date_str, bilhadir, biltidakhadir):
    print('=' * 66)
    print('       idMe / MOEIS 教师极速点名桌面控制台')
    print('=' * 66)
    print(f' 负责班级: {class_name}')
    print(f' 当前日期: {date_str}')
    status_tag = '[已确认归档]' if bilhadir > 0 or biltidakhadir > 0 else '[尚未录入]'
    print(f' 出勤概况: 出席 {bilhadir} 人 | 缺席 {biltidakhadir} 人   {status_tag}')
    print('-' * 66)

def run():
    print('=' * 66)
    print('       idMe / MOEIS 教师极速点名桌面控制台 (初始化)')
    print('=' * 66)
    
    client = IdMeClient()
    try:
        client.login()
    except Exception as e:
        print(f'\n[错误] 登录失败: {e}')
        print('\n按回车键退出...')
        input()
        return

    if not client.classes:
        print('[错误] 未找到任何负责的班级，请确认账号权限是否为 Guru Kelas')
        input()
        return

    # 默认选择第一个班级
    current_class = client.classes[0]
    current_date = datetime.now().strftime('%d/%m/%Y')
    
    while True:
        try:
            att = client.get_attendance(current_class['id'], current_date)
        except Exception as e:
            print(f'[警告] 拉取出勤状态失败: {e}')
            att = {'bilhadir': 0, 'biltidakhadir': 0, 'students': []}

        clear_screen()
        print_banner(current_class['name'], current_date, att['bilhadir'], att['biltidakhadir'])

        print(' [1] 一键全勤确认提交 (Semua Hadir - 全班全到秒级归档)')
        print(' [2] 登记个别学生缺席并提交 (点选假因: 家长通知/病假单等)')
        print(' [3] 查看全班学生出勤花名册')
        print(' [4] 重置当天出勤记录 (Set Semula)')
        print(' [5] 切换查看其他日期')
        if len(client.classes) > 1:
            print(' [6] 切换负责班级')
        print(' [0] 退出程序')
        print('-' * 66)

        choice = input('>> 请选择操作编号 [0-5]: ').strip()

        if choice == '1':
            total = len(att['students'])
            print(f'\n[提示] 即将把 {current_class["name"]} 全班 {total} 名学生全部标记为出席 (Hadir)')
            confirm = input('>> 确认提交并向教育部系统归档？(Y/N, 默认Y): ').strip().upper()
            if confirm in ('', 'Y', 'YES'):
                try:
                    print('>> 正在提交全勤数据至 MOEIS 服务端...')
                    res = client.submit_attendance(current_class['id'], current_date, absent_list=[], verify=True)
                    print(f'[成功] 出勤记录已归档！出席: {res.get("bilhadir", total)} 人, 缺席: {res.get("biltidakhadir", 0)} 人')
                except Exception as e:
                    print(f'[错误] 提交失败: {e}')
                print('\n按回车键继续...')
                input()

        elif choice == '2':
            students = att['students']
            if not students:
                print('[错误] 当前班级暂无学生数据')
                input()
                continue

            clear_screen()
            print('=' * 66)
            print(f' 登记缺席学生 - {current_class["name"]} ({current_date})')
            print('=' * 66)
            for s in students:
                st_gender = '男' if s['gender'] == 'L' else '女'
                st_status = '[出席]' if s['is_present'] else '[缺席]'
                print(f" {s['index']:2d}. [{st_gender}] {pad_string(s['name'], 32)} {st_status}")
            print('-' * 66)

            st_idx_str = input('>> 请输入缺席学生的序号 (例如 3 或多个用逗号隔开如 2,5, 按回车取消): ').strip()
            if not st_idx_str:
                continue

            try:
                indices = [int(x.strip()) for x in st_idx_str.split(',') if x.strip()]
            except ValueError:
                print('[错误] 输入的序号格式不正确')
                input()
                continue

            reasons = client.get_common_reasons()
            absent_records = []
            for idx in indices:
                target = next((s for s in students if s['index'] == idx), None)
                if not target:
                    print(f'[警告] 未找到序号为 {idx} 的学生，已跳过')
                    continue

                print(f'\n-- 为 [{target["name"]}] 选择缺席原因 --')
                for r_idx, r in enumerate(reasons, 1):
                    print(f'  [{r_idx}] {r["keterangan"]}')
                
                r_choice = input(f'>> 请输入原因编号 [1-{len(reasons)}, 默认1]: ').strip()
                selected_r = reasons[0]
                if r_choice.isdigit() and 1 <= int(r_choice) <= len(reasons):
                    selected_r = reasons[int(r_choice) - 1]

                absent_records.append({
                    'idpelajar': target['id'],
                    'namamurid': target['name'],
                    'kategori': selected_r.get('kategori', 'D'),
                    'sebab': selected_r.get('id_sebab_thadir', 'D0260001')
                })
                print(f'已标记: {target["name"]} -> {selected_r["keterangan"]}')

            if absent_records:
                print(f'\n>> 本次共标记 {len(absent_records)} 名学生缺席，其余学生将默认全员出席。')
                confirm = input('>> 确认提交并向教育部系统归档？(Y/N, 默认Y): ').strip().upper()
                if confirm in ('', 'Y', 'YES'):
                    try:
                        print('>> 正在提交出勤数据至 MOEIS 服务端...')
                        res = client.submit_attendance(current_class['id'], current_date, absent_list=absent_records, verify=True)
                        print(f'[成功] 出勤记录已归档！出席: {res.get("bilhadir")} 人, 缺席: {res.get("biltidakhadir")} 人')
                    except Exception as e:
                        print(f'[错误] 提交失败: {e}')
            print('\n按回车键继续...')
            input()

        elif choice == '3':
            clear_screen()
            print('=' * 66)
            print(f' {current_class["name"]} 学生出勤花名册 ({current_date})')
            print('=' * 66)
            for s in att['students']:
                st_gender = '男' if s['gender'] == 'L' else '女'
                st_status = '[出席]' if s['is_present'] else '[缺席]'
                reason = f"({s['sebab_raw']})" if s['sebab_raw'] else ""
                print(f" {s['index']:2d}. [{st_gender}] {pad_string(s['name'], 32)} {st_status} {reason}")
            print('-' * 66)
            print(f' 汇总: 出席 {att["bilhadir"]} 人 / 缺席 {att["biltidakhadir"]} 人 / 总数 {len(att["students"])} 人')
            print('\n按回车键返回主菜单...')
            input()

        elif choice == '4':
            confirm = input(f'\n>> 警告: 确认重置 {current_date} 的出勤记录吗？(Y/N): ').strip().upper()
            if confirm in ('Y', 'YES'):
                try:
                    client.reset_attendance(current_class['id'], current_date)
                    print('[通过] 当日出勤记录已重置')
                except Exception as e:
                    print(f'[错误] 重置失败: {e}')
                print('\n按回车键继续...')
                input()

        elif choice == '5':
            new_date = input(f'\n>> 请输入目标日期 (格式 DD/MM/YYYY, 当前: {current_date}): ').strip()
            if new_date:
                current_date = new_date

        elif choice == '0':
            print('\n[退出] 感谢使用 idMe 极速点名助手，再见！')
            break

if __name__ == '__main__':
    run()
