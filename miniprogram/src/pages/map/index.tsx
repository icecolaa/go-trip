import { useState } from 'react'
import { View, Text, Map, Button } from '@tarojs/components'
import Taro, { useUnload } from '@tarojs/taro'
import { loadTripBundle } from '../../rdb/trip'
import type { TripBundle, Activity } from '../../types'

const KIND_EMOJI: Record<string, string> = {
  sight: '🏞️', food: '🍜', hotel: '🏨', transport: '🚄',
  shopping: '🛍️', show: '🎭', other: '📌',
}

export default function TripMap() {
  const router = Taro.getCurrentInstance().router
  const tripId = String(router?.params.tripId || '')
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [error, setError] = useState('')
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [tracking, setTracking] = useState(false)

  /** 持续追踪：startLocationUpdate + onLocationChange 让地图中心实时跟随（行程中导航用） */
  const onLoc = (res: { latitude: number; longitude: number }) => setCenter({ latitude: res.latitude, longitude: res.longitude })
  const toggleTracking = () => {
    if (tracking) {
      Taro.offLocationChange(onLoc as never)
      Taro.stopLocationUpdate()
      setTracking(false)
      return
    }
    Taro.startLocationUpdate({
      success: () => {
        Taro.onLocationChange(onLoc as never)
        setTracking(true)
        Taro.showToast({ title: '持续追踪已开启', icon: 'success' })
      },
      fail: (err: any) => {
        const msg = String(err?.errMsg || '')
        Taro.showToast({ title: msg.includes('auth') ? '请授权位置权限' : '持续定位需在后台申请开通该接口', icon: 'none' })
      },
    })
  }

  // 页面卸载时停止持续定位，避免后台耗电
  useUnload(() => {
    try {
      Taro.offLocationChange(onLoc as never)
      Taro.stopLocationUpdate()
    } catch (e) { /* ignore */ }
  })

  const locateMe = () => {
    if (locating) return
    setLocating(true)
    Taro.getLocation({ type: 'gcj02' })
      .then((loc) => setCenter({ latitude: loc.latitude, longitude: loc.longitude }))
      .catch(() => Taro.showToast({ title: '未授权定位或不可用', icon: 'none' }))
      .finally(() => setLocating(false))
  }

  const openInMap = (a: Activity) => {
    Taro.openLocation({
      latitude: a.lat as number,
      longitude: a.lng as number,
      name: a.title,
      address: a.place || '',
      scale: 16,
    })
  }

  const searchXhs = () => {
    const dest = bundle?.trip?.destination || bundle?.trip?.title || ''
    Taro.setClipboardData({
      data: `${dest} 旅游攻略`,
      success: () => Taro.showToast({ title: '已复制搜索词，去小红书粘贴搜索', icon: 'none' }),
    })
  }

  const load = async () => {
    try {
      setBundle(await loadTripBundle(tripId))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
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

  const markers = located.map((a, i) => ({
    id: i,
    latitude: a.lat as number,
    longitude: a.lng as number,
    iconPath: '/assets/marker.png',
    width: 30,
    height: 30,
    callout: {
      content: `${KIND_EMOJI[a.kind] || '📌'} ${a.title}${a.cost > 0 ? `\n¥${a.cost}` : ''}`,
      color: '#182A3D',
      bgColor: '#ffffff',
      display: 'BYCLICK' as const,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#E6EEF6',
      padding: 8,
      fontSize: 13,
      anchorX: 0,
      anchorY: 0,
      textAlign: 'center' as const,
    },
  }))
  const defaultCenter = markers.length
    ? {
        latitude: markers.reduce((s, m) => s + m.latitude, 0) / markers.length,
        longitude: markers.reduce((s, m) => s + m.longitude, 0) / markers.length,
      }
    : { latitude: 39.9, longitude: 116.4 }
  const mapCenter = center || defaultCenter

  return (
    <View className="page">
      <Map
        className="map"
        latitude={mapCenter.latitude}
        longitude={mapCenter.longitude}
        markers={markers}
        showLocation
        enableScroll={false}
        onError={() => {}}
      />
      <View className="map-tools">
        <Button className={`chip ${tracking ? 'on' : ''}`} size="mini" onClick={toggleTracking}>📡 持续追踪{tracking ? '中·点击关闭' : ''}</Button>
        <Button className="chip" size="mini" loading={locating} onClick={locateMe}>📍 定位到当前位置</Button>
        <Button className="chip" size="mini" onClick={searchXhs}>📕 小红书搜攻略</Button>
      </View>
      {markers.length === 0 && (
        <View className="panel" style={{ marginTop: '20rpx' }}>
          <Text className="muted">活动还没有坐标：网页版行程页添加活动后会自动地理编码，同步后即可在地图展示。</Text>
        </View>
      )}
      <View className="panel">
        <Text className="label">有坐标的活动 · {located.length} / {bundle.activities.length}</Text>
        {located.slice(0, 20).map(a => (
          <View key={a.id} className="row-between" onClick={() => openInMap(a)}>
            <Text>{KIND_EMOJI[a.kind] || '📌'} {a.title}</Text>
            <Text className="muted">导航 › D{a.dayNumber}{a.cost > 0 ? ` · ¥${a.cost}` : ''}</Text>
          </View>
        ))}
        {located.length > 0 && <View className="hint-center"><Text>点击地点打开地图导航（可切换高德等）</Text></View>}
      </View>
      <View className="btn-row">
        <Button className="ghost" size="mini" onClick={() => Taro.redirectTo({ url: `/pages/trip/index?id=${tripId}` })}>← 返回行程</Button>
      </View>
    </View>
  )
}
