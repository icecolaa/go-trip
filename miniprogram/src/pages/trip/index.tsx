import { useEffect, useRef, useState } from 'react'
import { View, Text, Button, Image } from '@tarojs/components'
import Taro, { usePullDownRefresh, useUnload } from '@tarojs/taro'
import { api, getToken, setToken, ApiFail } from '../../api/request'
import { connectWS, closeWS } from '../../api/ws'
import { useTheme } from '../../theme'
import type { TripBundle, TripDay, Activity } from '../../types'

const KIND_EMOJI: Record<string, string> = {
  sight: '🏞️', food: '🍜', hotel: '🏨', transport: '🚄',
  shopping: '🛍️', show: '🎭', other: '📌',
}

/** 板块顺序：行程｜交通住宿｜景点餐厅｜地图｜预算｜清单｜锦囊｜攻略｜日志｜成员｜动态 */
const SECTIONS = [
  { key: 'itinerary', label: '行程', ico: '🗓️' },
  { key: 'transport', label: '交通住宿', ico: '✈️' },
  { key: 'places', label: '景点餐厅', ico: '📍' },
  { key: 'map', label: '地图', ico: '🗺️' },
  { key: 'budget', label: '预算', ico: '💰' },
  { key: 'packing', label: '清单', ico: '🎒' },
  { key: 'handbook', label: '锦囊', ico: '📖' },
  { key: 'links', label: '攻略', ico: '🔗' },
  { key: 'journal', label: '日志', ico: '✍️' },
  { key: 'members', label: '成员', ico: '👥' },
  { key: 'activity', label: '动态', ico: '📣' },
] as const

let reloadTimer: ReturnType<typeof setTimeout> | null = null

export default function Trip() {
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [error, setError] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [openDay, setOpenDay] = useState<number | null>(null)
  const tripId = Number(Taro.getCurrentInstance().router?.params.id || 0)
  const reloading = useRef(false)
  const { resolved, toggle } = useTheme()

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

  // 默认展开当天；旅行未开始则展开第一天
  useEffect(() => {
    if (!bundle || openDay != null) return
    const today = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const t = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
    const hit = bundle.days.find(d => d.date === t)
    const first = [...bundle.days].sort((a, b) => a.dayNumber - b.dayNumber)[0]
    setOpenDay((hit || first)?.dayNumber ?? null)
  }, [bundle, openDay])

  const go = (key: string) => {
    setMoreOpen(false)
    if (key === 'back') { Taro.redirectTo({ url: '/pages/trips/index' }); return }
    const url = `/pages/${key}/index?tripId=${tripId}`
    Taro.navigateTo({ url }).catch(() => Taro.redirectTo({ url }))
  }

  const goAddActivity = (dayId: number) => Taro.navigateTo({ url: `/pages/activity/index?tripId=${tripId}&dayId=${dayId}` })
  const goEditActivity = (a: Activity) => Taro.navigateTo({ url: `/pages/activity/index?tripId=${tripId}&dayId=${a.dayId}&activityId=${a.id}` })

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
  const daysSorted = [...bundle.days].sort((a, b) => a.dayNumber - b.dayNumber)
  const progress = tripProgress(trip.startDate, trip.endDate)

  // 主要路线：目的地按分隔符拆；不足两个时用逐日城市
  const destParts = (trip.destination || '').split(/→|->|~|—|–|\/|、|，|,|\|/).map(s => s.trim()).filter(Boolean)
  let stops: string[] = destParts.length >= 2 ? destParts : (destParts[0] ? [destParts[0]] : [])
  if (stops.length < 2) {
    const seq: string[] = []
    for (const d of daysSorted) { const v = (d.place || '').trim(); if (v && seq[seq.length - 1] !== v) seq.push(v) }
    if (seq.length > stops.length) stops = seq
  }
  if (stops.length >= 2 && stops[0] === stops[stops.length - 1]) stops = stops.slice(0, -1)

  // 下一段关键交通
  const dayById = new Map(bundle.days.map(d => [d.id, d]))
  const transports = bundle.activities.filter(a => a.kind === 'transport').sort((x, y) => {
    const dx = dayById.get(x.dayId)?.date || '', dy = dayById.get(y.dayId)?.date || ''
    return dx === dy ? (x.time || '').localeCompare(y.time || '') : dx.localeCompare(dy)
  })
  const p = (n: number) => String(n).padStart(2, '0')
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const nextTransport = transports.find(a => (dayById.get(a.dayId)?.date || '') >= todayStr) || transports[0]

  return (
    <View className="page" data-theme={resolved}>
      {/* 旅程头图：标题/年份/地区/日期 + 出发倒计时 */}
      <View className="cover-hero">
        {!!trip.coverImage && <Image className="cover-bg" src={trip.coverImage} mode="aspectFill" />}
        <View className="cover-veil" />
        <View className="cover-body">
          <Text className="cover-eyebrow">{(trip.startDate || '').slice(0, 4)} 年 · {trip.destination || '目的地待定'}</Text>
          <Text className="cover-title">{trip.title}</Text>
          <Text className="cover-dates">{trip.startDate} ~ {trip.endDate}</Text>
          <Countdown startDate={trip.startDate} endDate={trip.endDate} />
          <View className="cover-foot">
            {trip.budget > 0 && <Text className="cover-chip">预算 ¥{trip.budget.toLocaleString()} · 已花 ¥{spent.toLocaleString()}</Text>}
            <Text className="cover-chip">进度 {progress}%</Text>
          </View>
        </View>
      </View>

      {/* 路线总览（竖版，一屏看全）+ 下一段关键交通 */}
      <View className="card route-card">
        <Text className="route-title">🧭 路线总览</Text>
        {stops.length === 0 ? (
          <Text className="muted route-hint">填写「目的地」或给每天设置城市后，这里会显示路线总览</Text>
        ) : (
          <View className="route-chain">
            {stops.map((s, i) => (
              <View key={`${s}-${i}`} className="route-node">
                <View className="route-dot"><Text className="route-dot-n">{i + 1}</Text></View>
                {i < stops.length - 1 && <View className="route-arrow">↓</View>}
                <Text className="route-name">{s}</Text>
              </View>
            ))}
          </View>
        )}
        <View className="route-next">
          <Text className="route-next-k">下一段关键交通</Text>
          <Text className="route-next-v">
            {nextTransport
              ? `${dayById.get(nextTransport.dayId)?.date || ''}${nextTransport.time ? ' ' + nextTransport.time : ''} · ${nextTransport.title}${nextTransport.place ? `（${nextTransport.place}）` : ''}`
              : '暂无交通安排'}
          </Text>
        </View>
      </View>

      {/* 板块导航：sticky 横滚 + 右上角「⋯」放不下的项 */}
      <View className="sec-nav">
        {SECTIONS.map(s => (
          <Button key={s.key} className="sec-chip" size="mini" onClick={() => go(s.key)}>
            {s.ico} {s.label}
          </Button>
        ))}
        <View className="more-wrap">
          <Button className="sec-chip" size="mini" onClick={() => setMoreOpen(o => !o)}>⋯ 更多</Button>
          {moreOpen && (
            <View className="more-menu">
              <Button className="more-item" size="mini" onClick={() => { setMoreOpen(false); Taro.navigateTo({ url: `/pages/trip-ai/index?tripId=${tripId}&maxDay=${bundle.days.length}` }) }}>AI 解析攻略</Button>
              <Button className="more-item" size="mini" onClick={() => { setMoreOpen(false); toggle() }}>{resolved === 'dark' ? '☀️ 浅色模式' : '🌙 深色模式'}</Button>
              <Button className="more-item" size="mini" onClick={() => go('back')}>← 返回全部旅程</Button>
            </View>
          )}
        </View>
      </View>

      {/* 逐日行程 */}
      {daysSorted.map(day => {
        const acts = bundle.activities.filter(a => a.dayId === day.id).sort((x, y) => (x.sort || 0) - (y.sort || 0))
        const timed = acts.filter(a => a.time).sort((x, y) => (x.time || '').localeCompare(y.time || ''))
        const rangeStart = timed[0]?.time || ''
        const rangeEnd = timed[timed.length - 1]?.endTime || ''
        const isOpen = openDay === day.dayNumber
        const cashOf = (id: number) => (bundle.cash || []).filter(c => c.refId === id)
        return (
          <View key={day.id} className="card day-block">
            <View className="day-head" onClick={() => setOpenDay(isOpen ? null : day.dayNumber)}>
              <View className="day-num"><Text className="day-n">D{day.dayNumber}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="day-title">{day.title || `第 ${day.dayNumber} 天`}</Text>
                <View className="day-sub"><Text>{day.date}{day.place ? ` · ${day.place}` : ''}</Text></View>
                {(rangeStart || rangeEnd) && <View className="day-sub"><Text>🕘 {rangeStart || '待定'}{rangeEnd ? ` – ${rangeEnd}` : ''}</Text></View>}
              </View>
              <Text className="day-toggle">{isOpen ? '▾' : '▸'}</Text>
            </View>
            {isOpen && (
              <View>
                {acts.length === 0 && <View className="day-empty"><Text>这一天还没有安排</Text></View>}
                {acts.map(a => {
                  const nextDay = /次日|\+1\s*天|第二天/.test(`${a.title} ${a.notes || ''}`)
                  const cash = cashOf(a.id)
                  return (
                    <View key={a.id} className="act" onClick={() => goEditActivity(a)}>
                      <Text className="act-time">
                        {a.time || '待定'}{a.endTime ? `–${a.endTime}` : ''}
                      </Text>
                      <Text className="act-emoji">{KIND_EMOJI[a.kind] || '📌'}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View className="act-title-row">
                          <Text className="act-title">{a.title}</Text>
                          {nextDay && <Text className="nextday-tag">次日抵达</Text>}
                        </View>
                        {!!a.status && <Text className={`status-badge st-${statusKey(a.status)}`}>{a.status}</Text>}
                        {cash.length > 0 && (
                          <View className="cash-inline">
                            {cash.map(c => (
                              <Text key={c.id} className="cash-inline-t">💴 {c.title}：¥{c.total}{c.perPerson ? `（¥${c.amount}×${c.people}人）` : ''}</Text>
                            ))}
                          </View>
                        )}
                        {!!a.place && <View className="act-place"><Text>📍 {a.place}</Text></View>}
                        {!!a.notes && <View className="act-notes"><Text>{a.notes}</Text></View>}
                      </View>
                      {a.cost > 0 && <Text className="act-cost">¥{a.cost}</Text>}
                    </View>
                  )
                })}
                <View className="day-add">
                  <Button className="chip" size="mini" onClick={() => goAddActivity(day.id)}>＋ 安排</Button>
                </View>
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

/** 状态徽标配色键（与网页版 StatusPicker 对应） */
function statusKey(s: string): string {
  if (s === '已确认' || s === '已出票' || s === '已预订') return 'ok'
  if (s === '仅限现金') return 'cash'
  if (s === '待确认') return 'warn'
  if (s === '未预订') return 'open'
  return 'mute'
}

/** 出发倒计时：天/时/分/秒四张独立小卡，每秒刷新；开始/结束不出现负数 */
function Countdown({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const start = new Date(startDate + 'T00:00:00').getTime()
  const end = new Date(endDate + 'T23:59:59').getTime()
  if (now >= start && now <= end) {
    return <View className="cd-state"><Text className="cd-state-t">🚀 旅程已经开始</Text></View>
  }
  if (now > end) {
    return <View className="cd-state"><Text className="cd-state-t">✅ 旅程已完成</Text></View>
  }
  const s = Math.max(0, Math.floor((start - now) / 1000))
  const cells: [string, string][] = [
    ['天', String(Math.floor(s / 86400))],
    ['时', String(Math.floor((s % 86400) / 3600)).padStart(2, '0')],
    ['分', String(Math.floor((s % 3600) / 60)).padStart(2, '0')],
    ['秒', String(s % 60).padStart(2, '0')],
  ]
  return (
    <View className="countdown">
      {cells.map(([label, val]) => (
        <View key={label} className="cd-cell">
          <Text className="cd-num">{val}</Text>
          <Text className="cd-label">{label}</Text>
        </View>
      ))}
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
