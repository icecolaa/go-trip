import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store';
import { Modal, Avatar, timeAgo, fmtDate } from '../../components/ui';
import { createJournal, updateJournal, deleteJournal } from '../../rdb/ops';
import { uploadImage, tempUrls } from '../../rdb/storage';
import type { TabCtx } from './tabCtx';
import type { JournalImage } from '../../types';

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

/** dataURL → File（云存储上传通道只收 File/Blob） */
function dataUrlToFile(dataUrl: string, name = 'journal.jpg'): File {
  const [head, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

/** createdAt（数据模型毫秒时间戳）→ 相对时间 */
function ago(t?: number): string {
  if (!t) return '';
  try { return timeAgo(new Date(t).toISOString()); } catch { return ''; }
}

const MOODS = ['🎉', '🥰', '😎', '😴', '🤯', '🌧️', '🍜', '📝'];

export default function JournalTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const { journal, days, members } = bundle;
  const me = members[0];
  const memberName = me?.displayName || '我';
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('📝');
  const [dayId, setDayId] = useState('');
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<JournalImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ id: string; content: string; mood: string; images: JournalImage[] } | null>(null);

  /** fileID → 临时访问链（日志配图与待发布配图共用一份映射） */
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = [
      ...journal.flatMap(j => (j.images || []).flatMap(im => [im.full, im.thumb])),
      ...images.flatMap(im => [im.full, im.thumb]),
    ].filter(Boolean);
    if (!ids.length) { setImgUrls({}); return; }
    let alive = true;
    tempUrls([...new Set(ids)]).then(m => { if (alive) setImgUrls(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [journal, images]);

  const pickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const picked = [...files].slice(0, 9 - images.length);
      if (!picked.length) { toast('一篇日志最多 9 张图片', true); return; }
      // 压缩后逐张上传云存储，图片只存 fileID
      const added: JournalImage[] = [];
      for (const file of picked) {
        const pair = await fileToImages(file);
        const fid = await uploadImage(dataUrlToFile(pair.full), 'journal');
        added.push({ full: fid, thumb: fid });
      }
      setImages(prev => [...prev, ...added]);
      toast(`已添加 ${added.length} 张图片`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '图片上传失败', true);
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
      await createJournal(bundle.trip.id, {
        dayId: dayId || null,
        authorMemberId: me?.id || '',
        content: content.trim(), mood, images,
      }, memberName);
      setContent('');
      setImages([]);
      toast('日志已发布');
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : '发布失败', true);
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm('删除这条日志？')) return;
    try {
      await deleteJournal(bundle.trip.id, id);
      reload();
    } catch (e) { toast(e instanceof Error ? e.message : '删除失败', true); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateJournal(bundle.trip.id, editing.id, { content: editing.content, mood: editing.mood, images: editing.images });
      setEditing(null);
      reload();
    } catch (e) { toast(e instanceof Error ? e.message : '保存失败', true); }
  };

  /** 点击缩略图查看大图（存 fileID，渲染时换临时链） */
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
                      <img src={imgUrls[im.thumb] || ''} alt={`待发布的日志配图 ${i + 1}`} onClick={() => setLightbox(im.full)} />
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
          const mine = j.authorMemberId === me?.id;
          return (
            <div className="card journal-card" key={j.id}>
              <div className="journal-head">
                <Avatar name={author?.displayName || '旅'} color={author?.avatarColor || '#2f6e4f'} size="sm" />
                <b style={{ fontSize: 14 }}>{author?.displayName || '旅伴'}</b>
                <span className="journal-mood">{j.mood}</span>
                <div style={{ flex: 1 }} />
                {mine && canEdit && (
                  <>
                    <button className="btn sm ghost" onClick={() => setEditing({ id: j.id, content: j.content, mood: j.mood, images: j.images || [] })}>编辑</button>
                    <button className="btn sm danger" onClick={() => del(j.id)}>删除</button>
                  </>
                )}
              </div>
              <div className="journal-body">{j.content}</div>
              {j.images?.length > 0 && (
                <div className="journal-thumbs">
                  {j.images.map((im, i) => (
                    <div className="journal-thumb" key={i}>
                      <img src={imgUrls[im.thumb] || ''} alt="" loading="lazy" onClick={() => setLightbox(im.full)} />
                    </div>
                  ))}
                </div>
              )}
              <div className="journal-foot">
                <span>{ago(j.createdAt)}</span>
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
                  <img src={imgUrls[im.thumb] || ''} alt="" />
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
          <img src={imgUrls[lightbox] || ''} alt="" />
        </div>
      )}
    </div>
  );
}
