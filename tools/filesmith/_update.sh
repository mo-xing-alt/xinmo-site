#!/usr/bin/env bash
# 只更新 FileSmith 电子书工坊相关的几个文件，避免 14MB 全量包走 GitHub API 的限制。
set -u
BASE="https://raw.githubusercontent.com/mo-xing-alt/xinmo-site/main/tools/filesmith"
DEST="/var/www/xinmo-site/tools/filesmith"
mkdir -p "$DEST/assets"
for f in \
  index.html \
  assets/index-D-qZUond.js \
  assets/index-DpOBZmNx.js \
  assets/index-B3LVLpaC.css \
  assets/pdf.worker.min-yatZIOMy.mjs \
  assets/text.worker-CrhuBc2s.js
do
  echo "== 下载 $f"
  curl -fsSL "$BASE/$f" -o "$DEST/$f"
done
chown -R www-data:www-data "$DEST" 2>/dev/null || true
echo "== DONE：电子书工坊已上线"
ls -l "$DEST/assets/" | tail -6
