import { useState } from 'react'
import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { api, getToken, setToken, ApiFail } from '../../api/request'
import type { Me } from '../../types'

/**
 * 个人资料：官方「头像昵称填写能力」（基础库 2.21.2+）。
 * - 头像：open-type=chooseAvatar 一键用微信头像或选相册，压缩后以 dataURL 存库
 * - 昵称：input type=nickname 键盘上方可快捷填入微信昵称
 * 微信自 2022 年起不再通过 getUserProfile 返回真实昵称头像，主动填写是唯一合规路径。
 */

/** 读本地文件为 dataURL（服务端只收 data:image/(jpeg|png|webp);base64） */
function readAsDataUrl(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fs = Taro.getFileSystemManager()
    fs.readFile({
      filePath: path,
      encoding: 'base64',
      success: res => resolve(`data:image/jpeg;base64,${res.data}`),
      fail: () => reject(new Error('读取图片失败')),
    })
  })
}

export default function Profile() {
  const [me, setMe] = useState<Me | null>(null)
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    try {
      setError('')
      const m = await api.get<Me>('/api/me')
      setMe(m)
      setNickname(m.nickname)
    } catch (e) {
      if (e instanceof ApiFail && e.status === 401) {
        setToken('')
        Taro.redirectTo({ url: '/pages/login/index' })
        return
      }
      setError(e instanceof ApiFail ? e.message : '加载失败')
    }
  }
  useDidShow(() => { load() })

  const onChooseAvatar = async (e: { detail: { avatarUrl: string } }) => {
    const p = e?.detail?.avatarUrl
    if (!p) return
    try {
      setBusy(true)
      let src = p
      try { const c = await Taro.compressImage({ src: p, quality: 60 }); src = c.tempFilePath } catch { /* 压缩失败用原图 */ }
      const dataUrl = await readAsDataUrl(src)
      if (dataUrl.length > 200_000) {
        Taro.showToast({ title: '图片太大，换一张试试', icon: 'none' })
        return
      }
      const updated = await api.patch<Me>('/api/me', { avatarUrl: dataUrl })
      setMe(prev => (prev ? { ...prev, ...updated } : updated))
      Taro.showToast({ title: '头像已更新', icon: 'success' })
    } catch (err) {
      Taro.showToast({ title: err instanceof ApiFail ? err.message : '头像上传失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    try {
      setBusy(true)
      const updated = await api.patch<Me>('/api/me', { nickname })
      setMe(prev => (prev ? { ...prev, ...updated } : updated))
      Taro.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      Taro.showToast({ title: err instanceof ApiFail ? err.message : '保存失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  if (error) return <View className="page"><View className="error">{error}</View></View>

  return (
    <View className="page">
      <View className="card profile-card">
        <Button className="avatar-btn" openType="chooseAvatar" onChooseAvatar={onChooseAvatar} disabled={busy}>
          {me?.avatarUrl ? (
            <Image className="avatar-img" src={me.avatarUrl} mode="aspectFill" />
          ) : (
            <View className="avatar-fallback" style={{ background: me?.avatarColor || '#2f6e4f' }}>
              <Text className="avatar-initial">{(nickname || me?.nickname || '微').slice(0, 1)}</Text>
            </View>
          )}
        </Button>
        <Text className="muted avatar-hint">点头像可换微信头像</Text>

        <View className="field">
          <Text className="label">昵称</Text>
          <Input
            className="input"
            type="nickname"
            value={nickname}
            maxlength={20}
            placeholder="点此填写，可快捷使用微信昵称"
            onInput={e => setNickname(e.detail.value)}
          />
        </View>
        <Text className="muted meta-line">账号 {me?.username || '—'} · 旅行 ID {me?.travelId || '—'}</Text>

        <Button className="submit" disabled={busy || !me} onClick={save}>保存资料</Button>
      </View>
    </View>
  )
}
