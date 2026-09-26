import { useState } from 'react';
import { useApp } from '../../store';
import { Modal, Avatar } from '../../components/ui';
import { createMember, deleteMember } from '../../rdb/ops';
import type { TabCtx } from './tabCtx';

export default function MembersTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const { trip, members } = bundle;
  const [addOpen, setAddOpen] = useState(false);
  const me = members[0]; // 单主人：第一个成员即发起人（当前用户）

  const removeMember = async (id: string, name: string) => {
    if (!confirm(`确定移除「${name}」？`)) return;
    try {
      await deleteMember(trip.id, id, name, me?.displayName || '我');
      toast('已移除');
      reload();
    } catch (e) { toast(e instanceof Error ? e.message : '移除失败', true); }
  };

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 6 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>同行伙伴 · {members.length} 人</h2>
        {canEdit && <button className="btn sm primary" onClick={() => setAddOpen(true)}>＋ 添加伙伴</button>}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 14 }}>
        无需对方装 App，添加称呼即可参与记账分摊与物品指派。
      </p>

      {/* 成员卡片 */}
      <div className="member-grid">
        {members.map(m => (
          <div className="card member-card" key={m.id}>
            <div className="row">
              <Avatar name={m.displayName} color={m.avatarColor} size="lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">
                  {m.displayName}
                  {m.id === me?.id && <span className="tag orange" style={{ marginLeft: 7 }}>👑 发起人</span>}
                </div>
              </div>
            </div>
            <div className="ops">
              {canEdit && m.id !== me?.id && (
                <button className="btn sm danger" onClick={() => removeMember(m.id, m.displayName)}>移除</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 添加成员弹窗 */}
      {addOpen && (
        <AddMemberModal
          tripId={trip.id}
          memberName={me?.displayName || '我'}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

/* ---------- 添加成员（占位同伴：只填称呼） ---------- */
function AddMemberModal({ tripId, memberName, onClose, onSaved }: {
  tripId: string; memberName: string; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useApp();
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy) return;
    if (!displayName.trim()) { toast('请填写成员名称', true); return; }
    setBusy(true);
    try {
      await createMember(tripId, displayName.trim(), memberName);
      toast('已添加同伴');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="添加同行伙伴" onClose={onClose} width={430}>
      <div className="field">
        <label>成员名称</label>
        <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)}
          placeholder="例如：妈妈、大学同学小周" maxLength={20} />
        <span className="muted">无需对方装 App，添加称呼即可参与记账分摊与物品指派。</span>
      </div>
      <div className="modal-ops">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={add} disabled={busy}>{busy ? '添加中…' : '添加'}</button>
      </div>
    </Modal>
  );
}
