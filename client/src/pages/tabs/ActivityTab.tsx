import { Avatar, timeAgo } from '../../components/ui';
import type { TabCtx } from './tabCtx';

/** createdAt（数据模型毫秒时间戳）→ 相对时间 */
function ago(t?: number): string {
  if (!t) return '';
  try { return timeAgo(new Date(t).toISOString()); } catch { return ''; }
}

export default function ActivityTab({ bundle }: TabCtx) {
  const { feed } = bundle;
  return (
    <div>
      <h2 className="section-title">成员动态</h2>
      {feed.length === 0 ? (
        <div className="card empty"><span className="big">📣</span>还没有动态</div>
      ) : (
        <div className="card" style={{ padding: '8px 18px' }}>
          {feed.map(f => (
            <div className="feed-item" key={f.id}>
              <Avatar name={f.memberName} color={f.avatarColor} size="sm" />
              <div className="txt">
                <b>{f.memberName}</b> {f.action}
                {f.detail && <span className="muted"> · {f.detail}</span>}
              </div>
              <span className="when">{ago(f.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
