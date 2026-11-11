/* xinmo.work · 上传资料页逻辑（零依赖，浏览器直连 GitHub Git Data API）
 * --------------------------------------------------------------
 * 仅登录用户可见（由 guard.js 守卫）。提交为「一次原子提交」：
 * 先把每个文件做成 blob，再连同更新后的 manifest.json 合成一个 tree，
 * 然后创建 commit 并更新分支引用。这样即使朋友同时上传也不会互相覆盖，
 * 且单个文件可超过 GitHub Contents API 的 1MB 限制。
 *
 * 安全边界：本页的写令牌写在公开静态文件里，理论上任何能看到源码的人
 * 都能写仓库。因此令牌必须是「只写本仓库、无删除权」的细粒度令牌，
 * 且可随时在 GitHub 吊销。所有提交都会署名上传者（登录账号）。
 */
(function () {
  'use strict';

  var cfg = window.XINMO_UPLOAD || {};
  var apiBase = cfg.apiBase || 'https://api.github.com';
  var owner = cfg.owner || 'mo-xing-alt';
  var repo = cfg.repo || 'xinmo-site';
  var branch = cfg.branch || 'main';
  var token = cfg.token || '';

  var KEY = 'xinmo_access';
  function getSession() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  var sess = getSession();
  var who = (sess && sess.u) ? sess.u : 'anonymous';

  // ---- DOM ----
  var form = document.getElementById('uploadForm');
  var titleEl = document.getElementById('fTitle');
  var subEl = document.getElementById('fSubtitle');
  var descEl = document.getElementById('fDesc');
  var catEl = document.getElementById('fCategory');
  var tagsEl = document.getElementById('fTags');
  var entryEl = document.getElementById('fEntry');
  var folderInput = document.getElementById('folderInput');
  var filesInput = document.getElementById('filesInput');
  var fileListEl = document.getElementById('fileList');
  var progressEl = document.getElementById('progress');
  var msgEl = document.getElementById('msg');
  var btn = document.getElementById('submitBtn');
  var whoEl = document.getElementById('who');

  if (whoEl) whoEl.textContent = who;

  // ---- 文件收集 ----
  var picked = []; // { file, rel }
  function addPicked(fileList, fromFolder) {
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var rel = fromFolder && f.webkitRelativePath ? f.webkitRelativePath : f.name;
      picked.push({ file: f, rel: rel });
    }
    renderList();
  }
  folderInput.addEventListener('change', function () { addPicked(this.files, true); });
  filesInput.addEventListener('change', function () { addPicked(this.files, false); });

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  function renderList() {
    if (!picked.length) { fileListEl.innerHTML = '<li class="empty-tip">还没选文件，先点上面的按钮。</li>'; return; }
    var id = currentId();
    var html = '';
    for (var i = 0; i < picked.length; i++) {
      var p = picked[i];
      var relNoTop = p.rel.indexOf('/') >= 0 ? p.rel.split('/').slice(1).join('/') : p.rel;
      var target = 'uploads/' + id + '/' + relNoTop;
      html += '<li><span class="fl-name">' + esc(p.file.name) + '</span>' +
        '<span class="fl-size">' + fmtSize(p.file.size) + '</span>' +
        '<span class="fl-path">→ ' + esc(target) + '</span></li>';
    }
    fileListEl.innerHTML = html;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function slugify(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[^\w一-龥]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || ('res-' + Date.now());
  }
  function currentId() { return slugify(titleEl.value) || ('res-' + Date.now()); }

  titleEl.addEventListener('input', renderList);

  // ---- GitHub API ----
  function api(method, path, payload) {
    var url = apiBase + '/repos/' + owner + '/' + repo + path;
    return fetch(url, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var body = null; try { body = t ? JSON.parse(t) : null; } catch (e) {}
        return { ok: r.ok, status: r.status, body: body, raw: t };
      });
    });
  }

  function toBase64(bytes) {
    var bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function strToBytes(str) { return new TextEncoder().encode(str); }
  function today() { return new Date().toISOString().slice(0, 10); }

  function iconFor(cat) {
    return ({ study: 'quiz', tool: 'tool', doc: 'doc', link: 'link', code: 'code' })[cat] || 'link';
  }
  function accentFor(cat) {
    return ({ study: 'teal', tool: 'indigo', doc: 'violet', link: 'amber', code: 'indigo' })[cat] || 'indigo';
  }

  function say(text, kind) {
    msgEl.textContent = text;
    msgEl.className = 'gate-msg' + (kind ? ' ' + kind : '');
  }
  function setProgress(text) { progressEl.textContent = text; }

  async function getCurrentManifest() {
    var r = await api('GET', '/contents/manifest.json');
    if (r.ok && r.body && r.body.content) {
      try {
        var txt = atob(r.body.content.replace(/\s/g, ''));
        var obj = JSON.parse(txt);
        if (obj && Array.isArray(obj.items)) return obj;
      } catch (e) {}
    }
    return { updated: '', categories: [], items: [] };
  }

  async function commitAll(headSha, fileEntries, manifestSha, message) {
    var treeEntries = fileEntries.map(function (e) {
      return { path: e.path, mode: '100644', type: 'blob', sha: e.sha };
    });
    treeEntries.push({ path: 'manifest.json', mode: '100644', type: 'blob', sha: manifestSha });
    var treeRes = await api('POST', '/git/trees', { base_tree: headSha, tree: treeEntries });
    if (!treeRes.ok) throw new Error('创建文件树失败 (HTTP ' + treeRes.status + ')');
    var commitRes = await api('POST', '/git/commits', {
      message: message,
      tree: treeRes.body.sha,
      parents: [headSha],
      author: { name: who, email: who + '@xinmo.work' }
    });
    if (!commitRes.ok) throw new Error('创建提交失败 (HTTP ' + commitRes.status + ')');
    var patchRes = await api('PATCH', '/git/refs/heads/' + branch, { sha: commitRes.body.sha, force: false });
    return patchRes.ok;
  }

  async function doUpload(e) {
    e.preventDefault();
    if (!token || token.indexOf('REPLACE') === 0) {
      say('上传令牌还没配置，请联系站主在 upload-config.js 填入细粒度令牌。', 'err');
      return;
    }
    var title = titleEl.value.trim();
    if (!title) { say('请先填写「资源标题」。', 'err'); titleEl.focus(); return; }
    if (!picked.length) { say('请先选择要上传的文件或文件夹。', 'err'); return; }

    var id = currentId();
    var category = catEl.value;
    var entry = (entryEl.value.trim() || 'index.html');
    var base = 'uploads/' + id + '/';
    var tags = tagsEl.value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);

    var item = {
      id: id,
      title: title,
      subtitle: subEl.value.trim(),
      description: descEl.value.trim(),
      category: category,
      icon: iconFor(category),
      accent: accentFor(category),
      url: './' + base + entry,
      tags: tags,
      meta: '朋友上传 · by ' + who,
      status: '可用',
      updated: today()
    };

    btn.disabled = true; btn.textContent = '提交中…';
    say('正在读取仓库最新状态…');

    try {
      var headRes = await api('GET', '/git/ref/heads/' + branch);
      if (!headRes.ok) throw new Error('读取分支失败 (HTTP ' + headRes.status + ')');
      var headSha = headRes.body.object.sha;

      var fileEntries = [];
      for (var i = 0; i < picked.length; i++) {
        setProgress('上传文件 ' + (i + 1) + '/' + picked.length + '：' + picked[i].file.name);
        var relNoTop = picked[i].rel.indexOf('/') >= 0 ? picked[i].rel.split('/').slice(1).join('/') : picked[i].rel;
        var buf = await picked[i].file.arrayBuffer();
        var b64 = toBase64(new Uint8Array(buf));
        var br = await api('POST', '/git/blobs', { content: b64, encoding: 'base64' });
        if (!br.ok) throw new Error('上传文件失败 (HTTP ' + br.status + ')：' + picked[i].file.name);
        fileEntries.push({ path: base + relNoTop, sha: br.body.sha });
      }

      setProgress('更新资源清单 manifest.json…');
      var cur = await getCurrentManifest();
      cur.items.push(item);
      cur.updated = today();
      var mStr = JSON.stringify(cur, null, 2);
      var mbr = await api('POST', '/git/blobs', { content: toBase64(strToBytes(mStr)), encoding: 'base64' });
      if (!mbr.ok) throw new Error('写入清单失败 (HTTP ' + mbr.status + ')');

      var message = 'feat: 上传「' + title + '」 by ' + who;
      var ok = false, attempt = 0;
      while (!ok && attempt < 4) {
        setProgress(attempt === 0 ? '提交到仓库…' : '检测到并发提交，自动重试 ' + attempt + '…');
        ok = await commitAll(headSha, fileEntries, mbr.body.sha, message);
        if (!ok) {
          var hr = await api('GET', '/git/ref/heads/' + branch);
          if (!hr.ok) throw new Error('重试时读取分支失败');
          headSha = hr.body.object.sha;
          attempt++;
        }
      }
      if (!ok) throw new Error('提交冲突，请稍后重试。');

      setProgress('');
      say('提交成功！GitHub Pages 约 1 分钟内重建，回到首页刷新即可看到。', 'ok');
      btn.textContent = '再传一个';
      btn.disabled = false;
      // 清空表单，方便连续上传
      picked = [];
      form.reset();
      renderList();
    } catch (err) {
      setProgress('');
      say(err && err.message ? err.message : '上传失败，请重试。', 'err');
      btn.disabled = false; btn.textContent = '提交到仓库';
    }
  }

  form.addEventListener('submit', doUpload);
  renderList();
})();
