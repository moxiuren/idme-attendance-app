<template>
  <!-- ==================== 启动 / 登录 ==================== -->
  <LoginView v-if="!isReady"
             v-model:ic="cred.ic"
             v-model:password="cred.password"
             :busy="busy" :error="bootError" :progress="progressText"
             @submit="doLogin" />

  <!-- ==================== 主界面 ==================== -->
  <div v-else class="app">
    <TopBar :class-name="className" :class-count="classes.length"
            :online="online" :select-mode="selectMode"
            :update-badge="updState === 'available'"
            @pick-class="showClassSheet = true"
            @exit-select="selection.toggleSelectMode()"
            @report="showReport = true"
            @settings="showSettings = true" />

    <DateBar :date-display="dateDisplay" :is-verified="isVerified" :busy="busy"
             :can-next="canGoNext" :show-tag="showStatusTag"
             @prev="shiftDate(-1)" @next="shiftDate(1)" @today="jumpToday" />

    <StatsBar :total="students.length" :hadir="bilHadir"
              :absen="bilAbsen" :excused="bilExcused" :rate="attendanceRate" />

    <SelectBar v-if="selectMode" :count="selCount" :total="students.length"
               @all="selection.selectAll(allIds)"
               @invert="selection.invert(allIds)"
               @none="selection.selectNone()" />

    <div v-if="notice" class="alert" :class="notice.type">{{ notice.text }}</div>
    <!-- 常驻横幅：未来日期 / 学期假 / 特别假 / 官方不允许录入 / 该日期无名单。
         这些情况下按钮是停用的，理由必须一直留在屏幕上（notice 4 秒就消失了）。 -->
    <div v-if="bannerText" class="alert alert-amber">{{ bannerText }}</div>

    <StudentList :students="students" :loading="busy"
                 :select-mode="selectMode" :selected="selectedIds"
                 @tap="onRowTap" @longpress="onRowLongPress" />

    <ActionBar :select-mode="selectMode" :busy="busy"
               :pending="pending" :total="students.length"
               :absent="bilAbsen" :excused="bilExcused" :sel-count="selCount"
               :readonly="readOnly" :readonly-reason="readOnlyReason"
               @cancel="selection.toggleSelectMode()"
               @mark-present="markSelectedPresent"
               @open-reason="openBatchReason"
               @pdpr="applyAllPdpr"
               @submit="submit()" />

    <!-- ============ 抽屉（由内到外：假因 → 班级 → 报表 → 设置） ============ -->
    <ReasonSheet :open="!!reasonTarget"
                 :title="reasonTitle" :subtitle="reasonSubtitle"
                 :selected-code="reasonSelectedCode" :present-label="reasonPresentLabel"
                 @pick="pickReason" @present="markPresent" @close="closeReason" />

    <ClassSheet :open="showClassSheet" :classes="classes" :current="currentClassIdx"
                @close="showClassSheet = false" @choose="chooseClass" />

    <ReportSheet :open="showReport" :ask="ask"
                 @close="showReport = false" @notify="notify"
                 @pick-date="pickReportDate" />

    <SettingsSheet :open="showSettings"
                   v-model:ic="cred.ic" v-model:password="cred.password"
                   :sebab-count="sebabCount" :category-count="categories.length"
                   :update-available="updState === 'available'"
                   :update-version="updManifest?.versionName || ''"
                   @close="showSettings = false"
                   @save="saveAndRelogin" @clear="clearCred"
                   @check-update="openUpdate" />

    <!-- 更新抽屉：状态由 useUpdater 持有，关掉再打开进度不丢 -->
    <UpdateSheet :open="showUpdate"
                 :state="updState"
                 :manifest="updManifest"
                 :progress="updProgress"
                 :error-key="updErrorKey"
                 :local-name="updLocalName"
                 :need-perm="needPerm"
                 :installing="updInstalling"
                 @close="showUpdate = false"
                 @download="doDownload"
                 @cancel="doCancel"
                 @install="doInstall"
                 @open-settings="doOpenInstallSettings"
                 @recheck="doRecheck" />

    <!-- 确认对话框：z-index 高于抽屉，可从抽屉之上弹出 -->
    <ConfirmSheet :state="confirmState" @answer="answer" />
  </div>
</template>

<script setup>
// 顶层编排：持有认证状态与界面开关，出勤域逻辑全部委托给 useAttendance。
// 拆分背景：本文件曾达 592 行，超过项目「源文件 ≤ 499 行」门禁。
import { ref, computed, onMounted } from 'vue';
import { App as CapApp } from '@capacitor/app';
// 凭据走 Android Keystore 加密（见 credStore.js 顶部注释）。
// 别名导入是为了避开本文件里同名的 clearCred() —— 那个是界面动作，
// 这个只负责落盘，语义不同但名字撞了。
import {
  loadCred as loadStoredCred,
  saveCred as saveStoredCred,
  clearCred as clearStoredCred,
  migrateLegacyCred,
} from './credStore.js';
import { idme } from './idmeService.js';
import { groupByCategory, allSebab } from './sebab.js';
import { t, loadLang } from './i18n.js';
import { todayStr, monthYearOf } from './utils.js';
import { errText } from './errors.js';
import { useSelection } from './composables/useSelection.js';
import { useAttendance } from './composables/useAttendance.js';
import { useBackButton } from './composables/useBackButton.js';
import { useConfirm } from './composables/useConfirm.js';
import { useUpdater } from './composables/useUpdater.js';

import LoginView from './LoginView.vue';
import TopBar from './TopBar.vue';
import DateBar from './DateBar.vue';
import StatsBar from './StatsBar.vue';
import SelectBar from './SelectBar.vue';
import StudentList from './StudentList.vue';
import ActionBar from './ActionBar.vue';
import ReasonSheet from './ReasonSheet.vue';
import ClassSheet from './ClassSheet.vue';
import ReportSheet from './ReportSheet.vue';
import SettingsSheet from './SettingsSheet.vue';
import UpdateSheet from './UpdateSheet.vue';
import ConfirmSheet from './ConfirmSheet.vue';

// ---------------------------------------------------------------- 认证与界面开关
const cred = ref({ ic: '', password: '' });
const isReady = ref(false);
const bootError = ref('');
const progressText = ref('');
const classes = ref([]);
const currentClassIdx = ref(0);

const showClassSheet = ref(false);
const showSettings = ref(false);
const showReport = ref(false);
const showUpdate = ref(false);
const needPerm = ref(false);        // 「安装未知应用」权限未授予
const updInstalling = ref(false);   // 已调起安装器，等用户走完系统界面

// ---------------------------------------------------------------- 自更新
// 状态由 composable 持有：下载进行中关闭抽屉再打开，进度仍在。
const updater = useUpdater();
const {
  state: updState, manifest: updManifest, progress: updProgress,
  errorKey: updErrorKey, localName: updLocalName,
  check: updCheck, download: updDownload, install: updInstall,
  cancel: updCancel, openInstallSettings: updOpenInstallSettings,
} = updater;

/** 设置页点「检查更新」：打开抽屉并立刻查一次（不走静默模式，失败要报错） */
async function openUpdate() {
  showUpdate.value = true;
  needPerm.value = false;
  updInstalling.value = false;
  await updCheck();
}

async function doDownload() {
  await updDownload();
}

/**
 * 安装：先查「安装未知应用」权限。
 * 未授予时系统会静默拦掉 ACTION_VIEW —— 用户点「安装」毫无反应，
 * 会以为应用坏了。所以这里显式把权限引导顶到界面上。
 */
async function doInstall() {
  if (updInstalling.value) return;   // 连点会重复起安装 Activity
  updInstalling.value = true;
  const r = await updInstall();
  if (r === 'needsPermission') {
    needPerm.value = true;
    updInstalling.value = false;     // 没走成，按钮要能再点
  }
  // 走到 'launched' 就保持禁用：此时系统安装界面已盖在上面，
  // 用户回来时要么已装完（应用重启），要么按了返回 —— 两种情况都不该再点一次。
  // 再次打开抽屉时由 openUpdate / doRecheck 复位。
}

async function doCancel() {
  await updCancel();
  needPerm.value = false;
}

async function doOpenInstallSettings() {
  await updOpenInstallSettings();
}

/** 重试：清掉上一次的错误态，再查一次（非静默，失败要看到原因） */
async function doRecheck() {
  needPerm.value = false;
  updInstalling.value = false;
  await updCheck();
}

// ---------------------------------------------------------------- 出勤域
const { confirmState, ask, answer } = useConfirm();
const selection = useSelection();
const att = useAttendance({
  // 会话失效时由出勤域回调重登，避免本模块反向依赖认证逻辑形成循环
  relogin: async () => { await idme.login(cred.value.ic, cred.value.password); },
  selection,
  ask,
});
const {
  busy, online, notice, students, currentDate, isVerified, reasonTarget,
  bilAbsen, bilExcused, bilHadir, pending, attendanceRate, dateDisplay, allIds,
  readOnly, readOnlyReason, bannerText, canGoNext, showStatusTag,
  notify, loadAttendance, applyAllPdpr, submit,
  onRowTap, onRowLongPress, openBatchReason, pickReason, markPresent, markSelectedPresent,
  shiftDate, jumpToday,
  reasonTitle, reasonSubtitle, reasonSelectedCode, reasonPresentLabel,
} = att;
const { selectMode, selectedIds, selCount } = selection;

function closeReason() { reasonTarget.value = null; }

const className = computed(() => classes.value[currentClassIdx.value]?.name || '');
const categories = computed(() => groupByCategory());
const sebabCount = computed(() => allSebab().length);

async function doLogin() {
  if (!cred.value.ic || !cred.value.password) {
    bootError.value = t('needCred');
    return;
  }
  busy.value = true;
  bootError.value = '';
  try {
    // 回调给的是 i18n key（服务层不持有界面语言），这里才翻译。
    // t() 内部读 lang.value，但登录页渲染时 lang 已由 loadLang() 定好，
    // 无需 watch —— 登录过程中用户不可能切换语言。
    await idme.login(cred.value.ic, cred.value.password, (step, descKey) => {
      progressText.value = `[${step}] ${t(descKey)}`;
    });
    // 存不上不阻断登录 —— 只影响下次是否要重输，登录本身已经成功了。
    await saveStoredCred({ ic: cred.value.ic, password: cred.value.password });

    classes.value = idme.classes.slice();
    currentClassIdx.value = idme.currentClassIdx;
    online.value = true;
    isReady.value = true;
    progressText.value = '';
    await loadAttendance(currentDate.value);

    // 后台预热当前月报表：官方月度报表页约 350KB，冷开 2~3 秒。
    // 登录后立刻拉一次，教师点开 Laporan 就是秒开（不 await，不阻塞界面）。
    const my = monthYearOf(currentDate.value);
    if (my) idme.prefetchMonthlyReport(my.m, my.y);
  } catch (err) {
    online.value = false;
    bootError.value = errText(err);
    isReady.value = false;
  } finally {
    busy.value = false;
  }
}

async function init() {
  currentDate.value = todayStr();
  // 先搬旧版明文，再读 —— 顺序不能反：迁移前读取只会读到空值，
  // 结果就是老用户升级后被要求重新输一次密码。
  await migrateLegacyCred();
  const saved = await loadStoredCred();
  if (saved.ic) cred.value.ic = saved.ic;
  if (saved.password) cred.value.password = saved.password;

  if (cred.value.ic && cred.value.password) await doLogin();
}

async function saveAndRelogin() {
  showSettings.value = false;
  await saveStoredCred({ ic: cred.value.ic, password: cred.value.password });
  await doLogin();
}

async function clearCred() {
  cred.value = { ic: '', password: '' };
  await clearStoredCred();
  isReady.value = false;
  students.value = [];
  online.value = false;
}

async function chooseClass(i) {
  showClassSheet.value = false;
  // 切班级前先落盘：loadAttendance 会重设 students，防抖窗口里未写盘的最后几下点击会丢
  att.flushDraft();
  idme.switchClass(i);
  currentClassIdx.value = i;
  await loadAttendance(currentDate.value);
}

/**
 * 报表月历点某天 → 关掉抽屉，跳到那天的点名名单。
 * 与系统返回键用同一套保护：有未提交改动先确认 ——
 * 否则整节课的点名结果会被一次误触静默丢掉。
 */
async function pickReportDate(dateStr) {
  if (students.value.length && att.changed.value) {
    const ok = await ask({
      title: t('confirmTitleJump'),
      message: t('confirmJump'),
      danger: true,
    });
    if (!ok) return;
  }
  showReport.value = false;
  await loadAttendance(dateStr);
}

// ---------------------------------------------------------------- 系统返回键
// 由内到外逐层消费；全部关完才退出（真机实测过不接管会直接退到桌面丢数据）
useBackButton([
  { isOpen: () => !!confirmState.value, close: () => answer(false) },
  // 更新抽屉在设置之上，故排在设置之前。下载中不允许关（见 UpdateSheet.onClose）
  { isOpen: () => showUpdate.value && updState.value !== 'downloading',
    close: () => { showUpdate.value = false; } },
  { isOpen: () => !!reasonTarget.value, close: closeReason },
  { isOpen: () => showClassSheet.value, close: () => { showClassSheet.value = false; } },
  { isOpen: () => showReport.value, close: () => { showReport.value = false; } },
  { isOpen: () => showSettings.value, close: () => { showSettings.value = false; } },
  { isOpen: () => selectMode.value, close: () => selection.exit() },
], async () => {
  // 已在根页面：有未提交改动先确认，避免误触丢掉整节课的点名结果。
  // 确认后仍然落一次草稿 —— 教师可能只是想先退出、下午再回来提交，
  // 草稿是最后一道保险（进程被回收时 onUnmounted 不会执行）。
  if (students.value.length && att.changed.value) {
    const ok = await ask({
      title: t('confirmTitleExit'),
      message: t('confirmExit'),
      danger: true,
    });
    if (!ok) return;
    att.flushDraft();
  }
  CapApp.exitApp();
});

onMounted(async () => {
  await loadLang();      // 先定语言，再渲染登录页 / 主界面
  init();
  // 启动时静默检查更新：延迟 3 秒再发，避开登录首屏的网络竞争
  // （登录本身要串行走 4 个官方页面，此时再抢带宽只会让老师多等）。
  // silent 模式下网络失败不提示 —— 教室没网是常态，不该弹错误。
  setTimeout(() => { updCheck({ silent: true }); }, 3000);
});
</script>
