/* 红色学习门户 · 交互脚本
   轮播 / 金句 / 模块渲染 / 滚动显现，无第三方依赖 */
(function () {
  "use strict";

  var DATA = window.RED || { modules: [], slides: [], quotes: [] };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ 图标 */
  var ICONS = {
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-5 4 5 4M16 8l5 4-5 4M13 5l-2 14"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 5.6a5.4 5.4 0 0 0-7.7 0L12 6.7l-1.1-1.1a5.4 5.4 0 1 0-7.7 7.7L12 22l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7h6L5 7Zm14 0-3 7h6l-3-7Z"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15c-1.5 3-1 5-1 5s2 .5 5-1M9 15l-3-3c1-6 6-9 12-9 0 6-3 11-9 12Z"/><circle cx="15" cy="9" r="1.6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9 2.9-6Z"/></svg>',
  };

  window.RED_ICONS = ICONS;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ------------------------------------------------------------ 金句 */
  function initQuotes() {
    var box = document.querySelector("[data-quote]");
    if (!box || !DATA.quotes || !DATA.quotes.length) return;
    box.innerHTML = "";
    DATA.quotes.forEach(function (q, i) {
      var s = el("span", i === 0 ? "is-on" : "", q);
      box.appendChild(s);
    });
    var items = Array.prototype.slice.call(box.children);
    var idx = 0;
    if (reduceMotion) return;
    setInterval(function () {
      items[idx].classList.remove("is-on");
      idx = (idx + 1) % items.length;
      items[idx].classList.add("is-on");
    }, 5200);
  }

  function initDate() {
    document.querySelectorAll("[data-today]").forEach(function (n) {
      var d = new Date();
      var week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
      n.textContent = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 · 星期" + week;
    });
    document.querySelectorAll("[data-year]").forEach(function (n) {
      n.textContent = String(new Date().getFullYear());
    });
  }

  /* ------------------------------------------------------------ 通用轮播 */
  function initCarousels() {
    document.querySelectorAll("[data-carousel]").forEach(function (root) {
      var slides = Array.prototype.slice.call(root.querySelectorAll(".carousel-slide"));
      if (slides.length < 2) return;
      var dotsBox = root.querySelector(".carousel-dots");
      var prev = root.querySelector("[data-prev]");
      var next = root.querySelector("[data-next]");
      var cur = 0, timer = null, paused = false;
      var AUTOPLAY = Number(root.dataset.interval || 6000);

      slides.forEach(function (_, i) {
        if (!dotsBox) return;
        var b = el("button", "", "");
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-label", "第 " + (i + 1) + " 张");
        b.setAttribute("aria-selected", i === 0 ? "true" : "false");
        b.addEventListener("click", function () { go(i, true); });
        dotsBox.appendChild(b);
      });

      function go(n, manual) {
        cur = (n + slides.length) % slides.length;
        slides.forEach(function (s, i) { s.classList.toggle("is-active", i === cur); });
        if (dotsBox) {
          Array.prototype.forEach.call(dotsBox.children, function (b, i) {
            b.setAttribute("aria-selected", i === cur ? "true" : "false");
          });
        }
        if (manual) restart();
      }

      function restart() {
        if (timer) clearInterval(timer);
        if (reduceMotion) return;
        timer = setInterval(function () {
          if (!paused && !document.hidden) go(cur + 1, false);
        }, AUTOPLAY);
      }

      if (prev) prev.addEventListener("click", function () { go(cur - 1, true); });
      if (next) next.addEventListener("click", function () { go(cur + 1, true); });

      root.addEventListener("mouseenter", function () { paused = true; });
      root.addEventListener("mouseleave", function () { paused = false; });
      root.addEventListener("focusin", function () { paused = true; });
      root.addEventListener("focusout", function () { paused = false; });

      var startX = null;
      root.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
      root.addEventListener("touchend", function (e) {
        if (startX == null) return;
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 42) go(cur + (dx < 0 ? 1 : -1), true);
        startX = null;
      }, { passive: true });

      root.setAttribute("tabindex", "0");
      root.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1, true); }
        if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1, true); }
      });

      restart();
    });
  }

  /* ------------------------------------------------------------ 首页模块卡片 */
  function initModuleGrid() {
    var grid = document.getElementById("moduleGrid");
    if (!grid) return;
    DATA.modules.forEach(function (m) {
      var card = el("a", "module-card reveal");
      card.href = "./modules/" + m.id + ".html";
      card.setAttribute("data-search", [m.name, m.desc, m.tags.join(" "), m.en].join(" "));
      card.innerHTML =
        '<span class="module-icon">' + (ICONS[m.icon] || ICONS.code) + "</span>" +
        "<h3>" + m.name + "<em>" + m.en + "</em></h3>" +
        "<p>" + m.desc + "</p>" +
        '<div class="module-tags">' + m.tags.map(function (t) { return "<span>" + t + "</span>"; }).join("") + "</div>" +
        '<div class="module-enter"><span>进入模块</span>' + ICONS.arrow + "</div>";
      grid.appendChild(card);
    });
  }

  function initSearch() {
    var input = document.getElementById("siteSearch");
    if (!input) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-search]"));
    var empty = document.getElementById("searchEmpty");
    function apply() {
      var q = input.value.trim().toLowerCase();
      var hits = 0;
      cards.forEach(function (c) {
        var ok = !q || (c.getAttribute("data-search") || "").toLowerCase().indexOf(q) > -1;
        c.hidden = !ok;
        if (ok) hits++;
      });
      if (empty) empty.hidden = hits !== 0;
      var counter = document.getElementById("searchCount");
      if (counter) counter.textContent = q ? "匹配 " + hits + " 项" : "";
    }
    input.addEventListener("input", apply);
    input.form && input.form.addEventListener("submit", function (e) {
      e.preventDefault();
      apply();
      var sec = document.getElementById("modules");
      if (sec) sec.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      input.blur();
    });
  }

  /* ------------------------------------------------------------ 模块页 */
  function moduleById(id) {
    return DATA.modules.filter(function (m) { return m.id === id; })[0];
  }

  function renderModule() {
    var host = document.getElementById("moduleRoot");
    if (!host || !host.dataset.module) return;
    var m = moduleById(host.dataset.module);
    if (!m) return;

    var hero = el("section", "module-hero");
    hero.innerHTML =
      '<p class="crumbs"><a href="../index.html">首页</a> / <a href="../index.html#modules">领域模块</a> / ' + m.name + "</p>" +
      "<h1>" + m.name + '<span class="badge">' + m.en + "</span></h1>" +
      '<p class="lede">' + m.desc + "</p>" +
      '<div class="meta-row">' +
        "<div><b>" + m.people.length + "</b>位人物长廊</div>" +
        "<div><b>" + m.subs.length + "</b>个子模块</div>" +
        '<div class="tagline"><b>' + m.tagline + "</b>模块题记</div>" +
      "</div>";

    var people = el("section", "people reveal");
    people.innerHTML =
      '<div class="people-head"><h2>人物长廊 · 红色的记忆</h2>' +
      '<span class="hint">自动轮播 · 悬停暂停 · 支持 <kbd>←</kbd> <kbd>→</kbd></span></div>' +
      '<div class="people-stage">' +
        '<figure class="people-photo" data-photo></figure>' +
        '<div class="people-copy" data-copy></div>' +
      "</div>" +
      '<div class="people-foot">' +
        '<div class="people-dots" data-dots role="tablist" aria-label="人物切换"></div>' +
        '<div class="people-arrows">' +
          '<span class="people-progress" data-progress>1 / ' + m.people.length + "</span>" +
          '<button type="button" data-prev aria-label="上一位">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>' + "</button>" +
          '<button type="button" data-next aria-label="下一位">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 6 6 6-6 6"/></svg>' + "</button>" +
        "</div>" +
      "</div>";

    var photoBox = people.querySelector("[data-photo]");
    var copyBox = people.querySelector("[data-copy]");
    var assetBase = location.pathname.indexOf("/modules/") > -1 ? "../" : "./";
    m.people.forEach(function (p, i) {
      var layer = el("div", "photo-layer" + (i === 0 ? " is-active" : ""));
      var imgSrc = assetBase + p.img.replace(/^\.\//, "");
      layer.innerHTML =
        '<img class="photo-bg" src="' + imgSrc + '" alt="" aria-hidden="true" loading="lazy">' +
        '<img class="photo-main" src="' + imgSrc + '" alt="' + p.name + ' 影像" loading="' + (i === 0 ? "eager" : "lazy") + '">' +
        '<span class="photo-tag">' + ICONS.star + "红色记忆 · 人物影像</span>" +
        '<span class="photo-credit">图：' + p.credit + "</span>" +
        '<i class="frame-corner tl"></i><i class="frame-corner br"></i>';
      photoBox.appendChild(layer);

      var person = el("div", "person" + (i === 0 ? " is-active" : ""));
      person.innerHTML =
        '<span class="p-role">' + m.name + " · 人物 " + (i + 1) + "</span>" +
        "<h3>" + p.name + "<small>" + p.years + "</small></h3>" +
        '<p class="p-title">' + p.role + "</p>" +
        '<p class="p-bio">' + p.bio + "</p>" +
        (p.quote ? '<p class="p-quote">「' + p.quote + "」</p>" : "") +
        '<div class="p-tags">' + p.tags.map(function (t) { return "<span>" + t + "</span>"; }).join("") + "</div>";
      copyBox.appendChild(person);
    });

    var dots = people.querySelector("[data-dots]");
    var progress = people.querySelector("[data-progress]");
    m.people.forEach(function (p, i) {
      var b = el("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", p.name);
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      b.addEventListener("click", function () { go(i, true); });
      dots.appendChild(b);
    });

    var layers = photoBox.children;
    var persons = copyBox.children;
    var cur = 0, paused = false, timer = null;

    function go(n, manual) {
      cur = (n + layers.length) % layers.length;
      Array.prototype.forEach.call(layers, function (l, i) { l.classList.toggle("is-active", i === cur); });
      Array.prototype.forEach.call(persons, function (p, i) { p.classList.toggle("is-active", i === cur); });
      Array.prototype.forEach.call(dots.children, function (d, i) {
        d.setAttribute("aria-selected", i === cur ? "true" : "false");
      });
      if (progress) progress.textContent = (cur + 1) + " / " + layers.length;
      if (manual) restart();
    }
    function restart() {
      if (timer) clearInterval(timer);
      if (reduceMotion) return;
      timer = setInterval(function () {
        if (!paused && !document.hidden) go(cur + 1, false);
      }, 7600);
    }

    people.querySelector("[data-prev]").addEventListener("click", function () { go(cur - 1, true); });
    people.querySelector("[data-next]").addEventListener("click", function () { go(cur + 1, true); });
    people.addEventListener("mouseenter", function () { paused = true; });
    people.addEventListener("mouseleave", function () { paused = false; });
    people.addEventListener("focusin", function () { paused = true; });
    people.addEventListener("focusout", function () { paused = false; });
    people.setAttribute("tabindex", "0");
    people.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1, true); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1, true); }
    });
    restart();

    var subs = el("section", "section reveal");
    subs.innerHTML =
      '<div class="section-head"><div><h2>子模块 · 分领域深入</h2>' +
      "<p>每个子模块有自己的视觉风格与知识地图，进入后可长期存放学习笔记。</p></div></div>" +
      '<div class="sub-grid">' + m.subs.map(function (s) {
        return '<a class="sub-card ' + s.theme + '" href="' + s.href + '">' +
          '<div><p class="sub-kicker">' + s.en + "</p><h3>" + s.name + "</h3><p>" + s.desc + "</p></div>" +
          '<span class="sub-enter">进入专题' + ICONS.arrow + "</span></a>";
      }).join("") + "</div>";

    var notes = el("section", "learn-note reveal");
    notes.innerHTML = [
      ["01", "先看人，再看事", "人物长廊按时间与贡献排序，先读人物，再看子模块里的技术脉络，会更容易记住知识为什么出现。"],
      ["02", "边学边存", "子模块页自带本地笔记本，笔记只保存在你自己的浏览器里，不上传服务器。"],
      ["03", "照片说明", "人物与地标照片均来自 Wikimedia Commons 自由授权，点击页脚「图片来源」可查看作者与许可。"],
    ].map(function (x) {
      return "<article><h4><span>" + x[0] + "</h4><p>" + x[2] + "</p></article>";
    }).join("");

    host.appendChild(hero);
    host.appendChild(people);
    host.appendChild(subs);
    host.appendChild(notes);
  }

  /* ------------------------------------------------------------ 滚动显现 */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ------------------------------------------------------------ 移动端菜单 */
  function initNav() {
    var btn = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".main-nav");
    if (!btn || !nav) return;
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* 在聊天窗口/预览面板的内嵌框架里，链接可能被沙箱拦成“下载文件”。
     此时把站内链接改成新标签打开，保证模块能被正常浏览。 */
  function initFrameLinks() {
    if (window.top === window.self) return;
    document.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^(https?:|mailto:|javascript:)/i.test(href)) return;
      a.target = "_blank";
      a.rel = "noopener";
    });
  }

  function boot() {
    initQuotes();
    initDate();
    initCarousels();
    initModuleGrid();
    initSearch();
    renderModule();
    initFrameLinks();
    initNav();
    initReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
