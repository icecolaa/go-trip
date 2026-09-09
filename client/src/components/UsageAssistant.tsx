import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';

/* ============ 使用助手：全站悬浮 AI 问答（可拖动 / 可隐藏） ============ */

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: ChatTurn = {
  role: 'assistant',
  content: '你好！我是 GoTrip 使用助手 👋\n可以问我任何使用问题，比如「怎么邀请朋友」「预算怎么分摊」「AI 助手能做什么」。',
};

const QUICK_QUESTIONS = ['怎么邀请朋友加入？', '预算怎么分摊结算？', 'AI 助手能做什么？', '出发模式是什么？', '怎么分享给别人看？'];

const POS_KEY = 'gotrip_fab_pos';
const HIDDEN_KEY = 'gotrip_fab_hidden';
const EDGE = 12; // 悬浮球与视口边缘的最小间距

interface Pos { x: number; y: number; }

function readSavedPos(): Pos | null {
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (raw && isFinite(raw.x) && isFinite(raw.y)) return { x: Number(raw.x), y: Number(raw.y) };
  } catch { /* ignore */ }
  return null;
}

function savePos(p: Pos) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) })); } catch { /* ignore */ }
}

function readHidden(): boolean {
  try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; }
}

export default function UsageAssistant() {
  const { me, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<boolean>(() => readHidden());
  const [turns, setTurns] = useState<ChatTurn[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<Pos>(() => readSavedPos() || { x: -1, y: -1 }); // -1 表示尚未定位
  const fabRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0 });

  /** 把坐标限制在视口内 */
  const clamp = (x: number, y: number): Pos => {
    const rect = fabRef.current?.getBoundingClientRect();
    const w = rect?.width || 88;
    const h = rect?.height || 46;
    return {
      x: Math.min(Math.max(x, EDGE), Math.max(EDGE, window.innerWidth - w - EDGE)),
      y: Math.min(Math.max(y, EDGE), Math.max(EDGE, window.innerHeight - h - EDGE)),
    };
  };

  // 首次定位：优先用保存的位置，否则右下角默认位
  useLayoutEffect(() => {
    if (pos.x < 0 || pos.y < 0) {
      const saved = readSavedPos();
      if (saved) { setPos(clamp(saved.x, saved.y)); return; }
      const rect = fabRef.current?.getBoundingClientRect();
      const w = rect?.width || 88, h = rect?.height || 46;
      setPos({ x: window.innerWidth - w - 18, y: window.innerHeight - h - 18 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 视口尺寸变化时重新收进屏幕内
  useEffect(() => {
    const onResize = () => setPos(p => (p.x < 0 ? p : clamp(p.x, p.y)));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新消息自动滚到底部
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [turns, busy, open]);

  if (!me) return null;

  /* ---- 拖拽（window 级监听，鼠标/触屏统一，不依赖 pointer capture） ---- */
  const onFabPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.ua-fab-x')) return; // × 按钮不触发拖拽
    const rect = fabRef.current!.getBoundingClientRect();
    drag.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, offX: e.clientX - rect.left, offY: e.clientY - rect.top };

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d.active) return;
      if (!d.moved && Math.abs(ev.clientX - d.startX) + Math.abs(ev.clientY - d.startY) <= 6) return;
      d.moved = true;
      setDragging(true);
      setPos(clamp(ev.clientX - d.offX, ev.clientY - d.offY));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const d = drag.current;
      drag.current = { active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0 };
      setDragging(false);
      if (!d.moved) {
        setOpen(true); // 未移动视为点击
        return;
      }
      // 松手后吸附到较近的左右边缘并记忆位置
      setPos(p => {
        const w = fabRef.current?.getBoundingClientRect().width || 88;
        const centerX = p.x + w / 2;
        const snapped = centerX < window.innerWidth / 2
          ? EDGE
          : Math.max(EDGE, window.innerWidth - w - EDGE);
        const next = clamp(snapped, p.y);
        savePos(next);
        return next;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.preventDefault();
  };

  const hideFab = () => {
    setOpen(false);
    setHidden(true);
    try { localStorage.setItem(HIDDEN_KEY, '1'); } catch { /* ignore */ }
    toast('助手已隐藏，点屏幕右侧边缘的小图标可找回');
  };
  const showFab = () => {
    setHidden(false);
    try { localStorage.setItem(HIDDEN_KEY, '0'); } catch { /* ignore */ }
  };

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
      {/* 悬浮球：可拖动，× 可隐藏 */}
      {!open && !hidden && (
        <button
          ref={fabRef}
          className={'ua-fab' + (dragging ? ' dragging' : '')}
          style={pos.x >= 0 ? { left: pos.x, top: pos.y } : undefined}
          onPointerDown={onFabPointerDown}
          title="使用助手（可拖动）"
          aria-label="打开使用助手"
        >
          💬<span className="ua-fab-label">助手</span>
          <span
            className="ua-fab-x"
            role="button"
            aria-label="隐藏助手"
            title="隐藏助手"
            onClick={hideFab}
          >×</span>
        </button>
      )}

      {/* 隐藏后的找回入口：右缘半露小拉手 */}
      {hidden && !open && (
        <button className="ua-restore" onClick={showFab} title="打开使用助手" aria-label="显示使用助手悬浮球">
          💬
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
