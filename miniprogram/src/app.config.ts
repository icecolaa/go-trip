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
  /** 位置类隐私接口声明（mp 后台「接口设置」同步申请开通；getFuzzyLocation 与 getLocation 互斥，本版启用精确） */
  requiredPrivateInfos: [
    'getLocation',
    'onLocationChange',
    'startLocationUpdate',
    'chooseLocation',
    'choosePoi',
    'chooseAddress',
  ],
  permission: {
    'scope.userLocation': {
      desc: '用于在地图上定位当前位置、识别出发城市，以及记录行程地点',
    },
  },
  tabBar: {
    custom: true,
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
