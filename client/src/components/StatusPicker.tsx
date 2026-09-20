import { NON_PENDING_STATUSES, type TripStatus } from '@shared/types';

export const ALL_STATUSES: TripStatus[] = [
  '已确认', '已出票', '已预订', '仅限现金', '现场选择', '现场确认', '可选', '未预订', '待确认', '暂定',
];

/** 状态徽标配色类名：已确认类=绿、现金=橙、待确认=警示、其余=中性 */
export function statusClass(s?: TripStatus | null): string {
  if (!s) return 'st-none';
  if (s === '已确认' || s === '已出票' || s === '已预订') return 'st-ok';
  if (s === '仅限现金') return 'st-cash';
  if (s === '待确认') return 'st-warn';
  if (s === '未预订') return 'st-open';
  return 'st-mute';
}

export function StatusBadge({ status }: { status?: TripStatus | null }) {
  if (!status) return <span className="status-badge st-none" title="尚未标注状态">未标注</span>;
  return <span className={`status-badge ${statusClass(status)}`}>{status}</span>;
}

/** 状态选择器：一组药丸，点选即改；不含「影响主行程」之外的隐藏逻辑 */
export default function StatusPicker({
  value, onChange, canEdit,
}: {
  value?: TripStatus | null;
  onChange: (s: TripStatus | null) => void;
  canEdit: boolean;
}) {
  return (
    <div className="status-picker" role="group" aria-label="确认状态">
      {ALL_STATUSES.map(s => (
        <button
          key={s}
          type="button"
          className={`chip sm ${value === s ? 'on' : ''} ${statusClass(s)}`}
          disabled={!canEdit}
          onClick={() => onChange(value === s ? null : s)}
          title={NON_PENDING_STATUSES.includes(s) ? '不影响主行程，不进入待确认' : undefined}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
