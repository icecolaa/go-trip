import { useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { api, getToken, setToken, ApiFail } from '../../api/request'
import type { TripCardInfo } from '../../types'

/** 旅程列表：验证「域名 / 证书 / Bearer 会话 / shared 类型」全链路的脚手架页面 */
export default function Trips() {
  const [trips, setTrips] = useState<TripCardInfo[]>([])
  const [error, setError] = useState('')

  const load = async () => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    try {
      setError('')
      const list = await api.get<TripCardInfo[]>('/api/trips')
      setTrips(list)
    } catch (e) {
      if (e instanceof ApiFail && e.status === 401) {
        setToken('')
        Taro.redirectTo({ url: '/pages/login/index' })
        return
      }
      setError(e instanceof ApiFail ? e.message : '加载失败，请下拉重试')
    }
  }

  useDidShow(() => {
    load()
  })

  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })

  const logout = () => {
    setToken('')
    Taro.redirectTo({ url: '/pages/login/index' })
  }

  const open = (id: number) => {
    Taro.showToast({ title: '行程详情页脚手架待接入', icon: 'none' })
    void id
  }

  return (
    <View className="page">
      <View className="head">
        <Text className="title">我的旅程</Text>
        <Button className="ghost" size="mini" onClick={logout}>退出</Button>
      </View>

      {error && <View className="error">{error}</View>}

      {!error && trips.length === 0 && (
        <View className="empty">
          <Text>还没有旅程，去网页版创建一段吧</Text>
        </View>
      )}

      {trips.map(t => (
        <View key={t.id} className="card" onClick={() => open(t.id)}>
          <View className="card-head">
            <Text className="emoji">{t.coverEmoji}</Text>
            <Text className="title">{t.title}</Text>
          </View>
          <View className="meta">
            <Text>📍 {t.destination || '目的地待定'} · {t.activityCount} 项安排</Text>
          </View>
          <View className="meta">
            <Text className="date">{t.startDate} ~ {t.endDate}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
