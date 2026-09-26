import { useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { ensureProfile, listTrips } from '../../rdb/trip'
import { seedDemoTrip } from '../../rdb/seed'
import type { Profile, TripCardInfo } from '../../types'

/** 我的旅程：rdb 直连（数据模型），无登录概念——原生身份静默建档。 */
export default function Trips() {
  const [trips, setTrips] = useState<TripCardInfo[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [seeding, setSeeding] = useState(false)

  const load = async () => {
    try {
      setError('')
      const me = await ensureProfile()
      setProfile(me)
      setTrips(await listTrips())
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败，请下拉重试')
    }
  }

  useDidShow(() => {
    load()
  })

  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })

  const open = (id: string) => {
    Taro.navigateTo({ url: `/pages/trip/index?id=${id}` })
  }

  const goCreate = () => {
    Taro.navigateTo({ url: '/pages/trip-create/index' })
  }

  const importDemo = async () => {
    if (!profile || seeding) return
    setSeeding(true)
    try {
      await seedDemoTrip(profile.nickname)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败，请重试')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <View className="page">
      <View className="fw-entry" onClick={() => Taro.navigateTo({ url: '/pages/flywhere/index' })}>
        <Text>✈️ 飞哪儿 · 按票价探索目的地</Text>
        <Text className="muted">›</Text>
      </View>
      <View className="head">
        <Text className="title">我的旅程</Text>
        <Button className="submit-inline" size="mini" onClick={goCreate}>＋ 新建</Button>
      </View>

      {error && <View className="error">{error}</View>}

      {!error && trips.length === 0 && (
        <View className="empty">
          <Text>还没有旅程</Text>
          <Button
            className="submit"
            style={{ marginTop: '24rpx' }}
            loading={seeding}
            disabled={seeding}
            onClick={importDemo}
          >导入演示行程</Button>
        </View>
      )}

      {trips.map(t => (
        <View key={t.id} className="card" onClick={() => open(t.id)}>
          <View className="card-head">
            <Text className="emoji">{t.coverEmoji}</Text>
            <Text className="title">{t.title}</Text>
          </View>
          <View className="meta">
            <Text>📍 {t.destination || '目的地待定'} · {t.activityCount} 项安排 · 已花 ¥{t.totalSpent}</Text>
          </View>
          <View className="meta">
            <Text className="date">{t.startDate} ~ {t.endDate}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
