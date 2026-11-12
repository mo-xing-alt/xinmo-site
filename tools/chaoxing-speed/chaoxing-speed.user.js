// ==UserScript==
// @name         xinmo.work · 网页视频倍速
// @namespace    https://xinmo.work/tools/chaoxing-speed/
// @version      2.0.0
// @description  给任意网站的 HTML5 视频加 0.5–16× 悬浮倍速面板：学习通、B站、慕课、YouTube、网盘播放器通用
// @author       xinmo.work
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__XMV_SPEED__) return;
  window.__XMV_SPEED__ = true;

  var KEY_RATE = 'xmv-speed-rate';
  var KEY_POS = 'xmv-speed-pos';
  var KEY_OPEN = 'xmv-speed-open';
  var MIN = 0.1, MAX = 16, DEFAULT = 1;

  function clamp(v) {
    if (!isFinite(v)) return DEFAULT;
    return Math.min(MAX, Math.max(MIN, v));
  }

  var desired = DEFAULT;
  try {
    var saved = parseFloat(localStorage.getItem(KEY_RATE));
    if (isFinite(saved)) desired = clamp(saved);
  } catch (e) {}
  desired = clamp(desired);

  var host = null, root = null;
  var labelEl = null, panelEl = null, presetsEl = null, countEl = null, tipEl = null;
  var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var shadowRoots = [];
  var lastFix = 0;
  var pending = false;
  var visible = false;

  /* ---------- 倍速应用 ---------- */

  function apply(v) {
    if (!v || v.tagName !== 'VIDEO') return;
    try { v.playbackRate = desired; } catch (e) {}
    // 尽量保持音调不变（各浏览器前缀）
    try { v.preservesPitch = true; } catch (e) {}
    try { v.mozPreservesPitch = true; } catch (e) {}
    try { v.webkitPreservesPitch = true; } catch (e) {}
  }

  function applyAll() {
    var list = allVideos();
    for (var i = 0; i < list.length; i++) apply(list[i]);
  }

  /* ---------- 找视频：含 Shadow DOM ---------- */

  function collect(node, out) {
    try {
      var ls = node.querySelectorAll('video');
      for (var i = 0; i < ls.length; i++) {
        if (out.indexOf(ls[i]) < 0) out.push(ls[i]);
      }
    } catch (e) {}
    return out;
  }

  function allVideos() {
    var out = collect(document, []);
    for (var i = 0; i < shadowRoots.length; i++) collect(shadowRoots[i], out);
    return out;
  }

  // 部分播放器把 video 放进 Shadow DOM，拦截 attachShadow 收集
  function hookShadow() {
    if (!window.Element || !Element.prototype.attachShadow) return;
    var orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function () {
      var sr = orig.apply(this, arguments);
      try { if (shadowRoots.indexOf(sr) < 0) shadowRoots.push(sr); } catch (e) {}
      return sr;
    };
  }

  /* ---------- UI ---------- */

  function rateText() {
    var s = desired.toFixed(desired % 1 ? 2 : 0);
    return s.replace(/(\.\d)0$/, '$1') + '×';
  }

  function buildUI() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'xmv-speed-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:88px;z-index:2147483647;display:none;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = [
      '<style>',
      ':host{all:initial}',
      '.wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
      '.pill{display:flex;align-items:center;gap:6px;background:rgba(17,26,44,.92);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:grab;user-select:none;font-size:13px;touch-action:none}',
      '.pill:active{cursor:grabbing}',
      '.pill b{font-size:14px;font-variant-numeric:tabular-nums}',
      '.pill small{opacity:.7;font-size:11px}',
      '.panel{margin-top:8px;background:rgba(17,26,44,.96);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:10px;box-shadow:0 12px 30px rgba(0,0,0,.35);display:none;width:256px}',
      '.panel.open{display:block}',
      '.presets{display:flex;flex-wrap:wrap;gap:6px}',
      '.presets button{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:5px 8px;font-size:12px;cursor:pointer;font-variant-numeric:tabular-nums}',
      '.presets button:hover{background:rgba(255,255,255,.18)}',
      '.presets button.on{background:#38d9a9;color:#06251d;border-color:#38d9a9;font-weight:700}',
      '.row{display:flex;align-items:center;gap:8px;margin-top:8px}',
      '.row button{flex:1;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:6px;cursor:pointer;font-size:15px}',
      '.row button:hover{background:rgba(255,255,255,.18)}',
      '.meta{margin-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:10.5px;opacity:.7}',
      '.hint{margin-top:6px;font-size:10.5px;line-height:1.6;opacity:.62}',
      '.hint b{opacity:.9}',
      '</style>',
      '<div class="wrap">',
      '  <div class="pill" id="pill"><span>⚡</span><b id="label">1×</b><small>倍速</small></div>',
      '  <div class="panel" id="panel">',
      '    <div class="presets" id="presets"></div>',
      '    <div class="row"><button id="minus" title="−0.25">−</button><button id="reset" title="复位">1×</button><button id="plus" title="+0.25">+</button></div>',
      '    <div class="meta"><span id="count">—</span><span id="tip"></span></div>',
      '    <div class="hint">仅作用于本页 HTML5 视频；<b>[</b> / <b>]</b> 微调，<b>\\</b> 复位，拖动胶囊可移动。浏览器原生上限 16×。</div>',
      '  </div>',
      '</div>'
    ].join('');
    document.documentElement.appendChild(host);

    labelEl = root.getElementById('label');
    panelEl = root.getElementById('panel');
    presetsEl = root.getElementById('presets');
    countEl = root.getElementById('count');
    tipEl = root.getElementById('tip');

    var values = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16];
    var html = '';
    for (var i = 0; i < values.length; i++) {
      html += '<button data-v="' + values[i] + '">' + values[i] + '×</button>';
    }
    presetsEl.innerHTML = html;

    presetsEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (b) setRate(parseFloat(b.getAttribute('data-v')));
    });
    root.getElementById('minus').addEventListener('click', function () { setRate(desired - 0.25); });
    root.getElementById('plus').addEventListener('click', function () { setRate(desired + 0.25); });
    root.getElementById('reset').addEventListener('click', function () { setRate(1); });

    makeDraggable(root.getElementById('pill'));
    restorePos();
    updateLabel();
    syncPresets();

    // 展开状态记忆
    var open = false;
    try { open = localStorage.getItem(KEY_OPEN) === '1'; } catch (e) {}
    if (open) panelEl.classList.add('open');
  }

  function makeDraggable(el) {
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var r = host.getBoundingClientRect();
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      host.style.left = r.left + 'px';
      host.style.top = r.top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      var w = host.offsetWidth || 60, h = host.offsetHeight || 40;
      var x = Math.max(4, Math.min(window.innerWidth - w - 4, ox + dx));
      var y = Math.max(4, Math.min(window.innerHeight - h - 4, oy + dy));
      host.style.left = x + 'px';
      host.style.top = y + 'px';
    });
    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        try {
          localStorage.setItem(KEY_POS, JSON.stringify({
            l: parseFloat(host.style.left), t: parseFloat(host.style.top)
          }));
        } catch (e) {}
      }
    });
    el.addEventListener('click', function () {
      if (moved) { moved = false; return; }
      panelEl.classList.toggle('open');
      try { localStorage.setItem(KEY_OPEN, panelEl.classList.contains('open') ? '1' : '0'); } catch (e) {}
    });
  }

  function restorePos() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY_POS) || 'null');
      if (p && isFinite(p.l) && isFinite(p.t)) {
        host.style.left = Math.max(4, Math.min(window.innerWidth - 60, p.l)) + 'px';
        host.style.top = Math.max(4, Math.min(window.innerHeight - 40, p.t)) + 'px';
        host.style.right = 'auto';
        host.style.bottom = 'auto';
      }
    } catch (e) {}
  }

  function updateLabel() {
    if (labelEl) labelEl.textContent = rateText();
  }

  function syncPresets() {
    if (!presetsEl) return;
    var bs = presetsEl.children;
    for (var i = 0; i < bs.length; i++) {
      var v = parseFloat(bs[i].getAttribute('data-v'));
      bs[i].classList.toggle('on', Math.abs(v - desired) < 0.001);
    }
  }

  function updateCount(n) {
    if (countEl) countEl.textContent = n ? ('本页 ' + n + ' 个视频') : '未检测到视频';
  }

  function setVisible(on) {
    if (!host) { if (on) buildUI(); else return; }
    if (visible === on) return;
    visible = on;
    host.style.display = on ? '' : 'none';
  }

  /* ---------- 速率控制 ---------- */

  function setRate(v) {
    desired = Math.round(clamp(v) * 100) / 100;
    try { localStorage.setItem(KEY_RATE, String(desired)); } catch (e) {}
    applyAll();
    updateLabel();
    syncPresets();
    if (tipEl) tipEl.textContent = '';
  }

  /* ---------- 扫描与绑定 ---------- */

  function bind(v) {
    if (seen) {
      if (seen.has(v)) return;
      seen.add(v);
    }
    ['loadedmetadata', 'play', 'playing', 'canplay', 'seeked'].forEach(function (ev) {
      v.addEventListener(ev, function () { apply(v); }, true);
    });
    apply(v);
  }

  function scan() {
    var list = allVideos();
    if (!list.length) {
      updateCount(0);
      setVisible(false);
      return;
    }
    buildUI();
    setVisible(true);
    for (var i = 0; i < list.length; i++) bind(list[i]);
    updateCount(list.length);
  }

  function scheduleScan() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; scan(); }, 120);
  }

  /* ---------- 全屏时把面板搬进全屏容器 ---------- */

  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement ||
           document.mozFullScreenElement || document.msFullscreenElement || null;
  }

  function onFsChange() {
    if (!host) return;
    var target = fsElement() || document.documentElement;
    if (host.parentNode !== target) {
      try { target.appendChild(host); } catch (e) {}
    }
  }

  /* ---------- 事件 ---------- */

  try {
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  document.addEventListener('play', function (e) {
    if (e.target && e.target.tagName === 'VIDEO') { apply(e.target); setVisible(true); }
  }, true);

  // 站点切集 / seek 后常把倍速重置，这里轻量抢回（最多每 600ms 一次）
  document.addEventListener('ratechange', function (e) {
    if (!e.target || e.target.tagName !== 'VIDEO') return;
    if (Math.abs(e.target.playbackRate - desired) < 0.01) return;
    var now = Date.now();
    if (now - lastFix < 600) return;
    lastFix = now;
    var v = e.target;
    setTimeout(function () { apply(v); }, 30);
  }, true);

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '[') { setRate(desired - 0.25); e.preventDefault(); }
    else if (e.key === ']') { setRate(desired + 0.25); e.preventDefault(); }
    else if (e.key === '\\') { setRate(1); e.preventDefault(); }
  }, true);

  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
    document.addEventListener(ev, onFsChange, false);
  });

  /* ---------- 启动 ---------- */

  hookShadow();
  scan();
  setInterval(scheduleScan, 2500);
})();
