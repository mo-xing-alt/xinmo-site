#!/usr/bin/env bash
# Diagnostic: check backend code version + streaming behavior on the VPS.
echo "=== 1) service status ==="
sudo systemctl is-active ai-assistant
echo "=== 2) health ==="
curl -sS --max-time 10 http://127.0.0.1:8792/api/health
echo ""
echo "=== 3) backend code version (should show Connection: close) ==="
grep -n "Connection.*close\|close_connection\|enable_thinking.*thinking" /opt/ai-assistant/server.py || echo "OLD CODE (no fix markers)"
echo "=== 4) streaming test (should finish in ~2s, NOT hang to 15s) ==="
curl -sS --max-time 15 -w "\n[elapsed %{time_total}s]\n" \
  -X POST http://127.0.0.1:8792/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"说你好"}],"thinking":false}' \
  | tail -6
echo "=== 5) recent logs ==="
sudo journalctl -u ai-assistant --no-pager -n 8
