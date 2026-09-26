import { useEffect, useState } from 'react';
import { createTrip, updateTrip, ensureProfile } from '../rdb/trip';
import type { TripCardInfo } from '../types';
import { applyGuideToTrip } from '../rdb/apply-guide';
import { uploadImage, tempUrls } from '../rdb/storage';
import { proxy } from '../rdb/proxy';
import { useApp } from '../store';
import { Modal } from './ui';

const EMOJIS = ['🧭', '⛰️', '🏝️', '🏖️', '🏮', '🏯', '🎡', '🚄', '✈️', '🚗', '⛺', '🏂', '🍜', '🥾'];
const COLORS = ['#2f6e4f', '#b5543b', '#3b6ea5', '#c9a04e', '#7d5ba6', '#a0433b'];

/** 按目的地生成一张兜底封面（dataURL，不发请求、不依赖外部图库） */
function generatedCover(destination: string): string {
  const seed = [...(destination || 'trip')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = seed % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue},34%,28%)"/><stop offset=".6" stop-color="hsl(${(hue + 40) % 360},30%,19%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360},26%,14%)"/>
</linearGradient></defs>
<rect width="1200" height="600" fill="url(#g)"/>
<circle cx="${180 + (seed % 700)}" cy="${120 + (seed % 120)}" r="70" fill="rgba(255,255,255,.14)"/>
<path d="M0,430 L160,300 L280,380 L420,250 L560,370 L700,240 L840,350 L980,270 L1120,360 L1200,320 L1200,600 L0,600 Z" fill="rgba(0,0,0,.22)"/>
<path d="M0,500 L200,430 L380,490 L560,420 L760,480 L960,430 L1200,470 L1200,600 L0,600 Z" fill="rgba(0,0,0,.16)"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 压缩上传的封面图到 1600px 宽以内的 JPEG dataURL */
async function fileToCoverDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('读取图片失败'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('图片解析失败'));
    im.src = dataUrl;
  });
  const maxW = 1600;
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', 0.82);
}

/** dataURL → File（封面上传云存储用） */
function dataUrlToFile(dataUrl: string, name: string): File {
  const [meta, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

/** 创建旅程；传入 trip 时进入编辑模式（预填并调用 updateTrip，无粘贴攻略区） */
export default function CreateTripModal({ trip, onClose, onCreated, onSaved }: {
  trip?: TripCardInfo;
  onClose: () => void;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const editing = Boolean(trip);
  const { toast } = useApp();
  const [title, setTitle] = useState(trip?.title || '');
  const [destination, setDestination] = useState(trip?.destination || '');
  const [startDate, setStartDate] = useState(trip?.startDate || plusDays(7));
  const [endDate, setEndDate] = useState(trip?.endDate || plusDays(10));
  const [budget, setBudget] = useState(trip?.budget ? String(trip.budget) : '');
  const [emoji, setEmoji] = useState(trip?.coverEmoji || '🧭');
  const [color, setColor] = useState(trip?.coverColor || COLORS[0]);
  const [guideText, setGuideText] = useState('');
  const [coverImage, setCoverImage] = useState<string>(trip?.coverImage || '');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [coverBusy, setCoverBusy] = useState(false);

  // 已有封面是云存储 fileID，换临时链展示
  useEffect(() => {
    if (trip?.coverImage && !trip.coverImage.startsWith('data:')) {
      tempUrls([trip.coverImage]).then(m => setCoverUrl(m[trip.coverImage!] || '')).catch(() => undefined);
    }
  }, [trip?.coverImage]);
  const [busy, setBusy] = useState<'' | 'creating' | 'parsing' | 'saving'>('');

  const onPickCover = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('请选择图片文件', true); return; }
    setCoverBusy(true);
    try {
      const dataUrl = await fileToCoverDataUrl(file);
      if (dataUrl.length > 2_000_000) { toast('图片太大，请换一张小一些的', true); return; }
      setCoverImage(dataUrl);
      toast('封面已就绪');
    } catch (e: any) {
      toast(e.message || '图片处理失败', true);
    } finally {
      setCoverBusy(false);
    }
  };

  const create = async () => {
    if (busy) return;
    if (!title.trim()) { toast('给旅程起个名字吧', true); return; }
    if (endDate < startDate) { toast('结束日期不能早于开始日期', true); return; }
    setBusy('creating');
    try {
      const me = await ensureProfile();
      let coverFileId: string | null = null;
      if (coverImage) {
        setBusy('parsing');
        coverFileId = await uploadImage(dataUrlToFile(coverImage, 'cover.jpg'), 'cover');
      }
      const id = await createTrip({
        title: title.trim(),
        destination: destination.trim(),
        description: '',
        startDate,
        endDate,
        budget: Number(budget) || 0,
        coverEmoji: emoji,
        coverColor: color,
        coverImage: coverFileId,
      }, me.nickname);
      if (guideText.trim()) {
        setBusy('parsing');
        try {
          const guide = await proxy.post<any>(`/api/trips/${id}/ai/parse-guide`, { text: guideText });
          const r = await applyGuideToTrip(id, guide, { tripStartDate: startDate }, me.nickname);
          toast(`创建成功，${r.activityCount} 项安排已写入（${guide.source === 'ai' ? 'AI 解析' : '智能模板解析'}）`);
        } catch {
          toast('创建成功，但攻略解析失败，可稍后在行程页重试', true);
        }
      } else {
        toast('旅程已创建');
      }
      onCreated?.(id);
    } catch (e: any) {
      toast(e.message || '创建失败', true);
      setBusy('');
    }
  };

  const save = async () => {
    if (!trip || busy) return;
    if (!title.trim()) { toast('给旅程起个名字吧', true); return; }
    if (endDate < startDate) { toast('结束日期不能早于开始日期', true); return; }
    setBusy('saving');
    try {
      let coverFileId: string | null | undefined = trip.coverImage ?? null;
      if (coverImage !== (trip.coverImage || '') && coverImage) {
        coverFileId = await uploadImage(dataUrlToFile(coverImage, 'cover.jpg'), 'cover');
      }
      await updateTrip(trip.id, {
        title: title.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        budget: Number(budget) || 0,
        coverEmoji: emoji,
        coverColor: color,
        coverImage: coverFileId,
      });
      toast('旅程已更新');
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast(e.message || '保存失败', true);
      setBusy('');
    }
  };

  return (
    <Modal title={editing ? '编辑旅程' : '创建一段新旅程'} onClose={onClose} width={500}>
      <div className="field">
        <label>旅程名称</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：云南大理丽江 6 日慢游" maxLength={60} />
      </div>
      <div className="field">
        <label>目的地</label>
        <input className="input" value={destination} onChange={e => setDestination(e.target.value)} placeholder="城市或地区，例如：大理 → 丽江" maxLength={60} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>出发日期</label>
          <input className="input" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
        </div>
        <div className="field">
          <label>结束日期</label>
          <input className="input" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="field">
          <label>预算（元）</label>
          <input className="input" type="number" min={0} value={budget} onChange={e => setBudget(e.target.value)} placeholder="选填" />
        </div>
      </div>
      <div className="field">
        <label>封面图</label>
        <div className="cover-pick">
          <div className="cover-preview" style={{ background: color }}>
            {coverImage
              ? <img src={coverImage.startsWith('data:') ? coverImage : coverUrl} alt="封面预览" />
              : <span className="cover-preview-emoji">{emoji}</span>}
          </div>
          <div className="cover-pick-ops">
            <label className="btn sm ghost" style={{ cursor: 'pointer' }}>
              {coverBusy ? '处理中…' : '上传图片'}
              <input type="file" accept="image/*" hidden onChange={e => onPickCover(e.target.files?.[0])} />
            </label>
            <button type="button" className="btn sm ghost" onClick={() => setCoverImage(generatedCover(destination || title))}>
              按目的地生成
            </button>
            {coverImage && <button type="button" className="btn sm ghost" onClick={() => setCoverImage('')}>移除</button>}
            <span className="muted" style={{ fontSize: 11.5 }}>不上传则头图用按目的地生成的兜底图</span>
          </div>
        </div>
      </div>
      <div className="field">
        <label>封面图标与配色</label>
        <div className="row-ops">
          {EMOJIS.map(e => (
            <button key={e} type="button" className={`btn sm ${emoji === e ? 'primary' : 'ghost'}`} style={{ fontSize: 17 }} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>
        <div className="row-ops" style={{ marginTop: 6 }}>
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--ink)' : '1px solid var(--line-strong)' }} />
          ))}
        </div>
      </div>
      {editing ? (
        <>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            修改出发/结束日期后，每日行程会自动按新日期对齐；天数变化时多余的天会保留内容并排在末尾。
          </p>
          <div className="modal-ops">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn primary" onClick={save} disabled={busy !== ''}>
              {busy === 'saving' ? '保存中…' : '保存修改'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 4, marginTop: 4 }}>
            <label>粘贴攻略（可选）</label>
            <textarea className="input" value={guideText} onChange={e => setGuideText(e.target.value)} rows={5}
              placeholder={'支持「Day 1: …」「第 1 天：…」或「D5：10月5日：…」格式，粘贴后自动解析成每日行程。'} />
            <span className="muted">创建时将调用 AI 智能识别；未配置 AI Key 时使用内置规则解析，同样可用。</span>
          </div>
          <div className="modal-ops">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn primary" onClick={create} disabled={busy !== ''}>
              {busy === 'creating' ? '创建中…' : busy === 'parsing' ? 'AI 解析攻略中…' : '创建旅程'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
