/*
 * js/localrunner.js
 * 本地运行时脚本（Python 3.11+）生成器。纯逻辑、无 DOM 依赖。
 *
 * 生成的 .py 是「单个自包含脚本」，只做：
 *   - 窗口发现（仅元数据）与定位器探测（--dry-run 默认开启，绝不提交）；
 *   - 显式 --live + 策略开关 + 运行时二次交互确认后，才按钳制后的速率执行 UI 操作；
 *   - 检测到验证码 / 人机验证立即暂停一切自动化输入，交由用户本人手动完成；
 *   - 成功判定只依赖窗口可见文字关键词，无法判定时记为「待确认」，绝不默认判成功。
 *
 * 严禁生成：验证码识别、打码平台对接、滑块轨迹模拟、私有接口重放、
 * 客户端进程内存 hook、风控绕过、账号池刷单，以及任何具体平台专用逻辑。
 * 本模块只在浏览器里「生成源码字符串」，绝不尝试控制任何外部程序。
 */
(function (root) {
  'use strict';

  var SR = root.SR || (root.SR = {});
  var isNode = (typeof module !== 'undefined' && !!module.exports);
  var core = isNode ? require('./core.js') : SR.core;
  var engine = isNode ? require('./engine.js') : SR.engine;
  var locators = isNode ? require('./locators.js') : SR.locators;

  /* ------------------------------------------------------------ 基础工具 */

  function sanitizeName(name) {
    var s = String(name === undefined || name === null ? '' : name)
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\*\//g, ' ')
      .replace(/"""/g, ' ')
      .trim();
    if (s.length > 80) s = s.slice(0, 80);
    return s || '未命名任务';
  }

  function repeat(ch, n) {
    var out = '';
    for (var i = 0; i < n; i += 1) out += ch;
    return out;
  }

  /**
   * 把 JS 值序列化为 Python 字面量（True/False/None、双引号字符串、缩进多行）。
   * 字符串统一走 JSON.stringify：其转义序列（\" \\ \n \t \uXXXX）均被 Python 字符串字面量接受，
   * 因此内嵌的 CONFIG 既可读又不会因为用户输入中的引号破坏语法。
   */
  function pyLiteral(value, indent) {
    var pad = repeat(' ', indent);
    var inner = repeat(' ', indent + 4);
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'number') return isFinite(value) ? String(value) : '0';
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      var items = value.map(function (v) { return inner + pyLiteral(v, indent + 4); });
      return '[\n' + items.join(',\n') + '\n' + pad + ']';
    }
    if (typeof value === 'object') {
      var keys = Object.keys(value);
      if (!keys.length) return '{}';
      var pairs = keys.map(function (k) {
        return inner + JSON.stringify(String(k)) + ': ' + pyLiteral(value[k], indent + 4);
      });
      return '{\n' + pairs.join(',\n') + '\n' + pad + '}';
    }
    return 'None';
  }

  /** 解析并规范化单个定位器对象；非法输入返回 null（脚本侧会记录「未命中」而非抛异常）。 */
  function normalizeLocator(raw, channel) {
    if (raw === undefined || raw === null || raw === '') return null;
    var r = locators.parseLocator(raw, channel);
    if (r.ok) return r.locator;
    var loose = locators.parseLocator(raw);
    return loose.ok ? loose.locator : null;
  }

  /* ------------------------------------------------------------ 配置组装 */

  function buildConfig(task, adapter, template, policy, options) {
    var t = task || {};
    var a = adapter || {};
    var tpl = template || {};
    var opt = options || {};

    var p = engine.clampPolicy(policy || {});
    var channel = locators.normalizeChannel(a.channel || t.channel);
    var cap = locators.capabilityOf(channel);
    var includeSecrets = opt.includeSecrets === true;
    var globalEnabled = opt.globalLiveSubmitEnabled !== false;

    var rawVars = core.buildVarMap(tpl);
    var sensitiveKeys = [];
    (Array.isArray(tpl.variables) ? tpl.variables : []).forEach(function (v) {
      if (v && v.sensitive === true && v.key) sensitiveKeys.push(String(v.key));
    });
    var safeVars = {};
    Object.keys(rawVars).forEach(function (key) {
      safeVars[key] = (!includeSecrets && sensitiveKeys.indexOf(key) !== -1)
        ? '__SR_REDACTED__' : String(rawVars[key]);
    });

    var mappingByKey = {};
    (Array.isArray(tpl.mappings) ? tpl.mappings : []).forEach(function (m) {
      if (m && m.fieldKey) mappingByKey[m.fieldKey] = (m.templateExpr === undefined ? '' : String(m.templateExpr));
    });

    var rawLocators = Array.isArray(a.locators) ? a.locators : [];
    // 保留原始索引：被合规校验拒绝的定位器以 null 占位，避免后续有效定位器前移或静默丢失。
    var parsedLocators = rawLocators.map(function (item) {
      return normalizeLocator(item, channel);
    });

    var fields = (Array.isArray(a.fields) ? a.fields : []).map(function (f, i) {
      var field = f || {};
      var key = String(field.key === undefined ? '' : field.key);
      var expr = Object.prototype.hasOwnProperty.call(mappingByKey, key) ? mappingByKey[key] : '';
      var value = core.interpolate(expr, safeVars);
      var loc = parsedLocators[i] || null;
      if (!loc && channel === 'web' && field.selector) {
        loc = { kind: 'css', value: String(field.selector) };
      }
      return {
        key: key,
        mode: String(field.mode === undefined ? 'value' : field.mode),
        value: value,
        locator: loc
      };
    });

    var targetSrc = (a.target && typeof a.target === 'object' && !Array.isArray(a.target)) ? a.target : {};
    var matchMode = locators.WINDOW_MATCH_MODES.indexOf(targetSrc.windowMatchMode) !== -1
      ? targetSrc.windowMatchMode : 'contains';
    var target = {
      processName: String(targetSrc.processName === undefined ? '' : targetSrc.processName),
      windowTitle: String(targetSrc.windowTitle === undefined ? '' : targetSrc.windowTitle),
      windowMatchMode: matchMode,
      exePath: String(targetSrc.exePath === undefined ? '' : targetSrc.exePath),
      bundleId: String(targetSrc.bundleId === undefined ? '' : targetSrc.bundleId),
      deviceSerial: String(targetSrc.deviceSerial === undefined ? '' : targetSrc.deviceSerial),
      packageName: String((targetSrc.packageName === undefined ? targetSrc.bundleId : targetSrc.packageName) || ''),
      appActivity: String(targetSrc.appActivity === undefined ? '' : targetSrc.appActivity),
      launchArgs: Array.isArray(targetSrc.launchArgs) ? targetSrc.launchArgs.map(String) : [],
      bringToFront: targetSrc.bringToFront !== false
    };

    var captchaLocator = normalizeLocator(a.captchaLocator, channel);
    var submitLocator = normalizeLocator(a.submitLocator, channel);
    var successLocators = (Array.isArray(a.successLocators) ? a.successLocators : [])
      .map(String).filter(function (s) { return s.trim().length > 0; });
    if (!successLocators.length && a.successKeyword) successLocators.push(String(a.successKeyword));

    var probeLocators = [];
    fields.forEach(function (f, i) {
      probeLocators.push({ label: '字段 #' + (i + 1) + ' ' + f.key, locator: f.locator || null });
    });
    parsedLocators.forEach(function (loc, i) {
      if (i >= fields.length && loc) probeLocators.push({ label: '补充定位器 #' + (i + 1), locator: loc });
    });
    probeLocators.push({ label: '验证码检测定位器', locator: captchaLocator });
    probeLocators.push({ label: '提交控件定位器', locator: submitLocator });

    return {
      generatedAt: core.nowIso(),
      taskName: sanitizeName(t.name),
      channel: channel,
      channelLabel: locators.channelLabel(channel),
      capabilities: {
        canPrefill: cap.canPrefill,
        canBackground: cap.canBackground,
        canWatchNetwork: cap.canWatchNetwork === true,
        typicalLatencyMs: cap.typicalLatencyMs,
        latencyText: cap.latencyText,
        humanHandoff: cap.humanHandoff,
        suitableFor: cap.suitableFor,
        reservationOnly: cap.reservationOnly
      },
      target: target,
      fields: fields,
      locators: parsedLocators.filter(Boolean),
      captchaLocator: captchaLocator,
      submitLocator: submitLocator,
      successLocators: successLocators,
      failureKeywords: ['已售罄', '名额已满', '请勿重复提交', '提交失败', '预约失败'],
      probeLocators: probeLocators,
      variables: safeVars,
      policy: {
        name: String(p.name || '未命名策略'),
        openAt: String(p.openAt || ''),
        intervalMs: p.intervalMs,
        jitterPct: p.jitterPct,
        maxAttempts: p.maxAttempts,
        warmupSec: p.warmupSec,
        timeoutMs: p.timeoutMs,
        requireConfirm: p.requireConfirm,
        liveSubmit: (p.liveSubmit === true) && globalEnabled,
        stopOnCaptcha: true
      }
    };
  }

  /* ------------------------------------------------------------ 源码模板 */

  /**
   * 返回完整的 Python 3.11+ 脚本源码。
   * Python 主体以字符串数组逐行构造；CONFIG 由 pyLiteral 在运行时注入，
   * 因此用户配置里的任意引号 / 换行都不会破坏生成结果的语法。
   */
  /**
   * Android 通道：生成基于 uiautomator2 的完整本地运行时脚本。
   * 与桌面版共用 CONFIG 结构与合规约束，但设备绑定、控件树、点击走独立的 backend，
   * 桌面版代码路径保持原样，互不干扰。
   */
  function buildMobilePythonSource(config) {
    var L = [];
    L.push('#!/usr/bin/env python3');
    L.push('# -*- coding: utf-8 -*-');
    L.push('"""');
    L.push('SlotRunner 本地运行时脚本 · Android / uiautomator2 通道（由配置中心导出，请在本机自行运行）。');
    L.push('');
    L.push('合规声明（请勿删除）：');
    L.push('1. 仅限在您本人的设备与账号上使用；须自行确认目标平台服务条款允许此类自动化。');
    L.push('2. 不破解验证码、不对接打码平台、不模拟滑块轨迹；检测到人机验证立即暂停一切自动化输入，');
    L.push('   由您本人在设备上手动完成，脚本只等待并按回车继续。');
    L.push('3. 不反编译小程序包、不逆向或重放私有接口与签名参数、不 hook 客户端进程内存。');
    L.push('4. 不绕过风控 / 设备指纹 / 登录鉴权，不实现账号池或刷单逻辑。');
    L.push('5. 不内置任何具体平台或软件的专用逻辑；所有设备绑定与定位器均来自配置中心的通用占位配置。');
    L.push('6. 实名制票务代抢可能违反平台规则与法律法规，风险与责任由您自行承担。');
    L.push('7. UI 自动化单次操作典型延迟 300-2000ms，不适用于秒杀类任务。');
    L.push('8. 默认 --dry-run：只做设备发现与控件探测，绝不提交。真实提交须显式 --live 并在运行时再次交互确认。');
    L.push('9. 脚本不会自动启动任何应用，请由您本人先打开到目标页面。');
    L.push('');
    L.push('用法：');
    L.push('  python slotrunner_local_runner.py              # 默认 dry-run');
    L.push('  python slotrunner_local_runner.py --discover   # 只枚举设备元数据后退出');
    L.push('  python slotrunner_local_runner.py --live       # 允许真实提交（仍需运行时交互确认）');
    L.push('"""');
    L.push('from __future__ import annotations');
    L.push('');
    L.push('import argparse');
    L.push('import json');
    L.push('import os');
    L.push('import random');
    L.push('import re');
    L.push('import sys');
    L.push('import threading');
    L.push('import time');
    L.push('from datetime import datetime, timezone');
    L.push('from typing import Any');
    L.push('');
    L.push('# ===================== 内嵌配置（由 SlotRunner 配置中心生成） =====================');
    L.push('CONFIG = ' + pyLiteral(config, 0));
    L.push('');
    L.push('# ===================== 合规硬钳制（即使配置被手工篡改也生效） =====================');
    L.push('MIN_INTERVAL_MS = 1000');
    L.push('MAX_ATTEMPTS = 50');
    L.push('MAX_JITTER_PCT = 50');
    L.push('HANDOFF_TIMEOUT_SEC = 180');
    L.push('REDACTED = "__SR_REDACTED__"');
    L.push('CAPTCHA_HINTS = ("验证码", "人机验证", "安全验证", "请完成验证", "滑动验证")');
    L.push('');
    L.push('RUN_TS = datetime.now().strftime("%Y%m%d_%H%M%S")');
    L.push('LOG_PATH = os.path.join(os.getcwd(), "slotrunner_run_" + RUN_TS + ".jsonl")');
    L.push('');
    L.push('_DEV = None');
    L.push('_VISION = {"cv2": None, "pytesseract": None, "PIL": None}');
    L.push('');
    L.push('');
    L.push('def now_iso() -> str:');
    L.push('    """返回 UTC ISO-8601 时间戳。"""');
    L.push('    return datetime.now(timezone.utc).isoformat()');
    L.push('');
    L.push('');
    L.push('def log(level: str, stage: str, message: str, **extra: Any) -> None:');
    L.push('    """两路日志：控制台 + 本地 jsonl 文件；绝不上传任何数据。"""');
    L.push('    entry = {"ts": now_iso(), "level": level, "stage": stage,');
    L.push('             "channel": CONFIG.get("channel", "web"), "message": message}');
    L.push('    for key, value in extra.items():');
    L.push('        entry[key] = value');
    L.push('    line = json.dumps(entry, ensure_ascii=False)');
    L.push('    print("[SlotRunner] " + level.upper() + " " + stage + " " + message)');
    L.push('    try:');
    L.push('        with open(LOG_PATH, "a", encoding="utf-8") as fh:');
    L.push('            fh.write(line)');
    L.push('            fh.write(chr(10))');
    L.push('    except OSError as exc:');
    L.push('        print("[SlotRunner] WARN 日志写入失败：" + str(exc))');
    L.push('');
    L.push('');
    L.push('def require_backend() -> None:');
    L.push('    """连接 Android 设备；依赖缺失或设备不可用时打印提示并安全退出（退出码 3）。"""');
    L.push('    global _DEV');
    L.push('    try:');
    L.push('        import uiautomator2 as u2');
    L.push('    except ImportError:');
    L.push('        print("[SlotRunner] 缺少依赖 uiautomator2，脚本已安全退出（未执行任何自动化输入）。")');
    L.push('        print("[SlotRunner] 请执行：pip install uiautomator2，并确保 Android SDK platform-tools 已安装、adb devices 可见已授权设备")');
    L.push('        sys.exit(3)');
    L.push('    serial = str((CONFIG.get("target") or {}).get("deviceSerial") or "")');
    L.push('    try:');
    L.push('        _DEV = u2.connect(serial) if serial else u2.connect()');
    L.push('        _DEV.info');
    L.push('        log("INFO", "device", "已连接设备（仅记录元数据，不读取界面内容）")');
    L.push('    except Exception as exc:');
    L.push('        print("[SlotRunner] 无法连接 Android 设备，请确认 USB 调试已授权且 adb devices 可见。")');
    L.push('        print("[SlotRunner] " + str(exc))');
    L.push('        sys.exit(3)');
    L.push('');
    L.push('');
    L.push('def load_optional_vision() -> None:');
    L.push('    """模板匹配与界面文字读取为可选兜底；任一 import 失败即降级，绝不强制依赖。"""');
    L.push('    try:');
    L.push('        import cv2');
    L.push('        _VISION["cv2"] = cv2');
    L.push('    except ImportError:');
    L.push('        _VISION["cv2"] = None');
    L.push('    try:');
    L.push('        import pytesseract');
    L.push('        _VISION["pytesseract"] = pytesseract');
    L.push('    except ImportError:');
    L.push('        _VISION["pytesseract"] = None');
    L.push('    try:');
    L.push('        from PIL import Image');
    L.push('        _VISION["PIL"] = Image');
    L.push('    except ImportError:');
    L.push('        _VISION["PIL"] = None');
    L.push('    log("INFO", "deps", "可选视觉兜底加载完成（缺失项自动降级，不强制依赖）")');
    L.push('');
    L.push('');
    L.push('def discover_devices() -> list:');
    L.push('    """只返回设备元数据；不读取界面内容、不截图、不上传。"""');
    L.push('    items = []');
    L.push('    try:');
    L.push('        info = dict(_DEV.info or {})');
    L.push('        size = _DEV.window_size()');
    L.push('        package = ""');
    L.push('        try:');
    L.push('            package = str((_DEV.app_current() or {}).get("package") or "")');
    L.push('        except Exception:');
    L.push('            package = ""');
    L.push('        items.append({"serial": str(info.get("serial") or ""),');
    L.push('                      "model": str(info.get("productName") or info.get("model") or ""),');
    L.push('                      "sdk": str(info.get("sdkInt") or ""),');
    L.push('                      "width": int(size[0]), "height": int(size[1]),');
    L.push('                      "package": package})');
    L.push('    except Exception as exc:');
    L.push('        log("ERROR", "discover", "设备元数据读取失败：" + str(exc))');
    L.push('    return items');
    L.push('');
    L.push('');
    L.push('def bind_device():');
    L.push('    """返回已连接设备；脚本不自动启动任何应用，请由用户自行打开到目标页面。"""');
    L.push('    pkg = str((CONFIG.get("target") or {}).get("packageName") or "")');
    L.push('    if pkg:');
    L.push('        log("INFO", "bind", "已记录目标包名（脚本不会自动启动应用）", package=pkg)');
    L.push('    return _DEV');
    L.push('');
    L.push('');
    L.push('def bring_to_front(dev) -> None:');
    L.push('    """移动端不发送任何输入；仅提示用户保持目标页面可见。"""');
    L.push('    if (CONFIG.get("target") or {}).get("bringToFront") is False:');
    L.push('        return');
    L.push('    log("INFO", "device", "请保持目标页面在设备上可见（脚本未发送任何点击或按键）")');
    L.push('');
    L.push('');
    L.push('def visible_text(dev) -> str:');
    L.push('    """读取界面层级中的可见文字，仅用于控件定位与结果判定，绝不识别验证码内容。"""');
    L.push('    try:');
    L.push('        xml = str(dev.dump_hierarchy() or "")');
    L.push('        parts = re.findall(\'text="([^"]*)"\', xml)');
    L.push('        parts += re.findall(\'content-desc="([^"]*)"\', xml)');
    L.push('        return chr(10).join([p for p in parts if p])');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "text", "界面文字读取失败：" + str(exc))');
    L.push('        return ""');
    L.push('');
    L.push('');
    L.push('def find_selector(dev, locator):');
    L.push('    """按 kind 构造 uiautomator2 选择器；不支持的 kind 返回 None。"""');
    L.push('    if not locator:');
    L.push('        return None');
    L.push('    kind = str(locator.get("kind") or "")');
    L.push('    value = str(locator.get("value") or "")');
    L.push('    if not value:');
    L.push('        return None');
    L.push('    try:');
    L.push('        if kind == "uia_automation_id":');
    L.push('            return dev(resourceId=value)');
    L.push('        if kind == "uia_name":');
    L.push('            return dev(description=value)');
    L.push('        if kind == "text" or kind == "ocr_text":');
    L.push('            return dev(text=value)');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "locate", "选择器构造失败：" + str(exc))');
    L.push('    return None');
    L.push('');
    L.push('');
    L.push('def control_exists(dev, locator) -> bool:');
    L.push('    """定位器存在性检查；不存在或异常时安全返回 False。"""');
    L.push('    sel = find_selector(dev, locator)');
    L.push('    if sel is None:');
    L.push('        return False');
    L.push('    try:');
    L.push('        return bool(sel.exists)');
    L.push('    except Exception:');
    L.push('        return False');
    L.push('');
    L.push('');
    L.push('def locate(dev, locator) -> bool:');
    L.push('    """按 kind 执行单个定位器；可选依赖缺失或不支持时安全返回 False。"""');
    L.push('    if not locator:');
    L.push('        return False');
    L.push('    kind = str(locator.get("kind") or "")');
    L.push('    value = str(locator.get("value") or "")');
    L.push('    try:');
    L.push('        if kind in ("uia_automation_id", "uia_name", "text", "ocr_text"):');
    L.push('            if kind == "ocr_text" and _VISION["pytesseract"] is None:');
    L.push('                log("WARN", "locate", "ocr_text 可选依赖缺失，已降级为界面文字匹配")');
    L.push('            if control_exists(dev, locator):');
    L.push('                return True');
    L.push('            return bool(value) and value in visible_text(dev)');
    L.push('        if kind == "image_template":');
    L.push('            if _VISION["cv2"] is None:');
    L.push('                log("WARN", "locate", "image_template 可选依赖缺失，已跳过该兜底定位器")');
    L.push('                return False');
    L.push('            path = str(locator.get("templatePath") or value)');
    L.push('            if not os.path.isfile(path):');
    L.push('                log("WARN", "locate", "模板文件不存在，已跳过：" + path)');
    L.push('                return False');
    L.push('            return True');
    L.push('        if kind == "coordinate_anchor":');
    L.push('            nx = float(locator.get("nx", 0.0))');
    L.push('            ny = float(locator.get("ny", 0.0))');
    L.push('            if not (0.0 <= nx <= 1.0 and 0.0 <= ny <= 1.0):');
    L.push('                log("ERROR", "locate", "coordinate_anchor 越界：必须使用 0..1 归一化坐标，禁止绝对屏幕坐标")');
    L.push('                return False');
    L.push('            w, h = dev.window_size()');
    L.push('            return int(w) > 0 and int(h) > 0');
    L.push('        log("WARN", "locate", "当前通道不支持的定位方式，已跳过：" + kind)');
    L.push('        return False');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "locate", "定位器执行异常：" + kind + " " + str(exc))');
    L.push('        return False');
    L.push('');
    L.push('');
    L.push('def captcha_detected(dev) -> bool:');
    L.push('    """检测人机验证挑战：只看验证码容器定位器与界面可见提示文字，绝不识别验证码内容。"""');
    L.push('    locator = CONFIG.get("captchaLocator")');
    L.push('    if locator and locate(dev, locator):');
    L.push('        return True');
    L.push('    text = visible_text(dev)');
    L.push('    for hint in CAPTCHA_HINTS:');
    L.push('        if hint in text:');
    L.push('            return True');
    L.push('    return False');
    L.push('');
    L.push('');
    L.push('def wait_human_continue(timeout_sec: int) -> bool:');
    L.push('    """在独立线程等待用户回车，主线程按超时自动放行中止；接管期间无任何自动化输入。"""');
    L.push('    box = {"done": False}');
    L.push('');
    L.push('    def reader() -> None:');
    L.push('        try:');
    L.push('            input()');
    L.push('            box["done"] = True');
    L.push('        except (EOFError, KeyboardInterrupt):');
    L.push('            box["done"] = False');
    L.push('');
    L.push('    worker = threading.Thread(target=reader, daemon=True)');
    L.push('    worker.start()');
    L.push('    worker.join(timeout_sec)');
    L.push('    return (not worker.is_alive()) and box["done"] is True');
    L.push('');
    L.push('');
    L.push('def handoff(dev) -> bool:');
    L.push('    """暂停一切自动化输入 -> 提示用户在真机手动完成验证 -> 超时自动中止。"""');
    L.push('    log("WARN", "handoff", "检测到验证码 / 人机验证：已暂停一切自动化输入，接管期间不发送任何点击或按键")');
    L.push('    bring_to_front(dev)');
    L.push('    print("")');
    L.push('    print("========== 需要人工接管 ==========")');
    L.push('    print("请在您的 Android 设备 / 投屏窗口中，由您本人手动完成验证。")');
    L.push('    print("接管期间脚本不会进行任何自动化输入，避免与您的操作冲突。")');
    L.push('    print("完成后回到本控制台按回车继续；超过 " + str(HANDOFF_TIMEOUT_SEC) + " 秒未完成将自动中止。")');
    L.push('    ok = wait_human_continue(HANDOFF_TIMEOUT_SEC)');
    L.push('    if not ok:');
    L.push('        log("ERROR", "handoff", "人工接管超时或输入取消，任务自动中止")');
    L.push('        return False');
    L.push('    log("INFO", "handoff", "用户已完成人工接管，恢复流程")');
    L.push('    return True');
    L.push('');
    L.push('');
    L.push('def interactive_confirm(prompt: str) -> bool:');
    L.push('    """交互式确认；任何非 yes 输入或无输入一律视为取消。"""');
    L.push('    try:');
    L.push('        answer = input(prompt + " 输入 yes 继续，其他任意输入取消：")');
    L.push('    except (EOFError, KeyboardInterrupt):');
    L.push('        return False');
    L.push('    return answer.strip().lower() in ("yes", "y")');
    L.push('');
    L.push('');
    L.push('def fill_fields(dev) -> None:');
    L.push('    """按配置填写字段；敏感脱敏值与不可写通道一律跳过，日志不记录字段值。"""');
    L.push('    caps = CONFIG.get("capabilities") or {}');
    L.push('    for field in CONFIG.get("fields") or []:');
    L.push('        key = str(field.get("key") or "")');
    L.push('        value = str(field.get("value") or "")');
    L.push('        locator = field.get("locator")');
    L.push('        if REDACTED in value:');
    L.push('            log("WARN", "fill", "敏感字段未包含明文，已跳过：" + key)');
    L.push('            continue');
    L.push('        if not locator or not locate(dev, locator):');
    L.push('            log("WARN", "fill", "字段控件未命中或缺少定位器，已跳过：" + key)');
    L.push('            continue');
    L.push('        if caps.get("canPrefill") is not True:');
    L.push('            log("WARN", "fill", "当前通道不支持预填，字段仅定位不写入：" + key)');
    L.push('            continue');
    L.push('        try:');
    L.push('            sel = find_selector(dev, locator)');
    L.push('            if sel is None:');
    L.push('                log("WARN", "fill", "字段控件选择器不可用，已跳过：" + key)');
    L.push('                continue');
    L.push('            sel.click()');
    L.push('            dev.send_keys(value)');
    L.push('            log("INFO", "fill", "字段已填写（日志不记录字段值）：" + key)');
    L.push('        except Exception as exc:');
    L.push('            log("WARN", "fill", "字段写入异常：" + key + " " + str(exc))');
    L.push('');
    L.push('');
    L.push('def submit(dev) -> bool:');
    L.push('    """仅在 --live 且用户确认后调用；未命中提交控件一律不点击。"""');
    L.push('    locator = CONFIG.get("submitLocator")');
    L.push('    if not locator:');
    L.push('        log("WARN", "submit", "未配置提交控件定位器，本次不提交")');
    L.push('        return False');
    L.push('    if not locate(dev, locator):');
    L.push('        log("WARN", "submit", "提交控件未命中，本次不提交")');
    L.push('        return False');
    L.push('    try:');
    L.push('        kind = str(locator.get("kind") or "")');
    L.push('        if kind in ("uia_automation_id", "uia_name", "text", "ocr_text"):');
    L.push('            sel = find_selector(dev, locator)');
    L.push('            if sel is None:');
    L.push('                log("WARN", "submit", "提交控件未命中，本次不提交")');
    L.push('                return False');
    L.push('            sel.click()');
    L.push('        elif kind == "coordinate_anchor":');
    L.push('            nx = float(locator.get("nx", 0.0))');
    L.push('            ny = float(locator.get("ny", 0.0))');
    L.push('            if not (0.0 <= nx <= 1.0 and 0.0 <= ny <= 1.0):');
    L.push('                log("ERROR", "submit", "归一化坐标越界，拒绝提交")');
    L.push('                return False');
    L.push('            w, h = dev.window_size()');
    L.push('            dev.click(int(nx * w), int(ny * h))');
    L.push('        else:');
    L.push('            log("WARN", "submit", "该定位方式不支持提交点击，已跳过：" + kind)');
    L.push('            return False');
    L.push('        log("INFO", "submit", "已按您的确认执行提交点击")');
    L.push('        return True');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "submit", "提交点击异常：" + str(exc))');
    L.push('        return False');
    L.push('');
    L.push('');
    L.push('def judge(dev) -> str:');
    L.push('    """成功判定只依赖界面可见文字关键词；无法判定时返回 pending，绝不默认判成功。"""');
    L.push('    text = visible_text(dev)');
    L.push('    for word in CONFIG.get("successLocators") or []:');
    L.push('        if str(word) and str(word) in text:');
    L.push('            return "success"');
    L.push('    for word in CONFIG.get("failureKeywords") or []:');
    L.push('        if str(word) and str(word) in text:');
    L.push('            return "failed"');
    L.push('    return "pending"');
    L.push('');
    L.push('');
    L.push('def run_dry(dev) -> int:');
    L.push('    """默认模式：只做设备发现与控件探测，不填写、不提交、不修改任何数据。"""');
    L.push('    log("INFO", "dry-run", "dry-run 默认开启：只做设备发现与定位器探测，不填写、不提交")');
    L.push('    for item in CONFIG.get("probeLocators") or []:');
    L.push('        label = str(item.get("label") or "")');
    L.push('        locator = item.get("locator")');
    L.push('        started = time.monotonic()');
    L.push('        hit = locate(dev, locator) if locator else False');
    L.push('        elapsed = int((time.monotonic() - started) * 1000)');
    L.push('        log("INFO", "probe", "定位器探测：" + label, hit=hit, elapsedMs=elapsed,');
    L.push('            kind=str((locator or {}).get("kind") or "none"))');
    L.push('    log("INFO", "dry-run", "探测完成，未执行任何提交；如需真实运行请显式加 --live 并在运行时再次确认")');
    L.push('    return 0');
    L.push('');
    L.push('');
    L.push('def run_live(dev) -> int:');
    L.push('    """真实运行：策略开关 + 运行时二次确认 + 每次提交前确认，三重门槛。"""');
    L.push('    policy = CONFIG.get("policy") or {}');
    L.push('    if policy.get("liveSubmit") is not True:');
    L.push('        print("[SlotRunner] 当前策略未开启真实提交开关，请在配置中心开启后重新导出脚本。")');
    L.push('        log("WARN", "gate", "策略未开启真实提交，拒绝 --live")');
    L.push('        return 2');
    L.push('    if not interactive_confirm("运行时二次确认：请确认您本人有权操作该设备与账号、已登录、并已核对配置。"):');
    L.push('        log("WARN", "gate", "用户未通过运行时二次确认，安全退出（未执行任何提交）")');
    L.push('        return 0');
    L.push('    interval_ms = max(MIN_INTERVAL_MS, int(policy.get("intervalMs") or 3000))');
    L.push('    max_attempts = min(MAX_ATTEMPTS, max(1, int(policy.get("maxAttempts") or 20)))');
    L.push('    jitter_pct = max(0, min(MAX_JITTER_PCT, int(policy.get("jitterPct") or 0)))');
    L.push('    warmup_sec = max(0, int(policy.get("warmupSec") or 0))');
    L.push('    timeout_ms = max(1000, int(policy.get("timeoutMs") or 10000))');
    L.push('    require_confirm = policy.get("requireConfirm") is True');
    L.push('    open_at = str(policy.get("openAt") or "")');
    L.push('');
    L.push('    if warmup_sec > 0:');
    L.push('        log("INFO", "warmup", "预热：提前 " + str(warmup_sec) + " 秒提示保持目标页面可见")');
    L.push('        bring_to_front(dev)');
    L.push('');
    L.push('    target_ts = None');
    L.push('    if open_at:');
    L.push('        try:');
    L.push('            target_ts = datetime.fromisoformat(open_at.replace("Z", "+00:00")).timestamp()');
    L.push('        except ValueError:');
    L.push('            target_ts = None');
    L.push('    if target_ts is not None:');
    L.push('        mono_anchor = time.monotonic()');
    L.push('        wall_anchor = time.time()');
    L.push('        while True:');
    L.push('            now_wall = wall_anchor + (time.monotonic() - mono_anchor)');
    L.push('            remain = target_ts - now_wall');
    L.push('            if remain <= 0:');
    L.push('                break');
    L.push('            time.sleep(min(remain, 0.2))');
    L.push('        log("INFO", "schedule", "已到达开放时间（计时基于 time.monotonic）")');
    L.push('    elif warmup_sec > 0:');
    L.push('        time.sleep(warmup_sec)');
    L.push('');
    L.push('    started = time.monotonic()');
    L.push('    for index in range(1, max_attempts + 1):');
    L.push('        log("INFO", "attempt", "第 " + str(index) + " / " + str(max_attempts) + " 次尝试")');
    L.push('        if captcha_detected(dev):');
    L.push('            if not handoff(dev):');
    L.push('                return 2');
    L.push('        bring_to_front(dev)');
    L.push('        fill_fields(dev)');
    L.push('        if captcha_detected(dev):');
    L.push('            log("WARN", "captcha", "提交前再次检测到验证挑战，已暂停提交")');
    L.push('            if not handoff(dev):');
    L.push('                return 2');
    L.push('        if require_confirm and not interactive_confirm("提交前人工确认：第 " + str(index) + " 次提交。"):');
    L.push('            log("WARN", "gate", "用户未确认提交，任务中止")');
    L.push('            return 0');
    L.push('        submitted = submit(dev)');
    L.push('        verdict = judge(dev)');
    L.push('        if verdict == "success" and submitted:');
    L.push('            log("INFO", "result", "命中成功关键词，任务结束")');
    L.push('            return 0');
    L.push('        if verdict == "failed":');
    L.push('            log("WARN", "result", "命中失败特征，任务结束")');
    L.push('            return 1');
    L.push('        log("WARN", "result", "结果待确认：界面可见文字未命中成功 / 失败关键词，绝不默认判成功")');
    L.push('        elapsed_ms = int((time.monotonic() - started) * 1000)');
    L.push('        if elapsed_ms > timeout_ms * max_attempts:');
    L.push('            log("WARN", "result", "已超过累计超时预算，任务结束")');
    L.push('            return 1');
    L.push('        delay = interval_ms + int(interval_ms * jitter_pct * random.random() / 100.0)');
    L.push('        log("INFO", "cooldown", "速率限制：等待 " + str(delay) + "ms（间隔不低于 1000ms）")');
    L.push('        time.sleep(delay / 1000.0)');
    L.push('    log("WARN", "result", "已达到最大尝试次数 " + str(max_attempts) + " 次，任务结束")');
    L.push('    return 1');
    L.push('');
    L.push('');
    L.push('def parse_args() -> argparse.Namespace:');
    L.push('    parser = argparse.ArgumentParser(description="SlotRunner 本地运行时 · Android 通道（默认 dry-run）")');
    L.push('    parser.add_argument("--live", action="store_true", help="允许真实提交；仍需运行时再次交互确认")');
    L.push('    parser.add_argument("--discover", action="store_true", help="只枚举设备元数据后退出")');
    L.push('    parser.add_argument("--timeout", type=int, default=HANDOFF_TIMEOUT_SEC,');
    L.push('                        help="人工接管超时秒数，默认 180")');
    L.push('    parser.add_argument("--dry-run", action="store_true",');
    L.push('                        help="显式 dry-run（默认行为，优先级高于 --live）")');
    L.push('    return parser.parse_args()');
    L.push('');
    L.push('');
    L.push('def main() -> int:');
    L.push('    global HANDOFF_TIMEOUT_SEC');
    L.push('    args = parse_args()');
    L.push('    HANDOFF_TIMEOUT_SEC = max(1, int(args.timeout))');
    L.push('    log("INFO", "boot", "SlotRunner 本地运行时启动（纯本地执行，不发起任何后台请求）",');
    L.push('        channel=CONFIG.get("channel", "web"), generatedAt=CONFIG.get("generatedAt", ""))');
    L.push('    log("INFO", "boot", "日志文件：" + LOG_PATH)');
    L.push('    require_backend()');
    L.push('    load_optional_vision()');
    L.push('    if args.discover:');
    L.push('        for dev in discover_devices():');
    L.push('            print("[SlotRunner] 设备元数据 serial=" + dev["serial"] + " model=" + dev["model"] +');
    L.push('                  " sdk=" + dev["sdk"] + " size=" + str(dev["width"]) + "x" + str(dev["height"]) +');
    L.push('                  " package=" + dev["package"])');
    L.push('        log("INFO", "discover", "仅枚举设备元数据完成，未读取界面内容或截图")');
    L.push('        return 0');
    L.push('    device = bind_device()');
    L.push('    if device is None:');
    L.push('        return 2');
    L.push('    bring_to_front(device)');
    L.push('    if args.dry_run or not args.live:');
    L.push('        return run_dry(device)');
    L.push('    return run_live(device)');
    L.push('');
    L.push('');
    L.push('if __name__ == "__main__":');
    L.push('    try:');
    L.push('        sys.exit(main())');
    L.push('    except KeyboardInterrupt:');
    L.push('        print("")');
    L.push('        print("[SlotRunner] 用户中断，已停止（未执行任何提交）")');
    L.push('        sys.exit(130)');
    L.push('');
    return L.join('\n');
  }

  function buildPythonSource(config) {
    var L = [];
    if (config.channel === 'mobile') return buildMobilePythonSource(config);
    L.push('#!/usr/bin/env python3');
    L.push('# -*- coding: utf-8 -*-');
    L.push('"""');
    L.push('SlotRunner 本地运行时脚本（由配置中心导出，请在本机自行运行）。');
    L.push('');
    L.push('合规声明（请勿删除）：');
    L.push('1. 仅限在您本人有权操作的软件与账号上使用；须自行确认目标平台服务条款允许此类自动化。');
    L.push('2. 不破解验证码、不对接打码平台、不模拟滑块轨迹；检测到人机验证立即暂停一切自动化输入，');
    L.push('   由您本人手动完成，脚本只等待并按回车继续。');
    L.push('3. 不反编译小程序包、不逆向或重放私有接口与签名参数、不 hook 客户端进程内存。');
    L.push('4. 不绕过风控 / 设备指纹 / 登录鉴权，不实现账号池或刷单逻辑。');
    L.push('5. 不内置任何具体平台或软件的专用逻辑；所有窗口绑定与定位器均来自配置中心的通用占位配置。');
    L.push('6. 实名制票务代抢可能违反平台规则与法律法规，风险与责任由您自行承担。');
    L.push('7. UI 自动化单次操作典型延迟 300-2000ms，不适用于秒杀类任务；小程序无法注入 DOM。');
    L.push('8. 默认 --dry-run：只做窗口发现与定位器探测，绝不提交。真实提交须显式 --live 并在运行时再次交互确认。');
    L.push('');
    L.push('用法：');
    L.push('  python slotrunner_local_runner.py              # 默认 dry-run');
    L.push('  python slotrunner_local_runner.py --discover   # 只枚举窗口元数据后退出');
    L.push('  python slotrunner_local_runner.py --live       # 允许真实提交（仍需运行时交互确认）');
    L.push('"""');
    L.push('from __future__ import annotations');
    L.push('');
    L.push('import argparse');
    L.push('import json');
    L.push('import os');
    L.push('import random');
    L.push('import re');
    L.push('import sys');
    L.push('import threading');
    L.push('import time');
    L.push('from datetime import datetime, timezone');
    L.push('from typing import Any');
    L.push('');
    L.push('# ===================== 内嵌配置（由 SlotRunner 配置中心生成） =====================');
    L.push('CONFIG = ' + pyLiteral(config, 0));
    L.push('');
    L.push('# ===================== 合规硬钳制（即使配置被手工篡改也生效） =====================');
    L.push('MIN_INTERVAL_MS = 1000');
    L.push('MAX_ATTEMPTS = 50');
    L.push('MAX_JITTER_PCT = 50');
    L.push('HANDOFF_TIMEOUT_SEC = 180');
    L.push('REDACTED = "__SR_REDACTED__"');
    L.push('CAPTCHA_HINTS = ("验证码", "人机验证", "安全验证", "请完成验证", "滑动验证")');
    L.push('');
    L.push('RUN_TS = datetime.now().strftime("%Y%m%d_%H%M%S")');
    L.push('LOG_PATH = os.path.join(os.getcwd(), "slotrunner_run_" + RUN_TS + ".jsonl")');
    L.push('');
    L.push('_BACKEND = None');
    L.push('_UIA = None');
    L.push('_VISION = {"cv2": None, "pytesseract": None, "PIL": None}');
    L.push('');
    L.push('');
    L.push('def now_iso() -> str:');
    L.push('    """返回 UTC ISO-8601 时间戳。"""');
    L.push('    return datetime.now(timezone.utc).isoformat()');
    L.push('');
    L.push('');
    L.push('def log(level: str, stage: str, message: str, **extra: Any) -> None:');
    L.push('    """三路日志中的两路：控制台 + 本地 jsonl 文件；绝不上传任何数据。"""');
    L.push('    entry = {"ts": now_iso(), "level": level, "stage": stage,');
    L.push('             "channel": CONFIG.get("channel", "web"), "message": message}');
    L.push('    for key, value in extra.items():');
    L.push('        entry[key] = value');
    L.push('    line = json.dumps(entry, ensure_ascii=False)');
    L.push('    print("[SlotRunner] " + level.upper() + " " + stage + " " + message)');
    L.push('    try:');
    L.push('        with open(LOG_PATH, "a", encoding="utf-8") as fh:');
    L.push('            fh.write(line)');
    L.push('            fh.write(chr(10))');
    L.push('    except OSError as exc:');
    L.push('        print("[SlotRunner] WARN 日志写入失败：" + str(exc))');
    L.push('');
    L.push('');
    L.push('def require_backend() -> None:');
    L.push('    """加载 Windows 窗口自动化依赖；缺失时打印安装提示并安全退出（退出码 3）。"""');
    L.push('    global _BACKEND, _UIA');
    L.push('    if sys.platform != "win32":');
    L.push('        print("[SlotRunner] 当前平台不是 Windows，桌面 / 小程序通道的窗口级 UI 自动化不可用。")');
    L.push('        print("[SlotRunner] 请在 Windows 10/11 上运行，并安装：pip install pywinauto uiautomation")');
    L.push('        sys.exit(3)');
    L.push('    try:');
    L.push('        from pywinauto import Desktop');
    L.push('        _BACKEND = Desktop');
    L.push('    except ImportError:');
    L.push('        print("[SlotRunner] 缺少依赖 pywinauto / uiautomation，脚本已安全退出（未执行任何自动化输入）。")');
    L.push('        print("[SlotRunner] 请执行：pip install pywinauto uiautomation")');
    L.push('        print("[SlotRunner] 可选兜底：pip install Pillow opencv-python pytesseract，另需系统 Tesseract 与 chi_sim 语言包")');
    L.push('        sys.exit(3)');
    L.push('    try:');
    L.push('        import uiautomation as uia_mod');
    L.push('        _UIA = uia_mod');
    L.push('    except ImportError:');
    L.push('        _UIA = None');
    L.push('        log("WARN", "deps", "可选依赖 uiautomation 未安装，控件树定位沿用 pywinauto backend=uia")');
    L.push('');
    L.push('');
    L.push('def load_optional_vision() -> None:');
    L.push('    """模板匹配与界面文字读取为可选兜底；任一 import 失败即降级，绝不强制依赖。"""');
    L.push('    try:');
    L.push('        import cv2');
    L.push('        _VISION["cv2"] = cv2');
    L.push('    except ImportError:');
    L.push('        _VISION["cv2"] = None');
    L.push('    try:');
    L.push('        import pytesseract');
    L.push('        _VISION["pytesseract"] = pytesseract');
    L.push('    except ImportError:');
    L.push('        _VISION["pytesseract"] = None');
    L.push('    try:');
    L.push('        from PIL import Image');
    L.push('        _VISION["PIL"] = Image');
    L.push('    except ImportError:');
    L.push('        _VISION["PIL"] = None');
    L.push('    log("INFO", "deps", "可选视觉兜底加载完成（缺失项自动降级，不强制依赖）",');
    L.push('        cv2=_VISION["cv2"] is not None, pytesseract=_VISION["pytesseract"] is not None)');
    L.push('');
    L.push('');
    L.push('def title_matches(actual: str, expected: str, mode: str) -> bool:');
    L.push('    """按 contains / exact / regex 匹配窗口标题。"""');
    L.push('    if not expected:');
    L.push('        return True');
    L.push('    if mode == "exact":');
    L.push('        return actual == expected');
    L.push('    if mode == "regex":');
    L.push('        try:');
    L.push('            return re.search(expected, actual) is not None');
    L.push('        except re.error:');
    L.push('            return False');
    L.push('    return expected in actual');
    L.push('');
    L.push('');
    L.push('def discover_windows() -> list:');
    L.push('    """枚举当前可访问窗口，只保留元数据（标题 / 句柄 / 类名 / 进程 ID），不读取窗口内容或截图。"""');
    L.push('    items = []');
    L.push('    if _BACKEND is None:');
    L.push('        return items');
    L.push('    try:');
    L.push('        for win in _BACKEND(backend="uia").windows():');
    L.push('            try:');
    L.push('                items.append({"title": str(win.window_text()),');
    L.push('                              "handle": int(win.handle),');
    L.push('                              "class_name": str(win.class_name()),');
    L.push('                              "process_id": int(win.process_id()),');
    L.push('                              "ref": win})');
    L.push('            except Exception:');
    L.push('                continue');
    L.push('    except Exception as exc:');
    L.push('        log("ERROR", "discover", "窗口枚举失败：" + str(exc))');
    L.push('    return items');
    L.push('');
    L.push('');
    L.push('def bind_window():');
    L.push('    """按配置的窗口标题匹配并绑定目标窗口；找不到则返回 None。"""');
    L.push('    target = CONFIG.get("target") or {}');
    L.push('    expected = str(target.get("windowTitle") or "")');
    L.push('    mode = str(target.get("windowMatchMode") or "contains")');
    L.push('    wins = discover_windows()');
    L.push('    log("INFO", "discover", "当前可访问窗口数量：" + str(len(wins)),');
    L.push('        windows=[{"title": w["title"], "handle": w["handle"],');
    L.push('                  "class_name": w["class_name"], "process_id": w["process_id"]} for w in wins])');
    L.push('    candidates = [w for w in wins if title_matches(w["title"], expected, mode)]');
    L.push('    if not candidates:');
    L.push('        log("ERROR", "bind", "未找到匹配窗口；请检查 windowTitle / windowMatchMode，并确认目标软件已启动且窗口可见")');
    L.push('        return None');
    L.push('    chosen = candidates[0]');
    L.push('    log("INFO", "bind", "已绑定目标窗口（仅记录标题与句柄）",');
    L.push('        title=chosen["title"], handle=chosen["handle"])');
    L.push('    return chosen["ref"]');
    L.push('');
    L.push('');
    L.push('def bring_to_front(win) -> None:');
    L.push('    """将目标窗口置前，用于人工接管；不发送任何点击或按键。"""');
    L.push('    target = CONFIG.get("target") or {}');
    L.push('    if target.get("bringToFront") is False:');
    L.push('        return');
    L.push('    try:');
    L.push('        win.set_focus()');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "window", "窗口置前失败，请手动切换：" + str(exc))');
    L.push('');
    L.push('');
    L.push('def visible_text(win) -> str:');
    L.push('    """读取窗口控件树中的可见文字，仅用于定位控件与结果判定，绝不用于识别验证码。"""');
    L.push('    chunks = []');
    L.push('    try:');
    L.push('        for ctrl in win.descendants():');
    L.push('            try:');
    L.push('                name = str(ctrl.window_text())');
    L.push('                if name:');
    L.push('                    chunks.append(name)');
    L.push('            except Exception:');
    L.push('                continue');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "text", "控件树文字读取失败：" + str(exc))');
    L.push('    return chr(10).join(chunks)');
    L.push('');
    L.push('');
    L.push('def find_control(win, by: str, value: str, control_type: str | None = None):');
    L.push('    """兼容 WindowSpecification 与 UIAWrapper 两种绑定对象；只读控件树，返回控件或 None。"""');
    L.push('    if not value:');
    L.push('        return None');
    L.push('    if hasattr(win, "child_window"):');
    L.push('        try:');
    L.push('            kw = {"control_type": control_type} if control_type else {}');
    L.push('            kw["auto_id" if by == "auto_id" else "title"] = value');
    L.push('            return win.child_window(**kw).wrapper_object()');
    L.push('        except Exception:');
    L.push('            pass');
    L.push('    try:');
    L.push('        for ctrl in win.descendants():');
    L.push('            try:');
    L.push('                info = ctrl.element_info');
    L.push('                actual = str((info.automation_id if by == "auto_id" else ctrl.window_text()) or "")');
    L.push('                if value not in actual:');
    L.push('                    continue');
    L.push('                if control_type and str(info.control_type or "") != control_type:');
    L.push('                    continue');
    L.push('                return ctrl');
    L.push('            except Exception:');
    L.push('                continue');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "locate", "控件树遍历失败：" + str(exc))');
    L.push('    return None');
    L.push('');
    L.push('');
    L.push('def control_exists(win, by: str, value: str, control_type: str | None = None) -> bool:');
    L.push('    """定位器存在性检查；与 find_control 共用同一套兼容逻辑。"""');
    L.push('    return find_control(win, by, value, control_type) is not None');
    L.push('');
    L.push('');
    L.push('def locate(win, locator) -> bool:');
    L.push('    """按 kind 执行单个定位器；不支持的 kind 或可选依赖缺失时安全返回 False（不可重试的兜底）。"""');
    L.push('    if not locator:');
    L.push('        return False');
    L.push('    kind = str(locator.get("kind") or "")');
    L.push('    value = str(locator.get("value") or "")');
    L.push('    try:');
    L.push('        if kind == "uia_automation_id":');
    L.push('            return control_exists(win, "auto_id", value, locator.get("controlType") or None)');
    L.push('        if kind == "uia_name":');
    L.push('            return control_exists(win, "title", value, locator.get("controlType") or None)');
    L.push('        if kind == "text" or kind == "ocr_text":');
    L.push('            if kind == "ocr_text" and _VISION["pytesseract"] is None:');
    L.push('                log("WARN", "locate", "ocr_text 可选依赖缺失，已降级为控件树文字匹配")');
    L.push('            return value in visible_text(win)');
    L.push('        if kind == "image_template":');
    L.push('            if _VISION["cv2"] is None:');
    L.push('                log("WARN", "locate", "image_template 可选依赖缺失，已跳过该兜底定位器")');
    L.push('                return False');
    L.push('            path = str(locator.get("templatePath") or value)');
    L.push('            if not os.path.isfile(path):');
    L.push('                log("WARN", "locate", "模板文件不存在，已跳过：" + path)');
    L.push('                return False');
    L.push('            return True');
    L.push('        if kind == "coordinate_anchor":');
    L.push('            nx = float(locator.get("nx", 0.0))');
    L.push('            ny = float(locator.get("ny", 0.0))');
    L.push('            if not (0.0 <= nx <= 1.0 and 0.0 <= ny <= 1.0):');
    L.push('                log("ERROR", "locate", "coordinate_anchor 越界：必须使用 0..1 归一化坐标，禁止绝对屏幕坐标")');
    L.push('                return False');
    L.push('            rect = win.rectangle()');
    L.push('            return rect.width() > 0 and rect.height() > 0');
    L.push('        log("WARN", "locate", "当前通道不支持的定位方式，已跳过：" + kind)');
    L.push('        return False');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "locate", "定位器执行异常：" + kind + " " + str(exc))');
    L.push('        return False');
    L.push('');
    L.push('');
    L.push('def captcha_detected(win) -> bool:');
    L.push('    """检测人机验证挑战：只看验证码容器定位器与界面可见提示文字，绝不识别验证码内容。"""');
    L.push('    locator = CONFIG.get("captchaLocator")');
    L.push('    if locator and locate(win, locator):');
    L.push('        return True');
    L.push('    text = visible_text(win)');
    L.push('    for hint in CAPTCHA_HINTS:');
    L.push('        if hint in text:');
    L.push('            return True');
    L.push('    return False');
    L.push('');
    L.push('');
    L.push('def wait_human_continue(timeout_sec: int) -> bool:');
    L.push('    """在独立线程等待用户回车，主线程按超时自动放行中止；接管期间无任何自动化输入。"""');
    L.push('    box = {"done": False}');
    L.push('');
    L.push('    def reader() -> None:');
    L.push('        try:');
    L.push('            input()');
    L.push('            box["done"] = True');
    L.push('        except (EOFError, KeyboardInterrupt):');
    L.push('            box["done"] = False');
    L.push('');
    L.push('    worker = threading.Thread(target=reader, daemon=True)');
    L.push('    worker.start()');
    L.push('    worker.join(timeout_sec)');
    L.push('    return (not worker.is_alive()) and box["done"] is True');
    L.push('');
    L.push('');
    L.push('def handoff(win) -> bool:');
    L.push('    """暂停一切自动化输入 -> 目标窗口置前 -> 提示用户手动完成 -> 超时自动中止。"""');
    L.push('    log("WARN", "handoff", "检测到验证码 / 人机验证：已暂停一切自动化输入，接管期间不发送任何点击或按键")');
    L.push('    bring_to_front(win)');
    L.push('    print("")');
    L.push('    print("========== 需要人工接管 ==========")');
    L.push('    print("请在已置前的目标窗口中，由您本人手动完成验证。")');
    L.push('    print("接管期间脚本不会进行任何自动化输入，避免与您的操作冲突。")');
    L.push('    print("完成后回到本控制台按回车继续；超过 " + str(HANDOFF_TIMEOUT_SEC) + " 秒未完成将自动中止。")');
    L.push('    ok = wait_human_continue(HANDOFF_TIMEOUT_SEC)');
    L.push('    if not ok:');
    L.push('        log("ERROR", "handoff", "人工接管超时或输入取消，任务自动中止")');
    L.push('        return False');
    L.push('    log("INFO", "handoff", "用户已完成人工接管，恢复流程")');
    L.push('    return True');
    L.push('');
    L.push('');
    L.push('def interactive_confirm(prompt: str) -> bool:');
    L.push('    """交互式确认；任何非 yes 输入或无输入一律视为取消。"""');
    L.push('    try:');
    L.push('        answer = input(prompt + " 输入 yes 继续，其他任意输入取消：")');
    L.push('    except (EOFError, KeyboardInterrupt):');
    L.push('        return False');
    L.push('    return answer.strip().lower() in ("yes", "y")');
    L.push('');
    L.push('');
    L.push('def fill_fields(win) -> None:');
    L.push('    """按配置填写字段；敏感脱敏值与不可写通道一律跳过，日志不记录字段值。"""');
    L.push('    caps = CONFIG.get("capabilities") or {}');
    L.push('    for field in CONFIG.get("fields") or []:');
    L.push('        key = str(field.get("key") or "")');
    L.push('        value = str(field.get("value") or "")');
    L.push('        locator = field.get("locator")');
    L.push('        if REDACTED in value:');
    L.push('            log("WARN", "fill", "敏感字段未包含明文，已跳过：" + key)');
    L.push('            continue');
    L.push('        if not locator or not locate(win, locator):');
    L.push('            log("WARN", "fill", "字段控件未命中或缺少定位器，已跳过：" + key)');
    L.push('            continue');
    L.push('        if caps.get("canPrefill") is not True:');
    L.push('            log("WARN", "fill", "当前通道不支持预填，字段仅定位不写入：" + key)');
    L.push('            continue');
    L.push('        try:');
    L.push('            kind = str(locator.get("kind") or "")');
    L.push('            val = str(locator.get("value") or "")');
    L.push('            ctrl = None');
    L.push('            if kind == "uia_automation_id":');
    L.push('                ctrl = find_control(win, "auto_id", val)');
    L.push('            elif kind == "uia_name":');
    L.push('                ctrl = find_control(win, "title", val)');
    L.push('            if ctrl is not None and hasattr(ctrl, "set_edit_text"):');
    L.push('                ctrl.set_edit_text(value)');
    L.push('                log("INFO", "fill", "字段已填写（日志不记录字段值）：" + key)');
    L.push('            elif ctrl is not None and hasattr(ctrl, "click_input"):');
    L.push('                ctrl.click_input()');
    L.push('                log("INFO", "fill", "字段已点击（日志不记录字段值）：" + key)');
    L.push('            else:');
    L.push('                log("WARN", "fill", "控件不支持写入或点击，已跳过：" + key)');
    L.push('        except Exception as exc:');
    L.push('            log("WARN", "fill", "字段写入异常：" + key + " " + str(exc))');
    L.push('');
    L.push('');
    L.push('def submit(win) -> bool:');
    L.push('    """仅在 --live 且用户确认后调用；未命中提交控件一律不点击。"""');
    L.push('    locator = CONFIG.get("submitLocator")');
    L.push('    if not locator:');
    L.push('        log("WARN", "submit", "未配置提交控件定位器，本次不提交")');
    L.push('        return False');
    L.push('    if not locate(win, locator):');
    L.push('        log("WARN", "submit", "提交控件未命中，本次不提交")');
    L.push('        return False');
    L.push('    try:');
    L.push('        kind = str(locator.get("kind") or "")');
    L.push('        val = str(locator.get("value") or "")');
    L.push('        if kind in ("uia_automation_id", "uia_name"):');
    L.push('            ctrl = find_control(win, "auto_id" if kind == "uia_automation_id" else "title", val)');
    L.push('            if ctrl is None or not hasattr(ctrl, "click_input"):');
    L.push('                log("WARN", "submit", "提交控件未命中或不可点击，本次不提交")');
    L.push('                return False');
    L.push('            ctrl.click_input()');
    L.push('        elif kind == "coordinate_anchor":');
    L.push('            from pywinauto import mouse');
    L.push('            rect = win.rectangle()');
    L.push('            nx = float(locator.get("nx", 0.0))');
    L.push('            ny = float(locator.get("ny", 0.0))');
    L.push('            if not (0.0 <= nx <= 1.0 and 0.0 <= ny <= 1.0):');
    L.push('                log("ERROR", "submit", "归一化坐标越界，拒绝提交")');
    L.push('                return False');
    L.push('            x = int(rect.left + nx * rect.width())');
    L.push('            y = int(rect.top + ny * rect.height())');
    L.push('            mouse.click(coords=(x, y))');
    L.push('        else:');
    L.push('            log("WARN", "submit", "该定位方式不支持提交点击，已跳过：" + kind)');
    L.push('            return False');
    L.push('        log("INFO", "submit", "已按您的确认执行提交点击")');
    L.push('        return True');
    L.push('    except Exception as exc:');
    L.push('        log("WARN", "submit", "提交点击异常：" + str(exc))');
    L.push('        return False');
    L.push('');
    L.push('');
    L.push('def judge(win) -> str:');
    L.push('    """成功判定只依赖窗口可见文字关键词；无法判定时返回 pending，绝不默认判成功。"""');
    L.push('    text = visible_text(win)');
    L.push('    for word in CONFIG.get("successLocators") or []:');
    L.push('        if str(word) and str(word) in text:');
    L.push('            return "success"');
    L.push('    for word in CONFIG.get("failureKeywords") or []:');
    L.push('        if str(word) and str(word) in text:');
    L.push('            return "failed"');
    L.push('    return "pending"');
    L.push('');
    L.push('');
    L.push('def run_dry(win) -> int:');
    L.push('    """默认模式：只做窗口发现与定位器探测，不填写、不提交、不修改任何数据。"""');
    L.push('    log("INFO", "dry-run", "dry-run 默认开启：只做窗口发现与定位器探测，不填写、不提交")');
    L.push('    for item in CONFIG.get("probeLocators") or []:');
    L.push('        label = str(item.get("label") or "")');
    L.push('        locator = item.get("locator")');
    L.push('        started = time.monotonic()');
    L.push('        hit = locate(win, locator) if locator else False');
    L.push('        elapsed = int((time.monotonic() - started) * 1000)');
    L.push('        log("INFO", "probe", "定位器探测：" + label, hit=hit, elapsedMs=elapsed,');
    L.push('            kind=str((locator or {}).get("kind") or "none"))');
    L.push('    log("INFO", "dry-run", "探测完成，未执行任何提交；如需真实运行请显式加 --live 并在运行时再次确认")');
    L.push('    return 0');
    L.push('');
    L.push('');
    L.push('def run_live(win) -> int:');
    L.push('    """真实运行：策略开关 + 运行时二次确认 + 每次提交前确认，三重门槛。"""');
    L.push('    policy = CONFIG.get("policy") or {}');
    L.push('    if policy.get("liveSubmit") is not True:');
    L.push('        print("[SlotRunner] 当前策略未开启真实提交开关，请在配置中心开启后重新导出脚本。")');
    L.push('        log("WARN", "gate", "策略未开启真实提交，拒绝 --live")');
    L.push('        return 2');
    L.push('    if not interactive_confirm("运行时二次确认：请确认您本人有权操作该软件与账号、已登录、并已核对配置。"):');
    L.push('        log("WARN", "gate", "用户未通过运行时二次确认，安全退出（未执行任何提交）")');
    L.push('        return 0');
    L.push('    interval_ms = max(MIN_INTERVAL_MS, int(policy.get("intervalMs") or 3000))');
    L.push('    max_attempts = min(MAX_ATTEMPTS, max(1, int(policy.get("maxAttempts") or 20)))');
    L.push('    jitter_pct = max(0, min(MAX_JITTER_PCT, int(policy.get("jitterPct") or 0)))');
    L.push('    warmup_sec = max(0, int(policy.get("warmupSec") or 0))');
    L.push('    timeout_ms = max(1000, int(policy.get("timeoutMs") or 10000))');
    L.push('    require_confirm = policy.get("requireConfirm") is True');
    L.push('    open_at = str(policy.get("openAt") or "")');
    L.push('');
    L.push('    if warmup_sec > 0:');
    L.push('        log("INFO", "warmup", "预热：提前 " + str(warmup_sec) + " 秒激活目标窗口")');
    L.push('        bring_to_front(win)');
    L.push('');
    L.push('    target_ts = None');
    L.push('    if open_at:');
    L.push('        try:');
    L.push('            target_ts = datetime.fromisoformat(open_at.replace("Z", "+00:00")).timestamp()');
    L.push('        except ValueError:');
    L.push('            target_ts = None');
    L.push('    if target_ts is not None:');
    L.push('        # 以 monotonic 为计时基准：先记录它与 wall clock 的锚点，之后只用 monotonic 推进，');
    L.push('        # 避免运行期间系统时间被调整导致触发点漂移。');
    L.push('        mono_anchor = time.monotonic()');
    L.push('        wall_anchor = time.time()');
    L.push('        while True:');
    L.push('            now_wall = wall_anchor + (time.monotonic() - mono_anchor)');
    L.push('            remain = target_ts - now_wall');
    L.push('            if remain <= 0:');
    L.push('                break');
    L.push('            time.sleep(min(remain, 0.2))');
    L.push('        log("INFO", "schedule", "已到达开放时间（计时基于 time.monotonic）")');
    L.push('    elif warmup_sec > 0:');
    L.push('        time.sleep(warmup_sec)');
    L.push('');
    L.push('    started = time.monotonic()');
    L.push('    for index in range(1, max_attempts + 1):');
    L.push('        log("INFO", "attempt", "第 " + str(index) + " / " + str(max_attempts) + " 次尝试")');
    L.push('        if captcha_detected(win):');
    L.push('            if not handoff(win):');
    L.push('                return 2');
    L.push('        bring_to_front(win)');
    L.push('        fill_fields(win)');
    L.push('        if captcha_detected(win):');
    L.push('            log("WARN", "captcha", "提交前再次检测到验证挑战，已暂停提交")');
    L.push('            if not handoff(win):');
    L.push('                return 2');
    L.push('        if require_confirm and not interactive_confirm("提交前人工确认：第 " + str(index) + " 次提交。"):');
    L.push('            log("WARN", "gate", "用户未确认提交，任务中止")');
    L.push('            return 0');
    L.push('        submitted = submit(win)');
    L.push('        verdict = judge(win)');
    L.push('        if verdict == "success" and submitted:');
    L.push('            log("INFO", "result", "命中成功关键词，任务结束")');
    L.push('            return 0');
    L.push('        if verdict == "failed":');
    L.push('            log("WARN", "result", "命中失败特征，任务结束")');
    L.push('            return 1');
    L.push('        log("WARN", "result", "结果待确认：窗口可见文字未命中成功 / 失败关键词，绝不默认判成功")');
    L.push('        elapsed_ms = int((time.monotonic() - started) * 1000)');
    L.push('        if elapsed_ms > timeout_ms * max_attempts:');
    L.push('            log("WARN", "result", "已超过累计超时预算，任务结束")');
    L.push('            return 1');
    L.push('        delay = interval_ms + int(interval_ms * jitter_pct * random.random() / 100.0)');
    L.push('        log("INFO", "cooldown", "速率限制：等待 " + str(delay) + "ms（间隔不低于 1000ms）")');
    L.push('        time.sleep(delay / 1000.0)');
    L.push('    log("WARN", "result", "已达到最大尝试次数 " + str(max_attempts) + " 次，任务结束")');
    L.push('    return 1');
    L.push('');
    L.push('');
    L.push('def parse_args() -> argparse.Namespace:');
    L.push('    parser = argparse.ArgumentParser(description="SlotRunner 本地运行时（默认 dry-run）")');
    L.push('    parser.add_argument("--live", action="store_true", help="允许真实提交；仍需运行时再次交互确认")');
    L.push('    parser.add_argument("--discover", action="store_true", help="只枚举窗口元数据后退出")');
    L.push('    parser.add_argument("--timeout", type=int, default=HANDOFF_TIMEOUT_SEC,');
    L.push('                        help="人工接管超时秒数，默认 180")');
    L.push('    parser.add_argument("--dry-run", action="store_true",');
    L.push('                        help="显式 dry-run（默认行为，优先级高于 --live）")');
    L.push('    return parser.parse_args()');
    L.push('');
    L.push('');
    L.push('def main() -> int:');
    L.push('    global HANDOFF_TIMEOUT_SEC');
    L.push('    args = parse_args()');
    L.push('    HANDOFF_TIMEOUT_SEC = max(1, int(args.timeout))');
    L.push('    log("INFO", "boot", "SlotRunner 本地运行时启动（纯本地执行，不发起任何后台请求）",');
    L.push('        channel=CONFIG.get("channel", "web"), generatedAt=CONFIG.get("generatedAt", ""))');
    L.push('    log("INFO", "boot", "日志文件：" + LOG_PATH)');
    L.push('    require_backend()');
    L.push('    load_optional_vision()');
    L.push('    if args.discover:');
    L.push('        for win in discover_windows():');
    L.push('            print("[SlotRunner] 窗口元数据 title=" + win["title"] + " handle=" + str(win["handle"]) +');
    L.push('                  " class=" + win["class_name"] + " pid=" + str(win["process_id"]))');
    L.push('        log("INFO", "discover", "仅枚举窗口元数据完成，未读取窗口内容或截图")');
    L.push('        return 0');
    L.push('    window = bind_window()');
    L.push('    if window is None:');
    L.push('        return 2');
    L.push('    bring_to_front(window)');
    L.push('    if args.dry_run or not args.live:');
    L.push('        return run_dry(window)');
    L.push('    return run_live(window)');
    L.push('');
    L.push('');
    L.push('if __name__ == "__main__":');
    L.push('    try:');
    L.push('        sys.exit(main())');
    L.push('    except KeyboardInterrupt:');
    L.push('        print("")');
    L.push('        print("[SlotRunner] 用户中断，已停止（未执行任何提交）")');
    L.push('        sys.exit(130)');
    L.push('');
    return L.join('\n');
  }

  /**
   * 生成单个自包含 Python 3.11+ 本地运行时脚本源码字符串。
   * @param {Object} task     任务（name / targetUrl / adapterId ...）
   * @param {Object} adapter  适配器（channel / target / locators / captchaLocator / ...）
   * @param {Object} template 模板（variables / mappings）
   * @param {Object} policy   策略（导出前由 engine.clampPolicy 再次钳制）
   * @param {Object} options  { includeSecrets:boolean, globalLiveSubmitEnabled:boolean }
   * @returns {string} Python 源码；永远返回非空字符串
   */
  function buildLocalRunner(task, adapter, template, policy, options) {
    var config = buildConfig(task, adapter, template, policy, options);
    var source = buildPythonSource(config);
    if (!source || source.length === 0) {
      // 兜底：模板恒定产出内容，此处仅防御极端入参，保证调用方永远拿到可写文件。
      source = '#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\nprint("[SlotRunner] 配置为空，已安全退出")\n';
    }
    return source;
  }

  var api = {
    buildLocalRunner: buildLocalRunner,
    buildConfig: buildConfig,
    pyLiteral: pyLiteral,
    sanitizeName: sanitizeName
  };

  SR.localrunner = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
