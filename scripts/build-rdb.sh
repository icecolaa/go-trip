#!/bin/bash
# 编译 rdb 数据层：Taro 版 src/rdb+shared+config → 原生版 miniprogram-app/utils/rdb（CommonJS）
# 用法：npm run build:rdb（仓库根执行）
# 注意：产物 utils/rdb/config.js 必须无 process.env.*（原生运行时无 process，require 即崩）——
#       源头 src/config.ts 的 isH5 已写死 false（2026-09-28 白屏事故防复发）
set -e
cd "$(dirname "$0")/../miniprogram"
npx tsc -p tsconfig.rdb.json
# rootDir=src 的输出会把 rdb 层嵌套到 rdb/rdb/（历史产物是平铺的，require 路径按平铺写）——删嵌套
rm -rf ../miniprogram-app/utils/rdb/rdb
if node -e "
const fs=require('fs'),path=require('path');
const dir='../miniprogram-app/utils/rdb';
let bad=0;
function walk(d){for(const n of fs.readdirSync(d)){const p=path.join(d,n);const st=fs.statSync(p);
  if(st.isDirectory()){walk(p);continue}
  if(!n.endsWith('.js'))continue;
  const src=fs.readFileSync(p,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  if(/process\.env/.test(src)){console.log('HIT:',p);bad++}
}}
walk(dir);
process.exit(bad?1:0)
"; then
  echo "✓ rdb 产物已更新（miniprogram-app/utils/rdb），无嵌套垃圾、无 process.env"
else
  echo "✗ 产物含 process.env.*——原生运行时无 process，会白屏。检查 src/config.ts" >&2
  exit 1
fi
