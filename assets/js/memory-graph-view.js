// assets/js/memory-graph-view.js
/* ============================================================
 * 私人记忆档案 · 宇宙视图与玻璃浮层控制器（第二阶段）
 * 1. 解锁后直接挂载宇宙视图（零列表闪现），旧模式 2d/3d 一次性迁移至 universe
 * 2. 工具栏三段控制：宇宙 / 平面 2D / 目录（动作按钮弹出右侧玻璃浮层）
 * 3. 右侧毛玻璃覆盖层：档案目录与同层正文阅读（#pmv-dir-overlay）+ 节点详情（#mg-detail）
 *    不挤压画布尺寸，浮层打开期间底层宇宙/2D 持续渲染；移动端自动切换 68vh 底部抽屉
 * 4. 完整无障碍焦点循环、Esc 三级优先级、空白点击关闭与 R 键视角复位
 * ============================================================ */
(function (global) {
  "use strict";

  var MODE_KEY = "pmv-graph-mode";
  var OVERLAY_ANIM_MS = 190;

  var CAT_LABELS = {
    USER: "用户",
    MEMORY: "记忆索引",
    PROJECTS: "项目",
    TOPIC: "主题",
    PROMPT: "提示词",
    GUIDE: "指南"
  };
  var CAT_COLORS = {
    USER: "#fb7185",
    MEMORY: "#22d3ee",
    PROJECTS: "#2dd4bf",
    TOPIC: "#38bdf8",
    PROMPT: "#fbbf24",
    GUIDE: "#c084fc"
  };

  var state = {
    data: null,
    current: null,
    active: false,
    activeCat: null,
    bound: false,
    mode: "universe",
    detailOpen: false,
    dirOpen: false,
    dirPane: "list",
    detailTrigger: null,
    dirTrigger: null,
    detailHideTimer: 0,
    dirHideTimer: 0,
    dirPulseTimer: 0,
    mountRaf: 0,
    stageDownX: 0,
    stageDownY: 0,
    stageTracking: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function prefersReducedMotion() {
    try {
      return Boolean(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  /* 旧值缺失 / 2d / 3d 统一迁移至 universe 并写回 localStorage；plane 与 universe 刷新持久保持 */
  function migrateAndReadMode() {
    var saved = null;
    try {
      saved = global.localStorage.getItem(MODE_KEY);
    } catch (e) {}
    if (!saved || saved === "2d" || saved === "3d") {
      try {
        global.localStorage.setItem(MODE_KEY, "universe");
      } catch (e) {}
      return "universe";
    }
    if (saved === "plane" || saved === "universe") {
      return saved;
    }
    try {
      global.localStorage.setItem(MODE_KEY, "universe");
    } catch (e) {}
    return "universe";
  }

  // 脚本加载即执行一次模式迁移，确保任意时机读取皆为新值
  state.mode = migrateAndReadMode();

  function fmtSize(n) {
    n = n || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function focusSafely(el) {
    if (!el || typeof el.focus !== "function") return;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      try { el.focus(); } catch (err) {}
    }
  }

  function syncRootLock() {
    var appView = $("app-view");
    var lockOn = Boolean(state.active && appView && !appView.hidden);
    document.documentElement.classList.toggle("is-pmv-graph-lock", lockOn);
    if (appView) {
      appView.classList.toggle("is-graph-active", state.active);
    }
  }

  function syncOverlayTopOffset() {
    var appView = $("app-view");
    var gv = $("pmv-graph-view");
    var stage = $("mg-stage");
    if (!appView || !gv || !stage) return;
    var stageTop = stage.offsetTop || 52;
    var appTop = (gv.offsetTop || 63) + stageTop;
    appView.style.setProperty("--mg-overlay-top-gv", (stageTop + 10) + "px");
    appView.style.setProperty("--mg-overlay-top-app", (appTop + 10) + "px");
  }

  function syncVignette() {
    syncOverlayTopOffset();
    var vig = $("mg-edge-vignette");
    if (vig) {
      vig.classList.toggle("is-active", Boolean(state.detailOpen || state.dirOpen));
    }
  }

  function syncLegendHighlight() {
    var box = $("mg-legend");
    if (!box) return;
    var items = box.querySelectorAll(".mg-legend-item[data-cat]");
    for (var i = 0; i < items.length; i++) {
      var cat = items[i].getAttribute("data-cat");
      items[i].classList.toggle("is-active", Boolean(state.activeCat && state.activeCat === cat));
    }
  }

  function buildLegend() {
    var box = $("mg-legend");
    if (!box || !state.data) return;
    var cats = {};
    (state.data.sections || []).forEach(function (s) {
      var c = /指南|guide/i.test((s.id || "") + " " + (s.title || "")) ? "GUIDE" : (s.category || "TOPIC");
      cats[c] = (cats[c] || 0) + 1;
    });
    (state.data.prompts || []).forEach(function () {
      cats.PROMPT = (cats.PROMPT || 0) + 1;
    });
    box.innerHTML = Object.keys(cats).map(function (c) {
      var color = CAT_COLORS[c] || "#38bdf8";
      return '<button type="button" class="mg-legend-item" data-cat="' + escapeHtml(c) + '" title="点击聚焦该分区">'
        + '<i style="background:' + color + ';color:' + color + '"></i>'
        + '<span>' + escapeHtml(CAT_LABELS[c] || c) + " " + cats[c] + "</span></button>";
    }).join("");
    syncLegendHighlight();
  }

  function updateDirCount() {
    var countEl = $("mg-dir-count");
    var nav = $("pmv-nav");
    if (!countEl || !nav) return;
    var items = nav.querySelectorAll(".pmv-nav-item[data-section]");
    countEl.textContent = items.length ? ("共 " + items.length + " 项") : "";
  }

  function setDirPane(pane) {
    state.dirPane = pane === "doc" ? "doc" : "list";
    var dir = $("pmv-dir-overlay");
    var backBtn = $("mg-dir-back");
    var titleEl = $("mg-dir-title");
    var scrollEl = $("mg-dir-scroll");
    if (dir) {
      dir.setAttribute("data-dir-pane", state.dirPane);
    }
    if (backBtn) {
      backBtn.hidden = state.dirPane !== "doc";
    }
    if (titleEl) {
      titleEl.textContent = state.dirPane === "doc" ? "正文阅读" : "档案目录";
    }
    updateDirCount();
    if (scrollEl && state.dirPane === "doc") {
      scrollEl.scrollTop = 0;
    }
  }

  function syncDirButtonHighlight(pulse) {
    var dirBtn = $("mg-dir-btn");
    if (!dirBtn) return;
    if (state.dirPulseTimer) {
      global.clearTimeout(state.dirPulseTimer);
      state.dirPulseTimer = 0;
    }
    if (state.dirOpen) {
      dirBtn.classList.add("is-active");
      dirBtn.setAttribute("aria-expanded", "true");
      if (pulse) {
        dirBtn.classList.add("is-pulse");
        state.dirPulseTimer = global.setTimeout(function () {
          state.dirPulseTimer = 0;
          dirBtn.classList.remove("is-pulse");
        }, 1800);
      }
    } else {
      dirBtn.classList.remove("is-active");
      dirBtn.classList.remove("is-pulse");
      dirBtn.setAttribute("aria-expanded", "false");
    }
  }

  function openDirOverlay(triggerEl, pane) {
    if (!state.active) return;
    if (state.detailOpen) {
      closeDetailOverlay(false, true);
    }
    var dir = $("pmv-dir-overlay");
    if (!dir) return;

    if (state.dirHideTimer) {
      global.clearTimeout(state.dirHideTimer);
      state.dirHideTimer = 0;
    }

    state.dirTrigger = triggerEl || $("mg-dir-btn") || document.activeElement;
    state.dirOpen = true;
    setDirPane(pane || "list");

    dir.classList.remove("is-initial-hidden");
    dir.hidden = false;
    dir.setAttribute("aria-hidden", "false");
    void dir.offsetWidth;
    dir.classList.add("is-open");

    syncDirButtonHighlight(true);
    syncVignette();

    var focusTarget = state.dirPane === "doc"
      ? ($("mg-dir-back") || $("mg-dir-close"))
      : ($("pmv-search") || dir.querySelector(".pmv-nav-item") || $("mg-dir-close"));
    focusSafely(focusTarget);
  }

  function closeDirOverlay(restoreFocus) {
    var dir = $("pmv-dir-overlay");
    if (!state.dirOpen && (!dir || dir.hidden)) return;

    state.dirOpen = false;
    syncDirButtonHighlight(false);
    syncVignette();

    if (dir) {
      dir.classList.remove("is-open");
      dir.setAttribute("aria-hidden", "true");
      if (state.dirHideTimer) {
        global.clearTimeout(state.dirHideTimer);
      }
      if (prefersReducedMotion()) {
        dir.hidden = true;
        state.dirHideTimer = 0;
      } else {
        state.dirHideTimer = global.setTimeout(function () {
          state.dirHideTimer = 0;
          if (!state.dirOpen && state.active && dir) {
            dir.hidden = true;
          }
        }, OVERLAY_ANIM_MS);
      }
    }

    if (restoreFocus && state.dirTrigger && document.contains(state.dirTrigger)) {
      focusSafely(state.dirTrigger);
    }
  }

  function openDetailOverlay() {
    var detail = $("mg-detail");
    if (!detail) return;

    if (state.dirOpen) {
      closeDirOverlay(false);
    }
    if (state.detailHideTimer) {
      global.clearTimeout(state.detailHideTimer);
      state.detailHideTimer = 0;
    }

    var activeEl = document.activeElement;
    if (activeEl && !detail.contains(activeEl)) {
      state.detailTrigger = activeEl;
    }

    state.detailOpen = true;
    detail.hidden = false;
    detail.setAttribute("aria-hidden", "false");
    void detail.offsetWidth;
    detail.classList.add("is-open");
    syncVignette();

    var body = $("mg-detail-body");
    if (body) body.scrollTop = 0;
    focusSafely($("mg-detail-close") || detail);
  }

  function closeDetailOverlay(restoreFocus, clearInEngine) {
    var detail = $("mg-detail");
    var wasOpen = state.detailOpen || Boolean(detail && !detail.hidden);
    state.current = null;
    state.detailOpen = false;
    syncVignette();

    if (clearInEngine) {
      var eng = engine();
      if (eng && eng.clearSelection) eng.clearSelection();
    }

    if (detail && wasOpen) {
      detail.classList.remove("is-open");
      detail.setAttribute("aria-hidden", "true");
      if (state.detailHideTimer) {
        global.clearTimeout(state.detailHideTimer);
      }
      if (prefersReducedMotion()) {
        detail.hidden = true;
        state.detailHideTimer = 0;
      } else {
        state.detailHideTimer = global.setTimeout(function () {
          state.detailHideTimer = 0;
          if (!state.detailOpen && detail) {
            detail.hidden = true;
          }
        }, OVERLAY_ANIM_MS);
      }
    }

    if (restoreFocus) {
      var target = (state.detailTrigger && document.contains(state.detailTrigger) && state.detailTrigger !== document.body)
        ? state.detailTrigger
        : $("mg-reset");
      focusSafely(target);
    }
  }

  function closeAllOverlays(restoreFocus) {
    if (state.dirOpen) closeDirOverlay(restoreFocus);
    if (state.detailOpen) closeDetailOverlay(restoreFocus, true);
  }

  function renderDetail(node) {
    state.current = node || null;
    if (node) {
      state.activeCat = null;
      syncLegendHighlight();
    }

    if (!node) {
      closeDetailOverlay(false, false);
      try {
        global.dispatchEvent(new CustomEvent("pmv:node-select", { detail: { node: null } }));
      } catch (e) {}
      return;
    }

    var cat = node.category || "TOPIC";
    var catEl = $("mg-detail-cat");
    if (catEl) {
      catEl.textContent = CAT_LABELS[cat] || cat;
      catEl.style.background = CAT_COLORS[cat] || "#38bdf8";
    }
    var title = $("mg-detail-title");
    if (title) title.textContent = node.title || "未命名";
    var meta = $("mg-detail-meta");
    if (meta) {
      var deg = node.degree || 0;
      meta.textContent = (node.kind === "prompt" ? "提示词" : "记忆章节")
        + (node.source ? " · " + node.source : "")
        + " · 关联 " + deg + " 条";
    }
    var body = $("mg-detail-body");
    if (body) {
      if (global.PMVMarkdown && global.PMVMarkdown.render) {
        body.innerHTML = global.PMVMarkdown.render(node.content || "");
      } else {
        body.textContent = node.content || "";
      }
    }
    loadFiles(node.id);
    openDetailOverlay();

    try {
      global.dispatchEvent(new CustomEvent("pmv:node-select", { detail: { node: node } }));
    } catch (e) {}
  }

  function loadFiles(nodeId) {
    var list = $("mg-file-list");
    if (!list) return;
    if (!global.MemoryFiles) {
      list.innerHTML = '<p class="mg-empty">文件组件未加载</p>';
      return;
    }
    global.MemoryFiles.list(nodeId).then(function (files) {
      if (!files.length) {
        list.innerHTML = '<p class="mg-empty">还没有文件，点上方添加</p>';
        return;
      }
      list.innerHTML = files.map(function (f) {
        var eid = escapeHtml(f.id);
        return '<div class="mg-file-item">'
          + '<span class="mg-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + "</span>"
          + '<span class="mg-file-size">' + fmtSize(f.size) + "</span>"
          + '<button type="button" data-dl="' + eid + '" class="mg-file-btn" title="下载">↓</button>'
          + '<button type="button" data-rm="' + eid + '" class="mg-file-btn mg-file-rm" title="删除">×</button>'
          + "</div>";
      }).join("");
    }).catch(function (e) {
      list.innerHTML = '<p class="mg-empty">读取失败：' + escapeHtml(e.message) + "</p>";
    });
  }

  function isUniverseMode() {
    return state.mode === "universe";
  }

  function engine() {
    if (isUniverseMode() && global.MemoryGraph3D && global.MemoryGraph3D.supported()) {
      return global.MemoryGraph3D;
    }
    return global.MemoryGraph;
  }

  function hintText() {
    return isUniverseMode()
      ? "拖动旋转宇宙 · 滚轮缩放观银河全景 · 点击天体/虫洞看详情 · 双击/R 复位"
      : "拖动平移/拖拽节点 · 滚轮缩放观银河全景 · 点击节点/虫洞看详情 · 双击/R 复位";
  }

  function normalizeModeInput(mode) {
    if (mode === "plane" || mode === "2d") return "plane";
    return "universe";
  }

  function syncModeButtons() {
    var box = $("mg-mode");
    if (box) {
      var btns = box.querySelectorAll("[data-mode]");
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute("data-mode") === state.mode;
        btns[i].classList.toggle("is-active", on);
        btns[i].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }
    var hint = document.querySelector("#pmv-graph-view .mg-hint");
    if (hint) hint.textContent = hintText();
    var topBtn = $("pmv-graph-btn");
    if (topBtn) topBtn.textContent = "◉ 图谱";
  }

  function destroyEngines() {
    if (state.mountRaf) {
      global.cancelAnimationFrame(state.mountRaf);
      state.mountRaf = 0;
    }
    try { if (global.MemoryGraph) global.MemoryGraph.destroy({ keep3dEnv: false }); } catch (e) {}
    try { if (global.MemoryGraph3D) global.MemoryGraph3D.destroy(); } catch (e) {}
  }

  function runMountNow() {
    if (!state.active || !state.data) return;
    var stage = $("mg-stage");
    var loading = $("mg-loading");
    if (!stage) return;

    var eng = engine();
    var renderOpts = eng === global.MemoryGraph3D
      ? { onSelect: renderDetail, planar: false, envOnly: false }
      : renderDetail;
    var res = eng && eng.render(stage, state.data, renderOpts);
    if (loading) loading.style.display = "none";
    if (!res) return;

    if (res.error && loading) {
      loading.textContent = "WebGL 不可用，已自动切换至兼容 2D 视图";
      loading.style.display = "";
      if (eng === global.MemoryGraph3D && global.MemoryGraph) {
        global.MemoryGraph.render(stage, state.data, renderDetail);
      }
      global.setTimeout(function () { if (loading) loading.style.display = "none"; }, 2400);
      return;
    }

    if (state.activeCat && eng.focusCategory) {
      state.activeCat = eng.focusCategory(state.activeCat);
    }
    if (loading) {
      loading.textContent = "恒星 陌浔 · 记忆天体 " + res.nodes + " · 关联 " + res.edges;
      loading.style.display = "";
      global.setTimeout(function () { if (loading) loading.style.display = "none"; }, 1800);
    }
  }

  function mountGraph() {
    var loading = $("mg-loading");
    if (loading) {
      loading.textContent = isUniverseMode() ? "正在构建银河与陌浔恒星系…" : "正在构建平面 2D 星图…";
      loading.style.display = "";
    }
    if (state.mountRaf) {
      global.cancelAnimationFrame(state.mountRaf);
      state.mountRaf = 0;
    }
    var stage = $("mg-stage");
    if (stage && stage.clientWidth > 0 && stage.clientHeight > 0) {
      runMountNow();
    } else {
      state.mountRaf = global.requestAnimationFrame(function () {
        state.mountRaf = 0;
        runMountNow();
      });
    }
  }

  function setMode(rawMode) {
    var mode = normalizeModeInput(rawMode);
    if (state.mode === mode) return;
    state.mode = mode;
    try {
      global.localStorage.setItem(MODE_KEY, mode);
    } catch (e) {}
    syncModeButtons();
    if (!state.active) return;

    var cat = state.activeCat;
    closeDetailOverlay(false, false);

    /* 零销毁平滑切换：保留底层动态 3D 银河环境不中断，前景瞬时切换为扁平 2D 星图式或完整 3D 宇宙 */
    var stage = $("mg-stage");
    if (stage && global.MemoryGraph3D && global.MemoryGraph3D.isActive && global.MemoryGraph3D.isActive()) {
      if (isUniverseMode()) {
        try { if (global.MemoryGraph) global.MemoryGraph.destroy({ keep3dEnv: true }); } catch (e) {}
        global.MemoryGraph3D.setEnvOnly(false);
        if (cat) state.activeCat = global.MemoryGraph3D.focusCategory(cat);
      } else {
        global.MemoryGraph3D.setEnvOnly(true);
        global.MemoryGraph.render(stage, state.data, renderDetail);
        if (cat) state.activeCat = global.MemoryGraph.focusCategory(cat);
      }
      return;
    }

    destroyEngines();
    state.activeCat = cat;
    mountGraph();
  }

  function resetCurrentView() {
    state.activeCat = null;
    syncLegendHighlight();
    var eng = engine();
    if (eng && eng.resetView) eng.resetView();
  }

  function clearNodeAndCategorySelection() {
    var changed = false;
    var eng = engine();
    if (state.current) {
      state.current = null;
      if (eng && eng.clearSelection) eng.clearSelection();
      changed = true;
    }
    if (state.activeCat) {
      if (eng && eng.focusCategory) {
        state.activeCat = eng.focusCategory(null);
      } else {
        state.activeCat = null;
      }
      syncLegendHighlight();
      changed = true;
    }
    return changed;
  }

  function show(data) {
    if (data) state.data = data;
    if (!state.data) return;

    var alreadyActive = state.active;
    state.active = true;
    state.activeCat = null;

    var appView = $("app-view");
    if (appView) appView.classList.remove("is-booting");

    var gv = $("pmv-graph-view");
    if (gv) gv.hidden = false;

    var dir = $("pmv-dir-overlay");
    if (dir) {
      dir.classList.remove("is-initial-hidden");
      dir.classList.remove("is-open");
      dir.hidden = true;
      dir.setAttribute("aria-hidden", "true");
    }
    state.dirOpen = false;
    syncDirButtonHighlight(false);
    closeDetailOverlay(false, false);
    syncRootLock();

    buildLegend();
    syncModeButtons();
    updateDirCount();
    syncOverlayTopOffset();

    if (!alreadyActive) {
      destroyEngines();
      mountGraph();
    }
  }

  function hide() {
    state.active = false;
    state.activeCat = null;
    state.current = null;

    if (state.dirHideTimer) {
      global.clearTimeout(state.dirHideTimer);
      state.dirHideTimer = 0;
    }
    if (state.detailHideTimer) {
      global.clearTimeout(state.detailHideTimer);
      state.detailHideTimer = 0;
    }

    state.dirOpen = false;
    state.detailOpen = false;
    syncDirButtonHighlight(false);
    syncVignette();

    var gv = $("pmv-graph-view");
    if (gv) gv.hidden = true;

    var detail = $("mg-detail");
    if (detail) {
      detail.classList.remove("is-open");
      detail.hidden = true;
    }

    var dir = $("pmv-dir-overlay");
    if (dir) {
      dir.classList.remove("is-open");
      dir.classList.remove("is-initial-hidden");
      dir.removeAttribute("aria-hidden");
      dir.hidden = false;
    }

    syncRootLock();
    var topBtn = $("pmv-graph-btn");
    if (topBtn) topBtn.textContent = "◉ 图谱";
    destroyEngines();
  }

  function getFocusableElements(container) {
    if (!container) return [];
    var nodes = container.querySelectorAll(
      'button:not([disabled]):not([hidden]), [href]:not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])'
    );
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.offsetParent !== null || el === document.activeElement) {
        out.push(el);
      }
    }
    return out;
  }

  function handleOverlayTabTrap(e) {
    var activeOverlay = state.dirOpen
      ? $("pmv-dir-overlay")
      : (state.detailOpen ? $("mg-detail") : null);
    if (!activeOverlay || activeOverlay.hidden) return;

    var focusables = getFocusableElements(activeOverlay);
    if (!focusables.length) {
      e.preventDefault();
      focusSafely(activeOverlay);
      return;
    }
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    var cur = document.activeElement;

    if (e.shiftKey) {
      if (cur === first || !activeOverlay.contains(cur)) {
        e.preventDefault();
        focusSafely(last);
      }
    } else {
      if (cur === last || !activeOverlay.contains(cur)) {
        e.preventDefault();
        focusSafely(first);
      }
    }
  }

  function isEditableTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || Boolean(target.isContentEditable);
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;

    global.addEventListener("resize", syncOverlayTopOffset);
    if (global.ResizeObserver) {
      var tb = document.querySelector("#pmv-graph-view .mg-toolbar");
      if (tb) {
        try {
          var ro = new global.ResizeObserver(syncOverlayTopOffset);
          ro.observe(tb);
        } catch (e) {}
      }
    }

    // 顶部「◉ 图谱」按钮：从正文/浮层回到视图，等价于打开视图并关掉浮层
    var topBtn = $("pmv-graph-btn");
    if (topBtn) {
      topBtn.addEventListener("click", function () {
        if (!state.active) {
          if (state.data) show(state.data);
        } else {
          closeAllOverlays(false);
        }
      });
    }

    // 顶栏移动端「目录」按钮：在图谱模式下统一打开右侧/底部目录浮层
    var navToggle = $("pmv-nav-toggle");
    if (navToggle) {
      navToggle.addEventListener("click", function (e) {
        if (!state.active) return;
        e.stopImmediatePropagation();
        var side = $("pmv-side");
        if (side) side.classList.remove("is-open");
        if (state.dirOpen) closeDirOverlay(true);
        else openDirOverlay(navToggle, "list");
      }, true);
    }

    // 三段工具栏：宇宙 / 平面 2D / 目录
    var modeBox = $("mg-mode");
    if (modeBox) {
      modeBox.addEventListener("click", function (e) {
        var dirTrigger = e.target.closest('[data-action="directory"]');
        if (dirTrigger) {
          if (state.dirOpen) closeDirOverlay(true);
          else openDirOverlay(dirTrigger, "list");
          return;
        }
        var modeBtn = e.target.closest("[data-mode]");
        if (modeBtn) {
          setMode(modeBtn.getAttribute("data-mode"));
        }
      });
    }

    // 目录浮层内部交互：捕获阶段监听避免 memory-app.js 重绘 innerHTML 脱离节点后丢失目标
    var nav = $("pmv-nav");
    if (nav) {
      nav.addEventListener("click", function (e) {
        var item = e.target.closest("[data-section]");
        if (!item || !state.active) return;
        global.requestAnimationFrame(function () {
          setDirPane("doc");
          focusSafely($("mg-dir-back") || $("mg-dir-close"));
        });
      }, true);
    }

    var searchInput = $("pmv-search");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        if (!state.active) return;
        if (state.dirPane !== "list") setDirPane("list");
        global.requestAnimationFrame(updateDirCount);
      });
    }

    var dirBack = $("mg-dir-back");
    if (dirBack) {
      dirBack.addEventListener("click", function () {
        setDirPane("list");
        var activeItem = document.querySelector("#pmv-nav .pmv-nav-item.is-active");
        focusSafely(activeItem || $("pmv-search") || $("mg-dir-close"));
      });
    }

    var dirClose = $("mg-dir-close");
    if (dirClose) {
      dirClose.addEventListener("click", function () {
        closeDirOverlay(true);
      });
    }

    var reset = $("mg-reset");
    if (reset) {
      reset.addEventListener("click", resetCurrentView);
    }

    var detailClose = $("mg-detail-close");
    if (detailClose) {
      detailClose.addEventListener("click", function () {
        closeDetailOverlay(true, true);
      });
    }

    var legend = $("mg-legend");
    if (legend) {
      legend.addEventListener("click", function (e) {
        var item = e.target.closest(".mg-legend-item[data-cat]");
        var eng = engine();
        if (!item || !eng || !eng.focusCategory) return;
        var cat = item.getAttribute("data-cat");
        state.activeCat = eng.focusCategory(cat);
        syncLegendHighlight();
      });
    }

    // 点击视图空白区域关闭浮层（区分拖拽旋转与轻点空白）；2D 模式补充双击空白复位视角
    var stage = $("mg-stage");
    if (stage) {
      stage.addEventListener("pointerdown", function (e) {
        if (e.target.closest(".mg3d-label")) {
          state.stageTracking = false;
          return;
        }
        state.stageTracking = true;
        state.stageDownX = e.clientX;
        state.stageDownY = e.clientY;
      }, true);

      stage.addEventListener("pointerup", function (e) {
        if (!state.stageTracking) return;
        state.stageTracking = false;
        var moved = Math.hypot(e.clientX - state.stageDownX, e.clientY - state.stageDownY);
        if (moved < 8) {
          if (state.dirOpen) {
            closeDirOverlay(false);
          }
          if (e.target === stage && state.detailOpen) {
            closeDetailOverlay(false, true);
          }
        }
      }, true);

      stage.addEventListener("dblclick", function (e) {
        if (e.target.closest(".mg3d-label")) return;
        if (!isUniverseMode()) {
          resetCurrentView();
        }
      });
    }

    // 全局键盘交互：Tab 浮层焦点循环、Esc 三级优先级、R 键视角复位
    document.addEventListener("keydown", function (e) {
      if (!state.active) return;

      if (e.key === "Tab" && (state.dirOpen || state.detailOpen)) {
        handleOverlayTabTrap(e);
        return;
      }

      if (e.key === "Escape") {
        // 1. 先关浮层
        if (state.dirOpen) {
          e.preventDefault();
          closeDirOverlay(true);
          return;
        }
        if (state.detailOpen) {
          e.preventDefault();
          closeDetailOverlay(true, true);
          return;
        }
        // 2. 再取消选中 / 分区聚焦
        if (clearNodeAndCategorySelection()) {
          e.preventDefault();
          return;
        }
        // 3. 最后退出视图
        e.preventDefault();
        hide();
        return;
      }

      if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        resetCurrentView();
      }
    });

    var input = $("mg-file-input");
    if (input) {
      input.addEventListener("change", function (e) {
        if (!state.current || !e.target.files.length) return;
        var nodeId = state.current.id;
        global.MemoryFiles.add(nodeId, e.target.files).then(function () {
          if (state.current && state.current.id === nodeId) loadFiles(nodeId);
          e.target.value = "";
        }).catch(function (err) {
          alert("添加文件失败：" + err.message);
        });
      });
    }

    var list = $("mg-file-list");
    if (list) {
      list.addEventListener("click", function (e) {
        var node = state.current;
        if (!node) return;
        var dl = e.target.closest("[data-dl]");
        var rm = e.target.closest("[data-rm]");
        if (dl && global.MemoryFiles) {
          global.MemoryFiles.download(node.id, dl.getAttribute("data-dl")).catch(function (err) {
            alert(err.message);
          });
        } else if (rm && global.MemoryFiles) {
          if (!confirm("确定删除这个文件？（仅删除本机副本）")) return;
          global.MemoryFiles.remove(node.id, rm.getAttribute("data-rm")).then(function () {
            loadFiles(node.id);
          });
        }
      });
    }
  }

  function init(data) {
    state.data = data;
    state.mode = migrateAndReadMode();
    bind();
    syncModeButtons();
    // 解锁成功后直接进入宇宙图谱视图，无列表闪现
    show(data);
  }

  global.MemoryGraphView = {
    init: init,
    show: show,
    hide: hide,
    setMode: setMode,
    openDirectory: function () { openDirOverlay($("mg-dir-btn"), "list"); },
    closeOverlays: function () { closeAllOverlays(false); },
    isActive: function () { return state.active; }
  };
})(window);
