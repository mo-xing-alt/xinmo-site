#!/usr/bin/env bash
# Test which bailian endpoint the Hong Kong VPS can reach.
KEY='sk-ws-H.YYXMXDX.gqw6.MEQCIHAT_o6mUcvYUrUqOaYu4kTonzWj2gcPcMCJIGUZQuO5AiAp5-NBWZ-OsEa0qctVzc6K-k7CkbzrvBSIK_zvswucbQ'
BODY='{"model":"qwen3.8-flash","messages":[{"role":"user","content":"只回复：你好"}],"stream":false,"enable_thinking":false}'

echo "=== DNS resolution ==="
for h in dashscope.aliyuncs.com ws-35faabj7wujamy45.cn-beijing.maas.aliyuncs.com; do
  echo "-- $h"; getent hosts "$h" || echo "  (resolve failed)"
done

echo ""
echo "=== TEST 1: generic Beijing domain dashscope.aliyuncs.com ==="
curl -sS --max-time 20 -w "\nHTTP %{http_code} | connect %{time_connect}s | total %{time_total}s\n" \
  -X POST "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "$BODY" | head -c 400
echo ""

echo "=== TEST 2: dedicated Beijing domain (known failing) ==="
curl -sS --max-time 12 -w "\nHTTP %{http_code} | connect %{time_connect}s | total %{time_total}s\n" \
  -X POST "https://ws-35faabj7wujamy45.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "$BODY" | head -c 300
echo ""

echo "=== DONE ==="
