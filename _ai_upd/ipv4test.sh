#!/usr/bin/env bash
# Determine whether IPv6 is the culprit. Test force-IPv4 vs default on the VPS.
KEY='sk-ws-H.YYXMXDX.gqw6.MEQCIHAT_o6mUcvYUrUqOaYu4kTonzWj2gcPcMCJIGUZQuO5AiAp5-NBWZ-OsEa0qctVzc6K-k7CkbzrvBSIK_zvswucbQ'
BODY='{"model":"qwen3.8-flash","messages":[{"role":"user","content":"只回复：你好"}],"stream":false,"enable_thinking":false}'
URL="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

echo "=== TEST A: FORCE IPv4 (curl -4) ==="
curl -4 -sS --max-time 15 -w "\nHTTP %{http_code} | connect %{time_connect}s | total %{time_total}s | ip %{remote_ip}\n" \
  -X POST "$URL" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "$BODY" | head -c 300
echo ""

echo "=== TEST B: default (may prefer IPv6) ==="
curl -sS --max-time 15 -w "\nHTTP %{http_code} | connect %{time_connect}s | total %{time_total}s | ip %{remote_ip}\n" \
  -X POST "$URL" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "$BODY" | head -c 300
echo ""

echo "=== TEST C: raw IPv4 direct (bypass DNS) ==="
curl -sS --max-time 15 --resolve "dashscope.aliyuncs.com:443:39.96.198.249" \
  -w "\nHTTP %{http_code} | connect %{time_connect}s | total %{time_total}s | ip %{remote_ip}\n" \
  -X POST "$URL" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "$BODY" | head -c 300
echo ""
echo "=== DONE ==="
