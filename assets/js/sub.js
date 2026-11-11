/* 子模块专题页 · 本地笔记与交互
   笔记只写入 localStorage，不上传服务器 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.body;
  var pageId = root.dataset.page || "note";
  var storeKey = "xinmo-note-" + pageId;

  function read() {
    try {
      var raw = localStorage.getItem(storeKey);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function write(arr) {
    try {
      localStorage.setItem(storeKey, JSON.stringify(arr));
      return true;
    } catch (e) {
      return false;
    }
  }

  function fmt(ts) {
    var d = new Date(ts);
    function p(n) { return n < 10 ? "0" + n : "" + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function initNotebook() {
    var form = document.getElementById("noteForm");
    var list = document.getElementById("noteList");
    var titleInput = document.getElementById("noteTitle");
    var bodyInput = document.getElementById("noteBody");
    var status = document.getElementById("noteStatus");
    var count = document.getElementById("noteCount");
    var clearBtn = document.getElementById("noteClear");
    if (!form || !list) return;

    var notes = read();

    function render() {
      list.innerHTML = "";
      if (count) count.textContent = String(notes.length);
      if (!notes.length) {
        var empty = document.createElement("li");
        empty.className = "nb-empty";
        empty.innerHTML = "还没有笔记。<br>把你刚学到的概念、踩过的坑、想记住的结论写进来，<br>下次打开这一页它还在。";
        list.appendChild(empty);
        return;
      }
      notes.slice().sort(function (a, b) { return b.ts - a.ts; }).forEach(function (n) {
        var li = document.createElement("li");
        li.className = "nb-note";
        li.innerHTML =
          "<h3>" + escapeHtml(n.title) + "</h3>" +
          "<p>" + escapeHtml(n.body) + "</p>" +
          "<time>" + fmt(n.ts) + "</time>" +
          '<button class="del" type="button" aria-label="删除这条笔记" data-id="' + n.id + '">×</button>';
        list.appendChild(li);
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var title = (titleInput.value || "").trim();
      var body = (bodyInput.value || "").trim();
      if (!title && !body) {
        if (status) status.textContent = "标题和内容至少写一项。";
        return;
      }
      notes.push({
        id: String(Date.now()) + Math.random().toString(16).slice(2, 6),
        title: title || "未命名笔记",
        body: body,
        ts: Date.now(),
      });
      if (write(notes)) {
        titleInput.value = "";
        bodyInput.value = "";
        if (status) status.textContent = "已保存到本机浏览器。";
        render();
      } else if (status) {
        status.textContent = "浏览器禁止本地存储（无痕模式？），这次没能保存。";
      }
    });

    list.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-id]");
      if (!btn) return;
      notes = notes.filter(function (n) { return n.id !== btn.dataset.id; });
      write(notes);
      if (status) status.textContent = "已删除。";
      render();
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        if (!notes.length) return;
        if (!window.confirm("确定清空本页全部笔记？此操作不可撤销。")) return;
        notes = [];
        write(notes);
        if (status) status.textContent = "已清空。";
        render();
      });
    }

    render();
  }

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
    Array.prototype.forEach.call(items, function (n) { io.observe(n); });
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (n) {
      n.textContent = String(new Date().getFullYear());
    });
  }

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
    initNotebook();
    initFrameLinks();
    initReveal();
    initYear();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
