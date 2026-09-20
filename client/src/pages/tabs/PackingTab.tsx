import { useMemo, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Modal } from '../../components/ui';
import { CashSection } from './CashTab';
import type { TabCtx } from './tabCtx';
import SensitiveText from '../../components/SensitiveText';

/** 六类清单：现金准备与待确认由独立板块/接口提供，这里只列物品与待办 */
const CATS = ['必带物品', '建议携带', '个人携带', '出发前待办', '其他'];
const CAT_ICONS: Record<string, string> = { 必带物品: '🎒', 建议携带: '💡', 个人携带: '🧑', 出发前待办: '✅', 其他: '📦' };
const TEMPLATES = [
  { id: 'basic', name: '国内经典游', emoji: '🧳', desc: '首次出行的万能清单' },
  { id: 'beach', name: '海岛度假', emoji: '🏝️', desc: '三亚、东南亚海岛' },
  { id: 'hiking', name: '徒步登山', emoji: '🥾', desc: '雪山、高原徒步' },
  { id: 'citywalk', name: '城市漫游', emoji: '☕', desc: '轻装 Citywalk' },
  { id: 'parent', name: '亲子出游', emoji: '🍼', desc: '带娃出行全覆盖' },
  { id: 'winter', name: '冰雪旅行', emoji: '⛷️', desc: '东北看雪、滑雪' },
];

/** 本机勾选状态（不随服务端 reload 覆盖；换设备不同步，属预期） */
function localKey(tripId: number, itemId: number): string { return `gotrip_pack_${tripId}_${itemId}`; }

export default function PackingTab({ bundle, reload, reloadWeather, weather, canEdit, goTab }: TabCtx) {
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState<'' | 'trip' | 'list' | 'all'>('');
  const { packing, members, trip } = bundle;
  const byMember = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  /** 勾选态：服务端 done 与本机 localStorage 取或（本机勾过即视为已就绪） */
  const isDone = (id: number, done: boolean) => done || localStorage.getItem(localKey(trip.id, id)) === '1';
  const doneCount = packing.filter(p => isDone(p.id, p.done)).length;
  const pct = packing.length ? Math.round((doneCount / packing.length) * 100) : 0;

  const toggle = async (id: number, done: boolean) => {
    // 本机勾选只写 localStorage，不打扰服务端（多人协作时各自记录自己的进度）
    try { localStorage.setItem(localKey(trip.id, id), done ? '1' : '0'); } catch { /* 隐私模式 */ }
    if (done !== undefined) {
      try { await api.patch(`/api/packing/${id}`, { done }); } catch (e: any) { toast(e.message, true); }
    }
    reload();
  };

  const assign = async (id: number, memberId: number | null) => {
    try {
      await api.patch(`/api/packing/${id}`, { assigneeMemberId: memberId });
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  const remove = async (id: number) => {
    try {
      await api.del(`/api/packing/${id}`);
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  /** 三类清除：各自二次确认；主题设置（localStorage 的 gotrip_theme）一律保留不动 */
  const doClear = (which: 'trip' | 'list' | 'all') => {
    setConfirmClear('');
    try {
      const prefix = `gotrip_pack_${trip.id}_`;
      if (which === 'trip' || which === 'all') {
        // 清除行程进度：把服务端 done 全部置回未完成
        packing.filter(p => p.done).forEach(p => api.patch(`/api/packing/${p.id}`, { done: false }).catch(() => undefined));
      }
      if (which === 'list' || which === 'all') {
        for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
      }
      if (which === 'all') {
        // 连本机其他行程的清单勾选一起清掉（仍不动主题）
        for (const k of Object.keys(localStorage)) if (k.startsWith('gotrip_pack_')) localStorage.removeItem(k);
      }
    } finally {
      toast(which === 'trip' ? '已清除行程进度' : which === 'list' ? '已清除本机清单勾选' : '已清除全部进度');
      reload();
    }
  };

  const applyTemplate = async (tplId: string) => {
    try {
      const r = await api.post<{ added: number }>(`/api/trips/${bundle.trip.id}/packing/template`, { template: tplId });
      toast(`已导入 ${r.added} 件物品`);
      setTemplateOpen(false);
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 14 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>出发准备清单</h2>
        <span className="tag" style={{ fontSize: 13 }}>{doneCount} / {packing.length} 已就绪</span>
        {canEdit && (
          <>
            <button className="btn sm" onClick={() => setTemplateOpen(true)}>📋 从模板导入</button>
            <button className="btn sm primary" onClick={() => setAdding(true)}>＋ 添加物品</button>
          </>
        )}
      </div>

      {packing.length > 0 && (
        <div className="pack-progress">
          <div className="bar"><div style={{ width: `${pct}%` }} /></div>
          <div className="txt">总进度 {pct}% · 勾选状态保存在当前设备</div>
        </div>
      )}

      {packing.length === 0 ? (
        <div className="card empty">
          <span className="big">🎒</span>
          清单还是空的<br />从模板一键导入，再按人认领，谁都不会落下充电宝
        </div>
      ) : (
        <div className="packing-grid">
          {CATS.filter(c => packing.some(p => p.category === c || (c === '其他' && !CATS.includes(p.category)))).map(cat => {
            const items = packing.filter(p => p.category === cat || (cat === '其他' && !CATS.includes(p.category)));
            const done = items.filter(p => isDone(p.id, p.done)).length;
            return (
              <details className="card packing-cat pack-cat" key={cat} open={cat === CATS[0]}>
                <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                  <h4 style={{ display: 'inline' }}>{CAT_ICONS[cat] || '📦'} {cat}<span className="progress-pill">{done}/{items.length}</span></h4>
                </summary>
                {items.map(it => {
                  const assignee = it.assigneeMemberId ? byMember.get(it.assigneeMemberId) : null;
                  const done = isDone(it.id, it.done);
                  return (
                    <div className="packing-item" key={it.id}>
                      <input type="checkbox" checked={done} onChange={e => toggle(it.id, e.target.checked)} disabled={!canEdit} />
                      <span className={done ? 'done-text' : ''} style={{ flex: 1, minWidth: 0 }}>
                        {it.title}
                        {it.note && <span className="muted" style={{ marginLeft: 6 }}>· <SensitiveText text={it.note} /></span>}
                      </span>
                      {canEdit ? (
                        <select className="role-select assignee" value={it.assigneeMemberId || ''} onChange={e => assign(it.id, e.target.value ? Number(e.target.value) : null)}>
                          <option value="">待认领</option>
                          {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                        </select>
                      ) : assignee ? (
                        <span className="tag gray assignee">{assignee.displayName}</span>
                      ) : null}
                      {canEdit && (
                        <button className="btn sm ghost" style={{ color: 'var(--red)', padding: '2px 6px' }} onClick={() => remove(it.id)}>×</button>
                      )}
                    </div>
                  );
                })}
              </details>
            );
          })}
        </div>
      )}

      <div className="pack-clear-ops">
        <button className="btn sm ghost" onClick={() => setConfirmClear('trip')}>清除行程进度</button>
        <button className="btn sm ghost" onClick={() => setConfirmClear('list')}>清除清单进度</button>
        <button className="btn sm ghost" onClick={() => setConfirmClear('all')}>清除全部进度</button>
      </div>

      {/* 现金准备：清单的其中一类，与上面的物品类并列 */}
      <details className="card pack-cat" open={false} style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
          <h4 style={{ display: 'inline' }}>💴 现金准备<span className="progress-pill">{bundle.cash?.length || 0} 项</span></h4>
        </summary>
        <CashSection bundle={bundle} reload={reload} reloadWeather={reloadWeather} weather={weather} canEdit={canEdit} goTab={goTab} />
      </details>

      {adding && (
        <AddPackingModal
          tripId={bundle.trip.id}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); reload(); }}
        />
      )}
      {templateOpen && (
        <Modal title="选择打包模板" onClose={() => setTemplateOpen(false)} width={500}>
          <div className="trip-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {TEMPLATES.map(t => (
              <div key={t.id} className="card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => applyTemplate(t.id)}>
                <div style={{ fontSize: 26 }}>{t.emoji}</div>
                <b>{t.name}</b>
                <div className="muted" style={{ marginTop: 3 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {confirmClear && (
        <Modal title="确认清除" onClose={() => setConfirmClear('')} width={420}>
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            {confirmClear === 'trip' && '将把本旅程所有已勾选的物品重置为未完成，团队里其他人也会看到变化。'}
            {confirmClear === 'list' && '将清空你在这台设备上对本旅程清单的勾选记录，不影响团队其他人的勾选。'}
            {confirmClear === 'all' && '将清空你在本机所有旅程的清单勾选记录，并重置本旅程的勾选状态。'}
          </p>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>主题（浅色/深色）设置会保留，不受影响。</p>
          <div className="modal-ops">
            <button className="btn ghost" onClick={() => setConfirmClear('')}>取消</button>
            <button className="btn primary" onClick={() => doClear(confirmClear)}>确认清除</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddPackingModal({ tripId, onClose, onSaved }: { tripId: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('其他');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || busy) { toast('写一下物品名称', true); return; }
    setBusy(true);
    try {
      await api.post(`/api/trips/${tripId}/packing`, { title: title.trim(), category, note: note.trim() });
      onSaved();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="添加物品" onClose={onClose}>
      <div className="field">
        <label>物品名称</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：充电宝" maxLength={60} />
      </div>
      <div className="field">
        <label>分类</label>
        <div className="row-ops">
          {CATS.map(c => (
            <button key={c} className={`btn sm ${category === c ? 'primary' : 'ghost'}`} onClick={() => setCategory(c)}>{CAT_ICONS[c]} {c}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>备注</label>
        <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="例如：不得超过 2 万毫安" maxLength={100} />
      </div>
      <div className="modal-ops">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? '保存中…' : '添加'}</button>
      </div>
    </Modal>
  );
}
