/* xinmo.work · 提交资源（写入 Supabase tools 表，零依赖） */
(function () {
  'use strict';

  var cfg = window.XINMO_SUPABASE || {};
  var form = document.getElementById('submitForm');
  var btn = document.getElementById('submitBtn');
  var msg = document.getElementById('msg');
  var progress = document.getElementById('progress');
  var who = document.getElementById('who');

  // 显示当前登录账号（会话里带 u）
  try {
    var s = JSON.parse(localStorage.getItem('xinmo_access') || 'null');
    if (s && s.u) who.textContent = s.u;
  } catch (e) {}

  function setMsg(text, ok) {
    msg.textContent = text || '';
    msg.className = 'gate-msg' + (ok ? ' ok' : '');
  }

  function endpoint() {
    return String(cfg.url || '').replace(/\/+$/, '') + '/rest/v1/' + (cfg.table || 'tools');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = document.getElementById('fName').value.trim();
    var url = document.getElementById('fUrl').value.trim();
    var desc = document.getElementById('fDesc').value.trim();

    if (!name) return setMsg('请填写资源名称');
    if (!/^https?:\/\//i.test(url)) return setMsg('链接需以 http:// 或 https:// 开头');
    if (name.length > 80) return setMsg('名称请控制在 80 字以内');
    if (desc.length > 500) return setMsg('简介请控制在 500 字以内');
    if (!cfg.url || !cfg.key) return setMsg('站点未配置 Supabase，请联系站主');

    btn.disabled = true;
    setMsg('');
    progress.textContent = '正在提交…';

    fetch(endpoint(), {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify([{ name: name, url: url, description: desc }])
    }).then(function (r) {
      if (r.ok) {
        form.reset();
        progress.textContent = '';
        setMsg('提交成功！刷新首页就能看到你的资源了。', true);
        return;
      }
      return r.text().then(function (t) {
        throw new Error('HTTP ' + r.status + ' ' + String(t || '').slice(0, 180));
      });
    }).catch(function (err) {
      progress.textContent = '';
      setMsg('提交失败：' + (err && err.message ? err.message : '网络错误') +
        '（若提示 permission denied，请站主在 Supabase 补 GRANT / RLS 策略）');
    }).then(function () {
      btn.disabled = false;
    });
  });
})();
