import { useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { api, ApiFail } from '../../api/request'
import type { TripBundle, GuideCard } from '../../types'

const INTERESTS = ['美食', '自然', '人文', '亲子', '购物', '夜生活']

export default function Handbook() {
  const router = Taro.getCurrentInstance().router
  const tripId = Number(router?.params.tripId || 0)
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [cards, setCards] = useState<GuideCard[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [b, c] = await Promise.all([
        api.get<TripBundle>(`/api/trips/${tripId}`),
        api.get<GuideCard[]>(`/api/trips/${tripId}/handbook`),
      ])
      setBundle(b); setCards(c); setError('')
    } catch (e) {
      setError(e instanceof ApiFail ? e.message : '加载失败')
    }
  }
  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })
  if (!bundle) {
    load()
    return <View className="page"><Text className="muted">加载中…</Text></View>
  }

  const generate = async () => {
    if (busy) return
    setBusy(true)
    try {
      Taro.showLoading({ title: 'AI 整理锦囊中…' })
      const fresh = await api.post<GuideCard[]>(`/api/trips/${tripId}/handbook/generate`, { interests })
      setCards(fresh)
      Taro.hideLoading()
      Taro.showToast({ title: `已生成 ${fresh.length} 张卡片`, icon: 'success' })
    } catch (e) {
      Taro.hideLoading()
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '生成失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const remove = (c: GuideCard) => {
    Taro.showModal({
      title: `删除「${c.title}」？`,
      success: async (r) => {
        if (!r.confirm) return
        try {
          await api.del(`/api/handbook/${c.id}`)
          setCards(prev => prev.filter(x => x.id !== c.id))
        } catch (e) {
          Taro.showToast({ title: e instanceof ApiFail ? e.message : '删除失败', icon: 'none' })
        }
      },
    })
  }

  const grouped = Object.entries(cards.reduce<Record<string, GuideCard[]>>((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c)
    return acc
  }, {}))

  return (
    <View className="page">
      <View className="panel">
        <Text className="label">按目的地与日期生成目的地锦囊（开放时间/亮点/提示）</Text>
        <View className="chips-row">
          {INTERESTS.map(i => (
            <Text key={i} className={`fw-chip ${interests.includes(i) ? 'on' : ''}`} onClick={() => setInterests(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i])}>{i}</Text>
          ))}
        </View>
        <Button className="submit" size="mini" loading={busy} onClick={generate}>生成锦囊</Button>
      </View>

      {cards.length === 0 && <View className="empty"><Text>还没有锦囊卡片，点上方生成</Text></View>}
      {grouped.map(([cat, list]) => (
        <View key={cat} className="panel">
          <Text className="section" style={{ marginTop: 0 }}>{cat}</Text>
          {list.map(c => (
            <View key={c.id} className="hb-card">
              <View className="row-between">
                <Text className="hb-title">{c.icon} {c.title}</Text>
                <Text className="hb-del" onClick={() => remove(c)}>删除</Text>
              </View>
              {!!c.summary && <View className="hb-summary"><Text>{c.summary}</Text></View>}
              {c.items.map((it, i) => (
                <View key={i} className="hb-item">
                  {!!it.label && <Text className="hb-label">{it.label}</Text>}
                  <Text className="hb-text">{it.text}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}
