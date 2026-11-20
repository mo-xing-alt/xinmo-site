/* ============================================================
 * xinmo.work · 轻量移动端导航折叠
 * 只负责 .nav-toggle 点击展开/收起 .main-nav，不依赖 red.js 其他渲染。
 * 适用于未引入 red.js 的独立页面（证书/搜索/个人主页等）。
 * ============================================================ */
(function () {
  "use strict";
  function init() {
    var btn = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".main-nav");
    if (!btn || !nav) return;
    // 幂等：避免与 red.js 的 initNav 重复绑定
    if (btn.dataset.navBound) return;
    btn.dataset.navBound = "1";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = nav.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // 点击菜单里的链接后自动收起
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        nav.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    // 点击外部收起
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("is-open") && !nav.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        nav.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
