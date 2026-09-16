export default defineAppConfig({
  pages: [
    'pages/trips/index',
    'pages/login/index',
    'pages/trip-create/index',
    'pages/trip/index',
    'pages/activity/index',
    'pages/budget/index',
    'pages/packing/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1e2421',
    navigationBarTitleText: '出发吧 GoTrip',
    navigationBarTextStyle: 'white',
  },
})
