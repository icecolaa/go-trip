import { useEffect, useRef, useState } from 'react';

type Phase = 'before' | 'during' | 'after';

interface Parts { days: number; hours: number; minutes: number; seconds: number; }

function partsFromMs(ms: number): Parts {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

function endOfDay(dateStr: string): number {
  // 当地时区的当日 23:59:59.999，避免 UTC 解析把日期算错一天
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999).getTime();
}

function startOfDay(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 出发倒计时：天/时/分/秒四个独立小卡，每秒刷新。
 * 开始前倒数；进行中显示「旅程已经开始」；结束后显示「旅程已完成」——任何情况都不出现负数。
 */
export default function Countdown({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    timer.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  // 日期缺失（坏数据/异常路由）时不出块，别让整页崩掉
  if (!startDate || !endDate) return null;

  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  const phase: Phase = now < start ? 'before' : now > end ? 'after' : 'during';

  if (phase === 'during') {
    return (
      <div className="countdown countdown-during" role="status">
        <span className="cd-state">🚀 旅程已经开始</span>
      </div>
    );
  }
  if (phase === 'after') {
    return (
      <div className="countdown countdown-after" role="status">
        <span className="cd-state">✅ 旅程已完成</span>
      </div>
    );
  }

  const p = partsFromMs(start - now);
  const cells: [string, string][] = [['天', String(p.days)], ['时', pad(p.hours)], ['分', pad(p.minutes)], ['秒', pad(p.seconds)]];
  return (
    <div className="countdown" role="timer" aria-label={`距离出发还有 ${p.days} 天 ${p.hours} 小时 ${p.minutes} 分`}>
      {cells.map(([label, val]) => (
        <div className="cd-cell" key={label}>
          <span className="cd-num">{val}</span>
          <span className="cd-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
