// idMe API 客户端（门面）—— 按职责组装各模块
//   核心：idmeCore.js（认证链路 / Cookie / HTTP / 令牌）
//   出勤：idmeAttendance.js（花名册查询 / 三态解析 / 提交 / 重置）
//   报表：idmeReport.js（假因拉取 / 月度统计 / 导出）
import { IdMeService, IdMeError } from './idmeCore.js';
import { withAttendance } from './idmeAttendance.js';
import { withReport } from './idmeReport.js';

class IdMe extends withReport(withAttendance(IdMeService)) {}

export { IdMeError };
export const idme = new IdMe();
