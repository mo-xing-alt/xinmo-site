#!/usr/bin/env bash
# 修复 Caddy 配置：诊断当前错误，移除有问题的 stage 块，写入简化且验证过的配置。
set -u

echo "=== 1) 当前 Caddy validate 报错 ==="
caddy validate --config /etc/caddy/Caddyfile 2>&1 | head -20 || true

echo ""
echo "=== 2) 备份当前 Caddyfile ==="
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%s) 2>/dev/null || true

echo "=== 3) 移除旧的 stage 块（若有）+ 写入简化配置 ==="
sudo python3 - <<'PYEOF'
p = '/etc/caddy/Caddyfile'
s = open(p, encoding='utf-8').read()
# 删除从 "# xinmo.work 全托管" 注释开始到文件末尾（bootstrap 追加的内容在末尾）
i = s.find('# xinmo.work 全托管')
if i >= 0:
    s = s[:i].rstrip() + '\n'
# 也删除任何已有的 stage.xinmo.work 块（防止重复）
lines = s.split('\n')
out, skip = [], False
for ln in lines:
    if ln.strip().startswith('stage.xinmo.work'):
        skip = True
    if skip and ln.strip() == '}':
        skip = False
        continue
    if not skip:
        out.append(ln)
s = '\n'.join(out).rstrip() + '\n'
# 追加简化配置（去掉 handle_errors 嵌套，避免 reload 失败）
s += '''

# xinmo.work 测试环境（全托管静态站 + 动态 API）
stage.xinmo.work {
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
open(p, 'w', encoding='utf-8').write(s)
print('已写入新配置')
PYEOF

echo ""
echo "=== 4) 验证新配置 ==="
if caddy validate --config /etc/caddy/Caddyfile 2>&1; then
  echo "配置有效，重载 Caddy..."
  sudo systemctl reload caddy && echo "reload 成功"
else
  echo "配置仍无效，请查看上面报错"
fi

echo ""
echo "=== 5) 服务状态 ==="
sudo systemctl is-active caddy || true
