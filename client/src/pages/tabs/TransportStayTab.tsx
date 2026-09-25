import { useMemo, useState } from 'react';
import type { TripBundle } from '../../api';
import type { TabCtx } from './tabCtx';
import { Modal, fmtDate, weekOf, yuan } from '../../components/ui';
import StatusPicker, { StatusBadge } from '../../components/StatusPicker';
import SensitiveText from '../../components/SensitiveText';
import { amapPlaceUrl } from '../../components/TripMode';
import { api } from '../../api';
import { cashMoney } from './CashTab';

/**
 * 交通住宿：只重组现有行程条目（kind=transport / kind=hotel）的呈现，
 * 不新增数据源、不改写正式行程。
 *  - 交通：按日期+时间排序的票卡，突出航班号/出发抵达时间/机场/确认状态
 *  - 住宿：按入住日期排序，显示名称/城市/时间/地址/付款提醒/导航入口
 */

/** 从标题里提取航班号/车次（CA1234 / MU5102 / G807 / D1234 等） */
function extractCode(title: string, notes: string): string {
  const m = `${title} ${notes}`.match(/\b([A-Z]{2}\d{3,4}|[GDCTZK]\d{1,4})\b/);
  return m ? m[1] : '';
}

/** 跨日判断：标题/备注里出现「次日」「+1」「第二天」即视为次日抵达 */
function isNextDay(title: string, notes: string): boolean {
  return /次日|\+1\s*天|第二天/.test(`${title} ${notes}`);
}

export default function TransportStayTab({ bundle, canEdit, reload }: TabCtx) {
  const { trip } = bundle;
  const [sub, setSub] = useState<'transport' | 'stay'>('transport');
  const [editing, setEditing] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);

  const dayById = useMemo(() => new Map(bundle.days.map(d => [d.id, d])), [bundle.days]);
  const cashByRef = useMemo(() => {
    const m = new Map<string, typeof bundle.cash>();
    for (const c of bundle.cash) {
      if (!c.refId || !c.refKind) continue;
      const k = `${c.refKind}:${c.refId}`;
      m.set(k, [...(m.get(k) || []), c]);
    }
    return m;
  }, [bundle.cash]);

  const sorted = useMemo(() => [...bundle.activities].sort((a, b) => {
    const da = dayById.get(a.dayId)?.date || '';
    const db = dayById.get(b.dayId)?.date || '';
    if (da !== db) return da.localeCompare(db);
    return (a.time || '99:99').localeCompare(b.time || '99:99');
  }), [bundle.activities, dayById]);

  const transports = sorted.filter(a => a.kind === 'transport');
  const stays = sorted.filter(a => a.kind === 'hotel');

  async function saveStatus(activityId: number, status: string | null) {
    setEditing(null);
    try {
      await api.patch(`/api/activities/${activityId}`, { status });
      await reload();
    } catch (e: any) {
      alert(e.message || '保存失败');
    }
  }

  return (
    <div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${sub === 'transport' ? 'on' : ''}`} onClick={() => setSub('transport')}>
          ✈️ 交通（{transports.length}）
        </button>
        <button className={`chip ${sub === 'stay' ? 'on' : ''}`} onClick={() => setSub('stay')}>
          🏨 住宿（{stays.length}）
        </button>
      </div>

      {sub === 'transport' && (
        transports.length === 0 ? <div className="card empty">还没有交通安排——在「行程」里添加类型为「交通」的条目，这里会自动汇总成票卡</div>
          : transports.map(a => {
            const day = dayById.get(a.dayId);
            const code = extractCode(a.title, a.notes);
            const nextDay = isNextDay(a.title, a.notes);
            const cash = cashByRef.get(`transport:${a.id}`) || [];
            return (
              <article className="ticket" key={a.id}>
                <div className="ticket-head">
                  <span className="ticket-kind">交通</span>
                  <span className="ticket-date">{day ? `${fmtDate(day.date)} ${weekOf(day.date)}` : ''}</span>
                  {code && <span className="ticket-code">{code}</span>}
                  <StatusBadge status={a.status} />
                  {nextDay && <span className="ticket-nextday">次日抵达</span>}
                </div>
                <div className="ticket-route">
                  <span className="ticket-node">
                    <span className="ticket-time">{a.time || '时间待定'}</span>
                    <span className="ticket-place">{a.place || '出发地待定'}</span>
                  </span>
                  <span className="ticket-arrow" aria-hidden="true">→</span>
                  <span className="ticket-node">
                    <span className="ticket-time">{a.endTime || '抵达待定'}</span>
                    <span className="ticket-place">{nextDay ? '次日 · ' : ''}{a.title.replace(/\s*[✈→➜]\s*/g, ' ')}</span>
                  </span>
                </div>
                {a.notes && <p className="ticket-notes"><SensitiveText text={a.notes} /></p>}
                {a.cost > 0 && <div className="ticket-meta"><span>预估 <b>{yuan(a.cost)}</b></span></div>}
                {cash.length > 0 && (
                  <div className="ticket-meta">
                    {cash.map(c => (
                      <span key={c.id} className="cash-inline">
                        💴 {c.title}：{cashMoney(c)}
                        {c.perPerson ? `（${c.currency === 'CNY' ? '¥' : ''}${c.amount}×${c.people}人）` : ''}
                      </span>
                    ))}
                  </div>
                )}
                <div className="ticket-ops">
                  {(a.lat != null && a.lng != null) && (
                    <a className="btn sm ghost" href={amapPlaceUrl(a.title, a.place, a.lat, a.lng, day?.place || trip.destination || '')} target="_blank" rel="noreferrer">导航</a>
                  )}
                  {canEdit && (
                    <button className="btn sm ghost" onClick={() => { setEditing(a.id); setDraftStatus(a.status || null); }}>改状态</button>
                  )}
                </div>
              </article>
            );
          })
      )}

      {sub === 'stay' && (
        stays.length === 0 ? <div className="card empty">还没有住宿安排——在「行程」里添加类型为「住宿」的条目，这里会按入住日期汇总</div>
          : stays.map(a => {
            const day = dayById.get(a.dayId);
            const cash = cashByRef.get(`stay:${a.id}`) || [];
            return (
              <article className="stay-card" key={a.id}>
                <div className="ticket-head">
                  <span className="ticket-kind">住宿</span>
                  <span className="ticket-date">{day ? `入住 ${fmtDate(day.date)} ${weekOf(day.date)}` : '入住日期待定'}</span>
                  <StatusBadge status={a.status} />
                </div>
                <div className="stay-name">{a.title}</div>
                <div className="stay-rows">
                  <div><span className="k">城市</span>{day?.place || trip.destination || '待定'}</div>
                  <div><span className="k">时间</span>{a.time || '待定'}{a.endTime ? ` ~ ${a.endTime}` : '（退房时间待定）'}</div>
                  <div><span className="k">地址</span>{a.place || '待补充'}</div>
                  <div><span className="k">付款提醒</span>{a.cost > 0 ? `预估 ${yuan(a.cost)}，到店/线上确认付款方式` : '待确认付款方式'}</div>
                </div>
                {a.notes && <p className="ticket-notes"><SensitiveText text={a.notes} /></p>}
                {cash.length > 0 && (
                  <div className="ticket-meta">
                    {cash.map(c => (
                      <span key={c.id} className="cash-inline">
                        💴 {c.title}：{cashMoney(c)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="ticket-ops">
                  {(a.lat != null && a.lng != null) && (
                    <a className="btn sm ghost" href={amapPlaceUrl(a.title, a.place, a.lat, a.lng, day?.place || trip.destination || '')} target="_blank" rel="noreferrer">导航</a>
                  )}
                  {canEdit && (
                    <button className="btn sm ghost" onClick={() => { setEditing(a.id); setDraftStatus(a.status || null); }}>改状态</button>
                  )}
                </div>
              </article>
            );
          })
      )}

      {editing != null && (
        <Modal title="设置确认状态" onClose={() => setEditing(null)} width={460}>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            「现场选择」「可选」「暂定」不影响主行程，不会进入待确认中心。
          </p>
          <StatusPicker value={draftStatus as any} canEdit onChange={v => setDraftStatus(v)} />
          <div className="modal-ops">
            <button className="btn ghost" onClick={() => setEditing(null)}>取消</button>
            <button className="btn" onClick={() => saveStatus(editing, draftStatus)}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
