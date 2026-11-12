/* 账号校验核心：PBKDF2-HMAC-SHA256，与 deploy/set_access.py 的生成算法一致。
 * 配置文件里只有哈希与随机盐，明文密码不进源码、不进仓库。 */
window.XinmoAuth = (function () {
  'use strict';

  function toHex(buf) {
    var b = new Uint8Array(buf), out = [];
    for (var i = 0; i < b.length; i++) out.push(('0' + b[i].toString(16)).slice(-2));
    return out.join('');
  }

  function fromHex(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function enc(str) { return new TextEncoder().encode(str); }

  function sha256Hex(text) {
    return crypto.subtle.digest('SHA-256', enc(text)).then(toHex);
  }

  function pbkdf2Hex(password, saltHex, iterations) {
    return crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits({
          name: 'PBKDF2',
          salt: fromHex(saltHex),
          iterations: iterations,
          hash: 'SHA-256'
        }, key, 256);
      })
      .then(toHex);
  }

  function secureEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function verify(username, password, cfg) {
    if (!cfg || !cfg.accounts || !cfg.accounts.length) {
      return Promise.resolve({ ok: false, reason: 'unset' });
    }
    if (!window.crypto || !crypto.subtle) {
      return Promise.resolve({ ok: false, reason: 'insecure' });
    }
    var u = String(username).trim().toLowerCase() + ':' + cfg.gate;
    return sha256Hex(u).then(function (uHash) {
      var found = null;
      for (var i = 0; i < cfg.accounts.length; i++) {
        if (secureEqual(cfg.accounts[i].u, uHash)) { found = cfg.accounts[i]; break; }
      }
      if (!found) return { ok: false, reason: 'bad' };
      return pbkdf2Hex(password, found.s, cfg.iterations).then(function (h) {
        return secureEqual(h, found.h)
          ? { ok: true, gate: cfg.gate, days: cfg.sessionDays || 7, key: h }
          : { ok: false, reason: 'bad' };
      });
    });
  }

  return { verify: verify, sha256Hex: sha256Hex, pbkdf2Hex: pbkdf2Hex };
})();
