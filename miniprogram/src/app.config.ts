export default defineAppConfig({
  pages: [
    'pages/trips/index',
    'pages/login/index',
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
  /** 按需注入（基础库 2.11.1+）：仅注入当前页面所需的代码，降低启动耗时与内存。
   *  本项目未使用自定义组件/全局 usingComponents，无依赖声明风险。 */
  lazyCodeLoading: 'requiredComponents',
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1e2421',
    navigationBarTitleText: '出发吧 GoTrip',
    navigationBarTextStyle: 'white',
  },
})
