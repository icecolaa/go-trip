import { useRef, useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { usePullDownRefresh, useUnload } from '@tarojs/taro'
import { api, getToken, setToken, ApiFail } from '../../api/request'
import { connectWS, closeWS } from '../../api/ws'
import type { TripBundle, TripDay, Activity } from '../../types'

const KIND_EMOJI: Record<string, string> = {
  sight: '🏞️', food: '🍜', hotel: '🏨', transport: '🚄',
  shopping: '🛍️', show: '🎭', other: '📌',
}

let reloadTimer: ReturnType<typeof setTimeout> | null = null

export default function Trip() {
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [error, setError] = useState('')
  const tripId = Number(Taro.getCurrentInstance().router?.params.id || 0)
  const reloading = useRef(false)

  const load = async () => {
    if (!tripId || reloading.current) return
    reloading.current = true
    try {
      setError('')
      const b = await api.get<TripBundle>(`/api/trips/${tripId}`)
      setBundle(b)
    } catch (e) {
      if (e instanceof ApiFail && e.status === 401) {
        setToken('')
        Taro.redirectTo({ url: '/pages/login/index' })
        return
      }
      setError(e instanceof ApiFail ? e.message : '加载失败，请下拉重试')
    } finally {
      reloading.current = false
    }
  }

  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })

  // 首次加载 + 实时订阅
  useState(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    load()
    if (tripId) {
      connectWS(tripId, (msg) => {
        if (msg.type === 'change' || msg.type === 'location') {
          if (reloadTimer) clearTimeout(reloadTimer)
          reloadTimer = setTimeout(() => load(), 600)
        }
      })
    }
  })

  // 离开页面断开 WS
  useUnload(() => {
    closeWS()
  })

  const goBudget = () => Taro.navigateTo({ url: `/pages/budget/index?tripId=${tripId}` })
  const goPacking = () => Taro.navigateTo({ url: `/pages/packing/index?tripId=${tripId}` })
  const goAddActivity = (dayId: number) => Taro.navigateTo({ url: `/pages/activity/index?tripId=${tripId}&dayId=${dayId}` })
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
          <Button className="chip" size="mini" onClick={() => Taro.showToast({ title: '成员页脚手架待接入', icon: 'none' })}>👥 成员</Button>
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
