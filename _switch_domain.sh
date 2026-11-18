#!/usr/bin/env bash
# 切主域：在 Caddy 里加入 xinmo.work / www.xinmo.work 站点（与 stage 共用同一套配置）。
# 前提：DNS 已把 xinmo.work / www.xinmo.work 的 A 记录指向本机 IP。
set -u

echo "=== 1) 备份 Caddyfile ==="
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.switch.$(date +%s)

echo "=== 2) 写入主域站点块（若不存在）==="
sudo python3 - <<'PYEOF'
p = '/etc/caddy/Caddyfile'
s = open(p, encoding='utf-8').read()

block = '''

# xinmo.work 主域（VPS 全托管，静态站 + 动态 API）
xinmo.work, www.xinmo.work {
    encode gzip

    @api path /api/*
    handle @api {
        reverse_proxy 127.0.0.1:8790 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    handle {
        root * /var/www/xinmo-site
        file_server
    }
}
'''

# 幂等：已有主域块则跳过
if 'xinmo.work, www.xinmo.work {' in s:
    print('主域块已存在，跳过写入')
else:
    s = s.rstrip() + '\n' + block
    open(p, 'w', encoding='utf-8').write(s)
    print('已写入主域块')
PYEOF

echo "=== 3) 验证配置 ==="
if caddy validate --config /etc/caddy/Caddyfile 2>&1; then
  echo "配置有效，重载 Caddy..."
  sudo systemctl reload caddy && echo "reload 成功"
else
  echo "配置无效！已备份，未 reload。请查看报错。"
fi

echo "=== 4) 服务状态 ==="
sudo systemctl is-active caddy
sudo systemctl is-active dynamic-api

echo "=== 5) 本机自检 ==="
curl -sS --max-time 10 -H "Host: xinmo.work" http://127.0.0.1/api/health || true
echo ""
echo "=== DONE ==="
echo "若 DNS 已切到本机，公网 https://xinmo.work 与 https://xinmo.work/api/health 应可访问。"
