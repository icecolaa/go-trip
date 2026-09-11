import { useMemo, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Modal, yuan, EXPENSE_CATS, EXPENSE_CAT_ICON, timeAgo } from '../../components/ui';
import type { TabCtx } from './tabCtx';
import type { Expense } from '@shared/types';

export default function BudgetTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const { expenses, members, budget, trip } = bundle;

  const byMember = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const myMemberId = bundle.myMemberId;
  const mine = budget.perMember.find(p => p.memberId === myMemberId);
  const myPaid = mine?.paid || 0;
  const myShare = mine?.share || 0;
  const myBalance = mine?.balance || 0;
  const avg = members.length ? budget.total / members.length : 0;
  const budgetPct = trip.budget > 0 ? Math.min(100, Math.round((budget.total / trip.budget) * 100)) : 0;

  const del = async (e: Expense) => {
    if (!confirm(`删除账目「${e.title}」？`)) return;
    try {
      await api.del(`/api/expenses/${e.id}`);
      toast('已删除');
      reload();
    } catch (err: any) { toast(err.message, true); }
  };

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 14 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>旅行钱包</h2>
        {canEdit && <button className="btn sm primary" onClick={() => setAdding(true)}>＋ 记一笔</button>}
      </div>

      <div className="budget-cards">
        <div className="card budget-card">
          <div className="lab">团队总花费</div>
          <div className="val">{yuan(budget.total)}</div>
          <div className="muted">共 {expenses.length} 笔 · 人均 {yuan(avg)}</div>
        </div>
        <div className="card budget-card">
          <div className="lab">我垫付的</div>
          <div className="val">{yuan(myPaid)}</div>
          <div className="muted">我应摊 {yuan(myShare)}</div>
        </div>
        <div className="card budget-card">
          <div className="lab">{myBalance >= 0 ? '待收回' : '待支付'}</div>
          <div className="val orange">{yuan(Math.abs(myBalance))}</div>
          <div className="muted">{myBalance >= 0 ? '大家应还给你' : '你应转给垫付的伙伴'}</div>
        </div>
        {trip.budget > 0 && (
          <div className="card budget-card">
            <div className="lab">预算使用</div>
            <div className="val">{budgetPct}%</div>
            <div className="muted">总预算 {yuan(trip.budget)}</div>
            <div className="cat-bar" style={{ marginTop: 6 }}><div style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? 'var(--red)' : 'var(--green)' }} /></div>
          </div>
        )}
      </div>

      {/* 分类统计 */}
      {budget.byCategory.length > 0 && (
        <>
          <h3 className="section-title">花在了哪里</h3>
          <div className="card" style={{ padding: '14px 18px', marginBottom: 18 }}>
            {budget.byCategory.map(c => (
              <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13.5 }}>
                <span style={{ width: 22 }}>{EXPENSE_CAT_ICON[c.category] || '📌'}</span>
                <span style={{ width: 44 }}>{c.category}</span>
                <div className="cat-bar" style={{ flex: 1 }}>
                  <div style={{ width: `${(c.amount / budget.total) * 100}%`, background: 'var(--green)' }} />
                </div>
                <b style={{ width: 90, textAlign: 'right' }}>{yuan(c.amount)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 结算建议 */}
      {budget.settlements.length > 0 && (
        <>
          <h3 className="section-title">🧾 结算方案（转账最少）</h3>
          <div className="card settle-box" style={{ marginBottom: 18 }}>
            {budget.settlements.map((s, i) => {
              const from = byMember.get(s.fromMemberId);
              const to = byMember.get(s.toMemberId);
              return (
                <div key={i} className="settle-row">
                  <b style={{ color: 'var(--red)' }}>{from?.displayName}</b>
                  <span>→ 转账 →</span>
                  <b style={{ color: 'var(--green-deep)' }}>{to?.displayName}</b>
                  <span style={{ marginLeft: 'auto', fontWeight: 500, color: 'var(--orange)' }}>{yuan(s.amount)}</span>
                </div>
              );
            })}
            <div className="muted" style={{ padding: '7px 16px' }}>按此方案转账后全员两清，谁也不多垫一分钱。</div>
          </div>
        </>
      )}

      {/* 账目列表（票券风） */}
      <h3 className="section-title">全部账目</h3>
      {expenses.length === 0 ? (
        <div className="card empty"><span className="big">💰</span>还没有记账<br />机票、住宿、门票……记下来一起算</div>
      ) : (
        <div className="ticket">
          {expenses.map(e => {
            const payer = byMember.get(e.payerMemberId);
            return (
              <div key={e.id} className="ticket-row">
                <span style={{ fontSize: 20 }}>{EXPENSE_CAT_ICON[e.category] || '📌'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14.5 }}>{e.title}</div>
                  <div className="muted" style={{ marginTop: 2 }}>
                    {e.date} · {payer?.displayName || '未知'} 垫付 · {e.splitMode === 'payer' ? '自付' : `全体均摊（${e.participants.length || members.length} 人）`}
                  </div>
                </div>
                <b style={{ fontSize: 16, color: 'var(--orange)' }}>{yuan(e.amount)}</b>
                {canEdit && (
                  <div className="act-ops">
                    <button className="btn sm ghost" onClick={() => setEditing(e)}>改</button>
                    <button className="btn sm ghost" style={{ color: 'var(--red)' }} onClick={() => del(e)}>删</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && (
        <ExpenseModal
          expense={editing}
          tripId={trip.id}
          members={members.map(m => ({ id: m.id, displayName: m.displayName }))}
          defaultDate={trip.startDate}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ expense, tripId, members, defaultDate, onClose, onSaved }: {
  expense?: Expense | null;
  tripId: number;
  members: { id: number; displayName: string }[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [category, setCategory] = useState(expense?.category || '餐饮');
  const [date, setDate] = useState(expense?.date || defaultDate);
  const [payer, setPayer] = useState(String(expense?.payerMemberId || members[0]?.id || ''));
  const [splitMode, setSplitMode] = useState(expense?.splitMode || 'equal');
  const [parts, setParts] = useState<number[]>(expense?.participants || []);
  const [busy, setBusy] = useState(false);

  const togglePart = (id: number) => {
    setParts(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const save = async () => {
    if (busy) return;
    const amt = Number(amount);
    if (!title.trim()) { toast('记一下花了什么', true); return; }
    if (!isFinite(amt) || amt <= 0) { toast('金额要大于 0', true); return; }
    setBusy(true);
    const payload = {
      title: title.trim(), amount: amt, category, date,
      payerMemberId: Number(payer), splitMode,
      participants: splitMode === 'equal' ? parts : [],
    };
    try {
      if (expense) {
        await api.patch(`/api/expenses/${expense.id}`, payload);
        toast('账目已更新');
      } else {
        await api.post(`/api/trips/${tripId}/expenses`, payload);
        toast('已记账');
      }
      onSaved();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={expense ? '修改账目' : '记一笔'} onClose={onClose} width={460}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10 }}>
        <div className="field">
          <label>花销说明</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：大理民宿 2 晚" maxLength={60} />
        </div>
        <div className="field">
          <label>金额（元）</label>
          <input className="input" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="field">
        <label>类别</label>
        <div className="row-ops">
          {EXPENSE_CATS.map(c => (
            <button key={c} type="button" className={`btn sm ${category === c ? 'primary' : 'ghost'}`} onClick={() => setCategory(c)}>{EXPENSE_CAT_ICON[c]} {c}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>日期</label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>谁垫付的</label>
          <select className="input" value={payer} onChange={e => setPayer(e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>怎么分摊</label>
        <div className="row-ops">
          <button type="button" className={`btn sm ${splitMode === 'equal' ? 'primary' : 'ghost'}`} onClick={() => setSplitMode('equal')}>均摊（AA）</button>
          <button type="button" className={`btn sm ${splitMode === 'payer' ? 'primary' : 'ghost'}`} onClick={() => setSplitMode('payer')}>垫付人自理</button>
        </div>
        {splitMode === 'equal' && (
          <>
            <div className="row-ops" style={{ marginTop: 8 }}>
              {members.map(m => (
                <button key={m.id} type="button" className={`chip ${parts.includes(m.id) ? 'on' : ''}`}
                  onClick={() => togglePart(m.id)}>{m.displayName}</button>
              ))}
            </div>
            <span className="muted" style={{ marginTop: 6 }}>
              {parts.length === 0 ? `不选则默认全体 ${members.length} 人均摊` : `由选中的 ${parts.length} 人分摊`}
            </span>
          </>
        )}
      </div>
      <div className="modal-ops">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
      </div>
    </Modal>
  );
}
