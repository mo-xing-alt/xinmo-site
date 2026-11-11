// ==UserScript==
// @name         xinmo.work · 学习通倍速
// @namespace    https://xinmo.work/tools/chaoxing-speed/
// @version      1.0.0
// @description  为学习通（chaoxing.com）的 HTML5 视频添加 0.5–16× 倍速悬浮面板
// @author       xinmo.work
// @match        *://chaoxing.com/*
// @match        *://*.chaoxing.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__XMV_SPEED__) return;
  window.__XMV_SPEED__ = true;

  var KEY = 'xmv-speed-rate';
  var MIN = 0.5, MAX = 16;
  var desired = 1;
  try {
    var saved = parseFloat(localStorage.getItem(KEY));
    if (isFinite(saved)) desired = saved;
  } catch (e) {}
  desired = Math.min(MAX, Math.max(MIN, desired));

  var host = null, root = null, label = null, panel = null, presetsBox = null;
  var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var lastFix = 0;

  function clamp(v) { return Math.min(MAX, Math.max(MIN, v)); }

  function apply(v) {
    if (!v) return;
    try { v.playbackRate = desired; } catch (e) {}
  }

  function applyAll() {
    var list = document.querySelectorAll('video');
    for (var i = 0; i < list.length; i++) apply(list[i]);
  }

  function labelText() {
    var s = desired.toFixed(desired % 1 ? 2 : 0);
    return s.replace(/(\.\d)0$/, '$1') + '×';
  }

  function updateLabel() {
    if (label) label.textContent = labelText();
  }

  function syncPresets() {
    if (!presetsBox) return;
    var bs = presetsBox.children;
    for (var i = 0; i < bs.length; i++) {
      bs[i].classList.toggle('on', Math.abs(parseFloat(bs[i].getAttribute('data-v')) - desired) < 0.001);
    }
  }

  function setRate(v) {
    desired = Math.round(clamp(v) * 100) / 100;
    try { localStorage.setItem(KEY, String(desired)); } catch (e) {}
    applyAll();
    updateLabel();
    syncPresets();
  }

  function buildUI() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'xmv-speed-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:88px;z-index:2147483647;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = [
      '<style>',
      ':host{all:initial}',
      '.wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
      '.pill{display:flex;align-items:center;gap:6px;background:rgba(17,26,44,.92);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;user-select:none;font-size:13px}',
      '.pill b{font-size:14px;font-variant-numeric:tabular-nums}',
      '.pill small{opacity:.7;font-size:11px}',
      '.panel{margin-top:8px;background:rgba(17,26,44,.96);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:10px;box-shadow:0 12px 30px rgba(0,0,0,.35);display:none;width:252px}',
      '.panel.open{display:block}',
      '.presets{display:flex;flex-wrap:wrap;gap:6px}',
      '.presets button{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:5px 8px;font-size:12px;cursor:pointer;font-variant-numeric:tabular-nums}',
      '.presets button.on{background:#38d9a9;color:#06251d;border-color:#38d9a9;font-weight:700}',
      '.row{display:flex;align-items:center;gap:8px;margin-top:8px}',
      '.row button{flex:1;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:6px;cursor:pointer;font-size:15px}',
      '.hint{margin-top:8px;font-size:10.5px;line-height:1.6;opacity:.65}',
      '</style>',
      '<div class="wrap">',
      '  <div class="pill" id="pill"><span>⚡</span><b id="label">1×</b><small>倍速</small></div>',
      '  <div class="panel" id="panel">',
      '    <div class="presets" id="presets"></div>',
      '    <div class="row"><button id="minus">−</button><button id="reset">1×</button><button id="plus">+</button></div>',
      '    <div class="hint">点数字切换；<b>[</b> / <b>]</b> 微调，<b>\\</b> 复位。只对当前页的 HTML5 视频生效。</div>',
      '  </div>',
      '</div>'
    ].join('');
    document.documentElement.appendChild(host);

    label = root.getElementById('label');
    panel = root.getElementById('panel');
    presetsBox = root.getElementById('presets');

    var values = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16];
    var html = '';
    for (var i = 0; i < values.length; i++) {
      html += '<button data-v="' + values[i] + '">' + values[i] + '×</button>';
    }
    presetsBox.innerHTML = html;

    root.getElementById('pill').addEventListener('click', function () {
      panel.classList.toggle('open');
    });
    presetsBox.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (b) setRate(parseFloat(b.getAttribute('data-v')));
    });
    root.getElementById('minus').addEventListener('click', function () { setRate(desired - 0.25); });
    root.getElementById('plus').addEventListener('click', function () { setRate(desired + 0.25); });
    root.getElementById('reset').addEventListener('click', function () { setRate(1); });

    updateLabel();
    syncPresets();
  }

  function bind(v) {
    if (seen) {
      if (seen.has(v)) return;
      seen.add(v);
    }
    v.addEventListener('loadedmetadata', function () { apply(v); });
    v.addEventListener('play', function () { apply(v); });
  }

  function scan() {
    var list = document.querySelectorAll('video');
    if (!list.length) return;
    buildUI();
    for (var i = 0; i < list.length; i++) {
      bind(list[i]);
      apply(list[i]);
    }
  }

  try {
    new MutationObserver(function () { scan(); }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  document.addEventListener('play', function (e) {
    if (e.target && e.target.tagName === 'VIDEO') apply(e.target);
  }, true);

  // 平台有些播放器会在 seek / 切集后把倍速重置，这里轻量恢复（最多每 600ms 一次）
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
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    if (e.key === '[') setRate(desired - 0.25);
    else if (e.key === ']') setRate(desired + 0.25);
    else if (e.key === '\\') setRate(1);
  }, true);

  scan();
  setInterval(scan, 2000);
})();
