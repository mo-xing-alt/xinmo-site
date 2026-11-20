/* 私人记忆档案 · 应用逻辑
 * 只读 window.PMV_VAULT（密文），口令来自用户输入或 sessionStorage.xinmo_pmv_pass。
 * 不发起 fetch / XHR，不写入任何远端；解锁失败不写会话，锁定即清除会话与内存态。
 */
(function (global) {
  'use strict';

  var PASS_KEY = 'xinmo_pmv_pass';
  var THEME_KEY = 'xinmo-theme';
  var CATEGORY_LABELS = {
    USER: '用户档案',
    MEMORY: '长期记忆',
    PROJECTS: '项目状态',
    TOPIC: '主题笔记',
    PROMPT: '提示词'
  };
  var CATEGORY_ORDER = ['USER', 'MEMORY', 'PROJECTS', 'TOPIC', 'PROMPT'];

  var state = {
    vault: null,
    data: null,
    key: null,
    activeId: null,
    keyword: '',
    unlocking: false
  };

  var dom = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    dom.unlockView = byId('unlock-view');
    dom.appView = byId('app-view');
    dom.passInput = byId('pmv-pass');
    dom.unlockBtn = byId('pmv-unlock');
    dom.errorBox = byId('pmv-error');
    dom.search = byId('pmv-search');
    dom.nav = byId('pmv-nav');
    dom.docTitle = byId('pmv-doc-title');
    dom.docBody = byId('pmv-doc-body');
    dom.toc = byId('pmv-toc-list');
    dom.themeBtn = byId('pmv-theme');
    dom.lockBtn = byId('pmv-lock');
    dom.navToggle = byId('pmv-nav-toggle');
    dom.side = byId('pmv-side');
    dom.meta = byId('pmv-meta');
    dom.toast = byId('pmv-toast');
  }

  function showError(message) {
    if (dom.errorBox) {
      dom.errorBox.textContent = message || '';
    }
  }

  function toast(message) {
    if (!dom.toast) {
      return;
    }
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    global.clearTimeout(toast._timer);
    toast._timer = global.setTimeout(function () {
      dom.toast.classList.remove('is-visible');
    }, 2200);
  }

  function readSessionPass() {
    try {
      return global.sessionStorage.getItem(PASS_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function writeSessionPass(pass) {
    try {
      global.sessionStorage.setItem(PASS_KEY, pass);
    } catch (e) {
      /* 隐私模式下 sessionStorage 可能不可用：仍可在当前标签内使用 */
    }
  }

  function clearSessionPass() {
    try {
      global.sessionStorage.removeItem(PASS_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /** 校验 vault 结构，缺失时给出友好中文提示。 */
  function validateVault(vault) {
    if (!vault || typeof vault !== 'object') {
      return '档案数据不存在，请先在本机运行「生成私人档案.bat」。';
    }
    if (!vault.kdf || !vault.cipher || !vault.nonceB64 || !vault.verifierB64 || !vault.payloadB64) {
      return '档案数据不完整或已损坏，请重新生成。';
    }
    return '';
  }

  /** 派生 -> 校验 -> 解密 -> 写会话 -> 装载内存态。 */
  async function unlock(pass, silent) {
    var problem = validateVault(state.vault);
    if (problem) {
      showError(problem);
      return false;
    }
    if (state.unlocking) {
      return false;
    }
    state.unlocking = true;
    if (!silent) {
      showError('');
      if (dom.unlockBtn) {
        dom.unlockBtn.disabled = true;
        dom.unlockBtn.textContent = '正在解锁…';
      }
    }
    try {
      var crypto = global.PMVCrypto;
      var markdown = global.PMVMarkdown;
      if (!crypto || !markdown) {
        throw new Error('页面脚本未完整加载，请刷新重试。');
      }
      var aad = state.vault.cipher.aad || crypto.DEFAULT_AAD;
      var key = await crypto.deriveKey(pass, state.vault.kdf, ['decrypt']);
      var ok = await crypto.verifyPassword(key, state.vault.verifierB64, aad);
      if (!ok) {
        // 解锁失败：绝不写入会话
        clearSessionPass();
        showError('口令错误，请重试');
        return false;
      }
      var data = await crypto.decrypt(
        key, state.vault.nonceB64, state.vault.payloadB64, aad
      );
      if (!data || data.marker !== 'PMV_OK:v1') {
        clearSessionPass();
        showError('档案数据不可用，请重新生成。');
        return false;
      }
      if (!Array.isArray(data.sections)) {
        data.sections = [];
      }
      if (!Array.isArray(data.prompts)) {
        data.prompts = [];
      }

      state.key = key;
      state.data = data;
      state.activeId = data.sections.length ? data.sections[0].id : '__prompts__';
      writeSessionPass(pass);
      showApp();
      render();
      if (!silent) {
        if (dom.passInput) {
          dom.passInput.value = '';
        }
        toast('解锁成功');
      }
      return true;
    } catch (e) {
      clearSessionPass();
      showError(e && e.message ? e.message : '解锁失败，请重试');
      return false;
    } finally {
      state.unlocking = false;
      if (dom.unlockBtn) {
        dom.unlockBtn.disabled = false;
        dom.unlockBtn.textContent = '解锁档案';
      }
    }
  }

  /** 一键锁定：清除会话与内存态。 */
  function lock() {
    clearSessionPass();
    state.key = null;
    state.data = null;
    state.activeId = null;
    state.keyword = '';
    if (dom.search) {
      dom.search.value = '';
    }
    if (dom.nav) {
      dom.nav.innerHTML = '';
    }
    if (dom.docTitle) {
      dom.docTitle.textContent = '';
    }
    if (dom.docBody) {
      dom.docBody.innerHTML = '';
    }
    if (dom.toc) {
      dom.toc.innerHTML = '';
    }
    if (dom.meta) {
      dom.meta.textContent = '';
    }
    showError('');
    if (dom.appView) {
      dom.appView.hidden = true;
    }
    if (dom.unlockView) {
      dom.unlockView.hidden = false;
    }
    if (dom.passInput) {
      dom.passInput.value = '';
      global.setTimeout(function () { try { dom.passInput.focus(); } catch (e) {} }, 0);
    }
    toast('已锁定');
  }

  function showApp() {
    if (dom.unlockView) {
      dom.unlockView.hidden = true;
    }
    if (dom.appView) {
      dom.appView.hidden = false;
    }
    if (dom.meta && state.data && state.data.meta) {
      var meta = state.data.meta;
      dom.meta.textContent = '生成于 ' + (meta.generatedAt || '未知')
        + ' · ' + (meta.counts ? ('章节 ' + meta.counts.sections + ' / 提示词 ' + meta.counts.prompts) : '');
    }
  }

  function matches(item, keyword) {
    if (!keyword) {
      return true;
    }
    var haystack = [
      item.title || '', item.category || '', item.markdown || '',
      item.text || '', item.copyText || '', item.source || ''
    ].join(' ').toLowerCase();
    return haystack.indexOf(keyword.toLowerCase()) >= 0;
  }

  /** 渲染分类导航（含提示词入口）。 */
  function renderNav() {
    if (!dom.nav || !state.data) {
      return;
    }
    var sections = state.data.sections.filter(function (item) {
      return matches(item, state.keyword);
    });
    var prompts = state.data.prompts.filter(function (item) {
      return matches(item, state.keyword);
    });
    var html = [];
    var usedCategories = {};

    CATEGORY_ORDER.forEach(function (category) {
      var group = sections.filter(function (item) {
        return (item.category || 'TOPIC') === category;
      }).sort(function (a, b) {
        return Number(a.order || 0) - Number(b.order || 0);
      });
      if (!group.length) {
        return;
      }
      usedCategories[category] = true;
      html.push('<div class="pmv-nav-group">');
      html.push('<div class="pmv-nav-label">' + (CATEGORY_LABELS[category] || category)
        + '<span class="pmv-nav-count">' + group.length + '</span></div>');
      group.forEach(function (item) {
        html.push('<button type="button" class="pmv-nav-item'
          + (item.id === state.activeId ? ' is-active' : '')
          + '" data-section="' + escapeAttr(item.id) + '">' + escapeHtml(item.title) + '</button>');
      });
      html.push('</div>');
    });

    if (prompts.length) {
      html.push('<div class="pmv-nav-group">');
      html.push('<div class="pmv-nav-label">提示词速查<span class="pmv-nav-count">'
        + prompts.length + '</span></div>');
      html.push('<button type="button" class="pmv-nav-item'
        + (state.activeId === '__prompts__' ? ' is-active' : '')
        + '" data-section="__prompts__">全部提示词</button>');
      html.push('</div>');
    }

    if (!html.length) {
      html.push('<p class="pmv-nav-empty">没有匹配的内容，换个关键词试试。</p>');
    }
    dom.nav.innerHTML = html.join('');
  }

  function escapeHtml(value) {
    return global.PMVMarkdown.escapeHtml(value);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }

  function promptCard(prompt) {
    return ''
      + '<div class="pmv-prompt-card">'
      + '<div class="pmv-prompt-head">'
      + '<h3>' + escapeHtml(prompt.title || '未命名提示词') + '</h3>'
      + '<button type="button" class="pmv-copy-btn" data-copy="'
      + escapeAttr(prompt.copyText || prompt.text || '') + '">复制</button>'
      + '</div>'
      + (prompt.source ? '<div class="pmv-prompt-source">来源：' + escapeHtml(prompt.source) + '</div>' : '')
      + '<pre class="pmv-prompt-text">' + escapeHtml(prompt.text || prompt.copyText || '') + '</pre>'
      + '</div>';
  }

  /** 渲染右侧正文、TOC 与提示词卡片。 */
  function renderContent() {
    if (!dom.docTitle || !dom.docBody || !dom.toc || !state.data) {
      return;
    }
    var markdown = global.PMVMarkdown;

    if (state.activeId === '__prompts__') {
      var allPrompts = state.data.prompts.filter(function (item) {
        return matches(item, state.keyword);
      });
      dom.docTitle.textContent = '全部提示词';
      dom.docBody.innerHTML = allPrompts.length
        ? allPrompts.map(promptCard).join('')
        : '<p class="pmv-empty">没有匹配的提示词。</p>';
      dom.toc.innerHTML = '';
      return;
    }

    var section = null;
    for (var i = 0; i < state.data.sections.length; i += 1) {
      if (state.data.sections[i].id === state.activeId) {
        section = state.data.sections[i];
        break;
      }
    }
    if (!section && !state.keyword) {
      section = state.data.sections[0] || null;
    }
    if (!section) {
      dom.docTitle.textContent = state.keyword ? '没有匹配的内容' : '暂无内容';
      dom.docBody.innerHTML = state.keyword
        ? '<p class="pmv-empty">没有匹配的内容，换个关键词试试。</p>'
        : '<p class="pmv-empty">档案里还没有章节，请重新生成。</p>';
      dom.toc.innerHTML = '';
      return;
    }

    state.activeId = section.id;
    var rendered = markdown.renderWithToc(section.markdown || '');
    dom.docTitle.textContent = section.title || '未命名章节';
    var sourceLine = section.source
      ? '<div class="pmv-doc-source">来源：' + escapeHtml(section.source) + '</div>' : '';
    var related = (section.category === 'PROMPT')
      ? state.data.prompts.filter(function (item) { return item.source === section.source; })
      : [];
    var relatedHtml = related.length
      ? '<div class="pmv-related"><h2>可复制的提示词</h2>' + related.map(promptCard).join('') + '</div>'
      : '';
    dom.docBody.innerHTML = sourceLine + '<div class="md-body">'
      + (rendered.html || '<p class="pmv-empty">本章节暂无正文。</p>') + '</div>' + relatedHtml;

    var tocHtml = [];
    rendered.headings.forEach(function (heading) {
      tocHtml.push('<a class="pmv-toc-item pmv-toc-level-' + heading.level
        + '" href="#' + escapeAttr(heading.id) + '">' + escapeHtml(heading.text) + '</a>');
    });
    dom.toc.innerHTML = tocHtml.length
      ? tocHtml.join('')
      : '<span class="pmv-toc-empty">本章节无小标题</span>';
  }

  /** 全量渲染。 */
  function render() {
    renderNav();
    renderContent();
  }

  /** 搜索过滤：保留匹配章节与提示词，自动选中首个可见项。 */
  function filter(keyword) {
    state.keyword = String(keyword || '').trim();
    if (!state.data) {
      return;
    }
    var visible = state.data.sections.filter(function (item) {
      return matches(item, state.keyword);
    });
    var visiblePrompts = state.data.prompts.filter(function (item) {
      return matches(item, state.keyword);
    });
    var activeStillVisible = visible.some(function (item) {
      return item.id === state.activeId;
    });
    if (state.activeId === '__prompts__') {
      activeStillVisible = visiblePrompts.length > 0;
    }
    if (!activeStillVisible) {
      if (visible.length) {
        state.activeId = visible[0].id;
      } else if (visiblePrompts.length) {
        state.activeId = '__prompts__';
      } else {
        state.activeId = null;
      }
    }
    render();
  }

  /** 复制到剪贴板，navigator.clipboard 失败时降级 execCommand。 */
  async function copyText(text) {
    var value = String(text == null ? '' : text);
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      try {
        await global.navigator.clipboard.writeText(value);
        return true;
      } catch (e) {
        /* 继续走降级方案 */
      }
    }
    try {
      var area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /** 主题切换：同步 data-theme、localStorage 与 theme-color。 */
  function onThemeToggle() {
    var root = document.documentElement;
    var current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      global.localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* ignore */
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', next === 'dark' ? '#3a080b' : '#bc141b');
    }
    if (dom.themeBtn) {
      dom.themeBtn.textContent = next === 'dark' ? '☀ 浅色' : '☾ 深色';
      dom.themeBtn.setAttribute('aria-label', next === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    }
  }

  function syncThemeButton() {
    if (!dom.themeBtn) {
      return;
    }
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    dom.themeBtn.textContent = dark ? '☀ 浅色' : '☾ 深色';
    dom.themeBtn.setAttribute('aria-label', dark ? '切换到浅色主题' : '切换到深色主题');
  }

  function bindEvents() {
    if (dom.unlockBtn) {
      dom.unlockBtn.addEventListener('click', function () {
        var pass = dom.passInput ? dom.passInput.value.trim() : '';
        if (!pass) {
          showError('请输入站主口令');
          return;
        }
        unlock(pass, false);
      });
    }
    if (dom.passInput) {
      dom.passInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (dom.unlockBtn) {
            dom.unlockBtn.click();
          }
        }
      });
    }
    if (dom.search) {
      dom.search.addEventListener('input', function (event) {
        filter(event.target.value);
      });
    }
    if (dom.nav) {
      dom.nav.addEventListener('click', function (event) {
        var target = event.target.closest('[data-section]');
        if (!target) {
          return;
        }
        state.activeId = target.getAttribute('data-section');
        render();
        if (dom.side && dom.side.classList.contains('is-open')) {
          dom.side.classList.remove('is-open');
        }
        global.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (dom.docBody) {
      dom.docBody.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-copy]');
        if (!button) {
          return;
        }
        var ok = await copyText(button.getAttribute('data-copy'));
        toast(ok ? '已复制到剪贴板' : '复制失败，请手动选中文本');
      });
    }
    if (dom.themeBtn) {
      dom.themeBtn.addEventListener('click', onThemeToggle);
    }
    if (dom.lockBtn) {
      dom.lockBtn.addEventListener('click', lock);
    }
    if (dom.navToggle) {
      dom.navToggle.addEventListener('click', function () {
        if (dom.side) {
          dom.side.classList.toggle('is-open');
        }
      });
    }
  }

  /** 初始化：读取密文、恢复会话、绑定事件。 */
  function init() {
    cacheDom();
    bindEvents();
    syncThemeButton();
    state.vault = global.PMV_VAULT;

    var problem = validateVault(state.vault);
    if (problem) {
      if (dom.unlockBtn) {
        dom.unlockBtn.disabled = true;
      }
      showError(problem);
      return;
    }

    var saved = readSessionPass();
    if (saved) {
      showError('');
      unlock(saved, true).then(function (ok) {
        if (!ok) {
          showError('会话已失效，请重新输入口令');
          if (dom.unlockView) {
            dom.unlockView.hidden = false;
          }
        }
      });
    } else {
      showError('');
      if (dom.passInput) {
        global.setTimeout(function () { try { dom.passInput.focus(); } catch (e) {} }, 0);
      }
    }
  }

  global.PMVMemoryApp = {
    init: init,
    unlock: unlock,
    lock: lock,
    render: render,
    filter: filter,
    copyText: copyText,
    onThemeToggle: onThemeToggle,
    state: state
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
