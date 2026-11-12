/*
 * js/core.js
 * 常量、纯工具函数、localStorage 封装、数据模型校验器、变量插值与格式化。
 * 纯逻辑模块：不依赖 DOM；浏览器挂 window.SR.core，Node 下可直接 require('./core.js')。
 */
(function (root) {
  'use strict';

  var SR = root.SR || (root.SR = {});
  var isNode = (typeof module !== 'undefined' && !!module.exports);

  /* ------------------------------------------------------------------ 常量 */

  var STORAGE_PREFIX = 'sr:';

  // 速率限制等合规硬约束的单一事实来源，UI / 校验器 / 引擎 / 导出脚本共同遵守。
  var LIMITS = Object.freeze({
    MIN_INTERVAL_MS: 1000,
    DEFAULT_INTERVAL_MS: 3000,
    MAX_ATTEMPTS: 50,
    DEFAULT_ATTEMPTS: 20,
    MAX_JITTER_PCT: 50,
    DEFAULT_TIMEOUT_MS: 10000,
    MAX_LOGS: 800
  });

  var KEYS = Object.freeze({
    adapters: 'adapters',
    templates: 'templates',
    policies: 'policies',
    tasks: 'tasks',
    logs: 'logs',
    settings: 'settings',
    sandbox: 'sandbox'
  });

  var TASK_TYPES = Object.freeze({
    course: { label: '抢课', glyph: '课' },
    ticket: { label: '抢票', glyph: '票' },
    quota: { label: '名额', glyph: '额' },
    form: { label: '表单', glyph: '表' }
  });

  var TASK_STATUSES = Object.freeze({
    draft: { label: '草稿', tone: 'neutral' },
    ready: { label: '就绪', tone: 'info' },
    running: { label: '运行中', tone: 'info' },
    success: { label: '成功', tone: 'success' },
    failed: { label: '失败', tone: 'danger' },
    aborted: { label: '已中止', tone: 'warn' }
  });

  var LOG_LEVELS = Object.freeze({
    info: { label: '信息', tone: 'neutral' },
    warn: { label: '警告', tone: 'warn' },
    error: { label: '错误', tone: 'danger' },
    success: { label: '成功', tone: 'success' }
  });

  var FIELD_MODES = Object.freeze(['value', 'click', 'select']);

  /**
   * 执行通道枚举。web 为原有行为（默认）；其余通道由本地运行时脚本承载。
   * 这是 channel 字段的唯一事实来源，UI / 校验器 / 引擎 / 导出脚本共同引用。
   */
  var CHANNELS = Object.freeze({
    web: { label: 'Web / 网页（UserScript）', experimental: false, localRunner: false },
    desktop: { label: '桌面客户端 / 任意 GUI', experimental: false, localRunner: true },
    miniprogram: { label: 'PC 客户端小程序窗口', experimental: false, localRunner: true },
    mobile: { label: 'Android 设备（uiautomator2 / 仅预约类）', experimental: false, localRunner: true }
  });

  var WINDOW_MATCH_MODES = Object.freeze(['contains', 'exact', 'regex']);

  /* -------------------------------------------------------------- 基础工具 */

  var _uidCounter = 0;

  /** 生成带前缀的本地唯一 id。 */
  function uid(prefix) {
    _uidCounter += 1;
    var time = Date.now().toString(36);
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + time + '_' + rand + '_' + _uidCounter.toString(36);
  }

  /** 当前时间的 ISO 8601 字符串。 */
  function nowIso() {
    return new Date().toISOString();
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** HTML 实体转义，所有向 innerHTML 拼接的用户输入都必须经过它。 */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 敏感值默认遮罩：保留首尾各一位，中间固定六个圆点。 */
  function maskValue(value) {
    if (value === null || value === undefined) return '';
    var str = String(value);
    if (str.length === 0) return '';
    if (str.length <= 2) return '••••';
    return str.charAt(0) + '••••••' + str.charAt(str.length - 1);
  }

  /** 把 {{var}} 占位符替换为变量表里的值；未命中的占位符替换为空串。 */
  function interpolate(expr, vars) {
    if (expr === null || expr === undefined) return '';
    var str = String(expr);
    var map = (vars && typeof vars === 'object') ? vars : {};
    return str.replace(/\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g, function (match, key) {
      if (Object.prototype.hasOwnProperty.call(map, key) &&
          map[key] !== null && map[key] !== undefined) {
        return String(map[key]);
      }
      return '';
    });
  }

  /** 由模板构造 { key: value } 变量表，供 interpolate 使用。 */
  function buildVarMap(template) {
    var map = {};
    if (template && Array.isArray(template.variables)) {
      template.variables.forEach(function (item) {
        if (item && item.key) {
          map[item.key] = (item.value === undefined || item.value === null) ? '' : item.value;
        }
      });
    }
    return map;
  }

  /** ISO 时间 -> 本地 YYYY-MM-DD HH:mm:ss；无效值返回破折号。 */
  function formatDateTime(iso) {
    if (iso === null || iso === undefined || iso === '') return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /** 毫秒 -> MM:SS（超过一小时为 HH:MM:SS），负数归零。 */
  function formatCountdown(ms) {
    var total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    if (h > 0) return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
    return pad2(m) + ':' + pad2(s);
  }

  /** 毫秒 -> 中文可读时长。 */
  function formatDuration(ms) {
    var total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (total < 60) return total + ' 秒';
    var m = Math.floor(total / 60);
    var s = total % 60;
    if (m < 60) return m + ' 分' + (s ? ' ' + s + ' 秒' : '');
    var h = Math.floor(m / 60);
    var rm = m % 60;
    return h + ' 小时' + (rm ? ' ' + rm + ' 分' : '');
  }

  /** 按「跑满最大尝试次数」估算策略的最短 / 最长总耗时。 */
  function estimatePolicyDuration(policy) {
    var p = policy || {};
    var interval = Math.max(LIMITS.MIN_INTERVAL_MS, Number(p.intervalMs) || LIMITS.DEFAULT_INTERVAL_MS);
    var attempts = Math.min(LIMITS.MAX_ATTEMPTS, Math.max(1, Number(p.maxAttempts) || LIMITS.DEFAULT_ATTEMPTS));
    var jitter = Math.min(LIMITS.MAX_JITTER_PCT, Math.max(0, Number(p.jitterPct) || 0));
    var warmup = Math.max(0, Number(p.warmupSec) || 0) * 1000;
    var minMs = Math.round(warmup + attempts * interval);
    var maxMs = Math.round(warmup + attempts * interval * (1 + jitter / 100));
    return {
      minMs: minMs,
      maxMs: maxMs,
      minText: formatDuration(minMs),
      maxText: formatDuration(maxMs),
      attempts: attempts,
      intervalMs: interval,
      jitterPct: jitter
    };
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /** 安全深拷贝（数据均为可 JSON 序列化的纯对象）。 */
  function deepClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------ 本地存储层 */

  var _memory = {};

  function makeKey(key) {
    return String(key).indexOf(STORAGE_PREFIX) === 0 ? String(key) : STORAGE_PREFIX + String(key);
  }

  function backend() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (e) { /* file:// 下某些浏览器禁用 localStorage，回退到内存 */ }
    return null;
  }

  var store = {
    /** 读取并 JSON 安全解析；解析失败或不存在时返回 fallback。 */
    get: function (key, fallback) {
      var k = makeKey(key);
      var raw = null;
      var b = backend();
      try {
        if (b) raw = b.getItem(k);
        else if (Object.prototype.hasOwnProperty.call(_memory, k)) raw = _memory[k];
      } catch (e) { raw = null; }
      if (raw === null || raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    /** 写入 JSON；配额溢出时回退到内存并返回 false。 */
    set: function (key, value) {
      var k = makeKey(key);
      var raw;
      try { raw = JSON.stringify(value); } catch (e) { return false; }
      var b = backend();
      try {
        if (b) b.setItem(k, raw);
        else _memory[k] = raw;
        return true;
      } catch (e) {
        _memory[k] = raw;
        return false;
      }
    },
    remove: function (key) {
      var k = makeKey(key);
      var b = backend();
      try { if (b) b.removeItem(k); } catch (e) { /* 忽略 */ }
      delete _memory[k];
    },
    /** 返回所有去掉前缀后的键名。 */
    keys: function () {
      var out = [];
      var b = backend();
      var i;
      var k;
      try {
        if (b) {
          for (i = 0; i < b.length; i += 1) {
            k = b.key(i);
            if (k && k.indexOf(STORAGE_PREFIX) === 0) out.push(k.slice(STORAGE_PREFIX.length));
          }
        } else {
          for (k in _memory) {
            if (Object.prototype.hasOwnProperty.call(_memory, k) && k.indexOf(STORAGE_PREFIX) === 0) {
              out.push(k.slice(STORAGE_PREFIX.length));
            }
          }
        }
      } catch (e) { /* 忽略 */ }
      return out;
    },
    clearAll: function () {
      var self = this;
      this.keys().forEach(function (key) { self.remove(key); });
    }
  };

  /* ---------------------------------------------------------------- 校验器 */

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /** 归一化执行通道：未知 / 缺失 / 非法值一律回落到 web（旧数据向后兼容）。 */
  function normalizeChannel(value) {
    if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHANNELS, value)) return value;
    return 'web';
  }

  function channelLabel(channel) {
    return CHANNELS[normalizeChannel(channel)].label;
  }

  /**
   * 窗口绑定校验（仅非 Web 通道使用）。把错误追加到 errors 数组。
   * 只校验进程名 / 窗口标题等元数据，不读取窗口内容，也不访问任何进程。
   */
  function validateTarget(target, errors) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      errors.push('非 Web 通道必须配置窗口绑定 target（processName / windowTitle）');
      return;
    }
    var hasProcess = isNonEmptyString(target.processName);
    var hasTitle = isNonEmptyString(target.windowTitle);
    if (!hasProcess && !hasTitle) {
      errors.push('窗口绑定 target 至少需要提供 processName 或 windowTitle 之一');
    }
    if (target.processName !== undefined && /[<>`]/.test(String(target.processName))) {
      errors.push('processName 含有非法字符（< > `）');
    }
    if (target.windowTitle !== undefined && /[\r\n<>`]/.test(String(target.windowTitle))) {
      errors.push('windowTitle 含有非法字符（换行 / < > `）');
    }
    if (target.windowMatchMode !== undefined && WINDOW_MATCH_MODES.indexOf(target.windowMatchMode) === -1) {
      errors.push('windowMatchMode 必须是 contains / exact / regex 之一');
    }
    if (target.exePath !== undefined && /[\r\n]/.test(String(target.exePath))) {
      errors.push('exePath 不能包含换行');
    }
    if (target.launchArgs !== undefined && !Array.isArray(target.launchArgs)) {
      errors.push('target.launchArgs 必须是数组');
    }
    if (target.bringToFront !== undefined && typeof target.bringToFront !== 'boolean') {
      errors.push('target.bringToFront 必须是布尔值');
    }
  }

  /**
   * 选择器基本合法性 + 合规检查。
   * 合规要点：选择器只能描述 DOM，不得夹带接口地址或脚本调用，
   * 从数据模型层面杜绝「隐藏接口」被写进配置。
   */
  function validateSelector(selector, label, errors) {
    if (!isNonEmptyString(selector)) {
      errors.push(label + ' 不能为空');
      return;
    }
    var s = selector.trim();
    if (s.length > 300) errors.push(label + ' 长度不能超过 300 字符');
    if (/[<>`]/.test(s)) errors.push(label + ' 含有非法字符（< > `）');
    if (/https?:\/\//i.test(s) || /\bjavascript:/i.test(s) ||
        /\bfetch\b|XMLHttpRequest|\bajax\b|\baxios\b/i.test(s)) {
      errors.push(label + ' 不得包含接口地址或后台请求调用（仅允许 DOM 选择器）');
    }
    if (/^[>+~,]/.test(s) || /[>+~,]$/.test(s)) {
      errors.push(label + ' 不能以组合运算符开头或结尾');
    }
    if (!/[A-Za-z0-9_#.*[\]\-:\u4e00-\u9fa5]/.test(s)) {
      errors.push(label + ' 不是有效的 CSS 选择器');
    }
  }

  /** Adapter 校验：返回 { ok, errors }。 */
  function validateAdapter(adapter) {
    var errors = [];
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
      return { ok: false, errors: ['适配器必须是对象'] };
    }
    if (!isNonEmptyString(adapter.name)) errors.push('适配器名称不能为空');
    if (!isNonEmptyString(adapter.urlPattern)) errors.push('URL 匹配模式不能为空');
    else if (/[\r\n]/.test(adapter.urlPattern)) errors.push('URL 匹配模式不能包含换行');
    if (!Array.isArray(adapter.fields) || adapter.fields.length === 0) {
      errors.push('至少需要配置一个字段');
    } else {
      var seen = {};
      adapter.fields.forEach(function (field, index) {
        var label = '字段 #' + (index + 1);
        if (!field || typeof field !== 'object' || Array.isArray(field)) {
          errors.push(label + ' 格式错误');
          return;
        }
        if (!isNonEmptyString(field.key)) errors.push(label + ' 的 key 不能为空');
        else if (seen[field.key]) errors.push('字段 key 重复：' + field.key);
        else seen[field.key] = true;
        if (FIELD_MODES.indexOf(field.mode) === -1) {
          errors.push(label + ' 的 mode 必须是 value / click / select 之一');
        }
        validateSelector(field.selector, label + ' 选择器', errors);
      });
    }
    validateSelector(adapter.submitSelector, '提交按钮选择器', errors);
    // 合规硬约束：验证码检测选择器是必填项，不允许创建「绕过人机验证」的适配器。
    if (!isNonEmptyString(adapter.captchaSelector)) {
      errors.push('必须配置验证码检测选择器（合规要求，不可省略）');
    } else {
      validateSelector(adapter.captchaSelector, '验证码检测选择器', errors);
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /** Policy 校验：速率限制与验证码中止均为硬约束，返回 { ok, errors }。 */
  function validatePolicy(policy) {
    var errors = [];
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      return { ok: false, errors: ['调度策略必须是对象'] };
    }
    if (!isNonEmptyString(policy.name)) errors.push('策略名称不能为空');

    var interval = Number(policy.intervalMs);
    if (!isFinite(interval) || interval < LIMITS.MIN_INTERVAL_MS) {
      errors.push('轮询间隔不得低于 ' + LIMITS.MIN_INTERVAL_MS + 'ms（速率限制硬约束）');
    }
    var attempts = Number(policy.maxAttempts);
    if (!isFinite(attempts) || attempts < 1) errors.push('最大尝试次数至少为 1');
    else if (attempts > LIMITS.MAX_ATTEMPTS) {
      errors.push('最大尝试次数不得超过 ' + LIMITS.MAX_ATTEMPTS + ' 次（速率限制硬约束）');
    }
    var jitter = Number(policy.jitterPct);
    if (!isFinite(jitter) || jitter < 0 || jitter > LIMITS.MAX_JITTER_PCT) {
      errors.push('随机抖动百分比需在 0 ~ ' + LIMITS.MAX_JITTER_PCT + ' 之间');
    }
    var warmup = Number(policy.warmupSec);
    if (!isFinite(warmup) || warmup < 0) errors.push('预热秒数不能为负数');
    var timeout = Number(policy.timeoutMs);
    if (!isFinite(timeout) || timeout <= 0) errors.push('单次尝试超时时间必须大于 0');

    if (policy.openAt && isNaN(new Date(policy.openAt).getTime())) {
      errors.push('开放时间格式不合法');
    }
    if (policy.stopOnCaptcha !== true) {
      errors.push('「检测到验证码立即中止」为强制合规项，不可关闭');
    }
    if (typeof policy.liveSubmit !== 'boolean') errors.push('真实提交开关必须是布尔值');
    if (typeof policy.requireConfirm !== 'boolean') errors.push('提交前人工确认开关必须是布尔值');

    return { ok: errors.length === 0, errors: errors };
  }

  /** Task 校验：返回 { ok, errors }。 */
  function validateTask(task) {
    var errors = [];
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      return { ok: false, errors: ['任务必须是对象'] };
    }
    if (!isNonEmptyString(task.name)) errors.push('任务名称不能为空');
    if (!TASK_TYPES[task.type]) errors.push('任务类型必须是 course / ticket / quota / form 之一');

    var taskChannel = normalizeChannel(task.channel);
    if (!isNonEmptyString(task.targetUrl)) {
      // 非 Web 通道没有目标页面 URL：允许留空（窗口绑定由适配器的 target 承载）。
      // web 通道（含缺少 channel 的旧数据）仍维持原有「不能为空」强校验。
      if (taskChannel === 'web') errors.push('目标页面 URL 不能为空');
    } else {
      var url = task.targetUrl;
      if (/\s/.test(url) || /[\r\n]/.test(url)) errors.push('目标页面 URL 不能包含空白或换行字符');
      if (/javascript:|data:|file:/i.test(url)) errors.push('目标页面 URL 协议不合法');
      // 非 Web 通道允许填写占位说明文字，不再强制 http(s) 协议；web 通道保持原校验。
      if (taskChannel === 'web' && !/^(https?:\/\/|\*:\/\/|\*)/i.test(url)) {
        errors.push('目标页面 URL 必须是 http(s) 或通配符匹配模式');
      }
    }
    if (task.channel !== undefined && !Object.prototype.hasOwnProperty.call(CHANNELS, task.channel)) {
      errors.push('执行通道 channel 必须是 web / desktop / miniprogram / mobile 之一');
    }

    if (!isNonEmptyString(task.adapterId)) errors.push('必须关联一个适配器');
    if (!isNonEmptyString(task.templateId)) errors.push('必须关联一个表单模板');
    if (!isNonEmptyString(task.policyId)) errors.push('必须关联一个调度策略');
    if (!TASK_STATUSES[task.status]) errors.push('任务状态不合法');

    return { ok: errors.length === 0, errors: errors };
  }

  /* ---------------------------------------------------------------- 导出 */

  var api = {
    STORAGE_PREFIX: STORAGE_PREFIX,
    LIMITS: LIMITS,
    KEYS: KEYS,
    TASK_TYPES: TASK_TYPES,
    TASK_STATUSES: TASK_STATUSES,
    LOG_LEVELS: LOG_LEVELS,
    FIELD_MODES: FIELD_MODES,
    CHANNELS: CHANNELS,
    WINDOW_MATCH_MODES: WINDOW_MATCH_MODES,
    normalizeChannel: normalizeChannel,
    channelLabel: channelLabel,
    validateTarget: validateTarget,
    uid: uid,
    nowIso: nowIso,
    escapeHtml: escapeHtml,
    maskValue: maskValue,
    interpolate: interpolate,
    buildVarMap: buildVarMap,
    formatDateTime: formatDateTime,
    formatCountdown: formatCountdown,
    formatDuration: formatDuration,
    estimatePolicyDuration: estimatePolicyDuration,
    toNumber: toNumber,
    clamp: clamp,
    deepClone: deepClone,
    store: store,
    validateSelector: validateSelector,
    validateAdapter: validateAdapter,
    validatePolicy: validatePolicy,
    validateTask: validateTask
  };

  SR.core = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
