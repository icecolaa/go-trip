/** 预算汇总与结算建议（最小现金流转算法）——客户端/服务端共用纯函数。
 * id 一律为数据模型 _id（string）。 */

export interface BudgetMemberRef {
  id: string;
}

export interface BudgetExpenseRef {
  amount: number;
  category: string;
  payerMemberId: string;
  splitMode: string; // 'equal' | 'payer'
  participants?: string[]; // 成员 _id 列表；空 = 全员均摊
}

export interface BudgetPerMember {
  memberId: string;
  paid: number;
  share: number;
  balance: number;
}

export interface BudgetSettlement {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

export interface BudgetSummary {
  total: number;
  byCategory: { category: string; amount: number }[];
  perMember: BudgetPerMember[];
  settlements: BudgetSettlement[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcBudget(expenses: BudgetExpenseRef[], members: BudgetMemberRef[]): BudgetSummary {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCat = new Map<string, number>();
  for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);

  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  for (const m of members) {
    paid.set(m.id, 0);
    share.set(m.id, 0);
  }
  for (const e of expenses) {
    paid.set(e.payerMemberId, (paid.get(e.payerMemberId) || 0) + e.amount);
    let parts: string[];
    if (e.splitMode === 'payer') {
      parts = [e.payerMemberId];
    } else {
      parts = e.participants?.length ? e.participants : members.map(m => m.id);
    }
    const per = e.amount / parts.length;
    for (const p of parts) share.set(p, (share.get(p) || 0) + per);
  }

  const perMember = members.map(m => {
    const p = paid.get(m.id) || 0;
    const s = share.get(m.id) || 0;
    return { memberId: m.id, paid: round2(p), share: round2(s), balance: round2(p - s) };
  });

  // 最小转账：债权人排序、债务人排序后互相抵扣
  const creditors = perMember.filter(m => m.balance > 0.005).map(m => ({ id: m.memberId, amt: m.balance })).sort((a, b) => b.amt - a.amt);
  const debtors = perMember.filter(m => m.balance < -0.005).map(m => ({ id: m.memberId, amt: -m.balance })).sort((a, b) => b.amt - a.amt);
  const settlements: BudgetSettlement[] = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const pay = Math.min(creditors[i].amt, debtors[j].amt);
    if (pay > 0.005) settlements.push({ fromMemberId: debtors[j].id, toMemberId: creditors[i].id, amount: round2(pay) });
    creditors[i].amt -= pay;
    debtors[j].amt -= pay;
    if (creditors[i].amt <= 0.005) i++;
    if (debtors[j].amt <= 0.005) j++;
  }

  return {
    total: round2(total),
    byCategory: [...byCat.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    perMember,
    settlements,
  };
}
