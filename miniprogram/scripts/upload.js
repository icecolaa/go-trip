/**
 * 小程序代码上传 / 预览（miniprogram-ci，免开发者工具）
 *
 * 用法：
 *   npm run preview                 生成预览二维码（preview-qr.jpg，微信扫码打开体验）
 *   npm run upload -- 1.0.0         上传为开发版本（版本号必填）
 *   npm run upload -- 1.0.0 "描述"  带版本描述
 *
 * 前置：private.<appid>.key 上传密钥已放在本目录（.gitignore 保护，绝不提交）。
 * 上传后到公众平台「版本管理 → 开发版本」设为体验版或提交审核。
 */
const ci = require('miniprogram-ci')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const pc = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
const keyPath = path.join(root, `private.${pc.appid}.key`)

if (!fs.existsSync(keyPath)) {
  console.error(`✗ 找不到上传密钥：${keyPath}`)
  console.error('  在公众平台「开发管理 → 开发设置 → 小程序代码上传」下载，放到 miniprogram/ 目录。')
  process.exit(1)
}

const project = new ci.Project({
  appid: pc.appid,
  type: 'miniProgram',
  projectPath: root,
  privateKeyPath: keyPath,
  ignores: ['node_modules/**/*', 'src/**/*', 'config/**/*', 'scripts/**/*'],
})

const argv = process.argv.slice(2)
const mode = argv[0] === 'preview' ? 'preview' : 'upload'
const version = mode === 'upload' ? argv[0] : undefined
const desc = mode === 'upload' ? (argv[1] || '') : (argv[1] || 'GoTrip 小程序预览')

async function main() {
  try {
    if (mode === 'preview') {
      console.log('⟳ 生成预览二维码（微信扫码打开体验）…')
      await ci.preview({
        project,
        desc,
        setting: { es6: false, es7: true, minify: true },
        qrcodeFormat: 'image',
        qrcodeOutputDest: path.join(root, 'preview-qr.jpg'),
      })
      console.log('✓ 预览二维码已生成：miniprogram/preview-qr.jpg')
    } else {
      if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
        console.error('✗ 请提供语义化版本号：npm run upload -- 1.0.0 "描述"')
        process.exit(1)
      }
      console.log(`⟳ 上传开发版本 ${version} …`)
      await ci.upload({
        project,
        version,
        desc,
        setting: { es6: false, es7: true, minify: true },
        robot: 1,
      })
      console.log(`✓ 上传成功：${version}`)
      console.log('  前往公众平台「版本管理 → 开发版本」设为体验版或提交审核。')
    }
  } catch (e) {
    console.error('✗ 失败：', (e && e.message) || e)
    process.exit(1)
  }
}

main()
