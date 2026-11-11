#!/usr/bin/env bash
# ============================================================
# RiskGuard 一键部署脚本（在 VPS 上以 root 运行）
# ------------------------------------------------------------
# 前置：把 riskguard-backend/ 整个目录放到 /opt/riskguard/riskguard-backend
# 用法：sudo DOMAIN=rg.xinmo.work bash install.sh
# 幂等：重复运行不会覆盖已生成的 riskguard.env / 管理员密码
# ============================================================
set -euo pipefail

DOMAIN="${DOMAIN:-rg.xinmo.work}"
APP_DIR="/opt/riskguard"
BE_DIR="$APP_DIR/riskguard-backend"
ENV_FILE="$APP_DIR/riskguard.env"
DATA_DIR="$APP_DIR/data"

[ "$(id -u)" = "0" ] || { echo "请用 root 运行（sudo bash install.sh）"; exit 1; }
[ -f "$BE_DIR/server.py" ] || { echo "缺少 $BE_DIR/server.py，请先把后端代码上传到该目录"; exit 1; }

# 清理上次失败留下的 Caddy 源：keyring 文件名不匹配会让 apt update 直接报 NO_PUBKEY 并中止
rm -f /etc/apt/sources.list.d/caddy-stable.list
rm -f /usr/share/keyrings/caddy-stable.gpg

echo "==> 1/6 安装依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 curl gnupg debian-keyring debian-archive-keyring apt-transport-https openssl ca-certificates

echo "==> 2/6 创建低权用户、数据目录与 swap"
id -u riskguard >/dev/null 2>&1 || adduser --disabled-password --gecos "" riskguard
mkdir -p "$DATA_DIR"
chown -R riskguard:riskguard "$APP_DIR"

# 1G 内存机型补 1G swap，避免构建/运行峰值 OOM
if ! swapon --show 2>/dev/null | grep -q .; then
  fallocate -l 1G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    已启用 1G swap"
fi

echo "==> 3/6 生成生产环境变量"
if [ ! -f "$ENV_FILE" ]; then
  ADMIN_PWD="$(openssl rand -hex 16)"
  cat > "$ENV_FILE" <<EOF
RISKGUARD_ENV=prod
RISKGUARD_BIND=127.0.0.1
RISKGUARD_PORT=8791
RISKGUARD_DATA=$DATA_DIR
RISKGUARD_ADMIN_PASSWORD=$ADMIN_PWD
RISKGUARD_SEED_DEMO=0
EOF
  chmod 600 "$ENV_FILE"
  chown root:riskguard "$ENV_FILE"
  printf '%s\n' "$ADMIN_PWD" > "$APP_DIR/ADMIN_PASSWORD.txt"
  chmod 600 "$APP_DIR/ADMIN_PASSWORD.txt"
  echo "    已生成初始管理员密码 → $APP_DIR/ADMIN_PASSWORD.txt"
else
  echo "    已存在 $ENV_FILE，保留不动"
fi

echo "==> 4/6 安装并配置 Caddy"
if ! command -v caddy >/dev/null 2>&1; then
  # 注意：keyring 文件名必须与 debian.deb.txt 里的 signed-by 路径一致
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  if ! apt-get update -y || ! apt-get install -y caddy; then
    echo "    官方源安装失败，改用 Ubuntu 自带源重试"
    rm -f /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
  fi
fi
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    encode gzip
    reverse_proxy 127.0.0.1:8791 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
EOF

echo "==> 5/6 注册 systemd 服务"
cat > /etc/systemd/system/riskguard.service <<EOF
[Unit]
Description=RiskGuard 风控控制台
After=network.target

[Service]
Type=simple
User=riskguard
Group=riskguard
WorkingDirectory=$BE_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/python3 $BE_DIR/server.py
Restart=on-failure
RestartSec=5
MemoryMax=512M
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable riskguard
systemctl restart riskguard
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "==> 6/6 运行状态"
sleep 2
systemctl --no-pager --lines=0 status riskguard || true
echo "--- 服务是否 active ---"
echo "caddy: $(systemctl is-active caddy 2>/dev/null || true)"
echo "riskguard: $(systemctl is-active riskguard 2>/dev/null || true)"
echo "--- 端口监听 ---"
ss -lntp 2>/dev/null | grep -E ':80 |:443 |:8791 ' || echo "（80/443/8791 没有监听）"
echo
echo "============================================================"
echo " 部署完成：https://$DOMAIN/"
echo " 管理员：admin"
echo " 初始密码：$APP_DIR/ADMIN_PASSWORD.txt"
echo " 登录后请立即改密，并删除该文件："
echo "   rm -f $APP_DIR/ADMIN_PASSWORD.txt"
echo
echo " 若 HTTPS 证书未签发：确认 $DOMAIN 的 A 记录已指向本机公网 IP，"
echo " 且云厂商安全组 / ufw 已放行 80、443。"
echo "============================================================"
