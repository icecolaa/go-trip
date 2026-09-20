import { useState } from 'react';
import { useIsNarrow } from '../hooks';

/** 无封面图时按目的地生成的兜底底图（纯 CSS 渐变 + 地貌剪影，不发请求） */
function FallbackCover({ destination }: { destination: string }) {
  const seed = [...(destination || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = seed % 360;
  return (
    <div
      className="cover-fallback"
      aria-hidden="true"
      style={{
        background:
          `linear-gradient(160deg, hsl(${hue} 32% 26%), hsl(${(hue + 40) % 360} 28% 18%) 62%, hsl(${(hue + 70) % 360} 24% 14%))`,
      }}
    >
      <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="cover-ridge">
        <path d="M0,96 L48,58 L86,84 L132,40 L178,78 L226,36 L272,72 L318,48 L360,80 L400,60 L400,120 L0,120 Z" />
        <path d="M0,110 L60,88 L118,104 L176,82 L240,100 L300,86 L360,102 L400,92 L400,120 L0,120 Z" opacity=".55" />
      </svg>
    </div>
  );
}

/**
 * 旅程头图：背景图 + 渐变遮罩 + 标题/年份/地区/日期。
 * 手机端单独裁切与文字位置（object-position 与内边距按断点切换），不照搬桌面布局。
 */
export default function CoverHero({
  title, destination, startDate, endDate, coverImage, children,
}: {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  coverImage?: string;
  children?: React.ReactNode;
}) {
  const narrow = useIsNarrow();
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!coverImage && !imgFailed;
  const year = (startDate || '').slice(0, 4);

  return (
    <section className={`cover-hero ${narrow ? 'narrow' : 'wide'}`}>
      {showImg ? (
        <img
          className="cover-bg"
          src={coverImage}
          alt=""
          onError={() => setImgFailed(true)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <FallbackCover destination={destination} />
      )}
      <div className="cover-veil" aria-hidden="true" />
      <div className="cover-body">
        <p className="cover-eyebrow">{year ? `${year} 年 · ` : ''}{destination || '目的地待定'}</p>
        <h1 className="cover-title">{title}</h1>
        <p className="cover-dates">{startDate} ~ {endDate}</p>
        {children}
      </div>
    </section>
  );
}
