/*
 * js/ui.js
 * DOM 渲染、9 个视图、表单编辑器、Modal / Toast / 确认框、统一事件委托。
 * 所有视图决策数据来自 ctx.state；引擎事件只订阅、不参与调度决策。
 * 顶层不访问 DOM，因此在 Node 下 require 也是安全的（便于做静态检查）。
 */
(function (root) {
  'use strict';

  var SR = root.SR || (root.SR = {});
  var isNode = (typeof module !== 'undefined' && !!module.exports);
  var core = isNode ? require('./core.js') : SR.core;
  var data = isNode ? require('./data.js') : SR.data;
  var locators = isNode ? require('./locators.js') : SR.locators;
  var engine = isNode ? require('./engine.js') : SR.engine;
  var exporter = isNode ? require('./exporter.js') : SR.exporter;

  // 第 9 个视图：本地运行时（桌面 / 小程序 / 移动通道的能力矩阵与前置条件）。
  var VIEWS = ['dashboard', 'adapters', 'templates', 'policies', 'sandbox', 'logs', 'exporter', 'localrunner', 'help'];

  var ctx = null;
  var currentView = 'dashboard';
  var filters = { taskSearch: '', taskType: 'all', taskStatus: 'all', logTask: 'all', logLevel: 'all' };

  function freshSandboxData() {
    return { remainingMs: 0, attempts: 0, maxAttempts: 0, stock: 0, state: 'idle', outcome: null, phase: 'idle' };
  }

  var uiState = {
    modal: null,
    confirm: null,
    editor: {},
    revealed: {},
    engineStatus: { running: false, paused: false, state: 'idle' },
    sandboxData: freshSandboxData(),
    sandboxLogs: [],
    exportTaskId: '',
    exportScript: '',
    exportIncludeSecrets: false,
    localrunnerTaskId: '',
    adapterChannelDraft: 'web'
  };

  /* ------------------------------------------------------------ 基础辅助 */

  function state() { return ctx ? ctx.state : {}; }
  function save() { if (ctx && typeof ctx.save === 'function') ctx.save(); }
  function addLog(level, message, taskId) {
    if (ctx && typeof ctx.addLog === 'function') ctx.addLog(level, message, taskId);
  }
  function engineStatus() {
    return (ctx && typeof ctx.getEngineStatus === 'function')
      ? ctx.getEngineStatus()
      : { running: false, paused: false, state: 'idle' };
  }
  function el(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
  function esc(value) { return core.escapeHtml(value); }
  function val(scope, selector) {
    var node = scope.querySelector(selector);
    return node ? node.value : '';
  }
  function valOf(selector) {
    var node = typeof document !== 'undefined' ? document.querySelector(selector) : null;
    return node ? node.value : '';
  }
  function checkedOf(selector) {
    var node = typeof document !== 'undefined' ? document.querySelector(selector) : null;
    return !!(node && node.checked);
  }
  function numOf(selector, fallback) {
    var n = Number(valOf(selector));
    return isFinite(n) ? n : fallback;
  }
  function findById(listName, id) {
    var list = state()[listName] || [];
    for (var i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];
    return null;
  }
  function nameOf(listName, id) {
    var item = findById(listName, id);
    return item ? item.name : '未关联';
  }
  function upsert(listName, item) {
    var list = state()[listName] || (state()[listName] = []);
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === item.id) { list[i] = item; return; }
    }
    list.push(item);
  }
  function removeFrom(listName, id) {
    state()[listName] = (state()[listName] || []).filter(function (x) { return x.id !== id; });
  }
  function findCard(tplId) {
    if (typeof document === 'undefined') return null;
    var cards = document.querySelectorAll('[data-template-card]');
    for (var i = 0; i < cards.length; i += 1) {
      if (cards[i].getAttribute('data-template-card') === tplId) return cards[i];
    }
    return null;
  }
  function phaseLabel(stateName) {
    var map = {
      idle: '空闲', scheduled: '已装载', waiting: '等待开放', polling: '轮询中',
      filling: '填表中', confirming: '等待确认', submitting: '提交中', paused: '已暂停',
      success: '成功', failed: '失败', aborted: '已中止'
    };
    return map[stateName] || stateName;
  }
  function sanitizeFile(name) {
    var s = String(name || 'slotrunner').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
    return (s || 'slotrunner').slice(0, 60);
  }
  function complianceOk(silent) {
    var ok = state().settings && state().settings.complianceAccepted === true;
    if (!ok && !silent) {
      toast('请先在「帮助与合规」页勾选合规确认', 'error');
      navigate('help');
    }
    return ok;
  }

  /* ---------------------------------------------------------- HTML 组件 */

  function badge(text, tone, dot) {
    return '<span class="badge badge--' + (tone || 'neutral') + '">' +
      (dot ? '<span class="badge__dot"></span>' : '') + esc(text) + '</span>';
  }
  function pageHead(title, desc, actions) {
    return '<div class="page-head"><div><h1 class="page-head__title">' + esc(title) + '</h1>' +
      '<p class="page-head__desc">' + esc(desc) + '</p></div>' +
      '<div class="page-head__actions">' + (actions || '') + '</div></div>';
  }
  function notice(innerHtml, tone) {
    return '<div class="notice' + (tone ? ' notice--' + tone : '') + '">' +
      '<span class="notice__mark">i</span><div>' + innerHtml + '</div></div>';
  }
  function emptyState(title, desc, actions) {
    return '<div class="empty"><div class="empty__icon">◇</div>' +
      '<div class="empty__title">' + esc(title) + '</div>' +
      '<div class="empty__desc">' + esc(desc) + '</div>' + (actions || '') + '</div>';
  }
  function progressBar(percent, tone) {
    var pct = Math.max(0, Math.min(100, Math.round(percent)));
    return '<div class="progress"><div class="progress__bar' + (tone ? ' progress__bar--' + tone : '') +
      '" style="width:' + pct + '%"></div></div>';
  }
  function optionsHtml(map, selected, allLabel) {
    var out = allLabel
      ? '<option value="all"' + (selected === 'all' ? ' selected' : '') + '>' + esc(allLabel) + '</option>'
      : '';
    Object.keys(map).forEach(function (key) {
      var item = map[key];
      var label = (typeof item === 'string') ? item : (item && item.label ? item.label : key);
      out += '<option value="' + esc(key) + '"' + (selected === key ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    return out;
  }
  function inputField(label, id, type, value, hint) {
    return '<div class="field"><label class="field__label" for="' + id + '">' + esc(label) + '</label>' +
      '<input class="input" id="' + id + '" type="' + type + '" value="' + esc(value) + '">' +
      (hint ? '<span class="field__hint">' + esc(hint) + '</span>' : '') + '</div>';
  }
  function numberField(label, id, value, min, hint) {
    return '<div class="field"><label class="field__label" for="' + id + '">' + esc(label) + '</label>' +
      '<input class="input" id="' + id + '" type="number" min="' + (min || 0) + '" value="' + esc(value) + '">' +
      (hint ? '<span class="field__hint">' + esc(hint) + '</span>' : '') + '</div>';
  }
  function selectField(label, id, inner) {
    return '<div class="field"><label class="field__label" for="' + id + '">' + esc(label) + '</label>' +
      '<select class="select" id="' + id + '">' + inner + '</select></div>';
  }
  function checkboxField(id, label, checked) {
    return '<label class="checkbox"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '> ' +
      esc(label) + '</label>';
  }
  function eyeSvg() {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>';
  }
  function eyeOffSvg() {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l16 16"></path><path d="M9.5 5.4A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.3 3.1M6.2 7.2A17 17 0 0 0 2 12s3.6 7 10 7c1.3 0 2.5-.3 3.5-.7"></path></svg>';
  }
  function stepHtml(no, title, desc) {
    return '<div class="step"><div class="step__no">' + no + '</div><div>' +
      '<div class="step__title">' + esc(title) + '</div>' +
      '<div class="step__desc">' + esc(desc) + '</div></div></div>';
  }

  /* ------------------------------------------------------------ 视图 1：任务中心 */

  function filteredTasks() {
    var q = String(filters.taskSearch || '').trim().toLowerCase();
    return (state().tasks || []).filter(function (t) {
      if (filters.taskType !== 'all' && t.type !== filters.taskType) return false;
      if (filters.taskStatus !== 'all' && t.status !== filters.taskStatus) return false;
      if (!q) return true;
      return [t.name, t.targetUrl, t.note].join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  function taskCardHtml(t) {
    var typeMeta = core.TASK_TYPES[t.type] || { label: '其他', glyph: '?' };
    var statusMeta = core.TASK_STATUSES[t.status] || { label: t.status, tone: 'neutral' };
    var policy = findById('policies', t.policyId);
    var openAt = policy ? core.formatDateTime(policy.openAt) : '—';
    var lastRun = t.lastRun
      ? core.formatDateTime(t.lastRun.ts) + ' · ' + String(t.lastRun.outcome || '') + '（' + (t.lastRun.attempts || 0) + ' 次）'
      : '尚未运行';
    var running = engineStatus().running;
    var linkedAdapter = findById('adapters', t.adapterId) || {};
    var taskChannel = locators.normalizeChannel(linkedAdapter.channel || t.channel);

    return '<article class="card task-card">' +
      '<div class="task-card__head"><span class="type-glyph">' + esc(typeMeta.glyph) + '</span>' +
        '<div style="flex:1;min-width:0"><h3 class="task-card__title">' + esc(t.name) + '</h3>' +
        '<div class="mt-8" style="display:flex;gap:6px;flex-wrap:wrap">' +
          badge(typeMeta.label, 'primary') + badge(statusMeta.label, statusMeta.tone) +
          channelBadgeHtml(taskChannel) +
        '</div></div></div>' +
      '<dl class="task-card__meta">' +
        '<dt>目标页面</dt><dd class="mono">' + esc(t.targetUrl || '（非 Web 通道由窗口绑定承载）') + '</dd>' +
        '<dt>开放时间</dt><dd>' + esc(openAt) + '</dd>' +
        '<dt>适配器</dt><dd>' + esc(nameOf('adapters', t.adapterId)) + '</dd>' +
        '<dt>调度策略</dt><dd>' + esc(nameOf('policies', t.policyId)) + '</dd>' +
        '<dt>最后结果</dt><dd>' + esc(lastRun) + '</dd>' +
      '</dl>' +
      (t.note ? '<div class="task-card__note">' + esc(t.note) + '</div>' : '') +
      '<div class="task-card__actions">' +
        (running
          ? '<button type="button" class="btn btn--danger btn--sm" data-action="task-stop" data-id="' + esc(t.id) + '">■ 停止演练</button>'
          : '<button type="button" class="btn btn--soft btn--sm" data-action="task-start" data-id="' + esc(t.id) + '">▶ 启动演练</button>') +
        '<button type="button" class="btn btn--sm" data-action="task-edit" data-id="' + esc(t.id) + '">编辑</button>' +
        '<button type="button" class="btn btn--sm" data-action="task-copy" data-id="' + esc(t.id) + '">复制</button>' +
        '<button type="button" class="btn btn--sm btn--danger" data-action="task-delete" data-id="' + esc(t.id) + '">删除</button>' +
      '</div></article>';
  }

  function renderTaskList() {
    var box = el('task-list');
    if (!box) return;
    var list = filteredTasks();
    var count = el('task-count');
    if (count) count.textContent = '共 ' + list.length + ' 个任务';
    if (!list.length) {
      box.innerHTML = '<div class="card">' + emptyState(
        '暂无匹配任务',
        (state().tasks || []).length
          ? '试试调整搜索关键词或筛选条件。'
          : '创建第一个任务：选择适配器、表单模板与调度策略，然后进入演练沙箱验证完整流程。',
        '<button type="button" class="btn btn--primary btn--sm" data-action="task-new">＋ 新建任务</button>'
      ) + '</div>';
      return;
    }
    box.innerHTML = list.map(taskCardHtml).join('');
  }

  function renderDashboard() {
    var html = pageHead('任务中心',
      '集中管理抢课 / 抢票 / 名额 / 表单任务。浏览器同源策略决定 Web 页面无法跨域操作别的站点，因此这里负责配置、调度与本地演练；实际填表由您自行安装 UserScript 在授权页面上完成。',
      '<button type="button" class="btn btn--primary" data-action="task-new">＋ 新建任务</button>');
    html += '<div class="toolbar">' +
      '<div class="toolbar__group"><input class="input" style="width:230px" type="search" placeholder="搜索名称 / URL / 备注" value="' + esc(filters.taskSearch) + '" data-action="task-search" aria-label="搜索任务"></div>' +
      '<div class="toolbar__group"><select class="select" style="width:132px" data-action="task-filter-type" aria-label="按类型筛选">' + optionsHtml(core.TASK_TYPES, filters.taskType, '全部类型') + '</select></div>' +
      '<div class="toolbar__group"><select class="select" style="width:132px" data-action="task-filter-status" aria-label="按状态筛选">' + optionsHtml(core.TASK_STATUSES, filters.taskStatus, '全部状态') + '</select></div>' +
      '<div class="toolbar__spacer"></div><span class="tiny" id="task-count"></span></div>';
    html += '<div class="grid grid--2" id="task-list"></div>';
    return html;
  }

  /* ------------------------------------------------------------ 视图 2：适配器 */

  function channelBadgeHtml(channel) {
    var ch = locators.normalizeChannel(channel);
    var tone = ch === 'web' ? 'info' : (ch === 'mobile' ? 'warn' : 'primary');
    return '<span class="channel-badge badge badge--' + tone + '">' +
      '<span class="badge__dot"></span>' + esc(locators.channelLabel(ch)) + '</span>';
  }

  function adapterCardHtml(a) {
    var ch = locators.normalizeChannel(a.channel);
    var cap = locators.capabilityOf(ch);
    var rows = (a.fields || []).map(function (f) {
      return '<tr><td class="mono">' + esc(f.key) + '</td><td class="mono">' + esc(f.selector) + '</td>' +
        '<td>' + badge(f.mode, 'neutral') + '</td></tr>';
    }).join('');
    var locatorRows = (a.locators || []).map(function (l, i) {
      return '<tr><td>' + badge(String((l && l.kind) || 'css'), 'neutral') + '</td>' +
        '<td class="mono">' + esc(String((l && l.value) || '')) + '</td></tr>';
    }).join('');
    var isWeb = ch === 'web';
    var detailRows = isWeb
      ? '<div class="table-wrap"><table class="table table--compact"><thead><tr><th>key</th><th>选择器</th><th>模式</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="3" class="tiny">暂无字段</td></tr>') + '</tbody></table></div>' +
        '<div class="tiny mt-12">提交按钮：<span class="mono">' + esc(a.submitSelector) + '</span></div>' +
        '<div class="tiny">成功关键词：<span class="mono">' + esc(a.successKeyword || '—') + '</span></div>' +
        '<div class="tiny">验证码检测：<span class="mono">' + esc(a.captchaSelector) + '</span></div>'
      : '<div class="tiny mono mt-8">窗口绑定：' + esc((a.target && (a.target.processName || a.target.windowTitle)) || '—') +
        '（' + esc((a.target && a.target.windowMatchMode) || 'contains') + '）</div>' +
        '<div class="table-wrap mt-8"><table class="table table--compact"><thead><tr><th>kind</th><th>定位值</th></tr></thead><tbody>' +
        (locatorRows || '<tr><td colspan="2" class="tiny">暂无定位器</td></tr>') + '</tbody></table></div>' +
        '<div class="tiny">验证码检测定位器：<span class="mono">' +
        esc(locatorSummary(a.captchaLocator)) + '</span></div>' +
        '<div class="tiny">成功关键词：<span class="mono">' +
        esc((a.successLocators || []).join('、') || '—') + '</span></div>';

    var capabilityLine = '<div class="channel-meta mt-8">' +
      badge('典型延迟 ' + cap.latencyText, 'neutral') +
      (cap.reservationOnly ? badge('仅适用预约类', 'warn') : '') +
      (cap.canBackground ? '' : badge('需窗口可见', 'neutral')) + '</div>';

    return '<article class="card"><div class="card__head"><div style="min-width:0">' +
      '<h3 class="card__title">' + esc(a.name) + '</h3>' +
      '<div class="tiny mono">' + esc(isWeb ? a.urlPattern : ((a.target && a.target.windowTitle) || '未绑定窗口')) + '</div></div>' +
      channelBadgeHtml(ch) + '</div>' +
      '<div class="card__body"><p class="tiny" style="margin:0 0 10px">' + esc(a.description || '') + '</p>' +
      capabilityLine + detailRows + '</div>' +
      '<div class="card__foot">' +
        '<button type="button" class="btn btn--sm" data-action="adapter-edit" data-id="' + esc(a.id) + '">编辑</button>' +
        '<button type="button" class="btn btn--sm" data-action="adapter-copy" data-id="' + esc(a.id) + '">复制</button>' +
        '<button type="button" class="btn btn--sm btn--danger" data-action="adapter-delete" data-id="' + esc(a.id) + '">删除</button>' +
      '</div></article>';
  }

  /** 把定位器对象 / 字符串压缩成卡片上的可读摘要。 */
  function locatorSummary(loc) {
    if (loc === undefined || loc === null || loc === '') return '—';
    if (typeof loc === 'string') return loc;
    return String(loc.kind || '') + ':' + String(loc.value === undefined ? '' : loc.value);
  }

  function renderAdapters() {
    var html = pageHead('适配器',
      '描述目标表单的定位方式。Web 通道用 DOM 选择器；桌面 / 小程序 / 移动通道用窗口绑定 + 定位器。示例全部为通用占位配置，不针对任何真实站点或软件。',
      '<button type="button" class="btn btn--primary" data-action="adapter-new">＋ 新建适配器</button>');
    html += notice('<strong>合规提示：</strong>所有通道都禁止填写接口地址或后台请求调用，且「验证码检测项」为必填项，检测到验证挑战时立即中止并提示人工接管。非 Web 通道的 UI 自动化仅适用于预约类任务，详见「本地运行时」页。', 'warn');
    var list = state().adapters || [];
    if (!list.length) {
      return html + '<div class="card mt-16">' + emptyState('暂无适配器',
        '新建一个通用占位适配器，填写字段选择器、提交按钮与验证码检测选择器。',
        '<button type="button" class="btn btn--primary btn--sm" data-action="adapter-new">＋ 新建适配器</button>') + '</div>';
    }
    return html + '<div class="grid grid--2 mt-16">' + list.map(adapterCardHtml).join('') + '</div>';
  }

  /* ------------------------------------------------------------ 视图 3：表单模板 */

  function varRowHtml(tplId, v) {
    var item = v || { key: '', label: '', value: '', sensitive: false };
    var sensitive = item.sensitive === true;
    var key = String(item.key || '');
    var revealed = !!uiState.revealed[tplId + '::' + key];
    var type = (sensitive && !revealed) ? 'password' : 'text';
    return '<tr data-var-row>' +
      '<td><input class="input" data-var-key value="' + esc(key) + '" aria-label="变量 key"></td>' +
      '<td><input class="input" data-var-label value="' + esc(item.label || '') + '" aria-label="变量标签"></td>' +
      '<td><div class="field__row"><input class="input" data-var-value type="' + type + '" value="' + esc(item.value || '') + '" aria-label="变量值">' +
        (sensitive ? '<button type="button" class="btn btn--icon btn--ghost" data-action="template-toggle-visibility" data-id="' + esc(tplId) + '" title="显示 / 隐藏敏感值">' + (revealed ? eyeOffSvg() : eyeSvg()) + '</button>' : '') +
      '</div></td>' +
      '<td><label class="checkbox"><input type="checkbox" data-var-sensitive' + (sensitive ? ' checked' : '') + '> 敏感</label></td>' +
      '<td><button type="button" class="btn btn--sm btn--danger" data-action="template-remove-var" data-id="' + esc(tplId) + '">删除</button></td>' +
    '</tr>';
  }

  function mapRowHtml(tplId, m) {
    var item = m || { fieldKey: '', templateExpr: '' };
    return '<tr data-map-row>' +
      '<td><input class="input" data-map-key value="' + esc(item.fieldKey || '') + '" aria-label="字段 key"></td>' +
      '<td><input class="input mono" data-map-expr value="' + esc(item.templateExpr || '') + '" aria-label="映射表达式"></td>' +
      '<td><button type="button" class="btn btn--sm btn--danger" data-action="template-remove-mapping" data-id="' + esc(tplId) + '">删除</button></td>' +
    '</tr>';
  }

  function readTemplateDraft(card) {
    var variables = [];
    var varRows = card.querySelectorAll('[data-var-row]');
    Array.prototype.forEach.call(varRows, function (tr) {
      var sensitiveNode = tr.querySelector('[data-var-sensitive]');
      variables.push({
        key: val(tr, '[data-var-key]').trim(),
        label: val(tr, '[data-var-label]').trim(),
        value: val(tr, '[data-var-value]'),
        sensitive: !!(sensitiveNode && sensitiveNode.checked)
      });
    });
    var mappings = [];
    var mapRows = card.querySelectorAll('[data-map-row]');
    Array.prototype.forEach.call(mapRows, function (tr) {
      mappings.push({
        fieldKey: val(tr, '[data-map-key]').trim(),
        templateExpr: val(tr, '[data-map-expr]')
      });
    });
    var nameNode = card.querySelector('[data-template-name]');
    return { name: nameNode ? nameNode.value : '', variables: variables, mappings: mappings };
  }

  function previewHtml(tplId) {
    var card = findCard(tplId);
    var draft = card ? readTemplateDraft(card) : (findById('templates', tplId) || { variables: [], mappings: [] });
    var map = core.buildVarMap(draft);
    if (!draft.mappings || !draft.mappings.length) {
      return '<div class="tiny">暂无映射，添加后可在此看到 {{变量}} 插值结果。</div>';
    }
    return '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
      '<th style="width:28%">fieldKey</th><th>表达式 → 插值结果</th></tr></thead><tbody>' +
      draft.mappings.map(function (m) {
        var result = core.interpolate(m.templateExpr, map);
        var sensitiveHit = (draft.variables || []).some(function (v) {
          return v.sensitive && String(m.templateExpr).indexOf('{{' + v.key + '}}') !== -1;
        });
        var shown = sensitiveHit ? core.maskValue(result) : result;
        return '<tr><td class="mono">' + esc(m.fieldKey || '（未填）') + '</td><td>' +
          '<span class="mono tiny">' + esc(m.templateExpr || '（空）') + '</span> → ' +
          '<strong class="mono">' + esc(shown || '（空）') + '</strong>' +
          (sensitiveHit ? ' ' + badge('敏感·已遮罩', 'warn') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function refreshPreview(card) {
    if (!card) return;
    var id = card.getAttribute('data-template-card');
    var box = card.querySelector('[data-preview]');
    if (box) box.innerHTML = previewHtml(id);
  }

  function templateCardHtml(tpl) {
    var vars = tpl.variables || [];
    var maps = tpl.mappings || [];
    return '<article class="card mt-16" data-template-card="' + esc(tpl.id) + '" data-action="template-input">' +
      '<div class="card__head">' +
        '<input class="input" style="max-width:280px" data-template-name value="' + esc(tpl.name) + '" aria-label="模板名称">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn--sm btn--primary" data-action="template-save" data-id="' + esc(tpl.id) + '">保存模板</button>' +
          '<button type="button" class="btn btn--sm" data-action="template-copy" data-id="' + esc(tpl.id) + '">复制</button>' +
          '<button type="button" class="btn btn--sm btn--danger" data-action="template-delete" data-id="' + esc(tpl.id) + '">删除</button>' +
        '</div></div>' +
      '<div class="card__body">' +
        '<div class="section-title">变量键值表</div>' +
        '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
          '<th style="width:21%">Key</th><th style="width:20%">标签</th><th>值</th>' +
          '<th style="width:90px">敏感</th><th style="width:74px">操作</th></tr></thead><tbody data-var-rows>' +
          vars.map(function (v) { return varRowHtml(tpl.id, v); }).join('') +
        '</tbody></table></div>' +
        '<button type="button" class="btn btn--sm mt-8" data-action="template-add-var" data-id="' + esc(tpl.id) + '">＋ 添加变量</button>' +

        '<div class="section-title mt-16">字段映射表达式 <span class="tiny">（支持 {{变量}} 插值）</span></div>' +
        '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
          '<th style="width:30%">fieldKey</th><th>表达式</th><th style="width:74px">操作</th></tr></thead><tbody data-map-rows>' +
          maps.map(function (m) { return mapRowHtml(tpl.id, m); }).join('') +
        '</tbody></table></div>' +
        '<button type="button" class="btn btn--sm mt-8" data-action="template-add-mapping" data-id="' + esc(tpl.id) + '">＋ 添加映射</button>' +

        '<div class="section-title mt-16">实时插值预览</div>' +
        '<div class="card card--muted"><div class="card__body" data-preview>' + previewHtml(tpl.id) + '</div></div>' +
      '</div></article>';
  }

  function renderTemplates() {
    var html = pageHead('表单模板',
      '维护变量键值与字段映射表达式。敏感值默认遮罩、不写入日志、导出配置与生成脚本时默认脱敏；需要明文时必须显式勾选并接受警告。',
      '<button type="button" class="btn btn--primary" data-action="template-new">＋ 新建模板</button>');
    html += notice('敏感字段（身份证号、密码、令牌等）以密码框显示，可点眼睛图标临时查看；预览中同样保持遮罩。', 'info');
    var list = state().templates || [];
    if (!list.length) {
      return html + '<div class="card mt-16">' + emptyState('暂无表单模板',
        '新建一个模板，添加变量并设置映射到适配器 fieldKey 的表达式。',
        '<button type="button" class="btn btn--primary btn--sm" data-action="template-new">＋ 新建模板</button>') + '</div>';
    }
    return html + list.map(templateCardHtml).join('');
  }

  /* ------------------------------------------------------------ 视图 4：调度策略 */

  function policyCardHtml(p) {
    var est = core.estimatePolicyDuration(p);
    return '<article class="card"><div class="card__head"><h3 class="card__title">' + esc(p.name) + '</h3>' +
      badge(p.liveSubmit ? '真实提交' : '模拟提交', p.liveSubmit ? 'danger' : 'success') + '</div>' +
      '<div class="card__body"><dl class="task-card__meta" style="padding:0">' +
        '<dt>开放时间</dt><dd>' + esc(core.formatDateTime(p.openAt)) + '</dd>' +
        '<dt>轮询间隔</dt><dd class="mono">' + esc(p.intervalMs) + ' ms</dd>' +
        '<dt>随机抖动</dt><dd class="mono">' + esc(p.jitterPct) + ' %（只增不减）</dd>' +
        '<dt>最大尝试</dt><dd class="mono">' + esc(p.maxAttempts) + ' 次</dd>' +
        '<dt>预热 / 超时</dt><dd class="mono">' + esc(p.warmupSec) + ' s / ' + esc(p.timeoutMs) + ' ms</dd>' +
        '<dt>人工确认</dt><dd>' + (p.requireConfirm ? '开启' : '关闭') + '</dd>' +
        '<dt>验证码中止</dt><dd>' + badge('强制开启', 'success') + '</dd>' +
        '<dt>预计总耗时</dt><dd>' + esc(est.minText) + ' ~ ' + esc(est.maxText) + '</dd>' +
      '</dl><div class="tiny mt-8">按跑满 ' + esc(est.attempts) + ' 次尝试估算，含预热与抖动。</div></div>' +
      '<div class="card__foot">' +
        '<button type="button" class="btn btn--sm" data-action="policy-edit" data-id="' + esc(p.id) + '">编辑</button>' +
        '<button type="button" class="btn btn--sm" data-action="policy-copy" data-id="' + esc(p.id) + '">复制</button>' +
        '<button type="button" class="btn btn--sm btn--danger" data-action="policy-delete" data-id="' + esc(p.id) + '">删除</button>' +
      '</div></article>';
  }

  function renderPolicies() {
    var html = pageHead('调度策略',
      '配置开放时间、预热、轮询间隔、随机抖动、最大尝试次数与提交行为。速率限制在校验器、引擎层与导出脚本中三重生效。',
      '<button type="button" class="btn btn--primary" data-action="policy-new">＋ 新建策略</button>');
    html += notice('<strong>速率限制硬约束：</strong>轮询间隔下限 ' + core.LIMITS.MIN_INTERVAL_MS +
      'ms（默认 3000ms），单次任务最大尝试次数 ' + core.LIMITS.MAX_ATTEMPTS +
      ' 次（默认 20 次），随机抖动只增大间隔；「检测到验证码立即中止」不可关闭；默认模拟提交。', 'warn');
    var list = state().policies || [];
    if (!list.length) {
      return html + '<div class="card mt-16">' + emptyState('暂无调度策略',
        '新建策略后即可在任务中引用；间隔低于 1000ms 会被硬校验拒绝。',
        '<button type="button" class="btn btn--primary btn--sm" data-action="policy-new">＋ 新建策略</button>') + '</div>';
    }
    return html + '<div class="grid grid--2 mt-16">' + list.map(policyCardHtml).join('') + '</div>';
  }

  /* ------------------------------------------------------------ 视图 5：演练沙箱 */

  function sandboxConfigHtml(s) {
    var quick = [3, 5, 10, 30].map(function (n) {
      return '<button type="button" class="btn btn--sm" data-action="sandbox-set-open" data-sec="' + n + '">现在起 ' + n + ' 秒</button>';
    }).join('');
    return '<div class="form-grid" id="sb-config-root">' +
      inputField('开放时间（现在起 N 秒后）', 'sb-openInSec', 'number', s.openInSec, '支持下方「现在起 N 秒后」快捷按钮') +
      '<div class="quick-row">' + quick + '</div>' +
      numberField('初始库存', 'sb-initialStock', s.initialStock, 0, '模拟名额库存，被抢完即无库存') +
      numberField('每次尝试成功率 (%)', 'sb-successRate', Math.round(Number(s.successRate) * 100), 0, '0~100，判定每次尝试是否命中成功') +
      numberField('模拟网络延迟 (ms)', 'sb-networkLatencyMs', s.networkLatencyMs, 0, '仅本地演练耗时，不产生任何真实请求') +
      numberField('轮询间隔 (ms)', 'sb-intervalMs', s.intervalMs, 1000, '下限 1000ms；引擎层会再次钳制，不依赖本表单') +
      numberField('随机抖动 (%)', 'sb-jitterPct', s.jitterPct, 0, '0~50，只会增大间隔') +
      numberField('最大尝试次数', 'sb-maxAttempts', s.maxAttempts, 1, '上限 50 次，引擎层再次钳制') +
      numberField('验证码触发于第几次尝试', 'sb-captchaAtAttempt', s.captchaAtAttempt, 1, '配合下方开关验证「立即中止」') +
      '<label class="checkbox"><input type="checkbox" id="sb-triggerCaptcha"' + (s.triggerCaptcha ? ' checked' : '') + '> 触发验证码事件（演练「立即中止 + 人工接管」）</label>' +
      '<div class="notice notice--warn">演练模式自动通过提交前人工确认，且始终为模拟提交；导出的真实脚本仍会按策略弹出确认对话框。为符合速率限制，演练按 ≥1000ms 间隔真实计时。</div>' +
    '</div>';
  }

  function logStreamHtml() {
    var logs = uiState.sandboxLogs.slice(-80);
    if (!logs.length) return '<div class="tiny">暂无演练日志，启动后实时显示。</div>';
    return logs.map(function (l) {
      return '<div class="log-line log-line--' + esc(l.level) + '">' +
        '<span class="log-line__ts">' + esc(core.formatDateTime(l.ts).slice(11)) + '</span>' +
        '<span class="log-line__msg">' + esc(l.message) + '</span></div>';
    }).join('');
  }

  function liveHtml() {
    var d = uiState.sandboxData;
    var st = engineStatus();
    var mainPipeline = ['idle', 'scheduled', 'waiting', 'polling', 'filling', 'confirming', 'submitting'];
    var order = { idle: 0, scheduled: 1, waiting: 2, polling: 3, filling: 4, confirming: 5, submitting: 6, paused: 3, success: 7, failed: 7, aborted: 7 };
    var cur = order[d.state] === undefined ? 0 : order[d.state];
    var terminal = ['success', 'failed', 'aborted'].indexOf(d.state) !== -1;

    var pipeline = mainPipeline.map(function (name, i) {
      var cls = 'pipeline__node';
      if (terminal || i < cur) cls += ' pipeline__node--done';
      if (!terminal && i === cur) cls += ' pipeline__node--active';
      return '<span class="' + cls + '">' + esc(phaseLabel(name)) + '</span>';
    }).join('') + ['success', 'failed', 'aborted'].map(function (name) {
      var cls = 'pipeline__node pipeline__node--terminal' + (d.state === name ? ' pipeline__node--active' : '');
      return '<span class="' + cls + '">' + esc(phaseLabel(name)) + '</span>';
    }).join('');

    var outcome = d.outcome;
    var cdText = core.formatCountdown(d.remainingMs);
    var cdClass = '';
    var cdLabel = d.state === 'waiting' ? '距离开放时间' : '距离下一次动作';
    if (outcome) {
      var labelMap = { success: '演练成功', failed: '演练失败', aborted: '演练已中止' };
      cdText = labelMap[outcome.outcome] || '演练结束';
      cdClass = outcome.outcome === 'success' ? 'countdown__value--done'
        : (outcome.outcome === 'aborted' ? 'countdown__value--abort' : 'countdown__value--fail');
      cdLabel = '最终结果 · ' + String(outcome.reason || '') + ' · 共 ' + (outcome.attempts || 0) + ' 次尝试';
    }
    var pct = d.maxAttempts ? Math.min(100, Math.round(d.attempts / d.maxAttempts * 100)) : 0;
    var barTone = outcome ? (outcome.outcome === 'success' ? 'success' : (outcome.outcome === 'aborted' ? 'danger' : 'warn')) : '';

    var controls = '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      (st.running ? '' : '<button type="button" class="btn btn--primary btn--sm" data-action="sandbox-start">▶ 启动演练</button>') +
      (st.running && !st.paused ? '<button type="button" class="btn btn--sm" data-action="sandbox-pause">⏸ 暂停</button>' : '') +
      (st.running && st.paused ? '<button type="button" class="btn btn--sm btn--soft" data-action="sandbox-resume">▶ 继续</button>' : '') +
      (st.running ? '<button type="button" class="btn btn--sm btn--danger" data-action="sandbox-stop">■ 停止</button>' : '') +
      '<button type="button" class="btn btn--sm" data-action="sandbox-reset">↺ 重置</button></div>';

    return '<div class="card"><div class="card__head"><h3 class="card__title">实时演练</h3>' +
      badge(st.running ? (st.paused ? '已暂停' : '运行中') : '空闲', st.running ? (st.paused ? 'warn' : 'info') : 'neutral', true) +
      '</div><div class="card__body">' +
      '<div class="countdown"><div class="countdown__label" id="sb-countdown-label">' + esc(cdLabel) + '</div>' +
        '<div class="countdown__value ' + cdClass + '" id="sb-countdown-value">' + esc(cdText) + '</div></div>' +
      '<div class="section-title">状态机流水线</div><div class="pipeline">' + pipeline + '</div>' +
      '<div class="section-title">尝试进度</div>' + progressBar(pct, barTone).replace('class="progress__bar', 'id="sb-progress-bar" class="progress__bar') +
      '<div class="metrics">' +
        '<div class="metric"><div class="metric__label">当前状态</div><div class="metric__value" id="sb-phase-label" style="font-size:15px">' + esc(phaseLabel(d.state)) + '</div></div>' +
        '<div class="metric"><div class="metric__label">剩余库存</div><div class="metric__value" id="sb-stock-value">' + esc(d.stock) + '</div></div>' +
        '<div class="metric"><div class="metric__label">尝试次数 / 上限</div><div class="metric__value" id="sb-attempts-value">' + esc(d.attempts + ' / ' + d.maxAttempts) + '</div></div>' +
        '<div class="metric"><div class="metric__label">当前阶段</div><div class="metric__value" style="font-size:15px">' + esc(phaseLabel(d.phase === 'idle' ? d.state : d.phase)) + '</div></div>' +
      '</div>' +
      controls +
      '<div class="section-title mt-16">实时日志流</div>' +
      '<div class="log-stream">' + logStreamHtml() + '</div>' +
      '</div></div>';
  }

  function renderSandboxLive() {
    var box = el('sandbox-live');
    if (!box) return;
    box.innerHTML = liveHtml();
    var stream = box.querySelector('.log-stream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  function updateTickDom() {
    if (currentView !== 'sandbox') return;
    var d = uiState.sandboxData;
    var cd = el('sb-countdown-value');
    if (cd && !d.outcome) cd.textContent = core.formatCountdown(d.remainingMs);
    var cdLabel = el('sb-countdown-label');
    if (cdLabel && !d.outcome) cdLabel.textContent = d.state === 'waiting' ? '距离开放时间' : '距离下一次动作';
    var bar = el('sb-progress-bar');
    if (bar) {
      var pct = d.maxAttempts ? Math.min(100, Math.round(d.attempts / d.maxAttempts * 100)) : 0;
      bar.style.width = pct + '%';
    }
    var tries = el('sb-attempts-value');
    if (tries) tries.textContent = d.attempts + ' / ' + d.maxAttempts;
    var stock = el('sb-stock-value');
    if (stock) stock.textContent = String(d.stock);
    var phase = el('sb-phase-label');
    if (phase) phase.textContent = phaseLabel(d.state);
  }

  function renderSandbox() {
    var s = state().sandbox || data.defaultSandbox();
    var html = pageHead('演练沙箱',
      '完整跑通状态机的本地演练：不访问任何外部站点、不产生真实请求。引擎使用真实计时器按 ≥1000ms 间隔运行，最终得到成功 / 失败 / 中止之一。',
      '');
    html += notice('<strong>合规前置：</strong>首次使用需先在「帮助与合规」勾选合规确认，未确认时禁止启动任务与导出脚本。' +
      (complianceOk(true) ? '当前状态：已确认。' : '当前状态：尚未确认。'), complianceOk(true) ? 'success' : 'warn');
    html += '<div class="sandbox-layout mt-16">' +
      '<div class="card"><div class="card__head"><h3 class="card__title">演练参数</h3>' +
        badge('不访问外部站点', 'info') + '</div>' +
        '<div class="card__body"><div data-action="sandbox-config">' + sandboxConfigHtml(s) + '</div></div></div>' +
      '<div id="sandbox-live">' + liveHtml() + '</div>' +
    '</div>';
    return html;
  }

  /* ------------------------------------------------------------ 视图 6：日志中心 */

  function filteredLogs() {
    return (state().logs || []).filter(function (l) {
      if (filters.logTask !== 'all' && l.taskId !== filters.logTask) return false;
      if (filters.logLevel !== 'all' && l.level !== filters.logLevel) return false;
      return true;
    });
  }

  function renderLogRows() {
    var box = el('log-list');
    if (!box) return;
    var list = filteredLogs();
    var count = el('log-count');
    if (count) count.textContent = '共 ' + list.length + ' 条';
    if (!list.length) {
      box.innerHTML = '<tr><td colspan="4">' + emptyState('暂无日志', '启动演练或进行配置操作后，审计日志会记录在这里。') + '</td></tr>';
      return;
    }
    box.innerHTML = list.slice().reverse().map(function (l) {
      var meta = core.LOG_LEVELS[l.level] || { label: l.level, tone: 'neutral' };
      return '<tr><td class="mono tiny">' + esc(core.formatDateTime(l.ts)) + '</td>' +
        '<td>' + badge(meta.label, meta.tone) + '</td>' +
        '<td class="tiny">' + esc(l.taskName || l.taskId || '—') + '</td>' +
        '<td>' + esc(l.message) + '</td></tr>';
    }).join('');
  }

  function renderLogs() {
    var html = pageHead('日志中心',
      '全量审计日志保存在本机浏览器，记录启停、每次尝试、中止、成功、失败与配置变更。日志不记录任何敏感字段值。',
      '<button type="button" class="btn" data-action="logs-export">导出 JSON</button>' +
      '<button type="button" class="btn btn--danger" data-action="logs-clear">清空日志</button>');
    var taskOptions = '<option value="all">全部任务</option>' + (state().tasks || []).map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (filters.logTask === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');
    html += '<div class="toolbar">' +
      '<div class="toolbar__group"><select class="select" style="width:180px" data-action="logs-filter-task" aria-label="按任务筛选">' + taskOptions + '</select></div>' +
      '<div class="toolbar__group"><select class="select" style="width:140px" data-action="logs-filter-level" aria-label="按级别筛选">' + optionsHtml(core.LOG_LEVELS, filters.logLevel, '全部级别') + '</select></div>' +
      '<div class="toolbar__spacer"></div><span class="tiny" id="log-count"></span></div>';
    html += '<div class="card"><div class="table-wrap"><table class="table"><thead><tr>' +
      '<th style="width:170px">时间</th><th style="width:88px">级别</th>' +
      '<th style="width:180px">任务</th><th>消息</th></tr></thead><tbody id="log-list"></tbody></table></div></div>';
    return html;
  }

  /* ------------------------------------------------------------ 视图 7：脚本导出 */

  function currentExportTask() {
    var tasks = state().tasks || [];
    if (!findById('tasks', uiState.exportTaskId)) {
      uiState.exportTaskId = tasks.length ? tasks[0].id : '';
    }
    return findById('tasks', uiState.exportTaskId);
  }

  /** 当前导出任务的执行通道：优先取适配器 channel，任务 channel 兜底，旧数据归一化为 web。 */
  function currentExportChannel() {
    var task = currentExportTask();
    if (!task) return 'web';
    var adapter = findById('adapters', task.adapterId) || {};
    return locators.normalizeChannel(adapter.channel || task.channel);
  }

  /** 统一走 exporter.buildForChannel，web 输出 UserScript，非 web 输出本地 Python 脚本。 */
  function currentExportBundle() {
    var task = currentExportTask() || {};
    var adapter = findById('adapters', task.adapterId) || {};
    var template = findById('templates', task.templateId) || {};
    var policy = findById('policies', task.policyId) || engine.clampPolicy({});
    return exporter.buildForChannel(task, adapter, template, policy, {
      includeSecrets: uiState.exportIncludeSecrets,
      globalLiveSubmitEnabled: state().settings.liveSubmitEnabled === true
    });
  }

  function generateScript() {
    var task = currentExportTask();
    if (!task) return '// 请先在「任务中心」创建一个任务，然后再生成脚本。\n';
    return currentExportBundle().source;
  }

  function updateExportPreview() {
    var box = el('export-code');
    if (!box) return;
    var bundle = currentExportBundle();
    var script = bundle.source;
    uiState.exportScript = script;
    var lines = script.split('\n');
    box.innerHTML = lines.map(function (line) {
      return '<span class="code-line"><span class="code-line__text">' + esc(line || ' ') + '</span></span>';
    }).join('');
    var meta = el('export-meta');
    if (meta) {
      meta.textContent = lines.length + ' 行 · ' +
        (bundle.kind === 'python' ? 'Python 3.11+ · 默认 dry-run' : '@grant none');
    }
  }

  function renderExporter() {
    currentExportTask();
    var channel = currentExportChannel();
    var cap = locators.capabilityOf(channel);
    var isPython = channel !== 'web';
    var html = pageHead('脚本导出',
      isPython
        ? '按当前任务的本地执行通道生成由您本机运行的 Python 脚本。网页控制台只负责配置、演练、日志与导出，绝不尝试控制外部软件。'
        : '生成由您自行安装到自己浏览器扩展（Tampermonkey 等）的 UserScript。脚本只在您已登录、有合法权限的页面上做 DOM 填报，并内置速率限制、最大尝试次数、验证码中止与人工确认。',
      channelBadgeHtml(channel));
    html += notice('未勾选合规确认前禁止导出脚本与配置。生成的脚本不包含任何真实第三方站点 / 软件地址，也不调用任何隐藏接口；敏感字段默认不导出明文。',
      complianceOk(true) ? 'success' : 'warn');

    if (isPython) {
      html += '<div class="channel-warning mt-12"><div class="channel-warning__title">⚠ 网页无法直接控制外部软件，脚本须在本机运行</div>' +
        '<div>浏览器同源策略决定网页不能操作外部进程或窗口。请下载生成的 .py 文件，在您自己的 Windows 机器上按「本地运行时」页的前置条件安装依赖后运行；默认 --dry-run 只做窗口发现与定位器探测。</div>' +
        '<div class="mt-8">当前通道 ' + esc(locators.channelLabel(channel)) + '：典型延迟 ' + esc(cap.latencyText) +
        '，' + esc(cap.suitableFor) + '；不承诺 ≤30ms 级触发精度。</div></div>';
    }

    var taskOptions = (state().tasks || []).map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (uiState.exportTaskId === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('') || '<option value="">（暂无任务）</option>';

    html += '<div class="sandbox-layout mt-16">' +
      '<div class="card"><div class="card__head"><h3 class="card__title">导出设置</h3>' + badge('本地生成', 'info') + '</div>' +
        '<div class="card__body">' +
        '<div class="field mb-12"><label class="field__label" for="export-task-select">选择任务</label>' +
          '<select class="select" id="export-task-select" data-action="export-select-task">' + taskOptions + '</select>' +
          '<span class="field__hint">' + (isPython
            ? '通道由所选任务关联的适配器决定；窗口绑定 / 定位器来自该适配器。'
            : '@name 与 @match 来自所选任务的名称与目标 URL。') + '</span></div>' +
        '<div class="channel-meta mb-12">' + badge(cap.scriptLabel, 'primary') +
          badge('典型延迟 ' + cap.latencyText, 'neutral') +
          (cap.reservationOnly ? badge('仅适用预约类', 'warn') : '') + '</div>' +
        '<label class="checkbox"><input type="checkbox" data-action="export-toggle-secrets"' + (uiState.exportIncludeSecrets ? ' checked' : '') + '> 包含敏感字段明文（不推荐）</label>' +
        (uiState.exportIncludeSecrets
          ? '<div class="notice notice--danger mt-8">警告：勾选后脚本与配置将包含身份证号、口令、令牌等明文，请妥善保管，切勿分享或提交到代码仓库。</div>'
          : '<div class="tiny mt-8">默认脱敏：敏感变量在脚本中标记为占位符，运行时会跳过并提示您手动补全。</div>') +
        '<div class="mt-16" style="display:flex;flex-direction:column;gap:8px">' +
          '<button type="button" class="btn btn--primary btn--block" data-action="export-generate">重新生成脚本预览</button>' +
          '<button type="button" class="btn btn--block" data-action="export-copy">复制脚本到剪贴板</button>' +
          '<button type="button" class="btn btn--block" data-action="export-download-userscript">' +
            (isPython ? '导出本地运行时脚本 (.py)' : '导出 UserScript（.user.js）') + '</button>' +
          '<div class="tiny" style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">配置 JSON（含 channel / target / locators）</div>' +
          '<button type="button" class="btn btn--block" data-action="export-config-download">导出配置 JSON</button>' +
          '<button type="button" class="btn btn--block" data-action="export-config-import">导入配置 JSON</button>' +
        '</div></div></div>' +
      '<div class="card"><div class="card__head"><h3 class="card__title">脚本预览</h3>' +
        '<span class="tiny" id="export-meta"></span></div>' +
        '<div class="card__body"><pre class="code-block" id="export-code"></pre></div></div>' +
    '</div>';
    return html;
  }

  /* ------------------------------------------------------------ 视图 9：帮助与合规 */

  function renderHelp() {
    var s = state().settings || { complianceAccepted: false, theme: 'light', liveSubmitEnabled: false };
    var html = pageHead('帮助与合规',
      '了解本产品的能力边界、正确使用方式与合规要求。SlotRunner 是配置与调度中心，不是攻击第三方站点的脚本。', '');

    html += '<div class="card"><div class="card__head"><h3 class="card__title">三步使用流程</h3></div><div class="card__body"><div class="steps">' +
      stepHtml(1, '配置', '在「适配器」填写通用 DOM 选择器，在「表单模板」维护变量与映射，在「调度策略」设置开放时间与速率限制，最后在「任务中心」新建任务。') +
      stepHtml(2, '演练与导出', '先在「演练沙箱」完整跑通状态机（不访问任何外部站点）；确认无误后到「脚本导出」生成 .user.js，由您自行安装到自己的浏览器扩展中。') +
      stepHtml(3, '在授权页面运行', '在您本人已登录、且拥有合法权限的目标页面打开脚本。脚本仅做 DOM 填写与（经确认后的）提交按钮点击；遇到验证码立即停止并提示人工接管。') +
    '</div></div></div>';

    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">技术限制：为什么网页不能直接抢位</h3></div>' +
      '<div class="card__body"><p class="muted" style="margin:0 0 10px">浏览器的<strong>同源策略（Same-Origin Policy）</strong>规定：一个站点页面里的 JavaScript 不能读取或操作另一个不同源站点的 DOM、Cookie 或本地存储。因此本 Web 控制台在技术上无法、也绝不会尝试去跨域填写别的网站表单。</p>' +
      '<p class="muted" style="margin:0">SlotRunner 负责：配置管理、调度策略、可完整跑通状态机的本地演练沙箱、全量审计日志，以及生成 <strong>UserScript</strong>。UserScript 需要由您自行安装到自己的浏览器扩展（Tampermonkey / Violentmonkey 等），它会在目标页面自身的上下文里执行，此时才具备合法的 DOM 访问能力。</p></div></div>';

    html += '<div class="rule-cols mt-16">' +
      '<div class="card"><div class="card__head"><h3 class="card__title">' + badge('允许', 'success') + '</h3></div><div class="card__body"><ul class="rule-list">' +
        '<li>在您本人已登录、拥有合法操作权限的页面上填写表单。</li>' +
        '<li>使用通用占位 CSS 选择器描述您自己可见的表单字段。</li>' +
        '<li>按 ≥1000ms 的间隔轮询，单次任务最多 50 次尝试。</li>' +
        '<li>只读取页面上可见文本判断成功关键词。</li>' +
        '<li>在提交前弹出确认对话框，由您本人决定是否继续。</li>' +
        '<li>本地保存、导出与清空审计日志。</li>' +
      '</ul></div></div>' +
      '<div class="card"><div class="card__head"><h3 class="card__title">' + badge('禁止', 'danger') + '</h3></div><div class="card__body"><ul class="rule-list">' +
        '<li>绕过验证码、人机验证、登录鉴权、加密签名或任何反爬机制。</li>' +
        '<li>调用隐藏接口、未公开 API、后台请求或第三方站点专用地址。</li>' +
        '<li>内置任何具体平台（如 12306、某校教务系统）的专用适配器或破解逻辑。</li>' +
        '<li>把轮询间隔压到 1000ms 以下或把尝试次数提高到 50 次以上。</li>' +
        '<li>在未经授权、无访问权限或违反服务条款的页面上运行。</li>' +
        '<li>把包含明文的敏感配置分享给他人或提交到公开仓库。</li>' +
      '</ul></div></div>' +
    '</div>';

    // 非 Web 通道适用性与风险：原有允许 / 禁止 / 免责声明 / 合规确认全部保留，仅追加本节。
    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">本地通道（桌面 / 小程序 / 移动）适用性与风险</h3>' +
      badge('务必阅读', 'warn') + '</div><div class="card__body">' +
      '<ul class="rule-list">' +
        '<li>浏览器同源策略决定网页控制台无法、也绝不会尝试去控制外部进程或窗口；本地通道只能由您下载 .py 后在本机自行运行。</li>' +
        '<li>UI 自动化单次操作延迟约 300–2000ms，不承诺毫秒级触发精度，<strong>不适合秒杀类任务</strong>，仅适用于预约类 / 有宽松时间余量的场景。</li>' +
        '<li>小程序运行在 PC 客户端内部容器，无法注入 DOM、不暴露调试端口，只做窗口级 UI 自动化；不反编译包体、不重放私有接口、不 hook 进程内存。</li>' +
        '<li>客户端版本升级会导致窗口结构 / AutomationId 变化，须重新录制定位器；建议每次升级后用 --dry-run 做定位器探测回归。</li>' +
        '<li>检测到验证码 / 人机验证立即暂停一切自动化输入并提示人工接管；绝不识别验证码、不对接打码平台、不模拟滑块轨迹。</li>' +
        '<li>默认 --dry-run 只做窗口发现与定位器探测；真实提交须显式 --live 且运行时再次交互确认；无法判定结果时记为「待确认」，绝不默认判成功。</li>' +
        '<li>实名制票务代抢可能违反平台服务条款与属地法律法规，风险与责任由您自行承担；仅限本人有权操作的软件与账号。</li>' +
      '</ul></div></div>';

    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">免责声明</h3></div><div class="card__body">' +
      '<p class="muted" style="margin:0">本工具仅提供通用的本地配置、调度与演练能力，不保证任何第三方站点的可用性、兼容性或成功率。您应当自行确认目标站点的服务条款、 robots 规则与相关法律法规允许此类自动化操作，并自行承担使用后果。开发者不对因使用本工具产生的账号、数据、法律或经济损失负责。数据全部保存在您本机浏览器（localStorage 前缀 <span class="mono">sr:</span>），不会上传到任何服务器。</p>' +
      '</div></div>';

    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">合规确认（必填）</h3>' +
      badge(s.complianceAccepted ? '已确认' : '待确认', s.complianceAccepted ? 'success' : 'danger', true) + '</div>' +
      '<div class="card__body">' +
      '<label class="checkbox"><input type="checkbox" data-action="help-compliance"' + (s.complianceAccepted ? ' checked' : '') + '> ' +
        '我已阅读并同意上述说明：仅在本人已登录且有合法权限的页面使用；不绕过任何验证与鉴权；遵守速率限制；自行承担合规责任。</label>' +
      '<div class="tiny mt-8">未勾选时，禁止启动演练任务与导出 UserScript / 配置。顶部状态栏会常驻显示当前合规状态。</div>' +
      '<div class="mt-12"><button type="button" class="btn btn--sm" data-action="help-revoke">撤销合规确认</button></div>' +
      '</div></div>';

    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">全局开关与数据管理</h3></div><div class="card__body">' +
      '<label class="checkbox"><input type="checkbox" data-action="help-live-submit"' + (s.liveSubmitEnabled ? ' checked' : '') + '> ' +
        '允许真实提交（全局开关，默认关闭；调度策略中也需开启才会生效）</label>' +
      '<div class="notice notice--warn mt-12">双重门槛：只有「全局开关」与「策略的真实提交开关」同时开启，导出的脚本才会点击页面上的提交按钮。默认始终为模拟提交。</div>' +
      '<div class="mt-16"><button type="button" class="btn btn--danger" data-action="help-reset-data">重置全部本地数据</button>' +
      '<span class="tiny" style="margin-left:10px">清空所有配置、日志与合规确认，并恢复演示数据。</span></div>' +
      '</div></div>';

    return html;
  }

  /* -------------------------------------------------- 视图 8：本地运行时 */

  /** 能力矩阵表格 HTML。 */
  function capabilityTableHtml() {
    var rows = locators.capabilityRows().map(function (r) {
      return '<tr>' +
        '<td>' + channelBadgeHtml(r.channel) + '</td>' +
        '<td class="mono tiny">' + esc(r.supportedKinds) + '</td>' +
        '<td>' + (r.canPrefill ? '是' : '部分 / 否') + '</td>' +
        '<td>' + (r.canBackground ? '是' : '否') + '</td>' +
        '<td>' + esc(r.latencyText) + '</td>' +
        '<td>' + esc(r.humanHandoffText) + '</td>' +
        '<td>' + esc(r.suitableFor) + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="table capability-table"><thead><tr>' +
      '<th>通道</th><th>支持的定位方式</th><th>可预填</th><th>可后台</th>' +
      '<th>单次操作典型延迟</th><th>人工接管</th><th>适用任务类型</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /** 平台前置条件表格 HTML。 */
  function prerequisitesHtml() {
    var rows = locators.capabilityRows().map(function (r) {
      return '<div class="prereq-row"><div class="prereq-row__head">' + channelBadgeHtml(r.channel) +
        '<span class="tiny mono">' + esc(r.scriptLabel) + '</span></div>' +
        '<ul class="rule-list">' + r.prerequisites.map(function (p) {
          return '<li>' + esc(p) + '</li>';
        }).join('') + '</ul></div>';
    }).join('');
    return '<div class="prereq-grid">' + rows + '</div>';
  }

  function renderLocalRunner() {
    currentLocalRunnerTask();   // 先确定默认选中任务，保证 select 的 selected 与能力提示一致
    var html = pageHead('本地运行时',
      '为微信小程序 / Windows 桌面客户端 / 任意 GUI 软件生成由您本机运行的 Python 自动化脚本。网页控制台只负责配置、演练、日志与导出，绝不尝试控制外部软件。',
      '<button type="button" class="btn btn--primary" data-action="localrunner-goto-export">前往脚本导出</button>');

    html += '<div class="channel-warning"><div class="channel-warning__title">⚠ 浏览器沙箱限制</div>' +
      '<div>浏览器的同源策略规定：网页里的 JavaScript 不能读取或操作另一个站点的 DOM，更无法控制外部进程或窗口。' +
      '因此本 Web 控制台在技术上无法、也绝不会尝试去驱动小程序或桌面软件。桌面 / 小程序 / 移动任务只能导出 .py 脚本，' +
      '由您下载后在本机（Windows + Python 3.11+）自行运行。原有 Web / UserScript 通道行为完全不变。</div></div>';

    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">通道能力矩阵</h3>' +
      badge('按适配器能力选择', 'info') + '</div><div class="card__body">' +
      '<p class="muted" style="margin:0 0 12px">不同通道支持的定位方式、延迟与人工接管方式各不相同。' +
      '只有 Web 通道承诺毫秒级触发精度；UI 通道单次操作延迟 300–2000ms，<strong>不适合秒杀类</strong>。</p>' +
      capabilityTableHtml() + '</div></div>';

    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">平台前置条件</h3></div>' +
      '<div class="card__body">' + prerequisitesHtml() +
      '<div class="notice notice--warn mt-12">可选依赖（模板匹配 / 界面文字读取）缺失时自动降级，不强制安装；' +
      '缺 pywinauto / uiautomation 时脚本会打印清晰的安装提示并安全退出。OCR 仅用于读取界面可见文字以定位控件，绝不用于识别验证码。</div>' +
      '</div></div>';

    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">配置到运行 · 四步</h3></div><div class="card__body"><div class="steps">' +
      stepHtml(1, '绑定目标应用', '在「适配器」新建适配器并选择执行通道（desktop / miniprogram / mobile）：桌面与小程序填进程名、窗口标题与匹配模式；mobile 填设备序列号与目标包名。随后录制定位器，验证码检测项必填。') +
      stepHtml(2, '配置任务与策略', '在「任务中心」把任务关联到该适配器，设置模板与调度策略（间隔 ≥1000ms、尝试 ≤50 次、提交前人工确认）。') +
      stepHtml(3, '导出脚本', '到「脚本导出」选择该任务，下载 .py 文件；敏感字段默认脱敏为 __SR_REDACTED__，运行前请在本机自行补全。') +
      stepHtml(4, '本机 dry-run → live', '先直接运行（默认 dry-run）做窗口发现与定位器探测；确认无误后显式 --live，并在运行时再次交互确认。检测到验证码立即暂停并提示人工接管。') +
    '</div></div></div>';

    html += '<div class="card mt-16"><div class="card__head"><h3 class="card__title">从当前任务导出</h3>' +
      badge('默认 dry-run', 'success') + '</div><div class="card__body">' +
      '<p class="muted" style="margin:0 0 12px">选择一个非 Web 通道的任务即可直接下载本地运行时脚本；Web 通道任务请改用「脚本导出」页的 UserScript。</p>' +
      '<div class="field mb-12"><label class="field__label" for="localrunner-task-select">选择任务</label>' +
      '<select class="select" id="localrunner-task-select" data-action="localrunner-select-task">' +
      ((state().tasks || []).map(function (t) {
        var a = findById('adapters', t.adapterId) || {};
        var ch = locators.normalizeChannel(a.channel || t.channel);
        return '<option value="' + esc(t.id) + '"' + (uiState.localrunnerTaskId === t.id ? ' selected' : '') + '>' +
          esc(t.name) + '（' + esc(locators.channelLabel(ch)) + '）</option>';
      }).join('') || '<option value="">（暂无任务）</option>') + '</select></div>' +
      '<div class="channel-meta mb-12" id="localrunner-capability-hint"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--primary" data-action="localrunner-download">下载本地运行时脚本 (.py)</button>' +
      '<button type="button" class="btn" data-action="localrunner-goto-export">在脚本导出页预览</button>' +
      '</div></div></div>';

    return html;
  }

  /** 本地运行时视图里当前选中的任务（默认取第一个非 Web 通道任务）。 */
  function currentLocalRunnerTask() {
    var tasks = state().tasks || [];
    function channelOf(t) {
      var a = findById('adapters', t.adapterId) || {};
      return locators.normalizeChannel(a.channel || t.channel);
    }
    if (!findById('tasks', uiState.localrunnerTaskId)) {
      var nonWeb = tasks.filter(function (t) { return channelOf(t) !== 'web'; });
      uiState.localrunnerTaskId = (nonWeb.length ? nonWeb[0] : (tasks[0] || {})).id || '';
    }
    return findById('tasks', uiState.localrunnerTaskId);
  }

  /** 把本地运行时视图里的能力提示区刷新为当前任务的通道能力。 */
  function refreshLocalRunnerHint() {
    var box = el('localrunner-capability-hint');
    if (!box) return;
    var task = currentLocalRunnerTask();
    if (!task) { box.innerHTML = badge('暂无任务', 'neutral'); return; }
    var adapter = findById('adapters', task.adapterId) || {};
    var ch = locators.normalizeChannel(adapter.channel || task.channel);
    var cap = locators.capabilityOf(ch);
    box.innerHTML = channelBadgeHtml(ch) +
      badge(cap.scriptLabel, 'primary') +
      badge('典型延迟 ' + cap.latencyText, 'neutral') +
      (cap.reservationOnly ? badge('仅适用预约类', 'warn') : '') +
      (ch === 'web' ? '<span class="tiny">Web 通道请导出 UserScript；本地运行时脚本仅用于非 Web 通道。</span>' : '');
  }

  /* ------------------------------------------------------------ 编辑器 Modal */

  function showErrors(errors) {
    var box = el('editor-errors');
    if (!box) return;
    if (!errors || !errors.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="form-errors">' + errors.map(function (e) {
      return '<div class="form-errors__item">• ' + esc(e) + '</div>';
    }).join('') + '</div>';
  }

  function relationOptions(listName, selected) {
    return '<option value="">请选择…</option>' + (state()[listName] || []).map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (selected === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>';
    }).join('');
  }

  function openTaskEditor(id) {
    var existing = id ? findById('tasks', id) : null;
    var d = existing || {
      name: '', type: 'course', targetUrl: '', adapterId: '', templateId: '',
      policyId: '', status: 'draft', note: ''
    };
    uiState.editor = { kind: 'task', id: id || null };
    var body = '<form id="task-form">' +
      '<div class="form-grid form-grid--2">' +
        inputField('任务名称', 'task-name', 'text', d.name) +
        selectField('任务类型', 'task-type', optionsHtml(core.TASK_TYPES, d.type)) +
        inputField('目标页面 URL', 'task-targetUrl', 'text', d.targetUrl, 'Web 通道必填（本人已登录且有合法权限的页面）；非 Web 通道可留空，窗口由适配器的 target 绑定。') +
        selectField('状态', 'task-status', optionsHtml(core.TASK_STATUSES, d.status)) +
        selectField('适配器', 'task-adapterId', relationOptions('adapters', d.adapterId)) +
        selectField('表单模板', 'task-templateId', relationOptions('templates', d.templateId)) +
        selectField('调度策略', 'task-policyId', relationOptions('policies', d.policyId)) +
      '</div>' +
      notice('执行通道由所选「适配器」决定：Web 通道导出 UserScript；桌面 / 小程序 / 移动通道导出本机运行的 .py 脚本。保存后通道会随任务持久化。', 'info') +
      '<div class="field mt-16"><label class="field__label" for="task-note">备注</label>' +
        '<textarea class="textarea" id="task-note">' + esc(d.note || '') + '</textarea></div>' +
      '<div id="editor-errors"></div></form>';
    openModal({
      title: id ? '编辑任务' : '新建任务', size: 'wide', bodyHtml: body,
      footerHtml: '<button type="button" class="btn" data-action="modal-close">取消</button>' +
        '<button type="button" class="btn btn--primary" data-action="task-save">保存任务</button>'
    });
  }

  function saveTaskFromModal() {
    var id = uiState.editor.id;
    var existing = id ? findById('tasks', id) : null;
    // 执行通道由关联适配器决定并随任务持久化，供导出分流、导入校验与演练模拟使用。
    var linkedAdapter = findById('adapters', valOf('#task-adapterId')) || {};
    var channel = locators.normalizeChannel(linkedAdapter.channel);
    var task = {
      id: id || core.uid('task'),
      name: valOf('#task-name').trim(),
      type: valOf('#task-type'),
      channel: channel,
      targetUrl: valOf('#task-targetUrl').trim(),
      adapterId: valOf('#task-adapterId'),
      templateId: valOf('#task-templateId'),
      policyId: valOf('#task-policyId'),
      status: valOf('#task-status'),
      note: valOf('#task-note'),
      createdAt: existing ? existing.createdAt : core.nowIso(),
      lastRun: existing ? existing.lastRun : null
    };
    var result = core.validateTask(task);
    if (!result.ok) { showErrors(result.errors); return; }
    upsert('tasks', task);
    save(); closeModal(); render();
    addLog('info', (id ? '更新任务：' : '新建任务：') + task.name, task.id);
    toast('任务已保存', 'success');
  }

  function adapterFieldRowHtml(f) {
    var item = f || { key: '', label: '', selector: '', mode: 'value' };
    var modes = core.FIELD_MODES.map(function (m) {
      return '<option value="' + m + '"' + (item.mode === m ? ' selected' : '') + '>' + m + '</option>';
    }).join('');
    return '<tr data-adapter-field>' +
      '<td><input class="input" data-f-key value="' + esc(item.key || '') + '" aria-label="字段 key"></td>' +
      '<td><input class="input" data-f-label value="' + esc(item.label || '') + '" aria-label="字段标签"></td>' +
      '<td><input class="input mono" data-f-selector value="' + esc(item.selector || '') + '" aria-label="字段选择器"></td>' +
      '<td><select class="select" data-f-mode>' + modes + '</select></td>' +
      '<td><button type="button" class="btn btn--sm btn--danger" data-action="adapter-remove-field">删除</button></td>' +
    '</tr>';
  }

  /** 执行通道下拉选项。 */
  function channelSelectHtml(selected) {
    var s = locators.normalizeChannel(selected);
    return Object.keys(locators.CHANNELS).map(function (ch) {
      return '<option value="' + esc(ch) + '"' + (s === ch ? ' selected' : '') + '>' +
        esc(locators.channelLabel(ch)) + '</option>';
    }).join('');
  }

  /** 定位器 kind 下拉选项（列出全部 9 种，保存时由校验器按通道过滤）。 */
  function locatorKindOptions(selected) {
    return Object.keys(locators.LOCATOR_KINDS).map(function (kind) {
      return '<option value="' + esc(kind) + '"' + (selected === kind ? ' selected' : '') + '>' +
        esc(kind) + '</option>';
    }).join('');
  }

  /** 非 Web 通道的定位器行（kind + value + 删除）。 */
  function locatorRowHtml(loc) {
    var item = loc || { kind: 'uia_name', value: '' };
    return '<tr data-adapter-locator>' +
      '<td style="width:210px"><select class="select" data-l-kind>' + locatorKindOptions(item.kind) + '</select></td>' +
      '<td><input class="input mono" data-l-value value="' + esc(String(item.value === undefined ? '' : item.value)) + '" aria-label="定位值"></td>' +
      '<td style="width:70px"><button type="button" class="btn btn--sm btn--danger" data-action="adapter-remove-locator">删除</button></td>' +
    '</tr>';
  }

  /** 单个定位器编辑器（验证码检测 / 提交控件共用）：kind 下拉 + value 输入。 */
  function locatorPairHtml(prefix, label, loc, hint) {
    var item = (loc && typeof loc === 'object' && !Array.isArray(loc))
      ? loc : { kind: 'uia_name', value: (loc === undefined || loc === null ? '' : String(loc)) };
    return '<div class="field"><label class="field__label">' + esc(label) + '</label>' +
      '<div class="field__row">' +
        '<select class="select" id="' + prefix + '-kind" style="width:200px">' +
          locatorKindOptions(item.kind || 'uia_name') + '</select>' +
        '<input class="input mono" id="' + prefix + '-value" value="' +
          esc(String(item.value === undefined ? '' : item.value)) + '" aria-label="' + esc(label) + '定位值">' +
      '</div>' + (hint ? '<span class="field__hint">' + esc(hint) + '</span>' : '') + '</div>';
  }

  /** 窗口绑定字段（仅非 Web 通道）。 */
  function targetFieldsHtml(target) {
    var t = target || {};
    var modes = core.WINDOW_MATCH_MODES.map(function (m) {
      return '<option value="' + m + '"' + ((t.windowMatchMode || 'contains') === m ? ' selected' : '') + '>' +
        m + '</option>';
    }).join('');
    return '<div class="form-grid form-grid--2">' +
      inputField('进程名 processName', 'adapter-processName', 'text', t.processName || '', '占位值，如 example-client.exe；请勿填写真实平台专用逻辑') +
      inputField('窗口标题 windowTitle', 'adapter-windowTitle', 'text', t.windowTitle || '', '配合窗口匹配模式定位目标窗口') +
      selectField('窗口匹配模式 windowMatchMode', 'adapter-windowMatchMode', modes) +
      inputField('可执行路径 exePath（可选）', 'adapter-exePath', 'text', t.exePath || '') +
      inputField('启动参数 launchArgs（可选，逗号分隔）', 'adapter-launchArgs', 'text', (t.launchArgs || []).join(', ')) +
      inputField('设备序列号 deviceSerial（仅 mobile，留空自动选择）', 'adapter-deviceSerial', 'text', t.deviceSerial || '', 'adb devices 中可见的序列号；桌面 / 小程序通道留空') +
      inputField('目标包名 packageName（仅 mobile）', 'adapter-packageName', 'text', t.packageName || '', '仅记录，脚本不会自动启动应用；桌面 / 小程序通道留空') +
      inputField('启动 Activity appActivity（仅 mobile，可选）', 'adapter-appActivity', 'text', t.appActivity || '') +
      checkboxField('adapter-bringToFront', '人工接管时自动将目标窗口置前', t.bringToFront !== false) +
    '</div>';
  }

  /** 按通道切换编辑器里的字段分区显示（两个区块常驻 DOM，切换不丢失已填内容）。 */
  function applyAdapterChannelVisibility(ch) {
    var webBlock = el('adapter-web-block');
    var localBlock = el('adapter-local-block');
    if (webBlock) webBlock.hidden = (ch !== 'web');
    if (localBlock) localBlock.hidden = (ch === 'web');
    var hint = el('adapter-channel-hint');
    if (hint) {
      var cap = locators.capabilityOf(ch);
      hint.innerHTML = channelBadgeHtml(ch) +
        badge('典型延迟 ' + cap.latencyText, 'neutral') +
        (cap.reservationOnly ? badge('仅适用预约类', 'warn') : '') +
        '<span class="tiny">' + esc(cap.suitableFor) + '；所有通道的验证码检测项均为必填。</span>';
    }
  }

  function defaultLocalAdapter() {
    return {
      target: { processName: '', windowTitle: '', windowMatchMode: 'contains',
        exePath: '', bundleId: '', deviceSerial: '', packageName: '', appActivity: '',
        launchArgs: [], bringToFront: true },
      locators: [],
      captchaLocator: { kind: 'uia_name', value: '' },
      submitLocator: { kind: 'uia_automation_id', value: '' },
      successLocators: []
    };
  }

  function openAdapterEditor(id) {
    var existing = id ? findById('adapters', id) : null;
    var localDefaults = defaultLocalAdapter();
    var d = existing || {
      channel: 'web',
      name: '', urlPattern: '', description: data.NOTE, fields: [],
      submitSelector: '', successKeyword: '', captchaSelector: '',
      target: localDefaults.target,
      locators: localDefaults.locators,
      captchaLocator: localDefaults.captchaLocator,
      submitLocator: localDefaults.submitLocator,
      successLocators: localDefaults.successLocators
    };
    var ch = locators.normalizeChannel(d.channel);
    uiState.editor = { kind: 'adapter', id: id || null };
    uiState.adapterChannelDraft = ch;

    var webBlock = '<div id="adapter-web-block">' +
      '<div class="form-grid form-grid--2">' +
        inputField('URL 匹配模式', 'adapter-urlPattern', 'text', d.urlPattern || '', '通用占位模式，如 https://your-app.example/*') +
        inputField('提交按钮选择器', 'adapter-submitSelector', 'text', d.submitSelector || '') +
        inputField('成功关键词', 'adapter-successKeyword', 'text', d.successKeyword || '', '页面上可见文本中的成功提示词') +
        inputField('验证码检测选择器（必填）', 'adapter-captchaSelector', 'text', d.captchaSelector || '', '检测到该元素立即中止并提示人工接管') +
      '</div>' +
      '<div class="section-title mt-16">字段行（可增删）</div>' +
      '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
        '<th style="width:19%">key</th><th style="width:19%">标签</th><th>选择器</th>' +
        '<th style="width:110px">模式</th><th style="width:70px">操作</th></tr></thead>' +
        '<tbody id="adapter-fields">' + (d.fields || []).map(adapterFieldRowHtml).join('') + '</tbody></table></div>' +
      '<button type="button" class="btn btn--sm mt-8" data-action="adapter-add-field">＋ 添加字段</button>' +
    '</div>';

    var localBlock = '<div id="adapter-local-block">' +
      '<div class="section-title mt-16">窗口绑定 target</div>' + targetFieldsHtml(d.target) +
      '<div class="section-title mt-16">定位器 locators（可增删；coordinate_anchor 的 value 写作 "nx,ny" 归一化值）</div>' +
      '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
        '<th>kind</th><th>value</th><th style="width:70px">操作</th></tr></thead>' +
        '<tbody id="adapter-locators">' + (d.locators || []).map(locatorRowHtml).join('') + '</tbody></table></div>' +
      '<button type="button" class="btn btn--sm mt-8" data-action="adapter-add-locator">＋ 添加定位器</button>' +
      '<div class="form-grid form-grid--2 mt-16">' +
        locatorPairHtml('adapter-captcha-locator', '验证码检测定位器（必填）', d.captchaLocator,
          '检测到该控件 / 文字立即暂停一切自动化输入并提示人工接管') +
        locatorPairHtml('adapter-submit-locator', '提交控件定位器', d.submitLocator,
          '仅在 --live 且人工确认后才会点击') +
      '</div>' +
      '<div class="field mt-16"><label class="field__label" for="adapter-successLocators">成功关键词 successLocators（每行 / 逗号分隔）</label>' +
        '<textarea class="textarea" id="adapter-successLocators">' + esc((d.successLocators || []).join('\n')) + '</textarea>' +
        '<span class="field__hint">只读取窗口可见文字判定；无法判定时记为「待确认」，绝不默认判成功。</span></div>' +
    '</div>';

    var body = '<form id="adapter-form"><div class="form-grid form-grid--2">' +
      inputField('适配器名称', 'adapter-name', 'text', d.name || '') +
      selectField('执行通道', 'adapter-channel', channelSelectHtml(ch)) +
      '</div>' +
      '<div class="channel-meta mt-8" id="adapter-channel-hint"></div>' +
      webBlock + localBlock +
      '<div class="field mt-16"><label class="field__label" for="adapter-description">说明</label>' +
        '<input class="input" id="adapter-description" value="' + esc(d.description || '') + '"></div>' +
      '<div id="editor-errors"></div></form>';
    openModal({
      title: id ? '编辑适配器' : '新建适配器', size: 'wide', bodyHtml: body,
      footerHtml: '<button type="button" class="btn" data-action="modal-close">取消</button>' +
        '<button type="button" class="btn btn--primary" data-action="adapter-save">保存适配器</button>'
    });
    applyAdapterChannelVisibility(ch);
  }

  /** 从 DOM 读取一个定位器编辑器（kind + value）；value 为空返回 ''，交由校验器报「必填」。 */
  function readLocatorPair(prefix) {
    var kind = valOf('#' + prefix + '-kind');
    var value = valOf('#' + prefix + '-value').trim();
    if (!value) return '';
    return { kind: kind, value: value };
  }

  function collectFieldRows() {
    var fields = [];
    var rows = typeof document !== 'undefined' ? document.querySelectorAll('#adapter-fields tr') : [];
    Array.prototype.forEach.call(rows, function (tr) {
      fields.push({
        key: val(tr, '[data-f-key]').trim(),
        label: val(tr, '[data-f-label]').trim(),
        selector: val(tr, '[data-f-selector]').trim(),
        mode: val(tr, '[data-f-mode]') || 'value'
      });
    });
    return fields;
  }

  function collectLocatorRows() {
    var out = [];
    var rows = typeof document !== 'undefined' ? document.querySelectorAll('#adapter-locators tr') : [];
    Array.prototype.forEach.call(rows, function (tr) {
      var kind = val(tr, '[data-l-kind]');
      var value = val(tr, '[data-l-value]').trim();
      if (!value) return;
      out.push({ kind: kind, value: value });
    });
    return out;
  }

  function saveAdapterFromModal() {
    var id = uiState.editor.id;
    var existing = id ? findById('adapters', id) : null;
    var channel = locators.normalizeChannel(valOf('#adapter-channel'));
    var adapter = {
      id: id || core.uid('adapter'),
      channel: channel,
      name: valOf('#adapter-name').trim(),
      description: valOf('#adapter-description') || data.NOTE,
      fields: collectFieldRows(),
      createdAt: existing ? existing.createdAt : core.nowIso()
    };

    if (channel === 'web') {
      adapter.urlPattern = valOf('#adapter-urlPattern').trim();
      adapter.submitSelector = valOf('#adapter-submitSelector').trim();
      adapter.successKeyword = valOf('#adapter-successKeyword').trim();
      adapter.captchaSelector = valOf('#adapter-captchaSelector').trim();
    } else {
      adapter.target = {
        processName: valOf('#adapter-processName').trim(),
        windowTitle: valOf('#adapter-windowTitle').trim(),
        windowMatchMode: valOf('#adapter-windowMatchMode'),
        exePath: valOf('#adapter-exePath').trim(),
        bundleId: (existing && existing.target && existing.target.bundleId) || '',
        deviceSerial: valOf('#adapter-deviceSerial').trim(),
        packageName: valOf('#adapter-packageName').trim(),
        appActivity: valOf('#adapter-appActivity').trim(),
        launchArgs: valOf('#adapter-launchArgs').split(',').map(function (s) { return s.trim(); })
          .filter(function (s) { return s.length > 0; }),
        bringToFront: checkedOf('#adapter-bringToFront')
      };
      adapter.locators = collectLocatorRows();
      adapter.captchaLocator = readLocatorPair('adapter-captcha-locator');
      adapter.submitLocator = readLocatorPair('adapter-submit-locator');
      adapter.successLocators = valOf('#adapter-successLocators')
        .split(/[\r\n,，]+/).map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; });
    }

    var result = locators.validateAdapterByChannel(adapter);
    if (!result.ok) { showErrors(result.errors); return; }
    upsert('adapters', adapter);
    save(); closeModal(); render();
    addLog('info', (id ? '更新适配器：' : '新建适配器：') + adapter.name +
      '（通道 ' + locators.channelLabel(channel) + '）', null);
    toast('适配器已保存', 'success');
  }

  function updatePolicyEstimate() {
    var box = el('policy-estimate');
    if (!box) return;
    var est = core.estimatePolicyDuration({
      intervalMs: numOf('#policy-intervalMs', 3000),
      jitterPct: numOf('#policy-jitterPct', 0),
      maxAttempts: numOf('#policy-maxAttempts', 20),
      warmupSec: numOf('#policy-warmupSec', 0)
    });
    box.innerHTML = '<div class="section-title" style="margin-bottom:6px">本策略预计总耗时</div>' +
      '<div style="font-size:17px;font-weight:650" class="mono">' + esc(est.minText) + ' ~ ' + esc(est.maxText) + '</div>' +
      '<div class="tiny mt-8">按跑满 ' + esc(est.attempts) + ' 次尝试估算：最短 = 预热 + 次数 × 间隔；最长再加入 ' +
      esc(est.jitterPct) + '% 抖动（抖动只增大间隔）。</div>';
  }

  function openPolicyEditor(id) {
    var existing = id ? findById('policies', id) : null;
    var d = existing || engine.clampPolicy({
      name: '', openAt: new Date(Date.now() + 300000).toISOString(), warmupSec: 3,
      intervalMs: 3000, jitterPct: 10, maxAttempts: 20, timeoutMs: 10000,
      requireConfirm: true, liveSubmit: false, stopOnCaptcha: true
    });
    uiState.editor = { kind: 'policy', id: id || null };
    var body = '<form id="policy-form" data-action="policy-input">' +
      '<div class="form-grid form-grid--2">' +
        inputField('策略名称', 'policy-name', 'text', d.name) +
        inputField('开放时间', 'policy-openAt', 'text', d.openAt, 'ISO 8601 或浏览器可解析的日期时间') +
        numberField('预热秒数', 'policy-warmupSec', d.warmupSec, 0, '开放前提前进入轮询准备') +
        numberField('轮询间隔 (ms)', 'policy-intervalMs', d.intervalMs, 1000, '硬约束：下限 1000ms，低于下限将被拒绝保存') +
        numberField('随机抖动 (%)', 'policy-jitterPct', d.jitterPct, 0, '0 ~ 50，只会增大间隔，不会缩短') +
        numberField('最大尝试次数', 'policy-maxAttempts', d.maxAttempts, 1, '硬约束：上限 50 次') +
        numberField('单次尝试超时 (ms)', 'policy-timeoutMs', d.timeoutMs, 1) +
      '</div>' +
      '<div class="mt-16" style="display:flex;flex-direction:column;gap:9px">' +
        checkboxField('policy-requireConfirm', '提交前人工确认（默认开启）', d.requireConfirm !== false) +
        checkboxField('policy-liveSubmit', '真实提交（默认关闭，需用户主动切换，并受全局开关约束）', d.liveSubmit === true) +
        '<label class="checkbox"><input type="checkbox" checked disabled> 检测到验证码 / 人机验证立即中止（强制合规项，不可关闭）</label>' +
      '</div>' +
      '<div class="mt-16 card card--muted"><div class="card__body" id="policy-estimate"></div></div>' +
      '<div id="editor-errors"></div></form>';
    openModal({
      title: id ? '编辑调度策略' : '新建调度策略', size: 'wide', bodyHtml: body,
      footerHtml: '<button type="button" class="btn" data-action="modal-close">取消</button>' +
        '<button type="button" class="btn btn--primary" data-action="policy-save">保存策略</button>',
      onMount: function () { updatePolicyEstimate(); }
    });
  }

  function savePolicyFromModal() {
    var id = uiState.editor.id;
    var rawOpenAt = valOf('#policy-openAt').trim();
    var parsed = new Date(rawOpenAt);
    var openAt = isNaN(parsed.getTime()) ? rawOpenAt : parsed.toISOString();
    var policy = {
      id: id || core.uid('policy'),
      name: valOf('#policy-name').trim(),
      openAt: openAt,
      warmupSec: numOf('#policy-warmupSec', 0),
      intervalMs: numOf('#policy-intervalMs', 0),
      jitterPct: numOf('#policy-jitterPct', 0),
      maxAttempts: numOf('#policy-maxAttempts', 0),
      timeoutMs: numOf('#policy-timeoutMs', 0),
      requireConfirm: checkedOf('#policy-requireConfirm'),
      liveSubmit: checkedOf('#policy-liveSubmit'),
      stopOnCaptcha: true
    };
    var result = core.validatePolicy(policy);
    if (!result.ok) { showErrors(result.errors); return; }
    upsert('policies', policy);
    save(); closeModal(); render();
    addLog('info', (id ? '更新调度策略：' : '新建调度策略：') + policy.name, null);
    toast('策略已保存', 'success');
  }

  /* ------------------------------------------------------------ 弹层 / 提示 */

  function openModal(options) {
    var rootEl = el('modal-root');
    if (!rootEl) return;
    var opts = options || {};
    uiState.modal = opts;
    var sizeCls = opts.size === 'wide' ? ' modal--wide' : (opts.size === 'narrow' ? ' modal--narrow' : '');
    rootEl.innerHTML = '<div class="modal-backdrop"><div class="modal' + sizeCls + '" role="dialog" aria-modal="true">' +
      '<div class="modal__head"><h2 class="modal__title">' + esc(opts.title || '') + '</h2>' +
        '<button type="button" class="btn btn--icon btn--ghost" data-action="modal-close" aria-label="关闭">✕</button></div>' +
      '<div class="modal__body">' + (opts.bodyHtml || '') + '</div>' +
      '<div class="modal__foot">' + (opts.footerHtml || '') + '</div></div></div>';
    if (typeof opts.onMount === 'function') opts.onMount(rootEl);
  }
  function closeModal() {
    var rootEl = el('modal-root');
    if (rootEl) rootEl.innerHTML = '';
    uiState.modal = null;
  }
  function toast(message, type) {
    var rootEl = el('toast-root');
    if (!rootEl || typeof document === 'undefined') return;
    var node = document.createElement('div');
    node.className = 'toast toast--' + (type || 'info');
    node.innerHTML = '<span class="toast__mark"></span><span>' + esc(message) + '</span>';
    rootEl.appendChild(node);
    setTimeout(function () {
      node.classList.add('toast--out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
    }, 3200);
  }
  function confirmDialog(options, onConfirm) {
    var rootEl = el('confirm-root');
    if (!rootEl) return;
    var opts = options || {};
    uiState.confirm = onConfirm;
    rootEl.innerHTML = '<div class="modal-backdrop"><div class="modal modal--narrow" role="alertdialog" aria-modal="true">' +
      '<div class="modal__head"><h2 class="modal__title">' + esc(opts.title || '请确认') + '</h2></div>' +
      '<div class="modal__body"><div class="notice ' + (opts.danger ? 'notice--danger' : 'notice--warn') + '">' +
        esc(opts.message || '') + '</div></div>' +
      '<div class="modal__foot"><button type="button" class="btn" data-action="confirm-cancel">取消</button>' +
        '<button type="button" class="btn ' + (opts.danger ? 'btn--danger' : 'btn--primary') + '" data-action="confirm-ok">' +
        esc(opts.confirmText || '确认') + '</button></div></div></div>';
  }
  function closeConfirm() {
    var rootEl = el('confirm-root');
    if (rootEl) rootEl.innerHTML = '';
    uiState.confirm = null;
  }

  function downloadFile(filename, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      return true;
    } catch (e) {
      toast('下载失败：' + e.message, 'error');
      return false;
    }
  }
  function copyText(text) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        toast(ok ? '已复制到剪贴板' : '复制失败，请手动选中代码复制', ok ? 'success' : 'error');
      } catch (e) {
        toast('复制失败，请手动选中代码复制', 'error');
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制到剪贴板', 'success'); }, fallback);
    } else {
      fallback();
    }
  }

  /* ------------------------------------------------------------ 顶栏 / 主题 */

  function applyTheme() {
    if (typeof document === 'undefined') return;
    var theme = state().settings && state().settings.theme === 'dark' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', theme);
  }
  function refreshTopbarClock() {
    var node = el('topbar-clock');
    if (node) node.textContent = core.formatDateTime(core.nowIso());
  }
  function refreshTopbar() {
    var st = engineStatus();
    var engineEl = el('topbar-engine');
    if (engineEl) {
      engineEl.innerHTML = badge(
        st.running ? (st.paused ? '已暂停' : '引擎运行中') : '引擎空闲',
        st.running ? (st.paused ? 'warn' : 'info') : 'neutral', true
      );
    }
    var compEl = el('topbar-compliance');
    if (compEl) {
      var ok = state().settings && state().settings.complianceAccepted === true;
      compEl.innerHTML = badge(ok ? '合规已确认' : '待合规确认', ok ? 'success' : 'danger', true);
    }
    var themeLabel = el('topbar-theme-label');
    if (themeLabel) themeLabel.textContent = state().settings && state().settings.theme === 'dark' ? '浅色' : '深色';
    applyTheme();
  }

  /* ------------------------------------------------------------ 引擎事件桥接 */

  function onEngineEvent(event, payload) {
    var p = payload || {};
    if (event === 'log') {
      uiState.sandboxLogs.push({ ts: Date.now(), level: p.level || 'info', message: p.message || '' });
      if (uiState.sandboxLogs.length > 240) uiState.sandboxLogs.shift();
    }
    if (event === 'status') uiState.engineStatus = p;
    if (event === 'state') uiState.sandboxData.state = p.state || 'idle';
    if (event === 'phase') uiState.sandboxData.phase = p.phase || 'idle';
    if (event === 'schedule') {
      uiState.sandboxData = freshSandboxData();
      uiState.sandboxData.maxAttempts = Number(p.maxAttempts) || 0;
      uiState.sandboxLogs = [];
    }
    if (event === 'tick') {
      uiState.sandboxData.remainingMs = Number(p.remainingMs) || 0;
      uiState.sandboxData.attempts = Number(p.attempts) || 0;
      if (p.maxAttempts) uiState.sandboxData.maxAttempts = Number(p.maxAttempts);
      if (typeof p.stock === 'number') uiState.sandboxData.stock = p.stock;
      if (p.phase) uiState.sandboxData.phase = p.phase;
    }
    if (event === 'attempt') {
      uiState.sandboxData.attempts = Number(p.index) || 0;
      if (p.maxAttempts) uiState.sandboxData.maxAttempts = Number(p.maxAttempts);
    }
    if (event === 'finished') uiState.sandboxData.outcome = p;
    if (event === 'captcha' || event === 'error') toast(p.message || '引擎提示', 'error');

    if (currentView === 'sandbox') {
      if (event === 'tick') updateTickDom();
      else if (event !== 'log') renderSandboxLive();
      else {
        var stream = el('sandbox-live') ? el('sandbox-live').querySelector('.log-stream') : null;
        if (stream) {
          stream.innerHTML = logStreamHtml();
          stream.scrollTop = stream.scrollHeight;
        }
      }
    }
    if (currentView === 'logs' && event === 'log') renderLogRows();
    if (event === 'status' || event === 'finished' || event === 'state') refreshTopbar();
  }

  /* ------------------------------------------------------------ 沙箱配置读取 */

  function readSandboxConfigFromDom() {
    var s = state().sandbox || (state().sandbox = data.defaultSandbox());
    if (!el('sb-config-root')) return core.deepClone(s);
    s.openInSec = Math.max(0, numOf('#sb-openInSec', 3));
    s.initialStock = Math.max(0, Math.floor(numOf('#sb-initialStock', 2)));
    s.successRate = core.clamp(numOf('#sb-successRate', 40) / 100, 0, 1);
    s.networkLatencyMs = Math.max(0, numOf('#sb-networkLatencyMs', 200));
    s.intervalMs = Math.floor(numOf('#sb-intervalMs', 1000));
    s.jitterPct = core.clamp(numOf('#sb-jitterPct', 0), 0, core.LIMITS.MAX_JITTER_PCT);
    s.maxAttempts = Math.floor(numOf('#sb-maxAttempts', 12));
    s.captchaAtAttempt = Math.max(1, Math.floor(numOf('#sb-captchaAtAttempt', 2)));
    s.triggerCaptcha = checkedOf('#sb-triggerCaptcha');
    s.warmupSec = 0;
    s.requireConfirm = true;
    s.liveSubmit = false;
    save();
    return core.deepClone(s);
  }

  /* ------------------------------------------------------------ 事件处理器 */

  var HANDLERS = {

    /* 全局 */
    'noop': function () {},
    'nav': function (t) { navigate(t.getAttribute('data-view')); },
    'new-task': function () { openTaskEditor(null); },
    'toggle-theme': function () {
      var s = state().settings;
      s.theme = s.theme === 'dark' ? 'light' : 'dark';
      save(); applyTheme(); refreshTopbar();
      toast('已切换为' + (s.theme === 'dark' ? '深色' : '浅色') + '主题', 'success');
    },
    'modal-close': function () { closeModal(); },
    'confirm-cancel': function () { closeConfirm(); },
    'confirm-ok': function () {
      var fn = uiState.confirm;
      closeConfirm();
      if (typeof fn === 'function') fn();
    },

    /* 任务中心 */
    'task-new': function () { openTaskEditor(null); },
    'task-edit': function (t) { openTaskEditor(t.getAttribute('data-id')); },
    'task-save': function () { saveTaskFromModal(); },
    'task-copy': function (t) {
      var src = findById('tasks', t.getAttribute('data-id'));
      if (!src) return;
      var copy = core.deepClone(src);
      copy.id = core.uid('task');
      copy.name = src.name + ' 副本';
      copy.status = 'draft';
      copy.createdAt = core.nowIso();
      copy.lastRun = null;
      state().tasks.push(copy);
      save(); render();
      addLog('info', '复制任务：' + copy.name, copy.id);
      toast('已复制任务', 'success');
    },
    'task-delete': function (t) {
      var id = t.getAttribute('data-id');
      var item = findById('tasks', id);
      if (!item) return;
      confirmDialog({ title: '删除任务', message: '确定删除任务「' + item.name + '」？此操作不可撤销。', danger: true, confirmText: '删除' }, function () {
        removeFrom('tasks', id);
        save(); render();
        addLog('warn', '删除任务：' + item.name, id);
        toast('任务已删除', 'success');
      });
    },
    'task-start': function (t) {
      if (!complianceOk()) return;
      var id = t.getAttribute('data-id');
      var item = findById('tasks', id);
      navigate('sandbox');
      var result = ctx.startTaskInSandbox(id);
      if (!result || !result.ok) toast((result && result.error) || '启动失败', 'error');
      else {
        addLog('info', '从任务中心启动演练：' + (item ? item.name : id), id);
        toast('演练已启动', 'success');
      }
    },
    'task-stop': function () {
      var result = ctx.stopSandbox();
      toast(result && result.ok ? '已停止演练' : '当前无运行中的演练', result && result.ok ? 'success' : 'warn');
    },
    'task-search': function (t) { filters.taskSearch = t.value || ''; renderTaskList(); },
    'task-filter-type': function (t) { filters.taskType = t.value; renderTaskList(); },
    'task-filter-status': function (t) { filters.taskStatus = t.value; renderTaskList(); },

    /* 适配器 */
    'adapter-new': function () { openAdapterEditor(null); },
    'adapter-edit': function (t) { openAdapterEditor(t.getAttribute('data-id')); },
    'adapter-save': function () { saveAdapterFromModal(); },
    'adapter-add-field': function () {
      var body = el('adapter-fields');
      if (body) body.insertAdjacentHTML('beforeend', adapterFieldRowHtml(null));
    },
    'adapter-remove-field': function (t) {
      var tr = t.closest ? t.closest('tr') : null;
      if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
    },
    'adapter-channel-change': function (t) {
      var ch = locators.normalizeChannel(t.value);
      uiState.adapterChannelDraft = ch;
      applyAdapterChannelVisibility(ch);
    },
    'adapter-add-locator': function () {
      var body = el('adapter-locators');
      if (body) body.insertAdjacentHTML('beforeend', locatorRowHtml(null));
    },
    'adapter-remove-locator': function (t) {
      var tr = t.closest ? t.closest('tr') : null;
      if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
    },
    'adapter-copy': function (t) {
      var src = findById('adapters', t.getAttribute('data-id'));
      if (!src) return;
      var copy = core.deepClone(src);
      copy.id = core.uid('adapter');
      copy.name = src.name + ' 副本';
      copy.createdAt = core.nowIso();
      state().adapters.push(copy);
      save(); render();
      addLog('info', '复制适配器：' + copy.name, null);
      toast('已复制适配器', 'success');
    },
    'adapter-delete': function (t) {
      var id = t.getAttribute('data-id');
      var item = findById('adapters', id);
      if (!item) return;
      var used = (state().tasks || []).filter(function (x) { return x.adapterId === id; }).length;
      confirmDialog({
        title: '删除适配器', danger: true, confirmText: '删除',
        message: '确定删除「' + item.name + '」？' + (used ? '当前有 ' + used + ' 个任务引用它，删除后这些任务将无法通过校验。' : '')
      }, function () {
        removeFrom('adapters', id);
        save(); render();
        addLog('warn', '删除适配器：' + item.name, null);
        toast('适配器已删除', 'success');
      });
    },

    /* 表单模板 */
    'template-new': function () {
      var tpl = {
        id: core.uid('tpl'), name: '新建模板',
        variables: [{ key: 'var1', label: '变量 1', value: '', sensitive: false }],
        mappings: [{ fieldKey: '', templateExpr: '' }]
      };
      state().templates.push(tpl);
      save(); render();
      addLog('info', '新建表单模板：' + tpl.name, null);
      toast('已创建模板，可直接编辑', 'success');
    },
    'template-input': function (t) { refreshPreview(t); },
    'template-save': function (t) {
      var id = t.getAttribute('data-id');
      var card = findCard(id);
      var existing = findById('templates', id);
      if (!card || !existing) return;
      var draft = readTemplateDraft(card);
      existing.name = (draft.name || '').trim() || existing.name;
      existing.variables = draft.variables;
      existing.mappings = draft.mappings;
      save(); render();
      addLog('info', '更新表单模板：' + existing.name, null);
      toast('模板已保存', 'success');
    },
    'template-copy': function (t) {
      var src = findById('templates', t.getAttribute('data-id'));
      if (!src) return;
      var copy = core.deepClone(src);
      copy.id = core.uid('tpl');
      copy.name = src.name + ' 副本';
      state().templates.push(copy);
      save(); render();
      addLog('info', '复制表单模板：' + copy.name, null);
      toast('已复制模板', 'success');
    },
    'template-delete': function (t) {
      var id = t.getAttribute('data-id');
      var item = findById('templates', id);
      if (!item) return;
      confirmDialog({ title: '删除模板', message: '确定删除「' + item.name + '」？', danger: true, confirmText: '删除' }, function () {
        removeFrom('templates', id);
        save(); render();
        addLog('warn', '删除表单模板：' + item.name, null);
        toast('模板已删除', 'success');
      });
    },
    'template-add-var': function (t) {
      var id = t.getAttribute('data-id');
      var card = findCard(id);
      if (!card) return;
      var body = card.querySelector('[data-var-rows]');
      if (body) body.insertAdjacentHTML('beforeend', varRowHtml(id, { key: '', label: '', value: '', sensitive: false }));
      refreshPreview(card);
    },
    'template-remove-var': function (t) {
      var card = t.closest ? t.closest('[data-template-card]') : null;
      var tr = t.closest ? t.closest('tr') : null;
      if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
      refreshPreview(card);
    },
    'template-toggle-visibility': function (t) {
      var tr = t.closest ? t.closest('tr') : null;
      if (!tr) return;
      var input = tr.querySelector('[data-var-value]');
      var keyNode = tr.querySelector('[data-var-key]');
      if (!input || !keyNode) return;
      var id = t.getAttribute('data-id');
      var mapKey = id + '::' + keyNode.value;
      var revealed = !uiState.revealed[mapKey];
      uiState.revealed[mapKey] = revealed;
      input.type = revealed ? 'text' : 'password';
      t.innerHTML = revealed ? eyeOffSvg() : eyeSvg();
    },
    'template-add-mapping': function (t) {
      var id = t.getAttribute('data-id');
      var card = findCard(id);
      if (!card) return;
      var body = card.querySelector('[data-map-rows]');
      if (body) body.insertAdjacentHTML('beforeend', mapRowHtml(id, null));
      refreshPreview(card);
    },
    'template-remove-mapping': function (t) {
      var card = t.closest ? t.closest('[data-template-card]') : null;
      var tr = t.closest ? t.closest('tr') : null;
      if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
      refreshPreview(card);
    },

    /* 调度策略 */
    'policy-new': function () { openPolicyEditor(null); },
    'policy-edit': function (t) { openPolicyEditor(t.getAttribute('data-id')); },
    'policy-input': function () { updatePolicyEstimate(); },
    'policy-save': function () { savePolicyFromModal(); },
    'policy-copy': function (t) {
      var src = findById('policies', t.getAttribute('data-id'));
      if (!src) return;
      var copy = core.deepClone(src);
      copy.id = core.uid('policy');
      copy.name = src.name + ' 副本';
      state().policies.push(copy);
      save(); render();
      addLog('info', '复制调度策略：' + copy.name, null);
      toast('已复制策略', 'success');
    },
    'policy-delete': function (t) {
      var id = t.getAttribute('data-id');
      var item = findById('policies', id);
      if (!item) return;
      confirmDialog({ title: '删除策略', message: '确定删除「' + item.name + '」？', danger: true, confirmText: '删除' }, function () {
        removeFrom('policies', id);
        save(); render();
        addLog('warn', '删除调度策略：' + item.name, null);
        toast('策略已删除', 'success');
      });
    },

    /* 演练沙箱 */
    'sandbox-config': function () { readSandboxConfigFromDom(); },
    'sandbox-set-open': function (t) {
      var sec = Number(t.getAttribute('data-sec')) || 3;
      var input = el('sb-openInSec');
      if (input) input.value = String(sec);
      readSandboxConfigFromDom();
      toast('开放时间已设为现在起 ' + sec + ' 秒', 'success');
    },
    'sandbox-start': function () {
      if (!complianceOk()) return;
      var cfg = readSandboxConfigFromDom();
      var check = core.validatePolicy({
        name: '演练策略', openAt: core.nowIso(),
        intervalMs: cfg.intervalMs, jitterPct: cfg.jitterPct, maxAttempts: cfg.maxAttempts,
        warmupSec: 0, timeoutMs: 10000, requireConfirm: true, liveSubmit: false, stopOnCaptcha: true
      });
      if (!check.ok) { toast(check.errors[0], 'error'); return; }
      uiState.sandboxLogs = [];
      uiState.sandboxData = freshSandboxData();
      var result = ctx.startSandbox(cfg);
      if (!result || !result.ok) toast((result && result.error) || '启动失败', 'error');
      else {
        addLog('info', '启动演练沙箱（间隔 ' + cfg.intervalMs + 'ms，上限 ' + cfg.maxAttempts + ' 次）', null);
        toast('演练已启动', 'success');
      }
    },
    'sandbox-pause': function () {
      var result = ctx.pauseSandbox();
      toast(result && result.ok ? '演练已暂停' : (result && result.error) || '无法暂停', result && result.ok ? 'success' : 'warn');
    },
    'sandbox-resume': function () {
      var result = ctx.resumeSandbox();
      toast(result && result.ok ? '演练已继续' : (result && result.error) || '无法继续', result && result.ok ? 'success' : 'warn');
    },
    'sandbox-stop': function () {
      var result = ctx.stopSandbox();
      toast(result && result.ok ? '演练已停止' : '当前无运行中的演练', result && result.ok ? 'success' : 'warn');
    },
    'sandbox-reset': function () {
      ctx.resetSandbox();
      uiState.sandboxData = freshSandboxData();
      uiState.sandboxLogs = [];
      renderSandboxLive();
      refreshTopbar();
      toast('演练已重置', 'success');
    },

    /* 日志中心 */
    'logs-filter-task': function (t) { filters.logTask = t.value; renderLogRows(); },
    'logs-filter-level': function (t) { filters.logLevel = t.value; renderLogRows(); },
    'logs-clear': function () {
      confirmDialog({ title: '清空日志', message: '确定清空全部审计日志？此操作不可撤销。', danger: true, confirmText: '清空' }, function () {
        state().logs = [];
        save(); render();
        addLog('warn', '审计日志已清空', null);
        toast('日志已清空', 'success');
      });
    },
    'logs-export': function () {
      var json = JSON.stringify(state().logs || [], null, 2);
      if (downloadFile('slotrunner-logs-' + Date.now() + '.json', json, 'application/json;charset=utf-8')) {
        toast('审计日志已导出', 'success');
      }
    },

    /* 脚本导出 / 配置导入导出 */
    'export-select-task': function (t) { uiState.exportTaskId = t.value; updateExportPreview(); },
    'export-generate': function () {
      if (!complianceOk()) return;
      updateExportPreview();
      toast('脚本已重新生成', 'success');
    },
    'export-toggle-secrets': function (t) {
      if (!complianceOk()) { t.checked = false; return; }
      uiState.exportIncludeSecrets = !!t.checked;
      render();
      if (uiState.exportIncludeSecrets) toast('已开启明文导出，请妥善保管生成的文件', 'warn');
    },
    'export-copy': function () {
      if (!complianceOk()) return;
      copyText(uiState.exportScript || generateScript());
      addLog('info', '复制' + (currentExportChannel() === 'web' ? ' UserScript' : ' 本地运行时脚本') + '到剪贴板', null);
    },
    'export-download-userscript': function () {
      if (!complianceOk()) return;
      var bundle = currentExportBundle();
      var script = bundle.source;
      var task = currentExportTask();
      var base = sanitizeFile(task ? task.name : 'slotrunner');
      var isPython = bundle.kind === 'python';
      var filename = isPython ? base + '.py' : base + '.user.js';
      if (downloadFile(filename, script, bundle.mime)) {
        addLog('info', '导出' + (isPython ? '本地运行时脚本' : 'UserScript') + '：' + filename, task ? task.id : null);
        toast(isPython ? '脚本已下载，请在本机运行（默认 dry-run）' : '脚本已下载，请自行安装到浏览器扩展', 'success');
        bundle.warnings.forEach(function (w) { toast(w, 'warn'); });
      }
    },
    'export-config-download': function () {
      if (!complianceOk()) return;
      var json = exporter.exportConfig(state(), { includeSecrets: uiState.exportIncludeSecrets });
      if (downloadFile('slotrunner-config-' + Date.now() + '.json', json, 'application/json;charset=utf-8')) {
        addLog(uiState.exportIncludeSecrets ? 'warn' : 'info',
          '导出配置 JSON' + (uiState.exportIncludeSecrets ? '（含敏感明文）' : '（敏感字段已脱敏）'), null);
        toast('配置已导出', 'success');
      }
    },
    'export-config-import': function () {
      var input = el('config-file-input');
      if (input) input.click();
    },
    'export-config-file': function (t, e) {
      if (e.type !== 'change' || !t.files || !t.files.length) return;
      var file = t.files[0];
      if (typeof FileReader === 'undefined') { toast('当前环境不支持读取本地文件', 'error'); t.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function (ev) {
        var result = exporter.importConfig(String(ev.target && ev.target.result ? ev.target.result : ''));
        t.value = '';
        if (!result.ok) {
          toast('导入失败：' + (result.errors[0] || '配置结构不合法'), 'error');
          result.errors.slice(1, 4).forEach(function (msg) { toast(msg, 'error'); });
          return;
        }
        confirmDialog({
          title: '导入配置', danger: true, confirmText: '确认导入',
          message: '将替换当前的适配器、模板、策略、任务与日志。' +
            (result.warnings.length ? '注意：' + result.warnings[0] : '')
        }, function () {
          var d = result.data;
          state().adapters = d.adapters;
          state().templates = d.templates;
          state().policies = d.policies;
          state().tasks = d.tasks;
          state().logs = d.logs;
          state().settings = d.settings;
          state().sandbox = (d.sandbox && Object.keys(d.sandbox).length) ? d.sandbox : data.defaultSandbox();
          save(); applyTheme(); refreshTopbar(); render();
          addLog('warn', '导入配置 JSON（合规确认与真实提交已重置）', null);
          toast('配置导入成功，请重新确认合规声明', 'success');
          result.warnings.slice(0, 3).forEach(function (w) { toast(w, 'warn'); });
        });
      };
      reader.onerror = function () { toast('文件读取失败', 'error'); t.value = ''; };
      reader.readAsText(file, 'utf-8');
    },

    /* 本地运行时（第 9 视图） */
    'localrunner-goto-export': function () {
      var task = currentLocalRunnerTask();
      if (task) uiState.exportTaskId = task.id;
      navigate('exporter');
    },
    'localrunner-select-task': function (t) {
      uiState.localrunnerTaskId = t.value;
      refreshLocalRunnerHint();
    },
    'localrunner-download': function () {
      if (!complianceOk()) return;
      var task = currentLocalRunnerTask();
      if (!task) { toast('请先在「任务中心」创建一个任务', 'error'); return; }
      var adapter = findById('adapters', task.adapterId) || {};
      var ch = locators.normalizeChannel(adapter.channel || task.channel);
      if (ch === 'web') {
        toast('Web 通道请到「脚本导出」页导出 UserScript；本地运行时脚本仅用于非 Web 通道', 'warn');
        return;
      }
      var template = findById('templates', task.templateId) || {};
      var policy = findById('policies', task.policyId) || engine.clampPolicy({});
      var bundle = exporter.buildForChannel(task, adapter, template, policy, {
        includeSecrets: uiState.exportIncludeSecrets,
        globalLiveSubmitEnabled: state().settings.liveSubmitEnabled === true
      });
      var base = sanitizeFile(task.name);
      if (downloadFile(base + '.py', bundle.source, bundle.mime)) {
        addLog('info', '从「本地运行时」导出脚本：' + base + '.py（通道 ' + ch + '）', task.id);
        toast('脚本已下载，请在本机运行（默认 dry-run）', 'success');
        bundle.warnings.forEach(function (w) { toast(w, 'warn'); });
      }
    },

    /* 帮助与合规 */
    'help-compliance': function (t) {
      state().settings.complianceAccepted = !!t.checked;
      save(); refreshTopbar(); render();
      addLog(t.checked ? 'success' : 'warn', t.checked ? '用户已确认合规声明' : '用户撤销合规确认', null);
      toast(t.checked ? '合规确认已记录' : '合规确认已撤销', t.checked ? 'success' : 'warn');
    },
    'help-revoke': function () {
      state().settings.complianceAccepted = false;
      save(); refreshTopbar(); render();
      addLog('warn', '撤销合规确认', null);
      toast('已撤销合规确认，禁止启动与导出', 'warn');
    },
    'help-live-submit': function (t) {
      if (t.checked) {
        t.checked = false;
        confirmDialog({
          title: '开启真实提交', danger: true, confirmText: '我了解，开启',
          message: '真实提交会在您确认后点击目标页面上的提交按钮。请确认您拥有合法权限并已了解目标站点条款。此开关默认关闭。'
        }, function () {
          state().settings.liveSubmitEnabled = true;
          save(); render();
          addLog('warn', '用户主动开启全局真实提交开关', null);
          toast('全局真实提交已开启（策略中仍需开启）', 'warn');
        });
      } else {
        state().settings.liveSubmitEnabled = false;
        save();
        addLog('info', '关闭全局真实提交开关', null);
        toast('已关闭真实提交', 'success');
      }
    },
    'help-reset-data': function () {
      confirmDialog({
        title: '重置全部本地数据', danger: true, confirmText: '确认重置',
        message: '将清空所有适配器、模板、策略、任务、日志与合规确认，并恢复演示数据。此操作不可撤销。'
      }, function () {
        ctx.resetAll();
        uiState.sandboxData = freshSandboxData();
        uiState.sandboxLogs = [];
        uiState.exportTaskId = '';
        uiState.exportScript = '';
        uiState.exportIncludeSecrets = false;
        uiState.revealed = {};
        filters = { taskSearch: '', taskType: 'all', taskStatus: 'all', logTask: 'all', logLevel: 'all' };
        applyTheme(); refreshTopbar(); render();
        toast('本地数据已重置', 'success');
      });
    }
  };

  /* ------------------------------------------------------------ 路由 / 入口 */

  function onAny(e) {
    if (e.type === 'submit') e.preventDefault();
    var node = e.target;
    var target = (node && node.closest) ? node.closest('[data-action]') : null;
    if (!target) {
      if (e.type === 'click' && node && node.classList && node.classList.contains('modal-backdrop')) {
        var confirmRoot = el('confirm-root');
        if (confirmRoot && confirmRoot.innerHTML) closeConfirm();
        else closeModal();
      }
      return;
    }
    if (e.type === 'click' && node && node.classList && node.classList.contains('modal-backdrop')) return;
    var action = target.getAttribute('data-action');
    var handler = HANDLERS[action];
    if (typeof handler === 'function') handler(target, e);
  }

  function navigate(view) {
    if (VIEWS.indexOf(view) === -1) view = 'dashboard';
    currentView = view;
    if (typeof document === 'undefined') return;
    var items = document.querySelectorAll('.nav-item');
    Array.prototype.forEach.call(items, function (n) {
      n.classList.toggle('nav-item--active', n.getAttribute('data-view') === view);
    });
    var sections = document.querySelectorAll('.view');
    Array.prototype.forEach.call(sections, function (s) {
      s.hidden = (s.getAttribute('data-view') !== view);
    });
    render();
    refreshTopbar();
  }

  function render() {
    if (typeof document === 'undefined') return;
    var map = {
      dashboard: renderDashboard,
      adapters: renderAdapters,
      templates: renderTemplates,
      policies: renderPolicies,
      sandbox: renderSandbox,
      logs: renderLogs,
      exporter: renderExporter,
      localrunner: renderLocalRunner,
      help: renderHelp
    };
    var section = el('view-' + currentView);
    if (!section) return;
    section.innerHTML = (map[currentView] || renderDashboard)();
    if (currentView === 'dashboard') renderTaskList();
    if (currentView === 'logs') renderLogRows();
    if (currentView === 'exporter') updateExportPreview();
    if (currentView === 'localrunner') refreshLocalRunnerHint();
    if (currentView === 'sandbox') renderSandboxLive();
  }

  function init(context) {
    ctx = context || {};
    if (typeof document === 'undefined') return;
    document.addEventListener('click', onAny);
    document.addEventListener('change', onAny);
    document.addEventListener('input', onAny);
    document.addEventListener('submit', onAny);
    applyTheme();
    refreshTopbar();
    refreshTopbarClock();
    navigate('dashboard');
  }

  var api = {
    init: init,
    navigate: navigate,
    render: render,
    renderDashboard: renderDashboard,
    renderAdapters: renderAdapters,
    renderTemplates: renderTemplates,
    renderPolicies: renderPolicies,
    renderSandbox: renderSandbox,
    renderLogs: renderLogs,
    renderExporter: renderExporter,
    renderLocalRunner: renderLocalRunner,
    renderHelp: renderHelp,
    renderTaskList: renderTaskList,
    refreshLogRows: renderLogRows,
    onEngineEvent: onEngineEvent,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    refreshTopbar: refreshTopbar,
    refreshTopbarClock: refreshTopbarClock,
    getView: function () { return currentView; }
  };

  SR.ui = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
