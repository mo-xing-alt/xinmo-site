/* 轻画布 · 模板编辑器
 * 纯前端实现：数据模型 -> DOM 渲染 -> Canvas 导出，无任何第三方依赖。
 * 所有素材与工程文件仅保存在用户浏览器本地。
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var uid = function () { return 'e' + Math.random().toString(36).slice(2, 9); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var num = function (v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; };
  var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ICON_PATHS = {
    heart: 'M50 88 C20 68 8 50 8 34 C8 20 19 10 32 10 C40 10 47 15 50 22 C53 15 60 10 68 10 C81 10 92 20 92 34 C92 50 80 68 50 88 Z',
    star: 'M50 5 L62 38 L97 38 L69 59 L80 93 L50 72 L20 93 L31 59 L3 38 L38 38 Z',
    arrow: 'M10 42 L62 42 L62 25 L92 50 L62 75 L62 58 L10 58 Z',
    chat: 'M12 18 H88 A4 4 0 0 1 92 22 V68 A4 4 0 0 1 88 72 H46 L25 90 V72 H12 A4 4 0 0 1 8 68 V22 A4 4 0 0 1 12 18 Z',
    bolt: 'M56 4 L18 56 H45 L39 96 L82 40 H55 Z',
    sparkle: 'M50 4 L58 42 L96 50 L58 58 L50 96 L42 58 L4 50 L42 42 Z',
    ring: 'M50 6 A44 44 0 1 0 50 94 A44 44 0 1 0 50 6 Z M50 26 A24 24 0 1 1 50 74 A24 24 0 1 1 50 26 Z',
    check: 'M18 52 L40 74 L84 26 L84 46 L40 92 L18 70 Z'
  };

  var POLY = {
    triangle: [[.5, 0], [1, 1], [0, 1]],
    diamond: [[.5, 0], [1, .5], [.5, 1], [0, .5]],
    star: [[.5, 0], [.61, .35], [.98, .35], [.68, .57], [.79, .91], [.5, .70], [.21, .91], [.32, .57], [.02, .35], [.39, .35]]
  };

  var DEFAULTS = {
    type: 'rect', x: 0, y: 0, w: 300, h: 160, rot: 0, opacity: 1,
    fill: '#4f6bed', stroke: '#000000', strokeW: 0, radius: 0,
    shadow: { on: false, x: 0, y: 8, blur: 24, color: 'rgba(31,35,51,.22)' },
    text: '双击编辑文字', font: '"PingFang SC","Microsoft YaHei",sans-serif',
    fontSize: 48, fontWeight: 400, color: '#1f2333', align: 'left',
    lineHeight: 1.3, letterSpacing: 0, italic: false, underline: false,
    src: '', iconKey: 'star', locked: false, hidden: false, name: ''
  };

  var NUM_PROPS = ['x', 'y', 'w', 'h', 'rot', 'opacity', 'strokeW', 'radius', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'];
  var BOOL_PROPS = ['italic', 'underline', 'locked', 'hidden'];

  var state = {
    doc: null, zoom: 1, selected: null,
    history: [], hi: -1, drag: null, gallery: []
  };

  /* ---------------- 数据 ---------------- */

  function norm(e) {
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      o[k] = (e && e[k] !== undefined) ? e[k] : (typeof DEFAULTS[k] === 'object' ? JSON.parse(JSON.stringify(DEFAULTS[k])) : DEFAULTS[k]);
    });
    o.id = (e && e.id) || uid();
    return o;
  }

  function blankDoc(w, h) {
    return {
      width: w || 1080, height: h || 1080,
      background: { type: 'solid', color: '#ffffff', color2: '#eef2ff', angle: 135 },
      elements: []
    };
  }

  function validDoc(d) {
    return d && typeof d === 'object' && d.width > 0 && d.height > 0 &&
      Array.isArray(d.elements) && d.background && typeof d.background === 'object';
  }

  function loadInitial() {
    try {
      var raw = localStorage.getItem('ts-doc-v1');
      if (raw) {
        var d = JSON.parse(raw);
        if (validDoc(d)) {
          d.elements = d.elements.map(norm);
          return d;
        }
      }
    } catch (e) {}
    var t = window.TEMPLATE_PRESETS[1] || window.TEMPLATE_PRESETS[0];
    return { width: t.width, height: t.height, background: JSON.parse(JSON.stringify(t.background)), elements: t.elements.map(norm) };
  }

  function getSel() {
    if (!state.selected) return null;
    return state.doc.elements.filter(function (e) { return e.id === state.selected; })[0] || null;
  }

  function saveLocal() {
    try { localStorage.setItem('ts-doc-v1', JSON.stringify(state.doc)); } catch (e) {}
  }

  function commit() {
    var snap = JSON.stringify(state.doc);
    if (state.hi >= 0 && state.history[state.hi] === snap) { render(); return; }
    state.history = state.history.slice(0, state.hi + 1);
    state.history.push(snap);
    if (state.history.length > 60) state.history.shift();
    state.hi = state.history.length - 1;
    saveLocal();
    render();
  }

  function undo() {
    if (state.hi <= 0) return;
    state.hi--;
    state.doc = JSON.parse(state.history[state.hi]);
    if (!getSel()) state.selected = null;
    saveLocal(); render(); toast('已撤销');
  }

  function redo() {
    if (state.hi >= state.history.length - 1) return;
    state.hi++;
    state.doc = JSON.parse(state.history[state.hi]);
    if (!getSel()) state.selected = null;
    saveLocal(); render(); toast('已重做');
  }

  /* ---------------- 渲染 ---------------- */

  function shadowCss(el) {
    var s = el.shadow;
    return (s && s.on) ? 'box-shadow:' + (s.x || 0) + 'px ' + (s.y || 8) + 'px ' + (s.blur || 24) + 'px ' + (s.color || 'rgba(31,35,51,.22)') + ';' : '';
  }

  function textCss(el) {
    return 'font-family:' + el.font + ';font-size:' + el.fontSize + 'px;font-weight:' + el.fontWeight +
      ';color:' + el.color + ';text-align:' + el.align + ';line-height:' + el.lineHeight +
      ';letter-spacing:' + el.letterSpacing + 'px;font-style:' + (el.italic ? 'italic' : 'normal') +
      ';text-decoration:' + (el.underline ? 'underline' : 'none') + ';' + shadowCss(el);
  }

  function shapeCss(el) {
    var css = 'background:' + el.fill + ';';
    var border = (el.strokeW > 0 && el.stroke) ? 'border:' + el.strokeW + 'px solid ' + el.stroke + ';' : '';
    if (el.type === 'rect') css += 'border-radius:' + el.radius + 'px;' + border;
    else if (el.type === 'ellipse') css += 'border-radius:50%;' + border;
    else if (POLY[el.type]) {
      css += 'clip-path:polygon(' + POLY[el.type].map(function (p) { return (p[0] * 100) + '% ' + (p[1] * 100) + '%'; }).join(',') + ');';
    }
    return css;
  }

  function innerHtml(el) {
    if (el.type === 'text') return '<div class="el-inner"><div class="txt" style="' + esc(textCss(el)) + '">' + esc(el.text) + '</div></div>';
    if (el.type === 'image') return '<div class="el-inner"><img src="' + esc(el.src) + '" alt="" draggable="false" /></div>';
    if (el.type === 'icon') {
      return '<div class="el-inner"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' +
        (ICON_PATHS[el.iconKey] || ICON_PATHS.star) + '" fill="' + el.fill + '" fill-rule="evenodd"/></svg></div>';
    }
    if (el.type === 'line') {
      return '<div class="el-inner"><div style="position:absolute;left:0;top:50%;transform:translateY(-50%);width:100%;height:' +
        (el.strokeW || 4) + 'px;background:' + el.fill + ';border-radius:999px;' + shadowCss(el) + '"></div></div>';
    }
    return '<div class="el-inner"><div style="position:absolute;inset:0;' + shapeCss(el) + shadowCss(el) + '"></div></div>';
  }

  function nodeCss(el, i) {
    return 'left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.w + 'px;height:' + el.h +
      'px;transform:rotate(' + el.rot + 'deg);opacity:' + el.opacity + ';z-index:' + (i + 1) + ';';
  }

  function applyBackground() {
    var b = state.doc.background;
    $('#canvas').style.background = (b.type === 'gradient')
      ? 'linear-gradient(' + (b.angle || 0) + 'deg,' + b.color + ',' + (b.color2 || b.color) + ')'
      : b.color;
  }

  function render() {
    var d = state.doc, c = $('#canvas');
    c.style.width = d.width + 'px';
    c.style.height = d.height + 'px';
    applyBackground();
    c.innerHTML = '';
    d.elements.forEach(function (el, i) {
      if (el.hidden) return;
      var n = document.createElement('div');
      n.className = 'el' + (el.locked ? ' locked' : '') + (state.selected === el.id ? ' selected' : '');
      n.dataset.id = el.id;
      n.style.cssText = nodeCss(el, i);
      n.innerHTML = innerHtml(el);
      c.appendChild(n);
    });
    var box = document.createElement('div');
    box.id = 'selBox';
    box.className = 'sel-box';
    box.innerHTML = '<div class="rotate-line"></div>' +
      HANDLES.map(function (k) { return '<i class="handle h-' + k + '" data-h="' + k + '"></i>'; }).join('') +
      '<i class="rotate-handle" data-h="rot"></i>';
    c.appendChild(box);
    syncFrame();
    updateSelection();
    renderProps();
    renderLayers();
    syncSizeInputs();
    updateHistoryButtons();
  }

  function syncFrame() {
    $('#canvasFrame').style.width = (state.doc.width * state.zoom) + 'px';
    $('#canvasFrame').style.height = (state.doc.height * state.zoom) + 'px';
    $('#canvasWrap').style.transform = 'scale(' + state.zoom + ')';
  }

  function updateSelection() {
    var box = $('#selBox'), el = getSel();
    if (!box) return;
    if (!el) { box.style.display = 'none'; return; }
    var i = state.doc.elements.indexOf(el);
    box.style.cssText = nodeCss(el, i) + 'display:block;z-index:9999;border:1.5px solid var(--ts-accent);';
    box.style.left = el.x + 'px'; box.style.top = el.y + 'px';
    box.style.width = el.w + 'px'; box.style.height = el.h + 'px';
    box.style.transform = 'rotate(' + el.rot + 'deg)';
    box.style.opacity = '1';
  }

  function refreshEl(el, styleOnly) {
    var n = $('#canvas .el[data-id="' + el.id + '"]');
    if (!n) { render(); return; }
    n.style.cssText = nodeCss(el, state.doc.elements.indexOf(el));
    if (!styleOnly) n.innerHTML = innerHtml(el);
    updateSelection();
  }

  function select(id) {
    state.selected = id;
    $$('#canvas .el').forEach(function (n) { n.classList.toggle('selected', n.dataset.id === id); });
    updateSelection(); renderProps(); renderLayers();
  }

  function renderProps() {
    var el = getSel();
    $('#propEmpty').hidden = !!el;
    $('#propForm').hidden = !el;
    if (!el) return;
    $$('.ts-prop').forEach(function (inp) {
      var p = inp.dataset.prop;
      var v = (p === 'shadowOn') ? !!(el.shadow && el.shadow.on) : el[p];
      if (inp.type === 'checkbox') inp.checked = !!v;
      else inp.value = (v === undefined || v === null) ? '' : v;
    });
    $('#shapeSection').hidden = (el.type === 'text' || el.type === 'image' || el.type === 'icon');
    $('#textSection').hidden = (el.type !== 'text');
    $('#rotVal').textContent = Math.round(el.rot) + '°';
    $('#opVal').textContent = Math.round(el.opacity * 100) + '%';
    $('#radVal').textContent = Math.round(el.radius);
  }

  function typeLabel(t) {
    return { text: 'T', image: '▣', icon: '✦', rect: '▢', ellipse: '◯', triangle: '△', diamond: '◇', star: '☆', line: '—' }[t] || '▢';
  }

  function typeName(t) {
    return { text: '文字', image: '图片', icon: '贴纸', rect: '矩形', ellipse: '圆形', triangle: '三角形', diamond: '菱形', star: '星形', line: '线条' }[t] || t;
  }

  function renderLayers() {
    var list = $('#layerList');
    list.innerHTML = '';
    var els = state.doc.elements.slice().reverse();
    $('#layerCount').textContent = els.length + ' 个';
    els.forEach(function (el) {
      var d = document.createElement('div');
      d.className = 'layer-item' + (state.selected === el.id ? ' on' : '') + (el.hidden ? ' off' : '');
      d.dataset.id = el.id;
      d.innerHTML = '<span class="li-ic">' + typeLabel(el.type) + '</span>' +
        '<span class="li-name">' + esc(el.name || typeName(el.type)) + '</span>' +
        '<button data-act="vis" title="显示 / 隐藏">' + (el.hidden ? '○' : '●') + '</button>' +
        '<button data-act="lock" title="锁定 / 解锁">' + (el.locked ? '⊘' : '◇') + '</button>';
      list.appendChild(d);
    });
  }

  /* ---------------- 交互：拖拽 / 缩放 / 旋转 ---------------- */

  function pointerCanvas(e) {
    var r = $('#canvas').getBoundingClientRect();
    return { x: (e.clientX - r.left) / state.zoom, y: (e.clientY - r.top) / state.zoom };
  }

  function onDown(e) {
    var h = e.target.closest ? e.target.closest('[data-h]') : null;
    var el = getSel();
    if (h && el && !el.locked) {
      e.preventDefault();
      if (h.dataset.h === 'rot') {
        var r = $('#canvas').getBoundingClientRect();
        var cx = r.left + (el.x + el.w / 2) * state.zoom;
        var cy = r.top + (el.y + el.h / 2) * state.zoom;
        state.drag = { mode: 'rotate', id: el.id, cx: cx, cy: cy,
          startAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI, rot: el.rot };
      } else {
        state.drag = { mode: 'resize', id: el.id, dir: h.dataset.h,
          sx: e.clientX, sy: e.clientY,
          o: { x: el.x, y: el.y, w: el.w, h: el.h } };
      }
      return;
    }
    var node = e.target.closest ? e.target.closest('.el') : null;
    if (node) {
      select(node.dataset.id);
      var cur = getSel();
      if (cur && !cur.locked && !e.target.isContentEditable) {
        state.drag = { mode: 'move', id: cur.id, sx: e.clientX, sy: e.clientY, o: { x: cur.x, y: cur.y } };
      }
    } else {
      select(null);
    }
  }

  function snapCenter(el) {
    var d = state.doc;
    $('#guideV').style.display = 'none';
    $('#guideH').style.display = 'none';
    if (Math.abs(el.x + el.w / 2 - d.width / 2) < 8) {
      el.x = d.width / 2 - el.w / 2;
      var gv = $('#guideV'); gv.style.left = (d.width / 2 * state.zoom) + 'px'; gv.style.display = 'block';
    }
    if (Math.abs(el.y + el.h / 2 - d.height / 2) < 8) {
      el.y = d.height / 2 - el.h / 2;
      var gh = $('#guideH'); gh.style.top = (d.height / 2 * state.zoom) + 'px'; gh.style.display = 'block';
    }
  }

  function onMove(e) {
    var g = state.drag;
    if (!g) return;
    var el = state.doc.elements.filter(function (x) { return x.id === g.id; })[0];
    if (!el) return;
    var dx = (e.clientX - g.sx) / state.zoom;
    var dy = (e.clientY - g.sy) / state.zoom;
    if (g.mode === 'move') {
      el.x = Math.round(g.o.x + dx);
      el.y = Math.round(g.o.y + dy);
      snapCenter(el);
      refreshEl(el, true);
    } else if (g.mode === 'resize') {
      var x = g.o.x, y = g.o.y, w = g.o.w, h = g.o.h, dir = g.dir;
      if (dir.indexOf('e') >= 0) w = g.o.w + dx;
      if (dir.indexOf('s') >= 0) h = g.o.h + dy;
      if (dir.indexOf('w') >= 0) { x = g.o.x + dx; w = g.o.w - dx; }
      if (dir.indexOf('n') >= 0) { y = g.o.y + dy; h = g.o.h - dy; }
      if (w < 20) { if (dir.indexOf('w') >= 0) x = g.o.x + g.o.w - 20; w = 20; }
      if (h < 20) { if (dir.indexOf('n') >= 0) y = g.o.y + g.o.h - 20; h = 20; }
      el.x = Math.round(x); el.y = Math.round(y); el.w = Math.round(w); el.h = Math.round(h);
      refreshEl(el, true);
    } else if (g.mode === 'rotate') {
      var a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180 / Math.PI;
      var r = g.rot + (a - g.startAngle);
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      el.rot = Math.round(((r + 180) % 360 + 360) % 360 - 180);
      refreshEl(el, true);
    }
  }

  function onUp() {
    if (!state.drag) return;
    state.drag = null;
    $('#guideV').style.display = 'none';
    $('#guideH').style.display = 'none';
    commit();
  }

  /* ---------------- 属性面板 ---------------- */

  function applyProp(inp) {
    var el = getSel();
    if (!el) return;
    var p = inp.dataset.prop;
    if (p === 'shadowOn') {
      el.shadow = el.shadow || { on: false, x: 0, y: 8, blur: 24, color: 'rgba(31,35,51,.22)' };
      el.shadow.on = inp.checked;
    } else if (BOOL_PROPS.indexOf(p) >= 0) {
      el[p] = inp.checked;
    } else if (NUM_PROPS.indexOf(p) >= 0) {
      el[p] = num(inp.value, 0);
      if (p === 'x' || p === 'y' || p === 'w' || p === 'h') el[p] = Math.round(el[p]);
      if (p === 'w' || p === 'h') el[p] = Math.max(20, el[p]);
    } else {
      el[p] = inp.value;
    }
    refreshEl(el);
    if (p === 'rot') $('#rotVal').textContent = Math.round(el.rot) + '°';
    if (p === 'opacity') $('#opVal').textContent = Math.round(el.opacity * 100) + '%';
    if (p === 'radius') $('#radVal').textContent = Math.round(el.radius);
  }

  /* ---------------- 元素操作 ---------------- */

  function addEl(e, quiet) {
    var el = norm(e);
    state.doc.elements.push(el);
    state.selected = el.id;
    commit();
    if (!quiet) toast('已添加' + typeName(el.type));
    return el;
  }

  function centerBox(w, h) {
    return { x: Math.round((state.doc.width - w) / 2), y: Math.round((state.doc.height - h) / 2), w: w, h: h };
  }

  function addText(kind) {
    var d = state.doc;
    var cfg = {
      heading: { text: '输入标题', fontSize: Math.round(d.width / 12), fontWeight: 700, h: Math.round(d.width / 7), color: '#1f2333' },
      subtitle: { text: '输入副标题', fontSize: Math.round(d.width / 24), fontWeight: 600, h: Math.round(d.width / 12), color: '#4b5169' },
      body: { text: '在这里输入正文内容，可以换行。', fontSize: Math.round(d.width / 34), fontWeight: 400, h: Math.round(d.width / 8), color: '#6b7189' }
    }[kind];
    var w = Math.round(d.width * .8);
    addEl(Object.assign({ type: 'text', name: typeName('text') }, centerBox(w, cfg.h), cfg, { align: 'center' }));
  }

  function addShape(type) {
    var d = state.doc, w = Math.round(Math.min(d.width, d.height) * .35);
    var b = centerBox(w, type === 'line' ? 10 : w);
    addEl(Object.assign({ type: type, name: typeName(type), fill: $('#newShapeColor').value, strokeW: type === 'line' ? 6 : 0 }, b));
  }

  function addIcon(key) {
    var d = state.doc, w = Math.round(Math.min(d.width, d.height) * .25);
    addEl(Object.assign({ type: 'icon', name: '贴纸 · ' + key, iconKey: key, fill: $('#newShapeColor').value }, centerBox(w, w)));
  }

  function duplicate() {
    var el = getSel();
    if (!el) { toast('请先选中一个元素'); return; }
    var copy = JSON.parse(JSON.stringify(el));
    copy.id = uid();
    copy.x += 24; copy.y += 24;
    copy.name = (el.name || typeName(el.type)) + ' 副本';
    state.doc.elements.push(copy);
    state.selected = copy.id;
    commit(); toast('已复制');
  }

  function removeSel() {
    var el = getSel();
    if (!el) { toast('请先选中一个元素'); return; }
    state.doc.elements = state.doc.elements.filter(function (x) { return x.id !== el.id; });
    state.selected = null;
    commit(); toast('已删除');
  }

  function layerMove(dir) {
    var a = state.doc.elements, i = a.findIndex(function (x) { return x.id === state.selected; });
    if (i < 0) { toast('请先选中一个元素'); return; }
    var el = a[i], j = i;
    a.splice(i, 1);
    if (dir === 'up') j = Math.min(a.length, i + 1);
    else if (dir === 'down') j = Math.max(0, i - 1);
    else if (dir === 'top') j = a.length;
    else j = 0;
    a.splice(j, 0, el);
    commit(); toast('图层顺序已调整');
  }

  /* ---------------- 模板 / 尺寸 / 背景 ---------------- */

  function applyTemplate(t) {
    state.doc = {
      width: t.width, height: t.height,
      background: JSON.parse(JSON.stringify(t.background)),
      elements: t.elements.map(norm)
    };
    state.selected = null;
    state.history = []; state.hi = -1;
    commit();
    setZoom(fitZoom(), true);
    toast('已套用模板：' + t.name);
  }

  function applySize(w, h) {
    w = clamp(Math.round(num(w, 1080)), 100, 4000);
    h = clamp(Math.round(num(h, 1080)), 100, 4000);
    state.doc.width = w; state.doc.height = h;
    commit(); setZoom(fitZoom(), true);
    toast('画布已设为 ' + w + '×' + h);
  }

  function syncSizeInputs() {
    $('#inpW').value = state.doc.width;
    $('#inpH').value = state.doc.height;
  }

  function updateHistoryButtons() {
    $('#btnUndo').disabled = state.hi <= 0;
    $('#btnRedo').disabled = state.hi >= state.history.length - 1;
  }

  function fitZoom() {
    var s = $('#stage');
    return clamp(Math.min((s.clientWidth - 72) / state.doc.width, (s.clientHeight - 72) / state.doc.height), .1, 1);
  }

  function setZoom(z, isFit) {
    z = clamp(z, .1, 2);
    state.zoom = z;
    syncFrame();
    var sel = $('#selZoom');
    if (isFit) {
      var opt = $('#selZoom option[data-fit]');
      if (!opt) { opt = document.createElement('option'); opt.dataset.fit = '1'; sel.appendChild(opt); }
      opt.value = String(z);
      opt.textContent = '适应 ' + Math.round(z * 100) + '%';
      sel.value = String(z);
    } else {
      sel.value = String(z);
    }
    $('#statusText').textContent = '画布 ' + state.doc.width + '×' + state.doc.height +
      ' · 视图 ' + Math.round(z * 100) + '% · ' + state.doc.elements.length + ' 个元素';
  }

  /* ---------------- 上传 ---------------- */

  function addImage(src) {
    var img = new Image();
    img.onload = function () {
      var d = state.doc;
      var ratio = Math.min(d.width * .62 / img.width, d.height * .62 / img.height, 1);
      var w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
      addEl(Object.assign({ type: 'image', name: '图片', src: src }, centerBox(w, h)));
      if (state.gallery.indexOf(src) < 0) state.gallery.push(src);
      renderGallery();
    };
    img.onerror = function () { toast('这张图片无法读取'); };
    img.src = src;
  }

  function renderGallery() {
    $('#gallery').innerHTML = state.gallery.map(function (s, i) {
      return '<img src="' + esc(s) + '" data-idx="' + i + '" alt="已上传图片" title="点击添加到画布" />';
    }).join('');
  }

  function handleFiles(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return f.type.indexOf('image/') === 0; });
    if (!list.length) { toast('请选择图片文件'); return; }
    list.forEach(function (f) {
      var r = new FileReader();
      r.onload = function () { addImage(r.result); };
      r.readAsDataURL(f);
    });
  }

  /* ---------------- 导出 ---------------- */

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function wrapLines(ctx, text, maxW) {
    var out = [];
    String(text == null ? '' : text).split('\n').forEach(function (para) {
      if (!para) { out.push(''); return; }
      var cur = '';
      for (var i = 0; i < para.length; i++) {
        var ch = para[i];
        if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; }
        else cur += ch;
      }
      out.push(cur);
    });
    return out;
  }

  function drawText(ctx, el) {
    ctx.font = (el.italic ? 'italic ' : '') + el.fontWeight + ' ' + el.fontSize + 'px ' + el.font;
    if ('letterSpacing' in ctx) { try { ctx.letterSpacing = el.letterSpacing + 'px'; } catch (e) {} }
    ctx.textBaseline = 'middle';
    ctx.textAlign = el.align === 'center' ? 'center' : (el.align === 'right' ? 'right' : 'left');
    ctx.fillStyle = el.color;
    var lines = wrapLines(ctx, el.text, Math.max(10, el.w - 2));
    var lh = el.fontSize * el.lineHeight;
    var y = (el.h - lines.length * lh) / 2 + lh / 2;
    var x = el.align === 'center' ? el.w / 2 : (el.align === 'right' ? el.w : 0);
    lines.forEach(function (line) {
      ctx.fillText(line, x, y);
      if (el.underline && line) {
        var w = ctx.measureText(line).width;
        var lx = el.align === 'center' ? x - w / 2 : (el.align === 'right' ? x - w : x);
        var lw = ctx.lineWidth;
        ctx.lineWidth = Math.max(1, el.fontSize / 18);
        ctx.strokeStyle = el.color;
        ctx.beginPath(); ctx.moveTo(lx, y + el.fontSize * .38); ctx.lineTo(lx + w, y + el.fontSize * .38); ctx.stroke();
        ctx.lineWidth = lw;
      }
      y += lh;
    });
  }

  function drawShape(ctx, el) {
    var w = el.w, h = el.h;
    ctx.fillStyle = el.fill;
    ctx.strokeStyle = el.stroke || 'transparent';
    ctx.lineWidth = el.strokeW || 0;
    if (el.type === 'rect') { roundRectPath(ctx, 0, 0, w, h, el.radius); ctx.fill(); if (el.strokeW) ctx.stroke(); }
    else if (el.type === 'ellipse') { ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); if (el.strokeW) ctx.stroke(); }
    else if (POLY[el.type]) {
      ctx.beginPath();
      POLY[el.type].forEach(function (p, i) { i ? ctx.lineTo(p[0] * w, p[1] * h) : ctx.moveTo(p[0] * w, p[1] * h); });
      ctx.closePath(); ctx.fill();
    } else if (el.type === 'line') {
      ctx.strokeStyle = el.fill;
      ctx.lineWidth = el.strokeW || 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    } else if (el.type === 'icon') {
      ctx.save(); ctx.scale(w / 100, h / 100);
      var p = new Path2D(ICON_PATHS[el.iconKey] || ICON_PATHS.star);
      ctx.fill(p, 'evenodd'); ctx.restore();
    }
  }

  function loadImg(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  async function drawEl(ctx, el) {
    ctx.save();
    ctx.globalAlpha = el.opacity;
    var cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(el.rot * Math.PI / 180);
    ctx.translate(-el.w / 2, -el.h / 2);
    if (el.shadow && el.shadow.on) {
      ctx.shadowColor = el.shadow.color || 'rgba(31,35,51,.22)';
      ctx.shadowBlur = el.shadow.blur || 24;
      ctx.shadowOffsetX = el.shadow.x || 0;
      ctx.shadowOffsetY = el.shadow.y || 8;
    }
    if (el.type === 'text') drawText(ctx, el);
    else if (el.type === 'image') {
      var img = await loadImg(el.src);
      if (img) ctx.drawImage(img, 0, 0, el.w, el.h);
      else { ctx.fillStyle = '#eef1f7'; ctx.fillRect(0, 0, el.w, el.h); }
    } else drawShape(ctx, el);
    ctx.restore();
  }

  function bgFill(ctx, b, w, h) {
    if (b.type === 'gradient') {
      var a = (b.angle || 0) * Math.PI / 180;
      var dx = Math.sin(a), dy = -Math.cos(a), L = Math.max(w, h);
      var g = ctx.createLinearGradient(w / 2 - dx * L / 2, h / 2 - dy * L / 2, w / 2 + dx * L / 2, h / 2 + dy * L / 2);
      g.addColorStop(0, b.color); g.addColorStop(1, b.color2 || b.color);
      ctx.fillStyle = g;
    } else ctx.fillStyle = b.color;
    ctx.fillRect(0, 0, w, h);
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  function safeName() {
    return ($('#docTitle').value || '未命名设计').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  }

  async function exportPNG() {
    toast('正在按原始尺寸渲染…');
    try {
      var d = state.doc;
      var cvs = document.createElement('canvas');
      cvs.width = d.width; cvs.height = d.height;
      var ctx = cvs.getContext('2d');
      bgFill(ctx, d.background, d.width, d.height);
      for (var i = 0; i < d.elements.length; i++) {
        var el = d.elements[i];
        if (!el.hidden) await drawEl(ctx, el);
      }
      var blob = await new Promise(function (r) { cvs.toBlob(r, 'image/png'); });
      if (!blob) throw new Error('浏览器未能生成图片');
      download(blob, safeName() + '.png');
      toast('已导出 PNG（' + d.width + '×' + d.height + '）');
    } catch (err) {
      toast('导出失败：' + (err && err.message ? err.message : '未知错误'));
    }
  }

  function saveProject() {
    var blob = new Blob([JSON.stringify(state.doc, null, 2)], { type: 'application/json' });
    download(blob, safeName() + '.json');
    toast('工程已保存到本机');
  }

  function importProject(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!validDoc(d)) throw new Error('不是有效的工程文件');
        d.elements = d.elements.map(norm);
        state.doc = d;
        state.selected = null;
        state.history = []; state.hi = -1;
        state.gallery = d.elements.filter(function (e) { return e.type === 'image'; }).map(function (e) { return e.src; });
        renderGallery(); commit(); setZoom(fitZoom(), true);
        toast('工程已导入');
      } catch (err) { toast('导入失败：' + err.message); }
    };
    r.readAsText(file);
  }

  /* ---------------- 提示 ---------------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* ---------------- 初始化 ---------------- */

  function buildSidebar() {
    $('#templateGrid').innerHTML = window.TEMPLATE_PRESETS.map(function (t) {
      return '<button class="tpl-card" data-tpl="' + t.id + '"><div class="tpl-thumb" style="background:' + t.thumb + '">' +
        esc(t.group) + '</div><div class="tpl-meta">' + esc(t.name) + '<small>' + t.width + '×' + t.height + '</small></div></button>';
    }).join('');

    $('#presetList').innerHTML = window.CANVAS_PRESETS.map(function (p) {
      return '<button class="ts-list-btn" data-size="' + p.width + ',' + p.height + '"><strong>' + esc(p.name) + '</strong><small>仅改尺寸，保留现有元素</small></button>';
    }).join('');

    var shapes = [
      { t: 'rect', svg: '<rect x="8" y="8" width="84" height="84" rx="10" fill="currentColor"/>' },
      { t: 'ellipse', svg: '<circle cx="50" cy="50" r="42" fill="currentColor"/>' },
      { t: 'triangle', svg: '<path d="M50 8 L94 92 H6 Z" fill="currentColor"/>' },
      { t: 'diamond', svg: '<path d="M50 5 L95 50 L50 95 L5 50 Z" fill="currentColor"/>' },
      { t: 'star', svg: '<path d="M50 5 L62 38 L97 38 L69 59 L80 93 L50 72 L20 93 L31 59 L3 38 L38 38 Z" fill="currentColor"/>' },
      { t: 'line', svg: '<rect x="6" y="44" width="88" height="12" rx="6" fill="currentColor"/>' }
    ];
    $('#shapeGrid').innerHTML = shapes.map(function (s) {
      return '<button data-shape="' + s.t + '" title="' + typeName(s.t) + '"><svg viewBox="0 0 100 100">' + s.svg + '</svg></button>';
    }).join('');

    $('#iconGrid').innerHTML = Object.keys(ICON_PATHS).map(function (k) {
      return '<button data-icon="' + k + '" title="' + k + '"><svg viewBox="0 0 100 100"><path d="' + ICON_PATHS[k] + '" fill="currentColor" fill-rule="evenodd"/></svg></button>';
    }).join('');

    $('#textStyleList').innerHTML = [
      { n: '深色粗标题', c: '#1f2333', fw: 700 }, { n: '品牌蓝', c: '#4f6bed', fw: 600 }, { n: '柔和灰正文', c: '#7b8199', fw: 400 }
    ].map(function (s, i) {
      return '<button class="ts-list-btn" data-style="' + i + '"><strong style="color:' + s.c + '">' + s.n + '</strong><small>应用到选中的文字</small></button>';
    }).join('');

    var swatches = [
      ['#ffffff', '#ffffff'], ['#f7f7f4', '#f7f7f4'], ['#eef2ff', '#eef2ff'], ['#e9f7f3', '#e9f7f3'],
      ['#fff4e6', '#fff4e6'], ['#141a2e', '#141a2e'], ['#6d5df6', '#c86dd7'], ['#2f9e78', '#8ce0c0']
    ];
    $('#bgSwatches').innerHTML = swatches.map(function (s, i) {
      return '<button data-bgsw="' + i + '" title="配色 ' + (i + 1) + '" style="background:linear-gradient(135deg,' + s[0] + ',' + s[1] + ')"></button>';
    }).join('');
    window.TS_SWATCHES = swatches;

    $('#selSize').innerHTML = '<option value="">自定义尺寸…</option>' + window.CANVAS_PRESETS.map(function (p) {
      return '<option value="' + p.width + ',' + p.height + '">' + esc(p.name) + '</option>';
    }).join('');
  }

  function bind() {
    $$('.ts-nav button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.ts-nav button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        $$('.ts-panel').forEach(function (p) { p.classList.remove('on'); });
        $('#panel-' + b.dataset.tab).classList.add('on');
      });
    });

    $('#canvas').addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    $('#canvas').addEventListener('dblclick', function (e) {
      var n = e.target.closest ? e.target.closest('.el') : null;
      if (!n) return;
      var el = state.doc.elements.filter(function (x) { return x.id === n.dataset.id; })[0];
      if (!el || el.type !== 'text' || el.locked) return;
      var t = n.querySelector('.txt');
      if (!t) return;
      select(el.id);
      t.contentEditable = 'true';
      t.focus();
      var range = document.createRange(); range.selectNodeContents(t);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      t.addEventListener('blur', function () {
        t.contentEditable = 'false';
        el.text = t.innerText.replace(/\n$/, '');
        commit();
      }, { once: true });
    });

    $$('.ts-prop').forEach(function (inp) {
      inp.addEventListener('input', function () { applyProp(inp); });
      inp.addEventListener('change', function () { applyProp(inp); commit(); });
    });

    $('#layerList').addEventListener('click', function (e) {
      var item = e.target.closest('.layer-item');
      if (!item) return;
      var el = state.doc.elements.filter(function (x) { return x.id === item.dataset.id; })[0];
      if (!el) return;
      var btn = e.target.closest('button');
      if (btn && btn.dataset.act === 'vis') { el.hidden = !el.hidden; commit(); return; }
      if (btn && btn.dataset.act === 'lock') { el.locked = !el.locked; commit(); return; }
      select(el.id);
    });

    $$('[data-layer]').forEach(function (b) { b.addEventListener('click', function () { layerMove(b.dataset.layer); }); });

    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#btnDup').addEventListener('click', duplicate);
    $('#btnDel').addEventListener('click', removeSel);
    $('#btnNew').addEventListener('click', function () {
      if (!confirm('清空当前画布上的所有元素？此操作可用撤销恢复。')) return;
      state.doc.elements = []; state.selected = null; commit(); toast('已新建空白画布');
    });
    $('#btnHelp').addEventListener('click', function () { $('#helpPanel').classList.add('on'); });
    $('#btnHelpClose').addEventListener('click', function () { $('#helpPanel').classList.remove('on'); });
    $('#helpPanel').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('on'); });

    $('#btnAddHeading').addEventListener('click', function () { addText('heading'); });
    $('#btnAddSubtitle').addEventListener('click', function () { addText('subtitle'); });
    $('#btnAddBody').addEventListener('click', function () { addText('body'); });
    $('#templateGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tpl]'); if (!b) return;
      var t = window.TEMPLATE_PRESETS.filter(function (x) { return x.id === b.dataset.tpl; })[0];
      if (t) applyTemplate(t);
    });
    $('#presetList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-size]'); if (!b) return;
      var p = b.dataset.size.split(','); applySize(p[0], p[1]);
    });
    $('#shapeGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-shape]'); if (b) addShape(b.dataset.shape);
    });
    $('#iconGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-icon]'); if (b) addIcon(b.dataset.icon);
    });
    $('#textStyleList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-style]'); if (!b) return;
      var el = getSel();
      if (!el || el.type !== 'text') { toast('请先选中一个文字元素'); return; }
      var s = [{ c: '#1f2333', fw: 700 }, { c: '#4f6bed', fw: 600 }, { c: '#7b8199', fw: 400 }][+b.dataset.style];
      el.color = s.c; el.fontWeight = s.fw; commit(); toast('文字样式已应用');
    });

    $('#fileImage').addEventListener('change', function (e) { handleFiles(e.target.files); e.target.value = ''; });
    var dz = $('#dropZone');
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.style.borderColor = 'var(--ts-accent)'; }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.style.borderColor = ''; }); });
    dz.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });
    $('#gallery').addEventListener('click', function (e) {
      var img = e.target.closest('img'); if (img) addImage(img.src);
    });

    $('#bgTypeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-bg]'); if (!b) return;
      $$('#bgTypeSeg button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      state.doc.background.type = b.dataset.bg;
      $('#bgColor2Wrap').style.opacity = b.dataset.bg === 'gradient' ? '1' : '.4';
      $('#bgAngleWrap').style.opacity = b.dataset.bg === 'gradient' ? '1' : '.4';
      applyBackground(); commit();
    });
    ['bgColor', 'bgColor2', 'bgAngle'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () {
        var b = state.doc.background;
        if (id === 'bgColor') b.color = $('#bgColor').value;
        if (id === 'bgColor2') b.color2 = $('#bgColor2').value;
        if (id === 'bgAngle') { b.angle = +$('#bgAngle').value; $('#bgAngleVal').textContent = b.angle + '°'; }
        applyBackground(); saveLocal();
      });
      $('#' + id).addEventListener('change', commit);
    });
    $('#bgSwatches').addEventListener('click', function (e) {
      var b = e.target.closest('[data-bgsw]'); if (!b) return;
      var s = window.TS_SWATCHES[+b.dataset.bgsw];
      var bg = state.doc.background;
      bg.color = s[0]; bg.color2 = s[1];
      bg.type = (s[0] === s[1]) ? 'solid' : 'gradient';
      $('#bgColor').value = s[0]; $('#bgColor2').value = s[1];
      $$('#bgTypeSeg button').forEach(function (x) { x.classList.toggle('on', x.dataset.bg === bg.type); });
      applyBackground(); commit(); toast('背景已更新');
    });

    $('#selSize').addEventListener('change', function () {
      if (!this.value) return;
      var p = this.value.split(','); $('#inpW').value = p[0]; $('#inpH').value = p[1];
      applySize(p[0], p[1]);
    });
    $('#btnApplySize').addEventListener('click', function () { applySize($('#inpW').value, $('#inpH').value); });
    $('#selZoom').addEventListener('change', function () { setZoom(+this.value, false); });
    $('#btnFit').addEventListener('click', function () { setZoom(fitZoom(), true); });

    $('#btnExport').addEventListener('click', exportPNG);
    $('#btnSave').addEventListener('click', saveProject);
    $('#btnImport').addEventListener('click', function () { $('#fileImport').click(); });
    $('#fileImport').addEventListener('change', function (e) {
      if (e.target.files[0]) importProject(e.target.files[0]);
      e.target.value = '';
    });
    $('#stage').addEventListener('scroll', function () { $('#guideV').style.display = 'none'; $('#guideH').style.display = 'none'; });

    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === 'Escape') {
        if ($('#helpPanel').classList.contains('on')) $('#helpPanel').classList.remove('on');
        else select(null);
        return;
      }
      if (typing) return;
      var mod = e.ctrlKey || e.metaKey;
      var k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
      if (mod && k === 's') { e.preventDefault(); saveProject(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
      if (e.key.indexOf('Arrow') === 0) {
        var el = getSel(); if (!el || el.locked) return;
        e.preventDefault();
        var step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') el.x -= step;
        if (e.key === 'ArrowRight') el.x += step;
        if (e.key === 'ArrowUp') el.y -= step;
        if (e.key === 'ArrowDown') el.y += step;
        refreshEl(el, true); commit();
      }
    });

    window.addEventListener('resize', function () { syncFrame(); });
  }

  function init() {
    state.doc = loadInitial();
    state.gallery = state.doc.elements.filter(function (e) { return e.type === 'image'; }).map(function (e) { return e.src; });
    buildSidebar();
    renderGallery();
    bind();
    render();
    setZoom(fitZoom(), true);
    var b = state.doc.background;
    $('#bgColor').value = b.color;
    $('#bgColor2').value = b.color2 || '#eef2ff';
    $('#bgAngle').value = b.angle || 135;
    $('#bgAngleVal').textContent = (b.angle || 135) + '°';
    $$('#bgTypeSeg button').forEach(function (x) { x.classList.toggle('on', x.dataset.bg === b.type); });
    $('#bgColor2Wrap').style.opacity = b.type === 'gradient' ? '1' : '.4';
    $('#bgAngleWrap').style.opacity = b.type === 'gradient' ? '1' : '.4';
    commit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
