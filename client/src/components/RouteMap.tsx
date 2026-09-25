import { useIsNarrow } from '../hooks';

export interface RouteStop {
  name: string;
  /** 第几天抵达，可选 */
  day?: number;
}

/** 从目的地与逐日地点里提炼「主要目的地」：不掺入普通转机城市 */
export function deriveStops(destination: string, dayPlaces: string[]): RouteStop[] {
  const raw: string[] = [];
  // 目的地字段里的「A → B → C」/「A-B-C」/「A、B」优先，它就是用户声明的主要路线
  const parts = destination.split(/→|->|~|—|–|\/|、|，|,|\|/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) raw.push(...parts);
  else if (parts.length === 1 && parts[0]) raw.push(parts[0]);

  // 兜底：用逐日主要地点，按天序去重（连续重复只留一个）
  if (raw.length < 2) {
    const seq: string[] = [];
    for (const p of dayPlaces) {
      const v = (p || '').trim();
      if (!v) continue;
      if (seq[seq.length - 1] === v) continue;
      seq.push(v);
    }
    if (seq.length > raw.length) raw.length = 0, raw.push(...seq);
  }

  // 出发地与最终返回地相同时只显示一个地点
  const stops: RouteStop[] = [];
  for (const name of raw) {
    if (stops.length && stops[stops.length - 1].name === name) continue;
    stops.push({ name });
  }
  if (stops.length >= 2 && stops[0].name === stops[stops.length - 1].name) stops.pop();
  return stops.slice(0, 12);
}

const CONTOURS = [
  'M0,42 C60,18 120,58 190,30 C250,8 300,44 360,26',
  'M0,72 C70,52 130,86 200,62 C260,42 310,76 360,58',
  'M0,104 C60,84 140,116 210,94 C270,74 315,106 360,90',
  'M0,136 C80,118 150,148 220,128 C280,110 320,140 360,124',
];

/**
 * 路线总览图：纯 SVG，无外部图片依赖（因此不存在加载失败留白）。
 * 桌面横版、手机竖版且一屏看全；只有提炼不出主要目的地时才显示明确提示。
 */
export default function RouteMap({ destination, dayPlaces }: { destination: string; dayPlaces: string[] }) {
  const narrow = useIsNarrow();
  const stops = deriveStops(destination, dayPlaces);

  if (!stops.length) {
    return (
      <div className="route-map route-map-empty" role="note">
        <span className="rm-hint">暂未识别到主要目的地——填写「目的地」或给每天设置城市后，这里会显示路线总览</span>
      </div>
    );
  }

  const W = 360;
  const n = stops.length;
  // 竖版：纵向排布，节点间距按数量自适应，保证一屏看全
  const step = narrow ? Math.max(46, Math.min(74, Math.floor(300 / n))) : Math.max(58, Math.min(96, Math.floor(300 / n)));
  const H = narrow ? 40 + step * (n - 1) + 40 : 150;
  const yMid = 75;

  const pts = stops.map((s, i) => narrow
    ? { x: W / 2, y: 30 + i * step }
    : { x: 44 + i * ((W - 88) / Math.max(1, n - 1)), y: yMid });

  return (
    <figure className={`route-map ${narrow ? 'vertical' : 'horizontal'}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`路线总览：${stops.map(s => s.name).join(' → ')}`}>
        {/* 柔和等高线/水彩底纹 */}
        <g className="rm-contours" aria-hidden="true">
          {CONTOURS.map((d, i) => (
            <path key={i} d={d} transform={narrow ? `translate(0,${i * 26})` : `translate(0,${i * 22 - 20})`} />
          ))}
        </g>
        {/* 连线 + 方向箭头 */}
        {pts.slice(0, -1).map((p, i) => {
          const q = pts[i + 1];
          if (narrow) {
            return (
              <g key={i}>
                <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="rm-line" />
                <polygon points={`${q.x - 5},${q.y - 12} ${q.x + 5},${q.y - 12} ${q.x},${q.y - 4}`} className="rm-arrow" />
              </g>
            );
          }
          const mx = (p.x + q.x) / 2;
          return (
            <g key={i}>
              <path d={`M${p.x},${p.y} C${mx},${p.y - 26} ${mx},${q.y + 26} ${q.x},${q.y}`} className="rm-line" />
              <polygon points={`${q.x - 13},${q.y - 5} ${q.x - 13},${q.y + 5} ${q.x - 4},${q.y}`} className="rm-arrow" />
            </g>
          );
        })}
        {/* 节点 */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={15} className="rm-dot" />
            <text x={p.x} y={p.y + 4.5} className="rm-dot-num">{i + 1}</text>
            <text x={p.x} y={narrow ? p.y - 24 : p.y + 36} className="rm-label" textAnchor="middle">
              {stops[i].name}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
