import { useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { api, ApiFail } from '../../api/request'
import { useTheme } from '../../theme'
import type { TripBundle } from '../../types'

/**
 * 交通住宿：只重组现有行程条目（kind=transport / kind=hotel）的呈现，
 * 不新增数据源、不改写正式行程。
 */

/** 从标题/备注提取航班号或车次 */
function extractCode(title: string, notes?: string): string {
  const m = `${title} ${notes || ''}`.match(/\b([A-Z]{2}\d{3,4}|[GDCTZK]\d{1,4})\b/)
  return m ? m[1] : ''
}
function isNextDay(title: string, notes?: string): boolean {
  return /次日|\+1\s*天|第二天/.test(`${title} ${notes || ''}`)
}

export default function TransportStay() {
  const router = Taro.getCurrentInstance().router
  const tripId = Number(router?.params.tripId || 0)
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [sub, setSub] = useState<'transport' | 'stay'>('transport')
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

  const dayById = new Map(bundle.days.map(d => [d.id, d]))
  const cashOf = (id: number) => (bundle.cash || []).filter(c => c.refId === id)
  const sorted = [...bundle.activities].sort((a, b) => {
    const da = dayById.get(a.dayId)?.date || '', db = dayById.get(b.dayId)?.date || ''
    return da === db ? (a.time || '99:99').localeCompare(b.time || '99:99') : da.localeCompare(db)
  })
  const transports = sorted.filter(a => a.kind === 'transport')
  const stays = sorted.filter(a => a.kind === 'hotel')
  /** 小程序内无法直接拉起高德 URI，复制地点名供用户到地图 App 粘贴导航 */
  const copyForNav = (name: string, city: string) => {
    Taro.setClipboardData({ data: `${name}${city ? ` ${city}` : ''}` })
    Taro.showToast({ title: '已复制地点，可到地图 App 粘贴', icon: 'none' })
  }

  return (
    <View className="page" data-theme={resolved}>
      <View className="btn-row">
        <Button className={sub === 'transport' ? 'chip on' : 'chip'} size="mini" onClick={() => setSub('transport')}>✈️ 交通（{transports.length}）</Button>
        <Button className={sub === 'stay' ? 'chip on' : 'chip'} size="mini" onClick={() => setSub('stay')}>🏨 住宿（{stays.length}）</Button>
      </View>

      {sub === 'transport' && (
        transports.length === 0
          ? <View className="card empty"><Text>还没有交通安排——在行程里添加类型为「交通」的条目，这里会自动汇总成票卡</Text></View>
          : transports.map(a => {
            const day = dayById.get(a.dayId)
            const code = extractCode(a.title, a.notes)
            const nextDay = isNextDay(a.title, a.notes)
            const cash = cashOf(a.id)
            return (
              <View className="ticket" key={a.id}>
                <View className="ticket-head">
                  <Text className="ticket-kind">交通</Text>
                  <Text className="ticket-date">{day ? `${day.date}` : ''}</Text>
                  {!!code && <Text className="ticket-kind">{code}</Text>}
                  {!!a.status && <Text className={`status-badge st-${statusKey(a.status)}`}>{a.status}</Text>}
                  {nextDay && <Text className="nextday-tag">次日抵达</Text>}
                </View>
                <View className="ticket-route">
                  <View className="ticket-node">
                    <Text className="ticket-time">{a.time || '时间待定'}</Text>
                    <Text className="ticket-place">{a.place || '出发地待定'}</Text>
                  </View>
                  <Text className="ticket-arrow">→</Text>
                  <View className="ticket-node">
                    <Text className="ticket-time">{a.endTime || '抵达待定'}</Text>
                    <Text className="ticket-place">{a.title}</Text>
                  </View>
                </View>
                {!!a.notes && <View className="ticket-notes"><Text>{a.notes}</Text></View>}
                {a.cost > 0 && <View className="ticket-meta"><Text>预估 ¥{a.cost}</Text></View>}
                {cash.length > 0 && (
                  <View className="ticket-meta">
                    {cash.map(c => (
                      <Text key={c.id} className="cash-inline-t">💴 {c.title}：¥{c.total}{c.perPerson ? `（¥${c.amount}×${c.people}人）` : ''}</Text>
                    ))}
                  </View>
                )}
                {(a.lat != null && a.lng != null) && (
                  <View className="place-item ops">
                    <Button className="chip" size="mini" onClick={() => copyForNav(a.place || a.title, day?.place || bundle.trip.destination || '')}>导航</Button>
                  </View>
                )}
              </View>
            )
          })
      )}

      {sub === 'stay' && (
        stays.length === 0
          ? <View className="card empty"><Text>还没有住宿安排——在行程里添加类型为「住宿」的条目，这里会按入住日期汇总</Text></View>
          : stays.map(a => {
            const day = dayById.get(a.dayId)
            const cash = cashOf(a.id)
            return (
              <View className="ticket" key={a.id}>
                <View className="ticket-head">
                  <Text className="ticket-kind">住宿</Text>
                  <Text className="ticket-date">{day ? `入住 ${day.date}` : '入住日期待定'}</Text>
                  {!!a.status && <Text className={`status-badge st-${statusKey(a.status)}`}>{a.status}</Text>}
                </View>
                <Text className="stay-name">{a.title}</Text>
                <View className="stay-rows">
                  <Text><Text className="k">城市</Text>{day?.place || bundle.trip.destination || '待定'}</Text>
                  <Text><Text className="k">时间</Text>{a.time || '待定'}{a.endTime ? ` ~ ${a.endTime}` : '（退房时间待定）'}</Text>
                  <Text><Text className="k">地址</Text>{a.place || '待补充'}</Text>
                  <Text><Text className="k">付款提醒</Text>{a.cost > 0 ? `预估 ¥${a.cost}，到店/线上确认付款方式` : '待确认付款方式'}</Text>
                </View>
                {!!a.notes && <View className="ticket-notes"><Text>{a.notes}</Text></View>}
                {cash.length > 0 && (
                  <View className="ticket-meta">
                    {cash.map(c => <Text key={c.id} className="cash-inline-t">💴 {c.title}：¥{c.total}</Text>)}
                  </View>
                )}
                {(a.lat != null && a.lng != null) && (
                  <View className="place-item ops">
                    <Button className="chip" size="mini" onClick={() => copyForNav(a.place || a.title, day?.place || bundle.trip.destination || '')}>导航</Button>
                  </View>
                )}
              </View>
            )
          })
      )}
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
