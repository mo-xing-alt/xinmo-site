#!/usr/bin/env bash
# One-shot backend update: enable per-request thinking toggle + default thinking off.
set -euo pipefail
DIR="/opt/ai-assistant"
echo "== Backup current server.py =="
cp "$DIR/server.py" "$DIR/server.py.bak" 2>/dev/null || true
echo "== Download new server.py =="
curl -fsSL https://xinmo.work/_ai_upd/server.py -o "$DIR/server.py"
echo "== Set default thinking off =="
if grep -q '^AI_THINKING=' "$DIR/ai-assistant.env"; then
  sed -i 's/^AI_THINKING=.*/AI_THINKING=0/' "$DIR/ai-assistant.env"
else
  echo "AI_THINKING=0" >> "$DIR/ai-assistant.env"
fi
chown aiassistant:aiassistant "$DIR/server.py"
echo "== Restart service =="
systemctl restart ai-assistant
sleep 2
echo "== Health check =="
curl -sS --max-time 10 http://127.0.0.1:8792/api/health
echo ""
echo "DONE. thinking default = off, per-request toggle enabled."
