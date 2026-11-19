/* xinmo.work · 证书页渲染
 * 读取 window.CERT_DATA，生成证书卡片。三类内容：题目 / 经验 / 资料。
 */
(function () {
  "use strict";
  var D = window.CERT_DATA || { certs: [] };

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

  var KINDS = [
    { key: "questions", label: "题目", icon: "✎", cls: "q" },
    { key: "experience", label: "经验", icon: "✦", cls: "e" },
    { key: "materials", label: "资料", icon: "▤", cls: "m" },
  ];

  function itemHTML(it) {
    var hasLink = it && (it.url || it.file);
    var href = it.file
      ? "./resources/certificates/" + encodeURIComponent(it.file)
      : (it.url || "");
    var inner =
      '<span class="cert-item-title">' + esc(it.title || "未命名") + "</span>" +
      (it.desc ? '<span class="cert-item-desc">' + esc(it.desc) + "</span>" : "");
    if (!hasLink) {
      return '<div class="cert-item is-soon">' + inner + '<span class="cert-soon">整理中</span></div>';
    }
    var external = /^https?:\/\//.test(href);
    return '<a class="cert-item" href="' + esc(href) + '"' +
      (external ? ' target="_blank" rel="noopener"' : "") + ">" + inner +
      '<span class="cert-go">↗</span></a>';
  }

  function count(c, key) { return (c[key] || []).length; }

  function cardHTML(c) {
    var total = KINDS.reduce(function (n, k) { return n + count(c, k.key); }, 0);
    var cards = KINDS.map(function (k) {
      var list = c[k.key] || [];
      var body = list.length
        ? list.map(itemHTML).join("")
        : '<div class="cert-item is-soon"><span class="cert-item-desc">暂无内容</span></div>';
      return '<section class="cert-kind">' +
        '<h4 class="cert-kind-h ' + k.cls + '"><span class="cert-kind-ico">' + k.icon + '</span>' +
        k.label + '<span class="cert-kind-num">' + list.length + "</span></h4>" +
        '<div class="cert-items">' + body + "</div></section>";
    }).join("");

    var tags = (c.tags || []).map(function (t) { return '<span class="cert-tag">' + esc(t) + "</span>"; }).join("");

    return '<article class="cert-card accent-' + esc(c.accent || "indigo") + '" data-name="' +
      esc(((c.name || "") + " " + (c.full || "") + " " + (c.tags || []).join(" ")).toLowerCase()) + '">' +
      '<div class="cert-card-head">' +
        '<div class="cert-card-ico">' + (c.icon || "📘") + "</div>" +
        '<div class="cert-card-title"><h3>' + esc(c.name || "未命名证书") + "</h3>" +
        (c.full ? '<p class="cert-full">' + esc(c.full) + "</p>" : "") + "</div>" +
        '<span class="cert-total">' + total + " 条</span>" +
      "</div>" +
      (c.desc ? '<p class="cert-card-desc">' + esc(c.desc) + "</p>" : "") +
      (tags ? '<div class="cert-tags">' + tags + "</div>" : "") +
      '<div class="cert-kinds">' + cards + "</div>" +
      "</article>";
  }

  function render() {
    var grid = document.getElementById("certGrid");
    if (!grid) return;
    var q = (document.getElementById("certSearch").value || "").trim().toLowerCase();
    var list = (D.certs || []).filter(function (c) {
      if (!q) return true;
      return ((c.name || "") + " " + (c.full || "") + " " + (c.tags || []).join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    grid.innerHTML = list.map(cardHTML).join("");
    document.getElementById("certEmpty").hidden = list.length > 0;
    document.getElementById("certCount").textContent = list.length
      ? "共 " + list.length + " 个证书" : "";
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (D.intro) document.getElementById("certIntro").textContent = D.intro;
    var s = document.getElementById("certSearch");
    if (s) s.addEventListener("input", render);
    document.querySelectorAll("[data-year]").forEach(function (e) { e.textContent = new Date().getFullYear(); });
    render();
  });
})();
