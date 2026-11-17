#!/usr/bin/env bash
# 新模学习 AI 助手 · VPS 一键安装脚本
# 在 VPS 上以 sudo 运行：sudo bash install.sh
# 前置：已装 Caddy；已在阿里云 DNS 添加 ai → 47.79.16.152 的 A 记录
set -euo pipefail

APP=ai-assistant
DIR=/opt/$APP
SVC=/etc/systemd/system/$APP.service
echo "== 安装 $APP =="

# 1) 系统用户
if ! id -u aiassistant >/dev/null 2>&1; then
  useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin aiassistant
  echo "  + 创建系统用户 aiassistant"
fi

# 2) 代码放到 /opt/ai-assistant（本脚本所在目录即源目录）
mkdir -p "$DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/server.py" "$DIR/server.py"
# env 原地保留：若目标已存在则不覆盖，避免泄露的 Key 被覆盖
if [ ! -f "$DIR/ai-assistant.env" ]; then
  cp "$SCRIPT_DIR/ai-assistant.env" "$DIR/ai-assistant.env"
fi
chown -R aiassistant:aiassistant "$DIR"
chmod 600 "$DIR/ai-assistant.env"
echo "  + 代码已放到 $DIR"

# 3) systemd
cp "$SCRIPT_DIR/ai-assistant.service" "$SVC"
systemctl daemon-reload
systemctl enable --now "$APP"
echo "  + systemd 已启用并启动"

# 4) Caddy 反代（幂等：若已含 ai.xinmo.work 块则跳过）
if grep -q 'ai.xinmo.work' /etc/caddy/Caddyfile 2>/dev/null; then
  echo "  = Caddyfile 已含 ai.xinmo.work，跳过追加"
else
  cat "$SCRIPT_DIR/Caddyfile-snippet" >> /etc/caddy/Caddyfile
  systemctl reload caddy
  echo "  + Caddy 反代已追加并 reload"
fi

echo ""
echo "== 自检 =="
sleep 2
systemctl is-active "$APP" && echo "  服务状态: active" || echo "  服务状态: 异常，请 journalctl -u $APP -f"
curl -sS --max-time 10 http://127.0.0.1:8792/api/health || true
echo ""
echo "完成。公网地址：https://ai.xinmo.work/api/health"
