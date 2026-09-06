import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Modal } from '../../components/ui';
import type { TabCtx } from './tabCtx';
import type { GuideCard, GuideCategory } from '@shared/types';

/* ============ 锦囊 Tab：美食 / 贴士 / 语言 / 拍摄 手册卡片 ============ */

const CAT_META: Record<GuideCategory, { label: string; en: string; desc: string }> = {
  food: { label: '美食锦囊', en: 'FOOD GUIDE', desc: '必吃与觅食技巧' },
  tip: { label: '实用贴士', en: 'TRAVEL TIPS', desc: '交通、预约与注意' },
  phrase: { label: '语言锦囊', en: 'PHRASES', desc: '开口就能用的短语' },
  photo: { label: '拍摄锦囊', en: 'PHOTO GUIDE', desc: '机位、时机与穿搭' },
};
const CAT_ORDER: GuideCategory[] = ['food', 'tip', 'phrase', 'photo'];

export default function HandbookTab({ bundle, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [cards, setCards] = useState<GuideCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      setCards(await api.get<GuideCard[]>(`/api/trips/${bundle.trip.id}/handbook`));
    } catch (e: any) {
      toast(e.message || '锦囊加载失败', true);
      setCards([]);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bundle.trip.id]);

  const generate = async () => {
    setBusy(true);
    try {
      setCards(await api.post<GuideCard[]>(`/api/trips/${bundle.trip.id}/handbook/generate`, {}));
      toast('锦囊已生成，欢迎补充专属卡片');
    } catch (e: any) {
      toast(e.message || '生成失败', true);
    } finally {
      setBusy(false);
    }
  };

  const removeCard = async (c: GuideCard) => {
    if (!confirm(`删除锦囊「${c.title}」？`)) return;
    try {
      await api.del(`/api/handbook/${c.id}`);
      setCards(prev => (prev || []).filter(x => x.id !== c.id));
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  if (cards === null) return <div className="spin" />;

  const grouped = CAT_ORDER.map(cat => ({ cat, list: cards.filter(c => c.category === cat) })).filter(g => g.list.length);

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="kicker">TRAVEL HANDBOOK</div>
          <h2 className="section-title" style={{ margin: 0 }}>旅行锦囊</h2>
          <div className="muted" style={{ marginTop: 4 }}>按目的地定制的美食、贴士、语言与拍摄手册</div>
        </div>
        {canEdit && (
          <>
            <button className="btn sm" onClick={() => setAdding(true)}>＋ 自定义卡片</button>
            <button className="btn sm primary" onClick={generate} disabled={busy}>{busy ? '生成中…' : '✨ 按目的地重新生成'}</button>
          </>
        )}
      </div>

      {cards.length === 0 && (
        <div className="card empty">
          <span className="big">📖</span>
          还没有锦囊。点击「按目的地重新生成」，为「{bundle.trip.destination || '这趟旅程'}」
          组装美食、贴士、语言与拍摄手册；未配置 AI 时使用内置内容库。
        </div>
      )}

      {grouped.map(g => (
        <section key={g.cat} style={{ marginBottom: 22 }}>
          <div className="hb-cat-head">
            <div>
              <div className="kicker">{CAT_META[g.cat].en}</div>
              <h3 className="hb-cat-title">{CAT_META[g.cat].label}</h3>
            </div>
            <span className="muted">{CAT_META[g.cat].desc}</span>
          </div>
          <div className="hb-grid">
            {g.list.map(c => (
              <article className="card hb-card" key={c.id}>
                <header className="hb-card-head">
                  <span className="hb-ico">{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 className="hb-title">{c.title}</h4>
                    {c.summary && <p className="hb-summary">{c.summary}</p>}
                  </div>
                  {canEdit && (
                    <button className="btn sm ghost hb-del" title="删除卡片" onClick={() => removeCard(c)}>✕</button>
                  )}
                </header>
                <ul className="hb-items">
                  {c.items.map((it, i) => (
                    <li key={i}>
                      {it.label ? <b className="hb-item-label">{it.label}</b> : <span className="hb-dot">·</span>}
                      <span>{it.text}</span>
                    </li>
                  ))}
                </ul>
                <footer className="hb-foot">
                  {c.source === 'ai' && <span className="tag orange">AI 生成</span>}
                  {c.source === 'custom' && <span className="tag gray">成员添加</span>}
                </footer>
              </article>
            ))}
          </div>
        </section>
      ))}

      {adding && <AddCardModal tripId={bundle.trip.id} onClose={() => setAdding(false)} onAdded={card => { setCards(prev => [...(prev || []), card]); setAdding(false); }} />}
    </div>
  );
}

function AddCardModal({ tripId, onClose, onAdded }: { tripId: number; onClose: () => void; onAdded: (c: GuideCard) => void }) {
  const { toast } = useApp();
  const [category, setCategory] = useState<GuideCategory>('tip');
  const [icon, setIcon] = useState('📌');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast('请填写卡片标题', true); return; }
    const items = itemsText.split('\n').map(l => l.trim()).filter(Boolean)
      .slice(0, 10).map(l => {
        const m = l.match(/^([^：:]{1,12})[：:]\s*(.+)$/);
        return m ? { label: m[1], text: m[2] } : { text: l };
      });
    if (!items.length) { toast('每行写一条内容（可用「标签：内容」格式）', true); return; }
    setBusy(true);
    try {
      const card = await api.post<GuideCard>(`/api/trips/${tripId}/handbook`, { category, icon, title, summary, items });
      toast('卡片已添加');
      onAdded(card);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="添加自定义锦囊卡" onClose={onClose}>
      <div className="field">
        <label>分类</label>
        <div className="chips">
          {CAT_ORDER.map(c => (
            <button key={c} className={'chip' + (category === c ? ' on' : '')} onClick={() => setCategory(c)}>{CAT_META[c].label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>图标</label>
        <div className="chips">
          {['📌', '🍜', '🎫', '🚇', '📷', '🗣️', '🛍️', '💊'].map(i => (
            <button key={i} className={'chip' + (icon === i ? ' on' : '')} onClick={() => setIcon(i)} style={{ fontSize: 16 }}>{i}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>标题</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：团队约定 / 老饕私藏清单" maxLength={30} />
      </div>
      <div className="field">
        <label>一句话简介（可选）</label>
        <input className="input" value={summary} onChange={e => setSummary(e.target.value)} placeholder="卡片想说明什么" maxLength={120} />
      </div>
      <div className="field">
        <label>条目（每行一条，支持「标签：内容」格式）</label>
        <textarea className="input" rows={5} value={itemsText} onChange={e => setItemsText(e.target.value)}
          placeholder={'砂锅鱼：人民路老店两人锅\n喜洲粑粑：现烤甜口'} />
      </div>
      <div className="modal-ops">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={submit} disabled={busy}>添加卡片</button>
      </div>
    </Modal>
  );
}
