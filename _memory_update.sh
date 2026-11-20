#!/usr/bin/env bash
# 只更新「私人记忆档案 Web 前端」相关的文件，避免 5MB 全量包走 Contents API 取不回来。
set -u
BASE="https://raw.githubusercontent.com/mo-xing-alt/xinmo-site/main"
DEST="/var/www/xinmo-site"
mkdir -p "$DEST/assets/css" "$DEST/assets/js"
for f in \
  memory.html \
  vault-data.js \
  assets/css/memory.css \
  assets/js/crypto-gateway.js \
  assets/js/markdown-lite.js \
  assets/js/memory-app.js \
  owner.html \
  assets/js/guard.js
do
  echo "== 下载 $f"
  curl -fsSL "$BASE/$f" -o "$DEST/$f"
done
chown -R www-data:www-data "$DEST" 2>/dev/null || true
echo "== DONE：私人记忆档案页面已上线"
ls -l "$DEST/memory.html" "$DEST/vault-data.js"
