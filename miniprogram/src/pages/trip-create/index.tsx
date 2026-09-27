import { useState } from 'react'
import { View, Input, Button, Text, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { createTrip, ensureProfile } from '../../rdb/trip'

const EMOJIS = ['🧭', '⛰️', '🏝️', '🏖️', '🏮', '🏯', '🎡', '🚄', '✈️', '🚗', '⛺', '🏂', '🍜', '🥾']
const COLORS = ['#2f6e4f', '#b5543b', '#3b6ea5', '#c9a04e', '#7d5ba6', '#a0433b']

function plusDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function TripCreate() {
  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(plusDays(7))
  const [endDate, setEndDate] = useState(plusDays(10))
  const [budget, setBudget] = useState('')
  const [emoji, setEmoji] = useState('🧭')
  const [color, setColor] = useState(COLORS[0])
  const [busy, setBusy] = useState(false)

  /** 地图选目的地：从地点名/地址提取城市关键词回填 */
  const pickDestination = () => {
    Taro.chooseLocation({
      success: (res) => {
        const src = res.name || res.address || ''
        // 去掉常见 POI 后缀与省/区前缀，保留城市核心（如「伊春市伊春区XX酒店」→「伊春」）
        const m = src.match(/([^省市区县]+市)/)
        setDestination(m ? m[1].replace(/市$/, '') : src.slice(0, 20))
      },
      fail: (err: any) => {
        const msg = String(err?.errMsg || '')
        if (msg.includes('cancel')) return
        Taro.showToast({ title: '选点不可用（需在后台开通并配置隐私指引）', icon: 'none' })
      },
    })
  }

  const create = async () => {
    if (busy) return
    if (!title.trim()) { Taro.showToast({ title: '给旅程起个名字吧', icon: 'none' }); return }
    if (endDate < startDate) { Taro.showToast({ title: '结束日期不能早于开始日期', icon: 'none' }); return }
    setBusy(true)
    try {
      const me = await ensureProfile()
      const id = await createTrip({
        title: title.trim(),
        destination: destination.trim(),
        description: '',
        startDate,
        endDate,
        budget: Number(budget) || 0,
        coverEmoji: emoji,
        coverColor: color,
      }, me.nickname)
      Taro.showToast({ title: '旅程已创建', icon: 'success' })
      Taro.redirectTo({ url: `/pages/trip/index?id=${id}` })
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '创建失败', icon: 'none' })
      setBusy(false)
    }
  }

  return (
    <View className="page">
      <View className="card">
        <View className="field">
          <Text className="label">旅程名称</Text>
          <Input className="input" value={title} onInput={e => setTitle(e.detail.value)} placeholder="例如：云南大理丽江 6 日慢游" maxlength={60} />
        </View>
        <View className="field">
          <View className="row-between" style={{ marginBottom: '12rpx' }}>
            <Text className="label" style={{ marginBottom: 0 }}>目的地</Text>
            <Text className="linkish" onClick={pickDestination}>📍 地图选目的地</Text>
          </View>
          <Input className="input" value={destination} onInput={e => setDestination(e.detail.value)} placeholder="城市或地区，例如：大理 → 丽江" maxlength={60} />
        </View>
        <View className="row2">
          <View className="field" style={{ flex: 1 }}>
            <Text className="label">出发日期</Text>
            <Picker mode="date" value={startDate} onChange={(e: any) => { setStartDate(e.detail.value); if (e.detail.value > endDate) setEndDate(e.detail.value) }}>
              <View className="input picker">{startDate}</View>
            </Picker>
          </View>
          <View className="field" style={{ flex: 1 }}>
            <Text className="label">结束日期</Text>
            <Picker mode="date" value={endDate} start={startDate} onChange={(e: any) => setEndDate(e.detail.value)}>
              <View className="input picker">{endDate}</View>
            </Picker>
          </View>
        </View>
        <View className="field" style={{ marginBottom: 0 }}>
          <Text className="label">预算（元，选填）</Text>
          <Input className="input" type="number" value={budget} onInput={e => setBudget(e.detail.value)} placeholder="选填" />
        </View>
      </View>

      <View className="card">
        <View className="field">
          <Text className="label">封面图标</Text>
          <View className="emoji-grid">
            {EMOJIS.map(e => (
              <View key={e} className={`emoji-item ${emoji === e ? 'on' : ''}`} onClick={() => setEmoji(e)}>
                <Text>{e}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className="field" style={{ marginBottom: 0 }}>
          <Text className="label">封面颜色</Text>
          <View className="row">
            {COLORS.map(c => (
              <View key={c} className="color-dot" style={{ background: c, border: color === c ? '6rpx solid #182A3D' : '2rpx solid #E6EEF6' }} onClick={() => setColor(c)} />
            ))}
          </View>
        </View>
      </View>

      <Button className="submit" loading={busy} onClick={create}>创建旅程</Button>
      <View className="hint"><Text>创建后可在行程页逐天添加安排，粘贴攻略文本由 AI 一键解析</Text></View>
    </View>
  )
}
