import { useState } from 'react'
import { View, Text, Button, Input, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { loadTripBundle } from '../../rdb/trip'
import { createPackingItems, deletePackingItem, updatePackingItem } from '../../rdb/ops'
import { PACKING_TEMPLATES } from '@shared/packing-templates'
import type { TripBundle, PackingItem } from '../../types'

const CATS = ['证件', '衣物', '电子', '洗护', '药品', '其他']
const TEMPLATES = [
  { key: 'basic', name: '国内经典游' },
  { key: 'beach', name: '海岛度假' },
  { key: 'hiking', name: '徒步登山' },
  { key: 'citywalk', name: '城市漫游' },
  { key: 'parent', name: '亲子出游' },
  { key: 'winter', name: '冰雪旅行' },
]

export default function Packing() {
  const router = Taro.getCurrentInstance().router
  const tripId = String(router?.params.tripId || '')
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newCat, setNewCat] = useState('其他')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      setBundle(await loadTripBundle(tripId))
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' })
    }
  }
  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })
  if (!bundle) {
    load()
    return <View className="page"><Text className="muted">加载中…</Text></View>
  }

  const packing: PackingItem[] = bundle.packing
  const doneCount = packing.filter(p => p.done).length

  const toggle = async (item: PackingItem) => {
    setBundle({ ...bundle, packing: packing.map(p => p.id === item.id ? { ...p, done: !p.done } : p) })
    try {
      await updatePackingItem(tripId, item.id, { done: !item.done }, '我')
    } catch {
      await load()
    }
  }

  const add = async () => {
    if (busy) return
    if (!newTitle.trim()) { Taro.showToast({ title: '请填写物品名称', icon: 'none' }); return }
    setBusy(true)
    try {
      await createPackingItems(tripId, [{ title: newTitle.trim(), category: newCat }], '我')
      setNewTitle('')
      await load()
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '添加失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const importTemplate = () => {
    Taro.showActionSheet({
      itemList: TEMPLATES.map(t => t.name),
      success: async (r) => {
        const tpl = PACKING_TEMPLATES[r.tapIndex]
        try {
          const existing = new Set((bundle?.packing || []).map(pi => pi.title))
          const fresh = tpl.items.filter(([, title]) => !existing.has(title)).map(([category, title]) => ({ title, category }))
          await createPackingItems(tripId, fresh, '我')
          Taro.showToast({ title: `已导入 ${fresh.length} 件`, icon: 'success' })
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '导入失败', icon: 'none' })
        }
      },
    })
  }

  const groups = CATS.filter(cat => packing.some(p => p.category === cat))
    .map(cat => ({ cat, items: packing.filter(p => p.category === cat) }))
  const others = groups.length ? [] : packing
  const extraGroups = packing.filter(p => !CATS.includes(p.category))

  return (
    <View className="page">
      <View className="panel">
        <View className="row-between">
          <Text className="label">已打包 {doneCount} / {packing.length}</Text>
          <Text className="linkish" onClick={importTemplate}>导入模板</Text>
        </View>
        <View className="bar"><View className="bar-in" style={{ width: `${packing.length ? Math.round((doneCount / packing.length) * 100) : 0}%` }} /></View>
      </View>

      <View className="panel">
        <View className="row2">
          <Input className="input" style={{ flex: 1 }} value={newTitle} onInput={e => setNewTitle(e.detail.value)} placeholder="添加物品…" maxlength={60} />
          <Picker mode="selector" range={CATS} value={CATS.indexOf(newCat)} onChange={e => setNewCat(CATS[Number(e.detail.value)])}>
            <View className="input picker" style={{ width: '150rpx' }}>{newCat}</View>
          </Picker>
          <Button className="submit-inline" size="mini" disabled={busy} onClick={add}>添加</Button>
        </View>
      </View>

      {groups.map(({ cat, items }) => (
        <View key={cat} className="panel">
          <Text className="section" style={{ marginTop: 0 }}>{cat} · {items.filter(i => i.done).length}/{items.length}</Text>
          {items.map(item => (
            <View key={item.id} className="packing-row" onClick={() => toggle(item)}>
              <Text className={`check ${item.done ? 'on' : ''}`}>{item.done ? '✓' : ''}</Text>
              <Text className={item.done ? 'done-text' : ''}>{item.title}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</Text>
              {!!item.note && <Text className="muted" style={{ marginLeft: '8rpx' }}>{item.note}</Text>}
            </View>
          ))}
        </View>
      ))}
      {extraGroups.length > 0 && (
        <View className="panel">
          <Text className="section" style={{ marginTop: 0 }}>其他分类</Text>
          {extraGroups.map(item => (
            <View key={item.id} className="packing-row" onClick={() => toggle(item)}>
              <Text className={`check ${item.done ? 'on' : ''}`}>{item.done ? '✓' : ''}</Text>
              <Text className={item.done ? 'done-text' : ''}>[{item.category}] {item.title}</Text>
            </View>
          ))}
        </View>
      )}
      {packing.length === 0 && others.length === 0 && (
        <View className="empty"><Text>清单还是空的，导入模板快速开始</Text></View>
      )}
    </View>
  )
}
