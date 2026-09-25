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
    outputRoot: 'dist',
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
          .set('@shared', path.resolve(__dirname, '..', 'shared'))
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
