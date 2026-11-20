// ==UserScript==
// @name         xinmo.work · 网页视频倍速
// @namespace    https://xinmo.work/tools/chaoxing-speed/
// @version      3.0.0
// @description  给任意网站的 HTML5 视频加 0.5–16× 悬浮倍速面板：学习通、中国大学MOOC、B站、YouTube、网盘通用；强制模式锁死倍速、无视前端限制；自动抢回重置/暂停、拦截假弹窗
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

  /* ---------- 高倍速自动续播 ----------
   * 有些网课平台（如中国大学MOOC）检测到超过内置倍速上限（通常 2×）时会主动
   * 暂停视频。这里在「我们期望它继续播放」且倍速 > 1× 时自动续播。
   * 尊重用户主动暂停：用户在视频上按下鼠标（点原生暂停键/点画面）后的一小段
   * 时间内发生的 pause 视为主动暂停，不续播。
   */
  var AUTO_RESUME_KEY = 'xmv-speed-autoresume';
  var autoResume = true;
  try {
    var ar = localStorage.getItem(AUTO_RESUME_KEY);
    if (ar === '0' || ar === 'false') autoResume = false;
  } catch (e) {}
  var wantPlay = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
  var userPauseAt = 0;      // 用户在视频上按下鼠标的时间戳
  var resumeRetry = 0;      // 连续续播失败计数，防死循环
  var lastResumeAt = 0;

  /* ---------- 站点策略 ----------
   * 某些平台会把「非原生倍速」强行重置回 1×（抖音），或对高倍速做风控（学习通）。
   * siteCap = 该站点允许的最高倍速；effective() 返回实际要应用的倍速。
   * 抖音：限 4×（够用且不易触发异常）；学习通：限 2×（避开风控验证码）。
   */
  var siteHost = (location.hostname || '').toLowerCase();
  var siteCap = 16;
  var siteKind = 'other';
  if (/chaoxing\.com|icourse163\.org/.test(siteHost)) { siteCap = 2; siteKind = 'study'; }
  else if (/douyin\.com/.test(siteHost)) { siteCap = 4; siteKind = 'douyin'; }
  function effectiveRate() {
    // 强制模式：无视站点限速，直接取 desired（最高 16×）
    return forceMode ? desired : Math.min(desired, siteCap);
  }

  /* ---------- 强制模式 ----------
   * 只针对「前端」限制：平台把 playbackRate 改回 1×、调用 pause() 暂停。
   * 通过 hook 原生属性/方法让外部改不动、停不掉。
   * ⚠ 无法突破服务端风控（验证码、学习时长统计）——那些判定在服务器上，
   *   前端脚本无能为力。默认关闭，需用户在面板主动开启。
   * 逃生阀：Shift+\ 立即关闭强制模式。
   */
  var FORCE_KEY = 'xmv-speed-force';
  var forceMode = false;
  try { forceMode = localStorage.getItem(FORCE_KEY) === '1'; } catch (e) {}
  function setForce(on) {
    forceMode = !!on;
    try { localStorage.setItem(FORCE_KEY, forceMode ? '1' : '0'); } catch (e) {}
    applyAll();
  }

  // hook playbackRate：强制模式下，非本脚本的赋值一律忽略并锁回目标值。
  // 本脚本内部赋值前先把 internalWrite 置 true，避免自我拦截。
  var internalWrite = false;
  try {
    var mediaProto = window.HTMLMediaElement && HTMLMediaElement.prototype;
    if (mediaProto) {
      var rateDesc = Object.getOwnPropertyDescriptor(mediaProto, 'playbackRate');
      if (rateDesc && rateDesc.get && rateDesc.set) {
        var origRateGet = rateDesc.get, origRateSet = rateDesc.set;
        Object.defineProperty(mediaProto, 'playbackRate', {
          configurable: true, enumerable: rateDesc.enumerable,
          get: function () { return origRateGet.call(this); },
          set: function (v) {
            if (forceMode && this.tagName === 'VIDEO' && !internalWrite && wants(this)) {
              var target = effectiveRate();
              if (Math.abs(Number(v) - target) > 0.01) v = target; // 外部想改？锁回目标
            }
            return origRateSet.call(this, v);
          }
        });
      }
      // hook pause：强制模式 + 高倍速 + 非用户主动暂停 → 忽略此次暂停
      var origPause = mediaProto.pause;
      mediaProto.pause = function () {
        if (forceMode && this.tagName === 'VIDEO' && wants(this) &&
            effectiveRate() > 1 && !this.ended &&
            Date.now() - userPauseAt >= 500) {
          return; // 平台想暂停？无视
        }
        return origPause.apply(this, arguments);
      };
    }
  } catch (e) {}

  /* ---------- 拦截反倍速假弹窗 ----------
   * 学习通(chaoXing)等平台检测到高倍速时，会弹原生 alert「您的网络不稳定，
   * 请您稍后继续…」来打断播放。原生 alert 会阻塞页面、且脚本无法替用户点
   * 「确定」，所以这里把这类特定话术的 alert 静默吞掉；其它 alert 照常显示。
   */
  function isFakeSpeedAlert(msg) {
    var s = String(msg == null ? '' : msg);
    // 只吞「网络不稳定 + (稍后继续/稍后再试)」这类伪装成网络问题的倍速提示
    if (/网络不稳定/.test(s) && /(稍后继续|稍后再|继续观看|请重试|稍后重试)/.test(s)) return true;
    // 明确提到倍速/速度异常、播放异常的也吞掉
    if (/(倍速|播放速度|播放异常)/.test(s) && /(异常|过快|过高|检测|不支持|不稳定)/.test(s)) return true;
    return false;
  }
  try {
    var _alert = window.alert;
    if (typeof _alert === 'function') {
      window.alert = function (msg) {
        if ((autoResume || forceMode) && isFakeSpeedAlert(msg)) {
          // 同步标记用户未主动暂停，配合后续自动续播；不弹窗、不阻塞
          return undefined;
        }
        return _alert.apply(window, arguments);
      };
    }
  } catch (e) {}

  /* ---------- 倍速应用 ---------- */

  function apply(v) {
    if (!v || v.tagName !== 'VIDEO') return;
    var rate = effectiveRate();
    internalWrite = true;
    try { v.playbackRate = rate; } catch (e) {}
    internalWrite = false;
    // 尽量保持音调不变（各浏览器前缀）
    try { v.preservesPitch = true; } catch (e) {}
    try { v.mozPreservesPitch = true; } catch (e) {}
    try { v.webkitPreservesPitch = true; } catch (e) {}
  }

  function applyAll() {
    var list = allVideos();
    for (var i = 0; i < list.length; i++) apply(list[i]);
  }

  /* ---------- 自动续播 ---------- */
  function markWant(v) {
    if (!v) return;
    if (wantPlay) wantPlay.add(v);
    try { v.__xmvWant = true; } catch (e) {}
    resumeRetry = 0;
  }
  function unwant(v) {
    if (!v) return;
    if (wantPlay) wantPlay.delete(v);
    try { v.__xmvWant = false; } catch (e) {}
  }
  function wants(v) {
    if (!v) return false;
    if (wantPlay && wantPlay.has(v)) return true;
    try { return v.__xmvWant === true; } catch (e) { return false; }
  }
  function tryResume(v) {
    if (!autoResume || desired <= 1 || !wants(v)) return;
    // 用户主动暂停的宽限期内不续播（400ms）
    if (Date.now() - userPauseAt < 400) return;
    // 防死循环：短时间内连续续播太多次就放弃这一轮
    if (Date.now() - lastResumeAt < 800 && resumeRetry >= 4) return;
    lastResumeAt = Date.now();
    try {
      var p = v.play();
      if (p && typeof p.then === 'function') {
        p.then(function () { resumeRetry = 0; })
         .catch(function () { resumeRetry++; apply(v); });
      } else {
        resumeRetry = 0;
      }
    } catch (e) { resumeRetry++; }
    apply(v); // 续播同时把倍速再钉一次
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
    var r = effectiveRate();
    var s = r.toFixed(r % 1 ? 2 : 0);
    s = s.replace(/(\.\d)0$/, '$1');
    // 被站点策略限速时，显示「目标×（限X×）」，让用户知道为什么没到设定值
    if (!forceMode && siteCap < 16 && desired > siteCap) {
      return s + '×·限' + siteCap + '×';
    }
    return s + '×';
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
      '    <button id="autoresume" style="width:100%;margin-top:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:7px;cursor:pointer;font-size:12px"></button>',
      '    <button id="forcebtn" style="width:100%;margin-top:6px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:7px;cursor:pointer;font-size:12px"></button>',
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

    var arBtn = root.getElementById('autoresume');
    function paintAutoResume() {
      arBtn.textContent = (autoResume ? '✓ ' : '✗ ') + '防打断（拦截假弹窗 + 自动续播）';
      arBtn.style.background = autoResume ? 'rgba(56,217,169,.18)' : 'rgba(255,255,255,.08)';
      arBtn.style.borderColor = autoResume ? '#38d9a9' : 'rgba(255,255,255,.18)';
    }
    paintAutoResume();
    arBtn.addEventListener('click', function () {
      autoResume = !autoResume;
      try { localStorage.setItem(AUTO_RESUME_KEY, autoResume ? '1' : '0'); } catch (e) {}
      paintAutoResume();
    });

    var forceBtn = root.getElementById('forcebtn');
    function paintForce() {
      forceBtn.textContent = (forceMode ? '⚡ ' : '◇ ') + '强制模式（锁死倍速·无视前端限制）';
      forceBtn.style.background = forceMode ? 'rgba(255,193,7,.2)' : 'rgba(255,255,255,.08)';
      forceBtn.style.borderColor = forceMode ? '#ffc107' : 'rgba(255,255,255,.18)';
      forceBtn.style.color = forceMode ? '#ffd54f' : '#fff';
    }
    paintForce();
    forceBtn.addEventListener('click', function () {
      setForce(!forceMode);
      paintForce();
      updateLabel();
      if (tipEl) tipEl.textContent = forceMode ? '已锁死，平台改不动/停不掉' : '';
    });
    // 让外部（如快捷键）也能刷新强制按钮显示
    window.__xmvPaintForce = paintForce;

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
    if (tipEl) {
      if (siteCap < 16 && desired > siteCap) {
        tipEl.textContent = siteKind === 'study'
          ? '学习通限 2×，避免风控'
          : '抖音限 4×';
      } else {
        tipEl.textContent = '';
      }
    }
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
    if (e.target && e.target.tagName === 'VIDEO') { apply(e.target); markWant(e.target); setVisible(true); }
  }, true);

  // playing：确认真的在播，重新标记为「期望播放」并清零失败计数
  document.addEventListener('playing', function (e) {
    if (e.target && e.target.tagName === 'VIDEO') markWant(e.target);
  }, true);

  // 视频被暂停：平台强制暂停时自动续播；用户主动暂停则尊重
  document.addEventListener('pause', function (e) {
    var v = e.target;
    if (!v || v.tagName !== 'VIDEO') return;
    if (!wants(v)) return;             // 从没播放过，不管
    if (v.ended) { unwant(v); return; } // 正常播完，不管
    tryResume(v);
  }, true);

  // 用户在视频区域按下鼠标 → 视为主动暂停意图，短暂宽限不续播
  // 捕获阶段覆盖 Shadow DOM 内的原生控制条点击
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (!t || !t.tagName) return;
    if (t.tagName === 'VIDEO' || (t.getRootNode && t.getRootNode().host)) {
      userPauseAt = Date.now();
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    var t = e.target;
    if (t && t.tagName === 'VIDEO') userPauseAt = Date.now();
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

  // 强力钉住：抖音等平台会周期性地把非原生倍速重置回 1×，且不总触发 ratechange。
  // 定时器兜底，只要播放中的视频倍速偏离目标就设回（比事件更可靠）。
  setInterval(function () {
    if (visible === false && !host) return;
    var rate = effectiveRate();
    if (rate <= 1) return;
    var list = allVideos();
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.paused) continue;                       // 暂停时不打扰
      var cur = 0;
      try { cur = v.playbackRate; } catch (e) {}
      if (Math.abs(cur - rate) > 0.01) {
        internalWrite = true;
        try { v.playbackRate = rate; } catch (e) {}
        internalWrite = false;
      }
    }
  }, 250);

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.shiftKey && e.key === '\\') { // 逃生阀：立即关闭强制模式
      if (forceMode) { setForce(false); if (window.__xmvPaintForce) window.__xmvPaintForce(); updateLabel(); }
      e.preventDefault(); return;
    }
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
