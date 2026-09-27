import { useState } from 'react'
import { View, Text, Image, OfficialAccount } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh, useShareAppMessage } from '@tarojs/taro'
import { syncTabBar } from '../../tab-sync'
import { ensureProfile, listTrips, updateProfile } from '../../rdb/trip'
import type { Profile, TripCardInfo } from '../../types'

const APP_VERSION = 'v1.4.4'

/** 我的 Tab：资料卡 + 旅程统计 + 通用入口（飞哪儿在此，无自托管板块）。 */
export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [trips, setTrips] = useState<TripCardInfo[]>([])
  const [error, setError] = useState('')

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
    syncTabBar(2)
    load()
  })

  useShareAppMessage(() => ({ title: '出发吧 GoTrip · 和同伴一起，把旅程安排明白', path: '/pages/trips/index' }))

  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })

  const rename = () => {
    if (!profile) return
    Taro.showModal({
      title: '修改昵称',
      ...({ editable: true, placeholderText: profile.nickname } as any),
      success: async (res: any) => {
        const next = String(res.content || '').trim()
        if (!res.confirm || !next) return
        if (next.length > 20) { Taro.showToast({ title: '昵称最多 20 字', icon: 'none' }); return }
        try {
          await updateProfile(profile.id, { nickname: next })
          Taro.showToast({ title: '已更新', icon: 'success' })
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '修改失败', icon: 'none' })
        }
      },
    })
  }

  const goTrips = () => Taro.switchTab({ url: '/pages/trips/index' })
  const goFlywhere = () => Taro.navigateTo({ url: '/pages/flywhere/index' })
  const goAbout = () => {
    Taro.showModal({
      title: '出发吧 GoTrip',
      content: '和同伴一起，把旅程安排明白。\n行程规划 · AA 记账 · 打包清单 · 旅行锦囊 · 低价机票。\n当前版本 ' + APP_VERSION,
      showCancel: false,
      confirmText: '知道啦',
    })
  }

  // 统计：行程数 / 足迹城市（去重非空目的地） / 打卡地点（活动数） / 一起记的账（总支出）
  const tripCount = trips.length
  const cities = new Set(trips.map(t => (t.destination || '').trim()).filter(Boolean)).size
  const spots = trips.reduce((s, t) => s + (t.activityCount || 0), 0)
  const spent = trips.reduce((s, t) => s + (t.totalSpent || 0), 0)
  const fmtYuan = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : String(n))

  const ingCount = trips.filter(t => t.startDate <= todayStr() && t.endDate >= todayStr()).length

  return (
    <View className="page tab-page">
      {error && <View className="error">{error}</View>}

      <View className="card profile-card">
        <View className="pc-avatar">{profile ? profile.nickname.slice(0, 1) : '旅'}</View>
        <View className="pc-main">
          <View className="pc-name-row">
            <Text className="pc-name">{profile ? profile.nickname : '旅行者'}</Text>
            <Text className="pc-level">旅行家 Lv.{Math.min(9, tripCount + 1)}</Text>
          </View>
          <View className="pc-id">微信用户 · GoTrip ID {profile ? profile.id.slice(-6).toUpperCase() : '——'}</View>
        </View>
        <View className="pc-edit" onClick={rename}>✏️</View>
      </View>

      <View className="stat-grid">
        <View className="stat">
          <Text className="stat-num">{tripCount}</Text>
          <Text className="stat-label">共同旅行</Text>
        </View>
        <View className="stat">
          <Text className="stat-num">{cities}</Text>
          <Text className="stat-label">足迹城市</Text>
        </View>
        <View className="stat">
          <Text className="stat-num">{spots}</Text>
          <Text className="stat-label">打卡地点</Text>
        </View>
        <View className="stat">
          <Text className="stat-num"><Text className="yen">¥</Text>{fmtYuan(spent)}</Text>
          <Text className="stat-label">一起记的账</Text>
        </View>
      </View>

      <View className="menu-cell" onClick={goTrips}>
        <View className="mc-ic"><Image src="/assets/cell-route.png" mode="aspectFit" /></View>
        <View className="mc-main">
          <View className="mc-title">我的行程</View>
          <View className="mc-sub">
            {ingCount > 0 ? `${ingCount} 个进行中 · ` : ''}{tripCount} 场旅程{spent > 0 ? ` · 已记 ¥${fmtYuan(spent)}` : ''}
          </View>
        </View>
        <Text className="mc-arrow">›</Text>
      </View>

      <View className="sec-label">探索</View>
      <View className="menu-cell" onClick={goFlywhere}>
        <View className="mc-ic"><Image src="/assets/cell-plane.png" mode="aspectFit" /></View>
        <View className="mc-main">
          <View className="mc-title">飞哪儿</View>
          <View className="mc-sub">按票价探索目的地 · 低价机票雷达</View>
        </View>
        <Text className="mc-arrow">›</Text>
      </View>

      <View className="sec-label">通用</View>
      <View className="menu-cell" onClick={rename}>
        <View className="mc-ic" style={{ background: 'var(--yel-100)' }}>✏️</View>
        <View className="mc-main">
          <View className="mc-title">编辑资料</View>
          <View className="mc-sub">修改对外展示的昵称</View>
        </View>
        <Text className="mc-arrow">›</Text>
      </View>
      <View className="menu-cell" onClick={goAbout}>
        <View className="mc-ic"><Image src="/assets/cell-gear.png" mode="aspectFit" /></View>
        <View className="mc-main">
          <View className="mc-title">关于出发吧</View>
          <View className="mc-sub">版本与功能说明</View>
        </View>
        <Text className="mc-arrow">›</Text>
      </View>

      {/* 绑定同主体公众号后，特定场景进入自动显示；未绑定时不渲染，无副作用 */}
      <OfficialAccount />
      <View className="foot-brand">
        <Image className="fb-logo" src="/assets/logo.png" mode="aspectFill" />
        <Text className="fb-text">出发吧 GoTrip · {APP_VERSION}</Text>
      </View>
    </View>
  )
}

function todayStr(): string {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
