/* ============================================================
 * xinmo.work · 评论区组件（自动挂载）
 * ------------------------------------------------------------
 * 用法：页面里放一个容器 <div id="xm-comments" data-target="tool:xxx"></div>
 * 然后引入本脚本。自动渲染评论列表、发表框、点赞；登录态走 xinmo_access。
 * data-target 为页面唯一标识，如 tool:slotrunner / resource:xxx。
 * ============================================================ */
(function () {
  "use strict";
  if (!window.XinmoDynamic) {
    console.warn("[comments] 需先引入 dynamic.js");
    return;
  }
  var D = window.XinmoDynamic;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

  function mount(el) {
    var target = el.getAttribute("data-target") || location.pathname;
    el.classList.add("xm-comments");
    el.innerHTML =
      '<h2 class="xc-title">评论 <span class="xc-count" id="xcCount"></span></h2>' +
      '<form class="xc-form" id="xcForm">' +
      '<textarea id="xcInput" rows="3" maxlength="1000" placeholder="说点什么…（需登录）"></textarea>' +
      '<div class="xc-form-bar"><span class="xc-hint" id="xcHint"></span>' +
      '<button type="submit" class="dyn-btn" id="xcSend">发表评论</button></div>' +
      "</form>" +
      '<div class="xc-list" id="xcList"><div class="dyn-empty">加载中…</div></div>';

    var list = el.querySelector("#xcList");
    var input = el.querySelector("#xcInput");
    var hint = el.querySelector("#xcHint");
    var send = el.querySelector("#xcSend");

    if (!D.loggedIn()) {
      input.disabled = true;
      send.disabled = true;
      hint.innerHTML = '请先 <a href="./login.html?next=' + encodeURIComponent(location.pathname + location.search) + '">登录</a> 后评论';
    }

    function render(comments) {
      if (!comments.length) {
        list.innerHTML = '<div class="dyn-empty">还没有评论，来抢沙发吧。</div>';
        return;
      }
      list.innerHTML = comments.map(function (c) {
        var avatar = c.avatar && /^(https?:\/\/|data:image\/)/.test(c.avatar)
          ? '<img src="' + esc(c.avatar) + '" alt="" />'
          : esc((c.display_name || c.username || "?").slice(0, 1).toUpperCase());
        return '<div class="xc-item" data-id="' + c.id + '">' +
          '<div class="xc-avatar">' + avatar + "</div>" +
          '<div class="xc-body">' +
          '<div class="xc-meta"><a href="./profile.html?u=' + encodeURIComponent(c.username) + '">' + esc(c.display_name || c.username) + "</a>" +
          '<time>' + esc((c.created_at || "").slice(0, 10)) + "</time></div>" +
          '<p class="xc-text">' + esc(c.body) + "</p>" +
          '<div class="xc-actions">' +
          '<button class="xc-like' + (c.liked_by_me ? " on" : "") + '" data-id="' + c.id + '">♥ <span>' + (c.likes || 0) + "</span></button>" +
          (c.mine ? '<button class="xc-del" data-id="' + c.id + '">删除</button>' : "") +
          "</div></div></div>";
      }).join("");
    }

    function load() {
      D.api.comments(target).then(function (r) {
        render(r.ok ? (r.items || []) : []);
        var cnt = el.querySelector("#xcCount");
        if (cnt) cnt.textContent = r.ok ? (r.items || []).length : "";
      });
    }

    el.querySelector("#xcForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!D.loggedIn()) return;
      var body = input.value.trim();
      if (!body) return;
      send.disabled = true;
      D.api.addComment(target, body).then(function (r) {
        if (r.ok) { input.value = ""; load(); }
        else hint.textContent = r.error || "发表失败";
        send.disabled = false;
      });
    });

    list.addEventListener("click", function (e) {
      var like = e.target.closest(".xc-like");
      if (like) {
        if (!D.loggedIn()) { location.href = "./login.html"; return; }
        D.api.like("comment", like.getAttribute("data-id")).then(function (r) {
          if (r.ok) {
            like.classList.toggle("on", r.liked);
            var sp = like.querySelector("span");
            if (sp) sp.textContent = r.count;
          }
        });
        return;
      }
      var del = e.target.closest(".xc-del");
      if (del && confirm("确定删除这条评论？")) {
        D.api.deleteComment(del.getAttribute("data-id")).then(function (r) {
          if (r.ok) load();
          else alert(r.error || "删除失败");
        });
      }
    });

    load();
  }

  function init() {
    document.querySelectorAll("#xm-comments,[data-xm-comments]").forEach(mount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
