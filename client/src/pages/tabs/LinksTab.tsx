import { useEffect, useState } from 'react';
import { useApp } from '../../store';
import { listLinks, createLink, deleteLink } from '../../rdb/ops';
import type { TravelLink } from '../../types';
import type { TabCtx } from './tabCtx';

type LinkType = TravelLink['type'];

/* ============ 攻略收藏：小红书 / 公众号 / 网页链接快速查阅 ============ */

const TYPE_META: Record<LinkType, { label: string; icon: string }> = {
  xhs: { label: '小红书', icon: '📕' },
  gzh: { label: '公众号', icon: '📰' },
  web: { label: '网页', icon: '🌐' },
};
const TYPE_ORDER: LinkType[] = ['xhs', 'gzh', 'web'];

export default function LinksTab({ bundle, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [links, setLinks] = useState<TravelLink[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<LinkType | 'all'>('all');
  const memberName = bundle.members[0]?.displayName || '我';

  const load = async () => {
    try {
      setLinks(await listLinks(bundle.trip.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : '加载失败', true);
      setLinks([]);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bundle.trip.id]);

  const remove = async (l: TravelLink) => {
    if (!confirm(`删除「${l.title}」？`)) return;
    try {
      await deleteLink(bundle.trip.id, l.id);
      setLinks(prev => (prev || []).filter(x => x.id !== l.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败', true);
    }
  };

  if (links === null) return <div className="spin" />;

  const shown = filter === 'all' ? links : links.filter(l => l.type === filter);

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="kicker">TRAVEL LINKS</div>
          <h2 className="section-title" style={{ margin: 0 }}>攻略收藏</h2>
          <div className="muted" style={{ marginTop: 4 }}>小红书笔记、公众号文章与网页攻略，一键直达</div>
        </div>
        {canEdit && (
          <button className="btn sm primary" onClick={() => setAdding(true)}>＋ 收藏链接</button>
        )}
      </div>

      {links.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>全部 {links.length}</button>
          {TYPE_ORDER.map(t => {
            const n = links.filter(l => l.type === t).length;
            return n > 0 ? (
              <button key={t} className={'chip' + (filter === t ? ' on' : '')} onClick={() => setFilter(t)}>
                {TYPE_META[t].icon} {TYPE_META[t].label} {n}
              </button>
            ) : null;
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="card empty">
          <span className="big">🔗</span>
          还没有收藏的攻略链接。<br />刷到好用的小红书笔记或公众号文章，点「收藏链接」存进来，随时翻看。
        </div>
      ) : (
        <div className="links-grid">
          {shown.map(l => (
            <article className="card link-card" key={l.id}>
              <div className="link-card-head">
                <span className="link-type">{TYPE_META[l.type]?.icon ?? '🌐'} {TYPE_META[l.type]?.label ?? l.type}</span>
                {canEdit && (
                  <button className="btn sm ghost link-del" title="删除" onClick={() => remove(l)}>✕</button>
                )}
              </div>
              <a className="link-title" href={l.url} target="_blank" rel="noreferrer">{l.title}</a>
              {l.note && <p className="link-note">{l.note}</p>}
              <div className="muted link-url">{l.url.replace(/^https?:\/\//, '').slice(0, 46)}</div>
            </article>
          ))}
        </div>
      )}

      {adding && <AddLinkModal tripId={bundle.trip.id} memberName={memberName} onClose={() => setAdding(false)} onAdded={l => { setLinks(prev => [l, ...(prev || [])]); setAdding(false); }} />}
    </div>
  );
}

function AddLinkModal({ tripId, memberName, onClose, onAdded }: { tripId: string; memberName: string; onClose: () => void; onAdded: (l: TravelLink) => void }) {
  const { toast } = useApp();
  const [type, setType] = useState<LinkType>('xhs');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast('请填写标题', true); return; }
    if (!url.trim()) { toast('请填写链接', true); return; }
    setBusy(true);
    try {
      await createLink(tripId, { type, title, url, note, tripId }, memberName);
      toast('已收藏');
      // 落库后本地追加（新写行有平台可见性延迟，避免「写后立即 list」查不到）
      onAdded({ id: `pending-${Date.now()}`, tripId, type, title, url, note });
    } catch (e) {
      toast(e instanceof Error ? e.message : '收藏失败', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <h3>收藏攻略链接</h3>
        <div className="field">
          <label>类型</label>
          <div className="chips">
            {TYPE_ORDER.map(t => (
              <button key={t} className={'chip' + (type === t ? ' on' : '')} onClick={() => setType(t)}>
                {TYPE_META[t].icon} {TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>标题</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：丽江 3 天 2 夜避坑攻略" maxLength={60} />
        </div>
        <div className="field">
          <label>链接</label>
          <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="field">
          <label>备注（可选）</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="例如：重点看第 3 天的路线" maxLength={200} />
        </div>
        <div className="modal-ops">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? '保存中…' : '收藏'}</button>
        </div>
      </div>
    </div>
  );
}
