/**
 * 出勤域状态与操作（本 App 的核心逻辑）。
 *
 * 职责：花名册加载、三态本地改写、提交归档、日期导航、提示条、假因抽屉目标。
 * 不负责：登录与凭据（留在 App.vue）、界面渲染（各 .vue 组件）。
 *
 * 依赖注入（避免本模块反向依赖认证逻辑，形成循环）：
 *   relogin()     —— 会话失效时执行静默重登
 *   selection     —— useSelection() 实例（批量选择状态）
 *   ask(opts)     —— Promise 化确认对话框（useConfirm），替代原生 confirm
 */
import { ref, computed, watch } from 'vue';
import { idme, IdMeError } from '../idmeService.js';
import {
  getSebabByCode, isExcusedCategory, DEFAULT_SEBAB, PDPR_SEBAB,
} from '../sebab.js';
import { t, lang } from '../i18n.js';
import { todayStr, shiftDateStr, dateNum, formatPercent } from '../utils.js';
import { errText } from '../errors.js';
import {
  snapshotOf, saveDraft, loadDraft, clearDraft, applyDraft,
} from '../draft.js';

const WEEKDAYS = {
  ms: ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'],
  zh: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
};

export function useAttendance({ relogin, selection, ask }) {
  const { selectMode, selectedIds, selCount, exit: exitSelect } = selection;

  // ---------------------------------------------------------------- 状态
  const busy = ref(false);
  const online = ref(false);
  const notice = ref(null);
  const students = ref([]);
  const currentDate = ref(todayStr());   // DD/MM/YYYY
  const isVerified = ref(false);
  const baseline = ref(null);            // 载入时的服务端状态，用于「无改动」判定
  const reasonTarget = ref(null);        // { ids: string[], batch: boolean }
  const statushari = ref(0);             // 官方当天状态：1 不允许录入 / 2 学期假 / 3 特别假
  const today = ref(todayStr());         // 每次加载刷新，避免跨零点后「未来日期」判断过期
  const restoredFromDraft = ref(false);  // 本次加载是否从草稿恢复过（横幅提示用）

  // ---------------------------------------------------------------- 计算
  const bilAbsen = computed(() => students.value.filter(s => s.state === 'absent').length);
  const bilExcused = computed(() => students.value.filter(s => s.state === 'excused').length);
  /** 官方口径：出席 = 勾选出席 + 官方算出席的请假 */
  const bilHadir = computed(() => students.value.length - bilAbsen.value);
  const pending = computed(() => bilAbsen.value + bilExcused.value);
  // 满 100 显示「100」，低于 100 才带一位小数（见 utils.formatPercent）
  const attendanceRate = computed(() => {
    if (!students.value.length) return formatPercent(100);
    return formatPercent((bilHadir.value / students.value.length) * 100);
  });
  const allIds = computed(() => students.value.map(s => s.id));

  const dateDisplay = computed(() => {
    if (!currentDate.value) return '—';
    const [d, m, y] = currentDate.value.split('/');
    const dt = new Date(`${y}-${m}-${d}`);
    const name = isNaN(dt.getTime()) ? '' : (WEEKDAYS[lang.value] || WEEKDAYS.ms)[dt.getDay()];
    return `${y}-${m}-${d} ${name}`;
  });

  /** 与服务端基线相比是否有改动（未改动就不必重复提交） */
  const changed = computed(() => {
    const b = baseline.value;
    if (!b) return true;
    return students.value.some(s => {
      const o = b[s.id];
      return !o || o.state !== s.state || o.sebabCode !== s.sebabCode;
    });
  });

  // ---------------------------------------------------------------- 只读判定
  /**
   * 所选日期晚于今天。
   *
   * 依据（2026-10-16 从官网 tabguru 页原文核实）：
   *   $('#tkh_HH').datetimepicker({ minDate: $('#sebulan').val(), maxDate: new Date(), … })
   * 官方日期选择器把上限钉在**今天**，未来日期在官网界面里根本选不到；
   * 而提交函数 kemaskini() 本身**不做任何日期校验** —— 官方对「未来日期」的封锁
   * 纯粹是前端的。
   *
   * 本 App 的处理：**在导航层就锁死**（见 canGoNext / shiftDate），未来日期根本
   * 到不了，因此不需要任何说明文案。这里的 isFuture 只是兜底 —— 万一日后新增
   * 了别的入口直接载入某天，也不会往一个还没到来的日子写进出勤记录。
   */
  const isFuture = computed(() => {
    const n = dateNum(currentDate.value);
    const tn = dateNum(today.value);
    if (Number.isNaN(n) || Number.isNaN(tn)) return false;   // 判断不了就不锁
    return n > tn;
  });

  /**
   * 还能往后翻一天吗？已到今天就不能 —— 「下一天」箭头随之置灰。
   * 这是防未来日期的**主**手段（用户 2026-10-16 定稿：过不去就行，不必解释）。
   */
  const canGoNext = computed(() => {
    const n = dateNum(currentDate.value);
    const tn = dateNum(today.value);
    if (Number.isNaN(n) || Number.isNaN(tn)) return true;
    return n < tn;
  });

  /**
   * 服务端声明当天不可录入。
   *
   * 实测（2026-10-16，见 tools/probe-date-range.mjs）它同时覆盖了所有「非上课日」：
   *   周六 17/10、周日 18/10   → 1（周休 Cuti Mingguan）
   *   16/09（马来西亚日）      → 1（Cuti Umum 公共假期）
   *   25/09                    → 3（Cuti Sekolah/Peristiwa）
   *   30/09、16/10（上课日）   → 0
   * 因此**不必本地算星期**，也不必去查月报表的假期图例 —— 一个判据全覆盖。
   * 用 >= 1 而非枚举 1/2/3，官方日后新增状态码也能自动归入「不可录入」。
   */
  const notRecordable = computed(() => statushari.value >= 1);

  /**
   * 只读：禁止任何写入（PDPR 与提交按钮一并停用）。
   * 注意 isFuture 在这里是**静默**的（见下 readOnlyReason）—— 未来日期已被导航层
   * 挡住，属于不可达状态，无需向用户解释。
   */
  const readOnly = computed(() => isFuture.value || notRecordable.value);

  /** 只读原因（面向用户的整句文案）；空串表示「可写，或无需解释」 */
  const readOnlyReason = computed(() => {
    if (statushari.value === 2) return t('holiday');
    if (statushari.value === 3) return t('holidayEvent');
    if (statushari.value >= 1) return t('notRecordable');   // 1 及未知状态码
    return '';
  });

  /**
   * 服务端对「可录入窗口之外」的日期返回**空名单**，而不是报错。
   *
   * 实测（2026-10-16，见 tools/probe-date-range.mjs）：
   *   01/12/2025 → 0 人   statushari=0
   *   05/01/2026 → 0 人   statushari=0
   *   12/01/2026 → 31 人  statushari=0   ← 官方 minDate（#sebulan）当天
   * 也就是说下界**不会**通过 statushari 暴露，只能靠「名单为空」识别。
   */
  const emptyRoster = computed(() => online.value && students.value.length === 0);

  /**
   * 常驻横幅文案（空串 = 不显示）。
   * 只读原因优先；其次是空名单 —— 两者都要一直挂在屏幕上，
   * 因为按钮此时是停用的，理由不能 4 秒后消失。
   */
  const bannerText = computed(() => readOnlyReason.value
    || (emptyRoster.value ? t('noRoster') : '')
    || (restoredFromDraft.value ? t('draftRestored') : ''));

  /**
   * 是否显示日期栏的「TELAH DISAHKAN / MENUNGGU PENGESAHAN」徽章。
   *
   * 非上课日（周休 / 公共假期 / 学期假 / 特别假）当天本就没有出勤可确认，
   * 挂一个「等待确认」纯属误导 —— 2026-10-17 用户指出（SABTU / AHAD / 假期）。
   * 判据直接复用 notRecordable（= 服务端 statushari >= 1），
   * 名单为空时同理（没有可确认的对象）。
   */
  const showStatusTag = computed(() => !notRecordable.value && !emptyRoster.value);

  // ---------------------------------------------------------------- 工具
  function notify(text, type = 'alert-blue') {
    notice.value = { text, type };
    if (type !== 'alert-red') setTimeout(() => { notice.value = null; }, 4000);
  }

  /**
   * 编辑版本号：每次「教师改了某个学生的三态」就 +1。
   *
   * 为什么需要它 —— 草稿自动保存原先用 `watch(students, {deep: true})`，
   * 而 deep watch 的代价是**每次学生对象任何字段变动都全量递归比对**：
   * 31 人 × 每次写入 6 个字段，Vue 要把整棵对象树逐层 traverse 一遍才判定
   * 「确实变了」。改一行状态就付一次全量遍历，批量操作（全班 PDPR）更是一次改
   * 31 个对象。而这个 watch 的作用其实只有一个：知道「教师编辑过了」。
   *
   * 版本号把「是否编辑过」变成 O(1) 的信号，与数据规模无关。
   * 前提是**所有编辑都必须经过 applyState** —— 已核对：
   *   applyAllPdpr / pickReason / markPresent / markSelectedPresent 四处全走它，
   *   加载路径（students.value 整体替换、applyDraft 恢复草稿）不经过它，
   *   因此加载不会被误判成编辑。
   */
  const editVersion = ref(0);

  /** 一次性写入学生三态（含假因），避免各处重复赋值漏字段 */
  function applyState(st, state, sebab = null) {
    st.state = state;
    st.isPresent = state !== 'absent';
    st.sebabCode = sebab?.code || '';
    st.sebabName = sebab?.name || '';
    st.kategori = sebab?.kategori || '';
    editVersion.value++;
  }

  // ---------------------------------------------------------------- 加载
  async function loadAttendance(dateStr, retried = false) {
    busy.value = true;
    try {
      const res = await idme.getAttendance(dateStr);
      students.value = res.students.map(s => ({ ...s }));
      baseline.value = res.baseline;
      isVerified.value = res.isVerified;
      currentDate.value = dateStr;
      statushari.value = Number(res.statushari) || 0;
      today.value = todayStr();
      online.value = true;
      restoredFromDraft.value = false;

      // ---- 恢复未提交草稿 ----
      // 只在「该日期可录入」时恢复：假期 / 未来日期本来就不该有草稿，
      // 万一有（比如教师跨零点后停留），恢复出来也提交不了，反而误导。
      // diff === 0 说明草稿与服务端已一致（多半是提交成功后没清干净），
      // 此时静默丢弃，不打扰教师。
      const cls = idme.currentClass();
      if (!readOnly.value && cls) {
        const draft = await loadDraft(dateStr, cls.id);
        if (draft) {
          const r = applyDraft(students.value, draft);
          if (r.diff > 0) restoredFromDraft.value = true;
          else await clearDraft(dateStr, cls.id);
        }
      }

      // 换日期 / 换班级后，旧的勾选与抽屉一律作废
      exitSelect();
      reasonTarget.value = null;

      // 不可录入的几种情况（未来日期 / 学期假 / 特别假 / 官方不允许）
      // 不再走会 4 秒后自动消失的 notice —— 按钮被停用了，理由必须一直挂在屏幕上，
      // 否则教师只看到一个按不动的按钮却不知道原因。改由 App.vue 的常驻横幅呈现
      // readOnlyReason。
      notice.value = null;
    } catch (err) {
      // 两类错误都可能是「会话在本次请求途中静默失效」造成的，先自愈一次：
      //  - SESSION_LOST：服务端明确回了登录页/401/302
      //  - PARSE_ERROR ：服务端回了 HTML 而非 DataTable JSON（实测会发生在会话掉线时）
      // 只重试一次（retried），避免陷入死循环；重试后仍失败才向教师报错。
      const sessionLike = err instanceof IdMeError
        && (err.code === 'SESSION_LOST' || err.code === 'PARSE_ERROR');
      if (sessionLike && !retried) {
        try {
          await relogin();
          online.value = true;
          busy.value = false;
          return loadAttendance(dateStr, true);
        } catch (e2) {
          notify(t('reloginFail', { msg: errText(e2) }), 'alert-red');
        }
      }
      online.value = false;
      notify(t('syncFail', { msg: errText(err) }), 'alert-red');
    } finally {
      busy.value = false;
    }
  }

  // ---------------------------------------------------------------- 草稿自动保存
  /**
   * 学生三态一改就落盘（300ms 防抖）。
   *
   * 为什么不是「退出时保存」：Android 回收 WebView 进程时不会给任何回调，
   * onUnmounted / beforeunload 都靠不住。只有「改完立刻写」才真的救得了数据。
   *
   * 只在 changed 为 true 时写：与服务端一致的名单没有保存价值，
   * 写了反而会在下次进入时弹一条「已恢复草稿」的假提示。
   */
  let draftTimer = null;
  // 监听 editVersion 而非 deep-watch students：见 applyState 上方说明。
  // 只有在 applyState 真的改过状态后才触发，加载 / 恢复草稿都不会误触发。
  watch(editVersion, () => {
    clearTimeout(draftTimer);
    if (!students.value.length || !changed.value) return;
    const date = currentDate.value;
    const cls = idme.currentClass();
    if (!cls) return;
    draftTimer = setTimeout(() => {
      saveDraft({
        date, classId: cls.id, className: cls.name,
        students: snapshotOf(students.value),
      });
    }, 300);
  });

  // ---------------------------------------------------------------- 一键全班 PDPR
  /**
   * 把全班设为 PDPR（PEMBELAJARAN DI RUMAH，官方 A 类，仍计出席）。
   * PDPR 日是高频场景，整班默认就是居家学习。
   *
   * 安全性：
   *  - 全班已是 PDPR 时直接提示，不重复写入
   *  - 有记录会被覆盖时二次确认，并明确告知覆盖条数
   *  - 确认后**直接归档**（2026-10-16 用户要求：省掉再点一次 Kemaskini）。
   *    确认框已写明「将覆盖 N 条记录」，故不再重复弹「已归档」确认；
   *    但**不置 force** —— 服务端安全护栏照常生效。
   */
  async function applyAllPdpr() {
    if (!students.value.length) return;
    // 纵深防御：按钮已停用，但这里再挡一次，避免日后新增入口绕过只读判定
    if (readOnly.value) { notify(readOnlyReason.value, 'alert-amber'); return; }
    const pdpr = getSebabByCode(PDPR_SEBAB);
    if (!pdpr) return;

    const toChange = students.value.filter(
      s => !(s.state === 'excused' && s.sebabCode === PDPR_SEBAB),
    );
    if (!toChange.length) {
      notify(t('toastPdprAlready'), 'alert-blue');
      return;
    }

    const ok = await ask({
      title: t('confirmTitlePdpr'),
      message: t('confirmPdpr', { total: students.value.length, overwrite: toChange.length }),
      danger: true,
    });
    if (!ok) return;

    for (const st of students.value) applyState(st, 'excused', pdpr);
    notify(t('toastPdprApplied', { n: students.value.length }), 'alert-amber');
    await submit({ confirmed: true });
  }

  // ---------------------------------------------------------------- 假因抽屉
  const reasonStudents = computed(() => {
    const tgt = reasonTarget.value;
    if (!tgt) return [];
    const set = new Set(tgt.ids);
    return students.value.filter(s => set.has(s.id));
  });
  const reasonTitle = computed(() => (reasonTarget.value?.batch
    ? t('reasonTitleBatch') : t('reasonTitleOne')));
  const reasonSubtitle = computed(() => {
    const list = reasonStudents.value;
    if (!list.length) return '';
    if (list.length === 1) return list[0].name;
    const head = list.slice(0, 3).map(s => s.name).join('、');
    return list.length > 3
      ? t('reasonStudentsMore', { n: list.length, names: head })
      : t('reasonStudents', { n: list.length, names: head });
  });
  const reasonSelectedCode = computed(() => {
    const list = reasonStudents.value;
    if (!list.length) return '';
    const code = list[0].sebabCode;
    return code && list.every(s => s.sebabCode === code) ? code : '';
  });
  const reasonPresentLabel = computed(() => (reasonTarget.value?.batch
    ? t('restoreMany', { n: reasonStudents.value.length })
    : t('restoreOne')));

  // ---------------------------------------------------------------- 行交互
  /**
   * 只读日（未来日期 / 官方不允许录入）连本地改写也一并封掉。
   * 否则教师可以改出一屏缺席却永远提交不了 —— 改了等于白改，还容易误以为已记上。
   * 这里**不再弹 notice**：App.vue 的常驻横幅已经把原因挂在屏幕上了，
   * 再弹一条同样的字只会重复。
   */
  function blockedByReadOnly() {
    return readOnly.value;
  }

  function onRowTap(st) {
    if (blockedByReadOnly()) return;
    if (selectMode.value) { selection.toggle(st.id); return; }
    reasonTarget.value = { ids: [st.id], batch: false };
  }
  function onRowLongPress(st) {
    if (blockedByReadOnly()) return;
    selection.enter(st);
  }
  function openBatchReason() {
    if (!selCount.value) return;
    reasonTarget.value = { ids: selectedIds.value.slice(), batch: true };
  }

  /** 选择假因：按分类自动判定「缺席」还是「官方算出席」 */
  function pickReason(r) {
    const tgt = reasonTarget.value;
    if (!tgt) return;
    const excused = isExcusedCategory(r.kategori);
    for (const st of reasonStudents.value) applyState(st, excused ? 'excused' : 'absent', r);
    notify(tgt.batch
      ? t('toastMarkedBatch', { n: tgt.ids.length, name: r.name })
      : t('toastMarked', { name: r.name }),
    excused ? 'alert-amber' : 'alert-blue');
    reasonTarget.value = null;
  }

  function markPresent() {
    const tgt = reasonTarget.value;
    if (!tgt) return;
    for (const st of reasonStudents.value) applyState(st, 'present');
    notify(tgt.batch
      ? t('toastRestoredMany', { n: tgt.ids.length })
      : t('toastRestoredOne'), 'alert-green');
    reasonTarget.value = null;
  }

  function markSelectedPresent() {
    if (!selCount.value) return;
    const set = new Set(selectedIds.value);
    const n = selCount.value;
    students.value.forEach(st => { if (set.has(st.id)) applyState(st, 'present'); });
    exitSelect();
    notify(t('toastMarkedPresent', { n }), 'alert-green');
  }

  // 注：「全班出席」原本是一个独立按钮（只改本地状态、要再点一次 Kemaskini）。
  // 2026-10-16 用户要求把它与提交按钮合并：屏幕上没有任何缺席/请假时，
  // 提交按钮本身就承担「全班到齐 + 归档」，见下方 submit()。
  // 批量恢复仍可用「长按进批量 → 全选 → 标记出席」。

  // ---------------------------------------------------------------- 提交
  /**
   * 提交归档。
   *
   * 吸底栏只有一个提交按钮，语义随屏幕状态切换（2026-10-16 用户定稿）：
   *   · 屏幕上没有任何缺席 / 请假 → 按钮显示「Kemaskini · Semua hadir」，
   *     等于「全班到齐」+ 归档，一次点击完成
   *   · 有条目                   → 按钮显示「Kemaskini」，按屏幕名单归档
   * 一键 PDPR 确认后也走这里，不再要求教师多点一次 Kemaskini。
   *
   * 确认对话框只表达「用户意图」，一律**不置 force** —— force 仅用于放行服务端
   * 安全护栏，且必须由用户在看到护栏原文后单独确认（见下方 catch 分支）。
   * 真机踩过的坑：这两处确认曾把 force 置真，导致「全班缺席」场景下服务端
   * SAFETY_BLOCK 永远不会触发 —— 而那道护栏正是为这个场景设计的。
   *
   * @param {boolean} force        放行服务端安全护栏（仅护栏确认后为真）
   * @param {boolean} reloginDone  已重登过，避免无限重试
   * @param {boolean} confirmed    用户意图已确认（如 PDPR 确认框），跳过本轮确认框
   */
  async function submit({ force = false, reloginDone = false, confirmed = false } = {}) {
    if (!students.value.length) return;

    // 纵深防御：按钮已停用，但这里再挡一次（force 也不例外 —— 未来日期不是「护栏误判」，
    // 而是根本不存在的出勤记录，没有让用户二次确认后放行的道理）
    if (readOnly.value) { notify(readOnlyReason.value, 'alert-amber'); return; }

    if (!changed.value && isVerified.value) {
      notify(t('toastNoChange'), 'alert-blue');
      return;
    }

    // 官方口径：rekodtidakhadir 是「当天全部未出席名单」，
    // 必须包含缺席 + 算出席（请假/居家学习），否则未列出的会被回写成出席。
    const records = students.value
      .filter(s => s.state !== 'present')
      .map(s => ({
        id: s.id,
        name: s.name,
        kategori: s.kategori || (s.sebabCode ? s.sebabCode.charAt(0) : 'D'),
        sebabCode: s.sebabCode || DEFAULT_SEBAB,
      }));
    const trueAbsent = bilAbsen.value;
    const declaringAllPresent = records.length === 0;

    // ---- 确认框：按风险从高到低只弹一个，避免连弹两个框 ----
    let intentOk = confirmed;
    if (!force && !intentOk) {
      let ok = true;
      if (trueAbsent > 3 && trueAbsent === students.value.length) {
        // 全班真缺席极罕见，先确认意图
        ok = await ask({
          title: t('confirmTitleAbsent'),
          message: t('confirmAllAbsent', { n: trueAbsent }),
          danger: true,
        });
      } else if (declaringAllPresent) {
        // 名单为空 = 声明全班到齐。服务端原有记录会被清除，故需确认
        ok = await ask({
          title: t('confirmTitlePresent'),
          message: isVerified.value
            ? `${t('confirmAllPresentSubmit', { total: students.value.length })}\n\n${t('confirmOverwrite')}`
            : t('confirmAllPresentSubmit', { total: students.value.length }),
          danger: true,
        });
      } else if (isVerified.value) {
        // 已归档日期覆盖前确认意图
        ok = await ask({
          title: t('confirmTitleVerified'),
          message: t('confirmOverwrite'),
          danger: true,
        });
      }
      if (!ok) return;
      intentOk = true;
    }

    let needForce = false;
    let needRelogin = false;
    let failed = null;

    busy.value = true;
    try {
      await idme.submitAttendance(currentDate.value, records, true,
        { force, trueAbsentCount: trueAbsent });
      isVerified.value = true;
      // 先清草稿再回查：否则 loadAttendance 会把刚提交掉的那份草稿当成
      // 「未提交改动」重新套回屏幕，教师会看到自己刚提交的内容又变回原样。
      await clearDraft(currentDate.value, idme.currentClass()?.id);
      notify(bilExcused.value
        ? t('toastSubmittedEx', { absent: bilAbsen.value, excused: bilExcused.value })
        : t('toastSubmitted', { absent: bilAbsen.value }), 'alert-green');
      await loadAttendance(currentDate.value);
    } catch (err) {
      failed = err;
    } finally {
      // 先复位 busy 再弹对话框：否则对话框期间吸底按钮仍显示「Sedang diproses...」
      busy.value = false;
    }

    // ---- 失败分类处理（busy 已复位，界面不再显示处理中）----
    if (failed) {
      if (failed instanceof IdMeError && failed.code === 'SESSION_LOST' && !reloginDone) {
        needRelogin = true;
      } else if (failed instanceof IdMeError && failed.code === 'SAFETY_BLOCK' && !force) {
        // 服务层 message 是开发者向中文说明，面向用户的文案由 i18n 按 detail 组装
        const msg = t('safetyBlock', {
          total: failed.detail?.total ?? students.value.length,
          serverAbsent: failed.detail?.serverAbsent ?? 0,
        });
        needForce = await ask({
          title: t('confirmTitleBlocked'),
          message: `${msg}\n\n${t('confirmForceSuffix')}`,
          danger: true,
        });
        if (!needForce) notify(msg, 'alert-red');
      } else {
        notify(t('submitFail', { msg: errText(failed) }), 'alert-red');
      }
    }

    if (needRelogin) {
      try {
        await relogin();
        online.value = true;
        // 带上 intentOk：确认框已过就不再重复弹
        return submit({ force, reloginDone: true, confirmed: intentOk });
      } catch (e2) {
        notify(t('reloginFail', { msg: errText(e2) }), 'alert-red');
      }
    }
    if (needForce) return submit({ force: true, reloginDone, confirmed: true });
  }

  // ---------------------------------------------------------------- 导航
  /**
   * 前后翻一天。往后翻到今天为止 —— 未来日期在官方网站里本就选不到
   * （maxDate = 今天），本 App 直接在导航层挡住，省掉一切「日期未到」的提示。
   */
  function shiftDate(delta) {
    if (!currentDate.value) return;
    if (delta > 0 && !canGoNext.value) return;
    // 切走前先落一次草稿（防抖窗口内切日期会丢掉最后几下点击）
    flushDraft();
    loadAttendance(shiftDateStr(currentDate.value, delta));
  }
  function jumpToday() { flushDraft(); loadAttendance(todayStr()); }

  /** 立即落盘当前草稿（切日期 / 切班级 / 退出前调用），跳过防抖 */
  function flushDraft() {
    clearTimeout(draftTimer);
    if (!students.value.length || !changed.value) return;
    const cls = idme.currentClass();
    if (!cls) return;
    saveDraft({
      date: currentDate.value, classId: cls.id, className: cls.name,
      students: snapshotOf(students.value),
    });
  }

  return {
    // 状态
    busy, online, notice, students, currentDate, isVerified, baseline, reasonTarget,
    statushari, restoredFromDraft,
    // 计算
    bilAbsen, bilExcused, bilHadir, pending, attendanceRate, dateDisplay, changed, allIds,
    isFuture, canGoNext, notRecordable, readOnly, readOnlyReason,
    emptyRoster, bannerText, showStatusTag,
    // 操作
    notify, applyState, loadAttendance, applyAllPdpr, submit,
    onRowTap, onRowLongPress, openBatchReason, pickReason, markPresent, markSelectedPresent,
    shiftDate, jumpToday, flushDraft,
    // 假因抽屉展示态
    reasonStudents, reasonTitle, reasonSubtitle, reasonSelectedCode, reasonPresentLabel,
  };
}
