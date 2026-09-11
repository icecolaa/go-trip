import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Modal, Avatar, timeAgo, fmtDate } from '../../components/ui';
import type { TabCtx } from './tabCtx';
import type { JournalImage } from '@shared/types';

/** 前端压缩：原图最长边 1600 / 缩略图 400，JPEG 0.85 */
async function fileToImages(file: File): Promise<{ full: string; thumb: string }> {
  const bitmap = await createImageBitmap(file);
  const draw = (max: number) => {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  };
  const result = { full: draw(1600), thumb: draw(400) };
  bitmap.close?.();
  return result;
}

const MOODS = ['🎉', '🥰', '😎', '😴', '🤯', '🌧️', '🍜', '📝'];

export default function JournalTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const { journal, days, members } = bundle;
  const me = members.find(m => m.id === bundle.myMemberId);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('📝');
  const [dayId, setDayId] = useState('');
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<JournalImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ id: number; content: string; mood: string; images: JournalImage[] } | null>(null);

  const pickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const picked = [...files].slice(0, 9 - images.length);
      if (!picked.length) { toast('一篇日志最多 9 张图片', true); return; }
      const pairs = await Promise.all(picked.map(fileToImages));
      const r = await api.post<{ images: JournalImage[] }>(`/api/trips/${bundle.trip.id}/uploads`, {
        images: pairs,
      });
      setImages(prev => [...prev, ...r.images]);
      toast(`已添加 ${r.images.length} 张图片`);
    } catch (e: any) {
      toast(e.message || '图片上传失败', true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const publish = async () => {
    if (!content.trim() || busy) { toast('写点什么再发布吧', true); return; }
    setBusy(true);
    try {
      await api.post(`/api/trips/${bundle.trip.id}/journal`, {
        content: content.trim(), mood, dayId: dayId ? Number(dayId) : null, images,
      });
      setContent('');
      setImages([]);
      toast('日志已发布');
      reload();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm('删除这条日志？')) return;
    try {
      await api.del(`/api/journal/${id}`);
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.patch(`/api/journal/${editing.id}`, { content: editing.content, mood: editing.mood, images: editing.images });
      setEditing(null);
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  /** 点击缩略图查看大图 */
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    <div>
      <h2 className="section-title">旅行日志</h2>

      {canEdit && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Avatar name={me?.displayName || '我'} color={me?.avatarColor || '#2f6e4f'} />
            <div style={{ flex: 1 }}>
              <textarea className="input" rows={3} value={content} onChange={e => setContent(e.target.value)}
                placeholder={'记录这一刻：出发前的期待、路上的见闻、踩过的坑…'} maxLength={3000} />
              <div className="row-ops" style={{ marginTop: 10 }}>
                <span className="muted">心情</span>
                {MOODS.map(m => (
                  <button key={m} className={`btn sm ghost ${mood === m ? 'primary' : ''}`} style={{ fontSize: 16 }} onClick={() => setMood(m)}>{m}</button>
                ))}
                <select className="input" style={{ width: 150, marginLeft: 'auto' }} value={dayId} onChange={e => setDayId(e.target.value)}>
                  <option value="">不关联具体某天</option>
                  {days.map(d => <option key={d.id} value={d.id}>第 {d.dayNumber} 天 · {fmtDate(d.date)}</option>)}
                </select>
                <button className="btn primary sm" onClick={publish} disabled={busy}>{busy ? '发布中…' : '发布日志'}</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden
                onChange={e => pickImages(e.target.files)} />
              <div className="row-ops" style={{ marginTop: 8 }}>
                <button className="btn sm ghost" onClick={() => fileRef.current?.click()} disabled={uploading || images.length >= 9}>
                  {uploading ? '上传中…' : '添加图片'}{images.length ? `（${images.length}/9）` : ''}
                </button>
                <span className="muted">最多 9 张，自动压缩</span>
              </div>
              {images.length > 0 && (
                <div className="journal-thumbs">
                  {images.map((im, i) => (
                    <div className="journal-thumb" key={im.full + i}>
                      <img src={im.thumb} alt={`待发布的日志配图 ${i + 1}`} onClick={() => setLightbox(im.full)} />
                      <span className="journal-thumb-x" role="button" aria-label="移除图片" onClick={() => removeImage(i)}>×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {journal.length === 0 ? (
        <div className="card empty"><span className="big">✍️</span>还没有日志<br />旅途中的高光时刻值得被记下来</div>
      ) : (
        journal.map(j => {
          const author = members.find(m => m.id === j.authorMemberId);
          const day = days.find(d => d.id === j.dayId);
          const mine = j.authorMemberId === bundle.myMemberId;
          return (
            <div className="card journal-card" key={j.id}>
              <div className="journal-head">
                <Avatar name={j.author?.nickname || '旅'} color={j.author?.avatarColor || '#2f6e4f'} size="sm" />
                <b style={{ fontSize: 14 }}>{j.author?.nickname || '旅伴'}</b>
                <span className="journal-mood">{j.mood}</span>
                <div style={{ flex: 1 }} />
                {mine && canEdit && (
                  <>
                    <button className="btn sm ghost" onClick={() => setEditing({ id: j.id, content: j.content, mood: j.mood, images: j.images || [] })}>编辑</button>
                    <button className="btn sm ghost" style={{ color: 'var(--red)' }} onClick={() => del(j.id)}>删除</button>
                  </>
                )}
              </div>
              <div className="journal-body">{j.content}</div>
              {j.images?.length > 0 && (
                <div className="journal-thumbs">
                  {j.images.map((im, i) => (
                    <div className="journal-thumb" key={i}>
                      <img src={im.thumb} alt="" loading="lazy" onClick={() => setLightbox(im.full)} />
                    </div>
                  ))}
                </div>
              )}
              <div className="journal-foot">
                <span>{timeAgo(j.createdAt)}</span>
                {day && <span>· 第 {day.dayNumber} 天</span>}
              </div>
            </div>
          );
        })
      )}

      {editing && (
        <Modal title="编辑日志" onClose={() => setEditing(null)} width={480}>
          <div className="row-ops" style={{ marginBottom: 10 }}>
            {MOODS.map(m => (
              <button key={m} className={`btn sm ghost ${editing.mood === m ? 'primary' : ''}`} style={{ fontSize: 16 }} onClick={() => setEditing({ ...editing, mood: m })}>{m}</button>
            ))}
          </div>
          <textarea className="input" rows={5} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} />
          {editing.images.length > 0 && (
            <div className="journal-thumbs">
              {editing.images.map((im, i) => (
                <div className="journal-thumb" key={i}>
                  <img src={im.thumb} alt="" />
                  <span className="journal-thumb-x" role="button" onClick={() => setEditing({ ...editing, images: editing.images.filter((_, x) => x !== i) })}>×</span>
                </div>
              ))}
            </div>
          )}
          <div className="modal-ops">
            <button className="btn" onClick={() => setEditing(null)}>取消</button>
            <button className="btn primary" onClick={saveEdit}>保存</button>
          </div>
        </Modal>
      )}

      {lightbox && (
        <div className="journal-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="查看大图">
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  );
}
