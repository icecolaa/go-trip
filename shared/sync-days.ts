/** 行程天数同步计划（纯函数）：按起止日期重建 days，尽量按 date 保留旧行。
 * 客户端执行：先删 deleteIds 各天的 activities，再删天、更新保留行 day_number、批量建新行。 */

export interface SyncDayRow {
  id: string;
  date: string;
  dayNumber?: number;
}

export interface DaysSyncPlan {
  /** 保留的行（date 命中）；dayNumber 与旧行不同时调用方需 update */
  keep: { id: string; date: string; dayNumber: number; dayNumberChanged: boolean }[];
  create: { dayNumber: number; date: string }[];
  deleteIds: string[];
}

const MAX_DAYS = 90;

/** 本地日期格式化（不能用 toISOString——UTC+8 会把日期整体偏移一天） */
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateRange(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return out;
  for (const d = new Date(start); d <= end && out.length < MAX_DAYS; d.setDate(d.getDate() + 1)) {
    out.push(localDate(d));
  }
  return out;
}

export function planDaysSync(existing: SyncDayRow[], startDate: string, endDate: string): DaysSyncPlan {
  const target = dateRange(startDate, endDate);
  const byDate = new Map(existing.map(d => [d.date, d]));
  const plan: DaysSyncPlan = { keep: [], create: [], deleteIds: [] };
  target.forEach((date, i) => {
    const hit = byDate.get(date);
    const dayNumber = i + 1;
    if (hit) {
      plan.keep.push({ id: hit.id, date, dayNumber, dayNumberChanged: hit.dayNumber !== dayNumber });
      byDate.delete(date);
    } else {
      plan.create.push({ dayNumber, date });
    }
  });
  for (const rest of byDate.values()) plan.deleteIds.push(rest.id);
  return plan;
}
