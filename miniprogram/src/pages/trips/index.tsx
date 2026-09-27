import { useState } from 'react'
import { View, Text, Button, Image } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh, useShareAppMessage } from '@tarojs/taro'
import { syncTabBar } from '../../tab-sync'
import { ensureProfile, listTrips } from '../../rdb/trip'
import { seedDemoTrip } from '../../rdb/seed'
import { deleteTrip } from '../../rdb/ops'
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
    syncTabBar(0)
    load()
  })

  useShareAppMessage(() => ({ title: '出发吧 GoTrip · 和同伴一起，把旅程安排明白', path: '/pages/trips/index' }))

  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })

  const open = (id: string) => {
    Taro.navigateTo({ url: `/pages/trip/index?id=${id}` })
  }

  /** 长按删除旅程（级联清理；误触保护走系统确认弹窗）。 */
  const confirmRemove = (t: TripCardInfo) => {
    Taro.showModal({
      title: `删除「${t.title}」？`,
      content: '行程、安排、账目、清单与动态将一并删除，不可恢复',
      confirmColor: '#F0655A',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await deleteTrip(t.id)
          Taro.showToast({ title: '已删除', icon: 'success' })
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '删除失败', icon: 'none' })
        }
      },
    })
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
    <View className="page tab-page">
      <View className="brand-row">
        <Image className="brand-logo" src="/assets/logo.png" mode="aspectFill" />
        <View>
          <View className="brand-name">出发吧 GoTrip</View>
          <View className="brand-sub">和同伴一起，把旅程安排明白</View>
        </View>
      </View>

      <View className="head">
        <Text className="title">我的旅程</Text>
        <Button className="submit-inline yellow" size="mini" onClick={goCreate}>＋ 新建</Button>
      </View>

      {error && <View className="error">{error}</View>}

      {!error && trips.length === 0 && (
        <View className="empty-hero">
          <Image className="empty-logo" src="/assets/logo.png" mode="aspectFit" />
          <View className="empty-title">还没有旅程</View>
          <View className="empty-sub">创建一场旅行，或先看看演示行程长什么样</View>
          <Button
            className="submit yellow"
            loading={seeding}
            disabled={seeding}
            onClick={importDemo}
          >导入演示行程</Button>
        </View>
      )}

      {trips.map(t => {
        const status = tripStatus(t.startDate, t.endDate)
        return (
          <View key={t.id} className="card trip-card" onClick={() => open(t.id)} onLongPress={() => confirmRemove(t)}>
            <View className="trip-cover" style={{ background: `linear-gradient(135deg, ${tint(t.coverColor, 0.42)}, ${t.coverColor || '#3B6EA5'})` }}>
              <Text className="cover-emoji">{t.coverEmoji}</Text>
              <View className="cover-scrim" />
              <View className={`trip-chip ${status.cls}`}>
                <i />
                <Text>{status.label}</Text>
              </View>
              <Text className="cover-title">{t.title}</Text>
              <View className="date-chip">{t.activityCount} 项安排</View>
            </View>
            <View className="trip-body">
              <View className="trip-meta" style={{ marginTop: 0 }}>
                <Text style={{ fontWeight: 700, color: 'var(--ink)' }}>📍 {t.destination || '目的地待定'}</Text>
                <Text className="trip-cost">已花 ¥{t.totalSpent.toLocaleString()}</Text>
              </View>
              <View className="trip-meta">
                <Text>{fmtRange(t.startDate, t.endDate)}</Text>
                {t.budget > 0 && <Text>预算 ¥{t.budget.toLocaleString()}</Text>}
              </View>
            </View>
          </View>
        )
      })}
    </View>
  )
}

/** 行程状态：计划中 / 进行中（含第几天）/ 已结束——仅展示用。 */
function tripStatus(start: string, end: string): { label: string; cls: string } {
  const today = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  const t = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
  if (t < start) return { label: '计划中', cls: 'plan' }
  if (t > end) return { label: '已结束', cls: 'done' }
  const day = Math.round((new Date(t + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1
  return { label: `进行中 · 第${day}天`, cls: '' }
}

function fmtRange(start: string, end: string): string {
  const short = (s: string) => (s || '').slice(5).replace('-', '.')
  return `${short(start)} – ${short(end)}`
}

/** 封面色提亮：hex 混白，做渐变亮端（数据里的 coverColor 是深色，直接渐变太闷）。 */
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
