import { useState } from 'react'
import { View, Text, Button, Input, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { api, ApiFail } from '../../api/request'
import type { ParsedGuide } from '../../types'

interface GuideDay { dayNumber: number; date?: string; title?: string; activities?: { time?: string; title?: string }[] }

export default function TripAI() {
  const router = Taro.getCurrentInstance().router
  const tripId = Number(router?.params.tripId || 0)
  const maxDay = Number(router?.params.maxDay || 0)
  const [text, setText] = useState('')
  const [guide, setGuide] = useState<ParsedGuide | null>(null)
  const [busy, setBusy] = useState(false)

  const dayNums: number[] = guide ? [...new Set<number>(guide.days.map(d => Math.round(Number(d.dayNumber)) || 0))].sort((a, b) => a - b) : []
  const targetable = dayNums.length > 0 && maxDay > 0 && dayNums.every(n => n >= 1 && n <= maxDay)

  const parse = async () => {
    if (busy) return
    if (!text.trim()) { Taro.showToast({ title: '请粘贴攻略文本', icon: 'none' }); return }
    setBusy(true)
    try {
      Taro.showLoading({ title: 'AI 解析中，约 20~60 秒…' })
      const g = await api.post<ParsedGuide>(`/api/trips/${tripId}/ai/parse-guide`, { text: text.slice(0, 6000) })
      setGuide(g)
      Taro.hideLoading()
    } catch (e) {
      Taro.hideLoading()
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '解析失败', icon: 'none' })
      setBusy(false)
    }
  }

  const apply = async (targeted: boolean) => {
    if (!guide || busy) return
    setBusy(true)
    try {
      Taro.showLoading({ title: '写入行程中…' })
      const body = targeted ? { guide, targeted: true } : { guide, replaceDays: true }
      const r = await api.post<{ replacedDays?: number[] }>(`/api/trips/${tripId}/ai/apply`, body)
      Taro.hideLoading()
      Taro.showToast({ title: targeted && r.replacedDays?.length ? `已重写第 ${r.replacedDays.join('、')} 天` : '已写入行程', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (e) {
      Taro.hideLoading()
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '写入失败', icon: 'none' })
      setBusy(false)
    }
  }

  return (
    <View className="page">
      <View className="panel">
        <Text className="label">粘贴攻略文本（支持 Day N / 第 N 天 / D5：10月5日：路线）</Text>
        <Textarea className="textarea" value={text} onInput={e => setText(e.detail.value)} maxlength={6000}
          placeholder={'只粘贴要重写的那几天即可。\n例：D5：10月5日：室韦-驯鹿园-额尔古纳湿地\n6:30 起床\n7:40 到达时光里驯鹿园…'} />
        <Button className="submit" loading={busy} onClick={parse}>解析预览</Button>
      </View>

      {guide && (
        <View className="panel">
          <Text className="section" style={{ marginTop: 0 }}>
            {dayNums.length ? `识别到第 ${dayNums.join('、')} 天行程` : `识别到 ${guide.days.length} 天`}（{guide.source === 'ai' ? 'AI 解析' : '内置模板'}）
          </Text>
          {guide.days.map(d => (
            <View key={d.dayNumber} className="ai-day">
              <Text className="ai-day-title">第 {d.dayNumber} 天{d.date ? `（${d.date}）` : ''}{d.title ? ` · ${d.title}` : ''}</Text>
              {(d.activities || []).map((a, i) => (
                <View key={i} className="ai-act">
                  <Text>{a.time ? `${a.time} ` : ''}{a.title}</Text>
                </View>
              ))}
            </View>
          ))}
          <View className="row2" style={{ marginTop: '14rpx' }}>
            {targetable && <Button className="submit-inline" loading={busy} onClick={() => apply(true)}>只替换第 {dayNums.join('、')} 天</Button>}
            <Button className="danger" loading={busy} onClick={() => apply(false)}>覆盖全部行程</Button>
          </View>
          {!targetable && dayNums.length > 0 && (
            <Text className="muted" style={{ marginTop: '10rpx', display: 'block' }}>
              提示：识别的天号需在当前行程 1~{maxDay} 天范围内才能精准替换（当前 {maxDay || 0} 天，可先创建/延长行程）
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
