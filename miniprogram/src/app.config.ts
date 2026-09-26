export default defineAppConfig({
  pages: [
    'pages/trips/index',
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
  window: {
    backgroundColor: '#F3F8FC',
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '出发吧 GoTrip',
    navigationBarTextStyle: 'black',
  },
})
