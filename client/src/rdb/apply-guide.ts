/** AI 解析结果写入行程（客户端落库，保证 _openid 归属）。
 * 与小程序 trip-ai 页同构：replace 全量重建 / targeted 按天号精准替换。
 * 新行 id 一律取 createRows 的 idList——禁止「写后立即 list」（平台可见性延迟）。 */
import { proxy } from './proxy';
import { createRows, deleteRow, deleteRows, listRows, updateRow } from './entities';
import { logActivity } from './trip';
import type { ParsedGuide } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const offsetDate = (base: string, days: number): string => {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export interface ApplyGuideResult {
  replacedDays: string[];
  activityCount: number;
}

export async function applyGuideToTrip(
  tripId: string,
  guide: ParsedGuide,
  opts: { targeted?: boolean; tripStartDate?: string },
  memberName: string,
): Promise<ApplyGuideResult> {
  const dayRows = (await listRows('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }])) as any[];
  const touched = new Set<string>();
  const createdDays: Record<number, string> = {}; // dayNumber → 新行 _id

  if (opts.targeted) {
    for (const d of guide.days) {
      const n = Math.round(Number(d.dayNumber)) || 0;
      const hit = dayRows.find(r => r.dayNumber === n || (d.date && r.date === d.date));
      if (!hit) continue;
      touched.add(hit.id);
      await deleteRows('gt_activities', { day_id: { $eq: hit.id } });
      await deleteRow('gt_days', hit.id);
    }
    for (const d of guide.days) {
      const n = Math.round(Number(d.dayNumber)) || 0;
      if (!dayRows.some(r => r.dayNumber === n)) continue
      const ids = await createRows('gt_days', [{ trip_id: tripId, day_number: n, date: d.date || dayRows[0]?.date || '', title: d.title || '', place: '' }]);
      if (ids[0]) createdDays[n] = ids[0];
    }
  } else {
    await deleteRows('gt_activities', { trip_id: { $eq: tripId } });
    await deleteRows('gt_days', { trip_id: { $eq: tripId } });
    const startBase = opts.tripStartDate || dayRows[0]?.date || '';
    let seq = 0;
    for (const d of guide.days) {
      seq += 1;
      const date = d.date || (startBase ? offsetDate(startBase, seq - 1) : '');
      const ids = await createRows('gt_days', [{ trip_id: tripId, day_number: seq, date, title: d.title || '', place: '' }]);
      if (ids[0]) createdDays[seq] = ids[0];
    }
  }

  const acts: any[] = [];
  for (const d of guide.days) {
    const n = Math.round(Number(d.dayNumber)) || 0
    const dayId = createdDays[n]
    if (!dayId) continue;
    for (const a of d.activities || []) {
      acts.push({ trip_id: tripId, day_id: dayId, ...(a as any) });
    }
  }
  let actIds: string[] = [];
  if (acts.length) {
    const perDay: Record<string, number> = {};
    actIds = await createRows('gt_activities', acts.map(a => {
      perDay[a.day_id] = (perDay[a.day_id] || 0);
      return {
        trip_id: a.trip_id, day_id: a.day_id, sort: perDay[a.day_id]++,
        time: a.time || null, end_time: a.endTime || null,
        kind: (a.kind || 'sight'), title: a.title || '', place: a.place || '',
        lat: a.lat ?? null, lng: a.lng ?? null,
        cost: a.cost || 0, notes: a.notes || '', status: '待确认', assignee_member_id: null,
      };
    }));
  }

  // 回填坐标（高德代理，失败不影响行程）：idList 与 acts 顺序对应
  try {
    const items = actIds
      .map((id, i) => ({ id, title: acts[i]?.title || '', place: acts[i]?.place || '' }))
      .filter(x => x.id && x.title);
    if (items.length) {
      const geo = await proxy.post<{ coords: Record<string, { lat: number; lng: number }> }>('/api/poi/geocode', { items });
      for (const [id, c] of Object.entries(geo.coords || {})) {
        await updateRow('gt_activities', id, { lat: c.lat, lng: c.lng });
      }
    }
  } catch { /* 定位失败不影响行程 */ }

  await logActivity(tripId, memberName, opts.targeted ? 'AI 重写了部分行程' : 'AI 重写了全部行程');
  return { replacedDays: [...touched], activityCount: acts.length };
}
