import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';

/* ============ 使用助手：全站悬浮 AI 问答（解答 GoTrip 使用问题） ============ */

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: ChatTurn = {
  role: 'assistant',
  content: '你好！我是 GoTrip 使用助手 👋\n可以问我任何使用问题，比如「怎么邀请朋友」「预算怎么分摊」「AI 助手能做什么」。',
};

const QUICK_QUESTIONS = ['怎么邀请朋友加入？', '预算怎么分摊结算？', 'AI 助手能做什么？', '出发模式是什么？', '怎么分享给别人看？'];

export default function UsageAssistant() {
  const { me } = useApp();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 新消息自动滚到底部
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [turns, busy, open]);

  if (!me) return null;

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...turns, { role: 'user' as const, content }];
    setTurns(history);
    setInput('');
    setBusy(true);
    try {
      const r = await api.post<{ reply: string; source: string }>('/api/assistant', {
        messages: history.filter(t => t !== GREETING).slice(-10),
      });
      setTurns(prev => [...prev, { role: 'assistant', content: r.reply }]);
    } catch (e: any) {
      setTurns(prev => [...prev, { role: 'assistant', content: e.message || '助手暂时联系不上，请稍后再试' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button className="ua-fab" onClick={() => setOpen(true)} title="使用助手" aria-label="打开使用助手">
          💬<span className="ua-fab-label">助手</span>
        </button>
      )}
      {open && (
        <section className="ua-panel" aria-label="使用助手">
          <header className="ua-head">
            <div>
              <div className="kicker">GOTRIP ASSISTANT</div>
              <b>使用助手</b>
            </div>
            <button className="ua-close" onClick={() => setOpen(false)} aria-label="关闭助手">×</button>
          </header>

          <div className="ua-msgs" ref={listRef}>
            {turns.map((t, i) => (
              <div key={i} className={'ua-msg ' + t.role}>
                <div className="ua-bubble">{t.content}</div>
              </div>
            ))}
            {busy && (
              <div className="ua-msg assistant">
                <div className="ua-bubble ua-typing">正在思考<span className="ua-dots"><i /><i /><i /></span></div>
              </div>
            )}
            {turns.length <= 1 && !busy && (
              <div className="ua-chips">
                {QUICK_QUESTIONS.map(q => (
                  <button key={q} className="chip" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            )}
          </div>

          <footer className="ua-inputrow">
            <input
              className="input"
              value={input}
              placeholder="输入使用问题，回车发送"
              maxLength={500}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input); }}
              disabled={busy}
            />
            <button className="btn primary sm" onClick={() => send(input)} disabled={busy || !input.trim()}>发送</button>
          </footer>
        </section>
      )}
    </>
  );
}
