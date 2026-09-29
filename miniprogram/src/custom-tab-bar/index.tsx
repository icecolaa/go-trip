/* 自定义 tabBar（液态玻璃）：app.config tabBar.custom=true 时启用。
 * 选中态由各 tab 页 useDidShow 调 syncTabBar(index) 同步（页面实例 getTabBar）。 */
import { Component } from 'react'
import { View, Image, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { initialTab } from '../tab-sync'
import './index.css'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TAB_LIST = [
  { path: '/pages/trips/index', text: '行程', icon: '/assets/tab-home.png', iconOn: '/assets/tab-home-on.png' },
  { path: '/pages/messages/index', text: '消息', icon: '/assets/tab-chat.png', iconOn: '/assets/tab-chat-on.png' },
  { path: '/pages/profile/index', text: '我的', icon: '/assets/tab-user.png', iconOn: '/assets/tab-user-on.png' },
]

interface Props { }
interface State { selected: number }

export default class CustomTabBar extends Component<Props, State> {
  // switchTab 会重建 tab 组件实例：constructor 里恢复上次选中态，避免高亮滞留
  constructor(props: Props) {
    super(props)
    this.state = { selected: initialTab() }
  }

  setSelected(index: number): void {
    this.setState({ selected: index })
  }

  onTap(index: number): void {
    this.setState({ selected: index })
    Taro.switchTab({ url: TAB_LIST[index].path })
  }

  render() {
    const { selected } = this.state
    return (
      <View className="tab-bar">
        {TAB_LIST.map((t, i) => (
          <View key={t.path} className={`tab-item ${selected === i ? 'on' : ''}`} onClick={() => this.onTap(i)}>
            <Image src={selected === i ? t.iconOn : t.icon} mode="aspectFit" />
            <Text className="tab-label">{t.text}</Text>
          </View>
        ))}
      </View>
    )
  }
}
