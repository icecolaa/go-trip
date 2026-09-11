import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../store';

export default function LoginPage() {
  const { login, register, toast } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(username, password);
        toast('欢迎回来');
      } else {
        await register(username, password, nickname);
        toast('注册成功，开始规划第一段旅程吧');
      }
      nav(redirect, { replace: true });
    } catch (err: any) {
      toast(err.message || '出错了', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div style={{ textAlign: 'center', fontSize: 40 }}>🧭</div>
        <h1 className="auth-title">出发吧 GoTrip</h1>
        <p className="auth-sub">和朋友一起，规划每一次出发</p>
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>登录</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>注册</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="field">
              <label>昵称</label>
              <input className="input" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="旅途中怎么称呼你" maxLength={20} />
            </div>
          )}
          <div className="field">
            <label>用户名</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="3-24 位字母、数字或下划线" autoComplete="username" />
          </div>
          <div className="field">
            <label>密码</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>
          <button className="btn primary lg" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
            {busy ? '请稍等…' : mode === 'login' ? '登录' : '注册并开始'}
          </button>
        </form>
        <div className="demo-hint">
          演示账号：demo　密码：demo1234
        </div>
      </div>
    </div>
  );
}
