import { useMemo, useState } from 'react';
import { useApp } from '../../store';
import { Modal, yuan, Avatar, EXPENSE_CATS, EXPENSE_CAT_ICON } from '../../components/ui';
import { createExpense, updateExpense, deleteExpense } from '../../rdb/ops';
import type { TabCtx } from './tabCtx';
import type { Expense } from '../../types';

export default function BudgetTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const { expenses, members, budget, trip } = bundle;
  const memberName = members[0]?.displayName || '我';

  const byMember = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const myMemberId = members[0]?.id || '';
  const mine = budget.perMember.find(p => p.memberId === myMemberId);
  const myPaid = mine?.paid || 0;
  const myShare = mine?.share || 0;
  const myBalance = mine?.balance || 0;
  const avg = members.length ? budget.total / members.length : 0;
  const budgetPct = trip.budget > 0 ? Math.min(100, Math.round((budget.total / trip.budget) * 100)) : 0;

  const del = async (e: Expense) => {
    if (!confirm(`删除账目「${e.title}」？`)) return;
    try {
      await deleteExpense(trip.id, e.id, e.title, memberName);
      toast('已删除');
      reload();
    } catch (err) { toast(err instanceof Error ? err.message : '删除失败', true); }
  };

  /** 分类条形色轮换（晴空航线：住宿绿/餐饮黄/门票蓝/交通青/其他灰） */
  const catColor = (c: string): string => ({
    '住宿': 'var(--green)',
    '餐饮': 'var(--yel400)',
    '门票': 'var(--sky500)',
    '交通': 'var(--teal)',
  } as Record<string, string>)[c] || 'var(--ink-faint)';

  return (
    <div className="budget-web">
      {/* 左列：stat 三卡 + 账单明细表格 */}
      <div className="bw-left">
        <div className="budget-cards">
          <div className="card stat-card">
            <div className="lab">行程支出</div>
            <div className="val">{yuan(budget.total)}</div>
            <div className="sub">{expenses.length} 笔 · {members.length} 人</div>
          </div>
          <div className="card stat-card">
            <div className="lab">人均消耗</div>
            <div className="val">{yuan(Math.round(avg))}</div>
            <div className="sub">按 {members.length} 人均摊</div>
          </div>
          <div className="card stat-card">
            <div className="lab">团队预算 {trip.budget > 0 ? yuan(trip.budget) : '未设置'}</div>
            <div className="val">{trip.budget > 0 ? `已用 ${budgetPct}%` : '—'}</div>
            {trip.budget > 0 && (
              <>
                <div className="cat-bar" style={{ marginTop: 8 }}>
                  <div style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? 'var(--red)' : 'linear-gradient(90deg, var(--yel400), var(--yel500))' }} />
                </div>
                <div className="sub">剩余 {yuan(Math.max(0, trip.budget - budget.total))}{budgetPct <= 70 ? ' · 余量充足' : budgetPct <= 90 ? ' · 留意开销' : ' · 已接近上限'}</div>
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <div className="sec-h">
            <span className="t">账单明细</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="more">共 {expenses.length} 笔</span>
              {canEdit && <button className="btn sm primary" onClick={() => setAdding(true)}>＋ 记一笔</button>}
            </span>
          </div>
          {expenses.length === 0 ? (
            <div className="empty"><span className="big">💰</span>还没有记账<br />机票、住宿、门票……记下来一起算</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>分类</th><th>项目</th><th>垫付人</th><th>分摊</th><th>日期</th><th style={{ textAlign: 'right' }}>金额</th>{canEdit ? <th aria-label="操作" /> : null}</tr>
              </thead>
              <tbody>
                {expenses.map(e => {
                  const payer = byMember.get(e.payerMemberId);
                  return (
                    <tr key={e.id}>
                      <td><span className="tag blue">{e.category}</span></td>
                      <td style={{ fontWeight: 600 }}>{e.title}</td>
                      <td>{payer?.displayName || '未知'}</td>
                      <td className="muted">{e.splitMode === 'payer' ? '自付' : `${e.participants.length || members.length} 人均摊`}</td>
                      <td className="muted">{e.date.slice(5)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{yuan(e.amount)}</td>
                      {canEdit && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn sm ghost" onClick={() => setEditing(e)}>改</button>{' '}
                          <button className="btn sm danger" onClick={() => del(e)}>删</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 右列：分类统计条形 + 智能结算 */}
      <div className="bw-right">
        {budget.byCategory.length > 0 && (
          <div className="card" style={{ padding: '18px 20px', marginBottom: 16 }}>
            <div className="sec-h"><span className="t">分类统计</span></div>
            {budget.byCategory.map(c => (
              <div key={c.category} className="cat-row">
                <span className="n">{c.category}</span>
                <div className="track"><div className="fill" style={{ width: `${Math.max(3, (c.amount / budget.total) * 100)}%`, background: catColor(c.category) }} /></div>
                <span className="v">{yuan(c.amount)} · {Math.round((c.amount / budget.total) * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        {budget.settlements.length > 0 && (
          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="sec-h">
              <span className="t">智能结算</span>
              <span className="tag green">转账最少 · {budget.settlements.length} 笔</span>
            </div>
            {budget.settlements.map((s, i) => {
              const from = byMember.get(s.fromMemberId);
              const to = byMember.get(s.toMemberId);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                  <Avatar name={from?.displayName || '?'} color={from?.avatarColor || '#93A5B8'} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{from?.displayName}</div>
                    <div className="muted" style={{ fontSize: 11 }}>应付</div>
                  </div>
                  <i className="ic ic-transfer" style={{ width: 18, height: 18, color: 'var(--sky400)' }} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{to?.displayName}</div>
                    <div className="muted" style={{ fontSize: 11 }}>收款</div>
                  </div>
                  <Avatar name={to?.displayName || '?'} color={to?.avatarColor || '#93A5B8'} size="sm" />
                  <b style={{ width: 74, textAlign: 'right', color: 'var(--sky700)', fontVariantNumeric: 'tabular-nums' }}>{yuan(s.amount)}</b>
                </div>
              );
            })}
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>按此方案转账后全员两清，谁也不多垫一分钱。</div>
          </div>
        )}

        {trip.budget > 0 && (
          <div className="card" style={{ padding: '18px 20px', marginTop: 16 }}>
            <div className="sec-h"><span className="t">我的账本</span></div>
            <div className="cat-row">
              <span className="n">已垫付</span>
              <div className="track"><div className="fill" style={{ width: `${myShare > 0 ? Math.min(100, (myPaid / myShare) * 100) : 0}%`, background: 'var(--sky500)' }} /></div>
              <span className="v">{yuan(myPaid)}</span>
            </div>
            <div className="cat-row">
              <span className="n">应摊</span>
              <div className="track"><div className="fill" style={{ width: myPaid > 0 ? `${Math.min(100, (myShare / myPaid) * 100)}%` : '0%', background: 'var(--yel400)' }} /></div>
              <span className="v">{yuan(myShare)}</span>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              {myBalance >= 0 ? `待收回 ${yuan(myBalance)} · 大家应还给你` : `待支付 ${yuan(Math.abs(myBalance))} · 转给垫付的伙伴`}
            </div>
          </div>
        )}
      </div>

      {(adding || editing) && (
        <ExpenseModal
          expense={editing}
          tripId={trip.id}
          memberName={memberName}
          members={members.map(m => ({ id: m.id, displayName: m.displayName }))}
          defaultDate={trip.startDate}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ expense, tripId, memberName, members, defaultDate, onClose, onSaved }: {
  expense?: Expense | null;
  tripId: string;
  memberName: string;
  members: { id: string; displayName: string }[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [category, setCategory] = useState(expense?.category || '餐饮');
  const [date, setDate] = useState(expense?.date || defaultDate);
  const [payer, setPayer] = useState(expense?.payerMemberId || members[0]?.id || '');
  const [splitMode, setSplitMode] = useState(expense?.splitMode || 'equal');
  const [parts, setParts] = useState<string[]>(expense?.participants || []);
  const [busy, setBusy] = useState(false);

  const togglePart = (id: string) => {
    setParts(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const save = async () => {
    if (busy) return;
    const amt = Number(amount);
    if (!title.trim()) { toast('记一下花了什么', true); return; }
    if (!isFinite(amt) || amt <= 0) { toast('金额要大于 0', true); return; }
    setBusy(true);
    const data = {
      tripId,
      title: title.trim(), amount: amt, category, date,
      payerMemberId: payer, splitMode,
      participants: splitMode === 'equal' ? parts : [],
    };
    try {
      if (expense) {
        await updateExpense(tripId, expense.id, data, memberName);
        toast('账目已更新');
      } else {
        await createExpense(tripId, data, memberName);
        toast('已记账');
      }
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', true);
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
