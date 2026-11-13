/* ============================================================
 * xinmo.work · 自助注册账号通道（Supabase RPC）
 * ------------------------------------------------------------
 * 依赖：supabase-config.js；注册/登录还需要 auth-config.js + auth-core.js。
 * 密码永远不出浏览器：前端用 PBKDF2(210000) 派生哈希，数据库只存盐与哈希，
 * 且 members 表不给 anon 直读权限，只能通过 security definer 函数访问。
 * ============================================================ */
window.XinmoMembers = (function () {
  'use strict';

  var conf = window.XINMO_SUPABASE || {};
  var BASE = String(conf.url || '').replace(/\/+$/, '');
  var KEY = conf.key || '';

  function rpc(name, args) {
    if (!BASE || !KEY) {
      return Promise.resolve({ ok: false, reason: 'uninitialized', error: '站点尚未配置数据库' });
    }
    return fetch(BASE + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args || {})
    }).then(function (resp) {
      return resp.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) {}
        if (!resp.ok) {
          var msg = (data && (data.message || data.error || data.hint)) || ('HTTP ' + resp.status);
          // 站主还没在 Supabase 执行建表 SQL 时，PostgREST 会返回 404 找不到函数
          var missing = resp.status === 404 && /function|schema cache|Could not find/i.test(String(msg));
          return {
            ok: false,
            reason: missing ? 'uninitialized' : 'network',
            error: missing ? '站主尚未开通自助注册' : msg
          };
        }
        return (data && typeof data === 'object') ? data
          : { ok: false, reason: 'network', error: '数据库返回格式异常' };
      });
    }).catch(function () {
      return { ok: false, reason: 'network', error: '连接失败，请检查网络后重试' };
    });
  }

  function normalize(name) {
    return String(name == null ? '' : name).trim().toLowerCase();
  }

  function validName(name) {
    var n = normalize(name);
    return n.length >= 2 && n.length <= 32 && n === n.toLowerCase()
      && !/[\s:@<>]/.test(n) && !/[\u0000-\u001f]/.test(n);
  }

  function randomSalt() {
    if (!window.crypto || !crypto.getRandomValues) throw new Error('当前不是安全连接');
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    var out = [];
    for (var i = 0; i < a.length; i++) out.push(('0' + a[i].toString(16)).slice(-2));
    return out.join('');
  }

  function iterations() {
    return (window.XINMO_ACCESS && window.XINMO_ACCESS.iterations) || 210000;
  }

  function sessionDays() {
    return (window.XINMO_ACCESS && window.XINMO_ACCESS.sessionDays) || 7;
  }

  function derive(password, salt) {
    if (!window.crypto || !crypto.subtle || !window.XinmoAuth) {
      return Promise.reject(new Error('insecure'));
    }
    return window.XinmoAuth.pbkdf2Hex(password, salt, iterations());
  }

  /* 判断一个名字是否属于早期「站主线下分配」的账号（auth-config.js 里只有哈希）。
     命中时禁止走自助注册通道，避免有人注册同名账号用自己的密码顶掉老账号。 */
  function isLegacyName(name) {
    var cfg = window.XINMO_ACCESS;
    if (!cfg || !cfg.accounts || !cfg.gate || !window.XinmoAuth) {
      return Promise.resolve(false);
    }
    return window.XinmoAuth.sha256Hex(normalize(name) + ':' + cfg.gate).then(function (h) {
      for (var i = 0; i < cfg.accounts.length; i++) {
        if (cfg.accounts[i].u === h) return true;
      }
      return false;
    }).catch(function () { return false; });
  }

  /* 写入与登录门兼容的会话；guard.js 只校验 t / exp。 */
  function openSession(name, key) {
    var cfg = window.XINMO_ACCESS;
    if (!cfg || !cfg.gate) return false;
    try {
      localStorage.setItem('xinmo_access', JSON.stringify({
        t: cfg.gate,
        u: normalize(name),
        exp: Date.now() + sessionDays() * 86400000,
        k: key
      }));
      return true;
    } catch (e) { return false; }
  }

  function register(name, password) {
    var n = normalize(name);
    if (!validName(n)) {
      return Promise.resolve({ ok: false, reason: 'bad', error: '账号名需 2–32 位，不能含空格、: @ < >，字母请用小写' });
    }
    if (!password || String(password).length < 8) {
      return Promise.resolve({ ok: false, reason: 'bad', error: '密码至少 8 位，建议 12 位以上' });
    }
    var salt;
    try { salt = randomSalt(); }
    catch (e) { return Promise.resolve({ ok: false, reason: 'insecure', error: '请用 https 打开本站' }); }
    return derive(password, salt).then(function (hash) {
      return rpc('member_register', { p_name: n, p_salt: salt, p_hash: hash }).then(function (r) {
        return r.ok ? { ok: true, name: n, key: hash } : r;
      });
    }).catch(function () {
      return { ok: false, reason: 'insecure', error: '请用 https 打开本站' };
    });
  }

  function login(name, password) {
    var n = normalize(name);
    if (!n || !password) return Promise.resolve({ ok: false, reason: 'bad' });
    return rpc('member_salt', { p_name: n }).then(function (s) {
      if (!s.ok) return { ok: false, reason: s.reason || 'bad' };
      return derive(password, s.salt).then(function (hash) {
        return rpc('member_verify', { p_name: n, p_hash: hash }).then(function (r) {
          return r.ok ? { ok: true, name: n, key: hash } : { ok: false, reason: r.reason || 'bad' };
        });
      });
    }).catch(function () {
      return { ok: false, reason: 'insecure', error: '请用 https 打开本站' };
    });
  }

  function list(secret) {
    return rpc('member_list', { p_secret: String(secret || '') });
  }

  function setStatus(secret, id, status) {
    return rpc('member_set_status', { p_secret: String(secret || ''), p_id: id, p_status: status });
  }

  return {
    rpc: rpc,
    normalize: normalize,
    validName: validName,
    iterations: iterations,
    isLegacyName: isLegacyName,
    openSession: openSession,
    register: register,
    login: login,
    list: list,
    setStatus: setStatus
  };
})();
