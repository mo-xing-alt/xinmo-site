# -*- coding: utf-8 -*-
"""
新模学习 · AI 小助手后端代理
================================================
职责：浏览器只连本服务，本服务持有大模型 API Key 并转发到阿里云百炼，
      Key 永不下发到前端。以 SSE 流式返回，区分「思考过程 / 完整回复」。

    python3 server.py              默认 http://127.0.0.1:8792
    python3 server.py 9000         指定端口

环境变量（见 ai-assistant.env，由 systemd EnvironmentFile 注入）：
    AI_API_KEY     阿里云百炼 API Key（必填）
    AI_BASE_URL    OpenAI 兼容端点（含 /v1）
    AI_MODEL        模型名，默认 qwen3.8-flash
    AI_THINKING     是否开启思考 1/0，默认 1
    AI_BIND         监听地址，默认 127.0.0.1
    AI_PORT         端口，默认 8792
    AI_ORIGINS      允许的来源，逗号分隔，默认 https://xinmo.work,https://www.xinmo.work
    AI_RATE_PER_MIN 单 IP 每分钟请求数上限，默认 20
    AI_MAX_MSGS     单次请求携带的历史消息上限，默认 20
    AI_MAX_CHARS    单条消息最大字符数，默认 4000
"""
from __future__ import annotations

import json
import os
import sys
import time
import threading
import urllib.request
import urllib.error
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API_KEY = os.environ.get("AI_API_KEY", "")
BASE_URL = os.environ.get(
    "AI_BASE_URL",
    "https://ws-35faabj7wujamy45.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
).rstrip("/")
MODEL = os.environ.get("AI_MODEL", "qwen3.8-flash")
THINKING = os.environ.get("AI_THINKING", "1") == "1"
BIND = os.environ.get("AI_BIND", "127.0.0.1")
PORT = int(os.environ.get("AI_PORT", "8792"))
ORIGINS = {
    o.strip().rstrip("/")
    for o in os.environ.get(
        "AI_ORIGINS", "https://xinmo.work,https://www.xinmo.work"
    ).split(",")
    if o.strip()
}
RATE_PER_MIN = int(os.environ.get("AI_RATE_PER_MIN", "20"))
MAX_MSGS = int(os.environ.get("AI_MAX_MSGS", "20"))
MAX_CHARS = int(os.environ.get("AI_MAX_CHARS", "4000"))

ALLOWED_ROLES = {"system", "user", "assistant"}
SYSTEM_PROMPT = (
    "你是「新模学习」(xinmo.work) 网站的 AI 学习小助手，面向学生与自学者。"
    "请用简体中文回答，语气亲切、简洁、有条理；解答学习问题、整理知识、辅助写作与编程。"
    "不确定的信息请如实说明，不要编造。回答聚焦学习，不协助违规或有害内容。"
)

# ---- 简单的按 IP 滑动窗口限流 ----
_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def _client_ip(handler: "Handler") -> str:
    fwd = handler.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return handler.client_address[0] if handler.client_address else "?"


def _rate_ok(ip: str) -> bool:
    now = time.time()
    with _hits_lock:
        q = _hits[ip]
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= RATE_PER_MIN:
            return False
        q.append(now)
        return True


def _allowed_origin(handler: "Handler") -> bool:
    origin = (handler.headers.get("Origin") or "").rstrip("/")
    if not origin:
        # 同源 / 非浏览器客户端（如 curl 自检）放行
        return True
    return origin in ORIGINS


def _sanitize_messages(raw) -> list[dict] | str:
    if not isinstance(raw, list) or not raw:
        return "messages 必须是非空数组"
    msgs = []
    for m in raw[-MAX_MSGS:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role not in ALLOWED_ROLES or not isinstance(content, str):
            continue
        content = content[:MAX_CHARS]
        if role == "system":
            # 不允许客户端覆盖系统人设
            continue
        msgs.append({"role": role, "content": content})
    if not msgs:
        return "没有有效的消息"
    return [{"role": "system", "content": SYSTEM_PROMPT}] + msgs


class Handler(BaseHTTPRequestHandler):
    server_version = "XinmoAI/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[ai] %s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self):
        origin = (self.headers.get("Origin") or "").rstrip("/")
        if origin and origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/api/health", "/health"):
            self._json(200, {"ok": True, "model": MODEL, "thinking": THINKING})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path not in ("/api/chat", "/chat"):
            self._json(404, {"error": "not found"})
            return
        if not _allowed_origin(self):
            self._json(403, {"error": "origin not allowed"})
            return
        if not API_KEY:
            self._json(500, {"error": "server missing API key"})
            return
        ip = _client_ip(self)
        if not _rate_ok(ip):
            self._json(429, {"error": "请求太频繁，请稍后再试"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"error": "bad content-length"})
            return
        if length <= 0 or length > 200_000:
            self._json(400, {"error": "invalid body size"})
            return
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._json(400, {"error": "invalid json"})
            return

        msgs = _sanitize_messages(data.get("messages"))
        if isinstance(msgs, str):
            self._json(400, {"error": msgs})
            return

        # 客户端可用 thinking 字段按请求覆盖；默认取服务端配置
        thinking = data.get("thinking", THINKING)
        thinking = bool(thinking) if isinstance(thinking, bool) else THINKING

        payload = {
            "model": MODEL,
            "messages": msgs,
            "stream": True,
            # 该模型默认开启思考，必须显式传 False 才能真正关闭（否则首字节很慢）
            "enable_thinking": thinking,
        }

        req = urllib.request.Request(
            BASE_URL + "/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": "Bearer " + API_KEY,
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
        )

        # 开始流式响应
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        # 无 Content-Length，必须用 close 让客户端/Caddy 以断连判定流结束
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")
        self._cors()
        self.end_headers()

        def emit(obj: dict):
            self.wfile.write(b"data: " + json.dumps(obj, ensure_ascii=False).encode("utf-8") + b"\n\n")
            self.wfile.flush()

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                for raw_line in resp:
                    line = raw_line.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue
                    chunk = line[5:].strip()
                    if chunk == "[DONE]":
                        break
                    try:
                        obj = json.loads(chunk)
                    except Exception:
                        continue
                    choices = obj.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    reason = delta.get("reasoning_content")
                    content = delta.get("content")
                    if reason:
                        emit({"type": "reasoning", "text": reason})
                    if content:
                        emit({"type": "content", "text": content})
            emit({"type": "done"})
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            emit({"type": "error", "error": "上游返回 %s" % e.code, "detail": detail})
        except Exception as e:
            emit({"type": "error", "error": "上游连接失败：%s" % e})
        finally:
            try:
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except Exception:
                pass
            # 主动结束响应：断连是浏览器判定 SSE 结束的最终信号
            self.close_connection = True


def main(port: int | None = None):
    p = port if port is not None else PORT
    srv = ThreadingHTTPServer((BIND, p), Handler)
    print("AI 助手后端已启动 → http://%s:%d  (model=%s, thinking=%s)" % (BIND, p, MODEL, THINKING))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("已停止")
        srv.server_close()


if __name__ == "__main__":
    arg = None
    if len(sys.argv) > 1:
        try:
            arg = int(sys.argv[1])
        except ValueError:
            pass
    main(arg)
