/* 通用输入弹层：替代 wx.showModal editable（原生 modal 深色下发灰、样式不可控）
   用法：
     <input-sheet show="{{s.show}}" title="{{s.title}}" fields="{{s.fields}}"
                  bind:confirm="onSheet" bind:cancel="closeSheet" />
   fields: [{ key, label?, placeholder?, value?, type?: 'text'|'textarea', maxlength?, required? }]
   confirm 事件 detail = { key: value }（已 trim）；required 字段为空时组件内提示并阻止 */
Component({
  options: {
    // 页面/全局样式（app.wxss 的 .sheet/.grab/.ic）穿透进组件
    styleIsolation: 'apply-shared'
  },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    confirmText: { type: String, value: '确定' },
    fields: { type: Array, value: [] }
  },
  data: {
    values: {}
  },
  observers: {
    show(open) {
      if (open) {
        const values = {}
        ;(this.data.fields || []).forEach(f => { values[f.key] = f.value || '' })
        this.setData({ values })
      }
    }
  },
  methods: {
    onInput(e) {
      this.setData({ ['values.' + e.currentTarget.dataset.key]: e.detail.value })
    },
    cancel() { this.triggerEvent('cancel') },
    confirm() {
      const values = this.data.values
      const missing = (this.data.fields || []).find(f => f.required && !(values[f.key] || '').trim())
      if (missing) { wx.showToast({ title: (missing.label || '内容') + '不能为空', icon: 'none' }); return }
      const out = {}
      Object.keys(values).forEach(k => { out[k] = (values[k] || '').trim() })
      this.triggerEvent('confirm', out)
    },
    noop() { /* 挡住弹层主体的冒泡关闭 */ }
  }
})
