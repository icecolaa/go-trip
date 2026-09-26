import { useRef, useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { loadTripBundle } from '../../rdb/trip'
import type { TripBundle, Activity } from '../../types'

const KIND_EMOJI: Record<string, string> = {
  sight: '🏞️', food: '🍜', hotel: '🏨', transport: '🚄',
  shopping: '🛍️', show: '🎭', other: '📌',
}

export default function Trip() {
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [error, setError] = useState('')
  const tripId = String(Taro.getCurrentInstance().router?.params.id || '')
  const reloading = useRef(false)

  const load = async () => {
    if (!tripId || reloading.current) return
    reloading.current = true
    try {
      setError('')
      setBundle(await loadTripBundle(tripId))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败，请下拉重试')
    } finally {
      reloading.current = false
    }
  }

  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })

  // 首次加载（单主人架构，无实时订阅）
  useState(() => {
    load()
  })

  const goBudget = () => Taro.navigateTo({ url: `/pages/budget/index?tripId=${tripId}` })
  const goPacking = () => Taro.navigateTo({ url: `/pages/packing/index?tripId=${tripId}` })
  const goAddActivity = (dayId: string) => Taro.navigateTo({ url: `/pages/activity/index?tripId=${tripId}&dayId=${dayId}` })
  const goEditActivity = (a: Activity) => Taro.navigateTo({ url: `/pages/activity/index?tripId=${tripId}&dayId=${a.dayId}&activityId=${a.id}` })

  const daysByGroup = bundle
    ? bundle.days.map(d => ({ day: d, acts: bundle.activities.filter(a => a.dayId === d.id).sort((x, y) => (x.sort || 0) - (y.sort || 0)) }))
    : []

  const progress = bundle ? tripProgress(bundle.trip.startDate, bundle.trip.endDate) : 0

  if (error) {
    return (
      <View className="page">
        <View className="error">{error}</View>
        <Button className="ghost" onClick={() => Taro.redirectTo({ url: '/pages/trips/index' })}>返回旅程列表</Button>
      </View>
    )
  }
  if (!bundle) return <View className="page"><Text className="muted">加载中…</Text></View>

  const { trip } = bundle
  const spent = bundle.budget.total

  return (
    <View className="page">
      <View className="hero">
        <View className="hero-row">
          <Text className="hero-emoji">{trip.coverEmoji}</Text>
          <View style={{ flex: 1 }}>
            <Text className="hero-title">{trip.title}</Text>
            <View className="hero-meta">
              <Text>📍 {trip.destination || '目的地待定'}</Text>
            </View>
            <View className="hero-meta">
              <Text>{trip.startDate} ~ {trip.endDate}</Text>
            </View>
          </View>
        </View>
        <View className="progress"><View className="progress-in" style={{ width: `${progress}%` }} /></View>
        <View className="hero-meta" style={{ marginTop: '10rpx' }}>
          <Text>💰 预算 {trip.budget > 0 ? `¥${trip.budget.toLocaleString()}` : '未设'} · 已花 ¥{spent.toLocaleString()}</Text>
        </View>
        <View className="btn-row">
          <Button className="chip" size="mini" onClick={goBudget}>💰 预算</Button>
          <Button className="chip" size="mini" onClick={goPacking}>🎒 清单</Button>
          <Button className="chip" size="mini" onClick={() => Taro.navigateTo({ url: `/pages/journal/index?tripId=${tripId}` })}>✍️ 日志</Button>
          <Button className="chip" size="mini" onClick={() => Taro.navigateTo({ url: `/pages/handbook/index?tripId=${tripId}` })}>📖 锦囊</Button>
          <Button className="chip" size="mini" onClick={() => Taro.navigateTo({ url: `/pages/members/index?tripId=${tripId}` })}>👥 成员</Button>
          <Button className="chip" size="mini" onClick={() => Taro.navigateTo({ url: `/pages/map/index?tripId=${tripId}` })}>🗺️ 地图</Button>
          <Button className="chip" size="mini" onClick={() => Taro.navigateTo({ url: `/pages/trip-ai/index?tripId=${tripId}&maxDay=${bundle.days.length}` })}>AI 解析</Button>
        </View>
      </View>

      {daysByGroup.map(({ day, acts }) => (
        <View key={day.id} className="day-block">
          <View className="day-head">
            <View className="day-num"><Text className="day-n">D{day.dayNumber}</Text></View>
            <View style={{ flex: 1 }}>
              <Text className="day-title">{day.title || `第 ${day.dayNumber} 天`}</Text>
              <View className="day-sub"><Text>{day.date}{day.place ? ` · ${day.place}` : ''}</Text></View>
            </View>
            <Button className="chip" size="mini" onClick={() => goAddActivity(day.id)}>＋ 安排</Button>
          </View>
          {acts.length === 0 && <View className="day-empty"><Text>这一天还没有安排</Text></View>}
          {acts.map(a => (
            <View key={a.id} className="act" onClick={() => goEditActivity(a)}>
              <Text className="act-time">{a.time || '待定'}</Text>
              <Text className="act-emoji">{KIND_EMOJI[a.kind] || '📌'}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="act-title">{a.title}</Text>
                {!!a.place && <View className="act-place"><Text>📍 {a.place}</Text></View>}
                {!!a.notes && <View className="act-notes"><Text>{a.notes}</Text></View>}
              </View>
              {a.cost > 0 && <Text className="act-cost">¥{a.cost}</Text>}
            </View>
          ))}
        </View>
      ))}

      <View className="btn-row" style={{ marginTop: '16rpx' }}>
        <Button className="ghost" size="mini" onClick={() => Taro.navigateTo({ url: `/pages/trip-create/index` })}>＋ 新的旅程</Button>
      </View>
    </View>
  )
}

function tripProgress(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00').getTime()
  const e = new Date(end + 'T00:00:00').getTime()
  const n = Date.now()
  if (n <= s) return 0
  if (n >= e + 86400000) return 100
  return Math.round(((n - s) / (e + 86400000 - s)) * 100)
}
