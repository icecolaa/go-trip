import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../store';

export default function LoginPage() {
  const { login, loginAnonymously, toast } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await login(username, password);
      toast('欢迎回来');
      nav(redirect, { replace: true });
    } catch (err: any) {
      toast(err.message || '出错了', true);
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await loginAnonymously();
      toast('已进入游客模式，数据保存在本设备身份下');
      nav(redirect, { replace: true });
    } catch (err: any) {
      toast(err.message || '游客登录失败', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div style={{ textAlign: 'center', fontSize: 40 }}>🧭</div>
        <h1 className="auth-title">出发吧 GoTrip</h1>
        <p className="auth-sub">规划每一次出发</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>用户名</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="用户名" autoComplete="username" />
          </div>
          <div className="field">
            <label>密码</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" />
          </div>
          <button className="btn primary lg" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
            {busy ? '请稍等…' : '登录'}
          </button>
        </form>
        <div className="demo-hint">
          没有账号？<button className="link" onClick={guest} disabled={busy}>游客模式先玩起来</button>（正式账号由管理员在后台开通）
        </div>
      </div>
    </div>
  );
}
