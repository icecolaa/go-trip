// 容器 API（AI/飞哪儿/POI/天气）——callContainer 15s 硬超时的统一封装
const { CLOUD_ENV } = require('./rdb/config')

function call(path, method, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path,
      method,
      data,
      timeout: 15000,
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) resolve(r.data)
        else reject(new Error((r.data && r.data.error) || ('接口错误 ' + r.statusCode)))
      },
      fail(e) { reject(new Error((e && e.errMsg) || '网络失败')) },
    })
  })
}

module.exports = {
  get: (path) => call(path, 'GET'),
  post: (path, data) => call(path, 'POST', data || {}),
}
