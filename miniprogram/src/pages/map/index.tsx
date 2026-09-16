import { useState } from 'react'
import { View, Text, Map, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { api, ApiFail } from '../../api/request'
import type { TripBundle, Activity } from '../../types'

const KIND_EMOJI: Record<string, string> = {
  sight: '🏞️', food: '🍜', hotel: '🏨', transport: '🚄',
  shopping: '🛍️', show: '🎭', other: '📌',
}

export default function TripMap() {
  const router = Taro.getCurrentInstance().router
  const tripId = Number(router?.params.tripId || 0)
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setBundle(await api.get<TripBundle>(`/api/trips/${tripId}`))
    } catch (e) {
      setError(e instanceof ApiFail ? e.message : '加载失败')
    }
  }
  if (!bundle) {
    load()
    return <View className="page"><Text className="muted">加载中…</Text></View>
  }
  if (error) return <View className="page"><View className="error">{error}</View></View>

  const located: (Activity & { dayNumber: number })[] = bundle.activities
    .filter(a => a.lat != null && a.lng != null)
    .map(a => ({ ...a, dayNumber: bundle.days.find(d => d.id === a.dayId)?.dayNumber || 0 }))

  const markers = located.map(a => ({
    id: a.id,
    latitude: a.lat as number,
    longitude: a.lng as number,
    iconPath: '/assets/marker.png',
    width: 30,
    height: 30,
    callout: {
      content: `${KIND_EMOJI[a.kind] || '📌'} ${a.title}${a.cost > 0 ? `\n¥${a.cost}` : ''}`,
      color: '#1e2421',
      bgColor: '#fffdf8',
      display: 'BYCLICK' as const,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#dcded8',
      padding: 8,
      fontSize: 13,
      anchorX: 0,
      anchorY: 0,
      textAlign: 'center' as const,
    },
  }))
  const center = markers.length
    ? {
        latitude: markers.reduce((s, m) => s + m.latitude, 0) / markers.length,
        longitude: markers.reduce((s, m) => s + m.longitude, 0) / markers.length,
      }
    : { latitude: 39.9, longitude: 116.4 }

  return (
    <View className="page">
      <Map
        className="map"
        latitude={center.latitude}
        longitude={center.longitude}
        markers={markers}
        showLocation
        enableScroll={false}
        onError={() => {}}
      />
      {markers.length === 0 && (
        <View className="panel" style={{ marginTop: '20rpx' }}>
          <Text className="muted">活动还没有坐标：网页版行程页添加活动后会自动地理编码，同步后即可在地图展示。</Text>
        </View>
      )}
      <View className="panel">
        <Text className="label">有坐标的活动 · {located.length} / {bundle.activities.length}</Text>
        {located.slice(0, 20).map(a => (
          <View key={a.id} className="row-between">
            <Text>{KIND_EMOJI[a.kind] || '📌'} {a.title}</Text>
            <Text className="muted">D{a.dayNumber}{a.cost > 0 ? ` · ¥${a.cost}` : ''}</Text>
          </View>
        ))}
      </View>
      <View className="btn-row">
        <Button className="ghost" size="mini" onClick={() => Taro.redirectTo({ url: `/pages/trip/index?id=${tripId}` })}>← 返回行程</Button>
      </View>
    </View>
  )
}
