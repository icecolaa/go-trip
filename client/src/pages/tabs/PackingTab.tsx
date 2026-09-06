import { useMemo, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Modal } from '../../components/ui';
import type { TabCtx } from './tabCtx';

const CATS = ['证件', '衣物', '电子', '洗护', '药品', '其他'];
const CAT_ICONS: Record<string, string> = { 证件: '🪪', 衣物: '👕', 电子: '🔌', 洗护: '🧴', 药品: '💊', 其他: '📦' };
const TEMPLATES = [
  { id: 'basic', name: '国内经典游', emoji: '🧳', desc: '首次出行的万能清单' },
  { id: 'beach', name: '海岛度假', emoji: '🏝️', desc: '三亚、东南亚海岛' },
  { id: 'hiking', name: '徒步登山', emoji: '🥾', desc: '雪山、高原徒步' },
  { id: 'citywalk', name: '城市漫游', emoji: '☕', desc: '轻装 Citywalk' },
  { id: 'parent', name: '亲子出游', emoji: '🍼', desc: '带娃出行全覆盖' },
  { id: 'winter', name: '冰雪旅行', emoji: '⛷️', desc: '东北看雪、滑雪' },
];

export default function PackingTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const { packing, members } = bundle;
  const byMember = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const doneCount = packing.filter(p => p.done).length;

  const toggle = async (id: number, done: boolean) => {
    setBundleLocal(id, { done });
    try {
      await api.patch(`/api/packing/${id}`, { done });
    } catch (e: any) {
      toast(e.message, true);
    }
    reload();
  };

  // 乐观更新本地勾选状态
  const setBundleLocal = (_id: number, _patch: any) => { /* reload 会覆盖 */ };

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

      {packing.length === 0 ? (
        <div className="card empty">
          <span className="big">🎒</span>
          清单还是空的<br />从模板一键导入，再按人认领，谁都不会落下充电宝
        </div>
      ) : (
        <div className="packing-grid">
          {CATS.filter(c => packing.some(p => p.category === c)).map(cat => {
            const items = packing.filter(p => p.category === cat);
            const done = items.filter(p => p.done).length;
            return (
              <div className="card packing-cat" key={cat}>
                <h4>{CAT_ICONS[cat]} {cat}<span className="progress-pill">{done}/{items.length}</span></h4>
                {items.map(it => {
                  const assignee = it.assigneeMemberId ? byMember.get(it.assigneeMemberId) : null;
                  return (
                    <div className="packing-item" key={it.id}>
                      <input type="checkbox" checked={it.done} onChange={e => toggle(it.id, e.target.checked)} disabled={!canEdit} />
                      <span className={it.done ? 'done-text' : ''} style={{ flex: 1, minWidth: 0 }}>
                        {it.title}
                        {it.note && <span className="muted" style={{ marginLeft: 6 }}>· {it.note}</span>}
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
              </div>
            );
          })}
        </div>
      )}

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
