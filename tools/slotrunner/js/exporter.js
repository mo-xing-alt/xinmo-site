/*
 * js/exporter.js
 * UserScript (.user.js) 生成器 + 配置 JSON 导入导出。纯逻辑、无 DOM 依赖。
 *
 * 生成的脚本只包含：元数据、合规声明、DOM 字段填写、速率限制、最大尝试次数、
 * 验证码检测中止、提交前人工确认、成功关键词判定，以及（用户主动开启时）
 * 点击页面上已有的提交按钮。绝不内置任何真实第三方站点地址、隐藏接口或破解逻辑。
 */
(function (root) {
  'use strict';

  var SR = root.SR || (root.SR = {});
  var isNode = (typeof module !== 'undefined' && !!module.exports);
  var core = isNode ? require('./core.js') : SR.core;
  var engine = isNode ? require('./engine.js') : SR.engine;
  var locators = isNode ? require('./locators.js') : SR.locators;

  /** 惰性取得本地运行时生成器：exporter.js 在脚本顺序上早于 localrunner.js，必须在调用时再解析。 */
  function localRunnerModule() {
    if (isNode) return require('./localrunner.js');
    return SR.localrunner || null;
  }

  /** 清理用户脚本 @name；防止换行或注释结束符破坏元数据块。 */
  function sanitizeName(name) {
    var s = String(name === undefined || name === null ? '' : name)
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\*\//g, ' ')
      .trim();
    if (s.length > 80) s = s.slice(0, 80);
    return s || '未命名任务';
  }

  /** 由 targetUrl 生成 @match；去掉控制字符并在末尾补通配符。 */
  function sanitizeMatch(url) {
    var s = String(url === undefined || url === null ? '' : url)
      .replace(/[\r\n\t]/g, '')
      .replace(/\s+/g, '')
      .trim();
    if (s.length > 300) s = s.slice(0, 300);
    if (!s) return '*://*/*';
    if (s.charAt(s.length - 1) !== '*') s += '*';
    return s;
  }

  /**
   * 生成 UserScript 源码字符串。
   * @param {Object} task     任务（提供 name / targetUrl）
   * @param {Object} adapter  适配器（fields / submitSelector / captchaSelector / successKeyword）
   * @param {Object} template 模板（variables / mappings）
   * @param {Object} policy   策略（intervalMs / jitterPct / maxAttempts / requireConfirm / liveSubmit ...）
   * @param {Object} options  { includeSecrets:boolean, globalLiveSubmitEnabled:boolean }
   *                          includeSecrets 默认 false：敏感变量导出为占位符。
   *                          globalLiveSubmitEnabled 传入 false 时强制模拟提交（全局开关门槛）。
   */
  function buildUserScript(task, adapter, template, policy, options) {
    var t = task || {};
    var a = adapter || {};
    var tpl = template || {};
    var rawPolicy = policy || {};
    var opt = options || {};

    var includeSecrets = opt.includeSecrets === true;
    var globalEnabled = opt.globalLiveSubmitEnabled !== false;
    var p = engine.clampPolicy(rawPolicy);   // 导出前再次钳制，杜绝越界参数写进脚本
    var liveSubmit = (p.liveSubmit === true) && globalEnabled;

    var vars = core.buildVarMap(tpl);
    var sensitiveKeys = [];
    var variables = Array.isArray(tpl.variables) ? tpl.variables : [];
    variables.forEach(function (v) {
      if (v && v.sensitive === true && v.key) sensitiveKeys.push(String(v.key));
    });

    var mappingByKey = {};
    var mappings = Array.isArray(tpl.mappings) ? tpl.mappings : [];
    mappings.forEach(function (m) {
      if (m && m.fieldKey) mappingByKey[m.fieldKey] = (m.templateExpr === undefined ? '' : m.templateExpr);
    });

    var fields = (Array.isArray(a.fields) ? a.fields : []).map(function (f) {
      var field = f || {};
      var expr = Object.prototype.hasOwnProperty.call(mappingByKey, field.key)
        ? mappingByKey[field.key] : '';
      var value = core.interpolate(expr, vars);
      if (!includeSecrets && expr) {
        var hit = sensitiveKeys.filter(function (key) {
          var re = new RegExp('\\{\\{\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}');
          return re.test(String(expr));
        });
        if (hit.length > 0) value = '__SR_REDACTED__:' + hit.join(',');
      }
      return {
        key: String(field.key === undefined ? '' : field.key),
        selector: String(field.selector === undefined ? '' : field.selector),
        mode: String(field.mode === undefined ? 'value' : field.mode),
        value: value
      };
    });

    var mappingPreview = mappings.map(function (m) {
      return {
        fieldKey: String((m && m.fieldKey) || ''),
        templateExpr: String((m && m.templateExpr) || '')
      };
    });

    var config = {
      taskName: sanitizeName(t.name),
      targetUrl: String(t.targetUrl || ''),
      openAt: String(p.openAt || ''),
      intervalMs: p.intervalMs,
      jitterPct: p.jitterPct,
      maxAttempts: p.maxAttempts,
      warmupSec: p.warmupSec,
      timeoutMs: p.timeoutMs,
      requireConfirm: p.requireConfirm,
      liveSubmit: liveSubmit,
      preciseTrigger: true,
      stopOnCaptcha: true,
      submitSelector: String(a.submitSelector || ''),
      captchaSelector: String(a.captchaSelector || ''),
      successKeyword: String(a.successKeyword || ''),
      fields: fields,
      mappings: mappingPreview
    };

    var name = sanitizeName(t.name);
    var match = sanitizeMatch(t.targetUrl);
    var generatedAt = core.nowIso();
    var lines = [];

    lines.push('// ==UserScript==');
    lines.push('// @name         SlotRunner · ' + name);
    lines.push('// @namespace    https://slotrunner.invalid/');
    lines.push('// @version      1.0.0');
    lines.push('// @description  由 SlotRunner 生成的合规表单填报脚本；仅在您本人已登录且拥有合法权限的页面上运行。');
    lines.push('// @author       SlotRunner 用户');
    lines.push('// @match        ' + match);
    lines.push('// @grant        none');
    lines.push('// @run-at       document-idle');
    lines.push('// @noframes');
    lines.push('// ==/UserScript==');
    lines.push('');
    lines.push('/*');
    lines.push(' * ===================== 合规声明（请勿删除）=====================');
    lines.push(' * 生成时间：' + generatedAt);
    lines.push(' * 1. 本脚本只在「您本人已登录、且拥有合法操作权限」的页面上运行；');
    lines.push(' *    @match 完全来自您在 SlotRunner 中自行填写的目标页面地址。');
    lines.push(' * 2. 浏览器同源策略决定网页无法跨域操作别的站点，本脚本由您自行安装在');
    lines.push(' *    自己的浏览器扩展（如 Tampermonkey）中，在目标页面上下文内执行。');
    lines.push(' * 3. 严禁用于绕过验证码、人机验证、登录鉴权、加密签名或任何反爬机制；');
    lines.push(' *    一旦检测到验证挑战会立即停止并提示您人工接管。');
    lines.push(' * 4. 仅通过 DOM 填写表单，并在您确认后点击页面上已存在的提交按钮；');
    lines.push(' *    不调用任何隐藏接口，不发起任何后台网络请求，不读取或上传凭据。');
    lines.push(' * 5. 轮询间隔不低于 1000ms，单次任务最大尝试次数不超过 50 次；');
    lines.push(' *    随机抖动只会增大间隔，不会缩短间隔。');
    lines.push(' * 6. 默认「模拟提交」（只填表不点击）。真实提交需您在 SlotRunner 中主动切换，');
    lines.push(' *    且每次提交前都会弹出确认对话框由您决定。');
    lines.push(' * 7. 敏感字段默认不导出明文，需由您在本脚本中自行补全后再运行。');
    lines.push(' * 8. 使用前请自行确认目标站点的服务条款允许此类自动化操作，风险自负。');
    lines.push(' * 9. 精确触发（preciseTrigger）只优化「首次触发时刻」的到达精度（分段逼近 + 忙等 + 元素预缓存），');
    lines.push(' *    不放宽轮询间隔与尝试次数上限：间隔仍 >= 1000ms，尝试仍 <= 50 次。');
    lines.push(' * ================================================================');
    lines.push(' */');
    if (includeSecrets) {
      lines.push('');
      lines.push('/* 警告：本次导出包含了明文的敏感字段值，请妥善保管本文件，切勿分享或提交到代码仓库。 */');
    }
    lines.push('');
    lines.push("(function () {");
    lines.push("  'use strict';");
    lines.push('');
    lines.push('  var CONFIG = ' + JSON.stringify(config, null, 2).replace(/\n/g, '\n  ') + ';');
    lines.push('');
    lines.push('  // 防御性硬钳制：即使配置被手工篡改，合规上限依然生效。');
    lines.push('  CONFIG.intervalMs = Math.max(1000, Number(CONFIG.intervalMs) || 3000);');
    lines.push('  CONFIG.maxAttempts = Math.min(50, Math.max(1, Number(CONFIG.maxAttempts) || 20));');
    lines.push('  CONFIG.jitterPct = Math.min(50, Math.max(0, Number(CONFIG.jitterPct) || 0));');
    lines.push('  CONFIG.stopOnCaptcha = true;');
    lines.push('');
    lines.push('  var runtime = { attempts: 0, stopped: false, timer: null };');
    lines.push('');
    lines.push('  // 单调时间基准：优先 performance.now()，不可用时回落到 Date.now()。');
    lines.push("  var monoAvailable = (typeof performance !== 'undefined' && typeof performance.now === 'function');");
    lines.push('  var perfNow = monoAvailable');
    lines.push('    ? function () { return performance.now(); }');
    lines.push('    : function () { return Date.now(); };');
    lines.push('');
    lines.push('  // 元素预缓存：在触发前把字段与提交按钮一次性查好，避免到点后才开始 querySelector。');
    lines.push('  var elementCache = { fields: [], submit: null, stamp: 0 };');
    lines.push('');
    lines.push('  // 预热：遍历字段与提交按钮，把命中的元素缓存起来供触发瞬间直接使用。');
    lines.push('  function refreshCache() {');
    lines.push('    var count = 0;');
    lines.push('    elementCache.fields = [];');
    lines.push('    for (var i = 0; i < CONFIG.fields.length; i += 1) {');
    lines.push('      var el = null;');
    lines.push('      try { el = document.querySelector(CONFIG.fields[i].selector); } catch (e) { el = null; }');
    lines.push('      elementCache.fields[i] = el;');
    lines.push('      if (el) count += 1;');
    lines.push('    }');
    lines.push('    elementCache.submit = null;');
    lines.push('    if (CONFIG.submitSelector) {');
    lines.push('      try { elementCache.submit = document.querySelector(CONFIG.submitSelector); }');
    lines.push('      catch (e) { elementCache.submit = null; }');
    lines.push('    }');
    lines.push('    elementCache.stamp = Date.now();');
    lines.push('    log(\'预热完成：缓存 \' + count + \' / \' + CONFIG.fields.length + \' 个字段，提交按钮\' +');
    lines.push('      (elementCache.submit ? \'已就绪\' : \'未找到\'));');
    lines.push('  }');
    lines.push('');
    lines.push('  // 精确触发：把墙钟目标换算到单调基准，分段逼近后忙等最后 60ms，再立刻回调。');
    lines.push('  function preciseWait(targetWallMs, cb) {');
    lines.push('    // 没有单调时钟就根本不进精确等待：宁可精度降级，也绝不让页面卡死的风险成立。');
    lines.push('    if (!monoAvailable) {');
    lines.push("      log('无单调时钟可用，退回普通定时等待（精度降级，页面不会卡死）');");
    lines.push('      runtime.timer = setTimeout(cb, Math.max(0, targetWallMs - Date.now()));');
    lines.push('      return;');
    lines.push('    }');
    lines.push('    var targetMono = perfNow() + (targetWallMs - Date.now());');
    lines.push('    var refreshed = false;');
    lines.push('    function step() {');
    lines.push('      if (runtime.stopped) return;');
    lines.push('      var remain = targetMono - perfNow();');
    lines.push('      // 剩余不足 3 秒时再刷一次缓存，确保触发瞬间用的是最新元素（只刷一次）。');
    lines.push('      if (!refreshed && remain < 3000) {');
    lines.push('        refreshed = true;');
    lines.push('        refreshCache();');
    lines.push('      }');
    lines.push('      if (remain <= 60) {');
    lines.push('        // 最后一公里忙等：用空循环逼近目标时刻，把定时器精度误差压到最低。');
    lines.push('        // 护栏只能用「迭代次数」，不能用时钟做判据：时钟回拨会让差值变负、');
    lines.push('        // 冻结会让差值恒为 0，用同一时钟算超时在异常场景下必然失效（实测已证）。');
    lines.push('        var spins = 0;');
    lines.push('        while (perfNow() < targetMono) {');
    lines.push('          spins += 1;');
    lines.push("          if (spins > 3000000) { log('忙等护栏触发（迭代上限），立即执行'); break; }");
    lines.push('        }');
    lines.push('        cb();');
    lines.push('        return;');
    lines.push('      }');
    lines.push('      var slice;');
    lines.push('      if (remain > 60000) slice = 1000;');
    lines.push('      else if (remain > 1000) slice = Math.min(200, remain - 900);');
    lines.push('      else slice = 20;');
    lines.push('      runtime.timer = setTimeout(step, slice);');
    lines.push('    }');
    lines.push('    step();');
    lines.push('  }');
    lines.push('');
    lines.push('  function log(msg) {');
    lines.push("    if (typeof console !== 'undefined' && console.log) console.log('[SlotRunner] ' + msg);");
    lines.push('  }');
    lines.push('');
    lines.push('  function notify(msg) {');
    lines.push('    log(msg);');
    lines.push('    try { window.alert(msg); } catch (e) { /* 忽略弹窗不可用 */ }');
    lines.push('  }');
    lines.push('');
    lines.push('  function abort(reason) {');
    lines.push('    if (runtime.stopped) return;');
    lines.push('    runtime.stopped = true;');
    lines.push('    if (runtime.timer) { clearTimeout(runtime.timer); runtime.timer = null; }');
    lines.push("    notify('[SlotRunner] 已中止：' + reason + '\\n\\n请人工接管本页面，完成验证后再自行决定是否继续。');");
    lines.push('  }');
    lines.push('');
    lines.push('  // 合规：检测到验证码 / 人机验证元素即要求立即中止，不做任何绕过尝试。');
    lines.push('  function detectCaptcha() {');
    lines.push('    if (!CONFIG.captchaSelector) return false;');
    lines.push('    try { return !!document.querySelector(CONFIG.captchaSelector); }');
    lines.push('    catch (e) { return false; }');
    lines.push('  }');
    lines.push('');
    lines.push('  // 只允许 DOM 填写：设置 value 并派发原生 input / change 事件。');
    lines.push('  // el 由 resolveField(i) 提供（可能是预热缓存，也可能是失效后的重查结果）。');
    lines.push('  function fillElement(field, el) {');
    lines.push('    if (!field) return false;');
    lines.push("    if (!el) { log('未找到字段：' + field.key); return false; }");
    lines.push("    if (field.mode === 'click') { el.click(); return true; }");
    lines.push("    var value = (field.value === undefined || field.value === null) ? '' : String(field.value);");
    lines.push("    if (value.indexOf('__SR_REDACTED__') === 0) {");
    lines.push("      log('敏感字段 ' + field.key + ' 未包含明文，已跳过；请在本脚本中自行补全后再运行');");
    lines.push('      return false;');
    lines.push('    }');
    lines.push("    if ('value' in el) el.value = value;");
    lines.push('    else return false;');
    lines.push('    try {');
    lines.push("      el.dispatchEvent(new Event('input', { bubbles: true }));");
    lines.push("      el.dispatchEvent(new Event('change', { bubbles: true }));");
    lines.push('    } catch (e) { /* 部分页面禁用合成事件，忽略 */ }');
    lines.push('    return true;');
    lines.push('  }');
    lines.push('');
    lines.push('  // 取第 i 个字段元素：优先用预热缓存；元素已脱离文档（被重渲染）时重查并回写缓存。');
    lines.push('  function resolveField(i) {');
    lines.push('    var field = CONFIG.fields[i];');
    lines.push('    if (!field) return null;');
    lines.push('    var el = elementCache.fields[i];');
    lines.push('    if (el && document.contains && document.contains(el)) return el;');
    lines.push('    try { el = document.querySelector(field.selector); } catch (e) { el = null; }');
    lines.push('    elementCache.fields[i] = el;');
    lines.push('    return el;');
    lines.push('  }');
    lines.push('');
    lines.push('  function fillAll() {');
    lines.push('    for (var i = 0; i < CONFIG.fields.length; i += 1) fillElement(CONFIG.fields[i], resolveField(i));');
    lines.push('  }');
    lines.push('');
    lines.push('  // 成功判定只依赖页面上可见文本中的成功关键词。');
    lines.push('  function successDetected() {');
    lines.push('    if (!CONFIG.successKeyword) return false;');
    lines.push('    var text = \'\';');
    lines.push("    try { text = (document.body && document.body.innerText) ? document.body.innerText : ''; } catch (e) { text = ''; }");
    lines.push('    return text.indexOf(CONFIG.successKeyword) !== -1;');
    lines.push('  }');
    lines.push('');
    lines.push('  // 抖动只增大间隔，恒 >= intervalMs。');
    lines.push('  function nextDelay() {');
    lines.push('    var jitter = (Number(CONFIG.jitterPct) || 0) / 100;');
    lines.push('    return Math.floor(CONFIG.intervalMs * (1 + jitter * Math.random()));');
    lines.push('  }');
    lines.push('');
    lines.push('  function attempt() {');
    lines.push('    if (runtime.stopped) return;');
    lines.push("    if (CONFIG.stopOnCaptcha && detectCaptcha()) { abort('检测到验证码 / 人机验证挑战（合规中止）'); return; }");
    lines.push('    runtime.attempts += 1;');
    lines.push("    log('第 ' + runtime.attempts + ' / ' + CONFIG.maxAttempts + ' 次尝试：按字段映射填写表单');");
    lines.push('    fillAll();');
    lines.push('');
    lines.push('    // 提交前人工确认（默认开启）。');
    lines.push('    if (CONFIG.requireConfirm) {');
    lines.push("      var approved = window.confirm('[SlotRunner] 即将进行第 ' + runtime.attempts + ' 次填报。\\n\\n' +");
    lines.push("        '请确认：您已登录、拥有合法权限、并已核对表单内容。\\n' +");
    lines.push("        '脚本不会绕过任何验证码或登录验证。是否继续？');");
    lines.push("      if (!approved) { abort('用户未确认提交'); return; }");
    lines.push('    }');
    lines.push('');
    lines.push("    if (CONFIG.stopOnCaptcha && detectCaptcha()) { abort('检测到验证码 / 人机验证挑战（合规中止）'); return; }");
    lines.push('    if (CONFIG.liveSubmit === true) {');
    lines.push('      // 优先用预热缓存的提交按钮；失效（脱离文档）时重查并回写缓存。');
    lines.push('      var btn = elementCache.submit;');
    lines.push('      if (!btn || (document.contains && !document.contains(btn))) {');
    lines.push('        try { btn = document.querySelector(CONFIG.submitSelector); } catch (e) { btn = null; }');
    lines.push('        elementCache.submit = btn;');
    lines.push('      }');
    lines.push("      if (btn) { log('按您主动开启的配置点击页面上的提交按钮'); btn.click(); }");
    lines.push("      else { log('未找到提交按钮，本次不点击'); }");
    lines.push('    } else {');
    lines.push("      log('模拟提交（默认）：仅完成 DOM 填写，未点击提交按钮');");
    lines.push('    }');
    lines.push('');
    lines.push('    if (successDetected()) {');
    lines.push('      runtime.stopped = true;');
    lines.push("      notify('[SlotRunner] 已检测到成功关键词「' + CONFIG.successKeyword + '」，任务结束。');");
    lines.push('      return;');
    lines.push('    }');
    lines.push('    if (runtime.attempts >= CONFIG.maxAttempts) {');
    lines.push("      abort('已达到最大尝试次数 ' + CONFIG.maxAttempts + ' 次，请人工检查');");
    lines.push('      return;');
    lines.push('    }');
    lines.push('    var delay = nextDelay();');
    lines.push("    log('本次未成功，' + delay + 'ms 后重试（速率限制，间隔不低于 1000ms）');");
    lines.push('    runtime.timer = setTimeout(attempt, delay);');
    lines.push('  }');
    lines.push('');
    lines.push('  function boot() {');
    lines.push('    if (document.hidden) {');
    lines.push("      log('警告：当前标签页在后台，浏览器会节流定时器，请保持页面在前台可见');");
    lines.push('    }');
    lines.push("    if (CONFIG.stopOnCaptcha && detectCaptcha()) { abort('页面上已存在验证码 / 人机验证，脚本未启动'); return; }");
    lines.push('    var openAt = Date.parse(CONFIG.openAt);');
    lines.push('    var waitMs = isFinite(openAt) ? Math.max(0, openAt - Date.now()) : 0;');
    lines.push('    refreshCache();');
    lines.push("    if (waitMs > 0) log('等待开放时间，' + Math.ceil(waitMs / 1000) + ' 秒后开始');");
    lines.push("    log('SlotRunner 脚本已就绪：' + CONFIG.fields.length + ' 个字段，间隔 ' + CONFIG.intervalMs + 'ms，上限 ' + CONFIG.maxAttempts + ' 次');");
    lines.push('    if (waitMs > 0 && CONFIG.preciseTrigger) {');
    lines.push("      log('精确触发已调度：将在目标时刻前分段逼近（是否可用单调时钟见下一条日志）');");
    lines.push('      preciseWait(openAt, attempt);');
    lines.push('    } else {');
    lines.push('      runtime.timer = setTimeout(attempt, waitMs);');
    lines.push('    }');
    lines.push('  }');
    lines.push('');
    lines.push("  if (document.readyState === 'loading') {");
    lines.push("    document.addEventListener('DOMContentLoaded', boot);");
    lines.push('  } else {');
    lines.push('    boot();');
    lines.push('  }');
    lines.push('})();');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 统一导出入口：按执行通道分流。
   * web（含缺少 channel 的旧数据）→ 原 buildUserScript，行为完全不变；
   * desktop / miniprogram / mobile → 转发 SR.localrunner.buildLocalRunner 生成本地 Python 运行时脚本。
   * 返回 { channel, kind, filename, source, warnings }；调用方用 source 写入文件。
   */
  function buildForChannel(task, adapter, template, policy, options) {
    var a = adapter || {};
    var t = task || {};
    var channel = core.normalizeChannel(a.channel || t.channel);
    var cap = locators && locators.capabilityOf ? locators.capabilityOf(channel) : null;
    var warnings = [];

    if (cap && cap.reservationOnly) {
      warnings.push('通道 ' + channel + ' 的 UI 自动化单次操作延迟约 ' + cap.latencyText +
        '，仅适用于预约类任务，不适用于秒杀类；网页无法直接控制外部软件，脚本须在本机运行。');
    }
    if (cap && cap.scriptKind === 'python') {
      warnings.push('默认 --dry-run：只做窗口发现与定位器探测；真实提交须显式 --live 并在运行时再次交互确认。');
    }

    if (channel === 'web') {
      return {
        channel: channel,
        kind: 'userscript',
        filename: sanitizeName(t.name) + '.user.js',
        mime: 'text/javascript;charset=utf-8',
        source: buildUserScript(task, adapter, template, policy, options),
        warnings: warnings
      };
    }

    var mod = localRunnerModule();
    var source;
    if (!mod || typeof mod.buildLocalRunner !== 'function') {
      source = '# 本地运行时生成器（js/localrunner.js）未加载，请按 index.html 的脚本顺序引入后重试。\n';
      warnings.push('本地运行时生成器未加载，本次导出为占位提示而非可执行脚本。');
    } else {
      source = mod.buildLocalRunner(task, adapter, template, policy, options);
    }
    return {
      channel: channel,
      kind: 'python',
      filename: sanitizeName(t.name) + '.py',
      mime: 'text/x-python;charset=utf-8',
      source: source,
      warnings: warnings
    };
  }

  /**
   * 导出完整配置为格式化 JSON 字符串。
   * options.includeSecrets 默认 false：所有 sensitive 变量的值被 core.maskValue 脱敏。
   * 适配器 / 任务的新字段 channel / target / locators 随 deepClone 原样携带，旧数据仍可导入。
   */
  function exportConfig(state, options) {
    var opt = options || {};
    var includeSecrets = opt.includeSecrets === true;
    var src = state || {};
    var snapshot = core.deepClone(src) || {};

    var out = {
      adapters: Array.isArray(snapshot.adapters) ? snapshot.adapters : [],
      templates: Array.isArray(snapshot.templates) ? snapshot.templates : [],
      policies: Array.isArray(snapshot.policies) ? snapshot.policies : [],
      tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks : [],
      logs: Array.isArray(snapshot.logs) ? snapshot.logs : [],
      settings: (snapshot.settings && typeof snapshot.settings === 'object' && !Array.isArray(snapshot.settings))
        ? snapshot.settings : { complianceAccepted: false, theme: 'light', liveSubmitEnabled: false },
      sandbox: (snapshot.sandbox && typeof snapshot.sandbox === 'object' && !Array.isArray(snapshot.sandbox))
        ? snapshot.sandbox : {}
    };

    var redacted = 0;
    if (!includeSecrets) {
      out.templates.forEach(function (tpl) {
        if (tpl && Array.isArray(tpl.variables)) {
          tpl.variables.forEach(function (v) {
            if (v && v.sensitive === true) {
              v.value = core.maskValue(v.value);
              redacted += 1;
            }
          });
        }
      });
    }

    out._meta = {
      app: 'SlotRunner',
      version: 2,
      channelsIncluded: true,
      exportedAt: core.nowIso(),
      secretsIncluded: includeSecrets,
      redactedFields: includeSecrets ? 0 : redacted,
      warning: includeSecrets
        ? '警告：本文件包含明文的敏感字段（证件号 / 密码 / 令牌等），请妥善保管，切勿分享。'
        : '敏感字段已脱敏；导入后需重新填写明文。合规确认与真实提交开关不会随配置导入。'
    };

    return JSON.stringify(out, null, 2);
  }

  /**
   * 导入配置。拒绝非法 JSON / 非法结构；策略按合规硬约束自动钳制。
   * 返回 { ok, data, errors, warnings }；失败时 data 为 null。
   * 安全策略：导入后强制重置「合规确认」与「真实提交」开关，需用户重新主动开启。
   */
  function importConfig(json) {
    var errors = [];
    var warnings = [];
    var raw;

    if (typeof json === 'string') {
      try {
        raw = JSON.parse(json);
      } catch (e) {
        return { ok: false, data: null, errors: ['JSON 解析失败：' + e.message], warnings: warnings };
      }
    } else if (json && typeof json === 'object' && !Array.isArray(json)) {
      raw = json;
    } else {
      return { ok: false, data: null, errors: ['配置内容必须是 JSON 字符串或对象'], warnings: warnings };
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, data: null, errors: ['配置根节点必须是对象'], warnings: warnings };
    }

    if (raw._meta && typeof raw._meta === 'object' && Number(raw._meta.version) > 2) {
      warnings.push('该文件由更新版本的 SlotRunner 导出（version=' + Number(raw._meta.version) + '），当前版本可能无法识别新增字段，请核对导入结果后再使用');
    }

    var collectionKeys = ['adapters', 'templates', 'policies', 'tasks', 'logs'];
    var hasCollection = collectionKeys.some(function (key) { return Array.isArray(raw[key]); });
    if (!hasCollection) {
      return {
        ok: false,
        data: null,
        errors: ['配置缺少有效的数据集合（adapters / templates / policies / tasks / logs 至少需要一个数组）'],
        warnings: warnings
      };
    }

    var data = {
      adapters: [],
      templates: [],
      policies: [],
      tasks: [],
      logs: [],
      settings: { complianceAccepted: false, theme: 'light', liveSubmitEnabled: false },
      sandbox: {}
    };

    collectionKeys.forEach(function (key) {
      if (Array.isArray(raw[key])) data[key] = core.deepClone(raw[key]) || [];
      else if (raw[key] !== undefined) warnings.push('集合 ' + key + ' 不是数组，已忽略');
    });

    if (raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)) {
      var theme = raw.settings.theme === 'dark' ? 'dark' : 'light';
      data.settings.theme = theme;
      // 合规：导入绝不继承他人的合规确认或真实提交授权。
      data.settings.complianceAccepted = false;
      data.settings.liveSubmitEnabled = false;
      warnings.push('出于合规考虑，导入后「合规确认」与「真实提交」已重置为关闭，请重新主动开启');
    }
    if (raw.sandbox && typeof raw.sandbox === 'object' && !Array.isArray(raw.sandbox)) {
      data.sandbox = core.deepClone(raw.sandbox) || {};
      var sp = engine.clampPolicy(data.sandbox);
      data.sandbox.intervalMs = sp.intervalMs;
      data.sandbox.maxAttempts = sp.maxAttempts;
      data.sandbox.jitterPct = sp.jitterPct;
      data.sandbox.liveSubmit = false;
    }

    // 模板：轻量规范化，保证 variables / mappings 一定是数组。
    data.templates = data.templates.map(function (tpl, i) {
      if (!tpl || typeof tpl !== 'object' || Array.isArray(tpl)) {
        errors.push('模板 #' + (i + 1) + ' 不是对象');
        return { id: core.uid('tpl'), name: '无效模板', variables: [], mappings: [] };
      }
      if (!Array.isArray(tpl.variables)) tpl.variables = [];
      if (!Array.isArray(tpl.mappings)) tpl.mappings = [];
      return tpl;
    });

    // 按通道校验：web（含缺少 channel 的旧数据）走原 core.validateAdapter 等价逻辑；
    // 非 web 走窗口绑定 + 验证码定位器必填校验。同时把缺失 channel 的旧数据补齐为 web。
    data.adapters = data.adapters.map(function (item, i) {
      if (locators && typeof locators.ensureChannel === 'function') locators.ensureChannel(item);
      var validate = (locators && typeof locators.validateAdapterByChannel === 'function')
        ? locators.validateAdapterByChannel : core.validateAdapter;
      var r = validate(item);
      if (!r.ok) r.errors.forEach(function (e) { errors.push('适配器 #' + (i + 1) + '：' + e); });
      return item;
    });
    data.tasks.forEach(function (item, i) {
      var r = core.validateTask(item);
      if (!r.ok) r.errors.forEach(function (e) { errors.push('任务 #' + (i + 1) + '：' + e); });
    });

    data.policies = data.policies.map(function (item, i) {
      var original = (item && typeof item === 'object' && !Array.isArray(item)) ? item : {};
      var clamped = engine.clampPolicyDetailed(original);
      if (clamped.changed) {
        var detail = clamped.changes.map(function (c) {
          return c.field + ' ' + String(c.from) + ' → ' + String(c.to);
        }).join('、');
        warnings.push('策略 #' + (i + 1) + ' 已按合规硬约束自动钳制：' + detail);
      }
      var r = core.validatePolicy(clamped.policy);
      if (!r.ok) r.errors.forEach(function (e) { errors.push('策略 #' + (i + 1) + '：' + e); });
      return clamped.policy;
    });

    if (errors.length > 0) {
      return { ok: false, data: null, errors: errors, warnings: warnings };
    }
    return { ok: true, data: data, errors: [], warnings: warnings };
  }

  var api = {
    buildUserScript: buildUserScript,
    buildForChannel: buildForChannel,
    exportConfig: exportConfig,
    importConfig: importConfig,
    sanitizeName: sanitizeName,
    sanitizeMatch: sanitizeMatch
  };

  SR.exporter = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
