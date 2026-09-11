import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import { Avatar, AVATAR_COLORS } from '../components/ui';

export default function SettingsPage() {
  const { me, toast, loadMe } = useApp();
  const [nickname, setNickname] = useState(me?.nickname || '');
  const [bio, setBio] = useState(me?.bio || '');
  const [color, setColor] = useState(me?.avatarColor || '#2f6e4f');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ enabled: boolean }>('/api/ai/status').then(r => setAiEnabled(r.enabled)).catch(() => setAiEnabled(false));
  }, []);

  if (!me) return null;

  const saveProfile = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch('/api/me', { nickname: nickname.trim(), bio: bio.trim(), avatarColor: color });
      await loadMe();
      toast('资料已保存');
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const savePwd = async () => {
    if (busy) return;
    if (newPwd.length < 6) { toast('新密码至少 6 位', true); return; }
    setBusy(true);
    try {
      await api.patch('/api/me', { oldPassword: oldPwd, newPassword: newPwd });
      setOldPwd(''); setNewPwd('');
      toast('密码已修改');
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1 style={{ color: 'var(--green-deep)' }}>我的</h1>
      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <Avatar name={nickname || me.nickname} color={color} size="lg" />
          <div>
            <b style={{ fontSize: 17 }}>{nickname || me.nickname}</b>
            <div className="muted" style={{ fontFamily: 'var(--mono)' }}>
              旅行ID {me.travelId} · 把这个号码告诉朋友，TA 就能直接把你加进旅程
            </div>
          </div>
        </div>
        <div className="field">
          <label>昵称</label>
          <input className="input" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20} />
        </div>
        <div className="field">
          <label>个性签名</label>
          <input className="input" value={bio} onChange={e => setBio(e.target.value)} maxLength={120} placeholder="一句话介绍自己" />
        </div>
        <div className="field">
          <label>头像颜色</label>
          <div className="row-ops">
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--ink)' : '1px solid var(--line-strong)' }} />
            ))}
          </div>
        </div>
        <button className="btn primary" onClick={saveProfile} disabled={busy}>保存资料</button>
      </div>

      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>修改密码</h3>
        <div className="field">
          <label>原密码</label>
          <input className="input" type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="field">
          <label>新密码（至少 6 位）</label>
          <input className="input" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" />
        </div>
        <button className="btn" onClick={savePwd} disabled={busy || !oldPwd || !newPwd}>修改密码</button>
      </div>

      <div className="card" style={{ padding: '20px 22px' }}>
        <h3 style={{ marginTop: 0 }}>AI 能力</h3>
        <p className="muted" style={{ lineHeight: 1.8 }}>
          {aiEnabled === null ? '检测中…' : aiEnabled
            ? '✅ 已接入 AI 大模型：行程生成与攻略解析由 AI 完成。'
            : '⚙️ 当前使用内置智能模板（无需配置即可用）。若想接入真实大模型，在服务器环境变量中配置 GOTRIP_AI_BASE_URL / GOTRIP_AI_API_KEY / GOTRIP_AI_MODEL 即可，支持智谱 GLM、DeepSeek、通义千问等所有 OpenAI 兼容接口。'}
        </p>
        <p className="muted">
          同样支持高德开放平台：配置 GOTRIP_AMAP_KEY 后，地点搜索将从内置景点库切换为高德 POI 全量搜索。
        </p>
      </div>
    </div>
  );
}
