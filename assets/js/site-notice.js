/* ============================================================
 * 新模学习 · 全站弹入式公告
 * ------------------------------------------------------------
 * 每位访客首次进入任意页面弹出一次，点「知道了」后记住已读；
 * 之后不再打扰（如需每次都弹，把 ALWAYS_SHOW 改为 true）。
 * 样式在 assets/css/site-notice.css，作用域前缀 xm-notice。
 * ============================================================ */
(function () {
  "use strict";

  var ALWAYS_SHOW = false;              // true = 每次加载页面都弹；false = 每次进入网站弹一次（见 STORE）
  var SEEN_KEY = "xinmo_site_notice_seen";
  // 存储位置：sessionStorage = 每次打开网站弹一次（同一访问内刷新/跳转不重复）；
  //           localStorage   = 每人永久只弹一次。
  var STORE = (typeof sessionStorage !== "undefined") ? sessionStorage : localStorage;
  var MARK_ID = "xm-notice-mask";
  var CSS_HREF_SUFFIX = "assets/css/site-notice.css";

  function prefix() {
    var s = document.querySelector('script[src$="site-notice.js"]');
    var src = s ? s.getAttribute("src") : "";
    var i = src.lastIndexOf("assets/js/site-notice.js");
    return i >= 0 ? src.slice(0, i) : "./";
  }

  function ensureCss(p) {
    if (document.getElementById("xm-notice-style")) return;
    var link = document.createElement("link");
    link.id = "xm-notice-style";
    link.rel = "stylesheet";
    link.href = p + CSS_HREF_SUFFIX;
    document.head.appendChild(link);
  }

  function seen() {
    try { return STORE.getItem(SEEN_KEY) === "1"; } catch (e) { return false; }
  }
  function markSeen() {
    try { STORE.setItem(SEEN_KEY, "1"); } catch (e) {}
  }

  function close() {
    var mask = document.getElementById(MARK_ID);
    if (!mask) return;
    mask.style.opacity = "0";
    setTimeout(function () {
      if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
    }, 200);
  }
  function agree() {
    if (!ALWAYS_SHOW) markSeen();   // 每次都弹模式下不记已读
    close();
  }

  function build() {
    if (document.getElementById(MARK_ID)) return;
    var mask = document.createElement("div");
    mask.id = MARK_ID;
    mask.className = "xm-notice-mask";
    mask.setAttribute("role", "dialog");
    mask.setAttribute("aria-modal", "true");
    mask.setAttribute("aria-labelledby", "xm-notice-title");
    mask.innerHTML =
      '<div class="xm-notice-card" role="document">' +
        '<div class="xm-notice-top">' +
          '<div class="xm-notice-badge" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M12 3l2.2 4.6 5 .7-3.7 3.5.9 5L12 14.6 7.6 16.8l.9-5L4.8 8.3l5-.7z"></path>' +
              '<path d="M12 18v3"></path>' +
            '</svg>' +
          '</div>' +
          '<div class="xm-notice-kicker">使用须知</div>' +
          '<h2 id="xm-notice-title">先装一个 AI 助手，本站工具更好用</h2>' +
        '</div>' +

        '<div class="xm-notice-body">' +
          '<p>本站收集了不少实用工具，来自不同领域的朋友都能用。为了让大家<span class="xm-notice-em">快速上手</span>，' +
          '我们采用的是「<span class="xm-notice-em">人机协同</span>」的方式——你不用自己摸索工具怎么用。</p>' +

          '<p>简单说：请先准备<span class="xm-notice-em">至少一个 AI 智能体（Agent）</span>。' +
          '它就像你的随身小助手，你用大白话告诉它想做什么，它就能带着你用本站的工具，把问题真正解决掉。</p>' +

          '<div class="xm-notice-agents">' +
            '<p class="xm-notice-agents-title">这些都可以，装一个就行：</p>' +
            '<div class="xm-notice-agent-list">' +
              '<span class="xm-notice-agent xm-notice-agent--hot"><i></i>WorkBuddy</span>' +
              '<span class="xm-notice-agent"><i></i>元宝</span>' +
              '<span class="xm-notice-agent"><i></i>豆包</span>' +
              '<span class="xm-notice-agent"><i></i>Kimi</span>' +
              '<span class="xm-notice-agent"><i></i>通义千问</span>' +
              '<span class="xm-notice-agent"><i></i>DeepSeek</span>' +
            '</div>' +
            '<p class="xm-notice-agent-note">装好之后，把你想做的事直接说给它听，让它帮你操作本站工具即可。</p>' +
          '</div>' +
        '</div>' +

        '<div class="xm-notice-foot">' +
          '<button type="button" class="xm-notice-ok" id="xm-notice-ok">知道了，开始使用</button>' +
          '<p class="xm-notice-tip">' + (ALWAYS_SHOW ? '点一下即可关闭，进入本站' : '点一下就好，本次访问不再提示') + '</p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(mask);

    var btn = document.getElementById("xm-notice-ok");
    if (btn) btn.addEventListener("click", agree);
    mask.addEventListener("click", function (e) {
      if (e.target === mask) agree();   // 点遮罩关闭
    });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        agree();
        document.removeEventListener("keydown", onKey);
      }
    });
    if (btn) setTimeout(function () { try { btn.focus(); } catch (e) {} }, 0);
  }

  function start() {
    if (ALWAYS_SHOW || !seen()) {
      ensureCss(prefix());
      build();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
