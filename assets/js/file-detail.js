/* xinmo.work · 资料详情页（读取 public.uploads 单条记录）
 * 图片可点开大图，其它文件给下载按钮；文字内容原样展示（纯文本，不解析 HTML）。
 */
(function () {
  'use strict';

  var cfg = window.XINMO_SUPABASE || {};
  var base = String(cfg.url || '').replace(/\/+$/, '');
  var key = cfg.key || '';
  var table = cfg.uploadsTable || 'uploads';
  var bucket = cfg.bucket || 'uploads';

  var $ = function (id) { return document.getElementById(id); };
  var loadingEl = $('loading');
  var errorBox = $('errorBox');
  var errorText = $('errorText');
  var content = $('content');

  var KIND = {
    study: '学习资料',
    image: '图片',
    archive: '压缩包',
    doc: '文档',
    other: '其他'
  };

  var ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
  var ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>';
  var ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function fmtDate(s) {
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    function p(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function extOf(name) {
    var m = String(name || '').match(/\.([a-z0-9]{1,6})$/i);
    return m ? m[1].toUpperCase() : 'FILE';
  }

  function isImage(f) {
    if (/^image\//i.test(f.type || '')) return true;
    return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.name || '');
  }

  function safePath(p) {
    p = String(p == null ? '' : p);
    if (!p || p.charAt(0) === '/' || p.indexOf('..') >= 0) return '';
    return p;
  }

  function publicUrl(path) {
    var p = safePath(path);
    if (!p) return '';
    return base + '/storage/v1/object/public/' + encodeURIComponent(bucket) + '/' +
      p.split('/').map(encodeURIComponent).join('/');
  }

  function showError(text) {
    loadingEl.hidden = true;
    content.hidden = true;
    errorBox.hidden = false;
    if (text) errorText.textContent = text;
  }

  function render(row) {
    var files = Array.isArray(row.files) ? row.files.filter(function (f) {
      return f && typeof f === 'object' && safePath(f.path);
    }) : [];
    var total = files.reduce(function (s, f) { return s + (Number(f.size) || 0); }, 0);
    var kindLabel = KIND[row.kind] || '其他';

    document.title = (row.title || '资料详情') + ' · xinmo.work';
    $('dTitle').textContent = row.title || '未命名资料';
    var sub = $('dSubtitle');
    if (row.subtitle) { sub.textContent = row.subtitle; } else { sub.hidden = true; }

    var meta = [];
    meta.push('<span class="meta-chip">' + ICON_USER + esc(row.uploader || 'friend') + '</span>');
    meta.push('<span class="meta-chip">' + ICON_CAL + esc(fmtDate(row.created_at) || '—') + '</span>');
    meta.push('<span class="meta-chip">' + ICON_FILE + esc(kindLabel) + (files.length ? ' · ' + files.length + ' 个文件 · ' + fmtSize(total) : ' · 纯文字') + '</span>');
    $('dMeta').innerHTML = meta.join('');

    if (row.description) {
      $('descBlock').hidden = false;
      $('dDesc').textContent = row.description;
    }
    if (row.note) {
      $('noteBlock').hidden = false;
      $('dNote').textContent = row.note;
    }

    var grid = $('fileGrid');
    $('filesHead').textContent = files.length ? '文件（' + files.length + '）' : '文件';
    if (!files.length) {
      grid.innerHTML = '';
      $('fileEmpty').hidden = false;
    } else {
      $('fileEmpty').hidden = true;
      grid.innerHTML = files.map(function (f, i) {
        var url = publicUrl(f.path);
        var name = f.name || ('文件 ' + (i + 1));
        var img = isImage(f);
        var thumb = img
          ? '<div class="file-thumb" data-full="' + esc(url) + '" data-name="' + esc(name) + '" role="button" tabindex="0" aria-label="查看 ' + esc(name) + ' 大图">' +
              '<img src="' + esc(url) + '" alt="' + esc(name) + '" loading="lazy" />' +
            '</div>'
          : '<div class="file-thumb"><span class="ext">' + esc(extOf(name).slice(0, 5)) + '<small>' + fmtSize(f.size) + '</small></span></div>';
        return '<article class="file-card">' + thumb +
          '<div class="file-card-body">' +
            '<div class="file-name" title="' + esc(name) + '">' + esc(name) + '</div>' +
            '<div class="file-size">' + fmtSize(f.size) + '</div>' +
            '<div class="file-actions">' +
              '<a class="file-btn primary" href="' + esc(url) + '" target="_blank" rel="noopener">' + (img ? '看原图' : '下载') + '</a>' +
              (img ? '<a class="file-btn" href="' + esc(url) + '" target="_blank" rel="noopener" download="' + esc(name) + '">下载</a>' : '') +
            '</div>' +
          '</div></article>';
      }).join('');
    }

    loadingEl.hidden = true;
    errorBox.hidden = true;
    content.hidden = false;
  }

  // ---- 图片灯箱 ----
  var lightbox = $('lightbox');
  var lightboxImg = $('lightboxImg');
  function openBox(url, name) {
    if (!url) return;
    lightboxImg.src = url;
    lightboxImg.alt = name || '';
    lightbox.classList.add('show');
  }
  function closeBox() {
    lightbox.classList.remove('show');
    lightboxImg.removeAttribute('src');
  }
  $('fileGrid').addEventListener('click', function (e) {
    var box = e.target.closest('[data-full]');
    if (box) openBox(box.dataset.full, box.dataset.name);
  });
  $('fileGrid').addEventListener('keydown', function (e) {
    var box = e.target.closest('[data-full]');
    if (box && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openBox(box.dataset.full, box.dataset.name);
    }
  });
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox || e.target.id === 'lightboxClose') closeBox();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox.classList.contains('show')) closeBox();
  });

  // ---- 复制文字 ----
  var copyBtn = $('copyNote');
  copyBtn.addEventListener('click', function () {
    var text = $('dNote').textContent || '';
    function ok() { copyBtn.lastChild.textContent = ' 已复制'; setTimeout(function () { copyBtn.lastChild.textContent = ' 复制文字'; }, 1800); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok).catch(function () {});
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) {}
    document.body.removeChild(ta);
  });

  // ---- 读取数据 ----
  var id = '';
  try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) {}
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    showError('链接里缺少有效的资料编号。');
    return;
  }
  if (!base || !key) {
    showError('站点未配置 Supabase，暂时无法读取资料。');
    return;
  }

  fetch(base + '/rest/v1/' + encodeURIComponent(table) + '?id=eq.' + encodeURIComponent(id) + '&select=*', {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    cache: 'no-store'
  })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (rows) {
      if (!Array.isArray(rows) || !rows.length || (rows[0] && rows[0].uploader === 'selftest')) {
        showError('没有找到这条资料，可能已经被清理。');
        return;
      }
      render(rows[0]);
    })
    .catch(function (err) {
      showError('读取失败：' + (err && err.message ? err.message : '网络错误'));
    });
})();
