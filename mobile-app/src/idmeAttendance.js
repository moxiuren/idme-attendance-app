// idMe 出勤模块：花名册查询 / 三态解析 / 提交 / 重置
import { IdMeError, MOEIS_ORIGIN, AJAX_ACCEPT } from './idmeCore.js';
import { isExcusedCategory, excusedRank } from './sebab.js';
import { monthYearOf } from './utils.js';

/**
 * 官方 #kehadiran 表的列定义（tabguru 页内 DataTable "columns" 配置顺序）。
 * 服务端用 order[0][column] 的下标在这份列表里定位排序字段，
 * 因此必须与官方逐字一致。
 */
const OFFICIAL_COLUMNS = ['bil', 'kehadiran', 'namamurid', 'sebabtidakhadir'];

/** 官方默认排序列：第 2 列 = namamurid（姓名），升序 */
const OFFICIAL_ORDER_COLUMN = '2';

/** 服务端返回的姓名是否已按升序排列（用于校验 order 参数是否被服务端接受） */
function isAscendingByName(students) {
  for (let i = 1; i < students.length; i++) {
    if (String(students[i - 1].name).localeCompare(String(students[i].name), 'ms') > 0) return false;
  }
  return true;
}

export const withAttendance = (Base) => class extends Base {
  // -------------------------------------------------------------- 出勤

  async getAttendance(dateStr) {
    if (!this.isLoggedIn) throw new IdMeError('尚未登录', 'NOT_LOGGED_IN');
    const cls = this.currentClass();
    if (!cls) throw new IdMeError('未获取到负责班级', 'NO_CLASS');

    // ---- 排序参数（与官方页面逐字一致）----
    // 官方 tabguru 页把 #kehadiran 初始化为服务端分页 DataTable：
    //     "serverSide": true, "order": [[2, 'asc']]
    // 并把 order / columns / search 一并 POST 给服务端 —— 即「服务端按姓名排序」。
    // 实测（2026-10-16，31 人班级）：
    //   不带 order  → 服务端默认序（非字母序）：TAN, NUR, AHMAD, SITI, LEE …
    //   带 order=2 asc  → 严格姓名升序：AHMAD, LEE, MUHAMMAD, NUR, SITI …
    //   带 order=2 desc → 与 asc 完全逆序（证明服务端确实在按该参数排序）
    // 且响应里的 `bil` 字段为空串 —— 官方「Bil」只是排序后的行号，
    // 由 DataTable 的 render: meta.row + 1 生成，并非服务端字段。
    const body = {
      _token: this.moeisToken,
      id_profile_kelas: cls.id,
      tarikhpilihan: dateStr,
      draw: '1', start: '0', length: '100',
      'order[0][column]': OFFICIAL_ORDER_COLUMN,
      'order[0][dir]': 'asc',
      'order[0][name]': '',
      'search[value]': '',
      'search[regex]': 'false',
    };
    OFFICIAL_COLUMNS.forEach((data, i) => {
      body[`columns[${i}][data]`] = data;
      body[`columns[${i}][name]`] = '';
      body[`columns[${i}][searchable]`] = 'true';
      body[`columns[${i}][orderable]`] = 'true';
      body[`columns[${i}][search][value]`] = '';
      body[`columns[${i}][search][regex]`] = 'false';
    });

    const resp = await this.request('POST', `${MOEIS_ORIGIN}/sahsiah/kehadiran/ajaxloadkehadiranharian`, body, {
      'X-Requested-With': 'XMLHttpRequest',
      Accept: AJAX_ACCEPT,
      Origin: MOEIS_ORIGIN,
      Referer: `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru`,
    });

    if (this._isSessionLost(resp)) throw new IdMeError('会话已失效', 'SESSION_LOST', true);

    let json = resp.data;
    if (typeof json === 'string') {
      try { json = JSON.parse(json); }
      catch {
        // 非 JSON 响应 = 服务端没有按 DataTable 契约返回。
        // 实测（2026-10-16）：会话中途静默失效时，本接口会返回一整个 HTML 页面
        // （登录页 / 权限页），且**不含** kehadiran 关键字，因此 _isSessionLost 判不出来。
        // 这里标 retryable=true，交由上层「静默重登 + 重试一次」自愈；
        // 绝不在解析失败时伪造空名单 —— 那会让教师以为当天无人可录入。
        throw new IdMeError('出勤数据解析失败', 'PARSE_ERROR', true);
      }
    }

    // ---- 学生状态解析（三态）----
    // 官方口径：bilhadir = 勾选出席数 + 「官方算出席」的请假数。
    // 实测证据（2026-10-16 起）：
    //   10-16 全班居家学习(A0010072)：checked=0 但 bilhadir=31 → 31 人全部算出席
    //   10-02 两人家长通知(D0260001)： checked=28, bilhadir=28 → 差额 0，两人为真缺席
    // 因此不能只用 `checked` 判定出席，否则 PDPR 日会误判「全班缺席」。
    const students = [];
    if (Array.isArray(json?.data)) {
      json.data.forEach((item, idx) => {
        const idP = item.id_individu || '';
        const name = (item.namamurid || item.individu?.nama || '').trim();
        const checked = String(item.kehadiran || '').includes('checked');

        const lap = Array.isArray(item.laporan_takhadir) && item.laporan_takhadir.length
          ? item.laporan_takhadir[0] : null;
        const sebabCode = lap?.id_sebab_thadir || '';
        const kategori = lap?.thadir?.id_kat_thadir || (sebabCode ? sebabCode.charAt(0) : '');
        const sebabName = lap?.thadir?.keterangan || item.sebabtidakhadir || '';
        const hasRecord = !!(lap || item.sebabtidakhadir);

        // 初判：勾选 → 出席；有记录 → 按分类定「算出席 / 缺席」；无记录 → 缺席
        let state;
        if (checked) state = 'present';
        else if (hasRecord) state = isExcusedCategory(kategori) ? 'excused' : 'absent';
        else state = 'absent';

        students.push({
          index: idx + 1,
          id: idP,
          name,
          gender: String(idP).includes('L') ? '男' : '女',
          checked,
          hasRecord,
          sebabCode,
          kategori,
          sebabName,
          state,
        });
      });
    }

    // 兜底排序：万一服务端忽略 order 参数，本地按姓名升序重排，
    // 保证名单顺序与官方页面一致（官方 Bil = 排序后的行号）。
    if (!isAscendingByName(students)) {
      students.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ms'));
    }
    // 序号在排序之后生成，与官方 DataTable 的 `meta.row + 1` 语义一致
    students.forEach((s, i) => { s.index = i + 1; });

    // 服务端计数为权威口径；缺失时回退到本地推算
    const checkedCount = students.filter(s => s.checked).length;
    const bilhadir = Number(json?.bilhadir ?? checkedCount);
    const biltidakhadir = Number(json?.biltidakhadir ?? (students.length - bilhadir));

    // 用服务端 bilhadir 校正「算出席」名额，保证 出席+算出席 === bilhadir
    const quota = Math.max(0, bilhadir - checkedCount);
    const excusedNow = students.filter(s => s.state === 'excused');
    if (excusedNow.length < quota) {
      // 分类判定不足 → 把有记录的真缺席按分类优先级提升为算出席
      students
        .filter(s => s.state === 'absent' && s.hasRecord)
        .sort((a, b) => excusedRank(a.kategori) - excusedRank(b.kategori))
        .slice(0, quota - excusedNow.length)
        .forEach(s => { s.state = 'excused'; });
    } else if (excusedNow.length > quota) {
      // 分类判定过多 → 保留优先级高的，其余降回真缺席
      excusedNow
        .sort((a, b) => excusedRank(a.kategori) - excusedRank(b.kategori))
        .slice(quota)
        .forEach(s => { s.state = 'absent'; });
    }
    students.forEach(s => { s.isPresent = s.state !== 'absent'; });

    // 留一份服务端状态快照，供提交前做一致性护栏与「无改动」判定
    this._snapshot = {
      date: dateStr, classId: cls.id,
      total: students.length, bilhadir, biltidakhadir,
    };

    return {
      bilhadir,
      biltidakhadir,
      statushari: json?.statushari ?? 0,
      isVerified: (json?.rekodSahHadirBulanan || 0) > 0,
      date: dateStr,
      students,
      // 基线：用于判断教师是否真的改过状态（未改动就不必重复提交）
      baseline: Object.fromEntries(
        students.map(s => [s.id, { state: s.state, sebabCode: s.sebabCode }])),
    };
  }

  /**
   * 提交出勤。
   *
   * 契约依据（官方 tabguru 页内 JS）：
   *   data: { _token, rekodtidakhadir, tarikh, kelas, statussimpan }
   *   rekodtidakhadir 是「当天全部未出席名单」——页面加载时从服务端整份回填，
   *   提交时整份发回；不在名单里的学生即视为出席。
   *
   * ★ 因此必须发送全部「非出席」学生（缺席 + 算出席/请假），
   *   只发真缺席会把 PDPR 等请假记录冲掉、被回写成出席。
   *
   * @param {string} dateStr DD/MM/YYYY
   * @param {Array<{id,name,kategori,sebabCode}>} records 全部非出席学生
   * @param {boolean} verify 是否归档（statussimpan=simpansah）
   * @param {{force?:boolean, trueAbsentCount?:number}} opts
   */
  async submitAttendance(dateStr, records = [], verify = true, opts = {}) {
    if (!this.isLoggedIn) throw new IdMeError('尚未登录', 'NOT_LOGGED_IN');
    const cls = this.currentClass();
    if (!cls) throw new IdMeError('未获取到负责班级', 'NO_CLASS');

    // ---- 安全护栏 ----
    // 若要把「全班」标记为真缺席，而服务端快照显示当天并非全班缺席，
    // 说明本地状态解析很可能出错（典型：PDPR 日 kehadiran 无 checked，
    // 但官方把居家学习算作出席）。宁可拒绝提交并报错，也不能把全班误写为缺席。
    const snap = this._snapshot;
    const trueAbsent = Number(opts.trueAbsentCount ?? records.filter(
      r => !isExcusedCategory(r.kategori)).length);
    if (!opts.force && snap && snap.date === dateStr && snap.classId === cls.id
        && trueAbsent > 0 && trueAbsent === snap.total && snap.biltidakhadir < snap.total) {
      // 文案交给 i18n 层组装（detail 携带结构化上下文），此处只给开发者向说明
      throw new IdMeError(
        `安全拦截：拟把全班 ${snap.total} 人标记为「缺席」，但服务端当天仅 ${snap.biltidakhadir} 人缺席`,
        'SAFETY_BLOCK', false,
        { total: snap.total, serverAbsent: snap.biltidakhadir },
      );
    }

    const params = new URLSearchParams();
    params.append('_token', this.moeisToken);
    params.append('tarikh', dateStr);
    params.append('kelas', cls.id);
    params.append('statussimpan', verify ? 'simpansah' : 'simpan');
    records.forEach((st, i) => {
      params.append(`rekodtidakhadir[${i}][idpelajar]`, st.id);
      params.append(`rekodtidakhadir[${i}][namamurid]`, st.name);
      params.append(`rekodtidakhadir[${i}][kategori]`, st.kategori || 'D');
      params.append(`rekodtidakhadir[${i}][sebab]`, st.sebabCode || 'D0260001');
    });

    const resp = await this.request('POST',
      `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru/kemaskiniKehadiranHarian`,
      params.toString(), {
        'X-Requested-With': 'XMLHttpRequest',
        Origin: MOEIS_ORIGIN,
        Referer: `${MOEIS_ORIGIN}/sahsiah/kehadiran/tabguru`,
        'Content-Type': 'application/x-www-form-urlencoded',
      });

    if (this._isSessionLost(resp)) throw new IdMeError('会话已失效', 'SESSION_LOST', true);

    let res = resp.data;
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch { /* 保留原串 */ } }

    // 出勤已变，该日所在月的报表缓存作废（否则月历会显示旧数据）
    const my = monthYearOf(dateStr);
    if (my) {
      this._invalidateMonthReport?.(my.m, my.y);
      // 作废后**立刻后台重新预热** —— 否则教师提交完再点开 Laporan，
      // 又要等一次 2~3 秒的冷加载，与「秒开」的目标相悖。
      this.prefetchMonthlyReport?.(my.m, my.y);
    }

    return {
      success: true,
      absent: records.filter(r => !isExcusedCategory(r.kategori)).length,
      total: records.length,
      data: res,
    };
  }

  /**
   * 重置出勤（官方 Set Semula / setSemulaKehadiran）—— 已按用户决定移除。
   *
   * 移除理由（2026-10-16）：本 App 用「全班标记出席 / PDPR 后重新提交」
   * 即可达到同样的终态，不必为此新增一个破坏性入口。
   * 该接口会清空当天全部记录，误触代价高而收益低。
   * 如确需清空，请在官方网站的 kehadiran/tabguru 页面操作。
   *
   * 报文格式留档（供日后需要时恢复）：
   *   POST /sahsiah/kehadiran/tabguru/setSemulaKehadiran
   *   _token=<moeisToken>&id_profile_kelas=<班级id>&tarikhpilihan=DD/MM/YYYY
   */
};
