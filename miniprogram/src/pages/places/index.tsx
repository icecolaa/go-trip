import { useState } from 'react'
import { View, Text, Button, Input, Textarea } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { api, ApiFail } from '../../api/request'
import { useTheme } from '../../theme'
import type { TripBundle, TripPlace, TripPlaceKind } from '../../types'

/**
 * 景点餐厅：候选景点与可选餐厅各自折叠、默认收起、互不混排。
 * 候选条目只存在于 trip_places，绝不写入 days/activities（不擅自改变正式行程）。
 */

const KIND_LABEL: Record<TripPlaceKind, string> = {
  attraction: '景点', restaurant: '餐厅', hotel: '住宿', transport: '交通',
  station: '车站', airport: '机场', meeting: '集合点', other: '其他',
}
const NEW_KINDS: TripPlaceKind[] = ['attraction', 'restaurant', 'meeting', 'station', 'airport', 'other']

export default function Places() {
  const router = Taro.getCurrentInstance().router
  const tripId = Number(router?.params.tripId || 0)
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [adding, setAdding] = useState(false)
  const { resolved } = useTheme()

  const load = async () => {
    try {
      setBundle(await api.get<TripBundle>(`/api/trips/${tripId}`))
    } catch (e) {
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '加载失败', icon: 'none' })
    }
  }
  usePullDownRefresh(() => { load().finally(() => Taro.stopPullDownRefresh()) })
  if (!bundle) { load(); return <View className="page"><Text className="muted">加载中…</Text></View> }

  const places = bundle.places || []
  const attractions = places.filter(p => p.kind === 'attraction')
  const restaurants = places.filter(p => p.kind === 'restaurant')
  const others = places.filter(p => p.kind !== 'attraction' && p.kind !== 'restaurant')

  /** 餐厅按城市分组（保持出现顺序） */
  const cityGroups: [string, TripPlace[]][] = []
  for (const p of restaurants) {
    const city = p.city || '未分城市'
    const hit = cityGroups.find(([c]) => c === city)
    if (hit) hit[1].push(p); else cityGroups.push([city, [p]])
  }

  const copyForNav = (name: string, city: string) => {
    Taro.setClipboardData({ data: `${name}${city ? ` ${city}` : ''}` })
    Taro.showToast({ title: '已复制地点，可到地图 App 粘贴', icon: 'none' })
  }

  const renderItem = (p: TripPlace) => (
    <View className="place-item" key={p.id}>
      <View className="row-between">
        <Text className="nm">{p.name}</Text>
        {!!p.status && <Text className={`status-badge st-${statusKey(p.status)}`}>{p.status}</Text>}
      </View>
      {!!(p.city || p.address) && <View className="sub"><Text>{[p.city, p.address].filter(Boolean).join(' · ') || '地址待补充'}</Text></View>}
      {!!p.dishes && <View className="note"><Text>推荐菜：{p.dishes}</Text></View>}
      {!!p.note && <View className="note"><Text>{p.note}</Text></View>}
      <View className="ops">
        <Button className="chip" size="mini" onClick={() => copyForNav(p.name, p.city)}>复制地点</Button>
      </View>
    </View>
  )

  return (
    <View className="page" data-theme={resolved}>
      <View className="card">
        <Text className="muted" style={{ fontSize: '23rpx', lineHeight: 1.6 }}>
          候选与可选地点不会自动加入正式行程，需要时再从「行程」里手动添加。
        </Text>
      </View>

      <View className="place-group">
        <View className="place-group-summary"><Text>🏞️ 候选景点</Text><Text className="cnt">{attractions.length}</Text></View>
        <View className="place-list">
          {attractions.length === 0 && <View className="card empty"><Text>还没有候选景点</Text></View>}
          {attractions.map(renderItem)}
        </View>
      </View>

      <View className="place-group">
        <View className="place-group-summary"><Text>🍜 可选餐厅</Text><Text className="cnt">{restaurants.length}</Text></View>
        <View className="place-list">
          {restaurants.length === 0 && <View className="card empty"><Text>还没有可选餐厅</Text></View>}
          {cityGroups.map(([city, list]) => (
            <View key={city}>
              <Text className="place-city-name">{city}</Text>
              {list.map(renderItem)}
            </View>
          ))}
        </View>
      </View>

      {others.length > 0 && (
        <View className="place-group">
          <View className="place-group-summary"><Text>📍 其他地点</Text><Text className="cnt">{others.length}</Text></View>
          <View className="place-list">{others.map(renderItem)}</View>
        </View>
      )}

      <View className="btn-row" style={{ marginTop: '16rpx' }}>
        <Button className="submit" size="mini" onClick={() => setAdding(true)}>＋ 添加地点</Button>
      </View>

      {adding && <AddPlace tripId={tripId} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await load() }} />}
    </View>
  )
}

function statusKey(s: string): string {
  if (s === '已确认' || s === '已出票' || s === '已预订') return 'ok'
  if (s === '仅限现金') return 'cash'
  if (s === '待确认') return 'warn'
  if (s === '未预订') return 'open'
  return 'mute'
}

function AddPlace({ tripId, onClose, onSaved }: { tripId: number; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [kind, setKind] = useState<TripPlaceKind>('attraction')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [dishes, setDishes] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('待确认')
  const [candidate, setCandidate] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) { Taro.showToast({ title: '请填写地点名称', icon: 'none' }); return }
    setBusy(true)
    try {
      await api.post(`/api/trips/${tripId}/places`, { kind, name, city, address, dishes, note, status, candidate })
      Taro.showToast({ title: '已添加', icon: 'success' })
      await onSaved()
    } catch (e) {
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '保存失败', icon: 'none' })
      setBusy(false)
    }
  }

  return (
    <View className="modal-mask">
      <View className="modal">
        <Text className="modal-title">添加地点</Text>
        <View className="chips-row">
          {NEW_KINDS.map(k => (
            <Button key={k} className={`fw-chip ${kind === k ? 'on' : ''}`} size="mini" onClick={() => setKind(k)}>{KIND_LABEL[k]}</Button>
          ))}
        </View>
        <View className="field"><Text className="label">名称</Text><Input className="input" value={name} onInput={e => setName(e.detail.value)} placeholder="如：洱海生态廊道" /></View>
        <View className="field"><Text className="label">城市</Text><Input className="input" value={city} onInput={e => setCity(e.detail.value)} /></View>
        <View className="field"><Text className="label">地址</Text><Input className="input" value={address} onInput={e => setAddress(e.detail.value)} /></View>
        {kind === 'restaurant' && (
          <View className="field"><Text className="label">推荐菜（顿号分隔）</Text><Input className="input" value={dishes} onInput={e => setDishes(e.detail.value)} /></View>
        )}
        <View className="field"><Text className="label">备注</Text><Textarea className="input" value={note} onInput={e => setNote(e.detail.value)} /></View>
        <View className="field">
          <Text className="label">确认状态</Text>
          <View className="chips-row">
            {['已确认', '已预订', '待确认', '未预订', '暂定'].map(s => (
              <Button key={s} className={`fw-chip ${status === s ? 'on' : ''}`} size="mini" onClick={() => setStatus(s)}>{s}</Button>
            ))}
          </View>
        </View>
        <View className="row-between">
          <Text>作为候选/可选（不加入正式行程）</Text>
          <Button className="chip" size="mini" onClick={() => setCandidate(c => !c)}>{candidate ? '✓ 是' : '否'}</Button>
        </View>
        <View className="modal-ops">
          <Button className="ghost" size="mini" onClick={onClose}>取消</Button>
          <Button className="submit" size="mini" disabled={busy} onClick={submit}>添加</Button>
        </View>
      </View>
    </View>
  )
}
