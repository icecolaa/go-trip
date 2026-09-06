import { useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Modal, Avatar, timeAgo } from '../../components/ui';
import { wgs84ToGcj02 } from '../../components/gcj02';
import type { TabCtx } from './tabCtx';
import type { MemberRole } from '@shared/types';

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: '发起人', admin: '管理员', editor: '成员', viewer: '观察者',
};
const ROLE_DESC: Record<MemberRole, string> = {
  owner: '全部权限，可解散与转让',
  admin: '管理成员、邀请、编辑全部内容',
  editor: '编辑行程、记账、清单、日志',
  viewer: '只看不改',
};

export default function MembersTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const { trip, members, invites, myRole } = bundle;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [transferring, setTransferring] = useState<{ id: number; name: string } | null>(null);

  const shareUrl = trip.shareToken ? `${location.origin}${location.pathname}#/s/${trip.shareToken}` : null;

  const changeRole = async (memberId: number, role: MemberRole) => {
    try {
      await api.patch(`/api/trips/${trip.id}/members/${memberId}`, { role });
      toast('角色已更新');
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  const removeMember = async (id: number, name: string) => {
    if (!confirm(`确定移除「${name}」？TA 将无法再查看此旅程。`)) return;
    try {
      await api.del(`/api/trips/${trip.id}/members/${id}`);
      toast('已移除');
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  const transfer = async () => {
    if (!transferring) return;
    try {
      await api.post(`/api/trips/${trip.id}/transfer`, { memberId: transferring.id });
      toast(`已把发起人转让给 ${transferring.name}`);
      setTransferring(null);
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  const shareLocation = () => {
    if (!navigator.geolocation) { toast('浏览器不支持定位', true); return; }
    toast('正在获取位置…');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const [lat, lng] = wgs84ToGcj02(pos.coords.latitude, pos.coords.longitude);
        try {
          await api.post(`/api/trips/${trip.id}/location`, { lat, lng, city: `经纬度 ${lat.toFixed(2)}, ${lng.toFixed(2)}` });
          toast('位置已共享给全体成员 📍');
          reload();
        } catch (e: any) { toast(e.message, true); }
      },
      () => toast('定位失败，请检查浏览器权限', true),
      { timeout: 8000 }
    );
  };

  const toggleShareLink = async (enable: boolean) => {
    try {
      await api.post(`/api/trips/${trip.id}/share`, { enable });
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 14 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>旅行成员 · {members.length} 人</h2>
        <button className="btn sm" onClick={shareLocation}>📍 共享我的位置</button>
        {isAdmin && <button className="btn sm" onClick={() => setInviteOpen(true)}>🔗 邀请好友</button>}
        {isAdmin && <button className="btn sm primary" onClick={() => setAddOpen(true)}>＋ 添加成员</button>}
      </div>

      {/* 成员卡片 */}
      <div className="member-grid">
        {members.map(m => {
          const online = m.userId != null && bundle.onlineMemberIds.includes(m.userId);
          return (
            <div className="card member-card" key={m.id}>
              {online && <span className="online-badge"><span className="dot" />在线</span>}
              <div className="row">
                <Avatar name={m.displayName} color={m.avatarColor} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name">
                    {m.displayName}
                    {m.role === 'owner' && <span className="tag orange" style={{ marginLeft: 7 }}>👑 发起人</span>}
                    {m.userId == null && <span className="tag gray" style={{ marginLeft: 7 }}>占位</span>}
                  </div>
                  <div className="tid">
                    {m.user ? `旅行ID ${m.user.travelId}` : '尚未绑定账号，邀请后自动关联'}
                  </div>
                </div>
              </div>

              {m.location && (
                <div className="loc">
                  📍 {m.location}
                  <span className="muted" style={{ marginLeft: 6 }}>{m.locationAt ? timeAgo(m.locationAt) : ''}</span>
                </div>
              )}

              <div className="ops">
                {isAdmin && m.role !== 'owner' && (
                  <select className="role-select" value={m.role} onChange={e => changeRole(m.id, e.target.value as MemberRole)}>
                    {(['admin', 'editor', 'viewer'] as MemberRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                )}
                {myRole === 'owner' && m.role !== 'owner' && m.userId != null && (
                  <button className="btn sm" onClick={() => setTransferring({ id: m.id, name: m.displayName })}>转让发起人</button>
                )}
                {isAdmin && m.role !== 'owner' && (
                  <button className="btn sm danger" onClick={() => removeMember(m.id, m.displayName)}>移除</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: '13px 18px', marginTop: 16 }}>
        <b style={{ fontSize: 13.5 }}>角色说明</b>
        <div className="muted" style={{ marginTop: 6, lineHeight: 1.9 }}>
          {(['owner', 'admin', 'editor', 'viewer'] as MemberRole[]).map(r => (
            <span key={r} style={{ marginRight: 16 }}><span className="tag gray">{ROLE_LABEL[r]}</span> {ROLE_DESC[r]}</span>
          ))}
        </div>
      </div>

      {/* 分享链接（只读） */}
      <h3 className="section-title">🔗 对外分享</h3>
      <div className="card invite-panel">
        {shareUrl ? (
          <>
            <div className="row-ops">
              <div className="link-line" style={{ flex: 1 }}><span>{shareUrl}</span></div>
              <button className="btn sm" onClick={() => { navigator.clipboard.writeText(shareUrl); toast('链接已复制，发给朋友吧'); }}>复制链接</button>
              {isAdmin && <button className="btn sm danger" onClick={() => toggleShareLink(false)}>关闭分享</button>}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>拿到链接的人无需登录即可查看行程（只读），看不到账目与清单。</div>
          </>
        ) : (
          <div className="row-ops">
            <span className="muted" style={{ flex: 1 }}>开启后生成只读链接，适合发给长辈或不需要协作的同行人。</span>
            {isAdmin && <button className="btn sm primary" onClick={() => toggleShareLink(true)}>开启分享链接</button>}
          </div>
        )}
      </div>

      {/* 邀请链接管理 */}
      {invites.length > 0 && (
        <>
          <h3 className="section-title">已创建的邀请</h3>
          <div className="ticket">
            {invites.map(inv => (
              <div key={inv.id} className="ticket-row">
                <span className="tag orange" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{inv.code}</span>
                <div style={{ flex: 1 }} className="muted">
                  {inv.maxUses > 0 ? `限 ${inv.maxUses} 次` : '不限次数'} · 已用 {inv.uses} 次
                  {inv.expiresAt ? ` · ${new Date(inv.expiresAt).toLocaleDateString('zh-CN')} 过期` : ' · 永久有效'}
                </div>
                <button className="btn sm" onClick={() => {
                  const url = `${location.origin}${location.pathname}#/join/${inv.code}`;
                  navigator.clipboard.writeText(`【邀请你加入旅程「${trip.title}」】\n邀请码：${inv.code}\n链接：${url}`);
                  toast('邀请语已复制，去微信粘贴吧');
                }}>复制邀请</button>
                <button className="btn sm ghost" style={{ color: 'var(--red)' }} onClick={async () => {
                  await api.del(`/api/invites/${inv.id}`); reload();
                }}>作废</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 添加成员弹窗 */}
      {addOpen && (
        <AddMemberModal
          tripId={trip.id}
          existingUserIds={members.map(m => m.userId)}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); reload(); }}
        />
      )}

      {/* 创建邀请弹窗 */}
      {inviteOpen && (
        <InviteModal
          tripId={trip.id}
          onClose={() => setInviteOpen(false)}
          onSaved={() => { setInviteOpen(false); reload(); }}
        />
      )}

      {/* 转让确认 */}
      {transferring && (
        <Modal title="转让发起人" onClose={() => setTransferring(null)}>
          <p style={{ lineHeight: 1.8, fontSize: 14 }}>
            确定把「{trip.title}」的发起人转让给 <b>{transferring.name}</b>？<br />
            <span className="muted">转让后你将成为管理员，发起人拥有删除旅程等全部权限。</span>
          </p>
          <div className="modal-ops">
            <button className="btn" onClick={() => setTransferring(null)}>再想想</button>
            <button className="btn primary" onClick={transfer}>确认转让</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- 添加成员 ---------- */
function AddMemberModal({ tripId, existingUserIds, onClose, onSaved }: {
  tripId: number; existingUserIds: (number | null)[]; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useApp();
  const [mode, setMode] = useState<'travelId' | 'name'>('travelId');
  const [travelId, setTravelId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'travelId') {
        if (!travelId.trim()) { toast('请输入对方的旅行 ID', true); setBusy(false); return; }
        const r = await api.post(`/api/trips/${tripId}/members`, { travelId: Number(travelId) });
        toast(`已添加成员（${(r as any).displayName}）`);
      } else {
        if (!displayName.trim()) { toast('请填写成员名称', true); setBusy(false); return; }
        await api.post(`/api/trips/${tripId}/members`, { displayName: displayName.trim() });
        toast('已添加占位成员，对方加入后可绑定');
      }
      onSaved();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="添加旅行成员" onClose={onClose} width={430}>
      <div className="auth-tabs">
        <button className={mode === 'travelId' ? 'on' : ''} onClick={() => setMode('travelId')}>用旅行 ID 添加</button>
        <button className={mode === 'name' ? 'on' : ''} onClick={() => setMode('name')}>只填名称占位</button>
      </div>
      {mode === 'travelId' ? (
        <div className="field">
          <label>对方的旅行 ID</label>
          <input className="input" value={travelId} onChange={e => setTravelId(e.target.value.replace(/\D/g, ''))}
            placeholder="6 位数字，可在「我的」页面查看" maxLength={6} />
          <span className="muted">添加后头像和昵称跟随对方账号。</span>
        </div>
      ) : (
        <div className="field">
          <label>成员名称</label>
          <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="例如：妈妈、大学同学小周" maxLength={20} />
          <span className="muted">适合还没注册的家人朋友；对方之后通过邀请链接加入时会自动绑定到这个占位上。</span>
        </div>
      )}
      <div className="modal-ops">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={add} disabled={busy}>{busy ? '添加中…' : '添加'}</button>
      </div>
    </Modal>
  );
}

/* ---------- 创建邀请 ---------- */
function InviteModal({ tripId, onClose, onSaved }: { tripId: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [maxUses, setMaxUses] = useState('');
  const [expiresDays, setExpiresDays] = useState('7');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const inv = await api.post<{ code: string }>(`/api/trips/${tripId}/invites`, {
        maxUses: Number(maxUses) || 0, expiresDays: Number(expiresDays) || 0,
      });
      const url = `${location.origin}${location.pathname}#/join/${inv.code}`;
      navigator.clipboard.writeText(`【邀请你加入旅程】\n邀请码：${inv.code}\n链接：${url}`)
        .then(() => toast('邀请已创建并复制到剪贴板'))
        .catch(() => toast(`邀请码 ${inv.code} 已创建`));
      onSaved();
    } catch (e: any) {
      toast(e.message, true);
      setBusy(false);
    }
  };

  return (
    <Modal title="创建邀请" onClose={onClose} width={420}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>限用次数</label>
          <select className="input" value={maxUses} onChange={e => setMaxUses(e.target.value)}>
            <option value="">不限次数</option>
            <option value="1">仅 1 次</option>
            <option value="5">5 次</option>
            <option value="10">10 次</option>
          </select>
        </div>
        <div className="field">
          <label>有效期</label>
          <select className="input" value={expiresDays} onChange={e => setExpiresDays(e.target.value)}>
            <option value="1">1 天</option>
            <option value="7">7 天</option>
            <option value="30">30 天</option>
            <option value="">永久有效</option>
          </select>
        </div>
      </div>
      <p className="muted" style={{ lineHeight: 1.7 }}>
        把邀请码或链接发给朋友（微信直接粘贴），对方注册/登录后即可加入旅程，并自动绑定占位成员。
      </p>
      <div className="modal-ops">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={create} disabled={busy}>{busy ? '创建中…' : '创建并复制邀请'}</button>
      </div>
    </Modal>
  );
}
