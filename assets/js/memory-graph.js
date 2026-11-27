// assets/js/memory-graph.js
/* ============================================================
 * 私人记忆档案 · 平面 2D 扁平科技星图引擎（2D 式前景 + 3D 同源银河动态背景）
 * ------------------------------------------------------------
 * 1. 纯正扁平 2D 星图式（2D 式）：
 *    - 顶视正交平面（纯正圆同心轨道、极坐标方位罗盘刻度、X/Y 测绘十字准线、2D 矢量连线脉冲）
 *    - 中心唯一主恒星「陌浔」（扁平 2D 日轮与旋转刻度环；缩小至银河全景时自动切换「◈ 陌浔」菱形准星）
 *    - 每个连通记忆皆为扁平 2D 行星节点（8 类扁平几何纹样 + 扁平同心光环 + 绕行微卫星点，支持 2D 自由拖拽节点）
 *    - 度 1 为扁平绕行天然卫星，度 0 为外环扁平黑洞（「· 孤立」）
 *    - 本恒星区域配置唯一一座扁平 2D 科技门户「◎ 星际虫洞 · 待接入」（双向旋转刻度约束环 + 测地虚线航道）
 * 2. 背景直接取自 3D 动态宇宙与倾斜旋臂银河星系环境（MemoryGraph3D envOnly 同源同步）：
 *    - 2D 平移与缩放实时同步驱动底层 3D 银河视口，缩小图与 3D 银河全景 100% 一致，凸显个人记忆总体之渺小
 *    - 若设备不支持 WebGL，自动启用内置 Canvas 2D 动态深空与旋臂银河兜底背景
 * 3. 严格保持 window.MemoryGraph 接口（render / renderBackground / buildModel / destroy /
 *    resetView / fitView / focusCategory / clearSelection / CATEGORY_LABELS）100% 兼容。
 * ============================================================ */
(function (global) {
  "use strict";

  var CATEGORY_LABELS = {
    USER: "用户",
    MEMORY: "记忆索引",
    PROJECTS: "项目",
    TOPIC: "主题",
    PROMPT: "提示词",
    GUIDE: "指南"
  };

  var CATEGORY_PALETTES = {
    USER: { hex: "#fb7185", atmo: [251, 113, 133], rim: [255, 205, 214], arm: [251, 146, 160] },
    MEMORY: { hex: "#22d3ee", atmo: [34, 211, 238], rim: [165, 243, 252], arm: [103, 232, 249] },
    PROJECTS: { hex: "#2dd4bf", atmo: [45, 212, 191], rim: [153, 246, 228], arm: [94, 234, 212] },
    TOPIC: { hex: "#38bdf8", atmo: [56, 189, 248], rim: [186, 230, 253], arm: [125, 211, 252] },
    PROMPT: { hex: "#fbbf24", atmo: [251, 191, 36], rim: [254, 240, 138], arm: [253, 214, 92] },
    GUIDE: { hex: "#c084fc", atmo: [192, 132, 252], rim: [233, 213, 255], arm: [216, 180, 254] }
  };
  var DEFAULT_PALETTE = CATEGORY_PALETTES.TOPIC;

  var SUN_NAME = "陌浔";
  var SUN_RADIUS = 42;
  var WORMHOLE_R = 28;
  var MIN_ZOOM = 0.028;
  var MAX_ZOOM = 4.80;
  var MAX_VISIBLE_LABELS = 26;

  /* 8 类扁平 2D 行星几何配色方案（纯正 2D 矢量扁平风，告别伪 3D 球体阴影） */
  var FLAT_PLANET_STYLES = [
    { name: "oceanic", base: "#0c4a6e", band1: "#0284c7", band2: "#10b981", cap: "#e0f2fe", rim: "#38bdf8", motif: "continents" },
    { name: "jovian", base: "#7c2d12", band1: "#d97706", band2: "#fde68a", cap: "#f97316", rim: "#fbbf24", motif: "stripes" },
    { name: "cryo", base: "#164e63", band1: "#22d3ee", band2: "#cffafe", cap: "#ffffff", rim: "#67e8f9", motif: "cracks" },
    { name: "martian", base: "#7f1d1d", band1: "#ea580c", band2: "#fdba74", cap: "#f8fafc", rim: "#fb923c", motif: "canyon" },
    { name: "volcanic", base: "#1e1b2e", band1: "#4c1d24", band2: "#f97316", cap: "#fde047", rim: "#fb7185", motif: "magma" },
    { name: "neptune", base: "#1e3a8a", band1: "#2563eb", band2: "#38bdf8", cap: "#bae6fd", rim: "#60a5fa", motif: "stripes" },
    { name: "archipelago", base: "#064e3b", band1: "#0d9488", band2: "#a7f3d0", cap: "#fef3c7", rim: "#2dd4bf", motif: "continents" },
    { name: "saturnian", base: "#581c87", band1: "#9333ea", band2: "#e9d5ff", cap: "#fde68a", rim: "#c084fc", motif: "stripes" }
  ];

  var state = {
    container: null,
    use3dEnv: false,
    bgCanvas: null,
    bgCtx: null,
    bgOwned: false,
    bgOnly: false,
    canvas: null,
    ctx: null,
    width: 1,
    height: 1,
    dpr: 1,

    nodes: [],
    edges: [],
    categories: [],
    anchors: {},
    neighborMap: {},
    wormhole: null,

    selected: null,
    hovered: null,
    sunHovered: false,
    whHovered: false,
    focusedSpecial: null,
    focusCategory: null,
    followFocus: false,
    followRightReserve: false,
    onSelect: null,

    cam: { x: 0, y: 0, scale: 0.36 },
    targetCam: null,

    running: false,
    raf: null,
    lastTs: 0,
    elapsed: 0,

    pointerDown: false,
    pointerId: null,
    dragNode: null,
    moved: false,
    downX: 0,
    downY: 0,
    lastX: 0,
    lastY: 0,
    pointers: {},
    pinchDist: 0,

    fallbackStars: [],
    reducedMotion: false,
    reduceMq: null,
    resizeTimer: null,
    listenersBound: false,
    toastTimer: 0
  };

  /* ============================================================
   * 工具函数
   * ============================================================ */
  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function fnv1a(str) {
    var s = String(str || "");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul ? Math.imul(h, 16777619) : ((h * 16777619) | 0);
    }
    return h >>> 0;
  }

  function hashFloat(str) {
    return (fnv1a(str) % 100000) / 100000;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul ? Math.imul(a ^ (a >>> 15), 1 | a) : ((a ^ (a >>> 15)) * (1 | a)) | 0;
      t = (t + (Math.imul ? Math.imul(t ^ (t >>> 7), 61 | t) : ((t ^ (t >>> 7)) * (61 | t)))) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rgbStr(rgb, alpha) {
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function showToast2D(msg) {
    if (global.MemoryGraph3D && global.MemoryGraph3D.showSpaceToast) {
      global.MemoryGraph3D.showSpaceToast(msg);
      return;
    }
    var toastEl = document.getElementById("pmv-toast");
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      state.toastTimer = 0;
      toastEl.classList.remove("is-visible");
    }, 3000);
  }

  /* ============================================================
   * 1. 节点文本相似度与图关系模型（100% 兼容 buildModel 供 3D 复用）
   * ============================================================ */
  function tokens(text) {
    var s = String(text || "").toLowerCase();
    var out = {};
    var words = s.match(/[a-z0-9_]{2,}/g) || [];
    for (var w = 0; w < words.length; w++) {
      out[words[w]] = (out[words[w]] || 0) + 1;
    }
    var zh = s.replace(/[^\u4e00-\u9fa5]/g, "");
    for (var i = 0; i < zh.length - 1; i++) {
      var g = zh.slice(i, i + 2);
      out[g] = (out[g] || 0) + 1;
    }
    return out;
  }

  function similarity(ta, tb) {
    var common = 0, na = 0, nb = 0, k;
    for (k in ta) {
      na += ta[k];
      if (tb[k]) common += Math.min(ta[k], tb[k]);
    }
    for (k in tb) nb += tb[k];
    if (!na || !nb) return 0;
    return (2 * common) / (na + nb);
  }

  /* 离屏缓存：扁平 2D 标签胶囊精灵 */
  var labelMeasureCtx = null;
  function buildFlatLabelSprite(title, tier, palette, active) {
    if (!labelMeasureCtx) {
      labelMeasureCtx = document.createElement("canvas").getContext("2d");
    }
    var raw = String(title || "未命名");
    var maxChars = tier === "satellite" ? 13 : 16;
    var shortTitle = raw.length > maxChars ? (raw.slice(0, maxChars - 1) + "…") : raw;
    var shown = tier === "blackhole" ? (shortTitle + " · 孤立") : shortTitle;

    var fontSize = tier === "satellite" ? 11 : 11.5;
    var fontStr = (active ? "600 " : "500 ") + fontSize + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    labelMeasureCtx.font = fontStr;
    var tw = Math.ceil(labelMeasureCtx.measureText(shown).width);

    var padL = 18, padR = 9, h = 21;
    var w = clamp(tw + padL + padR, 52, 224);
    var dpr = 2;
    var c = document.createElement("canvas");
    c.width = w * dpr;
    c.height = h * dpr;
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);

    roundRectPath(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 6);
    if (active) {
      ctx.fillStyle = "rgba(14, 165, 233, 0.94)";
      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = 1.2;
    } else {
      ctx.fillStyle = "rgba(5, 10, 24, 0.84)";
      ctx.strokeStyle = tier === "blackhole"
        ? "rgba(251, 191, 36, 0.55)"
        : rgbStr((palette && palette.atmo) || [56, 189, 248], 0.42);
      ctx.lineWidth = 1.0;
    }
    ctx.fill();
    ctx.stroke();

    var dotX = 9.5, dotY = h * 0.5;
    ctx.beginPath();
    ctx.arc(dotX, dotY, tier === "satellite" ? 2.1 : 2.7, 0, Math.PI * 2);
    ctx.fillStyle = active
      ? "#ffffff"
      : (tier === "blackhole" ? "#fbbf24" : ((palette && palette.hex) || "#38bdf8"));
    ctx.fill();

    ctx.font = fontStr;
    ctx.textBaseline = "middle";
    ctx.fillStyle = active ? "#ffffff" : (tier === "blackhole" ? "#fde68a" : (tier === "satellite" ? "#b6c8e0" : "#e8f3ff"));
    ctx.fillText(shown, padL, h * 0.5 + 0.5, w - padL - padR + 2);

    return { canvas: c, w: w, h: h };
  }

  function buildGraph(data, withVisuals) {
    var nodes = [];
    var sections = (data && data.sections) || [];
    var prompts = (data && data.prompts) || [];

    sections.forEach(function (s, idx) {
      var cat = s.category || "TOPIC";
      if (/指南|guide/i.test((s.id || "") + " " + (s.title || ""))) cat = "GUIDE";
      nodes.push({
        id: s.id || ("section-" + idx),
        title: s.title || "未命名",
        category: cat,
        content: s.markdown || "",
        source: s.source || "",
        kind: "section",
        degree: 0,
        cleanDeg: 0,
        cleanNeighbors: []
      });
    });

    prompts.forEach(function (p, i) {
      nodes.push({
        id: p.id || ("prompt-" + i),
        title: p.title || ("提示词" + (i + 1)),
        category: "PROMPT",
        content: p.text || p.copyText || "",
        source: p.source || "",
        kind: "prompt",
        degree: 0,
        cleanDeg: 0,
        cleanNeighbors: []
      });
    });

    var tokList = nodes.map(function (n) { return tokens(n.title + " " + n.content); });
    var edges = [];
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j];
        var sim = similarity(tokList[i], tokList[j]);
        var sameCat = a.category === b.category ? 0.06 : 0;
        var ref = 0;
        if (a.source && b.title && a.source.indexOf(b.title) >= 0) ref = 0.12;
        if (b.source && a.title && b.source.indexOf(a.title) >= 0) ref = 0.12;
        var w = sim + sameCat + ref;
        if (w >= 0.12) {
          edges.push({
            a: a, b: b, w: w,
            sameCategory: a.category === b.category,
            pulseT: hashFloat(a.id + "->" + b.id),
            pulseSpeed: 0.16 + hashFloat(b.id + "->" + a.id) * 0.18,
            synthetic: false
          });
          a.degree++; b.degree++;
          a.cleanDeg++; b.cleanDeg++;
          a.cleanNeighbors.push(b);
          b.cleanNeighbors.push(a);
        }
      }
    }

    /* 保留孤立节点弱兜底边（w:0.12, pulseSpeed:0.15），保证 3D normalizeModel 100% 兼容 */
    nodes.forEach(function (n, ni) {
      if (n.degree > 0 || nodes.length < 2) return;
      var cand = null, best = -1;
      nodes.forEach(function (m, mi) {
        if (m === n) return;
        var s = (m.category === n.category ? 0.1 : 0) + similarity(tokList[ni], tokList[mi]);
        if (s > best) { best = s; cand = m; }
      });
      if (cand) {
        edges.push({
          a: n, b: cand, w: 0.12,
          sameCategory: n.category === cand.category,
          pulseT: hashFloat(n.id + "->" + cand.id),
          pulseSpeed: 0.15,
          synthetic: true
        });
        n.degree++;
        cand.degree++;
      }
    });

    var preferredOrder = ["USER", "MEMORY", "PROJECTS", "TOPIC", "GUIDE", "PROMPT"];
    var catGroups = {};
    nodes.forEach(function (n) {
      if (!catGroups[n.category]) catGroups[n.category] = [];
      catGroups[n.category].push(n);
    });
    var categories = [];
    preferredOrder.forEach(function (c) {
      if (catGroups[c] && catGroups[c].length) categories.push(c);
    });
    Object.keys(catGroups).forEach(function (c) {
      if (categories.indexOf(c) < 0) categories.push(c);
    });

    var catCount = Math.max(categories.length, 1);
    var anchors = {};
    categories.forEach(function (cat, ci) {
      var ang = (ci / catCount) * Math.PI * 2 - Math.PI * 0.5;
      anchors[cat] = { x: Math.cos(ang) * 680, y: Math.sin(ang) * 680, angle: ang, index: ci };
    });

    var neighborMap = {};
    nodes.forEach(function (n) { neighborMap[n.id] = {}; });
    edges.forEach(function (e) {
      if (e.synthetic) return;
      neighborMap[e.a.id][e.b.id] = true;
      neighborMap[e.b.id][e.a.id] = true;
    });

    /* 扁平 2D 星图天体层级判定：恒星仅中心「陌浔」，每个连通记忆皆为扁平 2D 行星节点 */
    var planetList = [];
    nodes.forEach(function (n, idx) {
      n.palette = CATEGORY_PALETTES[n.category] || DEFAULT_PALETTE;
      n.seed = fnv1a(n.id);
      var rand = mulberry32(n.seed ^ 0x9e3779b9);
      n.dragOffsetX = 0;
      n.dragOffsetY = 0;

      if (n.cleanDeg === 0) {
        n.tier = "blackhole";
        n.radius = 23;
        n.orbitR = 795;
        n.baseAngle = 2.42;
        n.orbitSpeed = (Math.PI * 2) / 165;
      } else if (n.cleanDeg === 1) {
        n.tier = "satellite";
        n.radius = 8.5;
        n.hostNode = n.cleanNeighbors[0] || null;
        n.orbitR = 38 + rand() * 12;
        n.baseAngle = rand() * Math.PI * 2;
        n.orbitSpeed = ((Math.PI * 2) / (11 + rand() * 6)) * (rand() > 0.5 ? 1 : -1);
      } else {
        n.tier = "planet";
        n.radius = clamp(12.5 + Math.sqrt(n.cleanDeg - 1) * 2.4, 13.5, 22.5);
        n.flatStyle = FLAT_PLANET_STYLES[(n.seed + idx * 3) % FLAT_PLANET_STYLES.length];
        n.hasRing = n.cleanDeg >= 6 || (hashFloat(n.id + ":2dring") < 0.34);
        n.moonPhase = rand() * Math.PI * 2;
        n.moonSpeed = (0.55 + rand() * 0.45) * (idx % 2 === 0 ? 1 : -1);
        planetList.push(n);
      }

      if (withVisuals) {
        n.labelSprite = buildFlatLabelSprite(n.title, n.tier, n.palette, false);
        n.labelActiveSprite = buildFlatLabelSprite(n.title, n.tier, n.palette, true);
      }
    });

    /* 为所有 2D 行星分配无碰撞纯正圆同心轨道（R = 165 ~ 705）与分类扇区相位，默认视口尽览完整 360° 星盘 */
    planetList.sort(function (a, b) {
      var sa = (a.seed % 997) + (a.cleanDeg >= 6 ? -160 : 0);
      var sb = (b.seed % 997) + (b.cleanDeg >= 6 ? -160 : 0);
      return sa - sb;
    });
    var pTotal = Math.max(1, planetList.length);
    planetList.forEach(function (pl, pIdx) {
      var rand = mulberry32(pl.seed ^ 0x5bd1e995);
      var anc = anchors[pl.category] || { angle: 0 };
      var frac = pTotal > 1 ? (pIdx / (pTotal - 1)) : 0.45;
      pl.orbitR = 165 + frac * 540;
      var period = clamp(32.0 * Math.pow(pl.orbitR / 360, 1.28), 20.0, 118.0);
      pl.orbitSpeed = ((Math.PI * 2) / period) * (rand() > 0.12 ? 1 : -1);
      pl.baseAngle = anc.angle + (rand() - 0.5) * 1.12 + pIdx * 0.44;
    });

    /* 本恒星区域唯一 2D 科技门户：星际虫洞 */
    var wh = {
      orbitR: 745,
      baseAngle: -0.56,
      orbitSpeed: (Math.PI * 2) / 190.0,
      radius: WORMHOLE_R,
      x: Math.cos(-0.56) * 745,
      y: Math.sin(-0.56) * 745
    };

    return {
      nodes: nodes,
      edges: edges,
      categories: categories,
      anchors: anchors,
      neighborMap: neighborMap,
      wormhole: wh
    };
  }

  function update2DPositions(t, dt) {
    var animT = state.reducedMotion ? 0 : t;
    var decay = dt > 0 ? Math.pow(0.38, dt) : 1;

    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      if (n.tier === "satellite") continue;
      var ang = n.baseAngle + animT * n.orbitSpeed;
      var bx = Math.cos(ang) * n.orbitR;
      var by = Math.sin(ang) * n.orbitR;
      if (n !== state.dragNode) {
        n.dragOffsetX *= decay;
        n.dragOffsetY *= decay;
      }
      n.x = bx + n.dragOffsetX;
      n.y = by + n.dragOffsetY;
    }

    for (var s = 0; s < state.nodes.length; s++) {
      var sat = state.nodes[s];
      if (sat.tier !== "satellite") continue;
      var hx = sat.hostNode ? sat.hostNode.x : 0;
      var hy = sat.hostNode ? sat.hostNode.y : 0;
      var sAng = sat.baseAngle + animT * sat.orbitSpeed;
      if (sat !== state.dragNode) {
        sat.dragOffsetX *= decay;
        sat.dragOffsetY *= decay;
      }
      sat.x = hx + Math.cos(sAng) * sat.orbitR + sat.dragOffsetX;
      sat.y = hy + Math.sin(sAng) * sat.orbitR + sat.dragOffsetY;
    }

    if (state.wormhole) {
      var wAng = state.wormhole.baseAngle + animT * state.wormhole.orbitSpeed;
      state.wormhole.x = Math.cos(wAng) * state.wormhole.orbitR;
      state.wormhole.y = Math.sin(wAng) * state.wormhole.orbitR;
    }
  }

  /* ============================================================
   * 2. 无 WebGL 环境时的兜底深空星场（平时由 3D 银河环境实时承担背景）
   * ============================================================ */
  function initFallbackStars(w, h) {
    var rand = mulberry32(0x80f041ec ^ ((w * 31) + h));
    var list = [];
    for (var i = 0; i < 420; i++) {
      var mag = Math.pow(rand(), 2.2);
      list.push({
        x: rand() * w,
        y: rand() * h,
        r: 0.5 + mag * 1.4,
        a: 0.25 + mag * 0.72,
        col: i % 5 === 0 ? "147,197,253" : (i % 7 === 0 ? "253,186,116" : "248,250,252")
      });
    }
    state.fallbackStars = list;
  }

  function drawFallbackBackground(t) {
    if (!state.bgCtx || state.use3dEnv) return;
    var ctx = state.bgCtx;
    var w = state.width, h = state.height;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    var g = ctx.createRadialGradient(w * 0.45, h * 0.52, 0, w * 0.45, h * 0.52, Math.max(w, h) * 0.8);
    g.addColorStop(0, "#0b132b");
    g.addColorStop(0.55, "#050816");
    g.addColorStop(1, "#020308");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < state.fallbackStars.length; i++) {
      var st = state.fallbackStars[i];
      ctx.fillStyle = "rgba(" + st.col + "," + st.a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 兜底 2D 星系（柔和维和星云云团 + 丰盈星辰与陨石碎屑 + 更宏大且自然融入核球的中心黑洞，零生硬外圈） */
    ctx.save();
    ctx.translate(w * 0.46, h * 0.54);
    var R = Math.min(w, h) * 0.52;
    var animT = state.reducedMotion ? 0 : (t || 0);

    // 1) 外盘星云云海与暖金棒状核球
    ctx.save();
    ctx.rotate(-0.42);
    ctx.scale(1, 0.62);
    var galG = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    galG.addColorStop(0, "rgba(255, 232, 188, 0.46)");
    galG.addColorStop(0.20, "rgba(246, 182, 114, 0.30)");
    galG.addColorStop(0.46, "rgba(116, 108, 206, 0.16)");
    galG.addColorStop(0.76, "rgba(56, 126, 236, 0.09)");
    galG.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = galG;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // 柔和多层星云团与暗尘雾（无任何生硬圆环）
    for (var nc = 0; nc < 18; nc++) {
      var nAng = (nc / 18) * Math.PI * 2 + animT * 0.015;
      var nRad = R * (0.14 + ((nc * 29) % 70) / 100);
      var nx = Math.cos(nAng) * nRad;
      var ny = Math.sin(nAng) * nRad;
      var nr = R * (0.09 + (nc % 4) * 0.032);
      var ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      if (nc % 4 === 0) {
        ng.addColorStop(0, "rgba(244, 114, 182, 0.14)");
        ng.addColorStop(1, "rgba(244, 114, 182, 0)");
      } else if (nc % 4 === 1) {
        ng.addColorStop(0, "rgba(58, 22, 14, 0.22)");
        ng.addColorStop(1, "rgba(58, 22, 14, 0)");
      } else {
        ng.addColorStop(0, "rgba(96, 165, 250, 0.16)");
        ng.addColorStop(1, "rgba(96, 165, 250, 0)");
      }
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 棒状高密度老年恒星核球
    ctx.save();
    ctx.scale(1.62, 0.56);
    var barG = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.28);
    barG.addColorStop(0, "rgba(255, 240, 206, 0.58)");
    barG.addColorStop(0.45, "rgba(245, 180, 96, 0.30)");
    barG.addColorStop(1, "rgba(245, 180, 96, 0)");
    ctx.fillStyle = barG;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 致密核星团、星辰与陨石微粒点缀（零圆球行星）
    for (var ns = 0; ns < 92; ns++) {
      var na = (ns / 92) * Math.PI * 2 + animT * (ns % 5 === 0 ? 0.08 : 0.025);
      var nr = R * (0.055 + ((ns * 37) % 100) / 100 * 0.62);
      var sx = Math.cos(na) * nr;
      var sy = Math.sin(na) * nr;
      if (ns % 4 === 0) {
        // 细碎不规则陨石微粒
        ctx.fillStyle = "rgba(180, 162, 146, 0.52)";
        ctx.fillRect(sx - 1.1, sy - 0.8, 2.2, 1.5);
      } else {
        ctx.fillStyle = ns % 3 === 0 ? "rgba(186, 230, 253, 0.78)" : (ns % 5 === 0 ? "rgba(249, 168, 212, 0.68)" : "rgba(254, 236, 192, 0.78)");
        ctx.beginPath();
        ctx.arc(sx, sy, ns % 7 === 0 ? 1.55 : 1.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 2) 极淡雾状极向星际等离子体羽雾（彻底去除刺眼激光柱）
    ctx.save();
    ctx.rotate(-0.42 + Math.PI * 0.5);
    for (var jd = -1; jd <= 1; jd += 2) {
      var jg = ctx.createLinearGradient(0, jd * R * 0.04, 0, jd * R * 0.24);
      jg.addColorStop(0, "rgba(245, 200, 140, 0.16)");
      jg.addColorStop(0.45, "rgba(139, 132, 236, 0.10)");
      jg.addColorStop(1, "rgba(139, 92, 246, 0)");
      ctx.fillStyle = jg;
      ctx.beginPath();
      ctx.moveTo(-R * 0.012, jd * R * 0.036);
      ctx.lineTo(R * 0.012, jd * R * 0.036);
      ctx.lineTo(R * 0.042, jd * R * 0.24);
      ctx.lineTo(-R * 0.042, jd * R * 0.24);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 3) 更宏大且柔和融入环境的中心超大质量黑洞（无生硬白线外圈）
    ctx.save();
    ctx.rotate(-0.42);
    ctx.scale(1, 0.62);
    var accG = ctx.createRadialGradient(0, 0, R * 0.026, 0, 0, R * 0.115);
    accG.addColorStop(0, "rgba(255, 238, 198, 0.82)");
    accG.addColorStop(0.28, "rgba(246, 152, 62, 0.48)");
    accG.addColorStop(0.68, "rgba(176, 72, 28, 0.16)");
    accG.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = accG;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.115, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var bhHalo = ctx.createRadialGradient(0, 0, R * 0.025, 0, 0, R * 0.056);
    bhHalo.addColorStop(0, "rgba(255, 228, 168, 0.68)");
    bhHalo.addColorStop(0.45, "rgba(236, 138, 56, 0.26)");
    bhHalo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bhHalo;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.056, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#040208";
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.030, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* ============================================================
   * 3. 2D 视口同步与扁平科技星图绘制（纯正 2D 式）
   * ============================================================ */
  function worldToScreen(wx, wy) {
    return {
      x: wx * state.cam.scale + state.cam.x,
      y: wy * state.cam.scale + state.cam.y
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - state.cam.x) / state.cam.scale,
      y: (sy - state.cam.y) / state.cam.scale
    };
  }

  function isNodeHighlighted(n) {
    var active = state.hovered || state.selected;
    if (active) {
      if (n === active) return 2;
      if (state.neighborMap[active.id] && state.neighborMap[active.id][n.id]) return 1;
      return 0;
    }
    if (state.focusCategory) {
      return n.category === state.focusCategory ? 2 : 0;
    }
    return 1;
  }

  /* 绘制扁平 2D 极坐标测绘网格、正圆公转轨与方位角刻度 */
  function drawFlatPolarGridAndOrbits(ctx, t, fade, ambientDim) {
    var invScale = 1 / Math.max(0.18, state.cam.scale);
    ctx.save();

    /* 1. 正交测绘十字准线 */
    ctx.strokeStyle = "rgba(56, 189, 248, " + (0.085 * fade * ambientDim).toFixed(3) + ")";
    ctx.lineWidth = 1.0 * invScale;
    ctx.setLineDash([7 * invScale, 7 * invScale]);
    ctx.beginPath();
    ctx.moveTo(-895, 0); ctx.lineTo(895, 0);
    ctx.moveTo(0, -895); ctx.lineTo(0, 895);
    ctx.stroke();
    ctx.setLineDash([]);

    /* 2. 主同心正圆测距环与外圈 360° 罗盘刻度 */
    var majorRings = [180, 360, 550, 745, 835];
    for (var ri = 0; ri < majorRings.length; ri++) {
      var rr = majorRings[ri];
      var isOuter = (ri === majorRings.length - 1);
      var isWhRing = (ri === 3);
      ctx.strokeStyle = isWhRing
        ? "rgba(34, 211, 238, " + (0.18 * fade * ambientDim).toFixed(3) + ")"
        : "rgba(125, 211, 252, " + ((isOuter ? 0.18 : 0.09) * fade * ambientDim).toFixed(3) + ")";
      ctx.lineWidth = (isOuter ? 1.25 : 0.9) * invScale;
      if (isWhRing) ctx.setLineDash([5 * invScale, 6 * invScale]);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      if (isWhRing) ctx.setLineDash([]);
    }

    var outerR = 835;
    ctx.strokeStyle = "rgba(56, 189, 248, " + (0.26 * fade * ambientDim).toFixed(3) + ")";
    ctx.lineWidth = 1.0 * invScale;
    ctx.beginPath();
    for (var deg = 0; deg < 360; deg += 5) {
      var rad = (deg * Math.PI) / 180;
      var tickLen = (deg % 90 === 0) ? 20 : ((deg % 30 === 0) ? 12 : 6);
      ctx.moveTo(Math.cos(rad) * (outerR - tickLen * 0.5), Math.sin(rad) * (outerR - tickLen * 0.5));
      ctx.lineTo(Math.cos(rad) * (outerR + tickLen * 0.5), Math.sin(rad) * (outerR + tickLen * 0.5));
    }
    ctx.stroke();

    if (state.cam.scale > 0.22) {
      ctx.fillStyle = "rgba(125, 211, 252, " + (0.55 * fade * ambientDim).toFixed(3) + ")";
      ctx.font = "600 " + Math.round(10 * invScale) + 'px "SFMono-Regular",Consolas,monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("000°", outerR + 30, 0);
      ctx.fillText("090°", 0, outerR + 22);
      ctx.fillText("180°", -outerR - 30, 0);
      ctx.fillText("270°", 0, -outerR - 22);
    }

    /* 3. 行星各自的正圆细轨道线 */
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      if (n.tier !== "planet") continue;
      var isSel = (n === state.selected || n === state.hovered);
      var inCat = (state.focusCategory && n.category === state.focusCategory);
      var op = isSel ? 0.36 : (inCat ? 0.18 : 0.042 * ambientDim);
      ctx.strokeStyle = rgbStr(n.palette.atmo, op * fade);
      ctx.lineWidth = (isSel ? 1.3 : 0.75) * invScale;
      ctx.beginPath();
      ctx.arc(0, 0, n.orbitR, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* 4. 中心恒星「陌浔」通往唯一「星际虫洞」的扁平测地虚线航道 */
    if (state.wormhole) {
      var wx = state.wormhole.x, wy = state.wormhole.y;
      var wDist = Math.hypot(wx, wy) || 1;
      var ux = wx / wDist, uy = wy / wDist;
      var whActive = (state.whHovered || state.focusedSpecial === "wormhole");
      ctx.save();
      ctx.strokeStyle = "rgba(34, 211, 238, " + ((whActive ? 0.65 : 0.28) * fade).toFixed(3) + ")";
      ctx.lineWidth = (whActive ? 1.8 : 1.2) * invScale;
      ctx.setLineDash([7 * invScale, 6 * invScale]);
      ctx.lineDashOffset = -(state.reducedMotion ? 0 : t * 28);
      ctx.beginPath();
      ctx.moveTo(ux * (SUN_RADIUS * 1.65), uy * (SUN_RADIUS * 1.65));
      ctx.lineTo(ux * (wDist - WORMHOLE_R * 1.85), uy * (wDist - WORMHOLE_R * 1.85));
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  /* 绘制扁平 2D 中心主恒星「陌浔」 */
  function drawFlatSunMoxun(ctx, t, fade) {
    var animT = state.reducedMotion ? 0 : t;
    var invScale = 1 / Math.max(0.20, state.cam.scale);
    ctx.save();

    /* 柔和扁平日冕光晕 */
    var glowR = SUN_RADIUS * 2.8;
    var g = ctx.createRadialGradient(0, 0, SUN_RADIUS * 0.4, 0, 0, glowR);
    g.addColorStop(0, "rgba(254, 243, 199, " + (0.85 * fade).toFixed(3) + ")");
    g.addColorStop(0.32, "rgba(251, 191, 36, " + (0.42 * fade).toFixed(3) + ")");
    g.addColorStop(0.68, "rgba(245, 158, 11, " + (0.12 * fade).toFixed(3) + ")");
    g.addColorStop(1, "rgba(245, 158, 11, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    /* 外围反向旋转科技测绘刻度环 */
    ctx.save();
    ctx.rotate(animT * 0.14);
    ctx.strokeStyle = "rgba(56, 189, 248, " + (0.52 * fade).toFixed(3) + ")";
    ctx.lineWidth = 1.3 * invScale;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS * 1.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.rotate(-animT * 0.22);
    ctx.strokeStyle = "rgba(251, 191, 36, " + (0.66 * fade).toFixed(3) + ")";
    ctx.lineWidth = 1.5 * invScale;
    for (var k = 0; k < 4; k++) {
      var a0 = (k * Math.PI) / 2 + 0.22;
      ctx.beginPath();
      ctx.arc(0, 0, SUN_RADIUS * 1.18, a0, a0 + 0.95);
      ctx.stroke();
    }
    ctx.restore();

    /* 扁平三层同心日轮（外色球环 -> 金黄对流盘 -> 炽白日核） */
    ctx.fillStyle = "#ea580c";
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS * 0.86, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fef9c3";
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS * 0.54, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 1.8 * invScale;
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /* 绘制扁平 2D 唯一爱因斯坦-罗森星际虫洞门户 */
  function drawFlatWormhole2D(ctx, wh, t, fade) {
    if (!wh) return;
    var animT = state.reducedMotion ? 0 : t;
    var invScale = 1 / Math.max(0.22, state.cam.scale);
    var r = wh.radius;
    var isAct = (state.whHovered || state.focusedSpecial === "wormhole");

    ctx.save();
    ctx.translate(wh.x, wh.y);
    if (isAct) ctx.scale(1.10, 1.10);

    /* 外层青蓝光晕 */
    var halo = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.3);
    halo.addColorStop(0, "rgba(34, 211, 238, " + (0.38 * fade).toFixed(3) + ")");
    halo.addColorStop(0.55, "rgba(129, 140, 248, " + (0.18 * fade).toFixed(3) + ")");
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.3, 0, Math.PI * 2);
    ctx.fill();

    /* 两层反向旋转扁平科技约束环 */
    ctx.save();
    ctx.rotate(animT * 0.55);
    ctx.strokeStyle = "rgba(34, 211, 238, " + (0.85 * fade).toFixed(3) + ")";
    ctx.lineWidth = 1.8 * invScale;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.rotate(-animT * 0.78);
    ctx.strokeStyle = "rgba(165, 180, 252, " + (0.78 * fade).toFixed(3) + ")";
    ctx.lineWidth = 1.4 * invScale;
    for (var s = 0; s < 3; s++) {
      var sa = (s * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.24, sa, sa + 1.35);
      ctx.stroke();
    }
    ctx.restore();

    /* 扁平深空门户虹膜 + 螺旋相位线 */
    ctx.fillStyle = "#061029";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(-animT * 0.9);
    ctx.strokeStyle = "rgba(56, 189, 248, " + (0.55 * fade).toFixed(3) + ")";
    ctx.lineWidth = 1.3;
    for (var k = 0; k < 6; k++) {
      var ka = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(ka + 0.7) * r * 0.65, Math.sin(ka + 0.7) * r * 0.65, Math.cos(ka + 1.3) * r, Math.sin(ka + 1.3) * r);
      ctx.stroke();
    }
    ctx.restore();

    /* 中心奇点环与光子切伦科夫亮边 */
    ctx.strokeStyle = "#67e8f9";
    ctx.lineWidth = 2.2 * invScale;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#e0f7ff";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* 绘制扁平 2D 行星 / 卫星 / 孤立黑洞节点（纯正 2D 矢量图形风格） */
  function drawFlatNode2D(ctx, n, t, dim, fade) {
    var animT = state.reducedMotion ? 0 : t;
    var invScale = 1 / Math.max(0.25, state.cam.scale);
    var r = n.radius;
    var alpha = dim * fade;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (n.tier === "blackhole") {
      /* 扁平 2D 孤立黑洞：双层旋转琥珀虚线吸积环 + 纯黑视界圆 + 锐利金白光子环 */
      ctx.save();
      ctx.rotate(animT * 0.45);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.72)";
      ctx.lineWidth = 2.2 * invScale;
      ctx.setLineDash([9, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = 2.0 * invScale;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.04, 0, Math.PI * 2);
      ctx.stroke();

    } else if (n.tier === "satellite") {
      /* 扁平 2D 天然卫星圆点 */
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(-r * 0.24, -r * 0.22, r * 0.58, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = n.palette.hex;
      ctx.lineWidth = 1.4 * invScale;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

    } else {
      /* 扁平 2D 行星节点：8 类扁平矢量纹样 + 同心扁平光环 + 绕行微卫星点 */
      var st = n.flatStyle;

      if (n.hasRing) {
        ctx.strokeStyle = rgbStr(n.palette.atmo, 0.52);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.52, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(226, 232, 240, 0.30)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.74, 0, Math.PI * 2);
        ctx.stroke();
      }

      /* 绕行微卫星小圆点 */
      var mAng = n.moonPhase + animT * n.moonSpeed;
      var mOrb = n.hasRing ? r * 1.98 : r * 1.56;
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(Math.cos(mAng) * mOrb, Math.sin(mAng) * mOrb, 2.3, 0, Math.PI * 2);
      ctx.fill();

      /* 行星扁平圆盘主体（内部矢量裁剪） */
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = st.base;
      ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);

      var tilt = ((n.seed % 7) - 3) * 0.14;
      ctx.rotate(tilt);

      if (st.motif === "stripes") {
        ctx.fillStyle = st.band1;
        ctx.fillRect(-r, -r * 0.56, r * 2, r * 0.36);
        ctx.fillRect(-r, r * 0.14, r * 2, r * 0.34);
        ctx.fillStyle = st.band2;
        ctx.fillRect(-r, -r * 0.14, r * 2, r * 0.22);
      } else if (st.motif === "continents") {
        ctx.fillStyle = st.band1;
        ctx.beginPath();
        ctx.arc(-r * 0.28, -r * 0.12, r * 0.62, 0, Math.PI * 2);
        ctx.arc(r * 0.42, r * 0.28, r * 0.46, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = st.band2;
        ctx.beginPath();
        ctx.arc(-r * 0.22, -r * 0.15, r * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = st.cap;
        ctx.fillRect(-r, -r, r * 2, r * 0.24);
      } else if (st.motif === "cracks") {
        ctx.fillStyle = st.band1;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = st.band2;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.35); ctx.lineTo(r, r * 0.40);
        ctx.moveTo(-r * 0.55, r); ctx.lineTo(r * 0.65, -r);
        ctx.stroke();
      } else if (st.motif === "magma") {
        ctx.strokeStyle = st.band2;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.52, 0.2, 2.5);
        ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, r * 0.25);
        ctx.stroke();
        ctx.fillStyle = st.cap;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.20, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = st.band1;
        ctx.fillRect(-r, -r * 0.32, r * 2, r * 0.68);
        ctx.fillStyle = st.cap;
        ctx.fillRect(-r, -r, r * 2, r * 0.22);
        ctx.fillRect(-r, r * 0.78, r * 2, r * 0.22);
      }
      ctx.restore();

      /* 扁平高对比分类描边外圈 */
      ctx.strokeStyle = n.palette.hex;
      ctx.lineWidth = 1.8 * Math.min(1.4, invScale);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGraph2D(t, dt) {
    var ctx = state.ctx;
    if (!ctx) return;

    var w = state.width, h = state.height;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    update2DPositions(t, dt);

    /* 若正在对焦某颗 2D 行星或星际虫洞，平滑跟随其圆周轨道位置 */
    if (state.followFocus && state.use3dEnv && global.MemoryGraph3D && global.MemoryGraph3D.focus2DPoint) {
      var rightRes = state.followRightReserve && state.width > 740 ? Math.min(420, state.width * 0.34) : 0;
      if (state.selected) {
        global.MemoryGraph3D.focus2DPoint(state.selected.x, state.selected.y, null, rightRes);
      } else if (state.focusedSpecial === "wormhole" && state.wormhole) {
        global.MemoryGraph3D.focus2DPoint(state.wormhole.x, state.wormhole.y, null, 0);
      }
    }

    /* 若启用 3D 同源银河环境，每帧读取 (0,0,0) 旋臂坐标投影点实现 0 误差像素同步 */
    if (state.use3dEnv && global.MemoryGraph3D && global.MemoryGraph3D.getEnvProjection) {
      var proj = global.MemoryGraph3D.getEnvProjection();
      if (proj && !proj.behind) {
        state.cam.x = proj.x;
        state.cam.y = proj.y;
        state.cam.scale = proj.scale;
      }
    } else if (state.targetCam) {
      var k = 1 - Math.exp(-dt * 8.5);
      state.cam.x = lerp(state.cam.x, state.targetCam.x, k);
      state.cam.y = lerp(state.cam.y, state.targetCam.y, k);
      state.cam.scale = lerp(state.cam.scale, state.targetCam.scale, k);
      if (
        Math.abs(state.cam.x - state.targetCam.x) < 0.4 &&
        Math.abs(state.cam.y - state.targetCam.y) < 0.4 &&
        Math.abs(state.cam.scale - state.targetCam.scale) < 0.001
      ) {
        state.cam.x = state.targetCam.x;
        state.cam.y = state.targetCam.y;
        state.cam.scale = state.targetCam.scale;
        state.targetCam = null;
      }
    }

    /* 随镜头缩小至银河全景（scale < 0.16）平滑渐隐行星系局部网格与标签，凸显旋臂上的「◈ 陌浔」渺小尺度 */
    var stellarFade = smoothstep(0.065, 0.175, state.cam.scale);
    var active = state.hovered || state.selected;
    var ambientDim = (active || state.focusCategory) ? 0.42 : 1.0;

    if (stellarFade > 0.01) {
      ctx.save();
      ctx.translate(state.cam.x, state.cam.y);
      ctx.scale(state.cam.scale, state.cam.scale);

      /* 1. 扁平 2D 极坐标罗盘、正圆轨道与虫洞测地虚线 */
      drawFlatPolarGridAndOrbits(ctx, t, stellarFade, ambientDim);

      /* 2. 扁平 2D 记忆关联连线与光脉冲数据包 */
      var invScale = 1 / Math.max(0.25, state.cam.scale);
      for (var ei = 0; ei < state.edges.length; ei++) {
        var e = state.edges[ei];
        if (e.synthetic) continue;
        var ea = e.a, eb = e.b;
        var linked = active && (ea === active || eb === active);
        var inFocusCat = state.focusCategory && ea.category === state.focusCategory && eb.category === state.focusCategory;

        var lineAlpha, lineWidth, strokeColor;
        if (active) {
          if (linked) {
            lineAlpha = 0.80 * stellarFade;
            lineWidth = 1.6 * invScale;
            strokeColor = e.sameCategory ? rgbStr(active.palette.atmo, lineAlpha) : "rgba(103, 232, 249, " + lineAlpha.toFixed(3) + ")";
          } else {
            lineAlpha = 0.03 * stellarFade;
            lineWidth = 0.7 * invScale;
            strokeColor = "rgba(148, 163, 184, " + lineAlpha.toFixed(3) + ")";
          }
        } else if (state.focusCategory) {
          lineAlpha = (inFocusCat ? 0.44 : 0.035) * stellarFade;
          lineWidth = (inFocusCat ? 1.3 : 0.7) * invScale;
          strokeColor = inFocusCat
            ? rgbStr((CATEGORY_PALETTES[state.focusCategory] || DEFAULT_PALETTE).atmo, lineAlpha)
            : "rgba(148, 163, 184, " + lineAlpha.toFixed(3) + ")";
        } else {
          lineAlpha = (e.sameCategory ? clamp(0.08 + e.w * 0.24, 0.08, 0.22) : clamp(0.045 + e.w * 0.15, 0.045, 0.13)) * stellarFade;
          lineWidth = (e.sameCategory ? 1.0 : 0.75) * Math.min(1.8, invScale);
          strokeColor = e.sameCategory
            ? rgbStr(ea.palette.atmo, lineAlpha)
            : "rgba(148, 182, 224, " + lineAlpha.toFixed(3) + ")";
        }

        ctx.beginPath();
        ctx.moveTo(ea.x, ea.y);
        ctx.lineTo(eb.x, eb.y);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        if (!state.reducedMotion && (linked || inFocusCat)) {
          e.pulseT = (e.pulseT + dt * e.pulseSpeed) % 1;
          var px = ea.x + (eb.x - ea.x) * e.pulseT;
          var py = ea.y + (eb.y - ea.y) * e.pulseT;
          ctx.fillStyle = "rgba(224, 247, 255, " + (0.95 * stellarFade).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(px, py, 2.4 * Math.min(1.6, invScale), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* 3. 度 1 卫星绕宿主行星的正圆虚线轨 */
      for (var si = 0; si < state.nodes.length; si++) {
        var sn = state.nodes[si];
        if (sn.tier !== "satellite" || !sn.hostNode) continue;
        var sDim = isNodeHighlighted(sn) === 0 ? 0.18 : 0.60;
        ctx.save();
        ctx.translate(sn.hostNode.x, sn.hostNode.y);
        ctx.strokeStyle = "rgba(148, 163, 184, " + (0.34 * sDim * stellarFade).toFixed(3) + ")";
        ctx.lineWidth = 0.85 * invScale;
        ctx.setLineDash([4 * invScale, 4 * invScale]);
        ctx.beginPath();
        ctx.arc(0, 0, sn.orbitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* 4. 扁平 2D 中心主恒星「陌浔」与唯一「星际虫洞」 */
      drawFlatSunMoxun(ctx, t, Math.max(stellarFade, 0.35));
      drawFlatWormhole2D(ctx, state.wormhole, t, stellarFade);

      /* 5. 扁平 2D 行星 / 卫星 / 孤立黑洞节点 */
      var animT = state.reducedMotion ? 0 : t;
      for (var pass = 0; pass < 2; pass++) {
        for (var ni = 0; ni < state.nodes.length; ni++) {
          var n = state.nodes[ni];
          var hl = isNodeHighlighted(n);
          var isTop = (hl === 2);
          if ((pass === 0 && isTop) || (pass === 1 && !isTop)) continue;

          var dim = hl === 0 ? 0.22 : 1.0;
          var isSel = (n === state.selected);
          var isHov = (n === state.hovered);
          var sc = isSel ? 1.16 : (isHov ? 1.08 : 1.0);

          ctx.save();
          ctx.translate(n.x, n.y);
          if (sc !== 1) ctx.scale(sc, sc);

          drawFlatNode2D(ctx, n, t, dim, stellarFade);

          if (isSel || isHov) {
            ctx.strokeStyle = isSel ? "#fde68a" : "#67e8f9";
            ctx.lineWidth = 1.5 * Math.min(1.6, invScale);
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, n.radius + 7, animT * 0.6, animT * 0.6 + Math.PI * 2);
            ctx.stroke();
          }

          ctx.restore();
        }
      }

      ctx.restore();
    } else {
      /* 银河全景极小比例尺下保留「陌浔」旋臂微金星光点 */
      ctx.save();
      ctx.fillStyle = "#fde68a";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(state.cam.x, state.cam.y, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawFlatScreenLabels(ctx, w, h, stellarFade, t);
  }

  /* 屏幕空间 2D 标签与银河全景「◈ 陌浔」菱形科技准星绘制 */
  function drawFlatScreenLabels(ctx, w, h, stellarFade, t) {
    var sunSc = worldToScreen(0, 0);
    var isGalacticPin = state.cam.scale < 0.145;
    var placed = [{ x: 8, y: h - 94, w: 325, h: 90 }];

    /* 1. 恒星「陌浔」近景铭牌 / 银河全景菱形科技准星 */
    if (sunSc.x > -100 && sunSc.x < w + 100 && sunSc.y > -50 && sunSc.y < h + 50) {
      ctx.save();
      if (isGalacticPin) {
        var pulse = state.reducedMotion ? 1 : (1 + 0.10 * Math.sin(t * 2.4));
        var dSize = 10 * pulse;
        ctx.save();
        ctx.translate(sunSc.x, sunSc.y);
        ctx.rotate(Math.PI * 0.25);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.92)";
        ctx.lineWidth = 1.6;
        ctx.strokeRect(-dSize, -dSize, dSize * 2, dSize * 2);
        ctx.restore();

        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(sunSc.x, sunSc.y, 3.2, 0, Math.PI * 2);
        ctx.fill();

        var tagW = 68, tagH = 23;
        var tagX = Math.round(sunSc.x + 18);
        var tagY = Math.round(sunSc.y - tagH * 0.5);
        roundRectPath(ctx, tagX, tagY, tagW, tagH, 6);
        ctx.fillStyle = "rgba(6, 12, 28, 0.88)";
        ctx.strokeStyle = "rgba(56, 189, 248, 0.68)";
        ctx.lineWidth = 1.1;
        ctx.fill();
        ctx.stroke();

        ctx.font = '700 12px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = "#f0f9ff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("◈ " + SUN_NAME, tagX + tagW * 0.5, tagY + tagH * 0.5 + 0.5);
      } else {
        var sunClearPx = SUN_RADIUS * state.cam.scale;
        var sw = 96, sh = 23;
        var sx = Math.round(sunSc.x - sw * 0.5);
        var sy = Math.round(sunSc.y + sunClearPx + 10);
        roundRectPath(ctx, sx, sy, sw, sh, 999);
        ctx.fillStyle = "rgba(12, 18, 36, 0.90)";
        ctx.strokeStyle = state.sunHovered ? "#fde68a" : "rgba(251, 191, 36, 0.72)";
        ctx.lineWidth = 1.2;
        ctx.fill();
        ctx.stroke();

        ctx.font = '700 12px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = "#fffbeb";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("☀ " + SUN_NAME + " · 恒星", sx + sw * 0.5, sy + sh * 0.5 + 0.5);

        placed.push({ x: sx, y: sy, w: sw, h: sh });
        placed.push({
          x: sunSc.x - sunClearPx,
          y: sunSc.y - sunClearPx,
          w: sunClearPx * 2,
          h: sunClearPx * 2
        });
      }
      ctx.restore();
    }

    if (stellarFade < 0.06) return;

    /* 2. 唯一「星际虫洞」2D 标签 */
    if (state.wormhole) {
      var whSc = worldToScreen(state.wormhole.x, state.wormhole.y);
      var whRpx = state.wormhole.radius * 1.45 * state.cam.scale;
      var ww = 128, whH = 22;
      var wxL = Math.round(whSc.x - ww * 0.5);
      var wyL = Math.round(whSc.y + whRpx + 8);
      if (whSc.x > -120 && whSc.x < w + 120 && wyL > -30 && wyL < h + 30) {
        ctx.save();
        ctx.globalAlpha = stellarFade;
        roundRectPath(ctx, wxL, wyL, ww, whH, 999);
        ctx.fillStyle = "rgba(8, 18, 42, 0.90)";
        ctx.strokeStyle = (state.whHovered || state.focusedSpecial === "wormhole") ? "#67e8f9" : "rgba(56, 189, 248, 0.62)";
        ctx.lineWidth = 1.15;
        ctx.fill();
        ctx.stroke();

        ctx.font = '600 11.5px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = "#e0f7ff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("◎ 星际虫洞 · 待接入", wxL + ww * 0.5, wyL + whH * 0.5 + 0.5);
        ctx.restore();

        placed.push({ x: wxL, y: wyL, w: ww, h: whH });
        placed.push({ x: whSc.x - whRpx, y: whSc.y - whRpx, w: whRpx * 2, h: whRpx * 2 });
      }
    }

    /* 3. 扁平 2D 行星 / 卫星 / 孤立黑洞防重叠标签 */
    var candidates = [];
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      var isAct = (n === state.selected || n === state.hovered);
      if (n.tier === "satellite" && !isAct && state.cam.scale < 0.58) continue;

      var sp = worldToScreen(n.x, n.y);
      if (sp.x < -140 || sp.x > w + 140 || sp.y < -50 || sp.y > h + 50) continue;
      var prio = isAct ? 10000 : (n.tier === "blackhole" ? 500 : n.cleanDeg * 10);
      candidates.push({ n: n, sp: sp, isAct: isAct, prio: prio });
    }
    candidates.sort(function (a, b) { return b.prio - a.prio; });

    var maxCount = state.cam.scale > 0.95 ? 40 : MAX_VISIBLE_LABELS;
    var shownCount = 0;
    for (var ci = 0; ci < candidates.length && shownCount < maxCount; ci++) {
      var c = candidates[ci];
      var ln = c.n;
      var sprite = c.isAct ? ln.labelActiveSprite : ln.labelSprite;
      if (!sprite) continue;
      var clearance = (ln.radius * (ln.hasRing ? 1.55 : 1.12)) * state.cam.scale;
      var lx = Math.round(c.sp.x - sprite.w * 0.5);
      var ly = Math.round(c.sp.y + Math.max(11, clearance) + 5);

      if (!c.isAct) {
        var overlap = false;
        for (var pi = 0; pi < placed.length; pi++) {
          var b = placed[pi];
          if (lx < b.x + b.w + 5 && lx + sprite.w + 5 > b.x && ly < b.y + b.h + 3 && ly + sprite.h + 3 > b.y) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;
      }

      placed.push({ x: lx, y: ly, w: sprite.w, h: sprite.h });
      shownCount++;
      var lhl = isNodeHighlighted(ln);
      ctx.save();
      ctx.globalAlpha = (lhl === 0 ? 0.22 : (c.isAct ? 1 : 0.94)) * (c.isAct ? 1 : stellarFade);
      ctx.drawImage(sprite.canvas, lx, ly, sprite.w, sprite.h);
      ctx.restore();
    }
  }

  /* ============================================================
   * 4. 拾取、2D 节点自由拖拽与 3D 银河环境相机同步控制
   * ============================================================ */
  function getLocalPos(e) {
    var rect = state.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitTestNode(sx, sy) {
    if (state.cam.scale < 0.14) return null;
    var wp = screenToWorld(sx, sy);
    var pad = 7 / Math.max(0.28, state.cam.scale);
    var best = null, bestD = Infinity;
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      var d = Math.hypot(wp.x - n.x, wp.y - n.y);
      if (d <= n.radius + pad && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function hitTestWormhole(sx, sy) {
    if (!state.wormhole || state.cam.scale < 0.14) return false;
    var wp = screenToWorld(sx, sy);
    return Math.hypot(wp.x - state.wormhole.x, wp.y - state.wormhole.y) <= state.wormhole.radius * 1.55;
  }

  function hitTestSun(sx, sy) {
    var sunSc = worldToScreen(0, 0);
    var hitPx = state.cam.scale < 0.145 ? 36 : Math.max(24, SUN_RADIUS * state.cam.scale * 1.15);
    return Math.hypot(sx - sunSc.x, sy - sunSc.y) <= hitPx;
  }

  function focusPointIn2D(wx, wy, targetScale, withRightReserve, specialTag) {
    var h = Math.max(1, state.height);
    var rightReserve = withRightReserve && state.width > 740 ? Math.min(420, state.width * 0.34) : 0;
    if (state.use3dEnv && global.MemoryGraph3D && global.MemoryGraph3D.focus2DPoint) {
      var tanHalf = Math.tan((50 * Math.PI / 180) * 0.5);
      var targetRad = h / Math.max(0.01, 2 * targetScale * tanHalf);
      global.MemoryGraph3D.focus2DPoint(wx, wy, targetRad, rightReserve, specialTag || null);
    } else {
      state.targetCam = {
        x: (state.width - rightReserve) * 0.5 - wx * targetScale,
        y: h * 0.5 - wy * targetScale,
        scale: targetScale
      };
    }
  }

  function selectNode2D(node) {
    state.selected = node || null;
    state.focusedSpecial = node ? "node2d" : null;
    state.followFocus = Boolean(node);
    state.followRightReserve = Boolean(node);
    if (node) {
      state.focusCategory = null;
      var targetScale = clamp(Math.max(state.cam.scale, 1.15), 1.05, 2.4);
      focusPointIn2D(node.x, node.y, targetScale, true, "node2d");
    }
    if (state.onSelect) state.onSelect(state.selected);
  }

  function focusWormhole2D() {
    if (!state.wormhole) return;
    state.selected = null;
    state.focusCategory = null;
    state.focusedSpecial = "wormhole";
    state.followFocus = true;
    state.followRightReserve = false;
    if (state.onSelect) state.onSelect(null);
    focusPointIn2D(state.wormhole.x, state.wormhole.y, 1.35, false, "wormhole");
    showToast2D("星际虫洞 · 当前仅「" + SUN_NAME + "」恒星系在线，邀请朋友后可跨恒星系通行");
  }

  function focusGrandGalaxy2D() {
    state.selected = null;
    state.focusCategory = null;
    state.focusedSpecial = "galaxy";
    state.followFocus = false;
    state.followRightReserve = false;
    if (state.onSelect) state.onSelect(null);
    if (state.use3dEnv && global.MemoryGraph3D && global.MemoryGraph3D.focusGrandGalaxy) {
      global.MemoryGraph3D.focusGrandGalaxy();
    } else {
      state.targetCam = { x: state.width * 0.62, y: state.height * 0.38, scale: 0.036 };
    }
  }

  function handleHudNav(nav) {
    if (nav === "galaxy") {
      focusGrandGalaxy2D();
    } else if (nav === "wormhole") {
      focusWormhole2D();
    } else {
      resetView();
    }
  }

  function bindCanvasEvents() {
    var el = state.canvas;
    if (!el) return;
    el.style.touchAction = "none";
    el.style.cursor = "grab";

    el.addEventListener("dblclick", function (e) {
      e.preventDefault();
      resetView();
    });

    el.addEventListener("pointerdown", function (e) {
      var pos = getLocalPos(e);
      state.pointers[e.pointerId] = { x: pos.x, y: pos.y };
      var pKeys = Object.keys(state.pointers);
      if (pKeys.length === 2) {
        var pa = state.pointers[pKeys[0]], pb = state.pointers[pKeys[1]];
        state.pinchDist = Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1;
        state.dragNode = null;
        return;
      }
      if (e.button !== undefined && e.button !== 0) return;

      state.pointerDown = true;
      state.pointerId = e.pointerId;
      state.moved = false;
      state.downX = state.lastX = pos.x;
      state.downY = state.lastY = pos.y;
      state.targetCam = null;

      var hit = hitTestNode(pos.x, pos.y);
      state.dragNode = hit;
      el.style.cursor = "grabbing";
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });

    el.addEventListener("pointermove", function (e) {
      var pos = getLocalPos(e);
      if (state.pointers[e.pointerId]) {
        state.pointers[e.pointerId] = { x: pos.x, y: pos.y };
      }

      var pKeys = Object.keys(state.pointers);
      if (pKeys.length === 2) {
        var pa = state.pointers[pKeys[0]], pb = state.pointers[pKeys[1]];
        var dist = Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1;
        if (state.pinchDist > 0) {
          var ratio = dist / state.pinchDist;
          if (state.use3dEnv && global.MemoryGraph3D && global.MemoryGraph3D.zoomByFactor) {
            global.MemoryGraph3D.zoomByFactor(1 / ratio);
          } else {
            state.cam.scale = clamp(state.cam.scale * ratio, MIN_ZOOM, MAX_ZOOM);
          }
        }
        state.pinchDist = dist;
        state.moved = true;
        return;
      }

      if (!state.pointerDown) {
        var hov = hitTestNode(pos.x, pos.y);
        var whHov = !hov && hitTestWormhole(pos.x, pos.y);
        var sunHov = !hov && !whHov && hitTestSun(pos.x, pos.y);
        state.hovered = hov;
        state.whHovered = whHov;
        state.sunHovered = sunHov;
        el.style.cursor = (hov || whHov || sunHov) ? "pointer" : "grab";
        return;
      }

      if (e.pointerId !== state.pointerId) return;
      var dx = pos.x - state.lastX;
      var dy = pos.y - state.lastY;
      if (!state.moved && Math.hypot(pos.x - state.downX, pos.y - state.downY) > 5) {
        state.moved = true;
      }

      if (state.dragNode) {
        /* 2D 模式专属：直接在 2D 平面自由拖拽记忆行星节点 */
        state.dragNode.dragOffsetX += dx / Math.max(0.05, state.cam.scale);
        state.dragNode.dragOffsetY += dy / Math.max(0.05, state.cam.scale);
      } else {
        if (state.moved) state.followFocus = false;
        if (state.use3dEnv && global.MemoryGraph3D && global.MemoryGraph3D.panByPixels) {
          global.MemoryGraph3D.panByPixels(dx, dy);
        } else {
          state.cam.x += dx;
          state.cam.y += dy;
        }
      }

      state.lastX = pos.x;
      state.lastY = pos.y;
    });

    function endPointer(e) {
      delete state.pointers[e.pointerId];
      if (Object.keys(state.pointers).length < 2) state.pinchDist = 0;
      if (!state.pointerDown || e.pointerId !== state.pointerId) return;

      var wasMoved = state.moved;
      var clickedNode = state.dragNode;
      state.pointerDown = false;
      state.pointerId = null;
      state.dragNode = null;
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}

      var pos = getLocalPos(e);
      var hov = hitTestNode(pos.x, pos.y);
      var whHov = !hov && hitTestWormhole(pos.x, pos.y);
      var sunHov = !hov && !whHov && hitTestSun(pos.x, pos.y);
      state.hovered = hov;
      state.whHovered = whHov;
      state.sunHovered = sunHov;
      el.style.cursor = (hov || whHov || sunHov) ? "pointer" : "grab";

      if (!wasMoved) {
        if (clickedNode) {
          selectNode2D(clickedNode);
        } else if (whHov) {
          focusWormhole2D();
        } else if (sunHov) {
          if (state.cam.scale < 0.145) {
            resetView();
            showToast2D("已跃迁回「" + SUN_NAME + "」2D 恒星系平面星图");
          } else {
            state.selected = null;
            state.focusCategory = null;
            state.focusedSpecial = "sun";
            state.followFocus = false;
            state.followRightReserve = false;
            if (state.onSelect) state.onSelect(null);
            focusPointIn2D(0, 0, 1.35, false, "sun");
            showToast2D("恒星「" + SUN_NAME + "」· 个人记忆主星（共环绕 " + state.nodes.length + " 颗记忆天体）");
          }
        } else {
          state.focusCategory = null;
          state.focusedSpecial = null;
          state.followFocus = false;
          state.followRightReserve = false;
          selectNode2D(null);
        }
      }
    }

    el.addEventListener("pointerup", endPointer);
    el.addEventListener("pointercancel", endPointer);
    el.addEventListener("pointerleave", function () {
      if (!state.pointerDown) {
        state.hovered = null;
        state.whHovered = false;
        state.sunHovered = false;
        el.style.cursor = "grab";
      }
    });

    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      state.targetCam = null;
      if (state.use3dEnv && global.MemoryGraph3D && global.MemoryGraph3D.zoomByFactor) {
        var factor3d = 1 + clamp(e.deltaY, -160, 160) * 0.0021;
        global.MemoryGraph3D.zoomByFactor(factor3d);
      } else {
        var factor2d = e.deltaY > 0 ? 0.87 : 1.15;
        var pos = getLocalPos(e);
        var nextScale = clamp(state.cam.scale * factor2d, MIN_ZOOM, MAX_ZOOM);
        var wx = (pos.x - state.cam.x) / state.cam.scale;
        var wy = (pos.y - state.cam.y) / state.cam.scale;
        state.cam.scale = nextScale;
        state.cam.x = pos.x - wx * nextScale;
        state.cam.y = pos.y - wy * nextScale;
      }
    }, { passive: false });
  }

  /* ============================================================
   * 5. 动画循环、尺寸同步与公开生命周期接口
   * ============================================================ */
  function drawFrame(dt) {
    if (!state.use3dEnv) {
      drawFallbackBackground(state.elapsed);
    }
    if (!state.bgOnly) {
      drawGraph2D(state.elapsed, dt);
    }
  }

  function tick(ts) {
    if (!state.running || document.hidden) {
      state.raf = null;
      return;
    }
    state.raf = requestAnimationFrame(tick);
    if (!state.lastTs) state.lastTs = ts;
    var dt = Math.min(0.05, Math.max(0.001, (ts - state.lastTs) / 1000));
    state.lastTs = ts;
    state.elapsed += dt;
    drawFrame(dt);
  }

  function startLoop() {
    if (state.raf) return;
    state.lastTs = 0;
    state.raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopLoop();
    } else if (state.running) {
      startLoop();
    }
  }

  function handleReducedMotionChange(ev) {
    state.reducedMotion = Boolean(ev && ev.matches);
  }

  function fitView(animate) {
    state.focusedSpecial = null;
    state.followFocus = false;
    state.followRightReserve = false;
    if (state.use3dEnv && global.MemoryGraph3D && global.MemoryGraph3D.focusStellarSystem) {
      global.MemoryGraph3D.focusStellarSystem();
      return;
    }
    var w = state.width, h = state.height;
    var scale = clamp(Math.min(w, h) / 2850, 0.20, 0.65);
    var cam = { x: w * 0.5, y: h * 0.5, scale: scale };
    if (animate && !state.reducedMotion) {
      state.targetCam = cam;
    } else {
      state.cam = cam;
      state.targetCam = null;
    }
  }

  function syncSize(shouldRefit) {
    if (!state.container) return;
    var w = Math.max(1, Math.round(state.container.clientWidth || global.innerWidth || 800));
    var h = Math.max(1, Math.round(state.container.clientHeight || (global.innerHeight - 62) || 560));
    var dpr = Math.min(global.devicePixelRatio || 1, 1.5);

    state.width = w;
    state.height = h;
    state.dpr = dpr;

    if (state.bgCanvas) {
      state.bgCanvas.width = Math.round(w * dpr);
      state.bgCanvas.height = Math.round(h * dpr);
      initFallbackStars(w, h);
    }
    if (state.canvas) {
      state.canvas.width = Math.round(w * dpr);
      state.canvas.height = Math.round(h * dpr);
    }
    if (!state.bgOnly && shouldRefit && !state.use3dEnv) {
      fitView(false);
    }
    drawFrame(0.016);
  }

  function handleResizeDebounced() {
    if (state.resizeTimer) clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(function () {
      state.resizeTimer = null;
      syncSize(false);
    }, 120);
  }

  function mountInternal(container, data, onSelect, bgOnlyMode) {
    destroy({ keep3dEnv: true });
    if (!container) return { nodes: 0, edges: 0 };

    state.container = container;
    state.bgOnly = Boolean(bgOnlyMode);
    state.onSelect = onSelect || function () {};
    state.selected = null;
    state.hovered = null;
    state.sunHovered = false;
    state.whHovered = false;
    state.focusedSpecial = null;
    state.focusCategory = null;
    state.elapsed = 0;

    state.reduceMq = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;
    state.reducedMotion = Boolean(state.reduceMq && state.reduceMq.matches);

    /* 在平面 2D 模式下优先挂载/复用 3D 动态深空与银河星系环境作为同源底层背景 */
    var has3d = !state.bgOnly && Boolean(global.MemoryGraph3D && global.MemoryGraph3D.supported && global.MemoryGraph3D.supported());
    if (has3d) {
      if (global.MemoryGraph3D.isActive && global.MemoryGraph3D.isActive()) {
        global.MemoryGraph3D.setEnvOnly(true);
        state.use3dEnv = true;
      } else {
        var envRes = global.MemoryGraph3D.render(container, data || {}, {
          onSelect: state.onSelect,
          planar: true,
          envOnly: true
        });
        state.use3dEnv = !(envRes && envRes.error);
      }
    } else {
      state.use3dEnv = false;
    }

    if (!state.use3dEnv) {
      var bgCanvas = document.createElement("canvas");
      bgCanvas.id = "pmv-bg";
      bgCanvas.className = "pmv-bg-canvas";
      bgCanvas.setAttribute("aria-hidden", "true");
      container.insertBefore(bgCanvas, container.firstChild);
      state.bgCanvas = bgCanvas;
      state.bgOwned = true;
      state.bgCtx = bgCanvas.getContext("2d");
    }

    if (!state.bgOnly) {
      var graphCanvas = document.createElement("canvas");
      graphCanvas.className = "mg-graph-canvas";
      graphCanvas.style.position = "absolute";
      graphCanvas.style.inset = "0";
      graphCanvas.style.width = "100%";
      graphCanvas.style.height = "100%";
      graphCanvas.style.zIndex = "2";
      container.appendChild(graphCanvas);
      state.canvas = graphCanvas;
      state.ctx = graphCanvas.getContext("2d");

      var g = buildGraph(data || {}, true);
      state.nodes = g.nodes;
      state.edges = g.edges;
      state.categories = g.categories;
      state.anchors = g.anchors;
      state.neighborMap = g.neighborMap;
      state.wormhole = g.wormhole;

      update2DPositions(0);
      syncSize(true);
      bindCanvasEvents();
    } else {
      syncSize(false);
    }

    global.addEventListener("resize", handleResizeDebounced);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (state.reduceMq) {
      if (state.reduceMq.addEventListener) state.reduceMq.addEventListener("change", handleReducedMotionChange);
      else if (state.reduceMq.addListener) state.reduceMq.addListener(handleReducedMotionChange);
    }
    state.listenersBound = true;

    state.running = true;
    startLoop();
    var nonSynEdges = 0;
    for (var ei = 0; ei < state.edges.length; ei++) {
      if (!state.edges[ei].synthetic) nonSynEdges++;
    }
    return { nodes: state.nodes.length, edges: nonSynEdges };
  }

  function render(container, data, onSelect) {
    return mountInternal(container, data, onSelect, false);
  }

  function buildModel(data) {
    var g = buildGraph(data || {}, false);
    return {
      nodes: g.nodes,
      edges: g.edges,
      categories: g.categories,
      anchors: g.anchors,
      neighborMap: g.neighborMap
    };
  }

  function renderBackground(container) {
    return mountInternal(container, null, null, true);
  }

  function destroy(opts) {
    var keep3d = Boolean(opts && opts.keep3dEnv);
    state.running = false;
    stopLoop();
    if (state.resizeTimer) {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = null;
    }
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    if (state.listenersBound) {
      global.removeEventListener("resize", handleResizeDebounced);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (state.reduceMq) {
        if (state.reduceMq.removeEventListener) state.reduceMq.removeEventListener("change", handleReducedMotionChange);
        else if (state.reduceMq.removeListener) state.reduceMq.removeListener(handleReducedMotionChange);
      }
      state.listenersBound = false;
    }
    if (state.canvas && state.canvas.parentNode) {
      state.canvas.parentNode.removeChild(state.canvas);
    }
    if (state.bgCanvas && state.bgOwned && state.bgCanvas.parentNode) {
      state.bgCanvas.parentNode.removeChild(state.bgCanvas);
    }
    if (!keep3d && state.use3dEnv && global.MemoryGraph3D) {
      global.MemoryGraph3D.destroy();
    }
    state.use3dEnv = false;
    state.canvas = state.ctx = null;
    state.bgCanvas = state.bgCtx = null;
    state.bgOwned = false;
    state.bgOnly = false;
    state.nodes = [];
    state.edges = [];
    state.categories = [];
    state.anchors = {};
    state.neighborMap = {};
    state.wormhole = null;
    state.selected = state.hovered = state.dragNode = null;
    state.sunHovered = false;
    state.whHovered = false;
    state.focusedSpecial = null;
    state.focusCategory = null;
    state.followFocus = false;
    state.followRightReserve = false;
    state.pointers = {};
    state.targetCam = null;
  }

  function resetView() {
    state.selected = null;
    state.focusCategory = null;
    state.focusedSpecial = null;
    state.followFocus = false;
    state.followRightReserve = false;
    for (var i = 0; i < state.nodes.length; i++) {
      state.nodes[i].dragOffsetX = 0;
      state.nodes[i].dragOffsetY = 0;
    }
    if (state.onSelect) state.onSelect(null);
    fitView(true);
  }

  function focusCategory(cat) {
    state.selected = null;
    state.focusedSpecial = null;
    state.followFocus = false;
    state.followRightReserve = false;
    if (state.onSelect) state.onSelect(null);
    if (!cat || state.focusCategory === cat) {
      state.focusCategory = null;
      fitView(true);
      return null;
    }
    state.focusCategory = cat;
    var sub = state.nodes.filter(function (n) { return n.category === cat; });
    if (sub.length) {
      var cx = 0, cy = 0;
      for (var i = 0; i < sub.length; i++) {
        cx += sub[i].x;
        cy += sub[i].y;
      }
      cx /= sub.length;
      cy /= sub.length;
      focusPointIn2D(cx, cy, 0.72, false, null);
    }
    return state.focusCategory;
  }

  function clearSelection() {
    if (!state.selected && !state.focusedSpecial && !state.followFocus) return;
    state.selected = null;
    state.focusedSpecial = null;
    state.followFocus = false;
    state.followRightReserve = false;
  }

  global.MemoryGraph = {
    render: render,
    renderBackground: renderBackground,
    buildModel: buildModel,
    destroy: destroy,
    resetView: resetView,
    fitView: fitView,
    focusCategory: focusCategory,
    clearSelection: clearSelection,
    focusGrandGalaxy: focusGrandGalaxy2D,
    focusWormhole: focusWormhole2D,
    handleHudNav: handleHudNav,
    getSnapshot: function () {
      var whSc = state.wormhole ? worldToScreen(state.wormhole.x, state.wormhole.y) : null;
      var sampleNode = null;
      for (var i = 0; i < state.nodes.length; i++) {
        if (state.nodes[i].tier === "planet") {
          var sp = worldToScreen(state.nodes[i].x, state.nodes[i].y);
          if (sp.x > 260 && sp.x < state.width - 260 && sp.y > 140 && sp.y < state.height - 140) {
            sampleNode = { id: state.nodes[i].id, title: state.nodes[i].title, sx: sp.x, sy: sp.y };
            break;
          }
        }
      }
      return {
        width: state.width,
        height: state.height,
        cam: { x: state.cam.x, y: state.cam.y, scale: state.cam.scale },
        wormholeScreen: whSc,
        sampleNode: sampleNode
      };
    },
    CATEGORY_LABELS: CATEGORY_LABELS
  };
})(window);
