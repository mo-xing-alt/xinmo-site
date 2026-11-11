/* xinmo.work · 资源仓库首页逻辑（零依赖） */
(function () {
  'use strict';

  // 种子目录来自 resources.js（站主维护）；用户上传内容来自 manifest.json（运行时合并）
  var seed = window.RESOURCE_CATALOG || { updated: '', categories: [], items: [] };
  var state = { q: '', cat: 'all' };
  var items = [];        // 合并后：种子 + 用户上传
  var categories = [];   // 合并后：含「全部」
  var lastUpdated = seed.updated || '';
  var manifestData = null;   // GitHub manifest.json（历史上传清单，可选）
  var remoteItems = [];      // Supabase tools 表（朋友提交的链接）
  var uploadItems = [];      // Supabase uploads 表（朋友上传的资料）

  var ICONS = {
    quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z"/><path d="m9.5 8.5 1.8 1.8 3.2-3.4M9.5 13.5h5"/></svg>',
    tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5a4 4 0 0 0-5.2 5.2L3.6 17.4a2 2 0 0 0 2.8 2.8l5.7-5.7a4 4 0 0 0 5.2-5.2l-2.7 2.7-2.5-.6-.6-2.5Z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11 6.3"/><path d="M14 11a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.6-1.6"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
  };

  var ACCENTS = {
    indigo: { color: 'var(--accent)', bg: 'var(--accent-soft)', glow: 'rgba(79,107,237,.24)' },
    teal: { color: 'var(--teal)', bg: 'var(--teal-soft)', glow: 'rgba(56,217,169,.22)' },
    violet: { color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', glow: 'rgba(139,92,246,.20)' },
    amber: { color: '#c9820a', bg: 'var(--amber-soft)', glow: 'rgba(255,180,60,.22)' }
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var grid = $('#resourceGrid');
  var chipsBox = $('#chips');
  var searchInput = $('#searchInput');
  var emptyState = $('#emptyState');
  var resultCount = $('#resultCount');
  var toast = $('#toast');
  var toastTimer;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 只允许 http(s) 与站内相对路径，挡住 javascript: / data: 等危险 scheme
  function safeHref(u) {
    u = String(u == null ? '' : u).trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (/^\.{0,2}\//.test(u)) return u;
    if (/^[\w.-]+\.html?$/i.test(u)) return u;
    return '';
  }

  function accentStyle(name) {
    var a = ACCENTS[name] || ACCENTS.indigo;
    return '--icon-color:' + a.color + ';--icon-bg:' + a.bg + ';--glow:' + a.glow;
  }

  function realItems() { return items.filter(function (it) { return !it.soon; }); }

  function catLabel(id) {
    for (var i = 0; i < categories.length; i++) if (categories[i].id === id) return categories[i].label;
    return id;
  }

  function cardHTML(item, index) {
    if (item.soon) {
      return '<article class="card card-soon" style="' + accentStyle(item.accent) + ';animation-delay:' +
        (index * 70) + 'ms">' +
        '<span class="card-icon">' + ICONS.plus + '</span>' +
        '<h3>' + esc(item.title) + '</h3>' +
        '<p class="card-subtitle">' + esc(item.subtitle) + '</p>' +
        '<p class="card-desc">' + esc(item.description) + '</p>' +
        '<span class="soon-mark">COMING SOON</span>' +
        '</article>';
    }
    var tags = (item.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    var href = safeHref(item.url);
    return '<article class="card" style="' + accentStyle(item.accent) + ';animation-delay:' + (index * 70) + 'ms">' +
      '<div class="card-top">' +
        '<span class="card-icon">' + (ICONS[item.icon] || ICONS.link) + '</span>' +
        '<span class="card-badge"><i class="status-dot"></i>' + esc(item.status || '可用') + '</span>' +
      '</div>' +
      '<h3>' + esc(item.title) + '</h3>' +
      '<p class="card-subtitle">' + esc(item.subtitle) + '</p>' +
      '<p class="card-desc">' + esc(item.description) + '</p>' +
      '<div class="card-tags">' + tags + '</div>' +
      '<div class="card-meta">' + ICONS.calendar + '<span>' + esc(item.meta || '') + ' · 更新于 ' + esc(item.updated || lastUpdated) + '</span></div>' +
      '<div class="card-foot">' +
        (href
          ? '<a class="open-link" href="' + esc(href) + '">打开资源 ' + ICONS.arrow + '</a>' +
            '<button class="share-btn" type="button" data-share="' + esc(href) + '" title="复制资源链接" aria-label="复制 ' + esc(item.title) + ' 的链接">' + ICONS.share + '</button>'
          : '<span class="open-link" style="opacity:.5;cursor:not-allowed">链接不可用</span>') +
      '</div>' +
    '</article>';
  }

  function matches(item, q) {
    if (!q) return true;
    var haystack = [item.title, item.subtitle, item.description, item.meta, item.status,
      catLabel(item.category), (item.tags || []).join(' ')].join(' ').toLowerCase();
    return haystack.indexOf(q) !== -1;
  }

  function render() {
    var q = state.q.trim().toLowerCase();
    var visible = items.filter(function (it) {
      if (it.soon) return !q && state.cat === 'all';
      return (state.cat === 'all' || it.category === state.cat) && matches(it, q);
    });

    grid.innerHTML = visible.map(cardHTML).join('');
    grid.hidden = visible.length === 0;
    emptyState.hidden = visible.length !== 0;
    var realVisible = visible.filter(function (it) { return !it.soon; }).length;
    resultCount.textContent = '共 ' + realItems().length + ' 个资源' +
      (realVisible !== realItems().length ? '，当前显示 ' + realVisible + ' 个' : '');

    Array.prototype.forEach.call(chipsBox.children, function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.cat === state.cat));
    });
  }

  function renderChips() {
    chipsBox.innerHTML = categories.map(function (c) {
      return '<button class="chip" type="button" data-cat="' + esc(c.id) + '" aria-pressed="' +
        (c.id === state.cat) + '">' + esc(c.label) + '</button>';
    }).join('');
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); }
      catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  // 事件绑定
  chipsBox.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.cat = btn.dataset.cat;
    render();
  });

  searchInput.addEventListener('input', function () { state.q = this.value; render(); });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { this.value = ''; state.q = ''; render(); this.blur(); }
  });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-share]');
    if (!btn) return;
    var url = new URL(btn.dataset.share, location.href).href;
    copyText(url).then(function () { showToast('链接已复制，发给朋友吧'); })
      .catch(function () { showToast('复制失败，请手动复制地址栏链接'); });
  });

  $('#resetFilter').addEventListener('click', function () {
    state.q = ''; state.cat = 'all'; searchInput.value = ''; render();
  });

  $('#themeToggle').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('xinmo-theme', next); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#0b1220' : '#f6f8fd');
  });

  // 把 Supabase 行映射成站内卡片结构（表字段：id / name / url / description）
  var SB_ACCENTS = ['indigo', 'teal', 'violet', 'amber'];

  function safeUrl(u) {
    u = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }

  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./i, ''); } catch (e) { return ''; }
  }

  function mapSupabaseRow(row, i) {
    var url = safeUrl(row && row.url);
    var name = String((row && row.name) || '').trim();
    if (!url || !name) return null;           // 跳过非法/空行，避免坏卡片
    return {
      id: 'sb-' + (row.id != null ? row.id : i),
      title: name,
      subtitle: hostOf(url) || '朋友提交的链接',
      description: String((row && row.description) || '').trim(),
      category: 'tool',
      icon: 'link',
      accent: SB_ACCENTS[i % SB_ACCENTS.length],
      url: url,
      tags: [],
      meta: '朋友提交',
      status: '可用',
      updated: ''
    };
  }

  // 从 Supabase 拉取 tools 表（失败则静默保留种子目录，不影响页面）
  function loadSupabase() {
    var cfg = window.XINMO_SUPABASE;
    if (!cfg || !cfg.url || !cfg.key) return Promise.resolve();
    var ep = String(cfg.url).replace(/\/+$/, '') + '/rest/v1/' +
      (cfg.table || 'tools') + '?select=id,name,url,description';
    return fetch(ep, {
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
      cache: 'no-store'
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        remoteItems = rows.map(mapSupabaseRow).filter(Boolean);
      })
      .catch(function () {});
  }

  // ---- 朋友上传的资料（Supabase uploads 表） ----
  var KIND_LABEL = { study: '学习资料', image: '图片', archive: '压缩包', doc: '文档', other: '资料' };

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function extOf(name) {
    var m = String(name || '').match(/\.([a-z0-9]{1,6})$/i);
    return m ? m[1].toUpperCase() : '';
  }

  function mapUploadRow(row, i) {
    var id = row && row.id;
    var title = String((row && row.title) || '').trim();
    if (!id || !title) return null;
    var files = Array.isArray(row && row.files) ? row.files.filter(function (f) { return f && f.name; }) : [];
    var size = files.reduce(function (s, f) { return s + (Number(f.size) || 0); }, 0);
    var kind = (row && row.kind) || 'other';
    var label = KIND_LABEL[kind] || '资料';
    var note = String((row && row.note) || '').replace(/\s+/g, ' ').trim();
    var desc = String((row && row.description) || '').trim() || note.slice(0, 120);
    var exts = [];
    files.forEach(function (f) {
      var e = extOf(f.name);
      if (e && exts.indexOf(e) === -1 && exts.length < 3) exts.push(e);
    });
    return {
      id: 'up-' + id,
      title: title,
      subtitle: String((row && row.subtitle) || '').trim() ||
        (label + (files.length ? ' · ' + files.length + ' 个文件' : ' · 纯文字')),
      description: desc,
      category: 'files',
      icon: kind === 'study' ? 'quiz' : 'doc',
      accent: kind === 'image' ? 'violet' : kind === 'archive' ? 'amber' : kind === 'study' ? 'teal' : 'indigo',
      url: './files.html?id=' + encodeURIComponent(id),
      tags: [label].concat(exts),
      meta: '朋友上传 · by ' + String((row && row.uploader) || 'friend') + ' · ' +
        (files.length ? files.length + ' 个文件 ' + fmtSize(size) : '纯文字'),
      status: '可用',
      updated: String((row && row.created_at) || '').slice(0, 10)
    };
  }

  function loadUploads() {
    var cfg = window.XINMO_SUPABASE;
    if (!cfg || !cfg.url || !cfg.key) return Promise.resolve();
    var ep = String(cfg.url).replace(/\/+$/, '') + '/rest/v1/' +
      (cfg.uploadsTable || 'uploads') +
      '?select=id,title,subtitle,description,note,kind,files,uploader,created_at&order=created_at.desc&limit=100';
    return fetch(ep, {
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
      cache: 'no-store'
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        uploadItems = rows.map(mapUploadRow).filter(Boolean);
      })
      .catch(function () {});
  }

  // 四源合并：种子（站主）+ 朋友上传的资料 + manifest（历史上传）+ Supabase 链接
  function rebuild() {
    var seedItems = seed.items || [];
    var seedSoon = seedItems.filter(function (it) { return it.soon; });
    var seedReal = seedItems.filter(function (it) { return !it.soon; });
    var upReal = (manifestData && manifestData.items ? manifestData.items : [])
      .filter(function (it) { return !it.soon; });
    items = seedReal.concat(uploadItems).concat(upReal).concat(remoteItems).concat(seedSoon);

    var seen = {};
    categories = [{ id: 'all', label: '全部' }];
    function add(c) { if (!c || seen[c.id]) return; seen[c.id] = 1; categories.push(c); }
    (seed.categories || []).forEach(add);
    if (uploadItems.length && !seen.files) add({ id: 'files', label: '朋友资料' });
    if (remoteItems.length && !seen.tool) add({ id: 'tool', label: '实用工具' });
    if (manifestData && manifestData.categories) manifestData.categories.forEach(add);

    lastUpdated = (manifestData && manifestData.updated) || seed.updated || '';
    uploadItems.forEach(function (it) {
      if (it.updated && it.updated > lastUpdated) lastUpdated = it.updated;
    });
  }

  function init() {
    $('#statItems').textContent = items.filter(function (it) { return !it.soon; }).length;
    $('#statCats').textContent = Math.max(0, categories.length - 1);
    $('#updatedAt').textContent = lastUpdated || '—';
    renderChips();
    render();
  }

  // 先渲染种子目录，再并行拉取「GitHub 清单」「Supabase 链接目录」「朋友上传的资料」
  rebuild();
  init();

  fetch('./manifest.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) { if (m) { manifestData = m; rebuild(); init(); } })
    .catch(function () {});

  Promise.all([loadSupabase(), loadUploads()]).then(function () { rebuild(); init(); });
  // 香港节点提示：本次会话可关闭，下次访问再出现
  (function () {
    var box = document.getElementById('hkNotice');
    if (!box) return;
    try {
      if (sessionStorage.getItem('xinmo-hk-notice') === 'off') { box.hidden = true; return; }
    } catch (e) {}
    var btn = document.getElementById('hkClose');
    if (btn) btn.addEventListener('click', function () {
      box.hidden = true;
      try { sessionStorage.setItem('xinmo-hk-notice', 'off'); } catch (e) {}
    });
  })();
})();
