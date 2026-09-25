import { useState } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { api, ApiFail } from '../../api/request'
import type { TripBundle, TripMember, Invite } from '../../types'

const ROLES = ['owner', 'admin', 'editor', 'viewer']
const ROLE_LABEL: Record<string, string> = { owner: '发起人', admin: '管理员', editor: '编辑', viewer: '查看' }

export default function Members() {
  const router = Taro.getCurrentInstance().router
  const tripId = Number(router?.params.tripId || 0)
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [addName, setAddName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setBundle(await api.get<TripBundle>(`/api/trips/${tripId}`))
      setError('')
    } catch (e) {
      setError(e instanceof ApiFail ? e.message : '加载失败')
    }
  }
  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })
  if (!bundle) {
    load()
    return <View className="page"><Text className="muted">{error || '加载中…'}</Text></View>
  }

  const isAdmin = bundle.myRole === 'owner' || bundle.myRole === 'admin'
  const isOwner = bundle.myRole === 'owner'
  const invites: Invite[] = bundle.invites || []

  const changeRole = (m: TripMember) => {
    if (m.role === 'owner') { Taro.showToast({ title: '发起人角色不可直接修改', icon: 'none' }); return }
    Taro.showActionSheet({
      itemList: ['设为管理员', '设为编辑', '设为查看'],
      success: async (r) => {
        const role = ['admin', 'editor', 'viewer'][r.tapIndex]
        try {
          await api.patch(`/api/trips/${tripId}/members/${m.id}`, { role })
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof ApiFail ? e.message : '修改失败', icon: 'none' })
        }
      },
    })
  }

  const removeMember = (m: TripMember) => {
    Taro.showModal({
      title: `移除「${m.displayName}」？`,
      content: '其行程数据保留，仅移出本旅程',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await api.del(`/api/trips/${tripId}/members/${m.id}`)
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof ApiFail ? e.message : '移除失败', icon: 'none' })
        }
      },
    })
  }

  const addPlaceholder = async () => {
    if (busy) return
    if (!addName.trim()) { Taro.showToast({ title: '请填写称呼', icon: 'none' }); return }
    setBusy(true)
    try {
      await api.post(`/api/trips/${tripId}/members`, { displayName: addName.trim() })
      setAddName('')
      await load()
    } catch (e) {
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '添加失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const createInvite = async () => {
    try {
      await api.post(`/api/trips/${tripId}/invites`, {})
      await load()
    } catch (e) {
      Taro.showToast({ title: e instanceof ApiFail ? e.message : '创建失败', icon: 'none' })
    }
  }

  const revokeInvite = (inv: Invite) => {
    Taro.showModal({
      title: `撤销邀请码 ${inv.code}？`,
      success: async (r) => {
        if (!r.confirm) return
        try {
          await api.del(`/api/invites/${inv.id}`)
          await load()
        } catch (e) {
          Taro.showToast({ title: e instanceof ApiFail ? e.message : '撤销失败', icon: 'none' })
        }
      },
    })
  }

  return (
    <View className="page">
      <View className="panel">
        <Text className="section" style={{ marginTop: 0 }}>成员 · {bundle.members.length}</Text>
        {bundle.members.map(m => {
          const online = bundle.onlineMemberIds.includes(m.userId || -1)
          return (
            <View key={m.id} className="member-row">
              <View className="avatar" style={{ background: m.avatarColor }}>{m.displayName.slice(0, 1)}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View>
                  <Text className="member-name">{m.displayName}</Text>
                  <Text className="role-tag">{ROLE_LABEL[m.role] || m.role}</Text>
                  {online && <Text className="online">在线</Text>}
                </View>
                {!!m.location && <View className="muted"><Text>📍 {m.location}</Text></View>}
              </View>
              {isAdmin && m.role !== 'owner' && (
                <View style={{ display: 'flex', gap: '12rpx' }}>
                  {isOwner || m.role !== 'admin' ? <Button className="chip" size="mini" onClick={() => changeRole(m)}>角色</Button> : null}
                  <Button className="chip" size="mini" onClick={() => removeMember(m)}>移除</Button>
                </View>
              )}
            </View>
          )
        })}
        {isAdmin && (
          <View className="row2" style={{ marginTop: '12rpx' }}>
            <Input className="input" style={{ flex: 1 }} value={addName} onInput={e => setAddName(e.detail.value)} placeholder="添加同行伙伴称呼" maxlength={20} />
            <Button className="submit-inline" size="mini" disabled={busy} onClick={addPlaceholder}>添加</Button>
          </View>
        )}
      </View>

      {isAdmin && (
        <View className="panel">
          <Text className="section" style={{ marginTop: 0 }}>邀请码 · 好友输入后即可加入</Text>
          {invites.length === 0 && <Text className="muted">暂无有效邀请码</Text>}
          {invites.map(inv => (
            <View key={inv.id} className="invite-row">
              <Text className="invite-code">{inv.code}</Text>
              <View style={{ display: 'flex', gap: '10rpx', alignItems: 'center' }}>
                <Text className="muted">已用 {inv.uses}{inv.maxUses ? `/${inv.maxUses}` : '+'}</Text>
                <Button className="chip" size="mini" onClick={() => revokeInvite(inv)}>撤销</Button>
              </View>
            </View>
          ))}
          <Button className="submit-inline" size="mini" onClick={createInvite}>＋ 生成新邀请码</Button>
        </View>
      )}
    </View>
  )
}
