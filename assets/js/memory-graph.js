// assets/js/memory-graph.js
/* ============================================================
 * 私人记忆档案 · 日心天体层级深空星图（平面 2D 硬核写实升级版）
 * ------------------------------------------------------------
 * 与 3D 宇宙（memory-graph-3d.js）完全共享同一套世界观、天体层级与视觉语言：
 * 1. 动态硬核深空天穹（#pmv-bg）：
 *    - 近黑至极暗蓝紫深空渐变（#020308 -> #070b1c），无卡通亮蓝底色、无卡通战舰剪影
 *    - 真空不闪烁高对比针尖恒星、低亮度弥散银河尘带与暗分子云裂隙
 *    - 局部暗弱红外/紫外伪色星云丝缕、极小遥远旋涡/椭圆星系光斑、高速微流星体短拖尾
 * 2. 日心引力宇宙结构与天体层级（mg-graph-canvas）：
 *    - 中心体积最大天体「太阳」（米粒组织 + 黑子本影半影 + 光斑 + 临边昏暗 + 动态日珥磁环 + 日冕流线 + 强眩光）
 *    - 各分区构成旋臂星系盘围绕中心太阳公转，大间距排布；支持 0.10x 全景至 4.8x 单天体全貌无级缩放
 *    - 连通度 = 0 → 卡冈图雅黑洞（纯黑视界 + 光子环 + 多普勒增亮吸积盘 + 引力透镜弧 + 极淡喷流 +「· 孤立」）
 *    - 连通度 = 1 → 天然卫星/不规则小天体（环形山低反照率岩质表面，沿倾斜椭圆轨道 8–20s 绕邻近宿主公转）
 *    - 连通度 2~3 → 5 类非纯白写实行星（海洋大陆冰盖/琥珀气态巨行星/熔岩裂谷星/青翠冰巨星/赤铁峡谷星，
 *      实时朝向中心太阳计算锐利真空硬阴影、行星本影投射冰尘环、1~2 颗绕行小卫星与天体食变暗）
 *    - 连通度 ≥ 4 → 6 类非纯白恒星（金黄 G 型/炽橙 K 型/赤红巨星/蓝青 O-B 型/紫品红沃尔夫-拉叶/琥珀翠绿碳星）
 * 3. 尺度参照与动态叙事元素：
 *    - 环日主小行星带（180 颗多面体受光岩块）、近景视差掠过小行星、反日双尾彗星（离子尾 + 尘埃尾）
 *    - 极淡黄道方位刻度环（HUD 标尺）、远处微弱脉冲导航信标、精细桁架空间站与翻滚反光探测器
 * 4. 严格保持 window.MemoryGraph 既有接口（render / renderBackground / buildModel / destroy /
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
    USER: { hex: "#fb7185", atmo: [251, 113, 133], rim: [255, 196, 208], arm: [251, 146, 160] },
    MEMORY: { hex: "#22d3ee", atmo: [34, 211, 238], rim: [165, 243, 252], arm: [103, 232, 249] },
    PROJECTS: { hex: "#2dd4bf", atmo: [45, 212, 191], rim: [153, 246, 228], arm: [94, 234, 212] },
    TOPIC: { hex: "#38bdf8", atmo: [56, 189, 248], rim: [186, 230, 253], arm: [125, 211, 252] },
    PROMPT: { hex: "#fbbf24", atmo: [251, 191, 36], rim: [254, 240, 138], arm: [253, 214, 92] },
    GUIDE: { hex: "#c084fc", atmo: [192, 132, 252], rim: [233, 213, 255], arm: [216, 180, 254] }
  };
  var DEFAULT_PALETTE = CATEGORY_PALETTES.TOPIC;

  var SUN_RADIUS = 84;
  var MIN_ZOOM = 0.10;
  var MAX_ZOOM = 4.80;
  var MAX_VISIBLE_LABELS = 26;

  /* 6 类非纯白恒星原型（与 3D 宇宙严格一致） */
  var STAR_ARCHETYPES = [
    { name: "golden", core: [255, 246, 206], mid: [255, 196, 68], limb: [214, 96, 16], corona: [255, 198, 82], freq: 11 },
    { name: "orange", core: [255, 232, 186], mid: [255, 132, 38], limb: [178, 42, 8], corona: [255, 138, 48], freq: 9 },
    { name: "crimson", core: [255, 208, 172], mid: [238, 68, 38], limb: [126, 14, 10], corona: [244, 78, 52], freq: 6.5 },
    { name: "sapphire", core: [228, 248, 255], mid: [58, 196, 255], limb: [14, 78, 186], corona: [68, 204, 255], freq: 13 },
    { name: "violet", core: [248, 226, 255], mid: [194, 92, 255], limb: [88, 20, 158], corona: [204, 108, 255], freq: 10 },
    { name: "carbon", core: [244, 255, 224], mid: [52, 224, 176], limb: [196, 128, 24], corona: [72, 232, 184], freq: 8.5 }
  ];

  /* 5 类非纯白行星地貌原型（与 3D 宇宙严格一致） */
  var PLANET_ARCHETYPES = [
    {
      name: "oceanic", banded: false, oceanSpec: 0.42, nightLava: false, nightCity: true, polarIce: true,
      deep: [8, 38, 88], mid: [34, 126, 84], high: [168, 148, 108], accent: [236, 246, 255],
      atmo: [72, 178, 255], ring: [186, 220, 246]
    },
    {
      name: "jovian", banded: true, oceanSpec: 0.05, nightLava: false, nightCity: false, polarIce: false,
      deep: [92, 44, 18], mid: [206, 136, 62], high: [242, 198, 128], accent: [196, 76, 38],
      atmo: [238, 178, 98], ring: [232, 196, 142]
    },
    {
      name: "volcanic", banded: false, oceanSpec: 0.08, nightLava: true, nightCity: false, polarIce: false,
      deep: [22, 18, 22], mid: [58, 38, 36], high: [112, 54, 32], accent: [255, 116, 24],
      atmo: [255, 106, 38], ring: [168, 118, 92]
    },
    {
      name: "icegiant", banded: true, oceanSpec: 0.18, nightLava: false, nightCity: false, polarIce: true,
      deep: [10, 62, 86], mid: [28, 162, 178], high: [118, 234, 228], accent: [212, 252, 250],
      atmo: [64, 224, 218], ring: [152, 236, 238]
    },
    {
      name: "rustterran", banded: false, oceanSpec: 0.10, nightLava: false, nightCity: false, polarIce: true,
      deep: [74, 26, 18], mid: [168, 74, 42], high: [218, 134, 84], accent: [246, 228, 208],
      atmo: [232, 138, 92], ring: [216, 168, 132]
    }
  ];

  var state = {
    container: null,
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
    galaxies: [],
    galaxyByCat: {},
    neighborMap: {},

    asteroids: [],
    flybyRock: null,
    nextFlybyAt: 9,
    comet: null,
    nextCometAt: 6,
    beacons: [],

    selected: null,
    hovered: null,
    sunHovered: false,
    focusCategory: null,
    onSelect: null,

    cam: { x: 0, y: 0, scale: 1 },
    targetCam: null,

    alpha: 1,
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
    pinchScale: 1,

    bg: null,
    reducedMotion: false,
    reduceMq: null,
    resizeTimer: null,
    listenersBound: false
  };

  /* ============================================================
   * 工具函数：确定性哈希、伪随机、2D 连续噪声与 FBM
   * ============================================================ */
  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
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

  function makeNoiseTable(seed) {
    var tbl = new Float32Array(256);
    var r = mulberry32(seed);
    for (var i = 0; i < 256; i++) tbl[i] = r();
    return tbl;
  }

  function fastNoise2D(x, y, tbl) {
    var ix = x >= 0 ? (x | 0) : ((x | 0) - 1);
    var iy = y >= 0 ? (y | 0) : ((y | 0) - 1);
    var fx = x - ix;
    var fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx);
    var uy = fy * fy * (3 - 2 * fy);
    var ix0 = ix & 255, ix1 = (ix + 1) & 255;
    var iy0 = (iy * 57) & 255, iy1 = ((iy + 1) * 57) & 255;
    var a = tbl[(ix0 + iy0) & 255];
    var b = tbl[(ix1 + iy0) & 255];
    var c = tbl[(ix0 + iy1) & 255];
    var d = tbl[(ix1 + iy1) & 255];
    return a + (b - a) * ux + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
  }

  function fastFbm2D(x, y, tbl, octaves) {
    var val = 0, amp = 0.55, freq = 1, norm = 0;
    for (var i = 0; i < octaves; i++) {
      val += amp * fastNoise2D(x * freq + i * 13.7, y * freq - i * 9.3, tbl);
      norm += amp;
      freq *= 2.03;
      amp *= 0.5;
    }
    return val / norm;
  }

  function fastRidged2D(x, y, tbl, octaves) {
    var val = 0, amp = 0.55, freq = 1, norm = 0;
    for (var i = 0; i < octaves; i++) {
      var n = fastNoise2D(x * freq - i * 11.3, y * freq + i * 17.1, tbl);
      var r = 1 - Math.abs(2 * n - 1);
      val += amp * r * r;
      norm += amp;
      freq *= 2.06;
      amp *= 0.5;
    }
    return val / norm;
  }

  function rgbStr(rgb, alpha) {
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
  }

  function roundRectPath(ctx, x, y, w, h, r) {
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

  function wrapRange(val, min, span) {
    var m = (val - min) % span;
    return m < 0 ? m + span + min : m + min;
  }

  /* ============================================================
   * 1. 离屏共享宇宙纹理缓存（太阳光球层、银河尘带、伪色星云、远景星系）
   * ============================================================ */
  var sharedAssets = null;

  function buildSolarPhotosphereSprite() {
    var size = 256;
    var cx = size * 0.5, cy = size * 0.5;
    var R = size * 0.48;
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(size, size);
    var data = img.data;
    var tbl1 = makeNoiseTable(0x5ca1ab1e);
    var tbl2 = makeNoiseTable(0x9e3779b9);

    for (var py = 0; py < size; py++) {
      var dy = (py + 0.5 - cy) / R;
      var dy2 = dy * dy;
      var row = py * size;
      for (var px = 0; px < size; px++) {
        var dx = (px + 0.5 - cx) / R;
        var d2 = dx * dx + dy2;
        if (d2 > 1.0) continue;
        var dist = Math.sqrt(d2);
        var edgeA = dist < 0.965 ? 1 : (1 - dist) / 0.035;
        var mu = Math.sqrt(Math.max(0.001, 1 - d2));

        // 球面透视映射 + 太阳米粒组织与超米粒对流胞
        var invC = 1.36 - 0.34 * mu;
        var sx = dx * invC;
        var sy = dy * invC;
        var g1 = fastRidged2D(sx * 9.5 + 3.1, sy * 9.5 - 2.4, tbl1, 3);
        var g2 = fastRidged2D(sx * 20.0 - 1.7, sy * 20.0 + 4.2, tbl2, 2);
        var gran = clamp(g1 * 0.62 + g2 * 0.38, 0, 1);

        // 活跃纬度黑子带（本影 + 半影 + 临边白光斑 faculae）
        var activeLat = Math.exp(-Math.pow((Math.abs(dy) - 0.27) * 6.2, 2));
        var spotField = fastFbm2D(sx * 2.9 + 5.4, sy * 2.9 - 3.1, tbl1, 3);
        var spotDet = fastNoise2D(sx * 11.0, sy * 11.0, tbl2);
        var sv = activeLat * smoothstep(0.62, 0.86, spotField * 0.78 + spotDet * 0.22);
        var umbra = smoothstep(0.52, 0.84, sv);
        var penumbra = smoothstep(0.15, 0.54, sv) * (1 - umbra);
        var faculae = activeLat * smoothstep(0.50, 0.68, spotField) * (1 - smoothstep(0.66, 0.82, spotField)) * (0.4 + 0.9 * (1 - mu));

        // 真实恒星临边昏暗曲线（中心炽白黄 -> 中区金琥珀 -> 边缘深红橙色球层）
        var limbCurve = Math.pow(mu, 0.56);
        var tMid = smoothstep(0, 0.58, limbCurve);
        var tCore = Math.pow(limbCurve, 1.65) * (0.55 + 0.45 * gran);

        var r = lerp(218, 255, tMid);
        var g = lerp(54, 174, tMid);
        var b = lerp(8, 38, tMid);

        r = lerp(r, 255, tCore);
        g = lerp(g, 248, tCore);
        b = lerp(b, 214, tCore);

        var granMul = 0.78 + 0.34 * gran;
        r *= granMul; g *= granMul; b *= granMul;

        // 半影与本影压暗
        r = lerp(r, 118, penumbra * 0.78);
        g = lerp(g, 38, penumbra * 0.78);
        b = lerp(b, 6, penumbra * 0.78);

        r = lerp(r, 22, umbra * 0.92);
        g = lerp(g, 5, umbra * 0.92);
        b = lerp(b, 1, umbra * 0.92);

        // 光斑与色球针状体边缘提亮
        var spicule = Math.pow(1 - mu, 3.8) * 0.65;
        r += 255 * faculae * 0.45 + 255 * spicule;
        g += 224 * faculae * 0.45 + 92 * spicule;
        b += 148 * faculae * 0.45 + 18 * spicule;

        var idx = (row + px) * 4;
        data[idx] = clamp(r | 0, 0, 255);
        data[idx + 1] = clamp(g | 0, 0, 255);
        data[idx + 2] = clamp(b | 0, 0, 255);
        data[idx + 3] = (edgeA * 255 + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function buildMilkyWayBandCanvas(seed) {
    var sw = 280, sh = 140, ow = 960, oh = 480;
    var src = document.createElement("canvas");
    src.width = sw; src.height = sh;
    var sctx = src.getContext("2d");
    var img = sctx.createImageData(sw, sh);
    var data = img.data;
    var tbl = makeNoiseTable(seed);
    var tbl2 = makeNoiseTable(seed ^ 0x45d9f3b);

    for (var py = 0; py < sh; py++) {
      var ny = (py / sh - 0.5) * 2;
      var bandEnv = Math.exp(-ny * ny * 5.6);
      var row = py * sw;
      for (var px = 0; px < sw; px++) {
        var nx = (px / sw - 0.5) * 2;
        var endFade = 1 - smoothstep(0.28, 0.98, Math.abs(nx));
        var env = bandEnv * endFade;
        if (env <= 0.004) continue;

        var warp = fastFbm2D(nx * 2.3 + 1.5, ny * 3.1 - 0.9, tbl, 3);
        var dust = fastFbm2D(nx * 3.9 + warp * 1.1, ny * 6.2 + warp * 0.8, tbl, 4);
        var wisp = fastRidged2D(nx * 5.8 - warp * 1.2, ny * 8.6 + warp * 1.0, tbl2, 3);

        // 银河中央暗分子尘埃裂隙
        var rift = Math.abs(ny - (warp - 0.5) * 0.32);
        var darkRift = 1 - Math.exp(-rift * rift * 52) * (0.55 + 0.38 * fastFbm2D(nx * 7.2, ny * 7.5, tbl2, 2));

        var val = clamp((dust * 0.66 + wisp * 0.34) * env * darkRift * 1.15, 0, 1);
        if (val <= 0.005) continue;

        var warmBulge = Math.exp(-(nx * nx * 2.8 + ny * ny * 11.0)) * darkRift;
        var r = lerp(32, 168, warmBulge * 0.55) + wisp * 24;
        var g = lerp(44, 152, warmBulge * 0.50) + wisp * 34;
        var b = lerp(82, 178, warmBulge * 0.42) + wisp * 52;

        var idx = (row + px) * 4;
        data[idx] = clamp(r | 0, 0, 255);
        data[idx + 1] = clamp(g | 0, 0, 255);
        data[idx + 2] = clamp(b | 0, 0, 255);
        data[idx + 3] = (clamp(val * 0.72, 0, 1) * 255 + 0.5) | 0;
      }
    }
    sctx.putImageData(img, 0, 0);

    var out = document.createElement("canvas");
    out.width = ow; out.height = oh;
    var octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.drawImage(src, 0, 0, ow, oh);
    return out;
  }

  function buildFalseColorNebulaPatch(seed, rgbDeep, rgbHi) {
    var sz = 192, outSz = 512;
    var src = document.createElement("canvas");
    src.width = src.height = sz;
    var sctx = src.getContext("2d");
    var img = sctx.createImageData(sz, sz);
    var data = img.data;
    var tbl = makeNoiseTable(seed);

    for (var py = 0; py < sz; py++) {
      var ny = (py / sz - 0.5) * 2;
      var row = py * sz;
      for (var px = 0; px < sz; px++) {
        var nx = (px / sz - 0.5) * 2;
        var r2 = nx * nx + ny * ny;
        if (r2 >= 0.96) continue;
        var r = Math.sqrt(r2);
        var w = fastFbm2D(nx * 2.1, ny * 2.1, tbl, 3);
        var f = fastRidged2D(nx * 3.4 + w, ny * 3.4 - w * 0.8, tbl, 3);
        var radial = (1 - smoothstep(0.15, 0.94, r + (w - 0.5) * 0.30)) * (1 - smoothstep(0.80, 0.97, r));
        if (radial <= 0.004) continue;
        var dens = clamp((w * 0.55 + f * 0.45) * radial, 0, 1);
        var idx = (row + px) * 4;
        data[idx] = lerp(rgbDeep[0], rgbHi[0], f) | 0;
        data[idx + 1] = lerp(rgbDeep[1], rgbHi[1], f) | 0;
        data[idx + 2] = lerp(rgbDeep[2], rgbHi[2], f) | 0;
        data[idx + 3] = (dens * 210) | 0;
      }
    }
    sctx.putImageData(img, 0, 0);
    var out = document.createElement("canvas");
    out.width = out.height = outSz;
    out.getContext("2d").drawImage(src, 0, 0, outSz, outSz);
    return out;
  }

  function buildTinyGalaxySprite(seed, warm) {
    var sz = 64, cx = 32, cy = 32;
    var c = document.createElement("canvas");
    c.width = c.height = sz;
    var g = c.getContext("2d");
    var rand = mulberry32(seed);
    var armCol = warm ? [246, 206, 148] : [142, 198, 248];
    var halo = g.createRadialGradient(cx, cy, 0, cx, cy, 27);
    halo.addColorStop(0, "rgba(255,250,240,0.85)");
    halo.addColorStop(0.25, rgbStr(armCol, 0.36));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, sz, sz);

    g.save();
    g.globalCompositeOperation = "screen";
    for (var a = 0; a < 2; a++) {
      var base = a * Math.PI + rand() * 0.8;
      g.beginPath();
      for (var i = 0; i <= 26; i++) {
        var t = i / 26;
        var rr = 2.5 + Math.pow(t, 1.15) * 23;
        var ang = base + t * 3.8;
        var x = cx + Math.cos(ang) * rr;
        var y = cy + Math.sin(ang) * rr;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = rgbStr(armCol, 0.34);
      g.lineWidth = 1.8;
      g.stroke();
    }
    g.restore();
    return c;
  }

  function ensureSharedAssets() {
    if (sharedAssets) return sharedAssets;
    sharedAssets = {
      sunPhoto: buildSolarPhotosphereSprite(),
      milkyWay: buildMilkyWayBandCanvas(0x7c93e501),
      irNebula: buildFalseColorNebulaPatch(0x8a3119, [26, 9, 8], [136, 52, 34]),
      uvNebula: buildFalseColorNebulaPatch(0x185c7a, [7, 18, 32], [38, 118, 158]),
      darkCloud: buildFalseColorNebulaPatch(0x020308, [2, 3, 8], [4, 6, 14]),
      tinyGalaxies: [
        buildTinyGalaxySprite(0x101, true),
        buildTinyGalaxySprite(0x202, false),
        buildTinyGalaxySprite(0x303, true)
      ]
    };
    return sharedAssets;
  }

  /* ============================================================
   * 2. 动态硬核深空天穹背景（#pmv-bg：不闪烁针尖星 + 银河暗带 + 局部伪色星云 + 微流星）
   * ============================================================ */
  function initStarfield(w, h) {
    var narrow = (global.innerWidth || w) <= 768 || w <= 768;
    var assets = ensureSharedAssets();
    var rand = mulberry32(0x070b1c ^ ((w * 73856093) ^ (h * 19349663)));
    var minDim = Math.min(w, h);
    var maxDim = Math.max(w, h);

    // 静态底图：近黑至极暗蓝紫渐变（避免纯死黑与卡通亮蓝）+ 不闪烁高对比点星
    var baseCanvas = document.createElement("canvas");
    baseCanvas.width = Math.max(1, Math.round(w));
    baseCanvas.height = Math.max(1, Math.round(h));
    var bctx = baseCanvas.getContext("2d");

    var sky = bctx.createRadialGradient(w * 0.52, h * 0.46, 0, w * 0.52, h * 0.46, maxDim * 0.78);
    sky.addColorStop(0, "#070b1c");
    sky.addColorStop(0.52, "#040611");
    sky.addColorStop(1, "#020308");
    bctx.fillStyle = sky;
    bctx.fillRect(0, 0, w, h);

    // 稳定不闪烁点光源星空（真实光谱色温分布，无大气闪烁）
    var starCount = narrow ? 240 : 480;
    var spectralTints = [
      "255,255,255",
      "218,236,255",
      "255,244,222",
      "255,214,168",
      "168,214,255",
      "255,182,138"
    ];
    for (var i = 0; i < starCount; i++) {
      var sx = rand() * w;
      var sy = rand() * h;
      var mag = Math.pow(rand(), 2.4);
      var sr = 0.42 + mag * 1.15;
      var sa = 0.24 + mag * 0.74;
      var tint = spectralTints[(rand() * spectralTints.length) | 0];
      bctx.fillStyle = "rgba(" + tint + "," + sa.toFixed(3) + ")";
      if (sr < 0.85) {
        bctx.fillRect(sx, sy, sr * 1.35, sr * 1.35);
      } else {
        bctx.beginPath();
        bctx.arc(sx, sy, sr, 0, Math.PI * 2);
        bctx.fill();
      }
    }

    // 远景极小旋涡/椭圆星系光斑
    var farGalCount = narrow ? 7 : 14;
    var farGalaxies = [];
    for (var gi = 0; gi < farGalCount; gi++) {
      farGalaxies.push({
        sprite: assets.tinyGalaxies[gi % assets.tinyGalaxies.length],
        x: w * (0.04 + rand() * 0.92),
        y: h * (0.05 + rand() * 0.90),
        size: 10 + Math.pow(rand(), 1.6) * 22,
        tilt: rand() * Math.PI,
        flatten: 0.35 + rand() * 0.42,
        alpha: 0.16 + rand() * 0.26,
        par: 0.015 + rand() * 0.02
      });
    }

    state.bg = {
      w: w,
      h: h,
      baseCanvas: baseCanvas,
      milkyWay: {
        canvas: assets.milkyWay,
        cx: w * 0.50,
        cy: h * 0.48,
        w: Math.hypot(w, h) * 1.24,
        h: clamp(minDim * 0.52, 220, 520),
        angle: -0.44,
        alpha: narrow ? 0.20 : 0.25
      },
      patches: [
        { canvas: assets.irNebula, x: w * 0.22, y: h * 0.26, sz: clamp(minDim * 0.78, 320, 680), alpha: 0.11, vx: 1.4, vy: 0.7, par: 0.024 },
        { canvas: assets.uvNebula, x: w * 0.78, y: h * 0.72, sz: clamp(minDim * 0.74, 300, 640), alpha: 0.11, vx: -1.6, vy: -0.8, par: 0.028 },
        { canvas: assets.darkCloud, x: w * 0.36, y: h * 0.62, sz: clamp(minDim * 0.55, 240, 480), alpha: 0.42, vx: 1.0, vy: -0.5, par: 0.035, normalBlend: true }
      ],
      farGalaxies: farGalaxies,
      microMeteor: null,
      nextMeteorAt: 3.5 + rand() * 5.5,
      rand: rand
    };
  }

  function drawStarfield(t, dt) {
    var ctx = state.bgCtx;
    var bg = state.bg;
    if (!ctx || !bg) return;

    var w = bg.w, h = bg.h;
    var animT = state.reducedMotion ? 0 : t;
    var camDx = (state.cam.x - w * 0.5);
    var camDy = (state.cam.y - h * 0.5);

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.drawImage(bg.baseCanvas, 0, 0, w, h);

    // 银河弥散光带 + 局部伪色红外/紫外暗弱星云 + 远景极小星系
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    var mw = bg.milkyWay;
    ctx.save();
    ctx.globalAlpha = mw.alpha;
    ctx.translate(
      mw.cx + Math.sin(animT * 0.018) * 18 + clamp(camDx * 0.022, -45, 45),
      mw.cy + Math.cos(animT * 0.014) * 12 + clamp(camDy * 0.022, -35, 35)
    );
    ctx.rotate(mw.angle);
    ctx.drawImage(mw.canvas, -mw.w * 0.5, -mw.h * 0.5, mw.w, mw.h);
    ctx.restore();

    for (var pi = 0; pi < bg.patches.length; pi++) {
      var pt = bg.patches[pi];
      if (pt.normalBlend) continue;
      var px = wrapRange(pt.x + animT * pt.vx + camDx * pt.par, -pt.sz * 0.5, w + pt.sz);
      var py = wrapRange(pt.y + animT * pt.vy + camDy * pt.par, -pt.sz * 0.5, h + pt.sz);
      ctx.save();
      ctx.globalAlpha = pt.alpha;
      ctx.drawImage(pt.canvas, px - pt.sz * 0.5, py - pt.sz * 0.5, pt.sz, pt.sz);
      ctx.restore();
    }

    for (var gi = 0; gi < bg.farGalaxies.length; gi++) {
      var fg = bg.farGalaxies[gi];
      var gx = wrapRange(fg.x + camDx * fg.par, -fg.size, w + fg.size * 2);
      var gy = wrapRange(fg.y + camDy * fg.par, -fg.size, h + fg.size * 2);
      ctx.save();
      ctx.globalAlpha = fg.alpha;
      ctx.translate(gx, gy);
      ctx.rotate(fg.tilt);
      ctx.scale(1, fg.flatten);
      ctx.rotate(animT * 0.012);
      ctx.drawImage(fg.sprite, -fg.size * 0.5, -fg.size * 0.5, fg.size, fg.size);
      ctx.restore();
    }
    ctx.restore();

    // 暗分子云遮挡带
    for (var di = 0; di < bg.patches.length; di++) {
      var dc = bg.patches[di];
      if (!dc.normalBlend) continue;
      var dx = wrapRange(dc.x + animT * dc.vx + camDx * dc.par, -dc.sz * 0.5, w + dc.sz);
      var dy = wrapRange(dc.y + animT * dc.vy + camDy * dc.par, -dc.sz * 0.5, h + dc.sz);
      ctx.save();
      ctx.globalAlpha = dc.alpha;
      ctx.drawImage(dc.canvas, dx - dc.sz * 0.5, dy - dc.sz * 0.5, dc.sz, dc.sz);
      ctx.restore();
    }

    // 微流星体（高速小亮点 + 短促真空热电离拖尾）
    if (!state.reducedMotion) {
      if (!bg.microMeteor && t >= bg.nextMeteorAt) {
        var r = bg.rand;
        var ang = (r() < 0.5 ? 0.35 : 2.65) + (r() - 0.5) * 0.45;
        var spd = 760 + r() * 420;
        bg.microMeteor = {
          x: w * (0.12 + r() * 0.76),
          y: h * (0.06 + r() * 0.42),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          len: 52 + r() * 46,
          life: 0,
          maxLife: 0.38 + r() * 0.28
        };
      }
      if (bg.microMeteor) {
        var m = bg.microMeteor;
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        var mp = m.life / m.maxLife;
        if (mp >= 1) {
          bg.microMeteor = null;
          bg.nextMeteorAt = t + 4.5 + bg.rand() * 7.5;
        } else {
          var fade = Math.sin(mp * Math.PI);
          var mag = Math.hypot(m.vx, m.vy) || 1;
          var tx = m.x - (m.vx / mag) * m.len;
          var ty = m.y - (m.vy / mag) * m.len;
          var mg = ctx.createLinearGradient(m.x, m.y, tx, ty);
          mg.addColorStop(0, "rgba(255,250,235," + (0.95 * fade).toFixed(3) + ")");
          mg.addColorStop(0.35, "rgba(255,198,112," + (0.48 * fade).toFixed(3) + ")");
          mg.addColorStop(1, "rgba(255,160,80,0)");
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.strokeStyle = mg;
          ctx.lineWidth = 1.35;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255," + fade.toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(m.x, m.y, 1.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  /* ============================================================
   * 3. 数据模型构建（100% 兼容 buildModel 供 3D 复用）+ 四级天体与日心星系初始化
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

  /* 离屏缓存：6 类非纯白恒星球面纹理（含湍流对流米粒 + 临边昏暗） */
  function buildStarBodySprite(r, arch, seed) {
    var sz = clamp(Math.round(r * 2.8), 64, 128);
    var cx = sz * 0.5, cy = sz * 0.5, R = sz * 0.47;
    var c = document.createElement("canvas");
    c.width = c.height = sz;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(sz, sz);
    var data = img.data;
    var tbl = makeNoiseTable(seed ^ 0x6c8e9cf5);

    for (var py = 0; py < sz; py++) {
      var dy = (py + 0.5 - cy) / R;
      var dy2 = dy * dy;
      var row = py * sz;
      for (var px = 0; px < sz; px++) {
        var dx = (px + 0.5 - cx) / R;
        var d2 = dx * dx + dy2;
        if (d2 > 1.0) continue;
        var dist = Math.sqrt(d2);
        var edgeA = dist < 0.95 ? 1 : (1 - dist) / 0.05;
        var mu = Math.sqrt(Math.max(0.001, 1 - d2));
        var inv = 1.35 - 0.32 * mu;
        var cell = fastRidged2D(dx * inv * arch.freq + 2.1, dy * inv * arch.freq - 1.7, tbl, 3);
        var plume = fastFbm2D(dx * inv * 4.2, dy * inv * 4.2, tbl, 2);
        var limb = Math.pow(mu, 0.58);

        var t1 = smoothstep(0.0, 0.62, limb);
        var t2 = Math.pow(limb, 1.55) * (0.45 + 0.55 * cell);
        var cr = lerp(arch.limb[0], arch.mid[0], t1);
        var cg = lerp(arch.limb[1], arch.mid[1], t1);
        var cb = lerp(arch.limb[2], arch.mid[2], t1);
        cr = lerp(cr, arch.core[0], t2);
        cg = lerp(cg, arch.core[1], t2);
        cb = lerp(cb, arch.core[2], t2);

        var mod = 0.76 + 0.38 * (cell * 0.7 + plume * 0.3);
        var idx = (row + px) * 4;
        data[idx] = clamp((cr * mod) | 0, 0, 255);
        data[idx + 1] = clamp((cg * mod) | 0, 0, 255);
        data[idx + 2] = clamp((cb * mod) | 0, 0, 255);
        data[idx + 3] = (edgeA * 255 + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, drawSize: r * 2.08 };
  }

  /* 离屏缓存：5 类非纯白行星与环形山岩质卫星反照率贴图（光照在每帧按太阳真实方位实时硬阴影合成） */
  function buildAlbedoSphereSprite(r, arch, seed, isSatellite) {
    var sz = clamp(Math.round(r * 3.0), 44, 112);
    var cx = sz * 0.5, cy = sz * 0.5, R = sz * 0.47;
    var c = document.createElement("canvas");
    c.width = c.height = sz;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(sz, sz);
    var data = img.data;
    var rand = mulberry32(seed ^ 0x517cc1b7);
    var tbl = makeNoiseTable(seed ^ 0x9e3779b9);
    var tbl2 = makeNoiseTable(seed ^ 0x27d4eb2f);
    var tilt = (rand() - 0.5) * 0.75;
    var cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    var lonOff = rand() * 9.0;

    // 卫星若是小尺寸偶发不规则土豆状小天体（矮行星/小天体真实感）
    var irreg = isSatellite && (seed % 3 === 1);

    for (var py = 0; py < sz; py++) {
      var dy = (py + 0.5 - cy) / R;
      var row = py * sz;
      for (var px = 0; px < sz; px++) {
        var dx = (px + 0.5 - cx) / R;
        var ang = Math.atan2(dy, dx);
        var maxR = irreg
          ? (0.88 + 0.10 * Math.cos(ang * 2 + lonOff) + 0.05 * Math.sin(ang * 3 - tilt))
          : 1.0;
        var normD = Math.hypot(dx, dy) / maxR;
        if (normD > 1.0) continue;
        var edgeA = normD < 0.94 ? 1 : (1 - normD) / 0.06;
        var nz = Math.sqrt(Math.max(0.001, 1 - normD * normD));

        var rx = dx * cosT - dy * sinT;
        var ry = dx * sinT + dy * cosT;
        var inv = 1.36 - 0.32 * nz;
        var lon = rx * inv + lonOff;
        var lat = ry * (1.28 - 0.22 * nz);

        var cr, cg, cb;
        if (isSatellite) {
          // 低反照率素色岩质卫星 + 撞击环形山坑纹
          var reg = fastFbm2D(lon * 2.8, lat * 2.8, tbl, 3);
          var crater = fastRidged2D(lon * 6.4 + 1.2, lat * 6.4 - 0.8, tbl2, 2);
          var warmGray = (seed % 2 === 0);
          var baseV = 78 + reg * 64 - smoothstep(0.62, 0.90, crater) * 28 + smoothstep(0.88, 0.98, crater) * 22;
          cr = baseV * (warmGray ? 1.06 : 0.94);
          cg = baseV * (warmGray ? 1.01 : 0.98);
          cb = baseV * (warmGray ? 0.92 : 1.05);
        } else if (arch.banded) {
          var warp = fastFbm2D(lon * 1.5, lat * 2.2, tbl, 2) * 0.65;
          var stripe = 0.5 + 0.5 * Math.sin(lat * 9.2 + warp * 3.4);
          var band = fastFbm2D(lon * 1.4 + warp * 1.5, lat * 5.2, tbl2, 3);
          var v = clamp(band * 0.62 + stripe * 0.38, 0, 1);
          // 气态巨行星大风暴眼
          var stormD = Math.hypot((rx - 0.22) * 1.4, (ry + 0.18) * 2.3);
          var storm = Math.exp(-stormD * stormD * 18);
          if (v < 0.48) {
            var k1 = v / 0.48;
            cr = lerp(arch.deep[0], arch.mid[0], k1);
            cg = lerp(arch.deep[1], arch.mid[1], k1);
            cb = lerp(arch.deep[2], arch.mid[2], k1);
          } else {
            var k2 = (v - 0.48) / 0.52;
            cr = lerp(arch.mid[0], arch.high[0], k2);
            cg = lerp(arch.mid[1], arch.high[1], k2);
            cb = lerp(arch.mid[2], arch.high[2], k2);
          }
          cr = lerp(cr, arch.accent[0], storm * 0.82);
          cg = lerp(cg, arch.accent[1], storm * 0.82);
          cb = lerp(cb, arch.accent[2], storm * 0.82);
        } else {
          var elev = fastFbm2D(lon * 2.3, lat * 2.3, tbl, 4);
          var ridge = fastRidged2D(lon * 5.2 + 2.7, lat * 5.2 - 1.9, tbl2, 2);
          var hVal = elev * 0.78 + ridge * 0.22;
          if (hVal < 0.47) {
            var o = hVal / 0.47;
            cr = lerp(arch.deep[0], arch.mid[0] * 0.85, o);
            cg = lerp(arch.deep[1], arch.mid[1] * 0.88, o);
            cb = lerp(arch.deep[2], arch.mid[2], o);
          } else if (hVal < 0.74) {
            var l = (hVal - 0.47) / 0.27;
            cr = lerp(arch.mid[0], arch.high[0], l);
            cg = lerp(arch.mid[1], arch.high[1], l);
            cb = lerp(arch.mid[2], arch.high[2], l);
          } else {
            var m = (hVal - 0.74) / 0.26;
            cr = lerp(arch.high[0], arch.accent[0], m);
            cg = lerp(arch.high[1], arch.accent[1], m);
            cb = lerp(arch.high[2], arch.accent[2], m);
          }
          if (arch.polarIce) {
            var pole = smoothstep(0.74, 0.94, Math.abs(ry) + ridge * 0.12) * 0.86;
            cr = lerp(cr, 236, pole);
            cg = lerp(cg, 246, pole);
            cb = lerp(cb, 255, pole);
          }
          if (!arch.nightLava) {
            var cld = fastFbm2D(lon * 2.6 + 4.1, lat * 3.8 - 1.5, tbl2, 3);
            if (cld > 0.56) {
              var cm = smoothstep(0.56, 0.86, cld) * 0.52;
              cr = lerp(cr, 244, cm);
              cg = lerp(cg, 249, cm);
              cb = lerp(cb, 255, cm);
            }
          }
        }

        // 轻球面边缘体积感（主明暗终止线由每帧实时日心阴影绘制）
        var limbShade = 0.78 + 0.24 * Math.pow(nz, 0.45);
        var idx = (row + px) * 4;
        data[idx] = clamp((cr * limbShade) | 0, 0, 255);
        data[idx + 1] = clamp((cg * limbShade) | 0, 0, 255);
        data[idx + 2] = clamp((cb * limbShade) | 0, 0, 255);
        data[idx + 3] = (edgeA * 255 + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, drawSize: r * 2.12 };
  }

  /* 离屏缓存：硬科幻毛玻璃胶囊标签（与 3D 标签视觉一致） */
  function buildTierLabelSprite(text, tier, active) {
    var scale = 2;
    var full = tier === "blackhole" ? (text + " · 孤立") : text;
    var maxChars = active ? 22 : 16;
    var shown = full.length > maxChars ? (full.slice(0, maxChars - 1) + "…") : full;
    var fontSize = tier === "satellite" ? (active ? 11.5 : 10.5) : (active ? 12.5 : 11.2);
    var fontStr = (active ? "600 " : "500 ") + fontSize + 'px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';

    var mCanvas = document.createElement("canvas");
    var mctx = mCanvas.getContext("2d");
    mctx.font = fontStr;
    var tw = Math.ceil(mctx.measureText(shown).width);

    var padL = 19, padR = 10;
    var w = Math.min(248, Math.max(54, tw + padL + padR));
    var h = tier === "satellite" ? 20 : 22;

    var c = document.createElement("canvas");
    c.width = Math.ceil(w * scale);
    c.height = Math.ceil(h * scale);
    var ctx = c.getContext("2d");
    ctx.scale(scale, scale);

    if (active) {
      var ag = ctx.createLinearGradient(0, 0, w, 0);
      ag.addColorStop(0, "rgba(253, 230, 138, 0.95)");
      ag.addColorStop(1, "rgba(125, 211, 252, 0.95)");
      ctx.fillStyle = ag;
      ctx.strokeStyle = "rgba(255, 251, 235, 0.96)";
    } else if (tier === "blackhole") {
      ctx.fillStyle = "rgba(5, 6, 11, 0.90)";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.50)";
    } else if (tier === "star") {
      ctx.fillStyle = "rgba(9, 12, 22, 0.84)";
      ctx.strokeStyle = "rgba(251, 191, 36, 0.28)";
    } else if (tier === "satellite") {
      ctx.fillStyle = "rgba(5, 7, 14, 0.68)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    } else {
      ctx.fillStyle = "rgba(7, 9, 17, 0.80)";
      ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
    }

    roundRectPath(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 6);
    ctx.fill();
    ctx.lineWidth = active ? 1.2 : 0.9;
    ctx.stroke();

    // 左侧天体等级指示点
    var dotX = 10, dotY = h * 0.5;
    if (active) {
      ctx.fillStyle = "#050811";
      ctx.beginPath(); ctx.arc(dotX, dotY, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (tier === "blackhole") {
      ctx.fillStyle = "#020308";
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(dotX, dotY, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = tier === "star" ? "#fbbf24" : (tier === "satellite" ? "#94a3b8" : "#2dd4bf");
      ctx.beginPath(); ctx.arc(dotX, dotY, tier === "satellite" ? 2.0 : 2.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.font = fontStr;
    ctx.textBaseline = "middle";
    if (!active) {
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "rgba(3, 5, 12, 0.92)";
      ctx.strokeText(shown, padL - 2, h * 0.5 + 0.5, w - padL - padR + 4);
    }
    ctx.fillStyle = active ? "#050811" : (tier === "blackhole" ? "#fde68a" : (tier === "satellite" ? "#9fb3cc" : "#eef6ff"));
    ctx.fillText(shown, padL - 2, h * 0.5 + 0.5, w - padL - padR + 4);

    return { canvas: c, w: w, h: h };
  }

  function initCelestialTraits(n, buildSprites) {
    var seed = fnv1a(n.id);
    var rand = mulberry32(seed);
    n.seed = seed;

    var deg = n.cleanDeg;
    if (deg === 0) {
      n.tier = "blackhole";
      n.radius = 40;
      n.bhTilt = -0.26 + (rand() - 0.5) * 0.38;
    } else if (deg === 1) {
      n.tier = "satellite";
      n.radius = 11.2 + rand() * 2.2;
      n.orbitA = 46 + rand() * 18;
      n.orbitEcc = 0.12 + rand() * 0.16;
      n.orbitFlat = 0.52 + rand() * 0.28;
      n.orbitTilt = (rand() - 0.5) * Math.PI;
      n.orbitPeriod = 9.0 + rand() * 10.5; // 严格 8~20 秒椭圆公转
      n.orbitPhase = rand() * Math.PI * 2;
      n.orbitDir = rand() < 0.5 ? 1 : -1;
    } else if (deg <= 3) {
      n.tier = "planet";
      n.radius = deg === 2 ? 20.5 : 24.5;
      n.planetArch = PLANET_ARCHETYPES[seed % PLANET_ARCHETYPES.length];
      n.hasRing = hashFloat(n.id + ":ring") < 0.36;
      n.ringTilt = (rand() - 0.5) * 0.95;
      if (Math.abs(n.ringTilt) < 0.16) n.ringTilt = n.ringTilt < 0 ? -0.24 : 0.24;
      n.ringFlatten = 0.28 + rand() * 0.12;
      n.ringInner = n.radius * 1.34;
      n.ringOuter = n.radius * (2.02 + rand() * 0.24);

      var moonCnt = 1 + (seed % 2);
      n.moons = [];
      for (var m = 0; m < moonCnt; m++) {
        var baseR = n.hasRing ? n.ringOuter + 9 : n.radius * 1.58;
        n.moons.push({
          orbitR: baseR + m * 12 + rand() * 7,
          tilt: n.hasRing ? n.ringTilt + (m === 0 ? 0.06 : -0.14) : (rand() - 0.5) * 1.0,
          flatten: 0.34 + rand() * 0.20,
          speed: (0.42 + rand() * 0.38) * (m % 2 === 0 ? 1 : -1),
          phase: rand() * Math.PI * 2,
          size: 2.1 + rand() * 1.2
        });
      }
    } else {
      n.tier = "star";
      n.radius = clamp(27 + Math.sqrt(deg - 3) * 3.1, 27, 38);
      n.starArch = STAR_ARCHETYPES[seed % STAR_ARCHETYPES.length];
    }

    n.collisionRadius = n.tier === "satellite" ? 42 : (n.radius + 64);

    if (!buildSprites) return;

    if (n.tier === "star") {
      n.bodySprite = buildStarBodySprite(n.radius, n.starArch, seed);
    } else if (n.tier === "planet") {
      n.bodySprite = buildAlbedoSphereSprite(n.radius, n.planetArch, seed, false);
    } else if (n.tier === "satellite") {
      n.bodySprite = buildAlbedoSphereSprite(n.radius, null, seed, true);
    }
    n.labelSprite = buildTierLabelSprite(n.title, n.tier, false);
    n.labelActiveSprite = buildTierLabelSprite(n.title, n.tier, true);
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
            pulseSpeed: 0.14 + hashFloat(b.id + "->" + a.id) * 0.16,
            synthetic: false
          });
          a.degree++; b.degree++;
          a.cleanDeg++; b.cleanDeg++;
          a.cleanNeighbors.push(b);
          b.cleanNeighbors.push(a);
        }
      }
    }

    // 保留孤立节点弱兜底边（w:0.12, pulseSpeed:0.15），保证 3D normalizeModel 兼容识别孤立黑洞
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

    // 日心旋臂星系锚点（大间距环绕中心太阳 R = 680 ~ 1060）
    var catCount = Math.max(categories.length, 1);
    // 按节点数降序交错分配对向日心扇区角，使大星系团对称环抱中心太阳，中心太阳自然居于画面视觉正中
    var bySize = categories.slice().sort(function (a, b) {
      return catGroups[b].length - catGroups[a].length;
    });
    var balancedSlots = new Array(catCount);
    var leftPtr = 0, rightPtr = Math.ceil(catCount / 2);
    for (var bi = 0; bi < bySize.length; bi++) {
      var slot = (bi % 2 === 0) ? (leftPtr++) : (rightPtr++);
      balancedSlots[slot % catCount] = bySize[bi];
    }

    var anchors = {};
    var galaxies = [];
    var galaxyByCat = {};

    balancedSlots.forEach(function (cat, ci) {
      var baseAng = (ci / catCount) * Math.PI * 2 - Math.PI * 0.18;
      var groupLen = catGroups[cat].length;
      var orbitR = catCount === 1 ? 580 : (660 + (ci % 2) * 190 + Math.min(220, groupLen * 11));
      var orbitSpd = (0.014 + (ci % 3) * 0.004) * (ci % 2 === 0 ? 1 : -1);
      var galR = clamp(150 + Math.sqrt(groupLen) * 58, 175, 420);
      var pal = CATEGORY_PALETTES[cat] || DEFAULT_PALETTE;

      // 预生成星系旋臂尘埃粒子点（局部坐标）
      var gRand = mulberry32(fnv1a("gal:" + cat));
      var dustPts = [];
      var dustCount = clamp(90 + groupLen * 14, 110, 340);
      for (var d = 0; d < dustCount; d++) {
        var arm = d % 2;
        var u = Math.pow(gRand(), 0.72);
        var rLocal = 18 + u * galR;
        var theta = arm * Math.PI + u * 3.5 + (gRand() - 0.5) * (0.45 + u * 0.45);
        dustPts.push({
          r: rLocal,
          theta: theta,
          size: 0.7 + gRand() * 1.3,
          alpha: (0.14 + gRand() * 0.34) * (1 - u * 0.62),
          warm: gRand() < 0.28
        });
      }

      var gx = Math.cos(baseAng) * orbitR;
      var gy = Math.sin(baseAng) * orbitR * 0.82;
      var gal = {
        cat: cat,
        palette: pal,
        orbitR: orbitR,
        orbitFlat: 0.82,
        baseAngle: baseAng,
        orbitSpeed: orbitSpd,
        spinSpeed: 0.045 * (ci % 2 === 0 ? 1 : -1),
        radius: galR,
        x: gx,
        y: gy,
        dust: dustPts
      };
      galaxies.push(gal);
      galaxyByCat[cat] = gal;
      anchors[cat] = { x: gx, y: gy, angle: baseAng, span: (Math.PI * 2) / catCount };
    });

    edges.forEach(function (e) {
      var strength = clamp((e.w - 0.12) / 0.36, 0, 1);
      e.distance = e.sameCategory ? (185 - strength * 35) : (480 - strength * 80);
    });

    var neighborMap = {};
    nodes.forEach(function (n) { neighborMap[n.id] = {}; });
    edges.forEach(function (e) {
      if (e.synthetic) return;
      neighborMap[e.a.id][e.b.id] = true;
      neighborMap[e.b.id][e.a.id] = true;
    });

    // 初始化节点天体特征与星系内初始大间距排布
    categories.forEach(function (cat, ci) {
      var list = catGroups[cat];
      var gal = galaxyByCat[cat];
      list.sort(function (a, b) { return b.cleanDeg - a.cleanDeg; });
      list.forEach(function (n, idx) {
        n.palette = CATEGORY_PALETTES[n.category] || DEFAULT_PALETTE;
        n.vx = 0; n.vy = 0;
        initCelestialTraits(n, Boolean(withVisuals));

        if (n.tier === "blackhole") {
          // 孤立黑洞置于外层深空轨道，醒目且不与内星系拥挤
          var bhAng = gal.baseAngle + 0.42 + idx * 0.5;
          var bhR = 1220 + (ci % 2) * 140;
          n.localX = Math.cos(bhAng) * bhR - gal.x;
          n.localY = Math.sin(bhAng) * bhR * 0.82 - gal.y;
          n.isOuterBlackHole = true;
          n.bhOrbitR = bhR;
          n.bhOrbitAngle = bhAng;
          n.bhOrbitSpeed = 0.008;
        } else if (idx === 0) {
          n.localX = 0;
          n.localY = 0;
        } else {
          var armIdx = idx % 2;
          var stepT = idx / Math.max(list.length, 2);
          var spiralAng = armIdx * Math.PI + stepT * 2.9 + (hashFloat(n.id + ":a") - 0.5) * 0.45;
          var spiralR = 95 + Math.sqrt(idx) * 102;
          n.localX = Math.cos(spiralAng) * spiralR;
          n.localY = Math.sin(spiralAng) * spiralR;
        }
        n.x = gal.x + n.localX;
        n.y = gal.y + n.localY;
      });
    });

    // 为度 1 卫星绑定唯一宿主天体
    nodes.forEach(function (n) {
      if (n.tier === "satellite") {
        n.hostNode = n.cleanNeighbors[0] || null;
      }
    });

    return {
      nodes: nodes,
      edges: edges,
      categories: categories,
      anchors: anchors,
      galaxies: galaxies,
      galaxyByCat: galaxyByCat,
      neighborMap: neighborMap
    };
  }

  /* 初始化环日主小行星带与导航信标 */
  function initSolarSystemExtras() {
    var rand = mulberry32(0x20261125);
    var rocks = [];
    for (var i = 0; i < 180; i++) {
      var a = rand() * Math.PI * 2;
      var r = 228 + Math.pow(rand(), 0.85) * 92;
      var pts = [];
      var vCount = 5 + ((rand() * 3) | 0);
      var sz = 1.6 + Math.pow(rand(), 2.0) * 3.8;
      for (var v = 0; v < vCount; v++) {
        var va = (v / vCount) * Math.PI * 2;
        var vr = sz * (0.68 + rand() * 0.52);
        pts.push({ x: Math.cos(va) * vr, y: Math.sin(va) * vr });
      }
      rocks.push({
        r: r,
        flat: 0.82 + (rand() - 0.5) * 0.08,
        angle: a,
        speed: (0.042 + (320 - r) * 0.00022) * (rand() < 0.92 ? 1 : -1),
        spin: (rand() - 0.5) * 0.8,
        rot: rand() * Math.PI * 2,
        pts: pts,
        albedo: 118 + ((rand() * 68) | 0)
      });
    }
    state.asteroids = rocks;

    state.beacons = [
      { r: 1340, angle: 0.62, phase: 0.0, label: "NAV-01" },
      { r: 1340, angle: 2.74, phase: 2.1, label: "NAV-02" },
      { r: 1340, angle: 4.82, phase: 4.2, label: "NAV-03" }
    ];
    state.comet = null;
    state.nextCometAt = 3.5;
    state.flybyRock = null;
    state.nextFlybyAt = 8.0;
  }

  /* ============================================================
   * 4. 星系内大间距力导向预热 + 实时日心公转更新
   * ============================================================ */
  function stepClusterPhysics() {
    var nodes = state.nodes;
    var edges = state.edges;
    var galaxyByCat = state.galaxyByCat;
    var alpha = state.alpha;
    var nLen = nodes.length;
    if (!nLen) return;

    // 保护中心太阳净空区（任何节点圆心距太阳 ≥ 390）
    var minSunClear = 400;

    for (var i = 0; i < nLen; i++) {
      var a = nodes[i];
      if (a.tier === "satellite" || a.isOuterBlackHole) continue;
      for (var j = i + 1; j < nLen; j++) {
        var b = nodes[j];
        if (b.tier === "satellite" || b.isOuterBlackHole) continue;
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var d2 = dx * dx + dy * dy + 36;
        var d = Math.sqrt(d2);
        var repel = (a.category === b.category ? 13500 : 26000) * alpha;
        var f = repel / d2;
        var fx = (f * dx) / d, fy = (f * dy) / d;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    for (var ei = 0; ei < edges.length; ei++) {
      var e = edges[ei];
      if (e.synthetic) continue;
      var ea = e.a, eb = e.b;
      if (ea.tier === "satellite" || eb.tier === "satellite" || ea.isOuterBlackHole || eb.isOuterBlackHole) continue;
      var ex = eb.x - ea.x, ey = eb.y - ea.y;
      var ed = Math.hypot(ex, ey) || 0.001;
      var k = (e.sameCategory ? 0.036 : 0.009) * alpha;
      var ef = (ed - e.distance) * k;
      var efx = (ef * ex) / ed, efy = (ef * ey) / ed;
      ea.vx += efx; ea.vy += efy;
      eb.vx -= efx; eb.vy -= efy;
    }

    for (var ni = 0; ni < nLen; ni++) {
      var n = nodes[ni];
      if (n.tier === "satellite" || n.isOuterBlackHole) continue;
      var gal = galaxyByCat[n.category];
      if (gal) {
        n.vx += (gal.x - n.x) * 0.026 * alpha;
        n.vy += (gal.y - n.y) * 0.026 * alpha;
      }
      var sd = Math.hypot(n.x, n.y) || 0.001;
      if (sd < minSunClear) {
        var push = (minSunClear - sd) * 0.18;
        n.vx += (n.x / sd) * push;
        n.vy += (n.y / sd) * push;
      }
      n.vx *= 0.78;
      n.vy *= 0.78;
      n.x += clamp(n.vx, -20, 20);
      n.y += clamp(n.vy, -20, 20);
    }

    // 碰撞解算（保证大间距，不同天体不粘连）
    for (var it = 0; it < 3; it++) {
      for (var p = 0; p < nLen; p++) {
        var na = nodes[p];
        if (na.tier === "satellite") continue;
        var sDist = Math.hypot(na.x, na.y) || 0.001;
        if (sDist < minSunClear) {
          na.x = (na.x / sDist) * minSunClear;
          na.y = (na.y / sDist) * minSunClear;
        }
        for (var q = p + 1; q < nLen; q++) {
          var nb = nodes[q];
          if (nb.tier === "satellite") continue;
          var cdx = nb.x - na.x, cdy = nb.y - na.y;
          var cd = Math.hypot(cdx, cdy) || 0.001;
          var minD = Math.max(155, na.collisionRadius + nb.collisionRadius);
          if (cd < minD) {
            var half = (minD - cd) * 0.5;
            var ux = cdx / cd, uy = cdy / cd;
            if (!na.isOuterBlackHole) { na.x -= ux * half; na.y -= uy * half; }
            if (!nb.isOuterBlackHole) { nb.x += ux * half; nb.y += uy * half; }
          }
        }
      }
    }
  }

  function warmupLayout() {
    state.alpha = 1.0;
    for (var i = 0; i < 150; i++) {
      stepClusterPhysics();
      state.alpha *= 0.985;
    }
    // 记录各节点相对所属星系核的局部坐标，以便运行时随星系绕太阳公转
    for (var ni = 0; ni < state.nodes.length; ni++) {
      var n = state.nodes[ni];
      var gal = state.galaxyByCat[n.category];
      if (gal && !n.isOuterBlackHole) {
        n.localX = n.x - gal.x;
        n.localY = n.y - gal.y;
      }
    }
    updateOrbitalPositions(0);
    state.alpha = 0;
  }

  function updateOrbitalPositions(t) {
    var animT = state.reducedMotion ? 0 : t;

    // 1. 分区旋臂星系核围绕中心太阳公转
    for (var gi = 0; gi < state.galaxies.length; gi++) {
      var gal = state.galaxies[gi];
      var ang = gal.baseAngle + animT * gal.orbitSpeed;
      gal.x = Math.cos(ang) * gal.orbitR;
      gal.y = Math.sin(ang) * gal.orbitR * gal.orbitFlat;
      if (state.anchors[gal.cat]) {
        state.anchors[gal.cat].x = gal.x;
        state.anchors[gal.cat].y = gal.y;
      }
    }

    // 2. 恒星、行星、孤立黑洞随星系慢速公转与星系盘微自转
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      if (n === state.dragNode) continue;
      if (n.tier === "satellite") continue;

      if (n.isOuterBlackHole) {
        var ba = n.bhOrbitAngle + animT * n.bhOrbitSpeed;
        n.x = Math.cos(ba) * n.bhOrbitR;
        n.y = Math.sin(ba) * n.bhOrbitR * 0.82;
      } else {
        var g = state.galaxyByCat[n.category];
        if (g) {
          var spin = animT * g.spinSpeed * 0.22;
          var cs = Math.cos(spin), sn = Math.sin(spin);
          n.x = g.x + n.localX * cs - n.localY * sn;
          n.y = g.y + n.localX * sn + n.localY * cs;
        }
      }
    }

    // 3. 连通度 = 1 的卫星沿倾斜开普勒椭圆轨道绕唯一邻居公转（周期 8~20 秒）
    for (var si = 0; si < state.nodes.length; si++) {
      var sat = state.nodes[si];
      if (sat.tier !== "satellite" || sat === state.dragNode) continue;
      var host = sat.hostNode;
      var hx = host ? host.x : 0;
      var hy = host ? host.y : 0;
      var meanM = sat.orbitPhase + animT * ((Math.PI * 2) / sat.orbitPeriod) * sat.orbitDir;
      var eccA = meanM + sat.orbitEcc * Math.sin(meanM);
      var ox = sat.orbitA * (Math.cos(eccA) - sat.orbitEcc);
      var oy = sat.orbitA * Math.sqrt(1 - sat.orbitEcc * sat.orbitEcc) * Math.sin(eccA) * sat.orbitFlat;
      var ct = Math.cos(sat.orbitTilt), st = Math.sin(sat.orbitTilt);
      sat.x = hx + ox * ct - oy * st;
      sat.y = hy + ox * st + oy * ct;
    }
  }

  /* ============================================================
   * 5. 坐标转换、视野适配与前景日心宇宙绘制
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

  function computeFitCamera(nodesList, includeSun) {
    var list = nodesList && nodesList.length ? nodesList : state.nodes;
    var w = state.width, h = state.height;
    if (!list.length) return { x: w * 0.5, y: h * 0.5, scale: 0.45 };

    var minX = includeSun ? -SUN_RADIUS * 2.2 : Infinity;
    var maxX = includeSun ? SUN_RADIUS * 2.2 : -Infinity;
    var minY = includeSun ? -SUN_RADIUS * 2.2 : Infinity;
    var maxY = includeSun ? SUN_RADIUS * 2.2 : -Infinity;

    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var pad = n.radius * 2.4 + 64;
      if (n.x - pad < minX) minX = n.x - pad;
      if (n.x + pad > maxX) maxX = n.x + pad;
      if (n.y - pad < minY) minY = n.y - pad;
      if (n.y + pad > maxY) maxY = n.y + pad;
    }
    var bw = Math.max(360, maxX - minX);
    var bh = Math.max(300, maxY - minY);
    var scale = clamp(Math.min((w * 0.86) / bw, (h * 0.84) / bh), MIN_ZOOM, 1.45);
    var cx = (minX + maxX) * 0.5;
    var cy = (minY + maxY) * 0.5;
    return {
      x: w * 0.5 - cx * scale,
      y: h * 0.5 - cy * scale,
      scale: scale
    };
  }

  function fitView(animate) {
    var cam = computeFitCamera(state.nodes, true);
    if (animate && !state.reducedMotion) {
      state.targetCam = cam;
    } else {
      state.cam.x = cam.x;
      state.cam.y = cam.y;
      state.cam.scale = cam.scale;
      state.targetCam = null;
      if (state.reducedMotion) drawFrame(0);
    }
  }

  function focusNodeCamera(node) {
    if (!node) return;
    var rightOverlayReserve = state.width > 740 ? Math.min(420, state.width * 0.34) : 0;
    var targetScale = clamp(Math.max(state.cam.scale, 1.35), 1.15, 2.8);
    var target = {
      x: (state.width - rightOverlayReserve) * 0.5 - node.x * targetScale,
      y: state.height * 0.5 - node.y * targetScale,
      scale: targetScale
    };
    if (state.reducedMotion) {
      state.cam = target;
      state.targetCam = null;
      drawFrame(0);
    } else {
      state.targetCam = target;
    }
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

  /* 绘制极淡黄道方位 HUD 标尺环与远方脉冲信标 */
  function drawEclipticHudAndOrbits(ctx, t, dimFactor) {
    ctx.save();
    var hudRadii = [330, 760, 1260];
    for (var i = 0; i < hudRadii.length; i++) {
      var hr = hudRadii[i];
      ctx.save();
      ctx.scale(1, 0.82);
      ctx.strokeStyle = "rgba(125, 211, 252, " + ((i === 2 ? 0.075 : 0.045) * dimFactor).toFixed(3) + ")";
      ctx.lineWidth = 1 / Math.max(0.35, state.cam.scale);
      ctx.beginPath();
      ctx.arc(0, 0, hr, 0, Math.PI * 2);
      ctx.stroke();

      if (i === 2) {
        var ticks = 72;
        ctx.beginPath();
        for (var k = 0; k < ticks; k++) {
          var a = (k / ticks) * Math.PI * 2;
          var len = (k % 6 === 0) ? 16 : 7;
          ctx.moveTo(Math.cos(a) * (hr - len * 0.5), Math.sin(a) * (hr - len * 0.5));
          ctx.lineTo(Math.cos(a) * (hr + len * 0.5), Math.sin(a) * (hr + len * 0.5));
        }
        ctx.strokeStyle = "rgba(148, 197, 253, " + (0.095 * dimFactor).toFixed(3) + ")";
        ctx.stroke();
      }
      ctx.restore();
    }

    // 分区星系公转椭圆细轨
    for (var gi = 0; gi < state.galaxies.length; gi++) {
      var gal = state.galaxies[gi];
      ctx.save();
      ctx.scale(1, gal.orbitFlat);
      ctx.strokeStyle = rgbStr(gal.palette.atmo, 0.042 * dimFactor);
      ctx.lineWidth = 0.9 / Math.max(0.35, state.cam.scale);
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, gal.orbitR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 远处导航脉冲信标
    var animT = state.reducedMotion ? 1.2 : t;
    for (var bi = 0; bi < state.beacons.length; bi++) {
      var bc = state.beacons[bi];
      var bx = Math.cos(bc.angle) * bc.r;
      var by = Math.sin(bc.angle) * bc.r * 0.82;
      var pulse = Math.pow(0.5 + 0.5 * Math.sin(animT * 2.4 + bc.phase), 6);
      ctx.fillStyle = "rgba(56, 189, 248, " + ((0.18 + 0.65 * pulse) * dimFactor).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(bx, by, 2.8 + pulse * 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (pulse > 0.35) {
        ctx.strokeStyle = "rgba(56, 189, 248, " + ((pulse - 0.35) * 0.55 * dimFactor).toFixed(3) + ")";
        ctx.lineWidth = 1 / Math.max(0.4, state.cam.scale);
        ctx.beginPath();
        ctx.arc(bx, by, 5 + (1 - pulse) * 18, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* 绘制中心最大天体「太阳」（米粒黑子球面 + 3D 磁环日珥 + 动态日冕与 CME 抛射 + 高动态范围横向强眩光） */
  function drawCentralSun(ctx, t, dimFactor) {
    var assets = ensureSharedAssets();
    var animT = state.reducedMotion ? 0 : t;
    var R = SUN_RADIUS;
    var storm = Math.pow(0.5 + 0.5 * Math.sin(animT * 0.55), 5);

    ctx.save();
    ctx.globalAlpha = dimFactor;

    // 1. 外日冕辉光与赤道冕流
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    var outerCorona = ctx.createRadialGradient(0, 0, R * 0.82, 0, 0, R * (4.2 + storm * 0.6));
    outerCorona.addColorStop(0, "rgba(255, 244, 198, 0.92)");
    outerCorona.addColorStop(0.16, "rgba(255, 176, 54, 0.52)");
    outerCorona.addColorStop(0.42, "rgba(234, 88, 18, 0.16)");
    outerCorona.addColorStop(0.75, "rgba(180, 42, 8, 0.04)");
    outerCorona.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = outerCorona;
    ctx.beginPath();
    ctx.arc(0, 0, R * 4.8, 0, Math.PI * 2);
    ctx.fill();

    // 放射日冕流线与周期性 CME 等离子体抛射环
    var rayCount = 18;
    for (var ri = 0; ri < rayCount; ri++) {
      var ra = (ri / rayCount) * Math.PI * 2 + animT * 0.03;
      var eqBoost = 0.72 + 0.42 * Math.abs(Math.cos(ra));
      var rLen = R * (1.75 + 0.55 * Math.sin(ri * 2.7 + animT * 0.9)) * eqBoost;
      var rg = ctx.createLinearGradient(Math.cos(ra) * R * 0.92, Math.sin(ra) * R * 0.92, Math.cos(ra) * rLen, Math.sin(ra) * rLen);
      rg.addColorStop(0, "rgba(255, 212, 118, 0.26)");
      rg.addColorStop(1, "rgba(255, 110, 24, 0)");
      ctx.strokeStyle = rg;
      ctx.lineWidth = R * 0.14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(Math.cos(ra) * R * 0.92, Math.sin(ra) * R * 0.92);
      ctx.lineTo(Math.cos(ra) * rLen, Math.sin(ra) * rLen);
      ctx.stroke();
    }

    // 周期性日冕物质抛射（CME 等离子弧）
    var cmePhase = (animT * 0.065) % 1;
    if (!state.reducedMotion && cmePhase < 0.78) {
      var cmeP = cmePhase / 0.78;
      var cmeR = R * (1.08 + cmeP * 2.2);
      var cmeAng = -0.38 + Math.sin(Math.floor(animT * 0.065) * 2.1) * 1.4;
      ctx.strokeStyle = "rgba(255, 168, 66, " + (Math.sin(cmeP * Math.PI) * 0.34).toFixed(3) + ")";
      ctx.lineWidth = R * (0.08 + cmeP * 0.10);
      ctx.beginPath();
      ctx.arc(0, 0, cmeR, cmeAng - 0.42, cmeAng + 0.42);
      ctx.stroke();
    }

    // 高动态横向镜头衍射强眩光（Anamorphic Solar Bloom）
    var spikeW = R * (5.6 + storm * 0.9);
    var sg = ctx.createLinearGradient(-spikeW, 0, spikeW, 0);
    sg.addColorStop(0, "rgba(255, 140, 30, 0)");
    sg.addColorStop(0.36, "rgba(255, 196, 98, 0.22)");
    sg.addColorStop(0.5, "rgba(255, 250, 228, 0.78)");
    sg.addColorStop(0.64, "rgba(255, 196, 98, 0.22)");
    sg.addColorStop(1, "rgba(255, 140, 30, 0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-spikeW, 0);
    ctx.quadraticCurveTo(0, -R * 0.16, spikeW, 0);
    ctx.quadraticCurveTo(0, R * 0.16, -spikeW, 0);
    ctx.fill();
    ctx.restore();

    // 2. 太阳边缘磁环日珥（Prominence Arches）
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (var pi = 0; pi < 4; pi++) {
      var pa = pi * 1.57 + 0.48 + Math.sin(animT * 0.2 + pi) * 0.08;
      var archH = R * (0.18 + 0.09 * Math.sin(animT * 0.85 + pi * 1.9));
      ctx.save();
      ctx.rotate(pa);
      ctx.strokeStyle = "rgba(255, 108, 28, 0.68)";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(R * 0.95, -R * 0.13);
      ctx.quadraticCurveTo(R + archH, 0, R * 0.95, R * 0.13);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 224, 132, 0.52)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 3. 太阳光球层主体（缓慢自转 + 差速对流微脉动）
    ctx.save();
    ctx.rotate(animT * 0.032);
    var dSz = R * 2.08;
    ctx.drawImage(assets.sunPhoto, -dSz * 0.5, -dSz * 0.5, dSz, dSz);
    ctx.restore();

    // 悬停锁定外环
    if (state.sunHovered) {
      ctx.strokeStyle = "rgba(253, 230, 138, 0.78)";
      ctx.lineWidth = 1.5 / Math.max(0.4, state.cam.scale);
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, R + 12, animT * 0.3, animT * 0.3 + Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* 绘制环日主小行星带（每颗岩块朝向太阳面受光、背面锐利硬阴影） */
  function drawAsteroidBelt(ctx, t, dimFactor) {
    var animT = state.reducedMotion ? 0 : t;
    ctx.save();
    ctx.globalAlpha = dimFactor;
    for (var i = 0; i < state.asteroids.length; i++) {
      var rk = state.asteroids[i];
      var a = rk.angle + animT * rk.speed;
      var rx = Math.cos(a) * rk.r;
      var ry = Math.sin(a) * rk.r * rk.flat;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rk.rot + animT * rk.spin);
      ctx.beginPath();
      for (var v = 0; v < rk.pts.length; v++) {
        var p = rk.pts[v];
        if (v === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      var lit = rk.albedo;
      ctx.fillStyle = "rgb(" + lit + "," + ((lit * 0.93) | 0) + "," + ((lit * 0.84) | 0) + ")";
      ctx.fill();
      // 背日暗部覆盖
      ctx.fillStyle = "rgba(4, 6, 14, 0.55)";
      ctx.strokeStyle = "rgba(255, 228, 178, 0.35)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* 绘制空间站（桁架 + 舱段 + 蓝色太阳能翼 + 信标灯）与缓慢翻滚反光探测器 */
  function drawSpacecraftNarratives(ctx, t, dimFactor) {
    var animT = state.reducedMotion ? 0 : t;
    ctx.save();
    ctx.globalAlpha = dimFactor;

    // 1. 轨道空间站（R = 378 环日运行）
    var stAng = 0.85 + animT * 0.028;
    var sx = Math.cos(stAng) * 378;
    var sy = Math.sin(stAng) * 378 * 0.82;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(stAng + Math.PI * 0.5);
    // 主桁架
    ctx.strokeStyle = "rgba(203, 213, 225, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-18, 0); ctx.lineTo(18, 0);
    ctx.stroke();
    // 四翼太阳能帆板（吸收阳光呈深海蓝光泽）
    ctx.fillStyle = "rgba(22, 78, 168, 0.88)";
    ctx.strokeStyle = "rgba(125, 211, 252, 0.55)";
    ctx.lineWidth = 0.7;
    var panels = [-13, -7, 7, 13];
    for (var i = 0; i < panels.length; i++) {
      var px = panels[i];
      ctx.fillRect(px - 2.1, -11, 4.2, 8.5);
      ctx.strokeRect(px - 2.1, -11, 4.2, 8.5);
      ctx.fillRect(px - 2.1, 2.5, 4.2, 8.5);
      ctx.strokeRect(px - 2.1, 2.5, 4.2, 8.5);
    }
    // 核心舱段与闪烁对接信号灯
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(-3.2, -5.5, 6.4, 11);
    var blink = Math.pow(0.5 + 0.5 * Math.sin(animT * 4.2), 8);
    if (blink > 0.2) {
      ctx.fillStyle = "rgba(56, 238, 198, " + blink.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(0, -6.5, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 2. 缓慢翻滚的深空探测器（金色隔热膜偶发太阳镜面闪光）
    var prAng = 3.75 - animT * 0.019;
    var prx = Math.cos(prAng) * 465;
    var pry = Math.sin(prAng) * 465 * 0.82;
    ctx.save();
    ctx.translate(prx, pry);
    ctx.rotate(animT * 0.55);
    ctx.strokeStyle = "rgba(226, 232, 240, 0.75)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, -0.9, 0.9);
    ctx.moveTo(5.2, 0); ctx.lineTo(13, 0);
    ctx.stroke();
    ctx.fillStyle = "#eab308";
    ctx.fillRect(-3.5, -2.5, 5, 5);
    var glint = Math.pow(Math.max(0, Math.sin(animT * 2.7)), 14);
    if (glint > 0.08) {
      ctx.fillStyle = "rgba(255, 250, 220, " + (glint * 0.92).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(0, 0, 2.2 + glint * 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  /* 绘制双尾彗星（笔直蓝青离子尾严格背离中心太阳 + 弯曲金白尘埃尾） */
  function updateAndDrawComet(ctx, t, dt, dimFactor) {
    if (state.reducedMotion) return;
    if (!state.comet && t >= state.nextCometAt) {
      var rand = mulberry32(((t * 1000) | 0) ^ 0x5f3759df);
      var entryA = rand() * Math.PI * 2;
      var p1x = Math.cos(entryA) * 1450, p1y = Math.sin(entryA) * 1450 * 0.82;
      var periA = entryA + (rand() < 0.5 ? 1.35 : -1.35);
      var cxCtrl = Math.cos(periA) * 260, cyCtrl = Math.sin(periA) * 260;
      var exitA = entryA + Math.PI + (rand() - 0.5) * 0.55;
      var p2x = Math.cos(exitA) * 1480, p2y = Math.sin(exitA) * 1480 * 0.82;
      state.comet = {
        p0x: p1x, p0y: p1y, cx: cxCtrl, cy: cyCtrl, p2x: p2x, p2y: p2y,
        life: 0, maxLife: 11.5 + rand() * 3.5
      };
    }
    if (!state.comet) return;
    var c = state.comet;
    c.life += dt;
    var u = c.life / c.maxLife;
    if (u >= 1) {
      state.comet = null;
      state.nextCometAt = t + 13 + ((t * 7) % 5);
      return;
    }
    var inv = 1 - u;
    var x = inv * inv * c.p0x + 2 * inv * u * c.cx + u * u * c.p2x;
    var y = inv * inv * c.p0y + 2 * inv * u * c.cy + u * u * c.p2y;
    var vx = 2 * inv * (c.cx - c.p0x) + 2 * u * (c.p2x - c.cx);
    var vy = 2 * inv * (c.cy - c.p0y) + 2 * u * (c.p2y - c.cy);

    // 距离太阳越近彗发与双尾越盛
    var sunDist = Math.hypot(x, y) || 1;
    var activity = clamp(520 / sunDist, 0.35, 1.45) * Math.sin(u * Math.PI);
    var antiSunX = x / sunDist, antiSunY = y / sunDist;
    var vMag = Math.hypot(vx, vy) || 1;
    var backVx = -vx / vMag, backVy = -vy / vMag;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = dimFactor;

    // 1. 笔直蓝青离子尾（严格沿反太阳方向）
    var ionLen = 135 * activity;
    var ig = ctx.createLinearGradient(x, y, x + antiSunX * ionLen, y + antiSunY * ionLen);
    ig.addColorStop(0, "rgba(125, 238, 255, " + (0.82 * Math.min(1, activity)).toFixed(3) + ")");
    ig.addColorStop(0.45, "rgba(38, 168, 246, " + (0.32 * Math.min(1, activity)).toFixed(3) + ")");
    ig.addColorStop(1, "rgba(14, 116, 190, 0)");
    ctx.strokeStyle = ig;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + antiSunX * ionLen, y + antiSunY * ionLen);
    ctx.stroke();

    // 2. 弯曲暖白金尘埃尾（介于反太阳方向与轨道反运动方向之间）
    var dustLen = 105 * activity;
    var dxEnd = x + (antiSunX * 0.58 + backVx * 0.42) * dustLen;
    var dyEnd = y + (antiSunY * 0.58 + backVy * 0.42) * dustLen;
    var dg = ctx.createLinearGradient(x, y, dxEnd, dyEnd);
    dg.addColorStop(0, "rgba(255, 244, 214, " + (0.76 * Math.min(1, activity)).toFixed(3) + ")");
    dg.addColorStop(0.5, "rgba(238, 196, 132, " + (0.26 * Math.min(1, activity)).toFixed(3) + ")");
    dg.addColorStop(1, "rgba(180, 140, 90, 0)");
    ctx.strokeStyle = dg;
    ctx.lineWidth = 5.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + antiSunX * dustLen * 0.42, y + antiSunY * dustLen * 0.42, dxEnd, dyEnd);
    ctx.stroke();

    // 3. 彗发与明亮彗核
    var coma = ctx.createRadialGradient(x, y, 0, x, y, 14 * activity);
    coma.addColorStop(0, "rgba(255,255,255,0.98)");
    coma.addColorStop(0.32, "rgba(148,242,255,0.52)");
    coma.addColorStop(1, "rgba(34,211,238,0)");
    ctx.fillStyle = coma;
    ctx.beginPath(); ctx.arc(x, y, 14 * activity, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* 绘制分区旋臂星系粒子盘与核球柔光 */
  function drawGalaxyDisks(ctx, t, dimFactor) {
    var animT = state.reducedMotion ? 0 : t;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (var gi = 0; gi < state.galaxies.length; gi++) {
      var gal = state.galaxies[gi];
      var catDim = (state.focusCategory && state.focusCategory !== gal.cat) ? 0.18 : 1.0;
      var alpha = catDim * dimFactor;

      ctx.save();
      ctx.translate(gal.x, gal.y);

      // 星系核球微晕
      var coreG = ctx.createRadialGradient(0, 0, 8, 0, 0, gal.radius * 0.92);
      coreG.addColorStop(0, rgbStr(gal.palette.atmo, 0.11 * alpha));
      coreG.addColorStop(0.48, rgbStr(gal.palette.arm, 0.045 * alpha));
      coreG.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = coreG;
      ctx.beginPath();
      ctx.arc(0, 0, gal.radius * 0.92, 0, Math.PI * 2);
      ctx.fill();

      // 旋臂恒星尘粒子
      var spin = animT * gal.spinSpeed;
      for (var d = 0; d < gal.dust.length; d++) {
        var pt = gal.dust[d];
        var da = pt.theta + spin * (1.25 - (pt.r / gal.radius) * 0.55);
        var px = Math.cos(da) * pt.r;
        var py = Math.sin(da) * pt.r * 0.78;
        ctx.fillStyle = pt.warm
          ? "rgba(254, 232, 186, " + (pt.alpha * alpha).toFixed(3) + ")"
          : rgbStr(gal.palette.arm, pt.alpha * alpha);
        ctx.fillRect(px, py, pt.size, pt.size);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /* 绘制卡冈图雅黑洞（纯黑视界 + 光子环 + 相对论多普勒增亮吸积盘 + 引力透镜上下光弧 + 极淡双向喷流） */
  function drawBlackHoleNode(ctx, n, t, dim) {
    var animT = state.reducedMotion ? 0 : t;
    var r = n.radius;
    ctx.save();
    ctx.globalAlpha = dim;
    ctx.rotate(n.bhTilt);

    // 1. 极淡相对论双极喷流
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    var jetLen = r * 3.4;
    var jg = ctx.createLinearGradient(0, -jetLen, 0, jetLen);
    jg.addColorStop(0, "rgba(125, 211, 252, 0)");
    jg.addColorStop(0.38, "rgba(186, 230, 253, 0.14)");
    jg.addColorStop(0.5, "rgba(255, 236, 179, 0.24)");
    jg.addColorStop(0.62, "rgba(186, 230, 253, 0.14)");
    jg.addColorStop(1, "rgba(125, 211, 252, 0)");
    ctx.strokeStyle = jg;
    ctx.lineWidth = r * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, -jetLen); ctx.lineTo(0, jetLen);
    ctx.stroke();

    // 2. 引力透镜上下弯曲吸积盘光弧（包裹黑洞阴影）
    var lensG = ctx.createRadialGradient(0, 0, r * 0.92, 0, 0, r * 2.05);
    lensG.addColorStop(0, "rgba(255, 248, 220, 0.92)");
    lensG.addColorStop(0.24, "rgba(255, 178, 56, 0.56)");
    lensG.addColorStop(0.62, "rgba(194, 72, 16, 0.16)");
    lensG.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = lensG;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.02, 0, Math.PI * 2);
    ctx.fill();

    // 3. 后半开普勒吸积盘
    ctx.save();
    ctx.scale(1, 0.26);
    var diskGrad = ctx.createLinearGradient(-r * 2.9, 0, r * 2.9, 0);
    // 左侧迎面多普勒蓝移暴亮白金，右侧背离红移深琥珀赤红
    diskGrad.addColorStop(0, "rgba(255, 220, 140, 0)");
    diskGrad.addColorStop(0.18, "rgba(255, 248, 224, 0.95)");
    diskGrad.addColorStop(0.42, "rgba(255, 186, 68, 0.78)");
    diskGrad.addColorStop(0.75, "rgba(206, 68, 18, 0.48)");
    diskGrad.addColorStop(1, "rgba(140, 28, 6, 0)");
    ctx.strokeStyle = diskGrad;
    ctx.lineWidth = r * 0.78;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.05, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // 4. 绝对纯黑事件视界 + 锐利光子环
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 242, 198, 0.92)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
    ctx.stroke();

    // 5. 前半开普勒吸积盘（横跨视界前方）
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.scale(1, 0.26);
    var frontGrad = ctx.createLinearGradient(-r * 3.0, 0, r * 3.0, 0);
    frontGrad.addColorStop(0, "rgba(255, 224, 150, 0)");
    frontGrad.addColorStop(0.20, "rgba(255, 252, 236, 0.98)");
    frontGrad.addColorStop(0.46, "rgba(255, 192, 74, 0.86)");
    frontGrad.addColorStop(0.78, "rgba(214, 74, 20, 0.52)");
    frontGrad.addColorStop(1, "rgba(140, 28, 6, 0)");
    ctx.strokeStyle = frontGrad;
    ctx.lineWidth = r * 0.68;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.05, 0, Math.PI);
    ctx.stroke();

    // 旋转热斑丝缕
    var swirlA = (animT * 1.3) % (Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 250, 230, 0.52)";
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.72, swirlA, swirlA + 1.1);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  /* 绘制行星冰尘环（含行星本影锐利投射遮挡） */
  function drawRingHalfWithShadow(ctx, n, isFront, sunAngle, dim) {
    var arch = n.planetArch;
    var startA = isFront ? 0 : Math.PI;
    var endA = isFront ? Math.PI : Math.PI * 2;
    var thick = n.ringOuter - n.ringInner;
    var rMid = (n.ringInner + n.ringOuter) * 0.5;

    ctx.save();
    ctx.rotate(n.ringTilt);
    ctx.scale(1, n.ringFlatten);

    // 主冰尘环与卡西尼环缝层次
    ctx.strokeStyle = rgbStr(arch.ring, (isFront ? 0.62 : 0.42) * dim);
    ctx.lineWidth = thick * 0.46;
    ctx.beginPath();
    ctx.arc(0, 0, rMid - thick * 0.16, startA, endA);
    ctx.stroke();

    ctx.strokeStyle = rgbStr(arch.ring, (isFront ? 0.36 : 0.24) * dim);
    ctx.lineWidth = thick * 0.32;
    ctx.beginPath();
    ctx.arc(0, 0, rMid + thick * 0.28, startA, endA);
    ctx.stroke();

    // 行星球体投射在背日侧环面上的锐利真空本影
    var relShadowA = (sunAngle + Math.PI) - n.ringTilt;
    var normS = ((relShadowA % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    var inHalf = isFront ? (normS > 0.1 && normS < Math.PI - 0.1) : (normS > Math.PI + 0.1 && normS < Math.PI * 2 - 0.1);
    if (inHalf) {
      ctx.strokeStyle = "rgba(2, 3, 8, " + (0.86 * dim).toFixed(3) + ")";
      ctx.lineWidth = thick * 1.06;
      ctx.beginPath();
      ctx.arc(0, 0, rMid, normS - 0.22, normS + 0.22);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* 在行星/卫星球体上叠加实时朝向中心太阳的锐利真空硬阴影（无空气散射灰雾）+ 夜侧熔岩/殖民微光 */
  function drawRealTimeVacuumShadow(ctx, r, sunAngle, arch, eclipseAmt, dim) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r + 0.4, 0, Math.PI * 2);
    ctx.clip();

    ctx.rotate(sunAngle);
    // 太阳在局部 +X 方向；-X 半球为锐利真空黑夜本影
    var shGrad = ctx.createLinearGradient(-r, 0, r * 0.45, 0);
    shGrad.addColorStop(0, "rgba(2, 3, 8, 0.965)");
    shGrad.addColorStop(0.56, "rgba(2, 3, 8, 0.94)");
    shGrad.addColorStop(0.71, "rgba(6, 9, 18, 0.48)");
    shGrad.addColorStop(0.80, "rgba(0, 0, 0, 0)");
    shGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = shGrad;
    ctx.fillRect(-r - 2, -r - 2, r * 2 + 4, r * 2 + 4);

    // 向阳面海洋高光或晨昏细锐边缘弧
    if (arch) {
      if (arch.oceanSpec > 0.2) {
        var sp = ctx.createRadialGradient(r * 0.42, 0, 0, r * 0.42, 0, r * 0.42);
        sp.addColorStop(0, "rgba(255, 250, 232, " + (0.34 * dim).toFixed(3) + ")");
        sp.addColorStop(1, "rgba(255, 250, 232, 0)");
        ctx.fillStyle = sp;
        ctx.fillRect(-r, -r, r * 2, r * 2);
      }
      // 夜半球熔岩裂谷或殖民舱点状暖光
      if (arch.nightLava || arch.nightCity) {
        ctx.fillStyle = arch.nightLava ? "rgba(255, 92, 18, 0.62)" : "rgba(255, 188, 78, 0.48)";
        for (var k = 0; k < 5; k++) {
          var lx = -r * (0.25 + (k % 3) * 0.20);
          var ly = (k - 2) * r * 0.24;
          if (lx * lx + ly * ly < r * r * 0.72) {
            ctx.beginPath();
            ctx.arc(lx, ly, arch.nightLava ? 1.4 : 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // 向阳面极薄大气折射弯月边
      ctx.strokeStyle = rgbStr(arch.atmo, 0.58 * dim);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r - 0.5, -Math.PI * 0.44, Math.PI * 0.44);
      ctx.stroke();
    }

    if (eclipseAmt > 0.02) {
      ctx.fillStyle = "rgba(18, 5, 4, " + (eclipseAmt * 0.72).toFixed(3) + ")";
      ctx.fillRect(-r - 2, -r - 2, r * 2 + 4, r * 2 + 4);
    }

    ctx.restore();
  }

  function drawMiniMoonsHalf(ctx, n, isFront, t, sunAngle, dim) {
    if (!n.moons || !n.moons.length) return;
    var animT = state.reducedMotion ? 0 : t;
    for (var i = 0; i < n.moons.length; i++) {
      var m = n.moons[i];
      var ang = m.phase + animT * m.speed;
      var inFront = Math.sin(ang) >= 0;
      if (inFront !== isFront) continue;
      var lx = Math.cos(ang) * m.orbitR;
      var ly = Math.sin(ang) * m.orbitR * m.flatten;
      var ct = Math.cos(m.tilt), st = Math.sin(m.tilt);
      var mx = lx * ct - ly * st;
      var my = lx * st + ly * ct;

      ctx.save();
      ctx.translate(mx, my);
      ctx.fillStyle = "rgba(182, 194, 210, " + (0.92 * dim).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(0, 0, m.size, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(sunAngle);
      ctx.fillStyle = "rgba(2, 3, 8, 0.92)";
      ctx.beginPath(); ctx.arc(0, 0, m.size + 0.2, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
      ctx.restore();
    }
  }

  function drawGraph(t, dt) {
    var ctx = state.ctx;
    if (!ctx) return;

    var w = state.width, h = state.height;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 实时公转位置更新
    updateOrbitalPositions(t);

    // 相机平滑跟随
    if (state.targetCam) {
      var k = 1 - Math.exp(-dt * 8.5);
      state.cam.x = lerp(state.cam.x, state.targetCam.x, k);
      state.cam.y = lerp(state.cam.y, state.targetCam.y, k);
      state.cam.scale = lerp(state.cam.scale, state.targetCam.scale, k);
      if (
        Math.abs(state.cam.x - state.targetCam.x) < 0.4 &&
        Math.abs(state.cam.y - state.targetCam.y) < 0.4 &&
        Math.abs(state.cam.scale - state.targetCam.scale) < 0.0015
      ) {
        state.cam.x = state.targetCam.x;
        state.cam.y = state.targetCam.y;
        state.cam.scale = state.targetCam.scale;
        state.targetCam = null;
      }
    }

    var active = state.hovered || state.selected;
    var ambientDim = (active || state.focusCategory) ? 0.42 : 1.0;

    ctx.save();
    ctx.translate(state.cam.x, state.cam.y);
    ctx.scale(state.cam.scale, state.cam.scale);

    // 1. 黄道 HUD 方位刻度环、公转细轨与脉冲信标
    drawEclipticHudAndOrbits(ctx, t, ambientDim);

    // 2. 分区旋臂星系粒子盘
    drawGalaxyDisks(ctx, t, 1.0);

    // 3. 压暗引力关系丝线（仅选中/悬停时高亮关联边）
    var edges = state.edges;
    for (var ei = 0; ei < edges.length; ei++) {
      var e = edges[ei];
      if (e.synthetic) continue;
      var ea = e.a, eb = e.b;
      var linked = active && (ea === active || eb === active);
      var inFocusCat = state.focusCategory && ea.category === state.focusCategory && eb.category === state.focusCategory;

      var lineAlpha, lineWidth, strokeColor;
      if (active) {
        if (linked) {
          lineAlpha = 0.72;
          lineWidth = 1.65 / Math.sqrt(Math.max(0.35, state.cam.scale));
          strokeColor = e.sameCategory ? rgbStr(active.palette.atmo, lineAlpha) : "rgba(125, 211, 252, " + lineAlpha + ")";
        } else {
          lineAlpha = 0.025;
          lineWidth = 0.7;
          strokeColor = "rgba(148, 163, 184, 0.025)";
        }
      } else if (state.focusCategory) {
        lineAlpha = inFocusCat ? 0.36 : 0.03;
        lineWidth = inFocusCat ? 1.2 : 0.7;
        strokeColor = inFocusCat ? rgbStr((CATEGORY_PALETTES[state.focusCategory] || DEFAULT_PALETTE).atmo, lineAlpha) : "rgba(148,163,184,0.03)";
      } else {
        lineAlpha = e.sameCategory ? clamp(0.06 + e.w * 0.22, 0.06, 0.18) : clamp(0.035 + e.w * 0.14, 0.035, 0.11);
        lineWidth = e.sameCategory ? 0.95 : 0.75;
        strokeColor = e.sameCategory ? rgbStr(ea.palette.atmo, lineAlpha) : "rgba(148, 182, 224, " + lineAlpha.toFixed(3) + ")";
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
        ctx.fillStyle = "rgba(254, 240, 195, 0.92)";
        ctx.beginPath();
        ctx.arc(px, py, 2.2 / Math.sqrt(Math.max(0.4, state.cam.scale)), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. 卫星绕行椭圆细轨
    for (var sIdx = 0; sIdx < state.nodes.length; sIdx++) {
      var sn = state.nodes[sIdx];
      if (sn.tier !== "satellite" || !sn.hostNode) continue;
      var sDim = isNodeHighlighted(sn) === 0 ? 0.15 : 0.55;
      ctx.save();
      ctx.translate(sn.hostNode.x, sn.hostNode.y);
      ctx.rotate(sn.orbitTilt);
      ctx.scale(1, sn.orbitFlat);
      ctx.strokeStyle = "rgba(148, 163, 184, " + (0.28 * sDim).toFixed(3) + ")";
      ctx.lineWidth = 0.8 / Math.max(0.4, state.cam.scale);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.ellipse(-sn.orbitA * sn.orbitEcc, 0, sn.orbitA, sn.orbitA * Math.sqrt(1 - sn.orbitEcc * sn.orbitEcc), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. 环日主小行星带、中心巨型「太阳」、空间站探测器与反日双尾彗星
    drawAsteroidBelt(ctx, t, ambientDim);
    drawCentralSun(ctx, t, ambientDim);
    drawSpacecraftNarratives(ctx, t, ambientDim);
    updateAndDrawComet(ctx, t, dt, ambientDim);

    // 6. 四级天体渲染（黑洞 / 6 类非白恒星 / 5 类硬阴影行星 + 投影冰尘环 / 岩质卫星）
    var nodes = state.nodes;
    var animT = state.reducedMotion ? 0 : t;
    for (var pass = 0; pass < 2; pass++) {
      for (var ni = 0; ni < nodes.length; ni++) {
        var n = nodes[ni];
        var hl = isNodeHighlighted(n);
        var isTop = (hl === 2);
        if ((pass === 0 && isTop) || (pass === 1 && !isTop)) continue;

        var dim = hl === 0 ? 0.24 : 1.0;
        var isSel = (n === state.selected);
        var isHov = (n === state.hovered);
        var sc = isSel ? 1.14 : (isHov ? 1.07 : 1.0);
        // 指向中心太阳 (0,0) 的实时光照方向角
        var sunAngle = Math.atan2(-n.y, -n.x);

        ctx.save();
        ctx.translate(n.x, n.y);
        if (sc !== 1) ctx.scale(sc, sc);

        if (n.tier === "blackhole") {
          drawBlackHoleNode(ctx, n, t, dim);
        } else if (n.tier === "star") {
          // 恒星日冕自发光辉光 + 对流球面 + 耀斑呼吸
          var arch = n.starArch;
          var flarePulse = state.reducedMotion ? 1 : (1 + 0.06 * Math.sin(animT * 1.9 + (n.seed % 37)));
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = dim;
          var cg = ctx.createRadialGradient(0, 0, n.radius * 0.72, 0, 0, n.radius * 2.55 * flarePulse);
          cg.addColorStop(0, rgbStr(arch.core, 0.72));
          cg.addColorStop(0.28, rgbStr(arch.corona, 0.34));
          cg.addColorStop(0.68, rgbStr(arch.corona, 0.08));
          cg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = cg;
          ctx.beginPath(); ctx.arc(0, 0, n.radius * 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.globalAlpha = dim;
          ctx.rotate(animT * 0.025 * ((n.seed % 2) ? 1 : -1));
          var sds = n.bodySprite.drawSize;
          ctx.drawImage(n.bodySprite.canvas, -sds * 0.5, -sds * 0.5, sds, sds);
          ctx.restore();
        } else if (n.tier === "planet") {
          // 简易日食遮挡判定：宿主星系恒星若恰好位于太阳与行星连线之间则产生食变暗
          var eclipse = 0;
          var pDist = Math.hypot(n.x, n.y) || 1;
          for (var ok = 0; ok < nodes.length; ok++) {
            var occ = nodes[ok];
            if (occ === n || occ.tier !== "star") continue;
            var proj = (occ.x * n.x + occ.y * n.y) / pDist;
            if (proj > SUN_RADIUS && proj < pDist - n.radius) {
              var perp = Math.abs(occ.x * n.y - occ.y * n.x) / pDist;
              if (perp < occ.radius * 1.25) {
                eclipse = Math.max(eclipse, 1 - perp / (occ.radius * 1.25));
              }
            }
          }

          drawMiniMoonsHalf(ctx, n, false, t, sunAngle, dim);
          if (n.hasRing) drawRingHalfWithShadow(ctx, n, false, sunAngle, dim);

          var pds = n.bodySprite.drawSize;
          ctx.save();
          ctx.globalAlpha = dim;
          ctx.drawImage(n.bodySprite.canvas, -pds * 0.5, -pds * 0.5, pds, pds);
          ctx.restore();

          drawRealTimeVacuumShadow(ctx, n.radius, sunAngle, n.planetArch, eclipse, dim);

          if (n.hasRing) drawRingHalfWithShadow(ctx, n, true, sunAngle, dim);
          drawMiniMoonsHalf(ctx, n, true, t, sunAngle, dim);
        } else {
          // 连通度 = 1 天然卫星 / 不规则小天体
          var mds = n.bodySprite.drawSize;
          ctx.save();
          ctx.globalAlpha = dim;
          ctx.drawImage(n.bodySprite.canvas, -mds * 0.5, -mds * 0.5, mds, mds);
          ctx.restore();
          drawRealTimeVacuumShadow(ctx, n.radius, sunAngle, null, 0, dim);
        }

        if (isSel || isHov) {
          ctx.strokeStyle = isSel ? "rgba(253, 230, 138, 0.92)" : "rgba(125, 211, 252, 0.72)";
          ctx.lineWidth = 1.4 / Math.max(0.45, state.cam.scale);
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(0, 0, n.radius + 7, animT * 0.4, animT * 0.4 + Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    ctx.restore();

    // 7. 屏幕空间防重叠毛玻璃标签（同屏严格控制上限，放大时自动展开细节标签）
    drawScreenLabels(ctx, w, h);
  }

  function drawScreenLabels(ctx, w, h) {
    // 太阳中心标识（当放大或悬停太阳时显示）
    var sunSc = worldToScreen(0, 0);
    if (state.sunHovered || state.cam.scale > 0.55) {
      var sunY = Math.round(sunSc.y + SUN_RADIUS * state.cam.scale + 10);
      if (sunSc.x > -100 && sunSc.x < w + 100 && sunY > 0 && sunY < h) {
        ctx.save();
        var sw = 68, sh = 21;
        var sx = Math.round(sunSc.x - sw * 0.5);
        ctx.fillStyle = "rgba(12, 9, 5, 0.86)";
        ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
        ctx.lineWidth = 1;
        roundRectPath(ctx, sx, sunY, sw, sh, 6);
        ctx.fill(); ctx.stroke();
        ctx.font = '600 11px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = "#fde68a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("☀ 太阳", sx + sw * 0.5, sunY + sh * 0.5 + 0.5);
        ctx.restore();
      }
    }

    // 按优先级排序节点标签：选中/悬停 > 黑洞 > 高连通度恒星 > 行星 > 卫星（卫星在缩小时隐藏防噪，放大或激活时显示）
    var candidates = [];
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      var isAct = (n === state.selected || n === state.hovered);
      if (n.tier === "satellite" && !isAct && state.cam.scale < 0.62) continue;

      var sp = worldToScreen(n.x, n.y);
      if (sp.x < -140 || sp.x > w + 140 || sp.y < -60 || sp.y > h + 60) continue;

      var prio = isAct ? 10000 : (n.tier === "blackhole" ? 500 : n.cleanDeg * 10);
      candidates.push({ n: n, sp: sp, isAct: isAct, prio: prio });
    }
    candidates.sort(function (a, b) { return b.prio - a.prio; });

    var placed = [];
    var maxCount = state.cam.scale > 1.05 ? 40 : MAX_VISIBLE_LABELS;

    for (var ci = 0; ci < candidates.length && placed.length < maxCount; ci++) {
      var c = candidates[ci];
      var ln = c.n;
      var sprite = c.isAct ? ln.labelActiveSprite : ln.labelSprite;
      var clearance = (ln.radius * (ln.hasRing ? 1.26 : (ln.tier === "blackhole" ? 1.35 : 1.06)) + 5) * state.cam.scale;
      var lx = Math.round(c.sp.x - sprite.w * 0.5);
      var ly = Math.round(c.sp.y + Math.max(14, clearance) + 3);

      if (!c.isAct) {
        var overlap = false;
        for (var pi = 0; pi < placed.length; pi++) {
          var b = placed[pi];
          if (lx < b.x + b.w + 6 && lx + sprite.w + 6 > b.x && ly < b.y + b.h + 4 && ly + sprite.h + 4 > b.y) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;
      }

      placed.push({ x: lx, y: ly, w: sprite.w, h: sprite.h });
      var lhl = isNodeHighlighted(ln);
      ctx.save();
      ctx.globalAlpha = lhl === 0 ? 0.22 : (c.isAct ? 1 : 0.92);
      ctx.drawImage(sprite.canvas, lx, ly, sprite.w, sprite.h);
      ctx.restore();
    }
  }

  /* ============================================================
   * 6. 动画主循环与性能保障
   * ============================================================ */
  function drawFrame(dt) {
    drawStarfield(state.elapsed, dt);
    if (!state.bgOnly) {
      drawGraph(state.elapsed, dt);
    }
  }

  function tick(ts) {
    if (!state.running || document.hidden || state.reducedMotion) {
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
    if (!state.running) return;
    if (state.reducedMotion) {
      drawFrame(0);
      return;
    }
    if (document.hidden || state.raf) return;
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
    if (document.hidden) stopLoop();
    else if (state.running) startLoop();
  }

  function handleReducedMotionChange(e) {
    state.reducedMotion = Boolean(e.matches);
    if (state.reducedMotion) {
      stopLoop();
      drawFrame(0);
    } else if (state.running) {
      startLoop();
    }
  }

  /* ============================================================
   * 7. 交互控制（拖拽平移/节点、双指与滚轮大范围无级缩放、太阳与天体点选）
   * ============================================================ */
  function hitTest(sx, sy) {
    var wp = screenToWorld(sx, sy);
    var best = null;
    var bestDist = Infinity;
    for (var i = state.nodes.length - 1; i >= 0; i--) {
      var n = state.nodes[i];
      var d = Math.hypot(wp.x - n.x, wp.y - n.y);
      var hitR = Math.max(n.radius * (n.tier === "blackhole" ? 1.45 : 1.15) + 5, 18 / Math.max(0.25, state.cam.scale));
      if (d <= hitR && d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  function isSunHit(sx, sy) {
    var wp = screenToWorld(sx, sy);
    return Math.hypot(wp.x, wp.y) <= SUN_RADIUS * 1.08;
  }

  function getLocalPos(e) {
    var rect = state.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function selectNode(node) {
    state.selected = node || null;
    if (node) {
      state.focusCategory = null;
      focusNodeCamera(node);
    }
    if (state.onSelect) state.onSelect(state.selected);
    if (state.reducedMotion) drawFrame(0);
  }

  function zoomAt(sx, sy, nextScale) {
    var wx = (sx - state.cam.x) / state.cam.scale;
    var wy = (sy - state.cam.y) / state.cam.scale;
    state.cam.scale = nextScale;
    state.cam.x = sx - wx * nextScale;
    state.cam.y = sy - wy * nextScale;
    if (state.reducedMotion) drawFrame(0);
  }

  function bindCanvasEvents() {
    var el = state.canvas;
    if (!el) return;
    el.style.touchAction = "none";

    el.addEventListener("pointerdown", function (e) {
      var pos = getLocalPos(e);
      state.pointers[e.pointerId] = pos;
      var pids = Object.keys(state.pointers);

      if (pids.length === 2) {
        var p1 = state.pointers[pids[0]], p2 = state.pointers[pids[1]];
        state.pinchDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        state.pinchScale = state.cam.scale;
        state.dragNode = null;
        state.pointerDown = false;
        return;
      }

      state.pointerDown = true;
      state.pointerId = e.pointerId;
      state.moved = false;
      state.downX = state.lastX = pos.x;
      state.downY = state.lastY = pos.y;
      state.targetCam = null;

      var hit = hitTest(pos.x, pos.y);
      state.dragNode = hit;
      el.style.cursor = "grabbing";
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });

    el.addEventListener("pointermove", function (e) {
      var pos = getLocalPos(e);
      if (state.pointers[e.pointerId]) state.pointers[e.pointerId] = pos;

      var pids = Object.keys(state.pointers);
      if (pids.length === 2 && state.pinchDist > 0) {
        var p1 = state.pointers[pids[0]], p2 = state.pointers[pids[1]];
        var dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        var nextScale = clamp(state.pinchScale * (dist / state.pinchDist), MIN_ZOOM, MAX_ZOOM);
        zoomAt((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5, nextScale);
        return;
      }

      if (!state.pointerDown || e.pointerId !== state.pointerId) {
        var hov = hitTest(pos.x, pos.y);
        var sunHov = !hov && isSunHit(pos.x, pos.y);
        if (hov !== state.hovered || sunHov !== state.sunHovered) {
          state.hovered = hov;
          state.sunHovered = sunHov;
          el.style.cursor = (hov || sunHov) ? "pointer" : "grab";
          if (state.reducedMotion) drawFrame(0);
        }
        return;
      }

      var dx = pos.x - state.lastX;
      var dy = pos.y - state.lastY;
      if (Math.hypot(pos.x - state.downX, pos.y - state.downY) > 4) {
        state.moved = true;
      }
      state.lastX = pos.x;
      state.lastY = pos.y;

      if (state.dragNode && state.moved && state.dragNode.tier !== "satellite") {
        var wp = screenToWorld(pos.x, pos.y);
        state.dragNode.x = wp.x;
        state.dragNode.y = wp.y;
        var gal = state.galaxyByCat[state.dragNode.category];
        if (gal && !state.dragNode.isOuterBlackHole) {
          var spin = (state.reducedMotion ? 0 : state.elapsed) * gal.spinSpeed * 0.22;
          var cs = Math.cos(-spin), sn = Math.sin(-spin);
          var rx = wp.x - gal.x, ry = wp.y - gal.y;
          state.dragNode.localX = rx * cs - ry * sn;
          state.dragNode.localY = rx * sn + ry * cs;
        }
        if (state.reducedMotion) drawFrame(0);
      } else {
        state.cam.x += dx;
        state.cam.y += dy;
        if (state.reducedMotion) drawFrame(0);
      }
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
      var hov = hitTest(pos.x, pos.y);
      var sunHov = !hov && isSunHit(pos.x, pos.y);
      state.hovered = hov;
      state.sunHovered = sunHov;
      el.style.cursor = (hov || sunHov) ? "pointer" : "grab";

      if (!wasMoved) {
        if (clickedNode) {
          selectNode(clickedNode);
        } else if (sunHov) {
          state.selected = null;
          state.focusCategory = null;
          if (state.onSelect) state.onSelect(null);
          state.targetCam = { x: state.width * 0.5, y: state.height * 0.5, scale: 2.2 };
        } else {
          state.focusCategory = null;
          selectNode(null);
        }
      }
    }

    el.addEventListener("pointerup", endPointer);
    el.addEventListener("pointercancel", endPointer);
    el.addEventListener("pointerleave", function () {
      if (!state.pointerDown && (state.hovered || state.sunHovered)) {
        state.hovered = null;
        state.sunHovered = false;
        el.style.cursor = "grab";
        if (state.reducedMotion) drawFrame(0);
      }
    });

    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      var pos = getLocalPos(e);
      state.targetCam = null;
      var factor = e.deltaY > 0 ? 0.89 : 1.125;
      var nextScale = clamp(state.cam.scale * factor, MIN_ZOOM, MAX_ZOOM);
      zoomAt(pos.x, pos.y, nextScale);
    }, { passive: false });
  }

  /* ============================================================
   * 8. 画布尺寸同步与公开生命周期接口
   * ============================================================ */
  function syncSize(shouldRefit) {
    if (!state.container || !state.bgCanvas) return;
    var w = Math.max(1, Math.round(state.container.clientWidth || global.innerWidth || 800));
    var h = Math.max(1, Math.round(state.container.clientHeight || (global.innerHeight - 62) || 560));
    var dpr = Math.min(global.devicePixelRatio || 1, 1.5);

    var oldW = state.width || w;
    var oldH = state.height || h;
    state.width = w;
    state.height = h;
    state.dpr = dpr;

    state.bgCanvas.width = Math.round(w * dpr);
    state.bgCanvas.height = Math.round(h * dpr);
    if (state.canvas) {
      state.canvas.width = Math.round(w * dpr);
      state.canvas.height = Math.round(h * dpr);
    }

    initStarfield(w, h);

    if (!state.bgOnly) {
      if (shouldRefit) {
        fitView(false);
      } else if (oldW > 1 && oldH > 1) {
        state.cam.x += (w - oldW) * 0.5;
        state.cam.y += (h - oldH) * 0.5;
      }
    }
    drawFrame(0);
  }

  function handleResizeDebounced() {
    if (state.resizeTimer) clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(function () {
      state.resizeTimer = null;
      syncSize(false);
    }, 150);
  }

  function mountInternal(container, data, onSelect, bgOnlyMode) {
    destroy();
    if (!container) return { nodes: 0, edges: 0 };

    state.container = container;
    state.bgOnly = Boolean(bgOnlyMode);
    state.onSelect = onSelect || function () {};
    state.selected = null;
    state.hovered = null;
    state.sunHovered = false;
    state.focusCategory = null;
    state.elapsed = 0;

    state.reduceMq = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;
    state.reducedMotion = Boolean(state.reduceMq && state.reduceMq.matches);

    var existingBg = container.querySelector("#pmv-bg");
    if (existingBg) {
      state.bgCanvas = existingBg;
      state.bgOwned = false;
    } else {
      var bgCanvas = document.createElement("canvas");
      bgCanvas.id = "pmv-bg";
      bgCanvas.className = "pmv-bg-canvas";
      bgCanvas.setAttribute("aria-hidden", "true");
      container.insertBefore(bgCanvas, container.firstChild);
      state.bgCanvas = bgCanvas;
      state.bgOwned = true;
    }
    state.bgCtx = state.bgCanvas.getContext("2d");

    if (!state.bgOnly) {
      var graphCanvas = document.createElement("canvas");
      graphCanvas.className = "mg-graph-canvas";
      container.appendChild(graphCanvas);
      state.canvas = graphCanvas;
      state.ctx = graphCanvas.getContext("2d");

      var g = buildGraph(data || {}, true);
      state.nodes = g.nodes;
      state.edges = g.edges;
      state.categories = g.categories;
      state.anchors = g.anchors;
      state.galaxies = g.galaxies;
      state.galaxyByCat = g.galaxyByCat;
      state.neighborMap = g.neighborMap;

      initSolarSystemExtras();
      warmupLayout();
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
    return { nodes: state.nodes.length, edges: state.edges.length };
  }

  function render(container, data, onSelect) {
    return mountInternal(container, data, onSelect, false);
  }

  /* 供 3D 视图复用：快速构建同一套节点与边关系模型 */
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

  /* 供 3D 视图作底层深空兜底画布（不创建多余前景图谱 canvas） */
  function renderBackground(container) {
    return mountInternal(container, null, null, true);
  }

  function destroy() {
    state.running = false;
    stopLoop();
    if (state.resizeTimer) {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = null;
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
    state.canvas = state.ctx = null;
    state.bgCanvas = state.bgCtx = null;
    state.bgOwned = false;
    state.bgOnly = false;
    state.bg = null;
    state.nodes = [];
    state.edges = [];
    state.categories = [];
    state.anchors = {};
    state.galaxies = [];
    state.galaxyByCat = {};
    state.neighborMap = {};
    state.asteroids = [];
    state.comet = null;
    state.selected = state.hovered = state.dragNode = null;
    state.sunHovered = false;
    state.focusCategory = null;
    state.pointers = {};
    state.targetCam = null;
  }

  function resetView() {
    state.selected = null;
    state.focusCategory = null;
    if (state.onSelect) state.onSelect(null);
    fitView(true);
  }

  function focusCategory(cat) {
    state.selected = null;
    if (state.onSelect) state.onSelect(null);
    if (!cat || state.focusCategory === cat) {
      state.focusCategory = null;
      fitView(true);
      return null;
    }
    state.focusCategory = cat;
    var sub = state.nodes.filter(function (n) { return n.category === cat; });
    if (sub.length) {
      var cam = computeFitCamera(sub, false);
      if (state.reducedMotion) {
        state.cam = cam;
        state.targetCam = null;
        drawFrame(0);
      } else {
        state.targetCam = cam;
      }
    }
    return state.focusCategory;
  }

  function clearSelection() {
    if (!state.selected) return;
    state.selected = null;
    if (state.reducedMotion) drawFrame(0);
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
    CATEGORY_LABELS: CATEGORY_LABELS
  };
})(window);
