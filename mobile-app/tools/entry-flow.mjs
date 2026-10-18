/**
 * 提交流程契约测试的打包入口。
 *
 * 关键：`useAttendance` 与 `idme` 必须落在**同一张模块图**里，
 * 二者才会共用同一个 idme 单例 —— 否则测试里替换的网络哨兵对
 * composable 内部不可见，断言会假通过。
 */
export { useAttendance } from '../src/composables/useAttendance.js';
export { useSelection } from '../src/composables/useSelection.js';
export { idme, IdMeError } from '../src/idmeService.js';
export { PDPR_SEBAB, DEFAULT_SEBAB, getSebabByCode } from '../src/sebab.js';
// t / lang 一并导出：契约测试要断言「弹的是哪一个确认框」，
// 必须拿到与 composable 同一个 i18n 实例的文案，不能自己另写一份字面量。
export { t, lang } from '../src/i18n.js';
// 日期工具：测试里的「过去 / 今天 / 未来」必须相对真实系统日期动态计算，
// 写死日期会让测试随日历推移而失效。
export { todayStr, shiftDateStr } from '../src/utils.js';
