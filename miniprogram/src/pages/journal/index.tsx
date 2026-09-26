import { useState } from 'react'
import { View, Text, Button, Input, Image } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { loadTripBundle } from '../../rdb/trip'
import { createJournal } from '../../rdb/ops'
import { tempUrls, uploadImage } from '../../rdb/storage'
import type { TripBundle } from '../../types'

const MOODS = ['🎉', '🥰', '😎', '😴', '🤯', '🌧️', '🍜', '📝']
const MAX_IMAGES = 9

export default function Journal() {
  const router = Taro.getCurrentInstance().router
  const tripId = String(router?.params.tripId || '')
  const [bundle, setBundle] = useState<TripBundle | null>(null)
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('📝')
  const [images, setImages] = useState<string[]>([]) // 本地临时路径
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setError('')
      const b = await loadTripBundle(tripId)
      setBundle(b)
      const ids = b.journal.flatMap(j => (j.images || []).flatMap(im => [im.full, im.thumb])).filter(Boolean)
      setUrlMap(await tempUrls(ids))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }
  usePullDownRefresh(() => {
    load().finally(() => Taro.stopPullDownRefresh())
  })
  if (!bundle && !error) {
    load()
    return <View className="page"><Text className="muted">加载中…</Text></View>
  }
  if (error) return <View className="page"><View className="error">{error}</View></View>

  const pickImages = () => {
    const remain = MAX_IMAGES - images.length
    if (remain <= 0) { Taro.showToast({ title: `最多 ${MAX_IMAGES} 张`, icon: 'none' }); return }
    Taro.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      success: res => setImages(prev => [...prev, ...res.tempFilePaths].slice(0, MAX_IMAGES)),
    })
  }

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx))

  const publish = async () => {
    if (busy) return
    if (!content.trim()) { Taro.showToast({ title: '写点什么再发布吧', icon: 'none' }); return }
    setBusy(true)
    try {
      // ① 图片压上传云存储，记录 fileID（模型文本 4000 字节上限，禁止 base64 入库）
      let imagePayload: { full: string; thumb: string }[] = []
      if (images.length) {
        Taro.showLoading({ title: '上传图片…' })
        imagePayload = await Promise.all(images.map(async (p) => {
          let full = p
          try { const c = await Taro.compressImage({ src: p, quality: 75 }); full = c.tempFilePath } catch { /* 压缩失败用原图 */ }
          const fileID = await uploadImage(full, 'journal')
          return { full: fileID, thumb: fileID }
        }))
        Taro.hideLoading()
      }
      // ② 发布日志（rdb 直连，_openid 自动归属）
      await createJournal(tripId, {
        dayId: null,
        authorMemberId: bundle?.members[0]?.id || '',
        content: content.trim(),
        mood,
        images: imagePayload,
      }, bundle?.members[0]?.displayName || '我')
      setContent(''); setImages([]); setMood('📝')
      setBusy(false)
      await load()
      Taro.showToast({ title: '日志已发布', icon: 'success' })
    } catch (e) {
      Taro.hideLoading()
      setBusy(false)
      Taro.showToast({ title: e instanceof Error ? e.message : '发布失败', icon: 'none' })
    }
  }

  const journal = bundle!.journal
  const memberName = (id: string): string => bundle?.members.find(m => m.id === id)?.displayName || '我'

  return (
    <View className="page">
      <View className="panel">
        <Input className="input" value={content} onInput={e => setContent(e.detail.value)} placeholder="记录这一刻：见闻、踩坑、高光时刻…" maxlength={3000} />
        <View className="mood-row">
          <Text className="label" style={{ marginBottom: 0 }}>心情</Text>
          {MOODS.map(m => (
            <Text key={m} className={`mood ${mood === m ? 'on' : ''}`} onClick={() => setMood(m)}>{m}</Text>
          ))}
        </View>
        <View className="row2" style={{ alignItems: 'center' }}>
          <Button className="chip" size="mini" onClick={pickImages} disabled={images.length >= MAX_IMAGES}>＋ 图片 {images.length ? `${images.length}/9` : ''}</Button>
          <View style={{ flex: 1 }} />
          <Button className="submit-inline" size="mini" loading={busy} onClick={publish}>发布</Button>
        </View>
        {images.length > 0 && (
          <View className="thumbs">
            {images.map((p, i) => (
              <View key={p + i} className="thumb">
                <Image src={p} mode="aspectFill" className="thumb-img" />
                <Text className="thumb-x" onClick={() => removeImage(i)}>×</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {journal.length === 0 && <View className="empty"><Text>还没有日志，写下第一篇吧</Text></View>}
      {journal.map(j => (
        <View key={j.id} className="panel">
          <View className="row-between">
            <Text className="j-author">{memberName(j.authorMemberId)} {j.mood}</Text>
            <Text className="muted">{j.createdAt ? new Date(j.createdAt).toLocaleDateString('zh-CN') : ''}</Text>
          </View>
          <View className="j-body"><Text>{j.content}</Text></View>
          {(j.images || []).length > 0 && (
            <View className="thumbs">
              {(j.images || []).map((im, i) => (
                <Image key={i} src={urlMap[im.thumb] || im.thumb} mode="aspectFill" className="thumb-img thumb" />
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  )
}
