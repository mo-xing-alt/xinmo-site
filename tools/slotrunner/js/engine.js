/*
 * js/engine.js
 * 调度状态机 + 速率限制 + 演练沙箱。纯逻辑、无 DOM 依赖；
 * clock / rng / sleep / emit 全部可注入，便于在毫秒级完成单元测试。
 *
 * 合规硬约束在引擎层再次生效（不依赖 UI）：
 *   - intervalMs 强制 >= 1000，maxAttempts 强制 <= 50，jitterPct 0~50；
 *   - 抖动只增大间隔，不减小；
 *   - stopOnCaptcha 强制 true，检测到验证码立即中止；
 *   - 同一时刻只允许一个任务运行。
 */
(function (root) {
  'use strict';

  var SR = root.SR || (root.SR = {});
  var isNode = (typeof module !== 'undefined' && !!module.exports);
  var core = isNode ? require('./core.js') : SR.core;
  var LIMITS = core.LIMITS;

  // 能力表为可选软引用：locators.js 在脚本顺序中早于本文件；即便缺失也不影响原有沙箱行为。
  var locatorsMod = null;
  try {
    locatorsMod = isNode ? require('./locators.js') : (SR.locators || null);
  } catch (e) { locatorsMod = null; }

  var STATES = Object.freeze([
    'idle', 'scheduled', 'waiting', 'polling',
    'filling', 'confirming', 'submitting', 'paused',
    'success', 'failed', 'aborted'
  ]);

  // 状态机转移表。'@resume' 由 transition 的 ctx.resumeTo 决定（恢复暂停前状态）。
  var TRANSITIONS = Object.freeze({
    idle: { ARM: 'scheduled', RESET: 'idle' },
    scheduled: { WAIT: 'waiting', PAUSE: 'paused', STOP: 'aborted', RESET: 'idle', CAPTCHA: 'aborted' },
    waiting: { OPEN: 'polling', PAUSE: 'paused', STOP: 'aborted', RESET: 'idle', CAPTCHA: 'aborted', TIMEOUT: 'failed' },
    polling: { ATTEMPT: 'filling', PAUSE: 'paused', STOP: 'aborted', RESET: 'idle', CAPTCHA: 'aborted', EXHAUST: 'failed', TIMEOUT: 'failed' },
    filling: { FILLED: 'confirming', FAIL: 'polling', PAUSE: 'paused', STOP: 'aborted', RESET: 'idle', CAPTCHA: 'aborted', TIMEOUT: 'polling' },
    confirming: { CONFIRM: 'submitting', REJECT: 'aborted', PAUSE: 'paused', STOP: 'aborted', RESET: 'idle', CAPTCHA: 'aborted' },
    submitting: { SUCCESS: 'success', FAIL: 'polling', EXHAUST: 'failed', TIMEOUT: 'polling', PAUSE: 'paused', STOP: 'aborted', RESET: 'idle', CAPTCHA: 'aborted' },
    paused: { RESUME: '@resume', STOP: 'aborted', RESET: 'idle' },
    success: { RESET: 'idle' },
    failed: { RESET: 'idle' },
    aborted: { RESET: 'idle' }
  });

  var EVENTS = Object.freeze([
    'ARM', 'WAIT', 'OPEN', 'ATTEMPT', 'FILLED', 'CONFIRM', 'SUCCESS', 'FAIL',
    'REJECT', 'CAPTCHA', 'EXHAUST', 'TIMEOUT', 'PAUSE', 'RESUME', 'STOP', 'RESET'
  ]);

  /* ------------------------------------------------------------ 速率限制 */

  /**
   * 规范化轮询间隔。
   * 返回 { value, clamped, original, ms }；对象实现 valueOf()，可直接参与数值比较。
   * 低于 1000ms 一律钳制到 1000ms，非法输入回落到默认 3000ms。
   */
  function normalizeInterval(ms) {
    var original = Number(ms);
    var valid = isFinite(original) && original > 0;
    var value = valid ? Math.floor(original) : LIMITS.DEFAULT_INTERVAL_MS;
    var clamped = !valid;
    if (value < LIMITS.MIN_INTERVAL_MS) {
      value = LIMITS.MIN_INTERVAL_MS;
      clamped = true;
    }
    var result = { value: value, clamped: clamped, original: original, ms: value };
    result.valueOf = function () { return value; };
    return result;
  }

  /** 便捷版：只返回钳制后的毫秒数。 */
  function clampInterval(ms) {
    return normalizeInterval(ms).value;
  }

  /** 返回带变更明细的策略钳制结果 { policy, changes, changed }。 */
  function clampPolicyDetailed(policy) {
    var src = (policy && typeof policy === 'object' && !Array.isArray(policy)) ? policy : {};
    var p = {};
    Object.keys(src).forEach(function (key) { p[key] = src[key]; });

    var changes = [];
    function set(field, value) {
      if (p[field] !== value) {
        changes.push({ field: field, from: p[field], to: value });
        p[field] = value;
      }
    }

    set('intervalMs', clampInterval(src.intervalMs));

    var attempts = Number(src.maxAttempts);
    if (!isFinite(attempts) || attempts < 1) attempts = LIMITS.DEFAULT_ATTEMPTS;
    attempts = Math.min(LIMITS.MAX_ATTEMPTS, Math.floor(attempts));
    set('maxAttempts', attempts);

    var jitter = Number(src.jitterPct);
    if (!isFinite(jitter) || jitter < 0) jitter = 0;
    jitter = Math.min(LIMITS.MAX_JITTER_PCT, Math.max(0, jitter));
    set('jitterPct', jitter);

    var warmup = Number(src.warmupSec);
    if (!isFinite(warmup) || warmup < 0) warmup = 0;
    set('warmupSec', warmup);

    var timeout = Number(src.timeoutMs);
    if (!isFinite(timeout) || timeout <= 0) timeout = LIMITS.DEFAULT_TIMEOUT_MS;
    set('timeoutMs', timeout);

    // 三项合规硬约束：不可关闭 / 默认模拟提交 / 默认人工确认。
    set('stopOnCaptcha', true);
    set('liveSubmit', src.liveSubmit === true);
    set('requireConfirm', src.requireConfirm !== false);

    if (typeof src.name !== 'string' || src.name.trim().length === 0) set('name', '未命名策略');
    if (!src.openAt || isNaN(new Date(src.openAt).getTime())) set('openAt', core.nowIso());

    return { policy: p, changes: changes, changed: changes.length > 0 };
  }

  /** 返回钳制后的全新 policy 对象（不修改入参），可直接交给 validatePolicy。 */
  function clampPolicy(policy) {
    return clampPolicyDetailed(policy).policy;
  }

  /** 抖动后的间隔：恒 >= intervalMs（抖动只允许增大间隔）。 */
  function nextDelay(intervalMs, jitterPct, rng) {
    var base = clampInterval(intervalMs);
    var pct = Number(jitterPct);
    if (!isFinite(pct) || pct < 0) pct = 0;
    pct = Math.min(LIMITS.MAX_JITTER_PCT, pct);

    var rand = (typeof rng === 'function') ? rng() : Math.random();
    if (!isFinite(rand) || rand < 0) rand = 0;
    if (rand > 1) rand = 1;

    var delay = Math.floor(base * (1 + (pct / 100) * rand));
    if (delay < base) delay = base;
    if (delay < LIMITS.MIN_INTERVAL_MS) delay = LIMITS.MIN_INTERVAL_MS;
    return delay;
  }

  /* -------------------------------------------------------------- 状态机 */

  /**
   * 状态转移。合法返回 { state: 新状态, ok:true, error:null, from, event }；
   * 非法转移返回原状态并带 error，即 { state: 原状态, ok:false, error:'...' }。
   * ctx.resumeTo 用于 paused 的 RESUME 恢复。
   */
  function transition(state, event, ctx) {
    var options = ctx || {};
    var table = TRANSITIONS[state];
    if (!table || !Object.prototype.hasOwnProperty.call(table, event)) {
      return {
        state: state,
        ok: false,
        error: '非法状态转移：' + state + ' + ' + event,
        from: state,
        event: event
      };
    }
    var target = table[event];
    if (target === '@resume') target = options.resumeTo || 'polling';
    return { state: target, ok: true, error: null, from: state, event: event };
  }

  /* -------------------------------------------------------------- 沙箱 */

  /**
   * 创建演练沙箱。不访问任何外部站点，只模拟库存、成功率、验证码与网络延迟。
   * config: { openInSec, openAt, initialStock, successRate, competitionRate,
   *           triggerCaptcha, captchaAtAttempt, networkLatencyMs, rng }
   */
  function createSandbox(config) {
    var defaults = {
      openInSec: 3,
      openAt: null,
      initialStock: 2,
      successRate: 0.4,
      competitionRate: 0.2,
      triggerCaptcha: false,
      captchaAtAttempt: 2,
      networkLatencyMs: 200,
      // 演练通道维度：默认 web，行为与改造前完全一致；非 web 仅做纯内存模拟。
      channel: 'web',
      rng: Math.random
    };
    var cfg = {};
    Object.keys(defaults).forEach(function (key) { cfg[key] = defaults[key]; });
    var input = config || {};
    Object.keys(input).forEach(function (key) {
      if (input[key] !== undefined) cfg[key] = input[key];
    });

    function num(value, fallback) {
      var n = Number(value);
      return isFinite(n) ? n : fallback;
    }
    function rand() {
      var r = (typeof cfg.rng === 'function') ? cfg.rng() : Math.random();
      if (!isFinite(r)) return 0;
      return Math.min(1, Math.max(0, r));
    }
    function currentChannel() {
      return core.normalizeChannel ? core.normalizeChannel(cfg.channel) : 'web';
    }
    /** 取该通道能力声明；能力表缺失时返回 null，演练退化为原 web 行为。 */
    function currentCapability() {
      if (!locatorsMod || !locatorsMod.CHANNEL_CAPABILITIES) return null;
      return locatorsMod.CHANNEL_CAPABILITIES[currentChannel()] || null;
    }

    var stock = 0;
    var attempts = 0;
    var captchaTriggered = false;
    var handoffSimulated = false;
    var openAtMs = 0;
    var startedAtMs = 0;

    function computeOpenAt(clock) {
      if (cfg.openAt) {
        var parsed = new Date(cfg.openAt).getTime();
        if (isFinite(parsed)) return parsed;
      }
      var now = (typeof clock === 'function') ? clock() : Date.now();
      return now + Math.max(0, num(cfg.openInSec, 3)) * 1000;
    }

    var api = {
      /** 重置库存、尝试次数、验证码标记与开放时间。 */
      reset: function (clock) {
        stock = Math.max(0, Math.floor(num(cfg.initialStock, 2)));
        attempts = 0;
        captchaTriggered = false;
        handoffSimulated = false;
        startedAtMs = (typeof clock === 'function') ? clock() : Date.now();
        openAtMs = computeOpenAt(clock);
        return api.getState();
      },
      configure: function (patch) {
        var p = patch || {};
        Object.keys(p).forEach(function (key) { cfg[key] = p[key]; });
        return api.getState();
      },
      getState: function () {
        return {
          stock: stock,
          attempts: attempts,
          captchaTriggered: captchaTriggered,
          handoffSimulated: handoffSimulated,
          channel: currentChannel(),
          typicalLatencyMs: currentCapability() ? currentCapability().typicalLatencyMs : 0,
          openAtMs: openAtMs,
          startedAtMs: startedAtMs,
          initialStock: Math.max(0, Math.floor(num(cfg.initialStock, 2)))
        };
      },
      getStock: function () { return stock; },
      setStock: function (n) { stock = Math.max(0, Math.floor(num(n, 0))); return stock; },
      decrementStock: function (n) {
        stock = Math.max(0, stock - Math.max(1, Math.floor(num(n, 1))));
        return stock;
      },
      triggerCaptcha: function () { captchaTriggered = true; return true; },
      isCaptchaTriggered: function () { return captchaTriggered; },
      openAtMs: function () { return openAtMs; },

      /**
       * 执行一次尝试，返回：
       * { captcha, success, soldOut, stock, latencyMs, reason, attemptIndex }
       * reason: captcha | sold-out | success | retry
       */
      attempt: function (options) {
        var opt = options || {};
        var index = Math.max(1, Math.floor(num(opt.index, attempts + 1)));
        attempts = Math.max(attempts, index);

        var out = {
          captcha: false,
          success: false,
          soldOut: false,
          stock: stock,
          latencyMs: Math.max(0, Math.floor(num(cfg.networkLatencyMs, 0) * (0.6 + 0.8 * rand()))),
          reason: '',
          attemptIndex: index
        };

        // ---- channel 维度的纯内存模拟（绝不访问任何外部站点或真实窗口）----
        // web 通道：以下三个字段恒为默认值，行为与改造前完全一致。
        // 非 web 通道：按能力表的 typicalLatencyMs 记录一次 UI 操作延迟，
        // 并在首次尝试按 humanHandoff 模拟一次「等待人工接管」标记（不中止、不弹窗、不输入）。
        // uiLatencyMs 不叠加进 latencyMs，因此不参与 runOnce 的 timeout 判定，状态机判定保持不变。
        var channel = currentChannel();
        var capability = currentCapability();
        out.channel = channel;
        out.uiLatencyMs = 0;
        out.humanHandoff = false;
        if (channel !== 'web' && capability) {
          out.uiLatencyMs = Math.max(1, Math.floor(
            num(capability.typicalLatencyMs, 300) * (0.6 + 0.8 * rand())
          ));
          if (!handoffSimulated && capability.humanHandoff !== 'in-page') {
            handoffSimulated = true;
            out.humanHandoff = true;
          }
        }

        // 1) 验证码 / 人机验证：最高优先级，命中即要求中止并人工接管。
        if (cfg.triggerCaptcha === true && !captchaTriggered &&
            index >= Math.max(1, Math.floor(num(cfg.captchaAtAttempt, 2)))) {
          captchaTriggered = true;
          out.captcha = true;
          out.reason = 'captcha';
          out.stock = stock;
          return out;
        }

        // 2) 模拟「其他用户也在抢」造成的库存竞争消耗，使库存变化可见。
        var competition = num(cfg.competitionRate, 0);
        if (stock > 0 && competition > 0 && rand() < competition) {
          stock = Math.max(0, stock - 1);
        }
        out.stock = stock;

        // 3) 库存检查。
        if (stock <= 0) {
          out.soldOut = true;
          out.reason = 'sold-out';
          return out;
        }

        // 4) 成功率判定；成功则扣减库存。
        if (rand() < num(cfg.successRate, 0.4)) {
          stock = Math.max(0, stock - 1);
          out.success = true;
          out.stock = stock;
          out.reason = 'success';
        } else {
          out.reason = 'retry';
        }
        return out;
      }
    };

    api.reset();
    return api;
  }

  /* ---------------------------------------------------------- 单次尝试 */

  function outcomeLabel(outcome) {
    var map = { success: '成功', failed: '失败', aborted: '已中止' };
    return map[outcome] || String(outcome);
  }

  /**
   * 一次尝试：filling -> confirming -> submitting -> 判定。
   * 通过 ctx.apply(event) 让调用方（引擎）推进状态机；通过 emit('phase', ...) 广播阶段。
   * 可通过 ctx.result 直接注入沙箱结果，或通过 ctx.sandbox 使用 createSandbox 实例。
   * 返回 Promise<{ outcome, reason, captcha, stock, latencyMs, attemptIndex, simulated }>。
   */
  function runOnce(ctx) {
    var c = ctx || {};
    var emit = (typeof c.emit === 'function') ? c.emit : function () {};
    var sleepFn = (typeof c.sleep === 'function') ? c.sleep : function () { return Promise.resolve(); };
    var clock = (typeof c.clock === 'function') ? c.clock : function () { return Date.now(); };
    var rng = (typeof c.rng === 'function') ? c.rng : Math.random;
    var policy = clampPolicy(c.policy || {});      // 引擎层再次钳制，不信任 UI
    var index = Math.max(1, Math.floor(Number(c.attemptIndex) || 1));
    var liveSubmit = c.liveSubmit === true;
    var confirmFn = (typeof c.confirm === 'function') ? c.confirm : function () { return true; };
    var sandbox = c.sandbox || null;
    var injected = c.result || null;

    function phase(name, extra) {
      var payload = { phase: name, attemptIndex: index };
      if (extra) Object.keys(extra).forEach(function (key) { payload[key] = extra[key]; });
      emit('phase', payload);
    }
    function advance(event) {
      if (typeof c.apply === 'function') c.apply(event);
    }
    function log(level, message) {
      emit('log', { level: level, message: message, attemptIndex: index });
    }
    function wait(ms) {
      return Promise.resolve(sleepFn(Math.max(0, Number(ms) || 0)));
    }
    function done(outcome, reason, extra) {
      var out = {
        outcome: outcome,
        reason: reason,
        captcha: false,
        stock: null,
        latencyMs: 0,
        attemptIndex: index,
        simulated: !liveSubmit
      };
      if (extra) Object.keys(extra).forEach(function (key) { out[key] = extra[key]; });
      return out;
    }

    var res;
    if (injected) {
      res = injected;
    } else if (sandbox && typeof sandbox.attempt === 'function') {
      res = sandbox.attempt({ index: index, rng: rng });
    } else {
      res = { captcha: false, success: false, soldOut: false, stock: null, latencyMs: 0, reason: 'no-sandbox' };
    }
    res = res || {};
    var latencyMs = Math.max(0, Math.floor(Number(res.latencyMs) || 0));
    var stock = (res.stock === undefined || res.stock === null) ? null : res.stock;

    // ---- filling ----
    phase('filling', { fields: Number(c.fieldCount) || 0 });
    log('info', '第 ' + index + ' 次尝试：按字段映射执行 DOM 填写（日志不记录字段值）');

    // 合规：验证码 / 人机验证检测，立即中止并提示人工接管。
    if (res.captcha === true || c.captchaDetected === true) {
      emit('captcha', { message: '检测到验证码或人机验证挑战，已立即中止，请人工接管', attemptIndex: index });
      log('error', '检测到验证码 / 人机验证，任务立即中止，等待人工接管');
      return Promise.resolve(done('aborted', 'captcha', { captcha: true, stock: stock, latencyMs: latencyMs }));
    }

    // 单次尝试超时保护。
    if (latencyMs > policy.timeoutMs) {
      log('warn', '第 ' + index + ' 次尝试超过单次超时时间，判定为失败');
      return Promise.resolve(done('failed', 'timeout', { stock: stock, latencyMs: latencyMs }));
    }

    return wait(latencyMs).then(function () {
      // ---- confirming ----
      advance('FILLED');
      phase('filled', { fields: Number(c.fieldCount) || 0 });
      phase('confirming');

      if (policy.requireConfirm !== true) {
        log('info', '策略未开启提交前人工确认，继续');
      }
      return Promise.resolve(confirmFn({ attemptIndex: index, liveSubmit: liveSubmit, clock: clock() }));
    }).then(function (confirmed) {
      // 合规：提交前人工确认拒绝 => 中止。
      if (policy.requireConfirm === true && confirmed !== true) {
        log('warn', '用户未确认提交，任务中止');
        return done('aborted', 'confirm-declined', { stock: stock, latencyMs: latencyMs });
      }

      // ---- submitting ----
      advance('CONFIRM');
      phase('submitting', { liveSubmit: liveSubmit });
      if (liveSubmit) log('warn', '已按用户主动切换执行「真实提交」按钮点击');
      else log('info', '模拟提交（默认）：仅完成 DOM 填写，未点击真实提交按钮');

      // ---- 判定 ----
      if (res.success === true) {
        log('success', '第 ' + index + ' 次尝试成功，命中成功条件');
        return done('success', 'success', { stock: stock, latencyMs: latencyMs });
      }
      if (res.soldOut === true) {
        log('warn', '第 ' + index + ' 次尝试：目标名额已无库存');
        return done('failed', 'sold-out', { stock: stock, latencyMs: latencyMs });
      }
      log('warn', '第 ' + index + ' 次尝试未成功，将在速率限制后重试');
      return done('failed', 'retry', { stock: stock, latencyMs: latencyMs });
    });
  }

  /* -------------------------------------------------------------- 引擎 */

  /**
   * 创建调度引擎实例。
   * deps: { clock(): ms, rng(): [0,1), sleep(ms): Promise|any, emit(event, payload), tickMs }
   * 实例方法：start(task, ctx) / pause() / resume() / stop() / reset() / getState() / isRunning()
   */
  function createEngine(deps) {
    var d = deps || {};
    var clock = (typeof d.clock === 'function') ? d.clock : function () { return Date.now(); };
    var rng = (typeof d.rng === 'function') ? d.rng : Math.random;
    var sleepFn = (typeof d.sleep === 'function') ? d.sleep : function (ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    };
    var emit = (typeof d.emit === 'function') ? d.emit : function () {};
    var tickMs = Math.max(20, Math.floor(Number(d.tickMs) || 100));

    var inst = {
      state: 'idle',
      running: false,
      paused: false,
      stopped: false,
      pausedFrom: 'polling',
      token: 0,
      attempts: 0,
      maxAttempts: 0,
      policy: null,
      task: null,
      sandbox: null,
      confirm: null,
      liveSubmit: false,
      fieldCount: 0,
      resultProvider: null,
      lastOutcome: null,
      startedAtMs: 0,
      openAtMs: 0,
      pauseWaiters: []
    };

    function broadcast(event, payload) {
      try { emit(event, payload || {}); } catch (e) { /* 订阅方异常不影响引擎 */ }
    }
    function setState(next, event) {
      var prev = inst.state;
      inst.state = next;
      broadcast('state', {
        state: next,
        prev: prev,
        event: event || '',
        attempts: inst.attempts,
        maxAttempts: inst.maxAttempts
      });
    }
    function status() {
      broadcast('status', {
        running: inst.running,
        paused: inst.paused,
        stopped: inst.stopped,
        state: inst.state
      });
    }
    function log(level, message) {
      broadcast('log', {
        level: level,
        message: message,
        taskId: inst.task ? inst.task.id : null,
        state: inst.state,
        attempts: inst.attempts
      });
    }
    function wait(ms) {
      return Promise.resolve(sleepFn(Math.max(0, Math.floor(Number(ms) || 0))));
    }
    function stockNow() {
      return (inst.sandbox && typeof inst.sandbox.getStock === 'function') ? inst.sandbox.getStock() : null;
    }

    /** 注册一个「等待恢复」的挂起 Promise；resume / stop / reset 时统一放行。 */
    function waitResume(token) {
      return new Promise(function (resolve) {
        inst.pauseWaiters.push({ token: token, resolve: resolve });
      });
    }
    function releasePauseWaiters() {
      var list = inst.pauseWaiters.slice();
      inst.pauseWaiters.length = 0;
      list.forEach(function (w) { w.resolve(true); });
    }

    /** 暂停期间挂起直到 resume；不做忙轮询，兼容立即 resolve 的假 sleep。 */
    function waitWhilePaused(token) {
      if (!inst.paused) return Promise.resolve(true);
      if (token !== inst.token || inst.stopped) return Promise.resolve(false);
      return waitResume(token).then(function () {
        if (token !== inst.token || inst.stopped) return false;
        return true;
      });
    }

    /**
     * 可中断的分片等待：pause 时挂起且不推进 elapsed，stop / reset 时尽快退出。
     * 用累计的 sleep 时长计时，不依赖 clock 是否被假实现推进，便于毫秒级测试。
     */
    function interruptibleSleep(totalMs, token, onTick) {
      var total = Math.max(0, Math.floor(Number(totalMs) || 0));
      var elapsed = 0;
      function step() {
        if (token !== inst.token || inst.stopped) return Promise.resolve(false);
        if (elapsed >= total) return Promise.resolve(true);
        if (inst.paused) {
          return waitResume(token).then(function () {
            if (token !== inst.token || inst.stopped) return false;
            return step();
          });
        }
        var slice = Math.min(tickMs, total - elapsed);
        return wait(slice).then(function () {
          if (token !== inst.token || inst.stopped) return false;
          if (!inst.paused) elapsed += slice;
          if (typeof onTick === 'function') onTick(Math.max(0, total - elapsed));
          return step();
        });
      }
      return step();
    }

    function finish(outcome, reason, token, event) {
      if (token !== inst.token) return;
      var ev = event || (outcome === 'success' ? 'SUCCESS' : (outcome === 'aborted' ? 'STOP' : 'EXHAUST'));
      var fallback = { success: 'success', failed: 'failed', aborted: 'aborted' }[outcome] || 'failed';
      var tr = transition(inst.state, ev);
      setState(tr.ok ? tr.state : fallback, ev);

      inst.running = false;
      inst.lastOutcome = {
        outcome: outcome,
        reason: reason,
        attempts: inst.attempts,
        elapsedMs: Math.max(0, clock() - inst.startedAtMs)
      };
      log(outcome === 'success' ? 'success' : (outcome === 'aborted' ? 'warn' : 'error'),
        '任务结束：' + outcomeLabel(outcome) + '（' + reason + '），共尝试 ' + inst.attempts + ' 次');
      broadcast('finished', inst.lastOutcome);
      status();
    }

    function applyPhase(event) {
      if (inst.paused) return;
      var tr = transition(inst.state, event);
      if (tr.ok) setState(tr.state, event);
      else broadcast('error', { message: tr.error });
    }

    function handleResult(res, index, token) {
      if (token !== inst.token || inst.stopped) return Promise.resolve(null);
      var policy = inst.policy;

      broadcast('attemptResult', {
        index: index,
        outcome: res.outcome,
        reason: res.reason,
        stock: res.stock,
        captcha: !!res.captcha
      });

      if (res.outcome === 'aborted') {
        finish('aborted', res.reason, token, res.reason === 'captcha' ? 'CAPTCHA' : 'REJECT');
        return Promise.resolve(null);
      }
      if (res.outcome === 'success') {
        finish('success', res.reason, token, 'SUCCESS');
        return Promise.resolve(null);
      }

      // 失败：回到 polling，遵守速率限制后重试。
      var back = transition(inst.state, 'FAIL');
      setState(back.ok ? back.state : 'polling', 'FAIL');

      if (inst.attempts >= policy.maxAttempts) {
        finish('failed', 'max-attempts', token, 'EXHAUST');
        return Promise.resolve(null);
      }

      var delay = nextDelay(policy.intervalMs, policy.jitterPct, rng);
      broadcast('tick', {
        remainingMs: delay,
        phase: 'cooldown',
        attempts: inst.attempts,
        maxAttempts: policy.maxAttempts,
        stock: stockNow(),
        delayMs: delay
      });
      log('info', '速率限制：等待 ' + delay + 'ms 后进行下一次尝试（间隔不低于 ' + LIMITS.MIN_INTERVAL_MS + 'ms）');

      return interruptibleSleep(delay, token, function (remain) {
        broadcast('tick', {
          remainingMs: remain,
          phase: 'cooldown',
          attempts: inst.attempts,
          maxAttempts: policy.maxAttempts,
          stock: stockNow(),
          delayMs: delay
        });
      }).then(function (ok) {
        if (!ok || token !== inst.token || inst.stopped) return null;
        return loop(token);
      });
    }

    function loop(token) {
      if (token !== inst.token || inst.stopped) return Promise.resolve(null);
      var policy = inst.policy;

      if (inst.paused) {
        return waitResume(token).then(function () {
          if (token !== inst.token || inst.stopped) return null;
          return loop(token);
        });
      }
      if (inst.attempts >= policy.maxAttempts) {
        finish('failed', 'max-attempts', token, 'EXHAUST');
        return Promise.resolve(null);
      }

      var index = inst.attempts + 1;
      inst.attempts = index;

      var attemptTransition = transition(inst.state, 'ATTEMPT');
      if (!attemptTransition.ok) {
        setState('polling', 'RECOVER');
        attemptTransition = transition('polling', 'ATTEMPT');
      }
      setState(attemptTransition.state, 'ATTEMPT');

      broadcast('attempt', {
        index: index,
        maxAttempts: policy.maxAttempts,
        intervalMs: policy.intervalMs
      });
      log('info', '开始第 ' + index + ' / ' + policy.maxAttempts + ' 次尝试');

      return runOnce({
        emit: emit,
        sleep: sleepFn,
        clock: clock,
        rng: rng,
        apply: applyPhase,
        policy: policy,
        attemptIndex: index,
        sandbox: inst.sandbox,
        result: inst.resultProvider ? inst.resultProvider(index) : null,
        confirm: inst.confirm,
        liveSubmit: inst.liveSubmit,
        fieldCount: inst.fieldCount,
        captchaDetected: false
      }).then(function (res) {
        if (token !== inst.token || inst.stopped) return null;
        return waitWhilePaused(token).then(function (ok) {
          if (!ok || token !== inst.token || inst.stopped) return null;
          return handleResult(res, index, token);
        });
      });
    }

    function run(token) {
      var policy = inst.policy;
      var totalWait = Math.max(0, inst.openAtMs - clock());
      var warmupMs = Math.min(Math.max(0, Number(policy.warmupSec) * 1000), totalWait);
      var preWait = Math.max(0, totalWait - warmupMs);

      var armed = transition(inst.state, 'ARM');
      setState(armed.ok ? armed.state : 'scheduled', 'ARM');
      log('info', '任务已装载：' + (inst.task && inst.task.name ? inst.task.name : '未命名任务'));

      var waiting = transition(inst.state, 'WAIT');
      setState(waiting.ok ? waiting.state : 'waiting', 'WAIT');
      log('info', '等待开放时间（预热 ' + Math.round(warmupMs / 1000) + 's）');
      broadcast('schedule', {
        openAtMs: inst.openAtMs,
        warmupMs: warmupMs,
        intervalMs: policy.intervalMs,
        maxAttempts: policy.maxAttempts,
        jitterPct: policy.jitterPct
      });
      broadcast('tick', {
        remainingMs: totalWait,
        phase: 'waiting',
        attempts: 0,
        maxAttempts: policy.maxAttempts,
        stock: stockNow()
      });

      return interruptibleSleep(preWait, token, function (remain) {
        broadcast('tick', {
          remainingMs: remain + warmupMs,
          phase: 'waiting',
          attempts: 0,
          maxAttempts: policy.maxAttempts,
          stock: stockNow()
        });
      }).then(function (okWait) {
        if (!okWait || token !== inst.token || inst.stopped) return null;

        var opened = transition(inst.state, 'OPEN');
        setState(opened.ok ? opened.state : 'polling', 'OPEN');
        broadcast('warmup', { message: '进入预热阶段，准备按速率限制轮询' });
        log('info', '进入预热阶段，开放后开始轮询');

        return interruptibleSleep(warmupMs, token, function (remain) {
          broadcast('tick', {
            remainingMs: remain,
            phase: 'warmup',
            attempts: 0,
            maxAttempts: policy.maxAttempts,
            stock: stockNow()
          });
        });
      }).then(function (okWarm) {
        if (!okWarm || token !== inst.token || inst.stopped) return null;
        broadcast('tick', {
          remainingMs: 0,
          phase: 'polling',
          attempts: 0,
          maxAttempts: policy.maxAttempts,
          stock: stockNow()
        });
        log('info', '开放时间已到，开始以 ' + policy.intervalMs + 'ms 为下限轮询');
        return loop(token);
      }).catch(function (err) {
        var message = (err && err.message) ? err.message : String(err);
        log('error', '引擎异常：' + message);
        broadcast('error', { message: message });
        finish('failed', 'engine-error', token, 'TIMEOUT');
      });
    }

    /** 启动任务。同一时刻只允许一个任务运行；未确认合规时拒绝启动。 */
    function start(task, ctx) {
      var c = ctx || {};
      if (inst.running) {
        log('warn', '同一时刻只允许一个任务运行，已拒绝新的启动请求');
        broadcast('error', { message: '已有任务在运行，请先停止当前任务' });
        return { ok: false, error: '已有任务在运行' };
      }
      // 引擎层独立校验，不依赖 UI：省略 / 未确认一律拒绝，避免引擎作为独立模块被绕过。
      if (c.complianceAccepted !== true) {
        log('warn', '未确认合规声明，禁止启动任务');
        broadcast('error', { message: '请先在「帮助与合规」页勾选合规确认' });
        return { ok: false, error: '未确认合规声明' };
      }

      var policy = clampPolicy(c.policy || {});
      var sandbox = c.sandbox || createSandbox(c.sandboxConfig || {});
      if (typeof sandbox.reset === 'function') sandbox.reset(clock);

      inst.token += 1;
      releasePauseWaiters();           // 放行上一轮残留的暂停等待（旧 token 会自行退出）
      var token = inst.token;
      inst.running = true;
      inst.paused = false;
      inst.stopped = false;
      inst.attempts = 0;
      inst.lastOutcome = null;
      inst.task = task || {};
      inst.policy = policy;
      inst.sandbox = sandbox;
      inst.maxAttempts = policy.maxAttempts;
      inst.confirm = (typeof c.confirm === 'function') ? c.confirm : function () { return true; };
      inst.liveSubmit = c.liveSubmit === true;
      inst.fieldCount = Math.max(0, Math.floor(Number(c.fieldCount) || 0));
      inst.resultProvider = (typeof c.resultProvider === 'function') ? c.resultProvider : null;
      inst.startedAtMs = clock();
      if (typeof c.openAtMs === 'number' && isFinite(c.openAtMs)) {
        inst.openAtMs = c.openAtMs;
      } else if (sandbox && typeof sandbox.openAtMs === 'function' && isFinite(sandbox.openAtMs())) {
        inst.openAtMs = sandbox.openAtMs();
      } else {
        inst.openAtMs = inst.startedAtMs;
      }

      inst.state = 'idle';
      setState('idle', 'RESET');
      log('info', '引擎启动：间隔 ' + policy.intervalMs + 'ms，抖动 ' + policy.jitterPct +
        '%，最大 ' + policy.maxAttempts + ' 次，验证码中止已强制开启');
      status();

      run(token);
      return { ok: true, token: token, policy: policy };
    }

    function pause() {
      if (!inst.running || inst.paused) return { ok: false, error: '当前没有可暂停的任务' };
      inst.pausedFrom = inst.state;
      inst.paused = true;
      var tr = transition(inst.state, 'PAUSE');
      if (tr.ok) setState(tr.state, 'PAUSE');
      log('warn', '任务已暂停');
      broadcast('paused', { from: inst.pausedFrom });
      status();
      return { ok: true, state: inst.state };
    }

    function resume() {
      if (!inst.running || !inst.paused) return { ok: false, error: '当前没有已暂停的任务' };
      inst.paused = false;
      releasePauseWaiters();
      var tr = transition(inst.state, 'RESUME', { resumeTo: inst.pausedFrom || 'polling' });
      setState(tr.ok ? tr.state : (inst.pausedFrom || 'polling'), 'RESUME');
      log('info', '任务已继续');
      broadcast('resumed', { to: inst.state });
      status();
      return { ok: true, state: inst.state };
    }

    function stop() {
      if (!inst.running) return { ok: false, error: '当前没有运行中的任务' };
      inst.stopped = true;
      inst.paused = false;
      releasePauseWaiters();
      log('warn', '用户请求停止任务');
      finish('aborted', 'user-stop', inst.token, 'STOP');
      return { ok: true };
    }

    function reset() {
      inst.token += 1;                 // 使所有旧的异步循环立即失效
      inst.stopped = true;
      inst.running = false;
      inst.paused = false;
      releasePauseWaiters();
      inst.attempts = 0;
      inst.lastOutcome = null;
      inst.state = 'idle';
      if (inst.sandbox && typeof inst.sandbox.reset === 'function') inst.sandbox.reset(clock);
      setState('idle', 'RESET');
      broadcast('tick', {
        remainingMs: 0,
        phase: 'idle',
        attempts: 0,
        maxAttempts: 0,
        stock: stockNow()
      });
      log('info', '引擎已重置');
      status();
      return { ok: true };
    }

    function getState() {
      return {
        state: inst.state,
        running: inst.running,
        paused: inst.paused,
        stopped: inst.stopped,
        attempts: inst.attempts,
        maxAttempts: inst.maxAttempts,
        openAtMs: inst.openAtMs,
        lastOutcome: inst.lastOutcome ? core.deepClone(inst.lastOutcome) : null,
        policy: inst.policy ? core.deepClone(inst.policy) : null,
        stock: stockNow()
      };
    }

    return {
      start: start,
      pause: pause,
      resume: resume,
      stop: stop,
      reset: reset,
      getState: getState,
      isRunning: function () { return inst.running; }
    };
  }

  var api = {
    STATES: STATES,
    EVENTS: EVENTS,
    TRANSITIONS: TRANSITIONS,
    normalizeInterval: normalizeInterval,
    clampInterval: clampInterval,
    clampPolicy: clampPolicy,
    clampPolicyDetailed: clampPolicyDetailed,
    nextDelay: nextDelay,
    transition: transition,
    createSandbox: createSandbox,
    runOnce: runOnce,
    createEngine: createEngine,
    outcomeLabel: outcomeLabel
  };

  SR.engine = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
