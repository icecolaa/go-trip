import { useState } from 'react'
import { View, Text, Button, Input, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { api } from '../../api/request'
import { createRows, deleteRow, deleteRows, listRows } from '../../rdb/entities'
import { logActivity } from '../../rdb/trip'
import type { ParsedActivity } from '../../types'
import type { ParsedGuide } from '../../types'

interface GuideDay { dayNumber: number; date?: string; title?: string; activities?: { time?: string; title?: string }[] }

export default function TripAI() {
  const router = Taro.getCurrentInstance().router
  const tripId = String(router?.params.tripId || '')
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
      Taro.showToast({ title: e instanceof Error ? e.message : '解析失败', icon: 'none' })
      setBusy(false)
    }
  }

  // 写入改客户端执行：容器只做 AI 解析，落库在这里做（保证 _openid 归属）
  const apply = async (targeted: boolean) => {
    if (!guide || busy) return
    setBusy(true)
    try {
      Taro.showLoading({ title: '写入行程中…' })
      const dayRows = (await listRows('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }])) as any[]
      const touched = new Set<string>()
      if (targeted) {
        for (const d of guide.days) {
          const n = Math.round(Number(d.dayNumber)) || 0
          const hit = dayRows.find(r => r.dayNumber === n || (d.date && r.date === d.date))
          if (!hit) continue
          touched.add(hit.id)
          await deleteRows('gt_activities', { day_id: { $eq: hit.id } })
          await deleteRow('gt_days', hit.id)
        }
        let seq = dayRows.length
        for (const d of guide.days) {
          const n = Math.round(Number(d.dayNumber)) || 0
          if (!dayRows.some(r => r.dayNumber === n)) continue
          seq += 1
          await createRows('gt_days', [{ trip_id: tripId, day_number: n, date: d.date || dayRows[0]?.date || '', title: d.title || '', place: '' }])
        }
      } else {
        await deleteRows('gt_activities', { trip_id: { $eq: tripId } })
        await deleteRows('gt_days', { trip_id: { $eq: tripId } })
        const startBase = dayRows[0]?.date
        let seq = 0
        for (const d of guide.days) {
          seq += 1
          const date = d.date || (startBase ? offsetDate(startBase, seq - 1) : '')
          await createRows('gt_days', [{ trip_id: tripId, day_number: seq, date, title: d.title || '', place: '' }])
        }
      }
      const freshDays = (await listRows('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }])) as any[]
      const acts: any[] = []
      for (const d of guide.days) {
        const n = Math.round(Number(d.dayNumber)) || 0
        const hit = freshDays.find(r => r.dayNumber === n) || freshDays[0]
        if (!hit) continue
        for (const a of d.activities || []) {
          acts.push({ dayId: hit.id, tripId, ...(a as any) })
        }
      }
      if (acts.length) {
        const perDay: Record<string, number> = {}
        await createRows('gt_activities', acts.map(a => {
          perDay[a.dayId] = (perDay[a.dayId] || 0)
          return {
            trip_id: a.tripId, day_id: a.dayId, sort: perDay[a.dayId]++,
            time: a.time || null, end_time: a.endTime || null,
            kind: (a.kind || 'sight'), title: a.title || '', place: a.place || '',
            lat: (a as any).lat ?? null, lng: (a as any).lng ?? null,
            cost: a.cost || 0, notes: a.notes || '', status: '待确认', assignee_member_id: null,
          }
        }))
      }
      await logActivity(tripId, '我', targeted ? 'AI 重写了部分行程' : 'AI 重写了全部行程')
      Taro.hideLoading()
      Taro.showToast({ title: targeted ? `已重写 ${touched.size} 天` : '已写入行程', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (e) {
      Taro.hideLoading()
      Taro.showToast({ title: e instanceof Error ? e.message : '写入失败', icon: 'none' })
      setBusy(false)
    }
  }

  const offsetDate = (base: string, days: number): string => {
    const d = new Date(base + 'T00:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
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
