import { useState } from 'react'
import { View, Text, Button, Input, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { loadTripBundle } from '../../rdb/trip'
import { createExpense, deleteExpense } from '../../rdb/ops'
import { ensureProfile } from '../../rdb/trip'
import type { TripBundle, TripMember, Expense } from '../../types'

const CATS = ['交通', '住宿', '餐饮', '门票', '购物', '娱乐', '其他']
const yuan = (n: number): string => `¥${(Math.round(n * 100) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`

export default function Budget() {
  const router = Taro.getCurrentInstance().router
  const tripId = String(router?.params.tripId || '')
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('餐饮')
  const [payerIdx, setPayerIdx] = useState(0)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      setBundle(await loadTripBundle(tripId))
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' })
    }
  }
  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })
  if (!bundle) {
    load()
    return <View className="page"><Text className="muted">加载中…</Text></View>
  }

  const members: TripMember[] = bundle.members
  const payer = members[Math.min(payerIdx, members.length - 1)]
  const _now = new Date()
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`

  const add = async () => {
    if (busy) return
    const amt = Number(amount)
    if (!isFinite(amt) || amt <= 0) { Taro.showToast({ title: '请填写正确的金额', icon: 'none' }); return }
    setBusy(true)
    try {
      const me = await ensureProfile()
      await createExpense(tripId, {
        tripId,
        title: title.trim() || '未命名支出',
        amount: amt,
        category,
        date: today,
        payerMemberId: payer?.id || '',
        splitMode: 'equal',
        participants: [],
      }, me.nickname)
      setTitle(''); setAmount('')
      setShowAdd(false)
      await load()
      Taro.showToast({ title: '已记账', icon: 'success' })
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '记账失败', icon: 'none' })
      setBusy(false)
    }
  }

  const remove = (exp: Expense) => {
    Taro.showModal({
      title: `删除「${exp.title}」？`,
      success: async (r) => {
        if (!r.confirm) return
        try {
          const me = await ensureProfile()
          await deleteExpense(tripId, exp.id, exp.title, me.nickname)
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '删除失败', icon: 'none' })
        }
      },
    })
  }

  const payerName = (id: string): string => members.find(m => m.id === id)?.displayName || '—'
  const budgetTotal = bundle.trip.budget
  const spent = bundle.budget.total
  const pct = budgetTotal > 0 ? Math.min(100, Math.round((spent / budgetTotal) * 100)) : 0

  return (
    <View className="page">
      <View className="panel">
        <Text className="label">已花 {yuan(spent)}{budgetTotal > 0 ? ` / 预算 ${yuan(budgetTotal)}` : ''}</Text>
        {budgetTotal > 0 && (
          <View className="bar"><View className="bar-in" style={{ width: `${pct}%`, background: pct >= 100 ? '#b4541f' : '#37715a' }} /></View>
        )}
        {bundle.budget.byCategory.map(b => (
          <View key={b.category} className="row-between">
            <Text className="muted">{b.category}</Text>
            <Text className="muted">{yuan(b.amount)}</Text>
          </View>
        ))}
      </View>

      {bundle.budget.perMember.length > 0 && (
        <View className="panel">
          <Text className="label">成员结算（应付为负 = 需收钱）</Text>
          {bundle.budget.perMember.map(pm => {
            const name = members.find(m => m.id === pm.memberId)?.displayName || '—'
            return (
              <View key={pm.memberId} className="row-between">
                <Text>{name}</Text>
                <Text className="muted">垫付 {yuan(pm.paid)} · 应付 {yuan(pm.share)} · <Text style={{ color: pm.balance >= 0 ? '#37715a' : '#b4541f' }}>{pm.balance >= 0 ? '多付 ' : '待付 '}{yuan(Math.abs(pm.balance))}</Text></Text>
              </View>
            )
          })}
        </View>
      )}

      {!showAdd && (
        <Button className="submit" onClick={() => { if (!members.length) { Taro.showToast({ title: '先在成员页添加成员', icon: 'none' }); return } setPayerIdx(0); setShowAdd(true) }}>＋ 记一笔</Button>
      )}
      {showAdd && (
        <View className="panel">
          <View className="field">
            <Text className="label">项目</Text>
            <Input className="input" value={title} onInput={e => setTitle(e.detail.value)} placeholder="例如：民宿三晚" maxlength={60} />
          </View>
          <View className="row2">
            <View className="field">
              <Text className="label">金额 *</Text>
              <Input className="input" type="number" value={amount} onInput={e => setAmount(e.detail.value)} placeholder="0" />
            </View>
            <View className="field">
              <Text className="label">分类</Text>
              <Picker mode="selector" range={CATS} onChange={e => setCategory(CATS[Number(e.detail.value)])}>
                <View className="input picker">{category}</View>
              </Picker>
            </View>
          </View>
          <View className="field">
            <Text className="label">支付人</Text>
            <Picker mode="selector" range={members.map(m => m.displayName)} value={payerIdx} onChange={e => setPayerIdx(Number(e.detail.value))}>
              <View className="input picker">{payer?.displayName || '—'}</View>
            </Picker>
          </View>
          <View className="row2">
            <Button className="ghost" onClick={() => setShowAdd(false)}>取消</Button>
            <Button className="submit-inline" loading={busy} onClick={add}>记账</Button>
          </View>
        </View>
      )}

      <Text className="section">支出明细 · {bundle.expenses.length} 笔</Text>
      {bundle.expenses.length === 0 && <View className="empty"><Text>还没有支出记录</Text></View>}
      {bundle.expenses.map(exp => (
        <View key={exp.id} className="row-between item" onClick={() => remove(exp)}>
          <View>
            <Text>{exp.title}</Text>
            <View className="muted"><Text>{exp.date} · {exp.category} · {payerName(exp.payerMemberId)} 垫付</Text></View>
          </View>
          <Text className="amount">{yuan(exp.amount)}</Text>
        </View>
      ))}
      {bundle.expenses.length > 0 && <View className="hint-center"><Text>点击支出可删除</Text></View>}
    </View>
  )
}
