import { useState } from 'react'
import { View, Text, Button, Input, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { api, ApiFail } from '../../api/request'
import { useTheme } from '../../theme'
import type { TripBundle, CashRefKind } from '../../types'

/**
 * 现金准备：金额、币种、每人或总价、人数、合计。
 * 合计只在后端算一次（total 字段），前端各处只读 total，避免重复计算。
 */

const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'HKD', 'THB', 'SGD']
const CUR_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥', HKD: 'HK$', THB: '฿', SGD: 'S$' }

export default function Cash() {
  const router = Taro.getCurrentInstance().router
  const tripId = Number(router?.params.tripId || 0)
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [adding, setAdding] = useState(false)
  const { resolved } = useTheme()

  const load = async () => {
    try {
      setBundle(await api.get<TripBundle>(`/api/trips/${tripId}`))
    } catch (e) {
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '加载失败', icon: 'none' })
    }
  }
  usePullDownRefresh(() => { load().finally(() => Taro.stopPullDownRefresh()) })
  if (!bundle) { load(); return <View className="page"><Text className="muted">加载中…</Text></View> }

  const items = bundle.cash || []
  const totals = new Map<string, number>()
  for (const c of items) totals.set(c.currency, (totals.get(c.currency) || 0) + c.total)

  const remove = async (id: number) => {
    Taro.showModal({
      title: '删除现金项', content: '确定删除这条现金项？',
      success: async (r) => {
        if (!r.confirm) return
        try { await api.del(`/api/cash/${id}`); await load() } catch (e) {
          Taro.showToast({ title: e instanceof ApiFail ? e.message : '删除失败', icon: 'none' })
        }
      },
    })
  }

  return (
    <View className="page" data-theme={resolved}>
      {totals.size > 0 && (
        <View className="card">
          <View className="row-between" style={{ flexWrap: 'wrap', gap: '16rpx' }}>
            {[...totals.entries()].map(([cur, sum]) => (
              <Text key={cur} style={{ fontSize: '27rpx' }}>
                <Text className="muted" style={{ fontSize: '22rpx', marginRight: '8rpx' }}>{cur} 合计</Text>
                <Text style={{ fontWeight: 600 }}>{CUR_SYMBOL[cur] || ''}{sum.toFixed(2)}</Text>
              </Text>
            ))}
          </View>
          <Text className="muted" style={{ fontSize: '21rpx', lineHeight: 1.6, display: 'block', marginTop: '8rpx' }}>
            每人价的项目按人数自动折算合计；同一笔现金只在这里记一次，行程与票卡上都是引用显示，不会重复计算。
          </Text>
        </View>
      )}

      {items.length === 0 ? (
        <View className="card empty"><Text>还没有现金项——摊位、小店、小费这些只收现金的地方，先记在这里</Text></View>
      ) : (
        <View className="place-list">
          {items.map(c => (
            <View className="place-item" key={c.id}>
              <View className="row-between">
                <Text className="nm">{c.title}</Text>
                <Text style={{ color: 'var(--orange)', fontWeight: 600 }}>{CUR_SYMBOL[c.currency] || ''}{c.total.toFixed(2)}</Text>
              </View>
              <View className="sub">
                <Text>
                  {c.currency} · {c.perPerson ? `每人 ${CUR_SYMBOL[c.currency] || ''}${c.amount} × ${c.people} 人` : `总价 ${CUR_SYMBOL[c.currency] || ''}${c.amount}`}
                </Text>
              </View>
              <View className="ops">
                <Button className="chip" size="mini" onClick={() => remove(c.id)}>删除</Button>
              </View>
            </View>
          ))}
        </View>
      )}

      <View className="btn-row" style={{ marginTop: '16rpx' }}>
        <Button className="submit" size="mini" onClick={() => setAdding(true)}>＋ 添加现金项</Button>
      </View>

      {adding && <AddCash tripId={tripId} bundle={bundle} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await load() }} />}
    </View>
  )
}

function AddCash({ tripId, bundle, onClose, onSaved }: {
  tripId: number; bundle: TripBundle; onClose: () => void; onSaved: () => Promise<void> | void
}) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [curIdx, setCurIdx] = useState(0)
  const [perPerson, setPerPerson] = useState(true)
  const [people, setPeople] = useState('2')
  const [refIdx, setRefIdx] = useState(0)
  const [busy, setBusy] = useState(false)

  const dayById = new Map(bundle.days.map(d => [d.id, d]))
  const refs: { refKind: CashRefKind; refId: number; label: string }[] = [{ refKind: 'day', refId: 0, label: '不关联' }]
  for (const a of bundle.activities) {
    if (a.kind !== 'transport' && a.kind !== 'hotel') continue
    const day = dayById.get(a.dayId)
    refs.push({
      refKind: a.kind === 'transport' ? 'transport' : 'stay',
      refId: a.id,
      label: `${a.kind === 'transport' ? '交通' : '住宿'} · D${day?.dayNumber ?? '?'} ${a.title}`,
    })
  }
  const currency = CURRENCIES[curIdx]
  const picked = refs[Math.min(refIdx, refs.length - 1)]
  const preview = (Number(amount) || 0) * (perPerson ? Math.max(1, Math.floor(Number(people) || 1)) : 1)

  const submit = async () => {
    if (!title.trim()) { Taro.showToast({ title: '写一下这笔现金用来做什么', icon: 'none' }); return }
    const amt = Number(amount)
    if (!isFinite(amt) || amt <= 0) { Taro.showToast({ title: '请填写正确的金额', icon: 'none' }); return }
    setBusy(true)
    try {
      await api.post(`/api/trips/${tripId}/cash`, {
        title: title.trim(), amount: amt, currency,
        perPerson, people: Math.max(1, Math.floor(Number(people) || 1)),
        refKind: picked.refId ? picked.refKind : undefined,
        refId: picked.refId || undefined,
      })
      Taro.showToast({ title: '已添加', icon: 'success' })
      await onSaved()
    } catch (e) {
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '保存失败', icon: 'none' })
      setBusy(false)
    }
  }

  return (
    <View className="modal-mask">
      <View className="modal">
        <Text className="modal-title">添加现金项</Text>
        <View className="field"><Text className="label">用途</Text><Input className="input" value={title} onInput={e => setTitle(e.detail.value)} placeholder="例如：喜洲古镇摊位" /></View>
        <View className="field"><Text className="label">金额</Text><Input className="input" type="digit" value={amount} onInput={e => setAmount(e.detail.value)} placeholder="0.00" /></View>
        <Picker mode="selector" range={CURRENCIES} value={curIdx} onChange={e => setCurIdx(Number(e.detail.value))}>
          <View className="field"><Text className="label">币种</Text><Text className="input">{currency}</Text></View>
        </Picker>
        <View className="row-between">
          <Text>金额是「每人」价格</Text>
          <Button className="chip" size="mini" onClick={() => setPerPerson(v => !v)}>{perPerson ? '✓ 是' : '否（总价）'}</Button>
        </View>
        {perPerson && (
          <View className="field"><Text className="label">人数</Text><Input className="input" type="number" value={people} onInput={e => setPeople(e.detail.value)} /></View>
        )}
        <Picker mode="selector" range={refs.map(r => r.label)} value={refIdx} onChange={e => setRefIdx(Number(e.detail.value))}>
          <View className="field"><Text className="label">关联到（可选）</Text><Text className="input">{picked.label}</Text></View>
        </Picker>
        <Text className="muted" style={{ fontSize: '22rpx' }}>合计预览：{CUR_SYMBOL[currency] || ''}{preview.toFixed(2)}（保存后以服务端计算为准）</Text>
        <View className="modal-ops">
          <Button className="ghost" size="mini" onClick={onClose}>取消</Button>
          <Button className="submit" size="mini" disabled={busy} onClick={submit}>添加</Button>
        </View>
      </View>
    </View>
  )
}
