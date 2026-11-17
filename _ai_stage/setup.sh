#!/usr/bin/env bash
# xinmo.work AI assistant - one-shot installer run INSIDE the VPS (via VNC).
# Usage:  bash setup.sh "YOUR_API_KEY"
set -euo pipefail

API_KEY="${1:-}"
if [ -z "$API_KEY" ]; then
  echo "ERROR: pass API key as first argument."
  echo "  bash setup.sh 'sk-ws-...'"
  exit 1
fi

BASE="https://xinmo.work/_ai_stage"
DIR="/opt/ai-assistant"
echo "== Downloading backend from $BASE =="
mkdir -p "$DIR"
for f in server.py requirements.txt ai-assistant.service Caddyfile-snippet; do
  curl -fsSL "$BASE/$f" -o "$DIR/$f" || { echo "download failed: $f"; exit 1; }
done

echo "== Writing env (key kept local, mode 600) =="
cat > "$DIR/ai-assistant.env" <<EOF
AI_API_KEY=$API_KEY
AI_BASE_URL=https://ws-35faabj7wujamy45.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen3.8-flash
AI_THINKING=1
AI_BIND=127.0.0.1
AI_PORT=8792
AI_ORIGINS=https://xinmo.work,https://www.xinmo.work
AI_RATE_PER_MIN=20
AI_MAX_MSGS=20
AI_MAX_CHARS=4000
EOF
chmod 600 "$DIR/ai-assistant.env"

echo "== Creating service user =="
id -u aiassistant >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin aiassistant

echo "== Installing systemd unit =="
cp "$DIR/ai-assistant.service" /etc/systemd/system/ai-assistant.service
systemctl daemon-reload
systemctl enable --now ai-assistant

echo "== Installing Caddy reverse proxy block =="
if grep -q 'ai.xinmo.work' /etc/caddy/Caddyfile 2>/dev/null; then
  echo "Caddyfile already has ai.xinmo.work, skip."
else
  curl -fsSL "$BASE/Caddyfile-snippet" >> /etc/caddy/Caddyfile
  systemctl reload caddy
fi

sleep 2
echo ""
echo "== Health check =="
curl -sS --max-time 10 http://127.0.0.1:8792/api/health || true
echo ""
echo "DONE. Public: https://ai.xinmo.work/api/health"
