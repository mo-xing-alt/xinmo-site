/* xinmo.work · 资源仓库首页逻辑（零依赖） */
(function () {
  'use strict';

  var catalog = window.RESOURCE_CATALOG || { updated: '', categories: [], items: [] };
  var items = catalog.items || [];
  var categories = [{ id: 'all', label: '全部' }].concat(catalog.categories || []);
  var state = { q: '', cat: 'all' };

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
    return '<article class="card" style="' + accentStyle(item.accent) + ';animation-delay:' + (index * 70) + 'ms">' +
      '<div class="card-top">' +
        '<span class="card-icon">' + (ICONS[item.icon] || ICONS.link) + '</span>' +
        '<span class="card-badge"><i class="status-dot"></i>' + esc(item.status || '可用') + '</span>' +
      '</div>' +
      '<h3>' + esc(item.title) + '</h3>' +
      '<p class="card-subtitle">' + esc(item.subtitle) + '</p>' +
      '<p class="card-desc">' + esc(item.description) + '</p>' +
      '<div class="card-tags">' + tags + '</div>' +
      '<div class="card-meta">' + ICONS.calendar + '<span>' + esc(item.meta || '') + ' · 更新于 ' + esc(item.updated || catalog.updated) + '</span></div>' +
      '<div class="card-foot">' +
        '<a class="open-link" href="' + esc(item.url) + '">打开资源 ' + ICONS.arrow + '</a>' +
        '<button class="share-btn" type="button" data-share="' + esc(item.url) + '" title="复制资源链接" aria-label="复制 ' + esc(item.title) + ' 的链接">' + ICONS.share + '</button>' +
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

  // 初始化
  $('#statItems').textContent = realItems().length;
  $('#statCats').textContent = (catalog.categories || []).length;
  $('#updatedAt').textContent = catalog.updated || '—';
  renderChips();
  render();
})();
