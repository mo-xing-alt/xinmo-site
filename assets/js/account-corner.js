/* ============================================================
 * xinmo.work · 右上角账号入口（通用注入组件）
 * ------------------------------------------------------------
 * 自动在页面右上角 header 追加：未登录显示「注册」「登录」，
 * 已登录显示用户名（链到用户中心）。依赖现有 localStorage.xinmo_access。
 * 只需在页面引入本脚本，无需改 header HTML。
 * ============================================================ */
(function () {
  "use strict";

  function session() {
    try { return JSON.parse(localStorage.getItem("xinmo_access") || "null"); }
    catch (e) { return null; }
  }
  function loggedIn() {
    var s = session();
    return !!(s && s.u && (!s.exp || s.exp > Date.now()));
  }
  function rootPrefix() {
    var s = document.currentScript || (function () {
      var ss = document.getElementsByTagName("script");
      return ss[ss.length - 1];
    })();
    var src = (s && s.src) || "";
    // 本脚本位于 assets/js/，站点根目录是其上两级
    var i = src.lastIndexOf("assets/js/account-corner.js");
    if (i >= 0) return src.slice(0, i);
    return "./";
  }

  // 自带样式，避免依赖各页主题 CSS（有的用 site.css，有的用 red.css）
  function ensureStyle() {
    if (document.getElementById("xm-acct-style")) return;
    var st = document.createElement("style");
    st.id = "xm-acct-style";
    st.textContent =
      ".xm-account-corner{display:inline-flex;align-items:center;gap:8px;margin-left:auto;white-space:nowrap}" +
      ".xm-account-corner a{font-size:13px;padding:6px 13px;border-radius:999px;" +
      "border:1px solid currentColor;text-decoration:none;line-height:1.4;display:inline-block;" +
      "opacity:.92;transition:opacity .18s ease,transform .18s ease}" +
      ".xm-account-corner a:hover{opacity:1;transform:translateY(-1px)}" +
      ".xm-account-corner .xm-acct-reg{background:#bc141b;border-color:#bc141b;color:#fff}" +
      ".xm-acct-link{max-width:160px;overflow:hidden;text-overflow:ellipsis}";
    document.head.appendChild(st);
  }

  function inject() {
    var prefix = rootPrefix();
    var header = document.querySelector(".header-tools") || document.querySelector(".site-header .shell") || document.querySelector("header .shell") || document.querySelector("header");
    if (!header) return;
    ensureStyle();

    // 幂等
    if (document.getElementById("xm-account-corner")) return;

    var box = document.createElement("div");
    box.id = "xm-account-corner";
    box.className = "xm-account-corner";

    var s = session();
    if (loggedIn()) {
      var name = (s && s.u) ? String(s.u) : "我的账号";
      var a = document.createElement("a");
      a.className = "header-link xm-acct-link";
      a.href = prefix + "me.html";
      a.textContent = "👤 " + name;
      a.title = "进入用户中心";
      box.appendChild(a);
    } else {
      var reg = document.createElement("a");
      reg.className = "header-link xm-acct-reg";
      reg.href = prefix + "register.html";
      reg.textContent = "注册";
      var login = document.createElement("a");
      login.className = "header-link xm-acct-login";
      login.href = prefix + "login.html";
      login.textContent = "登录";
      box.appendChild(reg);
      box.appendChild(login);
    }
    header.appendChild(box);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
  else inject();
})();
