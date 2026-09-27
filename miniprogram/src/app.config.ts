export default defineAppConfig({
  pages: [
    'pages/trips/index',
    'pages/messages/index',
    'pages/profile/index',
    'pages/trip-create/index',
    'pages/trip/index',
    'pages/activity/index',
    'pages/budget/index',
    'pages/packing/index',
    'pages/journal/index',
    'pages/handbook/index',
    'pages/members/index',
    'pages/flywhere/index',
    'pages/trip-ai/index',
    'pages/map/index',
  ],
  /** 按需注入（基础库 2.11.1+）：仅注入当前页面所需的代码，降低启动耗时与内存。 */
  lazyCodeLoading: 'requiredComponents',
  tabBar: {
    color: '#93A5B8',
    selectedColor: '#1B78D8',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/trips/index', text: '行程', iconPath: 'assets/tab-home.png', selectedIconPath: 'assets/tab-home-on.png' },
      { pagePath: 'pages/messages/index', text: '消息', iconPath: 'assets/tab-chat.png', selectedIconPath: 'assets/tab-chat-on.png' },
      { pagePath: 'pages/profile/index', text: '我的', iconPath: 'assets/tab-user.png', selectedIconPath: 'assets/tab-user-on.png' },
    ],
  },
  window: {
    backgroundColor: '#F3F8FC',
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '出发吧 GoTrip',
    navigationBarTextStyle: 'black',
  },
})
