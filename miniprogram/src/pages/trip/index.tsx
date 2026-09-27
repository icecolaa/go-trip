import { useRef, useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
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

  // 首次加载 + 每次回页刷新（子页保存/删除后返回，云写入有可见性延迟，重拉兜底）
  useDidShow(() => {
    if (bundle) load()
  })
  useState(() => {
    load()
  })

  const goBudget = () => Taro.navigateTo({ url: `/pages/budget/index?tripId=${tripId}` })
  const goPacking = () => Taro.navigateTo({ url: `/pages/packing/index?tripId=${tripId}` })
  const goAddActivity = (dayId: string) => Taro.navigateTo({ url: `/pages/activity/index?tripId=${tripId}&dayId=${dayId}` })
  const goEditActivity = (a: Activity) => Taro.navigateTo({ url: `/pages/activity/index?tripId=${tripId}&dayId=${a.dayId}&activityId=${a.id}` })

  if (error) {
    return (
      <View className="page">
        <View className="error">{error}</View>
        <Button className="ghost" onClick={() => Taro.redirectTo({ url: '/pages/trips/index' })}>返回旅程列表</Button>
      </View>
    )
  }
  if (!bundle) return <View className="page"><Text className="muted">加载中…</Text></View>
  if (!bundle.trip) {
    return (
      <View className="page">
        <View className="error">行程不存在或已被删除</View>
        <Button className="ghost" onClick={() => Taro.redirectTo({ url: '/pages/trips/index' })}>返回旅程列表</Button>
      </View>
    )
  }

  const { trip } = bundle
  const daysByGroup = bundle.days.map(d => ({ day: d, acts: bundle.activities.filter(a => a.dayId === d.id).sort((x, y) => (x.sort || 0) - (y.sort || 0)) }))
  const progress = tripProgress(trip.startDate, trip.endDate)
  const spent = bundle.budget.total
  const statusChip = tripStatusChip(trip.startDate, trip.endDate)

  const fnItems: { icon: string; label: string; onTap: () => void }[] = [
    { icon: '💰', label: '账本', onTap: goBudget },
    { icon: '🎒', label: '清单', onTap: goPacking },
    { icon: '✍️', label: '日志', onTap: () => Taro.navigateTo({ url: `/pages/journal/index?tripId=${tripId}` }) },
    { icon: '📖', label: '锦囊', onTap: () => Taro.navigateTo({ url: `/pages/handbook/index?tripId=${tripId}` }) },
    { icon: '👥', label: '伙伴', onTap: () => Taro.navigateTo({ url: `/pages/members/index?tripId=${tripId}` }) },
    { icon: '🗺️', label: '地图', onTap: () => Taro.navigateTo({ url: `/pages/map/index?tripId=${tripId}` }) },
    { icon: '✨', label: 'AI 解析', onTap: () => Taro.navigateTo({ url: `/pages/trip-ai/index?tripId=${tripId}&maxDay=${bundle.days.length}` }) },
  ]

  return (
    <View className="page">
      <View className="card hero">
        <View className="hero-cover" style={{ background: `linear-gradient(135deg, ${tint(trip.coverColor, 0.3)}, ${trip.coverColor || '#3B6EA5'})` }}>
          <View className="hero-emoji"><Text>{trip.coverEmoji}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="hero-title">{trip.title}</Text>
            <View className="hero-meta"><Text>📍 {trip.destination || '目的地待定'}</Text></View>
            <View className="hero-meta"><Text>{trip.startDate} ~ {trip.endDate}</Text></View>
          </View>
          <View className="date-chip">{statusChip}</View>
        </View>
        <View className="hero-body">
          <View className="progress"><View className="progress-in" style={{ width: `${progress}%` }} /></View>
          <View className="hero-meta">
            <Text>💰 预算 {trip.budget > 0 ? `¥${trip.budget.toLocaleString()}` : '未设'} · 已花 ¥{spent.toLocaleString()}</Text>
          </View>
          <View className="fn-grid">
            {fnItems.map(f => (
              <Button key={f.label} className="fn-item" onClick={f.onTap}>
                <View className="fn-ic"><Text>{f.icon}</Text></View>
                <Text className="fn-label">{f.label}</Text>
              </Button>
            ))}
          </View>
        </View>
      </View>

      {daysByGroup.map(({ day, acts }) => (
        <View key={day.id} className="card day-block">
          <View className="day-head">
            <View className="day-num">
              <Text className="day-n">D{day.dayNumber}</Text>
              {!!day.date && <Text className="day-date">{day.date.slice(5).replace('-', '.')}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="day-title">{day.title || `第 ${day.dayNumber} 天`}</Text>
              {!!day.place && <View className="day-sub"><Text>{day.place}</Text></View>}
            </View>
            <Button className="chip" size="mini" onClick={() => goAddActivity(day.id)}>＋ 安排</Button>
          </View>
          {acts.length === 0 && (
            <View className="day-empty">
              <Text>这一天还没有安排</Text>
              <View><Button className="chip" size="mini" onClick={() => goAddActivity(day.id)}>添加第一个安排</Button></View>
            </View>
          )}
          {acts.map(a => (
            <View key={a.id} className="act" onClick={() => goEditActivity(a)}>
              <Text className="act-time">{a.time || '待定'}</Text>
              <Text className="act-emoji">{KIND_EMOJI[a.kind] || '📌'}</Text>
              <View className="act-main">
                <Text className="act-title">{a.title}</Text>
                {!!a.place && <View className="act-place"><Text>📍 {a.place}</Text></View>}
                {!!a.notes && <View className="act-notes"><Text>{a.notes}</Text></View>}
              </View>
              {a.cost > 0 && <Text className="act-cost">¥{a.cost}</Text>}
            </View>
          ))}
        </View>
      ))}

      <View className="btn-row" style={{ marginTop: '16rpx', marginBottom: '24rpx' }}>
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

/** Hero 状态 chip 文案：计划中倒计时 / 进行中第 N 天 / 已结束。 */
function tripStatusChip(start: string, end: string): string {
  const now = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const days = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
  if (today < start) {
    const left = days(today, start)
    return left >= 1 ? `出发倒计时 ${left} 天` : '今天出发'
  }
  if (today > end) return '旅程已结束'
  return `进行中 · 第 ${days(start, today) + 1} 天`
}

/** 封面色提亮：hex 混白，做渐变亮端。 */
function tint(hex: string, amt: number): string {
  const h = (hex || '#3B6EA5').replace('#', '')
  if (h.length !== 6) return '#55ACF3'
  const n = parseInt(h, 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amt)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
