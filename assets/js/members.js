/* ============================================================
 * xinmo.work · 账号中心共用逻辑（v2：注册 / 审核 / 邀请 / 权限分级）
 * ------------------------------------------------------------
 * 依赖：supabase-config.js；涉及密码运算的页面还要 auth-config.js + auth-core.js。
 * 密码永远不出浏览器：PBKDF2(210000) 派生后只上传哈希 + 随机盐。
 * 数据库不存明文密码，账号表不给 anon 直读权限，只能走 security definer 函数。
 * ============================================================ */
window.XinmoMembers = (function () {
  'use strict';

  var conf = window.XINMO_SUPABASE || {};
  var BASE = String(conf.url || '').replace(/\/+$/, '');
  var KEY = conf.key || '';
  var SESSION_KEY = 'xinmo_access';

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
          var missing = resp.status === 404 && /function|schema cache|Could not find/i.test(String(msg));
          return {
            ok: false,
            reason: missing ? 'uninitialized' : 'network',
            error: missing ? '站主尚未初始化账号数据库' : msg
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

  function randInt(n) {
    if (!n || n <= 0) return 0;
    var limit = 4294967296 - (4294967296 % n);
    var buf = new Uint32Array(1), v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return v % n;
  }

  function randomSalt() {
    if (!window.crypto || !crypto.getRandomValues) throw new Error('insecure');
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    var out = [];
    for (var i = 0; i < a.length; i++) out.push(('0' + a[i].toString(16)).slice(-2));
    return out.join('');
  }

  /* 随机强密码：默认 16 位，必定含大写、小写、数字、符号各至少一个 */
  function strongPassword(len) {
    if (!window.crypto || !crypto.getRandomValues) throw new Error('insecure');
    len = Math.max(12, len || 16);
    var sets = ['abcdefghjkmnpqrstuvwxyz', 'ABCDEFGHJKMNPQRSTUVWXYZ',
                '23456789', '!@#$%&*-_=+?'];
    var all = sets.join(''), out = [];
    sets.forEach(function (s) { out.push(s.charAt(randInt(s.length))); });
    while (out.length < len) out.push(all.charAt(randInt(all.length)));
    for (var i = out.length - 1; i > 0; i--) {
      var j = randInt(i + 1), t = out[i];
      out[i] = out[j]; out[j] = t;
    }
    return out.join('');
  }

  function passwordOk(pwd) {
    return typeof pwd === 'string' && pwd.length >= 12
      && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd)
      && /\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd);
  }

  /* 不强制实名：留空时生成一个纯匿名账号名 */
  function randomUsername() {
    if (!window.crypto || !crypto.getRandomValues) throw new Error('insecure');
    var abc = 'abcdefghjkmnpqrstuvwxyz23456789', out = 'u_';
    for (var i = 0; i < 10; i++) out += abc.charAt(randInt(abc.length));
    return out;
  }

  /* 提醒用户别用与自己真实信息有关的名字：拦下最明显的几类 */
  function looksPersonal(name) {
    var n = normalize(name);
    return /^1[3-9]\d{9}$/.test(n)          // 手机号
      || /@/.test(n)                        // 邮箱
      || /^\d{6,18}$/.test(n)              // QQ / 学号 / 证件号
      || /(19|20)\d{2}/.test(n)            // 出生年份 / 生日
      || /(birth|name|real|qq|weixin|phone|mail)/.test(n);
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

  /* 老账号（auth-config.js 里只有哈希）不允许被自助注册同名顶掉 */
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

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function openSession(name, key, status, level) {
    var cfg = window.XINMO_ACCESS;
    if (!cfg || !cfg.gate) return false;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        t: cfg.gate,
        u: normalize(name),
        exp: Date.now() + sessionDays() * 86400000,
        k: key,
        status: status || 'active',
        level: (typeof level === 'number' ? level : 2)
      }));
      return true;
    } catch (e) { return false; }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /* 注册：有邀请码 → 直接激活；无邀请码 → 待审核 */
  function register(p) {
    var n = normalize(p.name) || randomUsername();
    if (!validName(n)) {
      return Promise.resolve({ ok: false, reason: 'bad', error: '账号名需 2–32 位，不能含空格、: @ < >，字母请用小写' });
    }
    if (!passwordOk(p.password)) {
      return Promise.resolve({ ok: false, reason: 'bad', error: '密码至少 12 位，且要同时含大写、小写、数字和符号' });
    }
    var src = String(p.source || '');
    if (['friend', 'search', 'social', 'other'].indexOf(src) < 0) {
      return Promise.resolve({ ok: false, reason: 'bad', error: '请选择你是怎么知道本站的' });
    }
    if (src === 'friend' && !normalize(p.sourceFriend)) {
      return Promise.resolve({ ok: false, reason: 'bad', error: '听朋友说起的，请填写那位朋友的账号名' });
    }
    var salt;
    try { salt = randomSalt(); }
    catch (e) { return Promise.resolve({ ok: false, reason: 'insecure', error: '请用 https 打开本站' }); }

    return derive(p.password, salt).then(function (hash) {
      return rpc('member_register', {
        p_name: n,
        p_salt: salt,
        p_hash: hash,
        p_source: src,
        p_source_note: String(p.sourceNote || '').slice(0, 300),
        p_source_friend: src === 'friend' ? normalize(p.sourceFriend) : '',
        p_invite_code: normalize(p.inviteCode)
      }).then(function (r) {
        if (!r.ok) return r;
        openSession(n, hash, r.status, r.level);
        return {
          ok: true, name: n, status: r.status, level: r.level,
          password: p.password, key: hash
        };
      });
    }).catch(function () {
      return { ok: false, reason: 'insecure', error: '请用 https 打开本站' };
    });
  }

  /* 登录：返回 status / level，由页面与 guard.js 决定能去哪 */
  function login(name, password) {
    var n = normalize(name);
    if (!n || !password) return Promise.resolve({ ok: false, reason: 'bad' });
    return rpc('member_salt', { p_name: n }).then(function (s) {
      if (!s.ok) return { ok: false, reason: s.reason || 'bad', error: s.error };
      return derive(password, s.salt).then(function (hash) {
        return rpc('member_login', { p_name: n, p_hash: hash }).then(function (r) {
          if (!r.ok) return { ok: false, reason: r.reason || 'bad', error: r.error };
          openSession(n, hash, r.status, r.level);
          return { ok: true, name: n, key: hash, status: r.status, level: r.level };
        });
      });
    }).catch(function () {
      return { ok: false, reason: 'insecure', error: '请用 https 打开本站' };
    });
  }

  function me() {
    var s = session();
    if (!s || !s.u || !s.k || !/^[0-9a-f]{64}$/.test(s.k)) {
      return Promise.resolve({ ok: false, reason: 'nosession', error: '请先登录' });
    }
    return rpc('member_me', { p_name: s.u, p_hash: s.k });
  }
  function reply(body) {
    var s = session();
    if (!s || !s.u || !s.k) return Promise.resolve({ ok: false, error: '请先登录' });
    return rpc('member_reply', { p_name: s.u, p_hash: s.k, p_body: String(body || '') });
  }

  function adminOverview(secret) { return rpc('admin_overview', { p_secret: String(secret || '') }); }
  function adminReview(secret, id, action, level, note) {
    return rpc('admin_review', {
      p_secret: String(secret || ''), p_id: id, p_action: action,
      p_level: level || 1, p_note: String(note || '')
    });
  }
  function adminInviteCreate(secret, o) {
    return rpc('admin_invite_create', {
      p_secret: String(secret || ''),
      p_grant_level: o.level || 2,
      p_max_uses: o.uses || 1,
      p_days: o.days || 30,
      p_inviter: String(o.inviter || ''),
      p_note: String(o.note || '')
    });
  }
  function adminInviteRevoke(secret, code) {
    return rpc('admin_invite_revoke', { p_secret: String(secret || ''), p_code: code });
  }
  function adminMessage(secret, id, body) {
    return rpc('admin_message', { p_secret: String(secret || ''), p_member_id: id, p_body: String(body || '') });
  }
  function adminRead(secret) { return rpc('admin_read', { p_secret: String(secret || '') }); }
  function adminNetwork(secret) { return rpc('admin_network', { p_secret: String(secret || '') }); }

  var LEVELS = { 0: '无权限', 1: '普通成员', 2: '核心朋友', 9: '站主' };
  var STATUS = { pending: '待审核', active: '已激活', rejected: '未通过', disabled: '已停用' };
  var SOURCES = { friend: '朋友介绍', search: '搜索到', social: '社交媒体', other: '其他', invite: '邀请链接' };
  function levelName(v) { return LEVELS[v] || '无权限'; }
  function statusName(v) { return STATUS[v] || v; }
  function sourceName(v) { return SOURCES[v] || '—'; }

  return {
    rpc: rpc, normalize: normalize, validName: validName,
    strongPassword: strongPassword, passwordOk: passwordOk,
    randomUsername: randomUsername, looksPersonal: looksPersonal,
    iterations: iterations, isLegacyName: isLegacyName,
    session: session, openSession: openSession, clearSession: clearSession,
    register: register, login: login, me: me, reply: reply,
    adminOverview: adminOverview, adminReview: adminReview,
    adminInviteCreate: adminInviteCreate, adminInviteRevoke: adminInviteRevoke,
    adminMessage: adminMessage, adminRead: adminRead, adminNetwork: adminNetwork,
    levelName: levelName, statusName: statusName, sourceName: sourceName
  };
})();
