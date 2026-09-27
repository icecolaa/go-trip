import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { listTrips } from '../../rdb/trip'
import { listRows } from '../../rdb/entities'
import type { TripCardInfo } from '../../types'

interface FeedItem {
  id: string
  tripId: string
  memberName: string
  avatarColor: string
  action: string
  detail: string
  createdAt?: number
}

const AV_FALLBACK = ['#55ACF3', '#FFC414', '#2FA96E', '#FF8A5C', '#7B8CFF', '#2BB8A8']

/** 消息 Tab：全行程协作动态流（gt_activity_log，按行程分组、时间倒序）。 */
export default function Messages() {
  const [groups, setGroups] = useState<{ trip: TripCardInfo; items: FeedItem[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setError('')
      const trips = await listTrips()
      const tripById = new Map(trips.map(t => [t.id, t]))
      // 日志按行程拉取后合并（单主人架构，行程数少，逐行程查询足够）
      const logs = await Promise.all(trips.map(t =>
        listRows('gt_activity_log', { trip_id: { $eq: t.id } }, [{ created_at: 'desc' }], 30) as Promise<any[]>,
      ))
      const all: FeedItem[] = logs.flat().map(r => ({
        id: r.id,
        tripId: r.tripId,
        memberName: r.memberName || '同伴',
        avatarColor: r.avatarColor || '',
        action: r.action || '',
        detail: r.detail || '',
        createdAt: r.createdAt,
      })).filter(x => tripById.has(x.tripId))
      // 按行程分组，组内时间倒序，组间按最新动态时间倒序
      const byTrip = new Map<string, FeedItem[]>()
      for (const item of all) {
        const list = byTrip.get(item.tripId) || []
        list.push(item)
        byTrip.set(item.tripId, list)
      }
      const gs = [...byTrip.entries()]
        .map(([tripId, items]) => ({ trip: tripById.get(tripId)!, items: items.slice(0, 20) }))
        .sort((a, b) => (b.items[0]?.createdAt || 0) - (a.items[0]?.createdAt || 0))
      setGroups(gs)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败，请下拉重试')
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    load()
  })

  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })

  const fmtTime = (ts?: number): string => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    const p = (x: number) => String(x).padStart(2, '0')
    if (sameDay) return `${p(d.getHours())}:${p(d.getMinutes())}`
    return `${p(d.getMonth() + 1)}月${p(d.getDate())}日`
  }

  const openTrip = (tripId: string) => {
    Taro.navigateTo({ url: `/pages/trip/index?id=${tripId}` })
  }

  return (
    <View className="page">
      {error && <View className="error">{error}</View>}

      {!error && !loading && groups.length === 0 && (
        <View className="welcome-card">
          <Text className="wc-emoji">👋</Text>
          <View className="wc-main">
            <View className="wc-title">还没有动态</View>
            <View className="wc-sub">去「行程」添加安排、记账、写日志，动态都会出现在这里</View>
          </View>
        </View>
      )}

      {groups.map(({ trip, items }) => (
        <View key={trip.id}>
          <View className="trip-chip-row" onClick={() => openTrip(trip.id)}>
            <View className="tcr-chip">
              <Text className="tcr-emoji">{trip.coverEmoji}</Text>
              <Text style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.title}</Text>
            </View>
            <View className="tcr-line" />
          </View>
          {items.map(m => {
            const hasColor = !!m.avatarColor
            const avIdx = (m.memberName.charCodeAt(0) || 65) % AV_FALLBACK.length
            return (
              <View key={m.id} className="msg-cell" onClick={() => openTrip(m.tripId)}>
                <View
                  className="avatar"
                  style={hasColor ? { background: m.avatarColor } : { background: AV_FALLBACK[avIdx] }}
                >{m.memberName.slice(0, 1)}</View>
                <View className="msg-main">
                  <View className="msg-title">
                    <Text><b>{m.memberName}</b> {m.action}</Text>
                  </View>
                    {!!m.detail && <Text className="msg-detail">{m.detail}</Text>}
                </View>
                <Text className="msg-time">{fmtTime(m.createdAt)}</Text>
              </View>
            )
          })}
        </View>
      ))}

      <View style={{ height: '40rpx' }} />
    </View>
  )
}
