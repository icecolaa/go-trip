import { useState } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { loadTripBundle } from '../../rdb/trip'
import { createMember, deleteMember, updateMember } from '../../rdb/ops'
import type { TripBundle, TripMember } from '../../types'

/** 同伴管理（占位成员）：无需对方装 App，用于记账分摊/清单指派/活动指派。 */
export default function Members() {
  const router = Taro.getCurrentInstance().router
  const tripId = String(router?.params.tripId || '')
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [addName, setAddName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setBundle(await loadTripBundle(tripId))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }
  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })
  if (!bundle) {
    load()
    return <View className="page"><Text className="muted">{error || '加载中…'}</Text></View>
  }

  const me = bundle.members[0]

  const renameMember = (m: TripMember) => {
    Taro.showModal({
      title: '修改称呼',
      ...( { editable: true } as any),
      ...( { placeholderText: m.displayName } as any),
      success: async (res) => {
        const r = res as any
        if (!r.confirm || !r.content?.trim()) return
        try {
          await updateMember(tripId, m.id, { displayName: r.content.trim() }, me?.displayName || '我')
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '修改失败', icon: 'none' })
        }
      },
    })
  }

  const removeMember = (m: TripMember) => {
    Taro.showModal({
      title: `移除「${m.displayName}」？`,
      content: '其名下的指派与分摊记录将失去关联',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await deleteMember(tripId, m.id, m.displayName, me?.displayName || '我')
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '移除失败', icon: 'none' })
        }
      },
    })
  }

  const addPlaceholder = async () => {
    if (busy) return
    if (!addName.trim()) { Taro.showToast({ title: '请填写称呼', icon: 'none' }); return }
    setBusy(true)
    try {
      await createMember(tripId, addName.trim(), me?.displayName || '我')
      setAddName('')
      await load()
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '添加失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className="page">
      <View className="panel">
        <Text className="section" style={{ marginTop: 0 }}>同行伙伴 · {bundle.members.length}</Text>
        <Text className="muted">无需对方装 App，添加称呼即可参与记账分摊与物品指派</Text>
        {bundle.members.map(m => (
          <View key={m.id} className="member-row">
            <View className="avatar" style={{ background: m.avatarColor }}>{m.displayName.slice(0, 1)}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="member-name">{m.displayName}</Text>
              {m.role === 'owner' && <Text className="role-tag">发起人</Text>}
            </View>
            <View style={{ display: 'flex', gap: '12rpx' }}>
              <Button className="chip" size="mini" onClick={() => renameMember(m)}>改名</Button>
              {m.role !== 'owner' && <Button className="chip" size="mini" onClick={() => removeMember(m)}>移除</Button>}
            </View>
          </View>
        ))}
        <View className="row2" style={{ marginTop: '12rpx' }}>
          <Input className="input" style={{ flex: 1 }} value={addName} onInput={e => setAddName(e.detail.value)} placeholder="同行伙伴称呼" maxlength={20} />
          <Button className="submit-inline" size="mini" disabled={busy} onClick={addPlaceholder}>添加</Button>
        </View>
      </View>
    </View>
  )
}
