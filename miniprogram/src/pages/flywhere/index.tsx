import { useState } from 'react'
import { View, Text, Input, Button, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { api, ApiFail } from '../../api/request'

declare const wx: any

interface FlightResult {
  id: string; city: string; code: string; domestic: boolean
  date: string; backDate: string; airline: string
  out: string; outArr: string; back: string; backArr: string; direct: boolean
  duration: number; totalPrice: number; passengers: number; rank: number
  weather?: { date: string; icon: string; tempMax: number | null; tempMin: number | null }[]
}

function plusDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function FlyWhere() {
  const [origin, setOrigin] = useState('北京')
  const [destination, setDestination] = useState('')
  const [depDate, setDepDate] = useState(plusDays(14))
  const [backDate, setBackDate] = useState(plusDays(17))
  const [round, setRound] = useState(true)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [results, setResults] = useState<FlightResult[] | null>(null)
  const [error, setError] = useState('')

  /** 定位识别出发地：getLocation 精确坐标 → 容器高德 regeo → 城市名回填 */
  const detectOrigin = () => {
    Taro.getLocation({
      type: 'gcj02',
      success: async (loc) => {
        try {
          Taro.showLoading({ title: '识别中…' })
          const out = await api.get<{ city: string; province: string }>(`/api/poi/regeo?lat=${loc.latitude}&lng=${loc.longitude}`)
          Taro.hideLoading()
          const city = String(out.city || '').replace(/市$/, '')
          if (!city) { Taro.showToast({ title: '未能识别城市，请手动填写', icon: 'none' }); return }
          setOrigin(city)
        } catch (e) {
          Taro.hideLoading()
          Taro.showToast({ title: '识别失败，请手动填写', icon: 'none' })
        }
      },
      fail: (err: any) => {
        const msg = String(err?.errMsg || '')
        Taro.showToast({ title: msg.includes('auth') ? '请授权位置权限' : '定位不可用，请手动填写', icon: 'none' })
      },
    })
  }

  const search = async () => {
    if (busy) return
    if (!origin.trim()) { Taro.showToast({ title: '请填写出发城市', icon: 'none' }); return }
    setBusy(true); setElapsed(0); setError(''); setResults(null)
    const timer = setInterval(() => setElapsed(s => s + 1), 1000)
    // callContainer 有 15s 硬超时，搜索要 10-40s → 提交拿 jobId 后轮询（最多 120s）
    try {
      const { jobId } = await api.post<{ jobId: string }>('/api/flywhere/search', {
        origin: origin.trim(), destination: destination.trim(), trip: round ? 'round' : 'oneway',
        depDate, backDate: round ? backDate : '', passengers: 1,
      })
      const deadline = Date.now() + 120000
      let final: { status: string; error?: string } | null = null
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500))
        const st = await api.get<{ status: string; error?: string }>(`/api/flywhere/search?jobId=${jobId}`)
        if (st.status !== 'running') { final = st; break }
      }
      if (!final) throw new Error('搜索超时，请重试')
      if (final.status === 'error') throw new Error(final.error || '搜索失败')
      const r = final as unknown as { results: FlightResult[] }
      setResults(r.results)
      if (!r.results.length) Taro.showToast({ title: '没有找到组合，试试调整日期', icon: 'none' })
    } catch (e) {
      setError(e instanceof ApiFail ? e.message : (e instanceof Error ? e.message : '搜索失败'))
    } finally {
      clearInterval(timer); setBusy(false)
    }
  }

  return (
    <View className="page">
      <View className="fw-eyebrow">PRICE-LED FLIGHT DISCOVERY</View>
      <View className="panel">
        <View className="field">
          <View className="row-between" style={{ marginBottom: '12rpx' }}>
            <Text className="label" style={{ marginBottom: 0 }}>出发城市</Text>
            <Text className="linkish" onClick={detectOrigin}>📍 定位识别出发地</Text>
          </View>
          <Input className="input" value={origin} onInput={e => setOrigin(e.detail.value)} placeholder="例如：北京，可点上方链接自动识别" maxlength={20} />
        </View>
        <View className="field">
          <Text className="label">目的地（留空 = 全国探索）</Text>
          <Input className="input" value={destination} onInput={e => setDestination(e.detail.value)} placeholder="留空探索全国低价" maxlength={20} />
        </View>
        <View className="row2">
          <View className="field" style={{ flex: 1 }}>
            <Text className="label">出发日期</Text>
            <Picker mode="date" value={depDate} onChange={e => setDepDate(e.detail.value)}>
              <View className="input picker">{depDate}</View>
            </Picker>
          </View>
          <View className="field" style={{ flex: 1 }}>
            <Text className="label">回程日期</Text>
            <Picker mode="date" value={backDate} onChange={e => setBackDate(e.detail.value)}>
              <View className="input picker">{backDate}</View>
            </Picker>
          </View>
        </View>
        <View className="row2" style={{ alignItems: 'center' }}>
          <View className="fw-seg">
            <Text className={`fw-seg-item ${round ? 'on' : ''}`} onClick={() => setRound(true)}>往返</Text>
            <Text className={`fw-seg-item ${!round ? 'on' : ''}`} onClick={() => setRound(false)}>单程</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Button className="fw-search" size="mini" loading={busy} onClick={search}>搜索</Button>
        </View>
      </View>

      {busy && <View className="panel"><Text className="muted">多轮真实航班查询中… 已等待 {elapsed} 秒（最长约 40 秒）</Text></View>}
      {!!error && <View className="error">{error}</View>}

      {results && results.length > 0 && (
        <View>
          <Text className="section">探索结果 · {results.length} 个目的地</Text>
          {results.map(r => (
            <View key={r.id} className="fw-result">
              <View className="row-between">
                <Text className="fw-city">{r.city}{r.domestic ? '' : '（国际/地区）'}</Text>
                <Text className="fw-price">¥{r.totalPrice.toLocaleString()}</Text>
              </View>
              <View className="muted" style={{ marginTop: '6rpx' }}>
                <Text>去 {r.out}–{r.outArr || '—'}{r.back && r.back !== '—' ? ` · 回 ${r.back}–${r.backArr || '—'}` : ''} · 飞 {r.duration} 小时 · {r.airline}</Text>
              </View>
              {!!r.weather && r.weather[0] && r.weather[0].tempMax != null && (
                <View className="muted"><Text>{r.weather[0].icon} {r.weather[0].date} {r.weather[0].tempMax}° / {r.weather[0].tempMin}°</Text></View>
              )}
            </View>
          ))}
          <View className="hint-center"><Text>最终价格与余票以飞猪下单页为准</Text></View>
        </View>
      )}
    </View>
  )
}
