/* ============================================================
 * xinmo.work · 动态功能前端公共库
 * ------------------------------------------------------------
 * 封装：登录态读取、动态 API 调用（评论/点赞/收藏/主页/搜索）。
 * API 地址默认同域 /api（VPS 全托管时），可用 window.XINMO_API_BASE 覆盖。
 * 登录态复用 localStorage.xinmo_access = { u, k, ... }，不引入新账号。
 * ============================================================ */
(function () {
  "use strict";
  if (window.XinmoDynamic) return;

  var API = (window.XINMO_API_BASE || "").replace(/\/$/, "") + "/api";

  function session() {
    try { return JSON.parse(localStorage.getItem("xinmo_access") || "null"); }
    catch (e) { return null; }
  }
  function loggedIn() {
    var s = session();
    return !!(s && s.u && s.k && /^[0-9a-f]{64}$/.test(s.k) && (!s.exp || s.exp > Date.now()));
  }
  function creds() {
    var s = session();
    return s ? { u: s.u, k: s.k } : {};
  }

  function request(path, opts) {
    opts = opts || {};
    var url = API + path;
    var init = { method: opts.method || "GET", headers: { "Accept": "application/json" } };
    if (opts.method === "POST") {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body || {});
    }
    var ctrl = null, timer = null;
    if (window.AbortController) {
      ctrl = new AbortController();
      init.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, 15000);
    }
    return fetch(url, init)
      .then(function (r) { return r.json(); })
      .then(function (j) { if (timer) clearTimeout(timer); return j; })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        return { ok: false, error: "连接失败，请稍后再试" };
      });
  }

  function withAuth(body) {
    var c = creds();
    return Object.assign({}, body, c);
  }

  var api = {
    health: function () { return request("/health"); },
    comments: function (target, before) {
      var q = "?target=" + encodeURIComponent(target);
      var c = creds();
      if (c.u) q += "&u=" + encodeURIComponent(c.u) + "&k=" + encodeURIComponent(c.k);
      if (before) q += "&before=" + before;
      return request("/comments" + q);
    },
    addComment: function (target, body, parentId) {
      return request("/comment", { method: "POST", body: withAuth({
        target: target, body: body, parent_id: parentId || null
      })});
    },
    deleteComment: function (id) {
      return request("/comment-delete", { method: "POST", body: withAuth({ id: id }) });
    },
    like: function (type, id) {
      return request("/like", { method: "POST", body: withAuth({ type: type, id: id }) });
    },
    favorite: function (target) {
      return request("/favorite", { method: "POST", body: withAuth({ target: target }) });
    },
    favorites: function () {
      var c = creds();
      return request("/favorites?u=" + encodeURIComponent(c.u || "") + "&k=" + encodeURIComponent(c.k || ""));
    },
    profile: function (target) {
      var c = creds(), q = "?target=" + encodeURIComponent(target);
      if (c.u) q += "&u=" + encodeURIComponent(c.u) + "&k=" + encodeURIComponent(c.k);
      return request("/profile" + q);
    },
    saveProfile: function (data) {
      return request("/profile", { method: "POST", body: withAuth(data) });
    },
    search: function (q) { return request("/search?q=" + encodeURIComponent(q)); },
    // 公开资源目录（来自 resources.js）的本地搜索，供站内搜索页组合使用
    localResources: function () { return window.RESOURCE_CATALOG ? window.RESOURCE_CATALOG.items || [] : []; }
  };

  window.XinmoDynamic = {
    api: api,
    session: session,
    loggedIn: loggedIn,
    creds: creds,
    requireLogin: function (redirect) {
      if (loggedIn()) return true;
      if (redirect !== false) {
        location.href = "./login.html?next=" + encodeURIComponent(location.pathname + location.search);
      }
      return false;
    }
  };
})();
