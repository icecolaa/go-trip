#!/bin/bash
# 编译 rdb 数据层：Taro 版 src/rdb+shared+config → 原生版 miniprogram-app/utils/rdb（CommonJS）
# 用法：npm run build:rdb（仓库根执行）
# 2026-09-29 修复：tsconfig rootDir=src 使 tsc 把 src/rdb/*.ts 输出到嵌套 utils/rdb/rdb/*.js，
# 而业务 require 按平铺（utils/rdb/trip.js）。旧脚本「编译 → 直接 rm -rf 嵌套目录」= 每次把新产物
# 删掉、平铺旧产物永不更新——1.5.6 在源头补的 coverImage 因此一直没进包（首页封面不显示的根因）。
# 现在改为：编译 → 嵌套产物拷平铺（require "../xxx" 改写 "./xxx"，与平铺布局对齐）→ 删嵌套 → 防护门。
set -e
cd "$(dirname "$0")/../miniprogram"
npx tsc -p tsconfig.rdb.json
RDB_DIR=../miniprogram-app/utils/rdb
NESTED=$RDB_DIR/rdb
if [ -d "$NESTED" ]; then
  for f in "$NESTED"/*.js; do
    name="$(basename "$f")"
    # 嵌套位置向上引用（../config、../shared/...）平铺后都是同级 ./；同级 require（./entities）不变
    sed 's|require("../|require("./|g' "$f" > "$RDB_DIR/$name"
  done
  rm -rf "$NESTED"
fi
# 防护门：产物必须无 process.env.*（原生运行时无 process，require 即崩——2026-09-28 白屏事故）
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
  echo "✓ rdb 产物已更新并平铺（miniprogram-app/utils/rdb），无嵌套垃圾、无 process.env"
else
  echo "✗ 产物含 process.env.*——原生运行时无 process，会白屏。检查 src/config.ts" >&2
  exit 1
fi
