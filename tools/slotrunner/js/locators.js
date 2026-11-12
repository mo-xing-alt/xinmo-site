/*
 * js/locators.js
 * 统一元素定位 DSL 与执行通道能力表。纯逻辑模块：不依赖 DOM；
 * 浏览器挂 window.SR.locators，Node 下可直接 require('./locators.js')。
 *
 * 明确禁止项（合规，勿删）：
 *   - 定位器只用于「读取界面可见控件 / 文字以定位」，不得用于识别验证码；
 *   - 不得用于调用或重放任何私有接口、隐藏 API、后台网络请求；
 *   - 不得用于反编译小程序包、逆向签名参数或 hook 客户端进程内存；
 *   - coordinate_anchor 只允许相对目标窗口矩形的 0..1 归一化坐标，禁止绝对屏幕坐标硬编码。
 *
 * 本模块只做「配置与能力描述」，绝不尝试访问外部站点、窗口或进程。
 */
(function (root) {
  'use strict';

  var SR = root.SR || (root.SR = {});
  var isNode = (typeof module !== 'undefined' && !!module.exports);
  var core = isNode ? require('./core.js') : SR.core;

  /* ------------------------------------------------------------------ 通道 */

  // 通道枚举、归一化与窗口匹配模式统一取自 core.js（单一事实来源），此处不重复定义。
  var CHANNELS = core.CHANNELS;
  var WINDOW_MATCH_MODES = core.WINDOW_MATCH_MODES;
  var normalizeChannel = core.normalizeChannel;
  var channelLabel = core.channelLabel;

  /* -------------------------------------------------------------- 定位器种类 */

  /**
   * 9 种定位方式。
   * required: 必填字段；channels: 支持该 kind 的通道；
   * semantics: 语义；valueHint: 表单提示。
   * coordinate_anchor 的 value 写作 "nx,ny"（0..1 归一化），解析后同时写入 nx / ny。
   */
  var LOCATOR_KINDS = Object.freeze({
    css: {
      required: ['value'],
      channels: ['web'],
      semantics: 'CSS 选择器，仅描述 DOM，禁止夹带接口地址或脚本调用；支持 iframe / shadow DOM 穿透写法。',
      valueHint: 'CSS 选择器，如 #submit'
    },
    xpath: {
      required: ['value'],
      channels: ['web'],
      semantics: 'XPath 表达式，仅用于浏览器页面 DOM 定位。',
      valueHint: 'XPath 表达式，如 //button[@type="submit"]'
    },
    text: {
      required: ['value'],
      channels: ['web', 'desktop', 'miniprogram', 'mobile'],
      semantics: '按界面可见文字匹配控件；exact 字段控制全等 / 包含，默认包含。',
      valueHint: '界面可见文字，如 确认提交'
    },
    role: {
      required: ['value'],
      channels: ['web'],
      semantics: 'ARIA role 定位，name 可选；仅浏览器页面支持。',
      valueHint: 'ARIA role，如 button'
    },
    uia_automation_id: {
      required: ['value'],
      channels: ['desktop', 'miniprogram', 'mobile'],
      semantics: 'Windows UIA AutomationId / 安卓 resource-id；controlType 可缩小范围；客户端版本升级后须重新录制。',
      valueHint: '控件 AutomationId，如 btnSubmit'
    },
    uia_name: {
      required: ['value'],
      channels: ['desktop', 'miniprogram', 'mobile'],
      semantics: 'Windows UIA Name / 安卓 text 属性；controlType 可缩小范围。',
      valueHint: '控件 Name，如 确认'
    },
    image_template: {
      required: ['value'],
      channels: ['desktop', 'miniprogram', 'mobile'],
      semantics: '相对 ./templates/ 的模板图路径，threshold 默认 0.85，searchRect 为归一化搜索区域；无控件树时兜底。',
      valueHint: '模板图文件名，如 submit_button.png'
    },
    ocr_text: {
      required: ['value'],
      channels: ['desktop', 'miniprogram', 'mobile'],
      semantics: '读取界面可见文字以定位控件；lang 默认 chi_sim+eng；严禁用于识别验证码。',
      valueHint: '界面可见文字，如 立即预约'
    },
    coordinate_anchor: {
      required: ['value'],
      channels: ['desktop', 'miniprogram', 'mobile'],
      semantics: '相对目标窗口矩形左上角的归一化坐标，value 写作 "nx,ny"；运行时乘以窗口当前矩形换算，禁止绝对屏幕坐标。',
      valueHint: '归一化坐标 "nx,ny"，如 0.5,0.82'
    }
  });

  /* --------------------------------------------------------------- 能力矩阵 */

  /**
   * 每个通道的能力声明。供 UI 能力提示、导出警告与演练沙箱模拟使用。
   * typicalLatencyMs 取各通道延迟区间的上界 / 实测 P95；非 web 通道一律 reservationOnly。
   */
  var CHANNEL_CAPABILITIES = Object.freeze({
    web: {
      adapterType: 'web',
      supportedKinds: ['css', 'xpath', 'text', 'role'],
      canPrefill: true,
      canBackground: true,
      canWatchNetwork: true,
      typicalLatencyMs: 30,
      latencyText: '10–50ms',
      humanHandoff: 'in-page',
      humanHandoffText: '页内弹窗提示，无需切换窗口',
      suitableFor: '秒杀类、预约类均可',
      reservationOnly: false,
      scriptKind: 'userscript',
      scriptLabel: 'UserScript（.user.js）',
      runtime: '浏览器扩展（Tampermonkey 等）',
      prerequisites: [
        '安装浏览器扩展（Tampermonkey / Violentmonkey 等）',
        '目标页面须已由您本人登录且拥有合法权限',
        'playwright / chromium 非必需，Web 通道不依赖本地 Python'
      ]
    },
    desktop: {
      adapterType: 'desktop',
      supportedKinds: ['uia_automation_id', 'uia_name', 'text', 'image_template', 'ocr_text', 'coordinate_anchor'],
      canPrefill: true,
      canBackground: false,
      canWatchNetwork: false,
      typicalLatencyMs: 800,
      latencyText: '100–800ms',
      humanHandoff: 'window-front',
      humanHandoffText: '置顶提示 + 目标窗口置前 + 人工按键继续',
      suitableFor: '仅预约类；不适用于秒杀类',
      reservationOnly: true,
      scriptKind: 'python',
      scriptLabel: '本地运行时脚本（.py）',
      runtime: 'Windows + Python 3.11+ + pywinauto / uiautomation',
      prerequisites: [
        'Windows 10/11，目标客户端已启动且窗口可见',
        'Python 3.11+，执行 pip install pywinauto uiautomation',
        '可选：pip install Pillow opencv-python pytesseract（模板匹配 / 界面文字读取）',
        '目标客户端版本升级后须重新录制 uia_automation_id / uia_name'
      ]
    },
    miniprogram: {
      adapterType: 'miniprogram',
      supportedKinds: ['uia_automation_id', 'uia_name', 'text', 'image_template', 'ocr_text', 'coordinate_anchor'],
      canPrefill: false,
      canBackground: false,
      canWatchNetwork: false,
      typicalLatencyMs: 1200,
      latencyText: '300–2000ms',
      humanHandoff: 'window-front',
      humanHandoffText: '置顶提示 + 微信窗口置前 + 人工按键继续',
      suitableFor: '仅预约类；不适用于秒杀类',
      reservationOnly: true,
      scriptKind: 'python',
      scriptLabel: '本地运行时脚本（.py）',
      runtime: 'Windows + Python 3.11+ + PC 微信客户端窗口',
      prerequisites: [
        'Windows 10/11，PC 微信客户端已登录且小程序窗口可见、不可最小化',
        'Python 3.11+，执行 pip install pywinauto uiautomation',
        '小程序运行在微信客户端内部容器，无法注入 DOM、不暴露调试端口，只做窗口级 UI 自动化',
        '微信客户端版本升级会导致窗口结构变化，须重新录制定位器'
      ]
    },
    mobile: {
      adapterType: 'mobile',
      supportedKinds: ['uia_automation_id', 'uia_name', 'text', 'image_template', 'ocr_text', 'coordinate_anchor'],
      canPrefill: true,
      canBackground: false,
      canWatchNetwork: false,
      typicalLatencyMs: 1500,
      latencyText: '300–2000ms',
      humanHandoff: 'device-mirror',
      humanHandoffText: '设备投屏 / 人工在真机完成',
      suitableFor: '仅预约类；不适用于秒杀类',
      reservationOnly: true,
      scriptKind: 'python',
      scriptLabel: '本地运行时脚本（.py，uiautomator2）',
      runtime: 'Android 真机 / 模拟器 + adb + Python 3.11+（跨平台）',
      prerequisites: [
        '仅限用户本人设备与账号，需开启开发者选项与 USB 调试授权，或连接已授权的模拟器',
        'Python 3.11+，执行 pip install uiautomator2，并安装 Android SDK platform-tools（adb）',
        'uia_automation_id 映射 resourceId、uia_name 映射 content-desc、text 映射界面文字；coordinate_anchor 按屏幕尺寸归一化',
        '脚本不会自动启动应用，请由用户自行打开到目标页面；小程序容器不暴露 DOM，只做界面层级自动化'
      ]
    }
  });

  function capabilityOf(channel) {
    return CHANNEL_CAPABILITIES[normalizeChannel(channel)];
  }

  function kindOptionsFor(channel) {
    var cap = capabilityOf(channel);
    return cap.supportedKinds.map(function (kind) {
      return { value: kind, label: kind, meta: LOCATOR_KINDS[kind] };
    });
  }

  /* -------------------------------------------------------------- 值合法性 */

  /** 定位值的通用合规检查：禁止接口地址 / 脚本调用 / 危险字符，防止把隐藏接口写进配置。 */
  function checkLocatorValue(value, label, errors) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(label + ' 不能为空');
      return;
    }
    var s = value.trim();
    if (s.length > 300) errors.push(label + ' 长度不能超过 300 字符');
    if (/[<>`]/.test(s)) errors.push(label + ' 含有非法字符（< > `）');
    if (/https?:\/\//i.test(s) || /\bjavascript:/i.test(s) ||
        /\bfetch\b|XMLHttpRequest|\bajax\b|\baxios\b/i.test(s)) {
      errors.push(label + ' 不得包含接口地址或后台请求调用（仅允许界面定位描述）');
    }
  }

  /** 解析归一化坐标：优先取 nx / ny 字段，其次从 "nx,ny" 的 value 中拆分。 */
  function parseAnchor(loc, errors) {
    var nx = loc.nx;
    var ny = loc.ny;
    if (nx === undefined || ny === undefined) {
      var parts = String(loc.value === undefined ? '' : loc.value).split(',');
      if (parts.length === 2) {
        nx = Number(parts[0].trim());
        ny = Number(parts[1].trim());
      }
    } else {
      nx = Number(nx);
      ny = Number(ny);
    }
    if (!isFinite(nx) || !isFinite(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
      errors.push('coordinate_anchor 的 nx / ny 必须是 0..1 的归一化值（相对窗口矩形），禁止绝对屏幕坐标');
      return null;
    }
    return { nx: nx, ny: ny };
  }

  /**
   * 解析单个定位器。
   * 纯字符串 -> 按 css 兼容解析（web 通道旧格式）；对象 -> 按 kind 判别校验。
   * @param {*} input      字符串或 { kind, value, ... } 对象
   * @param {string} channel 可选，传入时校验该 kind 是否被此通道支持
   * @returns {{ok:boolean, locator:Object|null, errors:string[]}}
   */
  function parseLocator(input, channel) {
    var errors = [];
    var loc;

    if (typeof input === 'string') {
      var raw = input.trim();
      if (!raw) return { ok: false, locator: null, errors: ['定位器字符串不能为空'] };
      loc = { kind: 'css', value: raw };
    } else if (input && typeof input === 'object' && !Array.isArray(input)) {
      loc = {};
      Object.keys(input).forEach(function (key) { loc[key] = input[key]; });
    } else {
      return { ok: false, locator: null, errors: ['定位器必须是字符串或对象'] };
    }

    var kind = String(loc.kind === undefined || loc.kind === null ? '' : loc.kind).trim();
    if (!kind) {
      if (typeof input === 'string') kind = 'css';
      else return { ok: false, locator: null, errors: ['定位器缺少 kind 字段'] };
    }
    if (!Object.prototype.hasOwnProperty.call(LOCATOR_KINDS, kind)) {
      return { ok: false, locator: null, errors: ['不支持的定位方式 kind：' + kind] };
    }
    loc.kind = kind;

    if (kind === 'coordinate_anchor') {
      var anchor = parseAnchor(loc, errors);
      if (anchor) {
        loc.nx = anchor.nx;
        loc.ny = anchor.ny;
        loc.value = anchor.nx + ',' + anchor.ny;
      }
    } else {
      checkLocatorValue(loc.value, LOCATOR_KINDS[kind].valueHint || kind + ' 的 value', errors);
    }

    if (typeof loc.value === 'string') loc.value = loc.value.trim();
    if (typeof loc.timeoutMs !== 'number' || !isFinite(loc.timeoutMs) || loc.timeoutMs < 0) {
      loc.timeoutMs = 3000;
    }
    if (typeof loc.optional !== 'boolean') loc.optional = false;

    if (channel !== undefined && channel !== null) {
      var ch = normalizeChannel(channel);
      if (capabilityOf(ch).supportedKinds.indexOf(kind) === -1) {
        errors.push('通道 ' + ch + ' 不支持定位方式 ' + kind + '（UnsupportedLocator，不可重试）');
      }
    }

    if (errors.length) return { ok: false, locator: null, errors: errors };
    return { ok: true, locator: loc, errors: [] };
  }

  /** 把数组里的每个定位器解析为规范对象；返回 { locators, errors }。 */
  function parseLocatorList(list, channel, label) {
    var errors = [];
    var locators = [];
    var arr = Array.isArray(list) ? list : [];
    arr.forEach(function (item, index) {
      var r = parseLocator(item, channel);
      if (!r.ok) r.errors.forEach(function (e) { errors.push(label + ' #' + (index + 1) + '：' + e); });
      else locators.push(r.locator);
    });
    return { locators: locators, errors: errors };
  }

  /* ------------------------------------------------------------ 适配器校验 */

  /**
   * 按执行通道校验适配器：返回 { ok, errors }。
   * web 通道完全走原 core.validateAdapter（urlPattern / captchaSelector 均必填，行为不变）；
   * 非 web 通道不要求 urlPattern，改为要求窗口绑定 target（复用 core.validateTarget）；
   * 所有通道都强制要求「验证码检测定位器」必填，杜绝绕过人机验证的配置。
   */
  function validateAdapterByChannel(adapter) {
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
      return { ok: false, errors: ['适配器必须是对象'] };
    }
    var channel = normalizeChannel(adapter.channel);
    if (channel === 'web') return core.validateAdapter(adapter);

    var errors = [];
    if (typeof adapter.name !== 'string' || adapter.name.trim().length === 0) {
      errors.push('适配器名称不能为空');
    }
    core.validateTarget(adapter.target, errors);

    var fieldCount = Array.isArray(adapter.fields) ? adapter.fields.length : 0;
    var parsed = parseLocatorList(adapter.locators, channel, '定位器');
    parsed.errors.forEach(function (e) { errors.push(e); });
    if (parsed.locators.length === 0 && fieldCount === 0) {
      errors.push('非 Web 通道至少需要配置一个定位器或字段行');
    }

    // 合规硬约束：验证码检测定位器必填，且必须能被解析并受该通道支持。
    if (adapter.captchaLocator === undefined || adapter.captchaLocator === null ||
        adapter.captchaLocator === '') {
      errors.push('必须配置验证码检测定位器 captchaLocator（合规要求，所有通道均不可省略）');
    } else {
      var cap = parseLocator(adapter.captchaLocator, channel);
      if (!cap.ok) cap.errors.forEach(function (e) { errors.push('验证码检测定位器：' + e); });
    }

    if (adapter.submitLocator !== undefined && adapter.submitLocator !== null && adapter.submitLocator !== '') {
      var sub = parseLocator(adapter.submitLocator, channel);
      if (!sub.ok) sub.errors.forEach(function (e) { errors.push('提交控件定位器：' + e); });
    }

    if (adapter.successLocators !== undefined) {
      if (!Array.isArray(adapter.successLocators)) {
        errors.push('successLocators 必须是可见文字关键词数组');
      } else {
        adapter.successLocators.forEach(function (word, i) {
          if (typeof word !== 'string' || word.trim().length === 0) {
            errors.push('成功关键词 #' + (i + 1) + ' 必须是非空文字');
          } else if (/[<>`]/.test(word) || /https?:\/\//i.test(word)) {
            errors.push('成功关键词 #' + (i + 1) + ' 含有非法字符或接口地址');
          }
        });
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  /** 原地补齐旧数据缺失的 channel 字段，返回同一对象（向后兼容）。 */
  function ensureChannel(adapter) {
    if (adapter && typeof adapter === 'object' && !Array.isArray(adapter)) {
      if (!Object.prototype.hasOwnProperty.call(adapter, 'channel') || !CHANNELS[adapter.channel]) {
        adapter.channel = 'web';
      }
    }
    return adapter;
  }

  /** 供 UI 展示的能力矩阵行数组。 */
  function capabilityRows() {
    return Object.keys(CHANNELS).map(function (key) {
      var cap = CHANNEL_CAPABILITIES[key];
      return {
        channel: key,
        label: CHANNELS[key].label,
        experimental: CHANNELS[key].experimental,
        supportedKinds: cap.supportedKinds.join(' / '),
        canPrefill: cap.canPrefill,
        canBackground: cap.canBackground,
        typicalLatencyMs: cap.typicalLatencyMs,
        latencyText: cap.latencyText,
        humanHandoffText: cap.humanHandoffText,
        suitableFor: cap.suitableFor,
        reservationOnly: cap.reservationOnly,
        scriptLabel: cap.scriptLabel,
        runtime: cap.runtime,
        prerequisites: cap.prerequisites.slice()
      };
    });
  }

  var api = {
    CHANNELS: CHANNELS,
    LOCATOR_KINDS: LOCATOR_KINDS,
    CHANNEL_CAPABILITIES: CHANNEL_CAPABILITIES,
    WINDOW_MATCH_MODES: WINDOW_MATCH_MODES,
    normalizeChannel: normalizeChannel,
    channelLabel: channelLabel,
    capabilityOf: capabilityOf,
    kindOptionsFor: kindOptionsFor,
    checkLocatorValue: checkLocatorValue,
    parseLocator: parseLocator,
    parseLocatorList: parseLocatorList,
    validateAdapterByChannel: validateAdapterByChannel,
    ensureChannel: ensureChannel,
    capabilityRows: capabilityRows
  };

  SR.locators = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
