import { useEffect, useState } from 'react'
import { View, Input, Button, Text, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { createActivity, deleteActivity, updateActivity } from '../../rdb/ops'
import type { ActivityKind, Activity } from '../../types'
import { ensureProfile } from '../../rdb/trip'

const KINDS: { value: string; label: string }[] = [
  { value: 'sight', label: '🏞️ 景点' },
  { value: 'food', label: '🍜 美食' },
  { value: 'hotel', label: '🏨 住宿' },
  { value: 'transport', label: '🚄 交通' },
  { value: 'shopping', label: '🛍️ 购物' },
  { value: 'show', label: '🎭 演出' },
  { value: 'other', label: '📌 其他' },
]
const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map(k => [k.value, k.label]))

export default function ActivityPage() {
  const router = Taro.getCurrentInstance().router
  const tripId = String(router?.params.tripId || '')
  const dayId = String(router?.params.dayId || '')
  const activityId = String(router?.params.activityId || '')
  const editing = !!activityId

  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [kind, setKind] = useState('sight')
  const [loaded, setLoaded] = useState(!editing)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing) return
    ;(async () => {
      try {
        const { getRowById } = await import('../../rdb/entities')
        const a = await getRowById('gt_activities', activityId) as unknown as Activity | null
        if (!a) { Taro.showToast({ title: '行程不存在', icon: 'none' }); Taro.navigateBack(); return }
        setTitle(a.title); setTime(a.time || ''); setPlace(a.place)
        setCost(a.cost ? String(a.cost) : ''); setNotes(a.notes); setKind(a.kind)
        setLoaded(true)
      } catch {
        Taro.showToast({ title: '加载失败', icon: 'none' })
        Taro.navigateBack()
      }
    })()
  }, [editing, tripId, activityId])

  const save = async () => {
    if (busy) return
    if (!title.trim()) { Taro.showToast({ title: '请填写行程内容', icon: 'none' }); return }
    if (time && !/^\d{1,2}[:：]\d{2}$/.test(time)) { Taro.showToast({ title: '时间格式：HH:mm', icon: 'none' }); return }
    setBusy(true)
    const body = {
      title: title.trim(),
      time: time.trim().replace('：', ':'),
      place: place.trim(),
      cost: Number(cost) || 0,
      notes: notes.trim(),
      kind: kind as ActivityKind,
    }
    try {
      const me = await ensureProfile()
      if (editing) await updateActivity(tripId, activityId, body, me.nickname)
      else await createActivity(tripId, dayId, body, me.nickname)
      Taro.showToast({ title: editing ? '已更新' : '已添加', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 500)
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '保存失败', icon: 'none' })
      setBusy(false)
    }
  }

  const remove = () => {
    if (!editing) return
    Taro.showModal({
      title: '删除这条行程？',
      success: async (r) => {
        if (!r.confirm) return
        try {
          const me = await ensureProfile()
          await deleteActivity(tripId, activityId, title.trim(), me.nickname)
          Taro.navigateBack()
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '删除失败', icon: 'none' })
        }
      },
    })
  }

  if (!loaded) return <View className="page"><Text className="muted">加载中…</Text></View>

  return (
    <View className="page">
      <View className="card">
        <View className="field">
          <Text className="label">行程内容 *</Text>
          <Input className="input" value={title} onInput={e => setTitle(e.detail.value)} placeholder="例如：古城内吃白族菜" maxlength={100} />
        </View>
        <View className="row2">
          <View className="field" style={{ flex: 1 }}>
            <Text className="label">时间（HH:mm）</Text>
            <Input className="input" value={time} onInput={e => setTime(e.detail.value)} placeholder="如 09:30" />
          </View>
          <View className="field" style={{ flex: 1 }}>
            <Text className="label">预估费用（元）</Text>
            <Input className="input" type="number" value={cost} onInput={e => setCost(e.detail.value)} placeholder="0" />
          </View>
        </View>
        <View className="field">
          <Text className="label">分类</Text>
          <Picker mode="selector" range={KINDS.map(k => k.label)} onChange={e => setKind(KINDS[Number(e.detail.value)].value)}>
            <View className="input picker">{KIND_LABEL[kind] || '🏞️ 景点'}</View>
          </Picker>
        </View>
        <View className="field">
          <Text className="label">地点</Text>
          <Input className="input" value={place} onInput={e => setPlace(e.detail.value)} placeholder="例如：人民路" maxlength={60} />
        </View>
        <View className="field" style={{ marginBottom: 0 }}>
          <Text className="label">备注</Text>
          <Input className="input" value={notes} onInput={e => setNotes(e.detail.value)} placeholder="提示、预约截图时间等" maxlength={300} />
        </View>
      </View>

      <Button className="submit" loading={busy} onClick={save}>{editing ? '保存修改' : '添加安排'}</Button>
      {editing && <Button className="danger" onClick={remove} disabled={busy}>删除这条行程</Button>}
    </View>
  )
}
