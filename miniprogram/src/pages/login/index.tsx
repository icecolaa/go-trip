import { useState } from 'react'
import { View, Input, Button, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { api, setToken, ApiFail } from '../../api/request'
import type { Me } from '../../types'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (!username.trim() || !password) {
      Taro.showToast({ title: '请填写用户名与密码', icon: 'none' })
      return
    }
    setBusy(true)
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login'
        ? { username: username.trim(), password }
        : { username: username.trim(), password, nickname: nickname.trim() || username.trim() }
      const r = await api.post<{ token: string; user: Me }>(path, body)
      setToken(r.token)
      Taro.redirectTo({ url: '/pages/trips/index' })
    } catch (e) {
      const msg = e instanceof ApiFail ? e.message : '登录失败，请稍后再试'
      Taro.showToast({ title: msg, icon: 'none' })
      setBusy(false)
    }
  }

  return (
    <View className="page">
      <View className="logo">🧭 出发吧 GoTrip</View>
      <View className="sub">和朋友一起，规划每一次出发</View>

      <View className="tabs">
        <View className={`tab ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')}>
          <Text>登录</Text>
        </View>
        <View className={`tab ${mode === 'register' ? 'on' : ''}`} onClick={() => setMode('register')}>
          <Text>注册</Text>
        </View>
      </View>

      {mode === 'register' && (
        <View className="field">
          <Text className="label">昵称</Text>
          <Input className="input" value={nickname} onInput={e => setNickname(e.detail.value)} placeholder="旅途中怎么称呼你" maxlength={20} />
        </View>
      )}
      <View className="field">
        <Text className="label">用户名</Text>
        <Input className="input" value={username} onInput={e => setUsername(e.detail.value)} placeholder="3-24 位字母、数字或下划线" />
      </View>
      <View className="field">
        <Text className="label">密码</Text>
        <Input className="input" password value={password} onInput={e => setPassword(e.detail.value)} placeholder="至少 6 位" />
      </View>

      <Button className="submit" loading={busy} onClick={submit}>
        {mode === 'login' ? '登录' : '注册并开始'}
      </Button>

      <View className="hint">
        <Text>演示账号 demo / demo1234</Text>
      </View>
    </View>
  )
}
