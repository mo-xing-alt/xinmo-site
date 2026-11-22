/* ============================================================
 * 私人记忆档案 · 图谱视图 UI 控制
 * 把解密后的数据交给 MemoryGraph 渲染，处理节点点击 → 详情展示、
 * 图例分区聚焦，并用 MemoryFiles 做每个节点的本地文件管理。
 * ============================================================ */
(function (global) {
  "use strict";

  var CAT_LABELS = { USER: "用户", MEMORY: "记忆索引", PROJECTS: "项目", TOPIC: "主题", PROMPT: "提示词", GUIDE: "指南" };
  var CAT_COLORS = { USER: "#fb7185", MEMORY: "#22d3ee", PROJECTS: "#2dd4bf", TOPIC: "#38bdf8", PROMPT: "#fbbf24", GUIDE: "#c084fc" };

  var state = { data: null, current: null, active: false, activeCat: null, bound: false };

  function $(id) { return document.getElementById(id); }

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
    if (!box) return;
    var cats = {};
    (state.data.sections || []).forEach(function (s) {
      var c = /指南|guide/i.test((s.id || "") + " " + (s.title || "")) ? "GUIDE" : (s.category || "TOPIC");
      cats[c] = (cats[c] || 0) + 1;
    });
    (state.data.prompts || []).forEach(function () { cats.PROMPT = (cats.PROMPT || 0) + 1; });
    box.innerHTML = Object.keys(cats).map(function (c) {
      var color = CAT_COLORS[c] || "#38bdf8";
      return '<button type="button" class="mg-legend-item" data-cat="' + escapeHtml(c) + '" title="点击聚焦该分区">'
        + '<i style="background:' + color + ';color:' + color + '"></i>'
        + '<span>' + escapeHtml(CAT_LABELS[c] || c) + ' ' + cats[c] + '</span></button>';
    }).join("");
    syncLegendHighlight();
  }

  function renderDetail(node) {
    state.current = node;
    if (node) {
      state.activeCat = null;
      syncLegendHighlight();
    }
    var detail = $("mg-detail");
    if (!node) { if (detail) detail.hidden = true; return; }
    if (detail) detail.hidden = false;

    var cat = node.category || "TOPIC";
    var catEl = $("mg-detail-cat");
    if (catEl) {
      catEl.textContent = CAT_LABELS[cat] || cat;
      catEl.style.background = CAT_COLORS[cat] || "#38bdf8";
    }
    var title = $("mg-detail-title");
    if (title) title.textContent = node.title;
    var meta = $("mg-detail-meta");
    if (meta) {
      var deg = node.degree || 0;
      meta.textContent = (node.kind === "prompt" ? "提示词" : "记忆章节") + (node.source ? " · " + node.source : "") + " · 关联 " + deg + " 条";
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
  }

  function loadFiles(nodeId) {
    var list = $("mg-file-list");
    if (!list) return;
    if (!global.MemoryFiles) { list.innerHTML = '<p class="mg-empty">文件组件未加载</p>'; return; }
    global.MemoryFiles.list(nodeId).then(function (files) {
      if (!files.length) {
        list.innerHTML = '<p class="mg-empty">还没有文件，点上方添加</p>';
        return;
      }
      list.innerHTML = files.map(function (f) {
        var eid = escapeHtml(f.id);
        return '<div class="mg-file-item">'
          + '<span class="mg-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</span>'
          + '<span class="mg-file-size">' + fmtSize(f.size) + '</span>'
          + '<button type="button" data-dl="' + eid + '" class="mg-file-btn" title="下载">↓</button>'
          + '<button type="button" data-rm="' + eid + '" class="mg-file-btn mg-file-rm" title="删除">×</button>'
          + '</div>';
      }).join("");
    }).catch(function (e) {
      list.innerHTML = '<p class="mg-empty">读取失败：' + escapeHtml(e.message) + '</p>';
    });
  }

  function show(data) {
    state.data = data;
    state.active = true;
    state.activeCat = null;
    var shell = document.querySelector(".pmv-shell");
    var gv = $("pmv-graph-view");
    if (shell) shell.hidden = true;
    if (gv) gv.hidden = false;

    var btn = $("pmv-graph-btn");
    if (btn) btn.textContent = "◈ 列表";

    var hint = gv && gv.querySelector(".mg-hint");
    if (hint) hint.textContent = "拖动画布/星球 · 滚轮缩放 · 点击聚焦";

    buildLegend();
    var loading = $("mg-loading");
    if (loading) {
      loading.textContent = "正在构建记忆图谱…";
      loading.style.display = "";
    }

    // 让 DOM 先显示再渲染（canvas 需要可见尺寸）
    setTimeout(function () {
      if (!state.active) return;
      var stage = $("mg-stage");
      var res = global.MemoryGraph && global.MemoryGraph.render(stage, data, renderDetail);
      if (loading) loading.style.display = "none";
      if (!res) return;
      if (loading) {
        loading.textContent = "星球 " + res.nodes + " · 关联 " + res.edges;
        loading.style.display = "";
        setTimeout(function () { if (loading) loading.style.display = "none"; }, 2200);
      }
    }, 60);
  }

  function hide() {
    state.active = false;
    state.activeCat = null;
    state.current = null;
    var shell = document.querySelector(".pmv-shell");
    var gv = $("pmv-graph-view");
    if (gv) gv.hidden = true;
    if (shell) shell.hidden = false;
    var btn = $("pmv-graph-btn");
    if (btn) btn.textContent = "◉ 图谱";
    var detail = $("mg-detail");
    if (detail) detail.hidden = true;
    global.MemoryGraph && global.MemoryGraph.destroy();
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;

    var btn = $("pmv-graph-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        if (state.active) hide();
        else if (state.data) show(state.data);
      });
    }
    var back = $("mg-back");
    if (back) back.addEventListener("click", hide);
    var reset = $("mg-reset");
    if (reset) {
      reset.addEventListener("click", function () {
        state.activeCat = null;
        syncLegendHighlight();
        global.MemoryGraph && global.MemoryGraph.resetView();
      });
    }
    var close = $("mg-detail-close");
    if (close) {
      close.addEventListener("click", function () {
        var d = $("mg-detail");
        if (d) d.hidden = true;
        state.current = null;
        global.MemoryGraph && global.MemoryGraph.clearSelection && global.MemoryGraph.clearSelection();
      });
    }

    var legend = $("mg-legend");
    if (legend) {
      legend.addEventListener("click", function (e) {
        var item = e.target.closest(".mg-legend-item[data-cat]");
        if (!item || !global.MemoryGraph || !global.MemoryGraph.focusCategory) return;
        var cat = item.getAttribute("data-cat");
        state.activeCat = global.MemoryGraph.focusCategory(cat);
        syncLegendHighlight();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (!state.active || e.key !== "Escape") return;
      var d = $("mg-detail");
      if (d && !d.hidden) {
        d.hidden = true;
        state.current = null;
        global.MemoryGraph && global.MemoryGraph.clearSelection && global.MemoryGraph.clearSelection();
      } else if (state.activeCat && global.MemoryGraph && global.MemoryGraph.focusCategory) {
        state.activeCat = global.MemoryGraph.focusCategory(null);
        syncLegendHighlight();
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
        }).catch(function (err) { alert("添加文件失败：" + err.message); });
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
          global.MemoryFiles.download(node.id, dl.getAttribute("data-dl")).catch(function (err) { alert(err.message); });
        } else if (rm && global.MemoryFiles) {
          if (!confirm("确定删除这个文件？（仅删除本机副本）")) return;
          global.MemoryFiles.remove(node.id, rm.getAttribute("data-rm")).then(function () { loadFiles(node.id); });
        }
      });
    }
  }

  function init(data) {
    state.data = data;
    bind();
  }

  global.MemoryGraphView = { init: init, show: show, hide: hide, isActive: function () { return state.active; } };
})(window);
