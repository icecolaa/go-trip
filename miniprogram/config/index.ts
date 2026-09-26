import { defineConfig, type UserConfigExport } from '@tarojs/cli'

import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig(async (merge) => {
  const baseConfig: UserConfigExport = {
    projectName: 'gotrip-miniprogram',
    date: '2026-9-13',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    // H5 产物独立目录，避免覆盖小程序 dist/（Taro 会把 h5 子配置合并进顶层，但 IH5Config 类型未声明 outputRoot，
    // 故用官方支持的顶层字段按平台条件设置；process.env.TARO_ENV 在配置求值时由 CLI 注入）
    outputRoot: process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist',
    plugins: [],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: { enable: false },
    },
    cache: {
      enable: true,
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
        },
      },
      webpackChain(chain) {
        // @shared/* 与 @/* 路径别名（与 tsconfig 保持一致）
        const path = require('path')
        chain.resolve.alias
          .set('@shared', path.resolve(__dirname, '..', '..', 'shared')) // 仓库根 shared/（此前误指 miniprogram/shared，靠已删除的 junction 碰巧能用）
          .set('@', path.resolve(__dirname, '..', 'src'))
      },
    },
    h5: {},
  }
  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
