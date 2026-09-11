import type { Activity, TripDay } from '../../shared/types.ts';

/* ============================================================
 * 行程体检：对已有行程做轻量可行性检查（纯计算，无副作用）
 * 参考：roadtrip-skill 的行程可行性校验思路（MIT）
 * 只输出「提示」而非阻断，规划权始终在用户手里。
 * ============================================================ */

export interface CheckupFinding {
  level: 'warn' | 'info';
  dayId: number;
  dayNumber: number;
  date: string;
  code: 'overlap' | 'tight-transfer' | 'late-night' | 'early-morning' | 'untimed' | 'packed-day' | 'no-activities';
  message: string;
}

const toMin = (time: string | null): number | null => {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

export function checkupTrip(days: TripDay[], activities: Activity[]): CheckupFinding[] {
  const findings: CheckupFinding[] = [];
  const byDay = new Map<number, Activity[]>();
  for (const a of activities) {
    if (!byDay.has(a.dayId)) byDay.set(a.dayId, []);
    byDay.get(a.dayId)!.push(a);
  }

  for (const day of days) {
    const list = (byDay.get(day.id) || []).slice().sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.id - b.id);
    if (!list.length) continue;

    const timed = list.filter(a => toMin(a.time) != null).map(a => ({ ...a, start: toMin(a.time)!, end: toMin(a.endTime) }));
    if (timed.length && timed.length < list.length) {
      findings.push({ level: 'info', dayId: day.id, dayNumber: day.dayNumber, date: day.date, code: 'untimed', message: `有 ${list.length - timed.length} 个安排未填时间，无法参与时序检查` });
    }
    if (list.length >= 7) {
      findings.push({ level: 'info', dayId: day.id, dayNumber: day.dayNumber, date: day.date, code: 'packed-day', message: `当天安排了 ${list.length} 项，节奏偏紧，考虑移一部分到相邻日期` });
    }

    for (const a of timed) {
      if (a.start < 6 * 60) {
        findings.push({ level: 'info', dayId: day.id, dayNumber: day.dayNumber, date: day.date, code: 'early-morning', message: `「${a.title}」${a.time} 开始，早于 06:00，确认交通是否已营业` });
      }
      if (a.end != null && a.end > 23 * 60 + 30) {
        findings.push({ level: 'info', dayId: day.id, dayNumber: day.dayNumber, date: day.date, code: 'late-night', message: `「${a.title}」结束于 ${a.endTime}，偏晚，注意末班车/安全` });
      }
    }

    for (let i = 1; i < timed.length; i++) {
      const prev = timed[i - 1], cur = timed[i];
      const prevEnd = prev.end != null ? prev.end : prev.start + 60; // 未填结束时间按 1 小时估算
      if (cur.start < prev.start) continue;
      if (cur.start < prevEnd) {
        findings.push({ level: 'warn', dayId: day.id, dayNumber: day.dayNumber, date: day.date, code: 'overlap', message: `「${prev.title}」（${prev.time}${prev.endTime ? '–' + prev.endTime : ''}）与「${cur.title}」（${cur.time}）时间重叠` });
        continue;
      }
      const gap = cur.start - prevEnd;
      if (gap < 30 && (prev.place || cur.place) && (prev.place || '') !== (cur.place || '')) {
        findings.push({ level: 'warn', dayId: day.id, dayNumber: day.dayNumber, date: day.date, code: 'tight-transfer', message: `「${prev.title}」到「${cur.title}」仅 ${gap} 分钟转场（${prev.place || '未知地点'} → ${cur.place || '未知地点'}）` });
      }
    }
  }
  return findings;
}
