/* xinmo.work · 上传资料（文件 + 文字 → Supabase Storage + public.uploads）
 * --------------------------------------------------------------
 * 仅登录用户可见（由 guard.js 守卫）。
 * 文件走 Storage 直传（XHR 带进度），文字与文件清单一并写进 uploads 表；
 * 完成后首页与 files.html 详情页都能看到。
 *
 * 权限边界：只使用 Supabase publishable key，桶策略只允许「新增」，
 * 不允许列目录 / 覆盖 / 删除，垃圾文件需站主在后台清理。
 */
(function () {
  'use strict';

  var cfg = window.XINMO_SUPABASE || {};
  var base = String(cfg.url || '').replace(/\/+$/, '');
  var key = cfg.key || '';
  var bucket = cfg.bucket || 'uploads';
  var table = cfg.uploadsTable || 'uploads';

  var MAX_FILE = 50 * 1024 * 1024;   // 单文件 50MB（与桶限制一致）
  var MAX_TOTAL = 200 * 1024 * 1024; // 单次合计 200MB
  var MAX_COUNT = 30;

  // ---- 登录账号 ----
  var who = 'friend';
  try {
    var sess = JSON.parse(localStorage.getItem('xinmo_access') || 'null');
    if (sess && sess.u) who = String(sess.u).slice(0, 64);
  } catch (e) {}
  var whoEl = document.getElementById('who');
  if (whoEl) whoEl.textContent = who;

  // ---- DOM ----
  var form = document.getElementById('uploadForm');
  var titleEl = document.getElementById('uTitle');
  var kindEl = document.getElementById('uKind');
  var subEl = document.getElementById('uSubtitle');
  var descEl = document.getElementById('uDesc');
  var noteEl = document.getElementById('uNote');
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('fileInput');
  var pickBtn = document.getElementById('pickBtn');
  var listEl = document.getElementById('fileList');
  var summaryEl = document.getElementById('fileSummary');
  var submitBtn = document.getElementById('uSubmit');
  var progressEl = document.getElementById('uProgress');
  var msgEl = document.getElementById('uMsg');
  var barEl = document.getElementById('uBar');
  var barFill = document.getElementById('uBarFill');
  var doneBox = document.getElementById('doneBox');
  var doneText = document.getElementById('doneText');
  var doneLink = document.getElementById('doneLink');
  var againBtn = document.getElementById('againBtn');

  if (!form) return;

  // ---- 状态 ----
  var picked = [];        // File[]
  var uploaded = {};      // fileKey -> { name, path, size, type }
  var sessionId = '';     // 本次提交的 uuid（重试时保持不变）
  var busy = false;

  function fileKey(f) { return [f.name, f.size, f.lastModified].join('|'); }

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function extOf(name) {
    var m = String(name || '').match(/\.([a-z0-9]{1,6})$/i);
    return m ? m[1].toUpperCase() : 'FILE';
  }

  function totalSize() {
    return picked.reduce(function (s, f) { return s + f.size; }, 0);
  }

  function renderList() {
    if (!picked.length) {
      listEl.innerHTML = '<li class="empty-tip">还没选文件。只提交文字也可以，跳过这里即可。</li>';
      summaryEl.textContent = '';
      return;
    }
    listEl.innerHTML = picked.map(function (f, i) {
      return '<li>' +
        '<span class="fl-badge">' + esc(extOf(f.name).slice(0, 4)) + '</span>' +
        '<span class="fl-body"><span class="fl-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
        '<span class="fl-size">' + fmtSize(f.size) + '</span></span>' +
        '<button class="fl-del" type="button" data-i="' + i + '" title="移除" aria-label="移除 ' + esc(f.name) + '">×</button>' +
        '</li>';
    }).join('');
    summaryEl.textContent = '共 ' + picked.length + ' 个文件 · ' + fmtSize(totalSize());
  }

  function addFiles(files) {
    if (!files || !files.length) return;
    var rejected = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f || !f.size && !f.name) continue;
      if (f.size > MAX_FILE) { rejected.push(f.name + '（超过 50MB）'); continue; }
      var dup = picked.some(function (x) { return fileKey(x) === fileKey(f); });
      if (dup) continue;
      if (picked.length >= MAX_COUNT) { rejected.push(f.name + '（最多 30 个）'); continue; }
      picked.push(f);
    }
    if (totalSize() > MAX_TOTAL) {
      while (picked.length && totalSize() > MAX_TOTAL) {
        var dropped = picked.pop();
        rejected.push(dropped.name + '（合计超过 200MB）');
      }
    }
    renderList();
    if (rejected.length) say('这些文件没有加入：' + rejected.join('；'), false);
    else say('');
    hideDone();
  }

  function say(text, ok) {
    msgEl.textContent = text || '';
    msgEl.className = 'gate-msg' + (ok ? ' ok' : '');
  }
  function setProgress(text) { progressEl.textContent = text || ''; }
  function setBar(ratio) {
    if (ratio == null) { barEl.classList.remove('show'); barFill.style.width = '0%'; return; }
    barEl.classList.add('show');
    barFill.style.width = Math.max(0, Math.min(100, ratio * 100)).toFixed(1) + '%';
  }
  function hideDone() { doneBox.hidden = true; form.hidden = false; }

  // ---- 选择 / 拖拽 / 粘贴 ----
  pickBtn.addEventListener('click', function (e) { e.stopPropagation(); fileInput.click(); });
  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () {
    addFiles(this.files);
    this.value = '';
  });

  var dragDepth = 0;
  ['dragenter', 'dragover'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault(); e.stopPropagation();
      if (evt === 'dragenter') dragDepth++;
      dropzone.classList.add('drag');
    });
  });
  dropzone.addEventListener('dragleave', function (e) {
    e.preventDefault(); e.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropzone.classList.remove('drag');
  });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault(); e.stopPropagation();
    dragDepth = 0; dropzone.classList.remove('drag');
    addFiles(e.dataTransfer && e.dataTransfer.files);
  });
  // 防止把文件拖到页面其它地方时浏览器直接打开
  ['dragover', 'drop'].forEach(function (evt) {
    window.addEventListener(evt, function (e) {
      if (e.target.closest && e.target.closest('#dropzone')) return;
      e.preventDefault();
    });
  });

  document.addEventListener('paste', function (e) {
    var panel = document.getElementById('panel-file');
    if (panel && panel.hidden) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    var items = e.clipboardData && e.clipboardData.files;
    if (items && items.length) {
      e.preventDefault();
      addFiles(items);
      say('已从剪贴板加入 ' + items.length + ' 个文件。', true);
    }
  });

  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-i]');
    if (!btn) return;
    picked.splice(Number(btn.dataset.i), 1);
    renderList();
  });

  // ---- 类型自动判断 ----
  function detectKind() {
    var v = kindEl.value;
    if (v && v !== 'auto') return v;
    if (!picked.length) return 'other';
    var names = picked.map(function (f) { return f.name.toLowerCase(); });
    var allImage = picked.every(function (f) { return /^image\//.test(f.type || ''); });
    if (allImage) return 'image';
    if (names.some(function (n) { return /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(n); })) return 'archive';
    if (names.some(function (n) { return /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|json)$/.test(n); })) return 'doc';
    return 'other';
  }

  // ---- 工具 ----
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.floor(Math.random() * 256); });
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function safeName(name) {
    var n = String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();
    if (n.length > 72) {
      var m = n.match(/\.([a-z0-9]{1,6})$/i);
      var ext = m ? '.' + m[1] : '';
      n = n.slice(0, 72 - ext.length) + ext;
    }
    return n || 'file';
  }

  function encodePath(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }

  function publicUrl(path) {
    return base + '/storage/v1/object/public/' + encodeURIComponent(bucket) + '/' + encodePath(path);
  }

  function friendlyError(status, body) {
    var text = '';
    try {
      var j = typeof body === 'string' ? JSON.parse(body) : body;
      text = (j && (j.message || j.error)) || '';
    } catch (e) { text = String(body || ''); }
    if (/bucket.*not.*found/i.test(text)) return '存储桶还没建好：请站主在 Supabase 执行 security/supabase-uploads.sql。';
    if (status === 413) return '文件太大，单个文件请控制在 50MB 以内。';
    if (status === 401 || status === 403 || /row-level security|policy/i.test(text)) {
      return '上传权限还没开通：请站主在 Supabase 执行 security/supabase-uploads.sql 后再试。';
    }
    return text ? '失败（HTTP ' + status + '）：' + text.slice(0, 160) : '失败（HTTP ' + status + '）';
  }

  // ---- 直传单个文件（带进度） ----
  function uploadOne(file, path, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', base + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + encodePath(path));
      xhr.setRequestHeader('apikey', key);
      xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.timeout = 10 * 60 * 1000;
      xhr.upload.onprogress = function (ev) {
        if (ev.lengthComputable && onProgress) onProgress(ev.loaded);
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          var body = null;
          try { body = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
          resolve(body || {});
        } else {
          reject(new Error(friendlyError(xhr.status, xhr.responseText)));
        }
      };
      xhr.onerror = function () { reject(new Error('网络中断，请检查网络后重试（已传完的文件不会重复上传）。')); };
      xhr.ontimeout = function () { reject(new Error('上传超时，请重试。')); };
      xhr.send(file);
    });
  }

  // ---- 提交 ----
  async function doSubmit(e) {
    e.preventDefault();
    if (busy) return;

    if (!base || !key) { say('站点的 Supabase 配置缺失，请联系站主。'); return; }

    var title = titleEl.value.trim();
    var note = noteEl.value;
    if (!title) { say('请先填写「资料标题」。'); titleEl.focus(); return; }
    if (!picked.length && !note.trim()) {
      say('请至少选择文件，或者在「文字内容」里写点东西。');
      noteEl.focus();
      return;
    }
    if (picked.length > MAX_COUNT) { say('一次最多传 30 个文件。'); return; }
    for (var k = 0; k < picked.length; k++) {
      if (picked[k].size > MAX_FILE) { say('「' + picked[k].name + '」超过 50MB，请压缩后再传。'); return; }
    }
    if (totalSize() > MAX_TOTAL) { say('文件合计超过 200MB，请分批上传。'); return; }

    // 预检：表还没建就先别传文件，避免传完才发现写不进索引
    try {
      var chk = await fetch(base + '/rest/v1/' + encodeURIComponent(table) + '?select=id&limit=1', {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
        cache: 'no-store'
      });
      if (!chk.ok) throw new Error(String(chk.status));
    } catch (err) {
      say('资料表还没准备好：请站主在 Supabase 执行 security/supabase-uploads.sql 后再试。');
      return;
    }

    if (!sessionId) sessionId = uuid();
    var id = sessionId;
    var kind = detectKind();

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '上传中…';
    hideDone();
    say('');
    setBar(0);

    try {
      var filesMeta = [];
      var totalBytes = totalSize();
      var doneBytes = 0;

      for (var i = 0; i < picked.length; i++) {
        var f = picked[i];
        var kk = fileKey(f);

        if (uploaded[kk]) {
          filesMeta.push(uploaded[kk]);
          doneBytes += f.size;
          continue;
        }

        var path = id + '/' + (i + 1) + '-' + safeName(f.name);
        setProgress('正在上传 ' + (i + 1) + '/' + picked.length + '：' + f.name + '（' + fmtSize(f.size) + '）');

        var baseDone = doneBytes;
        await uploadOne(f, path, function (loaded) {
          var ratio = totalBytes ? (baseDone + loaded) / totalBytes : 0;
          setBar(ratio);
          setProgress('正在上传 ' + (i + 1) + '/' + picked.length + '：' + f.name +
            '（' + Math.round((loaded / (f.size || 1)) * 100) + '%）');
        });

        var meta = { name: f.name, path: path, size: f.size, type: f.type || '' };
        uploaded[kk] = meta;
        filesMeta.push(meta);
        doneBytes += f.size;
        setBar(totalBytes ? doneBytes / totalBytes : 0);
      }

      setProgress('正在写入资料清单…');

      var row = {
        id: id,
        title: title,
        subtitle: subEl.value.trim() || null,
        description: descEl.value.trim() || null,
        note: note.trim() ? note : null,
        kind: kind,
        files: filesMeta,
        uploader: who
      };

      var res = await fetch(base + '/rest/v1/' + encodeURIComponent(table), {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(row)
      });

      if (!res.ok) {
        var t = await res.text();
        throw new Error(friendlyError(res.status, t));
      }

      setBar(1);
      setProgress('');
      form.hidden = true;
      doneBox.hidden = false;
      doneText.textContent = '「' + title + '」已经收进仓库，首页和资料页都能看到了。';
      doneLink.href = './files.html?id=' + encodeURIComponent(id);
      doneBox.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // 重置，便于继续上传
      picked = []; uploaded = {}; sessionId = '';
      form.reset();
      renderList();
      submitBtn.disabled = false;
      submitBtn.textContent = '上传资料';
      setBar(null);
      say('');
      busy = false;
    } catch (err) {
      setBar(null);
      setProgress('');
      say(err && err.message ? err.message : '上传失败，请重试。');
      submitBtn.disabled = false;
      submitBtn.textContent = '重试上传';
      busy = false;
    }
  }

  form.addEventListener('submit', doSubmit);

  againBtn.addEventListener('click', function () {
    hideDone();
    titleEl.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  renderList();
})();
