<template>
  <div v-if="open" class="sheet-mask" @click.self="$emit('close')">
    <div class="sheet sheet-report">
      <div class="sheet-head">
        <div class="sheet-title">{{ t('reportTitle') }}</div>
        <div class="sheet-head-acts">
          <button class="sheet-close"
                  :disabled="busy"
                  :aria-label="t('refresh')" :title="t('refresh')"
                  @click="load(true)">
            <Icon name="refresh" :size="19" />
          </button>
          <button class="sheet-close"
                  :aria-label="t('close')" :title="t('close')"
                  @click="$emit('close')">
            <Icon name="close" :size="19" />
          </button>
        </div>
      </div>

      <!-- 月份导航：复用主界面日期栏的类名，切月与切天手感一致 -->
      <div class="datebar datebar-sheet">
        <button class="date-arrow" :disabled="busy"
                :aria-label="t('prevMonth')" :title="t('prevMonth')"
                @click="shiftMonth(-1)">‹</button>
        <button class="date-main" @click="jumpThisMonth" :title="t('jumpThisMonth')">
          <span class="date-text">{{ monthDisplay }}</span>
          <!-- 加载中不显示状态徽章：此时 report 为 null，
               若照常渲染会先闪一个错误的「等待确认」 -->
          <span v-if="report" class="date-tag" :class="confirmed ? 'tag-green' : 'tag-amber'">
            {{ confirmed ? t('archived') : t('notArchived') }}
          </span>
        </button>
        <button class="date-arrow" :disabled="busy"
                :aria-label="t('nextMonth')" :title="t('nextMonth')"
                @click="shiftMonth(1)">›</button>
      </div>

      <div class="sheet-body">
        <p v-if="busy" class="report-loading">{{ t('loading') }}</p>

        <template v-else-if="report">
          <!-- 月度汇总（官方口径四项） -->
          <div class="stats stats-report">
            <div class="stat">
              <!-- 官方原文是 '100.00' 这类两位小数字符串，统一走 formatPercent：
                   满 100 显示 100%，低于 100 才带一位小数，与主界面统计条口径一致 -->
              <div class="stat-num c-blue">{{ formatPercent(report.summary.peratus) }}%</div>
              <div class="stat-lbl">{{ t('statRate') }}</div>
            </div>
            <div class="stat">
              <div class="stat-num c-green">{{ report.summary.purata }}</div>
              <div class="stat-lbl">{{ t('avgPresent') }}</div>
            </div>
            <div class="stat">
              <div class="stat-num">{{ report.summary.hariBelajar }}</div>
              <div class="stat-lbl">{{ t('schoolDays') }}</div>
            </div>
            <div class="stat">
              <div class="stat-num">{{ report.summary.murid }}</div>
              <div class="stat-lbl">{{ t('totalEndMonth') }}</div>
            </div>
          </div>

          <!-- 月历：每格显示「出席/应有」 -->
          <div class="cal">
            <div class="cal-head">
              <span v-for="w in WEEKDAY_SHORT" :key="w" class="cal-wd">{{ w }}</span>
            </div>
            <div class="cal-grid">
              <!-- 有日期的格子可点 → 关掉抽屉直接跳到那天的点名名单。
                   未来日期与空白格渲染成 <span>：与主界面「还没到的日期直接过不去」
                   一致，不进 tab 序、不给按压反馈，也不需要任何说明（用户定稿）。 -->
              <component v-for="(c, i) in calendar" :key="i"
                         :is="c.clickable ? 'button' : 'span'"
                         class="cal-cell"
                         :class="[c.cls, c.clickable ? 'cal-cell-btn' : '']"
                         :type="c.clickable ? 'button' : null"
                         :style="c.color ? { '--hol': c.color } : null"
                         :title="c.clickable ? `${t('openDay')} ${c.date}` : null"
                         @click="c.clickable && pickDate(c.date)">
                <template v-if="c.day">
                  <span class="cal-day">{{ c.day }}</span>
                  <span v-if="c.value" class="cal-val" :class="{ 'cal-val-bad': c.absent }">
                    {{ c.value }}
                  </span>
                  <span v-else-if="c.note" class="cal-note">{{ c.note }}</span>
                </template>
              </component>
            </div>
          </div>

          <!-- 图例：只列本月实际出现的假期类型，避免占满屏 -->
          <div v-if="legend.length" class="cal-legend">
            <span class="cal-legend-t">{{ t('legend') }}</span>
            <span v-for="l in legend" :key="l.name" class="cal-legend-i">
              <i class="cal-dot" :style="{ background: l.color }"></i>{{ l.name }}
            </span>
          </div>
        </template>

        <p v-else class="report-loading">{{ t('reportFail') }}</p>
      </div>

      <!-- 唯一动作按钮：未封存 → 封存；已封存 → 出报表 -->
      <div class="sheet-foot">
        <!-- 本月未结束时封存按钮直接置灰（官方同样加 disabled）。
             灰按钮旁边必须有一行说明，否则教师只看到一个按不动的按钮。 -->
        <p v-if="showSahHint" class="report-hint">{{ t('sahNotOver') }}</p>
        <button v-if="confirmed" class="btn btn-primary btn-block"
                :disabled="busy" @click="cetakLaporan">
          {{ t('exportPdf') }}
        </button>
        <button v-else class="btn btn-amber btn-block"
                :disabled="busy || !report || !monthOver"
                :title="monthOver ? undefined : t('sahNotOver')"
                @click="sahkan">
          {{ t('sahBulanan') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 月度出勤报表抽屉。
//
// 设计（2026-10-16 用户定稿）：
//   · 顶部左右箭头切月（复用主界面日期栏样式），点中间回到本月
//   · 中间月历，每格显示「出席 / 应有」—— 如 30/31、28/30
//   · 底部**只有一个**动作按钮：未封存 → 封存；已封存 → 出报表
//   · 月份尚未结束时封存按钮**直接置灰**（2026-10-16 用户要求：很容易按错）
//
// 关于「月度封存」（官方 Sahkan）：不可撤销。官方实现里确认后会把
//   Sahkan 按钮换成「Cetak laporan」，且对未结束的月份直接加 disabled。
//   原先本 App 不照搬 disabled（怕教师确需提前封存），改为二次确认 + 提醒；
//   2026-10-16 用户定稿：照搬官方，未结束的月份按钮置灰，防止误触。
//   因此「提前封存」这条路径已不存在，相应的确认文案也一并移除。
import { ref, computed, watch } from 'vue';
import { idme } from './idmeService.js';
import { isMonthOver } from './monthReport.js';
import { formatPercent } from './utils.js';
import { buildCalendarCells } from './reportCalendar.js';
import { t, lang } from './i18n.js';
import { errText } from './errors.js';
import Icon from './Icon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  // Promise 化确认对话框（useConfirm），由 App 注入，保证全局只有一个对话框实例
  ask: { type: Function, required: true },
});
// 事件：close（关抽屉）、notify（提示条）、pick-date（点了月历某天，携带 DD/MM/YYYY）
const emit = defineEmits(['close', 'notify', 'pick-date']);

const busy = ref(false);
const report = ref(null);

const now = new Date();
const rMonth = ref(String(now.getMonth() + 1).padStart(2, '0'));
const rYear = ref(String(now.getFullYear()));

const MONTHS = {
  ms: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
    'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
  zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
};
// 马来文习惯以 Ahad（周日）为一周之始，与官方月报表一致
const WEEKDAY_SHORT = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];

const confirmed = computed(() => !!report.value?.isConfirmed);

/**
 * 本月是否已结束。未结束的月份不能封存 —— 封存会把还没补完的缺席信息定稿，
 * 且官方没有撤销入口。
 */
const monthOver = computed(() => isMonthOver(rMonth.value, rYear.value));

/** 灰按钮旁的一行说明：仅当「未封存 + 报表已加载 + 月份未结束」时显示 */
const showSahHint = computed(() => !confirmed.value && !!report.value && !monthOver.value);

const monthDisplay = computed(() => {
  const m = Number(rMonth.value);
  const name = (MONTHS[lang.value] || MONTHS.ms)[m - 1] || '';
  return `${rYear.value}-${rMonth.value} ${name}`;
});

/**
 * 月历格子：首日前补空格，之后每天一格。
 * 具体构造（含「未来日期不可点」与星期对齐）在 reportCalendar.js —— 纯函数，
 * 可在 Node 里真正跑断言（.vue 没有模板编译器，测不了）。
 */
const calendar = computed(() => (report.value
  ? buildCalendarCells({
    days: report.value.days,
    year: Number(rYear.value),
    month: Number(rMonth.value),
    noRecord: t('noRecord'),
  })
  : []));

/**
 * 点月历某天 → 请求跳到那天的点名名单。
 * 真正的跳转（关抽屉 + 换日期 + 未提交改动的确认）由 App.vue 负责 ——
 * 本组件拿不到主界面的出勤状态，也不该反向依赖它。
 */
function pickDate(dateStr) {
  if (busy.value || !dateStr) return;
  emit('pick-date', dateStr);
}

/** 图例：只列本月实际出现的假期类型 */
const legend = computed(() => {
  const rep = report.value;
  if (!rep) return [];
  const seen = new Map();
  for (const d of rep.days) {
    if (d.holiday && d.holidayColor && !seen.has(d.holiday)) {
      seen.set(d.holiday, d.holidayColor);
    }
  }
  return [...seen].map(([name, color]) => ({ name, color }));
});

/**
 * 加载某月报表。
 * 命中缓存时**不**进入加载态、也不清空 report —— 切月来回翻应当瞬开无闪烁。
 * @param {boolean} force 强制绕过缓存（刷新按钮用）
 */
async function load(force = false) {
  const hasCache = !force && idme.hasMonthlyReport(rMonth.value, rYear.value);
  if (!hasCache) {
    busy.value = true;
    report.value = null;
  }
  try {
    report.value = await idme.getMonthlyReport(rMonth.value, rYear.value, { force });
  } catch (err) {
    emit('notify', t('queryFail', { msg: errText(err) }), 'alert-red');
    if (!hasCache) report.value = null;
  } finally {
    busy.value = false;
  }
}

// 打开即加载本月；换月自动重载（不再需要「查询」按钮）
watch(() => props.open, (v) => { if (v) load(); });

function shiftMonth(delta) {
  const dt = new Date(Number(rYear.value), Number(rMonth.value) - 1 + delta, 1);
  rMonth.value = String(dt.getMonth() + 1).padStart(2, '0');
  rYear.value = String(dt.getFullYear());
  load();
}
function jumpThisMonth() {
  const d = new Date();
  rMonth.value = String(d.getMonth() + 1).padStart(2, '0');
  rYear.value = String(d.getFullYear());
  load();
}

async function cetakLaporan() {
  busy.value = true;
  try {
    const r = await idme.exportMonthlyReport(rMonth.value, rYear.value);
    emit('notify', t('toastExported', { file: r.fileName }), 'alert-green');
  } catch (err) {
    emit('notify', t('exportFail', { msg: errText(err) }), 'alert-red');
  } finally {
    busy.value = false;
  }
}

async function sahkan() {
  const m = rMonth.value;
  const y = rYear.value;
  // 按钮已置灰，这里再兜一层（防日后新增入口绕过 disabled）
  if (!monthOver.value) {
    emit('notify', t('sahNotOver'), 'alert-amber');
    return;
  }
  const ok = await props.ask({
    title: t('confirmSahTitle'),
    message: t('confirmSah', { m, y }),
    confirmText: t('sahBulanan'),
    danger: true,
  });
  if (!ok) return;

  busy.value = true;
  try {
    const done = await idme.submitSahBulanan(m, y);
    emit('notify', done ? t('toastSahOk', { m, y }) : t('toastSahUnknown'),
      done ? 'alert-green' : 'alert-amber');
    if (done) await load();     // 重载后按钮自动变成「出报表」
  } catch (err) {
    emit('notify', t('sahFail', { msg: errText(err) }), 'alert-red');
  } finally {
    busy.value = false;
  }
}
</script>
