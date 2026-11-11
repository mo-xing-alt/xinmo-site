/*
 * js/app.js
 * 入口初始化：加载 / 持久化应用状态、创建调度引擎、把引擎事件桥接到 UI 与审计日志。
 * 合规约束在此层再做一道拦截（UI 层与引擎层各有一道，共三层）。
 */
(function (root) {
  'use strict';

  var SR = root.SR || (root.SR = {});
  var isNode = (typeof module !== 'undefined' && !!module.exports);
  var core = isNode ? require('./core.js') : SR.core;
  var data = isNode ? require('./data.js') : SR.data;
  var engine = isNode ? require('./engine.js') : SR.engine;
  var exporter = isNode ? require('./exporter.js') : SR.exporter;
  var ui = isNode ? require('./ui.js') : SR.ui;

  /* ------------------------------------------------------------ 状态加载 */

  function findById(listName, id) {
    var list = state[listName] || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function loadState() {
    var loaded = {
      adapters: core.store.get(core.KEYS.adapters, null),
      templates: core.store.get(core.KEYS.templates, null),
      policies: core.store.get(core.KEYS.policies, null),
      tasks: core.store.get(core.KEYS.tasks, null),
      logs: core.store.get(core.KEYS.logs, null),
      settings: core.store.get(core.KEYS.settings, null),
      sandbox: core.store.get(core.KEYS.sandbox, null)
    };
    var initial = data.initialState();
    Object.keys(loaded).forEach(function (key) {
      if (loaded[key] === null || loaded[key] === undefined) loaded[key] = initial[key];
    });
    ['adapters', 'templates', 'policies', 'tasks', 'logs'].forEach(function (key) {
      if (!Array.isArray(loaded[key])) loaded[key] = [];
    });
    if (!loaded.settings || typeof loaded.settings !== 'object' || Array.isArray(loaded.settings)) {
      loaded.settings = data.defaultSettings();
    }
    if (typeof loaded.settings.complianceAccepted !== 'boolean') loaded.settings.complianceAccepted = false;
    if (typeof loaded.settings.liveSubmitEnabled !== 'boolean') loaded.settings.liveSubmitEnabled = false;
    if (loaded.settings.theme !== 'dark') loaded.settings.theme = 'light';
    if (!loaded.sandbox || typeof loaded.sandbox !== 'object' || Array.isArray(loaded.sandbox)) {
      loaded.sandbox = data.defaultSandbox();
    }
    return loaded;
  }

  var state = loadState();
  var currentTaskId = null;

  function save() {
    core.store.set(core.KEYS.adapters, state.adapters);
    core.store.set(core.KEYS.templates, state.templates);
    core.store.set(core.KEYS.policies, state.policies);
    core.store.set(core.KEYS.tasks, state.tasks);
    core.store.set(core.KEYS.logs, state.logs);
    core.store.set(core.KEYS.settings, state.settings);
    core.store.set(core.KEYS.sandbox, state.sandbox);
  }

  /** 防御性脱敏：即使调用方误把敏感明文拼进消息，也不会落入审计日志。 */
  function redactSensitive(message) {
    var text = String(message === undefined || message === null ? '' : message);
    (state.templates || []).forEach(function (tpl) {
      (tpl.variables || []).forEach(function (v) {
        if (!v || v.sensitive !== true || !v.value) return;
        var raw = String(v.value);
        if (raw.length >= 4 && text.indexOf(raw) !== -1) {
          text = text.split(raw).join(core.maskValue(raw));
        }
      });
    });
    return text;
  }

  function addLog(level, message, taskId) {
    var task = taskId ? findById('tasks', taskId) : null;
    var entry = {
      id: core.uid('log'),
      ts: core.nowIso(),
      taskId: taskId || null,
      taskName: task ? task.name : '',
      level: level || 'info',
      message: redactSensitive(message)
    };
    state.logs.push(entry);
    if (state.logs.length > core.LIMITS.MAX_LOGS) {
      state.logs.splice(0, state.logs.length - core.LIMITS.MAX_LOGS);
    }
    save();
    return entry;
  }

  /* ------------------------------------------------------------ 引擎与桥接 */

  function handleEngineEvent(event, payload) {
    var p = payload || {};

    if (event === 'log') {
      // 引擎产生的每条日志都进入本地全量审计日志。
      addLog(p.level || 'info', p.message || '', p.taskId || currentTaskId);
    }

    if (event === 'finished') {
      var outcome = p.outcome || 'failed';
      if (currentTaskId) {
        var task = findById('tasks', currentTaskId);
        if (task) {
          task.lastRun = {
            ts: core.nowIso(),
            outcome: outcome,
            reason: p.reason || '',
            attempts: Number(p.attempts) || 0
          };
          task.status = outcome === 'success' ? 'success' : (outcome === 'aborted' ? 'aborted' : 'failed');
          save();
        }
      }
      addLog(outcome === 'success' ? 'success' : (outcome === 'aborted' ? 'warn' : 'error'),
        '演练结束：' + engine.outcomeLabel(outcome) + '（' + (p.reason || '') + '），共尝试 ' + (p.attempts || 0) + ' 次',
        currentTaskId);
    }

    if (event === 'captcha') {
      addLog('error', '检测到验证码 / 人机验证，已立即中止并提示人工接管', currentTaskId);
    }

    // UI 只订阅事件，不参与调度决策。
    if (ui && typeof ui.onEngineEvent === 'function') ui.onEngineEvent(event, payload);

    if (event === 'finished' && ui && typeof ui.getView === 'function' && ui.getView() === 'dashboard') {
      ui.render();
    }
  }

  var engineInstance = engine.createEngine({
    clock: function () { return Date.now(); },
    rng: function () { return Math.random(); },
    sleep: function (ms) {
      return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
    },
    emit: handleEngineEvent,
    tickMs: 100
  });

  function getEngineStatus() {
    var snapshot = engineInstance.getState();
    return { running: snapshot.running, paused: snapshot.paused, state: snapshot.state };
  }

  /**
   * 启动本地演练。
   * 三重合规门槛：UI 检查 -> app 检查 -> engine.start 再次检查 complianceAccepted。
   * 真实提交还需「全局开关 + 策略开关 + 合规确认」三者同时成立；演练本身不访问任何站点。
   */
  function startSandbox(config, task) {
    if (state.settings.complianceAccepted !== true) {
      return { ok: false, error: '请先在「帮助与合规」页勾选合规确认' };
    }
    var cfg = config || core.deepClone(state.sandbox) || data.defaultSandbox();
    var openAtMs = Date.now() + Math.max(0, Number(cfg.openInSec) || 0) * 1000;

    var policy = {
      name: '演练策略',
      openAt: new Date(openAtMs).toISOString(),
      warmupSec: 0,
      intervalMs: cfg.intervalMs,
      jitterPct: cfg.jitterPct,
      maxAttempts: cfg.maxAttempts,
      timeoutMs: Math.max(1000, (Number(cfg.networkLatencyMs) || 0) * 2 + 1000),
      requireConfirm: true,
      liveSubmit: false,
      stopOnCaptcha: true
    };

    var sandboxConfig = {
      openInSec: cfg.openInSec,
      initialStock: cfg.initialStock,
      successRate: cfg.successRate,
      competitionRate: cfg.competitionRate === undefined ? 0.2 : cfg.competitionRate,
      triggerCaptcha: cfg.triggerCaptcha === true,
      captchaAtAttempt: cfg.captchaAtAttempt,
      networkLatencyMs: cfg.networkLatencyMs,
      rng: function () { return Math.random(); }
    };

    var globalLive = state.settings.liveSubmitEnabled === true;
    var liveSubmit = (cfg.liveSubmit === true) && globalLive && (state.settings.complianceAccepted === true);
    var adapter = task && task.adapterId ? findById('adapters', task.adapterId) : null;
    var fieldCount = adapter && Array.isArray(adapter.fields) ? adapter.fields.length : 0;

    currentTaskId = (task && findById('tasks', task.id)) ? task.id : null;

    return engineInstance.start(task || { id: 'sandbox', name: '本地演练沙箱' }, {
      policy: policy,
      sandboxConfig: sandboxConfig,
      openAtMs: openAtMs,
      confirm: function () { return true; },   // 演练自动通过人工确认；真实脚本仍会弹确认框
      liveSubmit: liveSubmit,
      fieldCount: fieldCount,
      complianceAccepted: state.settings.complianceAccepted
    });
  }

  /** 从任务中心「启动演练」：沿用该任务策略的间隔 / 抖动 / 次数，开放时间按演练需要缩短为 3 秒。 */
  function startTaskInSandbox(taskId) {
    var task = findById('tasks', taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    var policy = findById('policies', task.policyId) || engine.clampPolicy({});
    var cfg = core.deepClone(state.sandbox) || data.defaultSandbox();
    cfg.intervalMs = policy.intervalMs;
    cfg.jitterPct = policy.jitterPct;
    cfg.maxAttempts = policy.maxAttempts;
    cfg.openInSec = 3;
    state.sandbox = cfg;
    save();
    addLog('info', '任务演练：采用策略「' + policy.name + '」的间隔 ' + policy.intervalMs +
      'ms / 抖动 ' + policy.jitterPct + '% / 上限 ' + policy.maxAttempts +
      ' 次；开放时间按演练需要设为现在起 3 秒', task.id);
    if (ui && typeof ui.getView === 'function' && ui.getView() === 'sandbox' && typeof ui.render === 'function') {
      ui.render();
    }
    return startSandbox(cfg, task);
  }

  function pauseSandbox() { return engineInstance.pause(); }
  function resumeSandbox() { return engineInstance.resume(); }
  function stopSandbox() { return engineInstance.stop(); }
  function resetSandbox() {
    currentTaskId = null;
    return engineInstance.reset();
  }

  function resetAll() {
    engineInstance.reset();
    currentTaskId = null;
    core.store.clearAll();
    var initial = data.initialState();
    Object.keys(initial).forEach(function (key) { state[key] = initial[key]; });
    save();
    addLog('info', '本地数据已重置并恢复演示数据', null);
  }

  /* ------------------------------------------------------------ 启动 */

  var context = {
    core: core,
    data: data,
    engine: engine,
    exporter: exporter,
    state: state,
    save: save,
    addLog: addLog,
    getEngineStatus: getEngineStatus,
    startSandbox: startSandbox,
    startTaskInSandbox: startTaskInSandbox,
    pauseSandbox: pauseSandbox,
    resumeSandbox: resumeSandbox,
    stopSandbox: stopSandbox,
    resetSandbox: resetSandbox,
    resetAll: resetAll
  };

  function boot() {
    if (typeof document === 'undefined') return;
    save();
    ui.init(context);
    setInterval(function () { ui.refreshTopbarClock(); }, 1000);
    addLog('info', 'SlotRunner 已启动（纯本地数据，无外部请求）', null);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  var api = {
    context: context,
    state: state,
    engine: engineInstance,
    save: save,
    addLog: addLog,
    loadState: loadState,
    startSandbox: startSandbox,
    startTaskInSandbox: startTaskInSandbox,
    pauseSandbox: pauseSandbox,
    resumeSandbox: resumeSandbox,
    stopSandbox: stopSandbox,
    resetSandbox: resetSandbox,
    resetAll: resetAll,
    getEngineStatus: getEngineStatus
  };

  SR.app = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
