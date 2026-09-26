import { useMemo, useState } from 'react';
import { useApp } from '../../store';
import { Modal } from '../../components/ui';
import { createCash, deleteCash } from '../../rdb/ops';
import type { TabCtx } from './tabCtx';
import type { TripCashItem } from '../../types';

type CashRefKind = NonNullable<TripCashItem['refKind']>;

const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'HKD', 'THB', 'SGD'];
const CUR_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥', HKD: 'HK$', THB: '฿', SGD: 'S$' };

/** 现金项金额展示：读算好的 total，避免前端各处口径不一 */
export function cashMoney(c: TripCashItem): string {
  return `${CUR_SYMBOL[c.currency] || (c.currency + ' ')}${c.total}`;
}

/**
 * 现金准备区块：金额、币种、每人或总价、人数、合计。
 * 合计只在后端算一次（total 字段），前端各处只读 total，避免重复计算。
 * 现金项同时出现在：每日行程卡片、交通/住宿票卡、以及清单的「现金准备」类。
 * 作为「清单」的一类嵌入（导航里不单列），也可独立使用。
 */
export function CashSection({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const items = bundle.cash || [];
  const memberName = bundle.members[0]?.displayName || '我';

  const totalByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of items) m.set(c.currency, (m.get(c.currency) || 0) + c.total);
    return [...m.entries()];
  }, [items]);

  /** 可关联的行程/交通/住宿条目（用于把现金项挂到具体卡片上） */
  const refOptions = useMemo(() => {
    const dayById = new Map(bundle.days.map(d => [d.id, d]));
    const out: { refKind: CashRefKind; refId: string; label: string }[] = [];
    for (const a of bundle.activities) {
      if (a.kind !== 'transport' && a.kind !== 'hotel') continue;
      const day = dayById.get(a.dayId);
      out.push({
        refKind: a.kind === 'transport' ? 'transport' : 'stay',
        refId: a.id,
        label: `${a.kind === 'transport' ? '交通' : '住宿'} · D${day?.dayNumber ?? '?'} ${a.title}`,
      });
    }
    return out;
  }, [bundle.activities, bundle.days]);

  const remove = async (id: string) => {
    if (!confirm('删除这条现金项？')) return;
    try { await deleteCash(bundle.trip.id, id, memberName); reload(); } catch (e) { toast(e instanceof Error ? e.message : '删除失败', true); }
  };

  return (
    <div className="cash-section">
      {totalByCurrency.length > 0 && (
        <div className="row-ops" style={{ flexWrap: 'wrap', gap: 14, marginBottom: 8 }}>
          {totalByCurrency.map(([cur, sum]) => (
            <span key={cur} style={{ fontSize: 13.5 }}>
              <span className="muted" style={{ fontSize: 12, marginRight: 6 }}>{cur} 合计</span>
              <b>{CUR_SYMBOL[cur] || ''}{sum.toFixed(2)}</b>
            </span>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
        每人价的项目按人数自动折算合计；同一笔现金只在这里记一次，行程与票卡上都是引用显示，不会重复计算。
      </p>

      {items.length === 0 ? (
        <div className="empty" style={{ padding: '14px' }}>还没有现金项——摊位、小店、小费这些只收现金的地方，先记在这里</div>
      ) : (
        <div className="place-list">
          {items.map(c => (
            <div className="place-item" key={c.id}>
              <div className="row1">
                <span className="nm">{c.title}</span>
                <b style={{ marginLeft: 'auto', color: 'var(--orange)' }}>
                  {CUR_SYMBOL[c.currency] || ''}{c.total.toFixed(2)}
                </b>
              </div>
              <div className="sub">
                {c.currency} · {c.perPerson ? `每人 ${CUR_SYMBOL[c.currency] || ''}${c.amount} × ${c.people} 人` : `总价 ${CUR_SYMBOL[c.currency] || ''}${c.amount}`}
              </div>
              {c.refId && (
                <div className="sub">
                  关联：{refOptions.find(r => r.refKind === c.refKind && r.refId === c.refId)?.label || '行程条目'}
                </div>
              )}
              <div className="ops">
                {canEdit && <button className="btn sm ghost" style={{ color: 'var(--red)' }} onClick={() => remove(c.id)}>删除</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ marginTop: 8 }}>
          <button className="btn sm ghost" onClick={() => setAdding(true)}>＋ 添加现金项</button>
        </div>
      )}

      {adding && (
        <AddCashModal
          tripId={bundle.trip.id}
          memberName={memberName}
          refOptions={refOptions}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await reload(); }}
        />
      )}
    </div>
  );
}

/** 独立形态（导航里不单列，保留以便将来拆出） */
export default function CashTab(props: TabCtx) {
  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 14 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>现金准备</h2>
      </div>
      <CashSection {...props} />
    </div>
  );
}

function AddCashModal({ tripId, memberName, refOptions, onClose, onSaved }: {
  tripId: string;
  memberName: string;
  refOptions: { refKind: CashRefKind; refId: string; label: string }[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [perPerson, setPerPerson] = useState(true);
  const [people, setPeople] = useState('2');
  const [refKey, setRefKey] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast('写一下这笔现金用来做什么', true); return; }
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) { toast('请填写正确的金额', true); return; }
    setBusy(true);
    const picked = refOptions.find(r => `${r.refKind}:${r.refId}` === refKey);
    try {
      await createCash(tripId, {
        tripId,
        title: title.trim(), amount: amt, currency,
        perPerson, people: Math.max(1, Math.floor(Number(people) || 1)),
        total: 0, // 合计由 ops 层写入时计算，这里仅满足类型
        dayId: null,
        refKind: picked?.refKind ?? null, refId: picked?.refId ?? null,
      }, memberName);
      toast('已添加现金项');
      await onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : '添加失败', true); } finally { setBusy(false); }
  };

  const preview = (Number(amount) || 0) * (perPerson ? Math.max(1, Math.floor(Number(people) || 1)) : 1);

  return (
    <Modal title="添加现金项" onClose={onClose} width={460}>
      <label className="field"><span>用途</span><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：喜洲古镇摊位" maxLength={60} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field"><span>金额</span><input className="input" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        <div className="field"><span>币种</span>
          <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <label className="row1" style={{ gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={perPerson} onChange={e => setPerPerson(e.target.checked)} style={{ width: 16, height: 16 }} />
        <span>上面的金额是「每人」价格（否则视为总价）</span>
      </label>
      {perPerson && (
        <label className="field"><span>人数</span><input className="input" type="number" min={1} value={people} onChange={e => setPeople(e.target.value)} /></label>
      )}
      <div className="field">
        <span>关联到（可选，关联后会内联显示在那张卡片上）</span>
        <select className="input" value={refKey} onChange={e => setRefKey(e.target.value)}>
          <option value="">不关联</option>
          {refOptions.map(r => <option key={`${r.refKind}:${r.refId}`} value={`${r.refKind}:${r.refId}`}>{r.label}</option>)}
        </select>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>
        合计预览：{CUR_SYMBOL[currency] || ''}{preview.toFixed(2)}（保存时自动折算合计）
      </p>
      <div className="modal-ops">
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn primary" disabled={busy} onClick={submit}>添加</button>
      </div>
    </Modal>
  );
}
