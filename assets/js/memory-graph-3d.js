// assets/js/memory-graph-3d.js
/* ============================================================
 * 私人记忆档案 · 银河星系与「陌浔」恒星系 3D/2D 统一宇宙引擎
 * 1. 宏大倾斜旋臂银河星系（Grand Spiral Galaxy）：暖白桃金核球 + 暗铁锈红尘埃吸收带 + 蓝紫星云旋臂 + M110/M32 伴星系；
 *    「陌浔」恒星系位于银河旋臂一隅，缩小至银河全景时直观凸显单人记忆总体之渺小（预留多恒星朋友星系架构）。
 * 2. 恒星「陌浔」（太阳）坐镇恒星系中心，每个连通记忆皆为差异化写实行星节点（8 类地貌 + 投影冰尘环 + 绕行小卫星），
 *    度 1 为天然卫星，度 0 为孤立外缘黑洞；本恒星区域配置唯一一座「星际虫洞」（爱因斯坦-罗森桥 + 三轴约束环）。
 * 3. 支持 planar 平面模式：2D 视图直接复用同一套 3D 动态宇宙环境，平移/缩放/拾取与 3D 100% 同源同步。
 * ============================================================ */
(function (global) {
  "use strict";

  var FOV = 50;
  var SUN_NAME = "陌浔";
  var SUN_RADIUS = 118;
  var WORMHOLE_RADIUS = 54;
  var DEFAULT_RADIUS = 2350;
  var GALAXY_OVERVIEW_RADIUS = 26800;
  var GALAXY_OVERVIEW_RADIUS_2D = 37800;
  var MIN_RADIUS = 56;
  var MAX_RADIUS = 42000;
  var GRAND_GALAXY_R = 19200;
  var DEFAULT_THETA = 0.66;
  var DEFAULT_PHI = 1.02;
  var PLANAR_THETA = 0.66;
  var PLANAR_PHI = 0.98;
  var MAX_DPR = 1.75;
  var MAX_PARTICLES = 86000;
  var MAX_VISIBLE_LABELS = 24;
  var COMET_MIN_INTERVAL = 13.2;
  var COMET_MAX_INTERVAL = 19.8;

  var FALLBACK_PALETTES = {
    USER: { hex: "#fb7185", atmo: [251, 113, 133], rim: [255, 205, 214], deep: [46, 12, 30], mid: [178, 48, 82], high: [253, 164, 175], accent: [255, 224, 150], ring: [253, 192, 202], banded: false },
    MEMORY: { hex: "#22d3ee", atmo: [34, 211, 238], rim: [186, 248, 255], deep: [8, 36, 70], mid: [18, 142, 192], high: [115, 236, 252], accent: [236, 252, 255], ring: [140, 238, 252], banded: true },
    PROJECTS: { hex: "#2dd4bf", atmo: [45, 212, 191], rim: [167, 248, 232], deep: [6, 46, 44], mid: [18, 148, 134], high: [98, 236, 214], accent: [204, 253, 242], ring: [120, 234, 218], banded: false },
    TOPIC: { hex: "#38bdf8", atmo: [56, 189, 248], rim: [196, 234, 255], deep: [14, 26, 74], mid: [58, 112, 222], high: [135, 214, 253], accent: [222, 234, 255], ring: [155, 204, 254], banded: true },
    PROMPT: { hex: "#fbbf24", atmo: [251, 191, 36], rim: [255, 242, 166], deep: [56, 26, 6], mid: [196, 118, 18], high: [253, 214, 92], accent: [255, 249, 219], ring: [253, 226, 128], banded: true },
    GUIDE: { hex: "#c084fc", atmo: [192, 132, 252], rim: [236, 218, 255], deep: [36, 12, 66], mid: [130, 64, 210], high: [218, 184, 254], accent: [248, 224, 255], ring: [218, 184, 254], banded: false }
  };

  var state = {
    active: false, container: null, rawModel: null, planar: false, envOnly: false,
    renderer: null, scene: null, camera: null, root: null, bgGroup: null, stellarFgGroup: null,
    texCache: null, labelBox: null, sunLabelEl: null, wormholeLabelEl: null,
    hudEl: null, hudSectorEl: null, hudScaleEl: null, hudBtns: {}, toastTimer: 0,
    planets: [], planetById: {}, galaxies: [], galaxyByCat: {},
    grandGalaxy: null, galaxyCenter: null, stellarSystems: [], wormhole: null,
    centralSun: null, lensGhosts: [], skyDomeMat: null,
    asteroidBelt: null, rockSharedMat: null, flybyRocks: [],
    microMeteors: [], beacons: [], spaceStation: null, derelictProbe: null,
    filaments: [], pulsars: [],
    pointSystems: [], jetGroups: [], orbitLines: [], miniMoons: [],
    comet: null, labels: [],
    edgesObj: null, edgeMeta: [], nodes: [], edges: [],
    raf: 0, lastTs: 0, simTime: 0, width: 0, height: 0, dpr: 1,
    theta: DEFAULT_THETA, phi: DEFAULT_PHI, radius: DEFAULT_RADIUS, targetRadius: DEFAULT_RADIUS,
    target: null, targetFocus: null, baseFocus: null, panOffset: null,
    dragging: false, moved: 0, lastX: 0, lastY: 0, pointers: {}, pinchDist: 0,
    hovered: null, hoveredSpecial: null, selected: null, selectedEntry: null, focusCat: null, focusedSpecial: null,
    onSelect: function () {},
    reduced: false, reduceMq: null, degraded: false,
    warmupFrames: 0, fpsFrames: 0, fpsAccum: 0,
    contextRebuilt: false, rebuildTimer: 0, onCtxLost: null, onCtxRestored: null,
    ray: null, tmpV: null, tmpV2: null, tmpV3: null, tmpLight: null, tmpSunV: null, tmpCamR: null, tmpCamU: null
  };

  /* ---------- 基础数学、三维确定性噪声与开普勒轨道力学 ---------- */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstepJS(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0 || 1), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function hashStr(s) {
    var h = 2166136261; s = String(s || "");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2D(ix, iy, seed) {
    var h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function valueNoise2D(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y); var fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx); var uy = fy * fy * (3 - 2 * fy);
    return lerp(
      lerp(hash2D(ix, iy, seed), hash2D(ix + 1, iy, seed), ux),
      lerp(hash2D(ix, iy + 1, seed), hash2D(ix + 1, iy + 1, seed), ux),
      uy
    );
  }

  function fbm2D(x, y, octaves, seed) {
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += amp * valueNoise2D(x * freq, y * freq, seed + i * 97); norm += amp; amp *= 0.5; freq *= 2.03;
    }
    return norm > 0 ? sum / norm : 0;
  }

  function hash3D(ix, iy, iz, seed) {
    var h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(iz | 0, 2147483647) + Math.imul(seed | 0, 1442695041)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function valueNoise3D(x, y, z, seed) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = x - ix, fy = y - iy, fz = z - iz; var ux = fx * fx * (3 - 2 * fx);
    var uy = fy * fy * (3 - 2 * fy); var uz = fz * fz * (3 - 2 * fz);
    var n00 = lerp(hash3D(ix, iy, iz, seed), hash3D(ix + 1, iy, iz, seed), ux);
    var n10 = lerp(hash3D(ix, iy + 1, iz, seed), hash3D(ix + 1, iy + 1, iz, seed), ux);
    var n01 = lerp(hash3D(ix, iy, iz + 1, seed), hash3D(ix + 1, iy, iz + 1, seed), ux);
    var n11 = lerp(hash3D(ix, iy + 1, iz + 1, seed), hash3D(ix + 1, iy + 1, iz + 1, seed), ux);
    return lerp(lerp(n00, n10, uy), lerp(n01, n11, uy), uz);
  }

  function fbm3D(x, y, z, octaves, seed) {
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += amp * valueNoise3D(x * freq, y * freq, z * freq, seed + i * 131);
      norm += amp; amp *= 0.5; freq *= 2.07;
    }
    return norm > 0 ? sum / norm : 0;
  }

  function ensurePalette(cat, existing) {
    if (existing && existing.atmo && existing.mid) return existing;
    if (FALLBACK_PALETTES[cat]) return FALLBACK_PALETTES[cat];
    var r = rng(hashStr(cat || "COSMOS")); var hue = r() * Math.PI * 2;
    var cr = Math.round(130 + 95 * Math.cos(hue)); var cg = Math.round(145 + 90 * Math.cos(hue - 2.09));
    var cb = Math.round(175 + 75 * Math.cos(hue + 2.09));
    return {
      hex: "rgb(" + cr + "," + cg + "," + cb + ")", atmo: [cr, cg, cb],
      rim: [clamp(cr + 70, 0, 255), clamp(cg + 70, 0, 255), clamp(cb + 70, 0, 255)],
      deep: [Math.round(cr * 0.20), Math.round(cg * 0.20), Math.round(cb * 0.26)],
      mid: [Math.round(cr * 0.78), Math.round(cg * 0.78), Math.round(cb * 0.84)],
      high: [clamp(cr + 45, 0, 255), clamp(cg + 45, 0, 255), clamp(cb + 45, 0, 255)], accent: [244, 248, 255],
      ring: [clamp(cr + 35, 0, 255), clamp(cg + 35, 0, 255), clamp(cb + 35, 0, 255)], banded: r() > 0.45
    };
  }

  function palColor(pal, key, lighten) {
    var c = (pal && pal[key]) || [120, 190, 255]; var r = c[0], g = c[1], b = c[2];
    if (lighten) {
      r = clamp(Math.round(r + (255 - r) * lighten), 0, 255);
      g = clamp(Math.round(g + (255 - g) * lighten), 0, 255);
      b = clamp(Math.round(b + (255 - b) * lighten), 0, 255);
    }
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function palArr(pal, key) {
    var c = (pal && pal[key]) || [120, 190, 255];
    return [c[0], c[1], c[2]];
  }

  function kelvinToRGB(kelvin) {
    var k = clamp(kelvin, 3200, 12000) / 100; var r, g, b;
    if (k <= 66) {
      r = 255; g = 99.4708025861 * Math.log(k) - 161.1195681661;
      b = k <= 19 ? 0 : (138.5177312231 * Math.log(k - 10) - 305.0447927307);
    } else {
      r = 329.698727446 * Math.pow(k - 60, -0.1332047592); g = 288.1221695283 * Math.pow(k - 60, -0.0755148492); b = 255;
    }
    return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
  }

  function evalKeplerOrbit(M, a, e, uVec, vVec, outVec) {
    var mWrap = M % (Math.PI * 2);
    if (mWrap < 0) mWrap += Math.PI * 2;
    var E = mWrap + e * Math.sin(mWrap);
    for (var i = 0; i < 3; i++) {
      E -= (E - e * Math.sin(E) - mWrap) / (1 - e * Math.cos(E));
    }
    var xOrb = a * (Math.cos(E) - e); var yOrb = a * Math.sqrt(Math.max(0.05, 1 - e * e)) * Math.sin(E);
    outVec.set(
      uVec.x * xOrb + vVec.x * yOrb,
      uVec.y * xOrb + vVec.y * yOrb,
      uVec.z * xOrb + vVec.z * yOrb
    );
    return outVec;
  }

  function buildOrbitBasis(THREE, inc, omega, arg) {
    var cO = Math.cos(omega), sO = Math.sin(omega); var ci = Math.cos(inc), si = Math.sin(inc);
    var cw = Math.cos(arg), sw = Math.sin(arg);
    var u = new THREE.Vector3(
      cO * cw - sO * sw * ci,
      sw * si,
      sO * cw + cO * sw * ci
    ).normalize();
    var v = new THREE.Vector3(
      -cO * sw - sO * cw * ci,
      cw * si,
      -sO * sw + cO * cw * ci
    ).normalize(); var n = new THREE.Vector3().crossVectors(u, v).normalize();
    return { u: u, v: v, n: n };
  }

  function isMobileDevice() {
    var ua = (global.navigator && global.navigator.userAgent) || "";
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    var minSide = Math.min(global.innerWidth || 9999, global.innerHeight || 9999);
    var touch = ("ontouchstart" in global) || (global.navigator && global.navigator.maxTouchPoints > 1);
    return !!(touch && minSide <= 820);
  }

  /* ---------- 程序化三维非球形岩体与带状几何构造器（零外部模型） ---------- */

  function evalRockRadius(nx, ny, nz, seed, roughness, craters) {
    var n1 = fbm3D(nx * 2.1 + 4.3, ny * 2.1 - 1.9, nz * 2.1 + 7.1, 3, seed);
    var ridge = 1.0 - Math.abs(fbm3D(nx * 4.4 - 2.2, ny * 4.4 + 5.6, nz * 4.4, 2, seed + 503) * 2.0 - 1.0);
    var r = 1.0 + (n1 - 0.5) * roughness + (ridge - 0.5) * roughness * 0.42;
    if (craters) {
      for (var i = 0; i < craters.length; i++) {
        var cr = craters[i]; var dot = nx * cr.x + ny * cr.y + nz * cr.z;
        if (dot > cr.cosR) {
          var q = clamp((1.0 - dot) / Math.max(0.0001, 1.0 - cr.cosR), 0, 1);
          if (q < 0.78) r -= (1.0 - (q / 0.78) * (q / 0.78)) * cr.depth;
          else r += Math.sin(((q - 0.78) / 0.22) * Math.PI) * cr.depth * 0.36;
        }
      }
    }
    return Math.max(0.42, r);
  }

  /* 生成无缝三维不规则小天体/矮行星几何体（法线严格重算，支持近景全貌硬阴影审视） */
  function buildIrregularBodyGeometry(THREE, segW, segH, seed, roughness, axes) {
    var rand = rng(seed >>> 0); var craters = [];
    for (var c = 0; c < 6; c++) {
      var th = rand() * Math.PI * 2; var cz = rand() * 2 - 1; var sr = Math.sqrt(Math.max(0, 1 - cz * cz));
      craters.push({
        x: sr * Math.cos(th), y: cz, z: sr * Math.sin(th), cosR: Math.cos(0.24 + rand() * 0.26),
        depth: 0.08 + rand() * 0.09
      });
    }
    var ax = (axes && axes[0]) || 1.18; var ay = (axes && axes[1]) || 0.80;
    var az = (axes && axes[2]) || 0.94;

    var grid = []; var iy, ix;
    for (iy = 0; iy <= segH; iy++) {
      var v = iy / segH; var phi = v * Math.PI; var sp = Math.sin(phi), cp = Math.cos(phi); var row = [];
      for (ix = 0; ix <= segW; ix++) {
        var u = ix === segW ? 0 : (ix / segW); var th2 = u * Math.PI * 2; var nx = sp * Math.cos(th2);
        var ny = cp; var nz = sp * Math.sin(th2);
        if (iy === 0) { nx = 0; ny = 1; nz = 0; }
        else if (iy === segH) { nx = 0; ny = -1; nz = 0; }
        var rad = evalRockRadius(nx, ny, nz, seed, roughness, craters);
        row.push({
          x: nx * rad * ax, y: ny * rad * ay, z: nz * rad * az, u: ix / segW, v: 1 - v, nx: 0, ny: 0, nz: 0
        });
      }
      grid.push(row);
    }

    var triCount = segW * segH * 2; var posArr = new Float32Array(triCount * 9);
    var normArr = new Float32Array(triCount * 9); var uvArr = new Float32Array(triCount * 6);

    function accumFaceNormal(p0, p1, p2) {
      var ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
      var vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z; var fnx = uy * vz - uz * vy;
      var fny = uz * vx - ux * vz; var fnz = ux * vy - uy * vx; p0.nx += fnx; p0.ny += fny; p0.nz += fnz;
      p1.nx += fnx; p1.ny += fny; p1.nz += fnz; p2.nx += fnx; p2.ny += fny; p2.nz += fnz;
    }

    for (iy = 0; iy < segH; iy++) {
      for (ix = 0; ix < segW; ix++) {
        var a = grid[iy][ix], b = grid[iy + 1][ix], c1 = grid[iy + 1][ix + 1], d = grid[iy][ix + 1];
        accumFaceNormal(a, b, d); accumFaceNormal(b, c1, d);
      }
    }
    for (iy = 0; iy <= segH; iy++) {
      var first = grid[iy][0], last = grid[iy][segW];
      var snx = first.nx + last.nx, sny = first.ny + last.ny, snz = first.nz + last.nz;
      first.nx = last.nx = snx; first.ny = last.ny = sny; first.nz = last.nz = snz;
    }

    var pOff = 0, uOff = 0;
    function emitVert(pt) {
      var nl = Math.sqrt(pt.nx * pt.nx + pt.ny * pt.ny + pt.nz * pt.nz) || 1;
      posArr[pOff] = pt.x; posArr[pOff + 1] = pt.y; posArr[pOff + 2] = pt.z;
      normArr[pOff] = pt.nx / nl; normArr[pOff + 1] = pt.ny / nl; normArr[pOff + 2] = pt.nz / nl;
      pOff += 3; uvArr[uOff] = pt.u; uvArr[uOff + 1] = pt.v; uOff += 2;
    }

    for (iy = 0; iy < segH; iy++) {
      for (ix = 0; ix < segW; ix++) {
        var pA = grid[iy][ix], pB = grid[iy + 1][ix], pC = grid[iy + 1][ix + 1], pD = grid[iy][ix + 1];
        emitVert(pA); emitVert(pB); emitVert(pD); emitVert(pB); emitVert(pC); emitVert(pD);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normArr, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvArr, 2));
    return geo;
  }

  /* 合并单次 DrawCall 的三维小行星带（220 颗不规则刻面陨石，带硬阴影顶点法线与反照率色差） */
  function buildBatchedAsteroidBeltGeometry(THREE, rockCount, innerR, outerR, seed) {
    var rand = rng(seed >>> 0); var segW = 7, segH = 5; var trisPerRock = segW * segH * 2;
    var totalVerts = rockCount * trisPerRock * 3; var posArr = new Float32Array(totalVerts * 3);
    var normArr = new Float32Array(totalVerts * 3); var colArr = new Float32Array(totalVerts * 3);
    var outOff = 0;

    for (var rIdx = 0; rIdx < rockCount; rIdx++) {
      var u = rand();
      if (Math.abs(u - 0.46) < 0.05) u = clamp(u + 0.09, 0, 1);
      var orbR = lerp(innerR, outerR, u); var ang = rand() * Math.PI * 2;
      var incY = (rand() + rand() - 1) * 34 * (0.55 + u * 0.65); var cx = Math.cos(ang) * orbR;
      var cy = incY; var cz = Math.sin(ang) * orbR;

      var scale = 1.8 + Math.pow(rand(), 2.4) * 5.6; var sx = scale * (0.75 + rand() * 0.65);
      var sy = scale * (0.55 + rand() * 0.50); var sz = scale * (0.70 + rand() * 0.58);

      var yaw = rand() * 6.28, pitch = (rand() - 0.5) * 3.14; var cyw = Math.cos(yaw), syw = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);

      var rockType = rand(); var br = 0.34 + rand() * 0.36;
      var cr = rockType < 0.55 ? br * 0.92 : (rockType < 0.88 ? br * 1.08 : br * 0.96);
      var cg = rockType < 0.55 ? br * 0.88 : (rockType < 0.88 ? br * 0.95 : br * 0.98);
      var cb = rockType < 0.55 ? br * 0.84 : (rockType < 0.88 ? br * 0.80 : br * 1.06);

      var rSeed = (seed + rIdx * 977) >>> 0; var pts = []; var iy, ix;
      for (iy = 0; iy <= segH; iy++) {
        var vp = (iy / segH) * Math.PI; var svp = Math.sin(vp), cvp = Math.cos(vp); var row = [];
        for (ix = 0; ix <= segW; ix++) {
          var up = (ix === segW ? 0 : ix / segW) * Math.PI * 2;
          var nx = iy === 0 || iy === segH ? 0 : svp * Math.cos(up);
          var ny = iy === 0 ? 1 : (iy === segH ? -1 : cvp);
          var nz = iy === 0 || iy === segH ? 0 : svp * Math.sin(up);
          var rad = evalRockRadius(nx, ny, nz, rSeed, 0.44, null); var lx = nx * rad * sx;
          var ly = ny * rad * sy; var lz = nz * rad * sz;
          var x1 = lx * cyw - lz * syw; var z1 = lx * syw + lz * cyw; var y2 = ly * cp - z1 * sp;
          var z2 = ly * sp + z1 * cp;
          row.push({ x: cx + x1, y: cy + y2, z: cz + z2 });
        }
        pts.push(row);
      }

      for (iy = 0; iy < segH; iy++) {
        for (ix = 0; ix < segW; ix++) {
          var qA = pts[iy][ix], qB = pts[iy + 1][ix], qC = pts[iy + 1][ix + 1], qD = pts[iy][ix + 1];
          var tris = [[qA, qB, qD], [qB, qC, qD]];
          for (var t = 0; t < 2; t++) {
            var p0 = tris[t][0], p1 = tris[t][1], p2 = tris[t][2];
            var ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
            var vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z; var fnx = uy * vz - uz * vy;
            var fny = uz * vx - ux * vz; var fnz = ux * vy - uy * vx;
            var nl = Math.sqrt(fnx * fnx + fny * fny + fnz * fnz) || 1; fnx /= nl; fny /= nl; fnz /= nl;
            for (var kv = 0; kv < 3; kv++) {
              var pv = tris[t][kv];
              posArr[outOff] = pv.x; posArr[outOff + 1] = pv.y; posArr[outOff + 2] = pv.z;
              normArr[outOff] = fnx; normArr[outOff + 1] = fny; normArr[outOff + 2] = fnz;
              colArr[outOff] = cr; colArr[outOff + 1] = cg; colArr[outOff + 2] = cb;
              outOff += 3;
            }
          }
        }
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normArr, 3));
    geo.setAttribute("aColor", new THREE.Float32BufferAttribute(colArr, 3));
    return geo;
  }

  /* 太阳表面拱形磁环日珥带状几何体 */
  function buildProminenceArchGeometry(THREE, archSpanR, archHeightR) {
    var segs = 28; var posArr = new Float32Array(segs * 2 * 9); var uvArr = new Float32Array(segs * 2 * 6);
    var pOff = 0, uOff = 0;

    function archPt(t, side) {
      var s = (t - 0.5) * 2; var x = s * archSpanR; var y = (1 - s * s) * archHeightR;
      var halfW = (0.04 + 0.08 * Math.sin(t * Math.PI)) * archHeightR;
      var z = side * halfW;
      return { x: x, y: y, z: z, u: t, v: side * 0.5 + 0.5 };
    }

    for (var i = 0; i < segs; i++) {
      var t0 = i / segs, t1 = (i + 1) / segs; var a0 = archPt(t0, -1), a1 = archPt(t0, 1);
      var b0 = archPt(t1, -1), b1 = archPt(t1, 1); var quad = [a0, b0, a1, b0, b1, a1];
      for (var k = 0; k < 6; k++) {
        posArr[pOff++] = quad[k].x; posArr[pOff++] = quad[k].y; posArr[pOff++] = quad[k].z;
        uvArr[uOff++] = quad[k].u; uvArr[uOff++] = quad[k].v;
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvArr, 2));
    return geo;
  }

  /* ---------- 程序化贴图生成器（全部离屏 Canvas，零外部图片） ---------- */

  function buildGlowTexture(THREE) {
    var S = 128; var c = document.createElement("canvas"); c.width = c.height = S;
    var ctx = c.getContext("2d"); var g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1.0)"); g.addColorStop(0.12, "rgba(255,255,255,0.66)");
    g.addColorStop(0.34, "rgba(255,255,255,0.19)"); g.addColorStop(0.68, "rgba(255,255,255,0.04)");
    g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  function buildStarCoronaTexture(THREE) {
    var S = 256; var c = document.createElement("canvas"); c.width = c.height = S;
    var ctx = c.getContext("2d"); var cx = S / 2;

    var g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx); g.addColorStop(0, "rgba(255,255,255,1.0)");
    g.addColorStop(0.10, "rgba(255,253,248,0.88)"); g.addColorStop(0.24, "rgba(255,246,232,0.32)");
    g.addColorStop(0.52, "rgba(255,240,220,0.06)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

    var rand = rng(0x7c3a91e5); ctx.save(); ctx.translate(cx, cx);
    for (var i = 0; i < 42; i++) {
      var ang = (i / 42) * Math.PI * 2 + (rand() - 0.5) * 0.08; var len = S * (0.24 + rand() * 0.21);
      var lg = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
      lg.addColorStop(0, "rgba(255,255,255,0.18)"); lg.addColorStop(0.45, "rgba(255,255,255,0.05)");
      lg.addColorStop(1, "rgba(255,255,255,0)"); ctx.strokeStyle = lg; ctx.lineWidth = 0.9 + rand() * 1.2;
      ctx.beginPath(); ctx.moveTo(Math.cos(ang) * 7, Math.sin(ang) * 7);
      ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len); ctx.stroke();
    }

    var hGrad = ctx.createLinearGradient(-cx * 0.98, 0, cx * 0.98, 0);
    hGrad.addColorStop(0, "rgba(255,255,255,0)"); hGrad.addColorStop(0.34, "rgba(255,255,255,0.15)");
    hGrad.addColorStop(0.5, "rgba(255,255,255,0.68)"); hGrad.addColorStop(0.66, "rgba(255,255,255,0.15)");
    hGrad.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = hGrad;
    ctx.fillRect(-cx * 0.98, -1.4, S * 0.98, 2.8);

    var vGrad = ctx.createLinearGradient(0, -cx * 0.65, 0, cx * 0.65);
    vGrad.addColorStop(0, "rgba(255,255,255,0)"); vGrad.addColorStop(0.44, "rgba(255,255,255,0.11)");
    vGrad.addColorStop(0.5, "rgba(255,255,255,0.38)"); vGrad.addColorStop(0.56, "rgba(255,255,255,0.11)");
    vGrad.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = vGrad;
    ctx.fillRect(-1.0, -cx * 0.65, 2.0, S * 0.65); ctx.restore();

    return new THREE.CanvasTexture(c);
  }

  /* 相机镜头光学光圈鬼影贴图（六边形光圈边缘衍射） */
  function buildLensGhostTexture(THREE) {
    var S = 128; var c = document.createElement("canvas"); c.width = c.height = S;
    var ctx = c.getContext("2d"); var img = ctx.createImageData(S, S); var d = img.data; var cx = S / 2;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var px = (x - cx) / cx; var py = (y - cx) / cx;
        var ax = Math.abs(px), ay = Math.abs(py); var hex = Math.max(ax * 0.866025 + ay * 0.5, ay);
        var idx = (y * S + x) * 4;
        if (hex > 0.96) { d[idx + 3] = 0; continue; }
        var fill = (1.0 - hex * 0.55) * 0.28;
        var edge = Math.exp(-Math.pow((hex - 0.82) * 12.0, 2.0)) * 0.72;
        var a = clamp((fill + edge) * smoothstepJS(0.96, 0.84, hex), 0, 1);
        d[idx] = 245; d[idx + 1] = 250; d[idx + 2] = 255; d[idx + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }

  /* 远景极小螺旋 / 椭圆星系光斑贴图（哈勃超深场尺度参照） */
  function buildDistantGalaxyTexture(THREE, isSpiral, seed) {
    var S = 128; var c = document.createElement("canvas"); c.width = c.height = S;
    var ctx = c.getContext("2d"); var img = ctx.createImageData(S, S); var d = img.data; var cx = S / 2;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var dx = (x - cx) / cx; var dy = ((y - cx) / cx) * (isSpiral ? 1.85 : 1.45);
        var r = Math.sqrt(dx * dx + dy * dy); var idx = (y * S + x) * 4;
        if (r >= 1.0) { d[idx + 3] = 0; continue; }
        var core = Math.exp(-r * r * 16.0); var disk = Math.exp(-r * 3.2) * (1 - r); var arm = 1.0;
        if (isSpiral) {
          var ang = Math.atan2(dy, dx); var sp = Math.cos(ang * 2.0 - Math.log(r + 0.09) * 3.4 + seed);
          arm = 0.45 + 0.85 * Math.pow(Math.max(0, sp), 2.4);
        }
        var lum = clamp(core * 0.95 + disk * arm * 0.58, 0, 1);
        d[idx] = Math.round(lerp(168, 255, core) * lum);
        d[idx + 1] = Math.round(lerp(196, 244, core) * lum);
        d[idx + 2] = Math.round(lerp(245, 214, core) * lum); d[idx + 3] = Math.round(lum * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }

  function buildLensRingTexture(THREE) {
    var S = 256; var c = document.createElement("canvas"); c.width = c.height = S;
    var ctx = c.getContext("2d"); var cx = S / 2;

    var g = ctx.createRadialGradient(cx, cx, S * 0.14, cx, cx, cx);
    g.addColorStop(0.0, "rgba(255,235,195,0.0)"); g.addColorStop(0.42, "rgba(255,236,205,0.04)");
    g.addColorStop(0.70, "rgba(255,242,220,0.18)"); g.addColorStop(0.84, "rgba(255,248,235,0.56)");
    g.addColorStop(0.91, "rgba(205,228,255,0.18)"); g.addColorStop(1.0, "rgba(140,190,255,0.0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

    var rand = rng(0x9b4711c3); ctx.save(); ctx.translate(cx, cx);
    for (var i = 0; i < 64; i++) {
      var rr = S * (0.24 + Math.pow(rand(), 0.7) * 0.24); var a0 = rand() * Math.PI * 2;
      var span = 0.05 + rand() * 0.16; var alpha = 0.14 + (rr / (S * 0.5)) * 0.34;
      ctx.strokeStyle = "rgba(255,248,236," + alpha.toFixed(3) + ")";
      ctx.lineWidth = 0.8 + rand() * 0.9; ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + span); ctx.stroke();
    }
    ctx.restore();
    return new THREE.CanvasTexture(c);
  }

  function buildBeamTexture(THREE, sharpness) {
    var W = 64, H = 256; var c = document.createElement("canvas"); c.width = W; c.height = H;
    var ctx = c.getContext("2d"); var img = ctx.createImageData(W, H); var d = img.data;
    for (var y = 0; y < H; y++) {
      var v = y / (H - 1);
      var axial = Math.sin(Math.min(1, v * 4.5) * Math.PI * 0.5) * Math.pow(1 - v, 1.48);
      var halfWidth = 0.13 + v * 0.34;
      for (var x = 0; x < W; x++) {
        var u = Math.abs((x / (W - 1)) - 0.5) / halfWidth;
        var lat = u >= 1 ? 0 : Math.pow(1 - u * u, sharpness || 2.2); var a = clamp(axial * lat, 0, 1);
        var idx = (y * W + x) * 4; d[idx] = 240; d[idx + 1] = 246; d[idx + 2] = 255;
        d[idx + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }

  /* 5 类高精细度差异化行星球面贴图（类地海洋大陆云系冰盖 / 巨行星云带风暴 / 冰裂谷 / 赤铁峡谷极冠 / 黑曜熔岩） */
  function buildPlanetTexture(THREE, node, archetype) {
    var pal = node.palette; var seed = (hashStr(node.id) ^ 0x9e3779b9) >>> 0; var rand = rng(seed);
    var W = 256, H = 128; var c = document.createElement("canvas"); c.width = W; c.height = H;
    var ctx = c.getContext("2d"); var img = ctx.createImageData(W, H); var data = img.data;
    var deep = palArr(pal, "deep"), mid = palArr(pal, "mid"), high = palArr(pal, "high"), accent = palArr(pal, "accent");
    var bandFreq = 3.2 + rand() * 3.8; var phase = rand() * 6.283;
    var stormU = 0.25 + rand() * 0.5, stormV = 0.34 + rand() * 0.32;

    for (var y = 0; y < H; y++) {
      var t = y / (H - 1); var lat = (t - 0.5) * 2; var absLat = Math.abs(lat);
      var latR = Math.cos(lat * Math.PI * 0.49);
      for (var x = 0; x < W; x++) {
        var u = x / W; var ang = u * Math.PI * 2; var sx = Math.cos(ang) * latR;
        var sz = Math.sin(ang) * latR;
        var n1 = fbm3D(sx * 2.4 + 3.1, lat * 2.4 - 1.7, sz * 2.4 + 5.3, 4, seed & 0xffff);
        var n2 = fbm3D(sx * 5.8 - 2.4, lat * 5.8 + 4.1, sz * 5.8 - 1.3, 3, (seed >>> 8) & 0xffff);
        var cloud = fbm3D(sx * 3.6 + n1 * 1.4, lat * 4.2, sz * 3.6 - n1 * 1.2, 3, (seed >>> 4) & 0xffff);

        var r = 80, g = 110, b = 150;

        if (archetype === 0) {
          var seaLevel = 0.49; var iceCap = smoothstepJS(0.74, 0.88, absLat + (n1 - 0.5) * 0.16);
          if (n1 < seaLevel) {
            var shelf = smoothstepJS(seaLevel - 0.14, seaLevel, n1); r = lerp(8, 22, shelf);
            g = lerp(32, 108, shelf); b = lerp(78, 168, shelf);
          } else {
            var elev = clamp((n1 - seaLevel) / (1 - seaLevel), 0, 1); var arid = clamp(n2 * 1.3 - absLat * 0.55, 0, 1); r = lerp(lerp(34, 166, arid), 212, smoothstepJS(0.55, 0.92, elev)); g = lerp(lerp(112, 134, arid), 204, smoothstepJS(0.55, 0.92, elev)); b = lerp(lerp(52, 78, arid), 198, smoothstepJS(0.55, 0.92, elev));
          }
          r = lerp(r, 238, iceCap); g = lerp(g, 246, iceCap); b = lerp(b, 255, iceCap);
          var cloudMask = smoothstepJS(0.52, 0.78, cloud) * 0.76; r = lerp(r, 248, cloudMask);
          g = lerp(g, 251, cloudMask); b = lerp(b, 255, cloudMask);

        } else if (archetype === 1) {
          var jet = 0.5 + 0.5 * Math.sin((t * bandFreq + phase) * Math.PI * 2 + (n1 - 0.5) * 2.4 + (n2 - 0.5) * 0.9);
          var fineBand = 0.5 + 0.5 * Math.cos(t * bandFreq * 15.0 + n2 * 4.2);
          var v = clamp(jet * 0.74 + fineBand * 0.26, 0, 1); var du = Math.abs(u - stormU);
          if (du > 0.5) du = 1 - du;
          var dv = (t - stormV) * 2.1; var sd = Math.sqrt(du * du * 7.5 + dv * dv * 18.0);
          var stormMix = sd < 0.20 ? smoothstepJS(0.20, 0.03, sd) : 0;
          r = lerp(lerp(deep[0], mid[0], v), high[0], smoothstepJS(0.52, 0.95, v));
          g = lerp(lerp(deep[1], mid[1], v), high[1], smoothstepJS(0.52, 0.95, v));
          b = lerp(lerp(deep[2], mid[2], v), accent[2], smoothstepJS(0.58, 0.96, v));
          if (stormMix > 0) {
            r = lerp(r, 238, stormMix * 0.75); g = lerp(g, 118, stormMix * 0.55);
            b = lerp(b, 76, stormMix * 0.65);
          }

        } else if (archetype === 2) {
          var crack1 = Math.abs(fbm3D(sx * 4.8, lat * 4.8, sz * 4.8, 3, seed + 19) - 0.5);
          var crack2 = Math.abs(fbm3D(sx * 8.2 + 2.0, lat * 8.2, sz * 8.2 - 1.5, 2, seed + 83) - 0.5);
          var fissure = Math.max(smoothstepJS(0.055, 0.006, crack1), smoothstepJS(0.038, 0.004, crack2) * 0.75);
          r = lerp(176 + n1 * 55, 168, fissure); g = lerp(218 + n1 * 32, 92, fissure);
          b = lerp(242 + n1 * 13, 68, fissure);

        } else if (archetype === 3) {
          var canyon = smoothstepJS(0.36, 0.68, n1 * 0.72 + n2 * 0.28);
          var frost = smoothstepJS(0.80, 0.91, absLat + (n2 - 0.5) * 0.12);
          r = lerp(64, 198, canyon); g = lerp(34, 96, canyon); b = lerp(28, 62, canyon);
          r = lerp(r, 245, frost); g = lerp(g, 248, frost); b = lerp(b, 255, frost);

        } else if (archetype === 4) {
          var rift = smoothstepJS(0.08, 0.008, Math.abs(n1 - 0.50)); var rock = 24 + n2 * 44;
          r = lerp(rock, 255, rift); g = lerp(rock * 0.92, 132, rift); b = lerp(rock * 1.05, 28, rift);

        } else if (archetype === 5) {
          var iceBand = 0.5 + 0.5 * Math.sin((t * (bandFreq * 1.35) + phase) * Math.PI * 2 + (n1 - 0.5) * 1.6);
          var streak = smoothstepJS(0.66, 0.92, cloud * 0.65 + n2 * 0.35);
          r = lerp(10, 56, iceBand); g = lerp(52, 178, iceBand); b = lerp(148, 248, iceBand);
          r = lerp(r, 224, streak * 0.68); g = lerp(g, 248, streak * 0.72); b = lerp(b, 255, streak * 0.76);

        } else if (archetype === 6) {
          var archSea = 0.51; var polar = smoothstepJS(0.76, 0.90, absLat + (n2 - 0.5) * 0.14);
          if (n1 < archSea) {
            var sh = smoothstepJS(archSea - 0.16, archSea, n1);
            r = lerp(6, 26, sh); g = lerp(54, 152, sh); b = lerp(68, 158, sh);
          } else {
            var hi = smoothstepJS(archSea, 0.90, n1);
            r = lerp(42, 196, hi); g = lerp(128, 172, hi); b = lerp(74, 108, hi);
          }
          var haze = smoothstepJS(0.55, 0.84, cloud) * 0.58;
          r = lerp(lerp(r, 232, polar), 252, haze);
          g = lerp(lerp(g, 246, polar), 244, haze);
          b = lerp(lerp(b, 248, polar), 218, haze);

        } else {
          var satBand = 0.5 + 0.5 * Math.sin((t * (bandFreq * 1.15) - phase) * Math.PI * 2 + (n1 - 0.5) * 1.35);
          var polarHex = smoothstepJS(0.68, 0.92, absLat);
          r = lerp(lerp(148, 236, satBand), 156, polarHex * 0.55);
          g = lerp(lerp(116, 206, satBand), 124, polarHex * 0.55);
          b = lerp(lerp(96, 168, satBand), 214, polarHex * 0.72);
        }

        var idx = (y * W + x) * 4; data[idx] = clamp(Math.round(r), 0, 255);
        data[idx + 1] = clamp(Math.round(g), 0, 255); data[idx + 2] = clamp(Math.round(b), 0, 255);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0); var tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  /* 潮汐锁定与高对比环形山卫星贴图（前导暗色玄武岩半球 + 辐射纹亮撞击坑） */
  function buildMoonTexture(THREE, seedKey, pal) {
    var seed = (hashStr(seedKey) ^ 0x51a7e111) >>> 0; var rand = rng(seed); var W = 128, H = 64;
    var c = document.createElement("canvas"); c.width = W; c.height = H; var ctx = c.getContext("2d");
    var img = ctx.createImageData(W, H); var data = img.data; var mid = palArr(pal, "mid");
    var toneMode = seed % 3;
    var baseR = toneMode === 0 ? lerp(136, mid[0], 0.16) : (toneMode === 1 ? 148 : 118);
    var baseG = toneMode === 0 ? lerp(140, mid[1], 0.16) : (toneMode === 1 ? 136 : 128);
    var baseB = toneMode === 0 ? lerp(148, mid[2], 0.18) : (toneMode === 1 ? 116 : 142);

    var craters = [];
    for (var ci = 0; ci < 14; ci++) {
      craters.push({ u: rand(), v: 0.14 + rand() * 0.72, rad: 0.035 + rand() * 0.085, ray: ci < 3 });
    }

    for (var y = 0; y < H; y++) {
      var t = y / (H - 1); var lat = (t - 0.5) * 2; var latR = Math.cos(lat * Math.PI * 0.48);
      for (var x = 0; x < W; x++) {
        var u = x / W; var ang = u * Math.PI * 2;
        var n = fbm3D(Math.cos(ang) * latR * 2.6 + 2.1, lat * 2.6, Math.sin(ang) * latR * 2.6 + 4.3, 3, seed & 0xffff);
        var tidalFace = 0.82 + 0.24 * Math.cos(ang + 0.6); var maria = n < 0.44 ? 0.74 : 1.04;
        var shade = (0.54 + (n - 0.5) * 0.42) * tidalFace * maria;

        for (var k = 0; k < craters.length; k++) {
          var cr = craters[k]; var du = Math.abs(u - cr.u);
          if (du > 0.5) du = 1 - du;
          var dv = t - cr.v; var dist = Math.sqrt(du * du + dv * dv * 0.82);
          if (dist < cr.rad) {
            var q = dist / cr.rad;
            if (q < 0.74) shade -= (1 - q / 0.74) * 0.24;
            else shade += Math.sin(((q - 0.74) / 0.26) * Math.PI) * 0.22;
          } else if (cr.ray && dist < cr.rad * 2.4) {
            var rAng = Math.atan2(dv, du); var rays = Math.pow(Math.max(0, Math.cos(rAng * 7.0 + k)), 6.0); shade += rays * (1 - dist / (cr.rad * 2.4)) * 0.16;
          }
        }
        shade = clamp(shade, 0.18, 1.05); var idx = (y * W + x) * 4;
        data[idx] = clamp(Math.round(baseR * shade), 0, 255);
        data[idx + 1] = clamp(Math.round(baseG * shade), 0, 255);
        data[idx + 2] = clamp(Math.round(baseB * shade), 0, 255); data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0); var tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  /* 细密冰尘行星环径向光学厚度贴图 */
  function buildRingTexture(THREE, pal, seedKey) {
    var S = 256; var c = document.createElement("canvas"); c.width = c.height = S;
    var ctx = c.getContext("2d"); var cx = S / 2; var ringCol = palArr(pal, "ring");
    var accentCol = palArr(pal, "accent"); var rand = rng(hashStr(seedKey || "ring"));
    var cassiniGap = 0.58 + rand() * 0.10; var enckeGap = 0.84;

    for (var i = 0; i < 128; i++) {
      var frac = i / 128; var r = (0.305 + frac * 0.19) * S;
      var gap1 = Math.abs(frac - cassiniGap) < 0.045 ? 0.05 : 1.0;
      var gap2 = Math.abs(frac - enckeGap) < 0.018 ? 0.14 : 1.0;
      var cRing = frac < 0.18 ? (0.32 + frac * 3.2) : 1.0;
      var env = Math.sin(Math.min(1, frac * 1.04) * Math.PI);
      var a = (0.14 + 0.54 * Math.abs(Math.sin(i * 0.78 + rand() * 0.5))) * env * gap1 * gap2 * cRing;
      var mixK = frac > cassiniGap ? 0.44 : 0.16; var rr = Math.round(lerp(ringCol[0], accentCol[0], mixK));
      var gg = Math.round(lerp(ringCol[1], accentCol[1], mixK));
      var bb = Math.round(lerp(ringCol[2], accentCol[2], mixK));
      ctx.strokeStyle = "rgba(" + rr + "," + gg + "," + bb + "," + clamp(a, 0, 0.92).toFixed(3) + ")";
      ctx.lineWidth = 1.35; ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  function buildGalaxyDustTexture(THREE, pal, arms, twist, seed) {
    var S = 256; var c = document.createElement("canvas"); c.width = c.height = S;
    var ctx = c.getContext("2d"); var img = ctx.createImageData(S, S); var d = img.data; var cx = S / 2;
    var atmo = palArr(pal, "atmo");

    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var dx = (x - cx) / cx; var dy = (y - cx) / cx; var r = Math.sqrt(dx * dx + dy * dy);
        var idx = (y * S + x) * 4;
        if (r >= 1.0 || r < 0.05) {
          d[idx + 3] = 0; continue;
        }
        var ang = Math.atan2(dy, dx); var n = fbm2D(dx * 3.8 + 7.2, dy * 3.8 + 4.1, 3, seed & 0xffff);
        var spiralPhase = ang * arms - Math.log(r + 0.08) * twist + (n - 0.5) * 1.65;
        var dustLane = Math.pow(Math.max(0, Math.cos(spiralPhase + 0.55)), 4.0);
        var hiiGlow = Math.pow(Math.max(0, Math.cos(spiralPhase - 0.12)), 6.5);
        var radialEnv = Math.sin(Math.min(1, r * 1.12) * Math.PI) * (1 - r * 0.84);

        var darkAlpha = dustLane * radialEnv * (0.48 + n * 0.28);
        var glowAlpha = hiiGlow * radialEnv * 0.18; var totalA = clamp(darkAlpha + glowAlpha, 0, 0.60);

        var k = glowAlpha / Math.max(0.001, darkAlpha + glowAlpha);
        d[idx] = Math.round(lerp(3, atmo[0], k)); d[idx + 1] = Math.round(lerp(5, atmo[1], k));
        d[idx + 2] = Math.round(lerp(11, atmo[2], k)); d[idx + 3] = Math.round(totalA * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }

  function buildMilkyWayTexture(THREE) {
    var W = 512, H = 256; var c = document.createElement("canvas"); c.width = W; c.height = H;
    var ctx = c.getContext("2d"); var img = ctx.createImageData(W, H); var d = img.data;

    for (var y = 0; y < H; y++) {
      var v = y / (H - 1); var lat = (v - 0.5) * 2;
      var wideWing = Math.exp(-lat * lat * 4.6);
      var bandEnv = Math.exp(-lat * lat * 10.5);
      var riftEnv = Math.exp(-lat * lat * 36.0);
      for (var x = 0; x < W; x++) {
        var u = x / W; var ang = u * Math.PI * 2; var cx = Math.cos(ang) * 2.8 + 11.3;
        var cz = Math.sin(ang) * 2.8 + 5.7; var cloud = fbm2D(cx, cz + v * 4.8, 4, 3011);
        var fine = fbm2D(cx * 3.2, cz * 3.2 + v * 9.6, 3, 7919);
        var rift = fbm2D(cx * 2.3 + 2.1, cz * 2.3 + v * 7.2, 4, 5107);

        var coreLon = Math.exp(-Math.pow((u - 0.48) * 3.4, 2));
        var lum = (wideWing * 0.34 + bandEnv * (0.42 + coreLon * 0.58)) * (0.34 + cloud * 0.86) * (0.56 + fine * 0.62);
        var dustCut = riftEnv * clamp((rift - 0.34) * 2.85, 0, 0.90);
        var net = clamp(lum * (1 - dustCut), 0, 1);

        var warmBulge = coreLon * bandEnv;
        var rustRim = dustCut * bandEnv * (0.45 + 0.55 * warmBulge);
        var tealWing = wideWing * (1 - warmBulge * 0.65);

        var r = (lerp(56, 255, warmBulge * 0.78 + fine * 0.16) * net) + rustRim * 96 + tealWing * 18 * cloud;
        var g = (lerp(116, 212, warmBulge * 0.62 + cloud * 0.22) * net) + rustRim * 38 + tealWing * 58 * cloud;
        var b = (lerp(196, 198, warmBulge * 0.42 + cloud * 0.36) * net) + rustRim * 22 + tealWing * 108 * cloud;

        var idx = (y * W + x) * 4; d[idx] = clamp(Math.round(r), 0, 255);
        d[idx + 1] = clamp(Math.round(g), 0, 255); d[idx + 2] = clamp(Math.round(b), 0, 255);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0); var tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  /* 深空巴纳德暗尘埃云与局部暗弱伪色星云贴图（绝不铺满全屏霓虹） */
  function buildNebulaTexture(THREE, colA, colB, isDarkSmoke, seed) {
    var S = 256; var c = document.createElement("canvas"); c.width = c.height = S;
    var ctx = c.getContext("2d"); var img = ctx.createImageData(S, S); var d = img.data; var cx = S / 2;

    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var dx = (x - cx) / cx; var dy = (y - cx) / cx; var r = Math.sqrt(dx * dx + dy * dy);
        var idx = (y * S + x) * 4;
        if (r >= 1) {
          d[idx + 3] = 0; continue;
        }
        var falloff = Math.pow(1 - r * r, 2.2); var w1 = fbm2D(dx * 2.6 + 6.1, dy * 2.6 + 2.9, 4, seed);
        var w2 = fbm2D(dx * 5.2 + w1 * 1.5, dy * 5.2 - w1 * 1.3, 3, seed + 409);
        var fil = clamp((w1 * 0.60 + w2 * 0.48 - 0.25) * 1.6, 0, 1); var a = falloff * fil;
        if (isDarkSmoke) {
          var litEdge = clamp((w2 - 0.54) * 2.2, 0, 1) * falloff;
          d[idx] = Math.round(lerp(3, colA[0], litEdge * 0.42));
          d[idx + 1] = Math.round(lerp(5, colA[1], litEdge * 0.42));
          d[idx + 2] = Math.round(lerp(11, colA[2], litEdge * 0.44));
          d[idx + 3] = Math.round(clamp(a * 0.82, 0, 0.78) * 255);
        } else {
          d[idx] = Math.round(lerp(colA[0], colB[0], w2)); d[idx + 1] = Math.round(lerp(colA[1], colB[1], w2)); d[idx + 2] = Math.round(lerp(colA[2], colB[2], w2)); d[idx + 3] = Math.round(clamp(a * 0.42, 0, 0.42) * 255);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }

  /* ---------- GLSL 着色器（严格兼容 Three.js r15x/r160 WebGL1 & WebGL2） ---------- */

  /* 1. 动态深空天穹着色器：近黑至极暗蓝紫渐变 + 低亮度弥散银河带 + 局部暗弱伪色星云与暗分子云遮蔽 */
  var SKYDOME_VERT = [
    "varying vec3 vDir;", "void main() {", "  vDir = normalize(position);",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);", "}"
  ].join("\n");

  var SKYDOME_FRAG = [
    "uniform sampler2D uMilkyTex;", "uniform float uTime;", "varying vec3 vDir;", "float skyNoise(vec3 p) {",
    "  float a = sin(p.x * 3.7 + p.z * 2.9) * cos(p.y * 4.1 - p.x * 1.8);",
    "  float b = sin(p.y * 8.3 - p.z * 6.7 + 1.4) * cos(p.x * 7.9 + p.z * 5.2);",
    "  return clamp(0.5 + a * 0.32 + b * 0.18, 0.0, 1.0);", "}", "void main() {", "  vec3 d = normalize(vDir);",
    "  vec3 abyss = vec3(0.008, 0.011, 0.028);", "  vec3 deepIndigo = vec3(0.024, 0.036, 0.088);",
    "  float horizon = 1.0 - abs(d.y);", "  vec3 col = mix(abyss, deepIndigo, pow(horizon, 1.55) * 0.78);",
    "  vec3 galUp = normalize(vec3(0.54, 0.78, -0.31));",
    "  vec3 galX = normalize(cross(vec3(0.0, 1.0, 0.0), galUp));", "  vec3 galZ = cross(galUp, galX);",
    "  float gLat = dot(d, galUp);", "  float gLon = atan(dot(d, galZ), dot(d, galX)) / 6.2831853 + 0.5;",
    "  float bandMask = exp(-gLat * gLat * 7.8);",
    "  float wingMask = exp(-gLat * gLat * 2.8);",
    "  vec2 mUv1 = vec2(gLon + uTime * 0.0018, clamp(gLat * 0.98 + 0.5, 0.02, 0.98));",
    "  vec2 mUv2 = vec2(gLon * 1.37 - uTime * 0.0012 + 0.27, clamp(gLat * 1.12 + 0.5, 0.02, 0.98));",
    "  vec3 mw = mix(texture2D(uMilkyTex, mUv1).rgb, texture2D(uMilkyTex, mUv2).rgb, 0.42);",
    "  float shimmer = 0.90 + 0.10 * sin(uTime * 0.42 + gLon * 18.0);",
    "  col += mw * bandMask * 0.42 * shimmer;",
    "  float n1 = skyNoise(d * 1.8 + vec3(uTime * 0.006, 0.0, -uTime * 0.005));",
    "  float n2 = skyNoise(d * 3.9 - vec3(0.0, uTime * 0.005, uTime * 0.006));",
    "  col += vec3(0.018, 0.056, 0.105) * wingMask * smoothstep(0.36, 0.82, n1 * 0.62 + n2 * 0.38);",
    "  float irPatch = smoothstep(0.52, 0.92, dot(d, normalize(vec3(-0.68, 0.26, -0.68)))) * smoothstep(0.42, 0.82, n1 * 0.65 + n2 * 0.35);",
    "  float uvPatch = smoothstep(0.54, 0.94, dot(d, normalize(vec3(0.66, -0.32, 0.68)))) * smoothstep(0.45, 0.84, n2 * 0.68 + n1 * 0.32);",
    "  col += vec3(0.082, 0.028, 0.024) * irPatch;", "  col += vec3(0.020, 0.058, 0.096) * uvPatch;",
    "  float darkCloud = bandMask * smoothstep(0.52, 0.82, skyNoise(d * 2.9 + vec3(2.1 + uTime * 0.002, -1.3, 0.8)));",
    "  col = mix(col, vec3(0.032, 0.012, 0.010), darkCloud * 0.46);", "  gl_FragColor = vec4(col, 1.0);", "}"
  ].join("\n");

  /* 2. 中心最大天体「太阳」超写实光球层与色球层着色器（米粒组织 + 黑子本影半影 + 光斑 + 临边昏暗 + 色球针状体） */
  var SUN_VERT = [
    "varying vec3 vNormalV;", "varying vec3 vObjPos;", "void main() {", "  vObjPos = normalize(position);",
    "  vNormalV = normalize(normalMatrix * normal);",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);", "}"
  ].join("\n");

  var SUN_FRAG = [
    "uniform float uTime;", "uniform float uDim;", "uniform float uStorm;", "varying vec3 vNormalV;",
    "varying vec3 vObjPos;", "float gyroid(vec3 p) {", "  return dot(sin(p), cos(p.yzx));", "}",
    "float sunGranulation(vec3 p, float t) {",
    "  float g1 = 1.0 - abs(gyroid(p * 18.0 + vec3(t * 0.55, -t * 0.42, t * 0.38))) * 0.58;",
    "  float g2 = 1.0 - abs(gyroid(p * 37.0 - vec3(t * 0.95, t * 0.75, -t * 0.65))) * 0.55;",
    "  float superG = 0.5 + 0.5 * gyroid(p * 6.8 + vec3(0.0, t * 0.18, 0.0)) * 0.58;",
    "  return clamp(g1 * 0.52 + g2 * 0.30 + superG * 0.24 - 0.12, 0.0, 1.0);", "}", "void main() {",
    "  vec3 N = normalize(vNormalV);", "  float mu = clamp(dot(N, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);",
    "  vec3 p0 = normalize(vObjPos);", "  float diffOmega = uTime * (0.095 - 0.032 * p0.y * p0.y);",
    "  float cs = cos(diffOmega), sn = sin(diffOmega);",
    "  vec3 p = vec3(p0.x * cs - p0.z * sn, p0.y, p0.x * sn + p0.z * cs);",
    "  float gran = sunGranulation(p, uTime);", "  float activeBelt = exp(-pow((abs(p.y) - 0.26) * 6.8, 2.0));",
    "  float spotField = gyroid(p * 5.2 + vec3(1.7, -2.3, 0.9)) * 0.5 + 0.5;",
    "  float spotDetail = gyroid(p * 14.5 - vec3(0.8, 1.4, -2.1)) * 0.5 + 0.5;",
    "  float spotVal = activeBelt * smoothstep(0.68, 0.92, spotField * 0.76 + spotDetail * 0.24);",
    "  float umbra = smoothstep(0.52, 0.86, spotVal);",
    "  float penumbra = smoothstep(0.16, 0.56, spotVal) * (1.0 - umbra);",
    "  float faculae = activeBelt * smoothstep(0.56, 0.74, spotField) * (1.0 - smoothstep(0.72, 0.86, spotField)) * (0.45 + 0.95 * (1.0 - mu));",
    "  vec3 cCenter = vec3(1.00, 0.97, 0.84);", "  vec3 cMid = vec3(1.00, 0.68, 0.16);",
    "  vec3 cLimb = vec3(0.86, 0.22, 0.03);", "  float limbCurve = pow(mu, 0.56);",
    "  vec3 photo = mix(cLimb, cMid, smoothstep(0.0, 0.58, limbCurve));",
    "  photo = mix(photo, cCenter, pow(limbCurve, 1.65) * (0.55 + 0.45 * gran));",
    "  photo *= (0.76 + 0.38 * gran);", "  photo = mix(photo, vec3(0.46, 0.15, 0.025), penumbra * 0.78);",
    "  photo = mix(photo, vec3(0.09, 0.018, 0.004), umbra * 0.92);",
    "  photo += vec3(1.00, 0.88, 0.58) * faculae * 0.55;",
    "  float stormZone = smoothstep(0.72, 0.96, dot(p, normalize(vec3(0.78, 0.24, 0.58))));",
    "  photo += vec3(1.00, 0.92, 0.72) * stormZone * uStorm * 0.65;",
    "  float spicule = pow(1.0 - mu, 3.8) * (0.65 + 0.35 * sin(atan(N.y, N.x) * 46.0 + uTime * 3.2));",
    "  vec3 col = photo + vec3(1.00, 0.36, 0.07) * spicule * 0.72;", "  gl_FragColor = vec4(col * uDim, 1.0);",
    "}"
  ].join("\n");

  /* 3. 中心太阳日冕流线、CME 日冕物质抛射与高动态强太阳眩光着色器 */
  var SUN_CORONA_VERT = [
    "varying vec2 vPlane;", "void main() {", "  vPlane = uv * 2.0 - 1.0;",
    "  vec4 mvCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);", "  mvCenter.xy += position.xy;",
    "  gl_Position = projectionMatrix * mvCenter;", "}"
  ].join("\n");

  var SUN_CORONA_FRAG = [
    "uniform float uTime;", "uniform float uDim;", "uniform float uStorm;", "varying vec2 vPlane;",
    "void main() {", "  vec2 p = vPlane;", "  float r = length(p);", "  if (r > 1.0) discard;",
    "  float rDisk = 0.158;", "  float outsideDisk = smoothstep(rDisk * 0.94, rDisk * 1.03, r);",
    "  float ang = atan(p.y, p.x);", "  float eqBelt = 0.72 + 0.38 * pow(abs(cos(ang - 0.12)), 1.6);",
    "  float ray1 = 0.5 + 0.5 * sin(ang * 9.0 + sin(r * 10.0 - uTime * 0.85) * 0.9);",
    "  float ray2 = 0.5 + 0.5 * cos(ang * 23.0 - uTime * 0.45 + r * 14.0);",
    "  float streamer = (0.56 + 0.30 * ray1 + 0.18 * ray2) * eqBelt;",
    "  float innerChromo = exp(-max(0.0, r - rDisk) * 24.0) * 1.15;",
    "  float kCorona = exp(-max(0.0, r - rDisk) * 5.6) * streamer * 0.68;",
    "  float fCorona = pow(max(0.0, 1.0 - r), 2.8) * 0.16;", "  float cmePhase = fract(uTime * 0.075);",
    "  float cmeR = rDisk + 0.05 + cmePhase * 0.56;",
    "  float cmeSector = smoothstep(0.68, 0.97, cos(ang - 0.42 - sin(uTime * 0.11) * 0.5));",
    "  float cmeLoop = exp(-pow((r - cmeR) * 16.0, 2.0)) * cmeSector * sin(cmePhase * 3.14159) * (0.48 + uStorm * 0.45);",
    "  float hSpike = exp(-abs(p.y) * 38.0) * pow(max(0.0, 1.0 - abs(p.x)), 2.1) * smoothstep(rDisk * 0.85, rDisk * 1.35, abs(p.x)) * 0.92;",
    "  float vSpike = exp(-abs(p.x) * 56.0) * pow(max(0.0, 1.0 - abs(p.y) * 1.45), 2.4) * smoothstep(rDisk * 0.85, rDisk * 1.30, abs(p.y)) * 0.34;",
    "  float inten = (innerChromo + kCorona + fCorona + cmeLoop + hSpike + vSpike) * outsideDisk * (1.0 + uStorm * 0.18);",
    "  vec3 colInner = vec3(1.00, 0.94, 0.78);", "  vec3 colMid = vec3(1.00, 0.64, 0.18);",
    "  vec3 colOuter = vec3(0.92, 0.34, 0.08);",
    "  vec3 col = mix(colOuter, colMid, clamp(inten * 0.95, 0.0, 1.0));",
    "  col = mix(col, colInner, clamp(innerChromo * 0.65 + hSpike * 0.75 + cmeLoop * 0.45, 0.0, 1.0));",
    "  gl_FragColor = vec4(col * inten * uDim, clamp(inten, 0.0, 1.0));", "}"
  ].join("\n");

  /* 4. 太阳 3D 磁环日珥着色器 */
  var PROMINENCE_VERT = [
    "varying vec2 vUv;", "void main() {", "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);", "}"
  ].join("\n");

  var PROMINENCE_FRAG = [
    "uniform float uTime;", "uniform float uPhase;", "uniform float uDim;", "varying vec2 vUv;", "void main() {",
    "  float archEnv = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);",
    "  float coreTube = 1.0 - abs(vUv.y - 0.5) * 2.0;", "  coreTube = pow(clamp(coreTube, 0.0, 1.0), 1.8);",
    "  float flow = 0.62 + 0.38 * sin(vUv.x * 18.0 - uTime * 3.4 + uPhase);",
    "  float pulse = 0.55 + 0.45 * sin(uTime * 0.75 + uPhase);",
    "  float a = archEnv * coreTube * flow * pulse * 0.72;",
    "  vec3 col = mix(vec3(0.95, 0.24, 0.06), vec3(1.0, 0.84, 0.42), coreTube * 0.75);",
    "  gl_FragColor = vec4(col * a * uDim, a);", "}"
  ].join("\n");

  /* 5. 行星与卫星着色器：锐利真空硬阴影（无空气散射灰雾）+ 海洋高光 + 夜侧热源/城市微光 + 天体食遮挡变暗 */
  var PLANET_VERT = [
    "varying vec3 vNormalV;", "varying vec3 vObjPos;", "varying vec2 vUv;", "void main() {", "  vUv = uv;",
    "  vObjPos = normalize(position);", "  vNormalV = normalize(normalMatrix * normal);",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);", "}"
  ].join("\n");

  var PLANET_FRAG = [
    "uniform sampler2D map;", "uniform vec3 uRim;", "uniform vec3 uLightDirV;", "uniform float uDim;",
    "uniform float uGlow;", "uniform float uAlbedo;", "uniform float uAtmo;", "uniform float uNightGlow;",
    "uniform float uSpecStrength;", "uniform float uEclipse;", "varying vec3 vNormalV;", "varying vec3 vObjPos;",
    "varying vec2 vUv;", "void main() {", "  vec3 base = texture2D(map, vUv).rgb * uAlbedo;",
    "  vec3 N = normalize(vNormalV);", "  vec3 L = normalize(uLightDirV);", "  float ndl = dot(N, L);",
    "  float hardDay = smoothstep(-0.042, 0.058, ndl);", "  float lambert = pow(max(ndl, 0.0), 0.78);",
    "  float eclipseMul = 1.0 - uEclipse * 0.82;",
    "  vec3 eclipseTint = mix(vec3(1.0), vec3(0.76, 0.28, 0.14), uEclipse * 0.70);",
    "  float shade = 0.020 + 0.99 * hardDay * (0.22 + 0.78 * lambert) * eclipseMul;",
    "  float oceanMask = smoothstep(0.05, 0.22, base.b - base.r);",
    "  float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 34.0) * hardDay * (0.14 + oceanMask * 0.58) * uSpecStrength * eclipseMul;",
    "  float rim = pow(1.0 - max(dot(N, vec3(0.0, 0.0, 1.0)), 0.0), 3.6);",
    "  float sunCrescent = smoothstep(-0.10, 0.38, ndl);",
    "  float twilight = exp(-pow((ndl - 0.012) * 13.0, 2.0)) * uAtmo * 0.26 * eclipseMul;",
    "  float nSpark = sin(vObjPos.x * 39.0 + vObjPos.z * 31.0) * cos(vObjPos.y * 43.0 - vObjPos.x * 23.0);",
    "  float nightMask = (1.0 - smoothstep(-0.14, 0.02, ndl)) * uNightGlow * smoothstep(0.62, 0.92, nSpark);",
    "  vec3 nightCol = vec3(1.0, 0.56, 0.18) * nightMask * 0.55;",
    "  vec3 warmTerm = mix(uRim, vec3(1.0, 0.62, 0.30), 0.52);",
    "  vec3 col = base * shade * eclipseTint + vec3(spec) + nightCol + warmTerm * twilight + uRim * rim * (uAtmo * 0.42 * sunCrescent * eclipseMul + uGlow);",
    "  gl_FragColor = vec4(col * uDim, 1.0);", "}"
  ].join("\n");

  /* 6. 细密颗粒行星环着色器（实时计算行星球体投射到冰尘环上的锐利本影遮挡） */
  var PLANET_RING_VERT = [
    "varying vec2 vUv;", "varying vec3 vViewPos;", "varying vec2 vRingXY;", "void main() {", "  vUv = uv;",
    "  vRingXY = position.xy;", "  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);",
    "  vViewPos = mvPos.xyz;", "  gl_Position = projectionMatrix * mvPos;", "}"
  ].join("\n");

  var PLANET_RING_FRAG = [
    "uniform sampler2D map;", "uniform vec3 uPlanetCenterV;", "uniform vec3 uLightDirV;",
    "uniform float uPlanetR;", "uniform float uDim;", "uniform float uEclipse;", "varying vec2 vUv;",
    "varying vec3 vViewPos;", "varying vec2 vRingXY;", "void main() {", "  vec4 tex = texture2D(map, vUv);",
    "  if (tex.a < 0.015) discard;",
    "  float grain = 0.84 + 0.32 * fract(sin(dot(vRingXY, vec2(12.9898, 78.233))) * 43758.5453);",
    "  vec3 L = normalize(uLightDirV);", "  vec3 rel = vViewPos - uPlanetCenterV;",
    "  float along = dot(rel, L);", "  float dAxis = length(rel - L * along);",
    "  float bodyShadow = along < 0.0 ? smoothstep(uPlanetR * 0.94, uPlanetR * 1.06, dAxis) : 1.0;",
    "  float shadowFactor = mix(0.06, 1.0, bodyShadow) * (1.0 - uEclipse * 0.75);",
    "  vec3 col = tex.rgb * grain * shadowFactor;", "  gl_FragColor = vec4(col * uDim, tex.a * 0.88);", "}"
  ].join("\n");

  /* 7. 恒星 6 类差异化球面着色器（告别单一白球：超巨星对流胞/蓝巨星激波带/黑子磁星/青翠氦星/紫晶磁陀星/玫瑰脉动星） */
  var STAR_VERT = [
    "varying vec3 vNormalV;", "varying vec3 vObjPos;", "void main() {", "  vObjPos = normalize(position);",
    "  vNormalV = normalize(normalMatrix * normal);",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);", "}"
  ].join("\n");

  var STAR_FRAG = [
    "uniform vec3 uDeepCol;", "uniform vec3 uMidCol;", "uniform vec3 uHighCol;", "uniform vec3 uVeinCol;",
    "uniform float uArchetype;", "uniform float uTime;", "uniform float uSeed;", "uniform float uDim;",
    "uniform float uBoost;", "varying vec3 vNormalV;", "varying vec3 vObjPos;", "float sGyroid(vec3 p) {",
    "  return dot(sin(p), cos(p.yzx));", "}", "void main() {", "  vec3 N = normalize(vNormalV);",
    "  float mu = clamp(dot(N, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);", "  vec3 p0 = normalize(vObjPos);",
    "  float rot = uTime * 0.16 + uSeed;", "  float cr = cos(rot), sr = sin(rot);",
    "  vec3 p = vec3(p0.x * cr - p0.z * sr, p0.y, p0.x * sr + p0.z * cr);", "  float cell = 0.5;",
    "  float vein = 0.0;", "  float darkSpot = 0.0;", "  if (uArchetype < 0.5) {",
    "    float g = sGyroid(p * 5.8 + vec3(uTime * 0.35, -uTime * 0.28, uSeed));",
    "    cell = clamp(0.52 + g * 0.34, 0.0, 1.0);", "    vein = smoothstep(0.18, 0.01, abs(g));",
    "  } else if (uArchetype < 1.5) {",
    "    float band = sin(p.y * 15.0 + sGyroid(p * 8.5 + uTime * 0.65) * 1.4);", "    cell = 0.5 + 0.5 * band;",
    "    vein = pow(max(0.0, 1.0 - abs(p.y) * 1.8), 2.2) * (0.5 + 0.5 * sin(atan(p.z, p.x) * 6.0 - uTime * 1.8));",
    "  } else if (uArchetype < 2.5) {", "    float g1 = 1.0 - abs(sGyroid(p * 14.0 + uTime * 0.45)) * 0.58;",
    "    float sp = sGyroid(p * 4.6 + vec3(uSeed, 1.3, -0.9)) * 0.5 + 0.5;", "    cell = clamp(g1, 0.0, 1.0);",
    "    darkSpot = smoothstep(0.74, 0.90, sp);", "    vein = smoothstep(0.64, 0.75, sp) * (1.0 - darkSpot);",
    "  } else if (uArchetype < 3.5) {",
    "    float hex = abs(sin(p.x * 11.0 + uTime * 0.4) * cos(p.y * 11.0 - uTime * 0.35) * sin(p.z * 11.0 + uSeed));",
    "    cell = clamp(hex * 2.1, 0.0, 1.0);", "    vein = smoothstep(0.09, 0.005, hex);",
    "  } else if (uArchetype < 4.5) {",
    "    float twist = sin(p.y * 12.0 + atan(p.z, p.x) * 3.0 - uTime * 1.5 + sGyroid(p * 7.0));",
    "    cell = 0.5 + 0.5 * twist;", "    vein = smoothstep(0.76, 0.98, abs(twist));", "  } else {",
    "    float ring = sin(acos(clamp(p.y, -1.0, 1.0)) * 10.0 - uTime * 1.2 + sGyroid(p * 9.0) * 0.8);",
    "    cell = 0.5 + 0.5 * ring;", "    vein = smoothstep(0.68, 0.95, abs(p.y)) * 0.85;", "  }",
    "  float limb = pow(mu, 0.62);",
    "  vec3 surf = mix(uDeepCol, uMidCol, clamp(cell * 0.85 + limb * 0.32, 0.0, 1.0));",
    "  surf = mix(surf, uHighCol, smoothstep(0.48, 0.95, cell * limb));",
    "  surf = mix(surf, uDeepCol * 0.28, darkSpot * 0.85);",
    "  surf += uVeinCol * vein * (0.48 + uBoost * 0.35);",
    "  float chromo = pow(1.0 - mu, 2.7) * (0.58 + uBoost * 0.52);",
    "  float pulse = 1.0 + 0.055 * sin(uTime * 1.9 + uSeed * 2.7);",
    "  vec3 col = (surf * pulse + uVeinCol * chromo) * (0.98 + uBoost * 0.24);",
    "  gl_FragColor = vec4(col * uDim, 1.0);", "}"
  ].join("\n");

  /* 8. 小行星带、近景岩块与空间站刚体真空硬阴影着色器（受中心太阳 (0,0,0) 点光源硬阴影照射） */
  var ROCK_VERT = [
    "attribute vec3 aColor;", "varying vec3 vNormalV;", "varying vec3 vViewPos;", "varying vec3 vRockCol;",
    "void main() {", "  vRockCol = aColor;", "  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);",
    "  vViewPos = mvPos.xyz;", "  vNormalV = normalize(normalMatrix * normal);",
    "  gl_Position = projectionMatrix * mvPos;", "}"
  ].join("\n");

  var ROCK_FRAG = [
    "uniform vec3 uSunPosV;", "uniform float uDim;", "uniform float uSpec;", "varying vec3 vNormalV;",
    "varying vec3 vViewPos;", "varying vec3 vRockCol;", "void main() {", "  vec3 N = normalize(vNormalV);",
    "  vec3 L = normalize(uSunPosV - vViewPos);", "  float ndl = dot(N, L);",
    "  float hardLit = smoothstep(-0.03, 0.07, ndl);",
    "  float diff = 0.032 + 0.968 * hardLit * (0.28 + 0.72 * max(ndl, 0.0));",
    "  vec3 V = normalize(-vViewPos);",
    "  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0) * hardLit * uSpec;",
    "  vec3 sunTint = vec3(1.0, 0.96, 0.88);", "  vec3 col = vRockCol * diff * sunTint + sunTint * spec;",
    "  gl_FragColor = vec4(col * uDim, 1.0);", "}"
  ].join("\n");

  /* 9. 卡冈图雅级黑洞引力透镜与吸积盘着色器 */
  var BH_SHELL_VERT = [
    "varying vec2 vPlane;", "void main() {", "  vPlane = uv * 2.0 - 1.0;",
    "  vec4 mvCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);", "  mvCenter.xy += position.xy;",
    "  gl_Position = projectionMatrix * mvCenter;", "}"
  ].join("\n");

  var BH_SHELL_FRAG = [
    "uniform vec3 uInnerCol;", "uniform vec3 uOuterCol;", "uniform float uTime;", "uniform float uDim;",
    "uniform float uBoost;", "uniform float uRoll;", "varying vec2 vPlane;", "void main() {",
    "  float cr = cos(uRoll), sr = sin(uRoll);",
    "  vec2 p = vec2(vPlane.x * cr - vPlane.y * sr, vPlane.x * sr + vPlane.y * cr);", "  float r = length(p);",
    "  if (r > 1.0) discard;", "  float rs = 0.212;", "  float maskOut = smoothstep(rs * 0.96, rs * 1.03, r);",
    "  float ang = atan(p.y, p.x);", "  float doppler = 0.86 + 0.36 * (-p.x / max(r, 0.14));",
    "  float photonRing = exp(-pow((r - rs * 1.055) * 46.0, 2.0)) * 1.35;",
    "  float polar = pow(abs(p.y) / max(r, 0.001), 1.18);",
    "  float lensedArc = exp(-pow((r - (rs * 1.18 + 0.042 * polar)) * 19.5, 2.0)) * polar;",
    "  float subArc = exp(-pow((r - (rs * 1.34 + 0.055 * polar)) * 13.0, 2.0)) * polar * 0.42;",
    "  float swirl = 0.74 + 0.26 * sin(ang * 5.0 - uTime * 2.6 + r * 22.0);",
    "  float wing = exp(-abs(p.y) * 32.0) * pow(max(0.0, 1.0 - abs(p.x)), 1.95) * smoothstep(rs * 0.92, rs * 1.25, abs(p.x)) * 0.95;",
    "  float einstein = exp(-pow((r - 0.64) * 8.5, 2.0)) * 0.08;",
    "  float inten = (photonRing + (lensedArc + subArc) * swirl + wing + einstein) * maskOut * doppler * (1.0 + uBoost * 0.35);",
    "  vec3 hot = vec3(1.0, 0.98, 0.92);",
    "  vec3 col = mix(uOuterCol, uInnerCol, clamp(inten * 0.85, 0.0, 1.0));",
    "  col = mix(col, hot, clamp(photonRing * 0.85 + wing * 0.55, 0.0, 1.0));",
    "  float alpha = clamp(inten, 0.0, 1.0);", "  gl_FragColor = vec4(col * inten * uDim, alpha);", "}"
  ].join("\n");

  var ACCRETION_VERT = [
    "varying vec2 vLocalXY;", "void main() {", "  vLocalXY = position.xy;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);", "}"
  ].join("\n");

  var ACCRETION_FRAG = [
    "uniform float uInnerR;", "uniform float uOuterR;", "uniform float uTime;", "uniform float uDim;",
    "uniform float uBoost;", "uniform vec3 uInnerCol;", "uniform vec3 uOuterCol;", "varying vec2 vLocalXY;",
    "void main() {", "  float r = length(vLocalXY);",
    "  float t = clamp((r - uInnerR) / max(0.001, uOuterR - uInnerR), 0.0, 1.0);",
    "  float innerCut = smoothstep(0.0, 0.045, t);",
    "  float outerFade = pow(1.0 - t, 1.85) * smoothstep(1.0, 0.68, t);",
    "  float omega = 2.8 * pow(uInnerR / max(r, uInnerR), 1.5);",
    "  float rawAng = atan(vLocalXY.y, vLocalXY.x);", "  float ang = rawAng - uTime * omega;",
    "  float s1 = 0.5 + 0.5 * sin(ang * 3.0 + r * 0.15);",
    "  float s2 = 0.5 + 0.5 * sin(ang * 8.0 - r * 0.31 + uTime * 1.4);",
    "  float s3 = 0.5 + 0.5 * cos(ang * 15.0 + r * 0.58);",
    "  float rings = 0.72 + 0.28 * sin(t * 26.0 - uTime * 1.8);",
    "  float streak = (0.48 + 0.28 * s1 + 0.16 * s2 + 0.08 * s3) * rings;",
    "  float doppler = 0.80 + 0.34 * cos(rawAng + 0.65);", "  vec3 hot = vec3(1.0, 0.98, 0.93);",
    "  vec3 col = mix(hot, uInnerCol, smoothstep(0.0, 0.28, t));",
    "  col = mix(col, uOuterCol, smoothstep(0.24, 0.90, t));",
    "  float alpha = innerCut * outerFade * streak * doppler * (1.28 + uBoost * 0.45);",
    "  gl_FragColor = vec4(col * alpha * uDim, clamp(alpha, 0.0, 1.0));", "}"
  ].join("\n");

  /* 10. 星系旋臂 / 深空多光谱星场 GPU 粒子着色器 */
  var GALAXY_PTS_VERT = [
    "attribute vec3 aColor;",
    "attribute float aSize;",
    "attribute vec3 aOrbit;",
    "uniform float uTime;",
    "uniform float uSpin;",
    "uniform float uCoreR;",
    "uniform float uPixelRatio;",
    "uniform float uSizeScale;",
    "varying vec3 vColor;",
    "void main() {",
    "  vColor = aColor;",
    "  vec3 pos = position;",
    "  if (uCoreR > 0.0 && aOrbit.x > 0.001) {",
    "    float w = uSpin * pow(uCoreR / max(aOrbit.x, uCoreR), 0.62);",
    "    float ang = aOrbit.y + uTime * w;",
    "    pos = vec3(cos(ang) * aOrbit.x, aOrbit.z, sin(ang) * aOrbit.x);",
    "  }",
    "  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);",
    "  float dist = max(90.0, -mvPos.z);",
    "  float sc = uSizeScale > 0.0 ? uSizeScale : 980.0;",
    "  gl_PointSize = clamp(aSize * uPixelRatio * (sc / dist), 1.0, 18.0);",
    "  gl_Position = projectionMatrix * mvPos;",
    "}"
  ].join("\n");

  var GALAXY_PTS_FRAG = [
    "uniform float uOpacity;",
    "uniform float uDim;",
    "varying vec3 vColor;",
    "void main() {",
    "  vec2 p = gl_PointCoord - vec2(0.5);",
    "  float d = length(p) * 2.0;",
    "  if (d > 1.0) discard;",
    "  float halo = pow(1.0 - d, 2.4);",
    "  float pin = exp(-d * d * 10.5);",
    "  vec3 col = mix(vColor, vec3(1.0, 0.99, 0.97), pin * 0.72);",
    "  gl_FragColor = vec4(col * (1.05 + pin * 1.15) * uDim, clamp((halo * 0.82 + pin * 0.68) * uOpacity, 0.0, 1.0));",
    "}"
  ].join("\n");

  /* 11. 宏大旋臂银河星系专属锐利星团粒子与超高清丝缕着色器（JWST/哈勃级锐利度 + 3D/2D 同源双维切换） */
  var GRAND_GALAXY_STAR_VERT = [
    "attribute vec3 aColor;",
    "attribute float aSize;",
    "attribute vec3 aOrbit;",
    "uniform float uTime;",
    "uniform float uSpin;",
    "uniform float uCoreR;",
    "uniform float uPixelRatio;",
    "uniform float uSizeScale;",
    "varying vec3 vColor;",
    "varying float vBright;",
    "void main() {",
    "  vColor = aColor;",
    "  vBright = clamp((aSize - 1.1) / 3.2, 0.0, 1.0);",
    "  vec3 pos = position;",
    "  if (uCoreR > 0.0 && aOrbit.x > 0.001) {",
    "    float w = uSpin * pow(uCoreR / max(aOrbit.x, uCoreR), 0.62);",
    "    float ang = aOrbit.y + uTime * w;",
    "    pos = vec3(cos(ang) * aOrbit.x, aOrbit.z, sin(ang) * aOrbit.x);",
    "  }",
    "  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);",
    "  float dist = max(120.0, -mvPos.z);",
    "  gl_PointSize = clamp(aSize * uPixelRatio * (uSizeScale / dist), 1.15, 6.0);",
    "  gl_Position = projectionMatrix * mvPos;",
    "}"
  ].join("\n");

  var GRAND_GALAXY_STAR_FRAG = [
    "uniform float uOpacity;",
    "uniform float uDim;",
    "varying vec3 vColor;",
    "varying float vBright;",
    "void main() {",
    "  vec2 p = gl_PointCoord - vec2(0.5);",
    "  float d = length(p) * 2.0;",
    "  if (d > 1.0) discard;",
    "  float pin = exp(-d * d * 25.0);",
    "  float airy = pow(max(0.0, 1.0 - d), 4.2) * 0.36;",
    "  float spike = (exp(-abs(p.x) * 26.0) * exp(-abs(p.y) * 5.2) + exp(-abs(p.y) * 26.0) * exp(-abs(p.x) * 5.2)) * vBright * 0.42;",
    "  float inten = pin * 1.35 + airy + spike;",
    "  vec3 col = mix(vColor, vec3(1.0, 0.99, 0.97), clamp(pin * 0.85 + spike * 0.5, 0.0, 1.0));",
    "  gl_FragColor = vec4(col * (1.05 + pin * 0.95) * uDim, clamp(inten * uOpacity, 0.0, 1.0));",
    "}"
  ].join("\n");

  var COMPANION_GALAXY_FRAG = [
    "uniform vec3 uCoreCol;",
    "uniform vec3 uHaloCol;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "varying vec2 vDiskXZ;",
    "float cHash(vec2 p) {",
    "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);",
    "}",
    "void main() {",
    "  vec2 p = vec2(vDiskXZ.x * 0.76, vDiskXZ.y * 1.28);",
    "  float r = length(p);",
    "  if (r > 1.0) discard;",
    "  float core = exp(-r * r * 68.0) * 1.35;",
    "  float mid = exp(-pow(r * 4.6, 1.08)) * 0.82;",
    "  float ring = (0.86 + 0.14 * cos(r * 34.0)) * smoothstep(1.0, 0.25, r);",
    "  vec2 gCell = floor(vDiskXZ * 62.0);",
    "  vec2 gUv = fract(vDiskXZ * 62.0) - 0.5;",
    "  float star = smoothstep(0.90, 0.995, cHash(gCell)) * exp(-dot(gUv, gUv) * 28.0) * smoothstep(0.92, 0.12, r);",
    "  float lum = (core + mid * ring) + star * 0.75;",
    "  vec3 col = mix(uHaloCol, uCoreCol, clamp(core * 0.9 + star * 0.5, 0.0, 1.0));",
    "  float alpha = clamp(lum * 0.88, 0.0, 0.94) * smoothstep(1.0, 0.78, r);",
    "  gl_FragColor = vec4(col * lum * uDim, alpha * uNearFade);",
    "}"
  ].join("\n");

  var GRAND_GALAXY_VERT = [
    "uniform float uRadius;",
    "uniform float uFlat2D;",
    "uniform float uWarpAmp;",
    "varying vec2 vDiskXZ;",
    "varying float vEdgeFade;",
    "void main() {",
    "  vec3 pos = position;",
    "  vec2 xz = vec2(pos.x, -pos.y) / max(1.0, uRadius);",
    "  float r = length(xz);",
    "  if (uFlat2D < 0.5 && uWarpAmp > 0.0001) {",
    "    float ang = atan(xz.y, xz.x);",
    "    float warp = sin(ang - 0.55) * pow(clamp(r, 0.0, 1.0), 2.15) * uRadius * uWarpAmp;",
    "    pos.z += warp;",
    "  }",
    "  vDiskXZ = xz;",
    "  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);",
    "  vec3 nV = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));",
    "  vec3 vDir = normalize(-mvPos.xyz);",
    "  float ndv = abs(dot(nV, vDir));",
    "  vEdgeFade = mix(mix(0.24, 1.0, smoothstep(0.02, 0.34, ndv)), 1.0, uFlat2D);",
    "  gl_Position = projectionMatrix * mvPos;",
    "}"
  ].join("\n");

  var GRAND_GALAXY_FRAG = [
    "uniform float uTime;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "uniform float uFlat2D;",
    "uniform float uLayerAlpha;",
    "uniform float uLayerSoft;",
    "varying vec2 vDiskXZ;",
    "varying float vEdgeFade;",
    "float gHash(vec2 p) {",
    "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);",
    "}",
    "vec2 gHash2(vec2 p) {",
    "  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);",
    "}",
    "float gNoise(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x),",
    "             mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);",
    "}",
    "float gFbm6(vec2 p) {",
    "  float s = 0.0;",
    "  float a = 0.5;",
    "  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);",
    "  for (int k = 0; k < 6; k++) {",
    "    s += a * gNoise(p);",
    "    p = rot * p * 2.07 + vec2(3.7, -2.1);",
    "    a *= 0.5;",
    "  }",
    "  return s;",
    "}",
    "float gRidged5(vec2 p) {",
    "  float s = 0.0;",
    "  float a = 0.52;",
    "  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);",
    "  for (int k = 0; k < 5; k++) {",
    "    float n = 1.0 - abs(gNoise(p) * 2.0 - 1.0);",
    "    s += a * n * n * n;",
    "    p = rot * p * 2.19 + vec2(-1.9, 4.3);",
    "    a *= 0.5;",
    "  }",
    "  return s;",
    "}",
    "float gStarLayer(vec2 uv, float thresh) {",
    "  vec2 id = floor(uv);",
    "  vec2 f = fract(uv) - 0.5;",
    "  vec2 rnd = gHash2(id);",
    "  vec2 off = (rnd - 0.5) * 0.66;",
    "  float d2 = dot(f - off, f - off);",
    "  float mag = smoothstep(thresh, 0.999, rnd.x);",
    "  return mag * exp(-d2 * 44.0);",
    "}",
    "void main() {",
    "  vec2 p = vDiskXZ;",
    "  float r = length(p);",
    "  if (r > 1.0) discard;",
    "  float ang = atan(p.y, p.x);",
    "  float flowT = uTime * 0.018;",
    "  float nLow = gFbm6(p * 5.0 + vec2(flowT, -flowT * 0.7));",
    "  float nMid = gFbm6(p * 15.8 - vec2(flowT * 1.2, flowT * 0.8));",
    "  float nFine = gRidged5(p * 44.0 + vec2(nMid * 1.55, -nLow * 1.35));",
    "  float nMicro = gRidged5(p * 108.0 + vec2(nFine * 1.30, nMid * 1.15));",
    "  float logR = log(r + 0.058);",
    "  float phTight2 = ang * 2.0 - logR * 8.40 + (nLow - 0.5) * 1.18 + (nMid - 0.5) * 0.42;",
    "  float phSpur4 = ang * 4.0 - logR * 15.40 + (nMid - 0.5) * 1.52 + (nFine - 0.5) * 0.55;",
    "  float phFeather = ang * 8.0 - logR * 29.0 + nFine * 2.1;",
    "  float phRing = logR * 21.0 + ang * 2.0 + (nLow - 0.5) * 1.85;",
    "  float armMain = pow(0.5 + 0.5 * cos(phTight2), 2.15);",
    "  float armSpur = pow(0.5 + 0.5 * cos(phSpur4), 2.75);",
    "  float armFeather = pow(0.5 + 0.5 * cos(phFeather), 3.4);",
    "  float ringMod = 0.5 + 0.5 * cos(phRing);",
    "  /* 特征 1：自然融入环境的棒状核球 / 暖金老年恒星核区 */",
    "  float barAng = 0.38;",
    "  float cb = cos(barAng), sb = sin(barAng);",
    "  vec2 bP = vec2(p.x * cb + p.y * sb, -p.x * sb + p.y * cb);",
    "  float barEllip = length(vec2(bP.x * 0.50, bP.y * 1.48));",
    "  float peanut = 1.0 + 0.14 * exp(-pow((abs(bP.x) - 0.075) * 22.0, 2.0));",
    "  float stellarBar = exp(-pow(barEllip * 7.4, 1.12)) * 0.84 * peanut * (0.86 + 0.28 * nMid);",
    "  float bulgeCompact = exp(-pow(r * 7.8, 1.06)) * 0.80 * (0.88 + 0.24 * nFine);",
    "  float bulge = stellarBar + bulgeCompact;",
    "  /* 特征 2：更宏大且自然维和的中心超大质量黑洞（深邃视界暗影 + 柔和暖金引力透镜光晕 + 渐融吸积流） */",
    "  float isMainSlice = step(uLayerSoft, 0.05);",
    "  float bhRadius = mix(0.0255, 0.0315, uFlat2D);",
    "  float bhVoid = smoothstep(bhRadius * 0.86, bhRadius * 1.24, r);",
    "  float photonRing = exp(-pow((r - bhRadius * 1.16) / (bhRadius * 0.34), 2.0)) * 1.45;",
    "  float accSwirl = ang * 3.0 - log(r + 0.012) * 12.5 - uTime * 1.25 + nFine * 2.4;",
    "  float accShear = 0.64 + 0.36 * cos(accSwirl) * (0.72 + 0.28 * sin(ang * 5.0 + uTime * 1.7));",
    "  float doppler = 0.80 + 0.28 * cos(ang - 0.85);",
    "  float accBand = smoothstep(bhRadius * 1.02, bhRadius * 1.75, r) * exp(-max(0.0, r - bhRadius * 1.45) * 22.0);",
    "  float accEmit = accBand * accShear * doppler * 1.55;",
    "  vec3 accCol = mix(vec3(1.0, 0.94, 0.80), vec3(0.98, 0.62, 0.24), smoothstep(bhRadius * 1.25, bhRadius * 3.2, r));",
    "  accCol = mix(accCol, vec3(0.76, 0.32, 0.14), smoothstep(bhRadius * 2.8, bhRadius * 5.2, r));",
    "  /* 特征 3：致密核星团（自然无边界渐变融入核球） */",
    "  float nucStarsA = gStarLayer(p * 300.0 + vec2(uTime * 0.05, -uTime * 0.035), 0.72);",
    "  float nucStarsB = gStarLayer(p * 510.0 + vec2(-uTime * 0.09, uTime * 0.065), 0.76);",
    "  float nucClusterMask = smoothstep(bhRadius * 1.18, bhRadius * 2.1, r) * exp(-r * 11.5);",
    "  float nucClusterEmit = (nucStarsA * 1.30 + nucStarsB * 1.05) * nucClusterMask;",
    "  /* 特征 4：柔和有机的核周星暴星云团（去除生硬几何圆环感） */",
    "  float sbRingR = length(vec2(bP.x * 0.84, bP.y * 1.16));",
    "  float sbRingBand = exp(-pow((sbRingR - 0.115) / 0.044, 2.0));",
    "  float sbKnots = sbRingBand * smoothstep(0.46, 0.88, nFine * 0.55 + nMicro * 0.55) * (0.55 + 0.55 * pow(0.5 + 0.5 * cos(ang * 3.0 + nMid * 3.4), 1.6));",
    "  float sbBlueKnots = sbRingBand * smoothstep(0.58, 0.92, nMicro * 0.62 + nMid * 0.45);",
    "  /* 特征 5（2D 顶视柔美雾状极向晕，彻底去除刺眼光柱感） */",
    "  float jetAxisAng = barAng + 1.5708;",
    "  float cj = cos(jetAxisAng), sj = sin(jetAxisAng);",
    "  vec2 jP = vec2(p.x * cj + p.y * sj, -p.x * sj + p.y * cj);",
    "  float jDist = abs(jP.x);",
    "  float jWidth = 0.012 + jDist * 0.19;",
    "  float jBeam = exp(-pow(jP.y / jWidth, 2.0)) * smoothstep(bhRadius * 1.1, bhRadius * 2.4, jDist) * exp(-jDist * 9.5);",
    "  float jWisps = 0.65 + 0.35 * nMid;",
    "  float jet2DEmit = jBeam * jWisps * uFlat2D * 0.26;",
    "  /* 银河主旋臂盘 */",
    "  float baseDisk = exp(-r * 2.55) * smoothstep(1.0, 0.66, r) * 0.48;",
    "  float armDisk = smoothstep(0.045, 0.15, r) * exp(-r * 1.80) * smoothstep(1.0, 0.72, r);",
    "  float outerBlueHalo = smoothstep(0.16, 0.42, r) * exp(-max(0.0, r - 0.34) * 2.42) * smoothstep(1.0, 0.78, r);",
    "  float filDetail = 0.46 + nMid * 0.42 + nFine * 0.48 + nMicro * 0.34;",
    "  float armStruct = 0.18 + armMain * 0.76 + armSpur * 0.48 + armFeather * 0.24 + ringMod * 0.16;",
    "  float starCloud = baseDisk * (0.62 + 0.38 * nMid) + armDisk * armStruct * filDetail;",
    "  float subStars1 = gStarLayer(p * 195.0, 0.84);",
    "  float subStars2 = gStarLayer(p * 365.0 + vec2(17.3, -9.1), 0.87);",
    "  float resolvedGranules = (subStars1 * 1.25 + subStars2 * 0.95) * smoothstep(0.96, 0.05, r) * (0.28 + armMain * 0.92 + armSpur * 0.52 + bulgeCompact * 0.65);",
    "  vec3 colCore = vec3(1.00, 0.96, 0.86);",
    "  vec3 colGoldOld = vec3(0.99, 0.78, 0.50);",
    "  vec3 colRose = vec3(0.84, 0.56, 0.64);",
    "  vec3 colSapphire = vec3(0.32, 0.62, 1.00);",
    "  vec3 colCyanShock = vec3(0.28, 0.86, 0.98);",
    "  vec3 colPeriwinkle = vec3(0.52, 0.54, 0.98);",
    "  vec3 colHii = vec3(0.96, 0.38, 0.66);",
    "  vec3 colJet = mix(vec3(0.96, 0.78, 0.56), vec3(0.52, 0.56, 0.96), smoothstep(0.04, 0.20, jDist));",
    "  vec3 bulgeRGB = mix(colRose, colGoldOld, smoothstep(0.26, 0.07, r));",
    "  bulgeRGB = mix(bulgeRGB, colCore, smoothstep(0.085, 0.032, r));",
    "  vec3 diskRGB = mix(colGoldOld, colRose, smoothstep(0.08, 0.26, r));",
    "  diskRGB = mix(diskRGB, colSapphire, smoothstep(0.20, 0.52, r));",
    "  diskRGB = mix(diskRGB, colPeriwinkle, smoothstep(0.48, 0.88, r) * (0.45 + 0.55 * nLow));",
    "  float hiiKnots = outerBlueHalo * pow(armMain, 2.2) * smoothstep(0.58, 0.88, nFine * 0.65 + nMicro * 0.45);",
    "  float oiiiFront = armDisk * pow(0.5 + 0.5 * cos(phTight2 - 0.42), 4.2) * smoothstep(0.62, 0.92, nFine * 0.55 + nMicro * 0.55);",
    "  vec3 granCol = mix(colCore, colCyanShock, smoothstep(0.18, 0.55, r));",
    "  vec3 nucStarCol = mix(vec3(0.84, 0.93, 1.0), vec3(1.0, 0.89, 0.68), gHash(floor(p * 300.0)));",
    "  vec3 rawEmit = bulgeRGB * bulge * (1.0 - uLayerSoft * 0.35)",
    "    + diskRGB * starCloud * 1.18",
    "    + colSapphire * outerBlueHalo * 0.28",
    "    + colHii * (hiiKnots * 0.62 + sbKnots * 0.92)",
    "    + colCyanShock * (oiiiFront * 0.34 + sbBlueKnots * 0.72)",
    "    + granCol * resolvedGranules * 0.88",
    "    + nucStarCol * nucClusterEmit * 1.20 * isMainSlice",
    "    + (accCol * accEmit + vec3(1.0, 0.90, 0.70) * photonRing + colJet * jet2DEmit) * isMainSlice;",
    "  vec3 emit = (rawEmit / (vec3(1.0) + rawEmit * 0.48)) * 1.30;",
    "  /* 自然的棒状尘埃暗带与旋臂分子尘埃丝缕吸收 */",
    "  float barDust = exp(-pow(abs(bP.y - 0.015 * sign(bP.x)) / 0.018, 2.0)) * smoothstep(0.045, 0.085, abs(bP.x)) * smoothstep(0.24, 0.10, abs(bP.x)) * (0.48 + 0.52 * nFine);",
    "  float nucSpiral = pow(0.5 + 0.5 * cos(ang * 2.0 - log(r + 0.022) * 6.8 + nFine * 1.9), 3.4) * smoothstep(0.042, 0.072, r) * smoothstep(0.18, 0.075, r);",
    "  float dustLane1 = pow(0.5 + 0.5 * cos(phTight2 + 1.06 + (nFine - 0.5) * 0.52), 4.2);",
    "  float dustSpur = pow(0.5 + 0.5 * cos(phSpur4 + 0.92 + (nMicro - 0.5) * 0.68), 3.8);",
    "  float dustLane2 = pow(1.0 - ringMod, 3.4);",
    "  float nearBias3D = 0.56 + 0.64 * smoothstep(-0.22, 0.32, p.y);",
    "  float nearBias = mix(nearBias3D, 0.92, uFlat2D);",
    "  float dustZone = smoothstep(0.055, 0.125, r) * smoothstep(0.74, 0.18, r);",
    "  float filCut = 0.36 + nFine * 0.56 + nMicro * 0.52;",
    "  float dustRaw = (nucSpiral * 0.74 + barDust * 0.78) * filCut + dustZone * nearBias * (dustLane1 * 0.62 + dustSpur * 0.38 + dustLane2 * 0.36) * filCut;",
    "  float dustMask = clamp(smoothstep(0.18, 0.62, dustRaw), 0.0, 0.90) * smoothstep(bhRadius * 1.45, bhRadius * 2.5, r);",
    "  vec3 siennaRim = vec3(0.68, 0.25, 0.085) * (0.52 + 0.92 * exp(-r * 4.0));",
    "  vec3 darkRift = vec3(0.024, 0.009, 0.014);",
    "  vec3 dustCol = mix(siennaRim, darkRift, smoothstep(0.18, 0.74, dustMask));",
    "  vec3 finalCol = mix(emit, dustCol, dustMask * 0.86);",
    "  /* 中心超大质量黑洞暗影刻画（与暖金核球自然融合，零生硬白圈） */",
    "  if (isMainSlice > 0.5) {",
    "    vec3 voidCol = vec3(0.006, 0.004, 0.012);",
    "    finalCol = mix(voidCol, finalCol, bhVoid);",
    "    finalCol += vec3(1.0, 0.86, 0.58) * photonRing * 0.42;",
    "  }",
    "  float lumInt = max(emit.r, max(emit.g, emit.b));",
    "  float lumAlpha = clamp(lumInt * 0.92, 0.0, 0.96);",
    "  float outAlpha = clamp(max(lumAlpha, dustMask * 0.82 * smoothstep(0.74, 0.12, r)), 0.0, 0.96) * smoothstep(1.0, 0.82, r);",
    "  if (isMainSlice > 0.5) outAlpha = max(outAlpha, (1.0 - bhVoid) * 0.96);",
    "  gl_FragColor = vec4(finalCol * uDim, outAlpha * uNearFade * uLayerAlpha * vEdgeFade);",
    "}"
  ].join("\n");

  /* 11b. 3D 专属星系中心柔和体积着色器（暖金核球、宏大黑洞视界、视向引力透镜光晕、柔和吸积盘、轻盈等离子体雾） */
  var GALAXY_BULGE_VERT = [
    "varying vec3 vObjPos;",
    "varying vec3 vNormalV;",
    "varying vec3 vViewPos;",
    "void main() {",
    "  vObjPos = position;",
    "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
    "  vViewPos = mv.xyz;",
    "  vNormalV = normalize(normalMatrix * normal);",
    "  gl_Position = projectionMatrix * mv;",
    "}"
  ].join("\n");

  var GALAXY_BULGE_FRAG = [
    "uniform float uTime;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "varying vec3 vObjPos;",
    "varying vec3 vNormalV;",
    "varying vec3 vViewPos;",
    "float bHash(vec3 p) {",
    "  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);",
    "}",
    "float bNoise(vec3 p) {",
    "  vec3 i = floor(p); vec3 f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(",
    "    mix(mix(bHash(i), bHash(i + vec3(1.0,0.0,0.0)), u.x), mix(bHash(i + vec3(0.0,1.0,0.0)), bHash(i + vec3(1.0,1.0,0.0)), u.x), u.y),",
    "    mix(mix(bHash(i + vec3(0.0,0.0,1.0)), bHash(i + vec3(1.0,0.0,1.0)), u.x), mix(bHash(i + vec3(0.0,1.0,1.0)), bHash(i + vec3(1.0,1.0,1.0)), u.x), u.y),",
    "    u.z);",
    "}",
    "void main() {",
    "  vec3 vDir = normalize(-vViewPos);",
    "  float ndv = abs(dot(normalize(vNormalV), vDir));",
    "  float limb = pow(clamp(ndv, 0.0, 1.0), 2.15);",
    "  float n1 = bNoise(vObjPos * 4.8 + vec3(uTime * 0.018, 0.0, -uTime * 0.014));",
    "  float n2 = bNoise(vObjPos * 11.2 - vec3(0.0, uTime * 0.022, 0.0));",
    "  float eqDust = exp(-pow(vObjPos.y * 5.2, 2.0)) * smoothstep(0.44, 0.86, n2);",
    "  vec3 oldGold = vec3(0.98, 0.76, 0.46);",
    "  vec3 warmCore = vec3(1.00, 0.94, 0.80);",
    "  vec3 outerRose = vec3(0.84, 0.54, 0.44);",
    "  vec3 col = mix(outerRose, oldGold, limb);",
    "  col = mix(col, warmCore, pow(limb, 2.2) * (0.72 + 0.28 * n1));",
    "  col = mix(col, vec3(0.36, 0.14, 0.06), eqDust * 0.36);",
    "  float alpha = pow(limb, 1.85) * (0.28 + 0.14 * n1) * uNearFade;",
    "  gl_FragColor = vec4(col * uDim, clamp(alpha, 0.0, 0.44));",
    "}"
  ].join("\n");

  var SMBH_HORIZON_FRAG = [
    "uniform float uTime;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "varying vec3 vObjPos;",
    "varying vec3 vNormalV;",
    "varying vec3 vViewPos;",
    "void main() {",
    "  vec3 vDir = normalize(-vViewPos);",
    "  float ndv = clamp(dot(normalize(vNormalV), vDir), 0.0, 1.0);",
    "  float photonRim = pow(1.0 - ndv, 5.4);",
    "  float innerHalo = exp(-pow((ndv - 0.14) / 0.085, 2.0)) * 0.95;",
    "  float asym = 0.84 + 0.16 * sin(atan(vObjPos.z, vObjPos.x) * 2.0 - uTime * 0.85);",
    "  vec3 voidCol = vec3(0.005, 0.003, 0.010);",
    "  vec3 rimCol = mix(vec3(0.96, 0.52, 0.18), vec3(1.00, 0.91, 0.72), clamp(photonRim * 1.15, 0.0, 1.0));",
    "  vec3 col = mix(voidCol, rimCol * 1.28 * asym, clamp(photonRim * 1.05 + innerHalo * 0.72, 0.0, 1.0));",
    "  gl_FragColor = vec4(col * uDim, 0.99 * uNearFade);",
    "}"
  ].join("\n");

  var SMBH_LENS_VERT = [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}"
  ].join("\n");

  var SMBH_LENS_FRAG = [
    "uniform float uTime;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "varying vec2 vUv;",
    "float lHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float lNoise(vec2 p) {",
    "  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(lHash(i), lHash(i + vec2(1.0,0.0)), u.x), mix(lHash(i + vec2(0.0,1.0)), lHash(i + vec2(1.0,1.0)), u.x), u.y);",
    "}",
    "void main() {",
    "  vec2 p = (vUv - 0.5) * 2.0;",
    "  float r = length(p);",
    "  if (r > 1.0) discard;",
    "  float ang = atan(p.y, p.x);",
    "  /* 柔和的 Gargantua 引力透镜光晕与上下弯曲吸积弧（零生硬硬圈） */",
    "  float n1 = lNoise(vec2(ang * 3.0 - uTime * 0.35, r * 6.0));",
    "  float n2 = lNoise(vec2(ang * 6.0 + uTime * 0.25, r * 11.0));",
    "  float wisp = 0.72 + 0.28 * (n1 * 0.65 + n2 * 0.35);",
    "  /* 紧贴视界的柔和光子弯折弧（r ≈ 0.31 处对应黑洞视界边缘） */",
    "  float bhEdge = 0.305;",
    "  float einstein = exp(-pow((r - bhEdge * 1.14) / 0.088, 2.0)) * (0.78 + 0.28 * abs(sin(ang)));",
    "  float warmBloom = exp(-max(0.0, r - bhEdge) * 4.4) * smoothstep(bhEdge * 0.85, bhEdge * 1.12, r);",
    "  float outerFade = pow(max(0.0, 1.0 - r), 2.1);",
    "  float doppler = 0.82 + 0.26 * cos(ang - 0.45);",
    "  vec3 cHot = vec3(1.00, 0.92, 0.74);",
    "  vec3 cGold = vec3(0.98, 0.64, 0.26);",
    "  vec3 cWarm = vec3(0.76, 0.38, 0.22);",
    "  vec3 col = mix(cHot, cGold, smoothstep(bhEdge, bhEdge * 1.9, r));",
    "  col = mix(col, cWarm, smoothstep(bhEdge * 1.8, 0.92, r));",
    "  float lum = (einstein * 0.92 + warmBloom * 0.72) * wisp * doppler * outerFade;",
    "  gl_FragColor = vec4(col * lum * uDim, clamp(lum * 0.85, 0.0, 0.88) * uNearFade);",
    "}"
  ].join("\n");

  var ACCRETION_DISK_FRAG = [
    "uniform float uTime;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "varying vec2 vDiskXZ;",
    "float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float aNoise(vec2 p) {",
    "  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(aHash(i), aHash(i + vec2(1.0,0.0)), u.x), mix(aHash(i + vec2(0.0,1.0)), aHash(i + vec2(1.0,1.0)), u.x), u.y);",
    "}",
    "void main() {",
    "  float r = length(vDiskXZ);",
    "  if (r < 0.20 || r > 1.0) discard;",
    "  float ang = atan(vDiskXZ.y, vDiskXZ.x);",
    "  float swirl1 = ang * 3.0 - log(r + 0.09) * 9.5 - uTime * 1.35;",
    "  float swirl2 = ang * 5.0 - log(r + 0.06) * 14.0 - uTime * 2.10;",
    "  float n1 = aNoise(vec2(r * 12.0, ang * 3.0 - uTime * 0.7));",
    "  float n2 = aNoise(vec2(r * 24.0 - uTime * 0.45, ang * 5.0));",
    "  float streaks = 0.58 + 0.26 * cos(swirl1 + n1 * 2.4) + 0.16 * cos(swirl2 + n2 * 2.0);",
    "  float doppler = 0.78 + 0.32 * cos(ang - 0.65);",
    "  float innerHot = exp(-pow((r - 0.25) / 0.085, 2.0)) * 1.35;",
    "  float radial = smoothstep(0.20, 0.30, r) * pow(max(0.0, 1.0 - r), 2.35);",
    "  vec3 cHot = vec3(1.00, 0.94, 0.80);",
    "  vec3 cGold = vec3(0.98, 0.66, 0.28);",
    "  vec3 cAmber = vec3(0.78, 0.32, 0.12);",
    "  vec3 col = mix(cHot, cGold, smoothstep(0.22, 0.50, r));",
    "  col = mix(col, cAmber, smoothstep(0.46, 0.90, r));",
    "  float lum = (radial * streaks * 1.45 + innerHot * pow(max(0.0, 1.0 - r), 1.4)) * doppler;",
    "  gl_FragColor = vec4(col * lum * uDim, clamp(lum * 0.72, 0.0, 0.82) * uNearFade);",
    "}"
  ].join("\n");

  var AGN_JET_VERT = [
    "varying vec2 vUv;",
    "varying vec3 vNormalV;",
    "varying vec3 vViewPos;",
    "void main() {",
    "  vUv = uv;",
    "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
    "  vViewPos = mv.xyz;",
    "  vNormalV = normalize(normalMatrix * normal);",
    "  gl_Position = projectionMatrix * mv;",
    "}"
  ].join("\n");

  var AGN_JET_FRAG = [
    "uniform float uTime;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "uniform float uDir;",
    "varying vec2 vUv;",
    "varying vec3 vNormalV;",
    "varying vec3 vViewPos;",
    "void main() {",
    "  vec3 vDir = normalize(-vViewPos);",
    "  float ndv = abs(dot(normalize(vNormalV), vDir));",
    "  float h = uDir > 0.0 ? vUv.y : (1.0 - vUv.y);",
    "  /* 轻柔半透明星际等离子体羽雾（彻底告别刺眼白激光柱，自然消融于星海） */",
    "  float coreSoft = pow(clamp(ndv, 0.0, 1.0), 2.35);",
    "  float mist = pow(clamp(ndv, 0.0, 1.0), 1.15) * 0.35;",
    "  float wave1 = 0.72 + 0.28 * cos(h * 14.0 - uTime * 1.45 + vUv.x * 6.283);",
    "  float wave2 = 0.78 + 0.22 * sin(h * 28.0 - uTime * 2.2 - vUv.x * 12.566);",
    "  float env = smoothstep(0.0, 0.22, h) * pow(max(0.0, 1.0 - h), 2.15);",
    "  vec3 colBase = vec3(0.95, 0.76, 0.56);",
    "  vec3 colMid = vec3(0.62, 0.68, 0.98);",
    "  vec3 colTip = vec3(0.42, 0.44, 0.86);",
    "  vec3 col = mix(colBase, colMid, smoothstep(0.05, 0.42, h));",
    "  col = mix(col, colTip, smoothstep(0.40, 0.92, h));",
    "  float inten = env * (coreSoft * 0.42 + mist * 0.32) * wave1 * wave2;",
    "  gl_FragColor = vec4(col * inten * 0.92 * uDim, clamp(inten * 0.48, 0.0, 0.30) * uNearFade);",
    "}"
  ].join("\n");

  /* 11c. 3D 体积星云 / 宇宙尘埃云团着色器（为星系提供真实立体厚度，侧视呈丰盈云海而非纸片） */
  var GALAXY_NEBULA_VERT = [
    "attribute vec3 aColor;",
    "attribute float aSize;",
    "attribute float aSeed;",
    "attribute vec3 aOrbit;",
    "uniform float uTime;",
    "uniform float uSpin;",
    "uniform float uCoreR;",
    "uniform float uPixelRatio;",
    "uniform float uSizeScale;",
    "varying vec3 vColor;",
    "varying float vSeed;",
    "void main() {",
    "  vColor = aColor;",
    "  vSeed = aSeed;",
    "  vec3 pos = position;",
    "  if (uCoreR > 0.0 && aOrbit.x > 0.001) {",
    "    float w = uSpin * pow(uCoreR / max(aOrbit.x, uCoreR), 0.62);",
    "    float ang = aOrbit.y + uTime * w;",
    "    pos = vec3(cos(ang) * aOrbit.x, aOrbit.z, sin(ang) * aOrbit.x);",
    "  }",
    "  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);",
    "  float dist = max(320.0, -mvPos.z);",
    "  gl_PointSize = clamp(aSize * uPixelRatio * (uSizeScale / dist), 3.0, 148.0);",
    "  gl_Position = projectionMatrix * mvPos;",
    "}"
  ].join("\n");

  var GALAXY_NEBULA_FRAG = [
    "uniform float uOpacity;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "varying vec3 vColor;",
    "varying float vSeed;",
    "float nHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float nVal(vec2 p) {",
    "  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(nHash(i), nHash(i + vec2(1.0,0.0)), u.x), mix(nHash(i + vec2(0.0,1.0)), nHash(i + vec2(1.0,1.0)), u.x), u.y);",
    "}",
    "void main() {",
    "  vec2 p = gl_PointCoord - vec2(0.5);",
    "  float d = length(p) * 2.0;",
    "  if (d > 1.0) discard;",
    "  float ca = cos(vSeed * 6.2831), sa = sin(vSeed * 6.2831);",
    "  vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);",
    "  float f1 = nVal(rp * 3.8 + vec2(vSeed * 17.3, vSeed * 9.1));",
    "  float f2 = nVal(rp * 7.6 - vec2(vSeed * 11.7, vSeed * 23.4));",
    "  float cloud = 0.45 + 0.55 * (f1 * 0.65 + f2 * 0.35);",
    "  float softFall = exp(-d * d * 3.6) * smoothstep(1.0, 0.18, d);",
    "  float alpha = softFall * cloud * uOpacity * uNearFade;",
    "  gl_FragColor = vec4(vColor * (0.92 + 0.25 * f1) * uDim, clamp(alpha, 0.0, 0.65));",
    "}"
  ].join("\n");

  /* 11d. 3D 陨石群 / 小行星碎石带粒子着色器（不规则多棱碎岩微粒与冰晶反光，绝非圆润星球） */
  var GALAXY_METEOR_VERT = [
    "attribute vec3 aColor;",
    "attribute float aSize;",
    "attribute float aSeed;",
    "attribute vec3 aOrbit;",
    "uniform float uTime;",
    "uniform float uSpin;",
    "uniform float uCoreR;",
    "uniform float uPixelRatio;",
    "uniform float uSizeScale;",
    "varying vec3 vColor;",
    "varying float vSeed;",
    "varying float vGlint;",
    "void main() {",
    "  vColor = aColor;",
    "  vSeed = aSeed;",
    "  vGlint = 0.68 + 0.32 * sin(uTime * (0.8 + aSeed * 1.8) + aSeed * 37.0);",
    "  vec3 pos = position;",
    "  if (uCoreR > 0.0 && aOrbit.x > 0.001) {",
    "    float w = uSpin * pow(uCoreR / max(aOrbit.x, uCoreR), 0.62);",
    "    float ang = aOrbit.y + uTime * w;",
    "    pos = vec3(cos(ang) * aOrbit.x, aOrbit.z, sin(ang) * aOrbit.x);",
    "  }",
    "  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);",
    "  float dist = max(140.0, -mvPos.z);",
    "  gl_PointSize = clamp(aSize * uPixelRatio * (uSizeScale / dist), 1.3, 5.4);",
    "  gl_Position = projectionMatrix * mvPos;",
    "}"
  ].join("\n");

  var GALAXY_METEOR_FRAG = [
    "uniform float uOpacity;",
    "uniform float uDim;",
    "uniform float uNearFade;",
    "varying vec3 vColor;",
    "varying float vSeed;",
    "varying float vGlint;",
    "void main() {",
    "  vec2 p = gl_PointCoord - vec2(0.5);",
    "  float ang = atan(p.y, p.x) + vSeed * 6.2831;",
    "  /* 不规则多边形陨石/碎岩轮廓（带棱角与长短轴） */",
    "  float aspect = 1.0 + 0.28 * cos(ang * 2.0 + vSeed * 5.0);",
    "  float jag = 0.78 + 0.16 * cos(ang * 3.0 + vSeed * 11.0) + 0.10 * sin(ang * 5.0 - vSeed * 7.0);",
    "  float d = length(p) * 2.0 / (jag * aspect);",
    "  if (d > 1.0) discard;",
    "  float facet = 0.62 + 0.38 * smoothstep(-0.4, 0.45, p.x * cos(vSeed * 6.28) + p.y * sin(vSeed * 6.28));",
    "  float edgeSoft = smoothstep(1.0, 0.42, d);",
    "  vec3 col = vColor * facet * vGlint;",
    "  gl_FragColor = vec4(col * uDim, edgeSoft * uOpacity * uNearFade);",
    "}"
  ].join("\n");

  /* 12. 爱因斯坦-罗森虫洞球面引力透镜咽喉与时空曲率漏斗着色器 */
  var WORMHOLE_THROAT_VERT = [
    "varying vec3 vNormalV;",
    "varying vec3 vViewPos;",
    "varying vec3 vObjPos;",
    "void main() {",
    "  vObjPos = normalize(position);",
    "  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);",
    "  vViewPos = mvPos.xyz;",
    "  vNormalV = normalize(normalMatrix * normal);",
    "  gl_Position = projectionMatrix * mvPos;",
    "}"
  ].join("\n");

  var WORMHOLE_THROAT_FRAG = [
    "uniform float uTime;",
    "uniform float uDim;",
    "uniform float uBoost;",
    "varying vec3 vNormalV;",
    "varying vec3 vViewPos;",
    "varying vec3 vObjPos;",
    "float whGyroid(vec3 p) {",
    "  return dot(sin(p), cos(p.yzx));",
    "}",
    "void main() {",
    "  vec3 N = normalize(vNormalV);",
    "  vec3 V = normalize(-vViewPos);",
    "  float mu = clamp(dot(N, V), 0.0, 1.0);",
    "  float bend = 1.0 / (0.20 + mu * 1.35);",
    "  float swirlAng = uTime * 0.28 + bend * 1.15;",
    "  float cs = cos(swirlAng), sn = sin(swirlAng);",
    "  vec3 q = normalize(vObjPos);",
    "  vec3 dir = normalize(vec3(q.x * cs - q.z * sn, q.y * (0.72 + bend * 0.28), q.x * sn + q.z * cs));",
    "  float w1 = 0.5 + 0.5 * (whGyroid(dir * 3.4 + vec3(uTime * 0.14, -uTime * 0.11, 1.3)) / 1.732);",
    "  float w2 = 0.5 + 0.5 * (whGyroid(dir * 7.8 - vec3(uTime * 0.22, 0.9, uTime * 0.18)) / 1.732);",
    "  float lensedBand = exp(-pow((dir.y + (w1 - 0.5) * 0.45) * 3.4, 2.0));",
    "  float starPin = pow(clamp(0.5 + 0.5 * (whGyroid(dir * 34.0) / 1.732), 0.0, 1.0), 22.0);",
    "  vec3 abyss = vec3(0.008, 0.016, 0.048);",
    "  vec3 cyanNeb = vec3(0.08, 0.54, 0.86);",
    "  vec3 indigoNeb = vec3(0.36, 0.28, 0.84);",
    "  vec3 warmCore = vec3(0.92, 0.78, 0.64);",
    "  vec3 interior = mix(abyss, indigoNeb, pow(w1, 1.8) * 0.55);",
    "  interior += cyanNeb * lensedBand * (0.35 + 0.65 * pow(w2, 1.6));",
    "  interior += warmCore * lensedBand * exp(-dir.x * dir.x * 4.5) * 0.36;",
    "  interior += vec3(0.92, 0.97, 1.00) * starPin * 2.2;",
    "  float photonRing = exp(-pow((mu - 0.14) * 14.5, 2.0)) * 1.35;",
    "  float subRing = exp(-pow((mu - 0.26) * 18.0, 2.0)) * 0.52;",
    "  float outerCherenkov = pow(1.0 - mu, 4.2) * (0.88 + 0.22 * sin(atan(N.y, N.x) * 6.0 - uTime * 2.6));",
    "  vec3 ringCol = mix(vec3(0.16, 0.86, 1.00), vec3(0.62, 0.50, 1.00), 0.5 + 0.5 * sin(atan(N.y, N.x) * 2.0 + uTime * 1.2));",
    "  vec3 col = interior * smoothstep(0.02, 0.24, mu) + ringCol * (photonRing + subRing + outerCherenkov) + vec3(0.96, 0.99, 1.00) * photonRing * 0.55;",
    "  col *= (1.0 + uBoost * 0.32) * uDim;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var WORMHOLE_FUNNEL_VERT = [
    "varying vec2 vLocalXY;",
    "void main() {",
    "  vLocalXY = position.xy;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}"
  ].join("\n");

  var WORMHOLE_FUNNEL_FRAG = [
    "uniform float uInnerR;",
    "uniform float uOuterR;",
    "uniform float uTime;",
    "uniform float uDim;",
    "uniform float uBoost;",
    "varying vec2 vLocalXY;",
    "void main() {",
    "  float r = length(vLocalXY);",
    "  float t = clamp((r - uInnerR) / max(0.001, uOuterR - uInnerR), 0.0, 1.0);",
    "  float ang = atan(vLocalXY.y, vLocalXY.x);",
    "  float spiral = sin(ang * 6.0 + log(max(0.001, r / uInnerR)) * 14.0 - uTime * 3.4);",
    "  float meridian = pow(abs(cos(ang * 12.0 - uTime * 0.45)), 14.0);",
    "  float parallel = pow(abs(sin(t * 22.0 + uTime * 1.8)), 12.0);",
    "  float grid = clamp(meridian * 0.55 + parallel * 0.55 + smoothstep(0.45, 0.98, spiral) * 0.48, 0.0, 1.4);",
    "  float env = smoothstep(0.0, 0.06, t) * pow(1.0 - t, 1.75);",
    "  vec3 cCyan = vec3(0.16, 0.86, 1.00);",
    "  vec3 cIndigo = vec3(0.52, 0.42, 0.98);",
    "  vec3 col = mix(cCyan, cIndigo, t * 0.78);",
    "  float alpha = clamp(env * (0.28 + grid * 0.86) * (1.0 + uBoost * 0.45), 0.0, 0.95);",
    "  gl_FragColor = vec4(col * alpha * uDim, alpha);",
    "}"
  ].join("\n");

  /* ---------- 模型归一化与天体层级判定（恒星=个人「陌浔」，每个连通记忆=行星节点，度1=卫星，度0=孤立黑洞） ---------- */

  function normalizeModel(dataOrModel, opts) {
    var model; var fromBuildModel = false;
    if (dataOrModel && Array.isArray(dataOrModel.nodes) && Array.isArray(dataOrModel.edges)) {
      model = {
        nodes: dataOrModel.nodes.slice(),
        edges: dataOrModel.edges.slice(),
        categories: Array.isArray(dataOrModel.categories) ? dataOrModel.categories.slice() : []
      };
    } else {
      if (!global.MemoryGraph || !global.MemoryGraph.buildModel) return null;
      model = global.MemoryGraph.buildModel(dataOrModel || {});
      fromBuildModel = true;
    }
    if (!model || !model.nodes || !model.nodes.length) return { nodes: [], edges: [], categories: [] };

    var nodeById = {};
    model.nodes.forEach(function (nd, i) {
      if (!nd.id) nd.id = "node-" + i; if (!nd.category) nd.category = "TOPIC"; nd.palette = ensurePalette(nd.category, nd.palette); nd.__idx = i; nd.__deg = 0; nd.__neighbors = []; nodeById[nd.id] = nd;
    });

    var cleanEdges = [];
    (model.edges || []).forEach(function (e) {
      if (!e) return;
      if (fromBuildModel && e.w === 0.12 && e.pulseSpeed === 0.15) return;
      var a = typeof e.a === "object" ? e.a : (typeof e.a === "number" ? model.nodes[e.a] : nodeById[e.a]);
      var b = typeof e.b === "object" ? e.b : (typeof e.b === "number" ? model.nodes[e.b] : nodeById[e.b]);
      if (!a || !b || a === b) return;
      var sameCat = e.sameCategory != null ? !!e.sameCategory : (a.category === b.category);
      var w = typeof e.w === "number" ? e.w : (sameCat ? 0.24 : 0.16);
      cleanEdges.push({ a: a, b: b, sameCategory: sameCat, w: w });
      a.__deg++; b.__deg++;
      a.__neighbors.push({ node: b, w: w, sameCategory: sameCat });
      b.__neighbors.push({ node: a, w: w, sameCategory: sameCat });
    });

    var catSet = {};
    var categories = [];
    (model.categories || []).forEach(function (c) {
      if (c && !catSet[c]) { catSet[c] = true; categories.push(c); }
    });
    model.nodes.forEach(function (nd) {
      nd.degree = nd.__deg;
      if (!catSet[nd.category]) { catSet[nd.category] = true; categories.push(nd.category); }
      var deg = nd.__deg;
      if (deg === 0) {
        nd.__tier = "blackhole"; nd.r3 = 44;
      } else if (deg === 1) {
        nd.__tier = "satellite"; nd.r3 = 12.4 + (hashStr(nd.id + ":sr") % 26) * 0.1;
      } else {
        /* 每个记忆代表一个行星节点：依关联度平滑映射为岩质行星、海洋超级地球至气态/冰巨星 */
        nd.__tier = "planet";
        nd.r3 = clamp(19.0 + Math.sqrt(deg - 1) * 3.9, 20.0, 35.5);
      }
    });

    var onSelect = typeof opts === "function"
      ? opts
      : (opts && typeof opts.onSelect === "function" ? opts.onSelect : function () {});
    var planar = !!(opts && typeof opts === "object" && opts.planar);
    var envOnly = !!(opts && typeof opts === "object" && opts.envOnly);
    var friends = (opts && typeof opts === "object" && Array.isArray(opts.friends)) ? opts.friends : [];

    return { nodes: model.nodes, edges: cleanEdges, categories: categories, onSelect: onSelect, planar: planar, envOnly: envOnly, friends: friends };
  }

  /* ---------- 大间距三维力导向基础布局 ---------- */

  function computeLayout(THREE, nodes, edges, categories) {
    var n = nodes.length; var catCount = Math.max(categories.length, 1);
    var anchors = {};
    var ringR = 1120;
    categories.forEach(function (cat, i) {
      var ang = (i / catCount) * Math.PI * 2 - Math.PI / 2;
      var y = (i % 2 === 0 ? 1 : -1) * (catCount > 2 ? 230 : 0);
      anchors[cat] = { x: Math.cos(ang) * ringR, y: y, z: Math.sin(ang) * ringR };
    });

    var pos = new Float32Array(n * 3); var i, k;
    for (i = 0; i < n; i++) {
      var nd = nodes[i];
      var a = anchors[nd.category] || { x: 0, y: 0, z: 0 };
      var rr = rng(hashStr(nd.id) ^ 0x51ed270b); pos[i * 3] = a.x + (rr() - 0.5) * 520;
      pos[i * 3 + 1] = a.y + (rr() - 0.5) * 420; pos[i * 3 + 2] = a.z + (rr() - 0.5) * 520;
    }

    var iter = 260;
    for (var step = 0; step < iter; step++) {
      var alpha = 1 - step / iter; alpha = alpha * alpha * 0.9 + 0.1;

      for (i = 0; i < n; i++) {
        for (k = i + 1; k < n; k++) {
          var dx = pos[k * 3] - pos[i * 3]; var dy = pos[k * 3 + 1] - pos[i * 3 + 1];
          var dz = pos[k * 3 + 2] - pos[i * 3 + 2]; var d2 = dx * dx + dy * dy + dz * dz;
          var minD = nodes[i].r3 + nodes[k].r3 + 350;
          if (d2 > 0.01 && d2 < minD * minD) {
            var d = Math.sqrt(d2); var f = ((minD - d) / d) * 0.52 * alpha; dx *= f; dy *= f; dz *= f;
            pos[i * 3] -= dx; pos[i * 3 + 1] -= dy; pos[i * 3 + 2] -= dz;
            pos[k * 3] += dx; pos[k * 3 + 1] += dy; pos[k * 3 + 2] += dz;
          }
        }
      }

      for (i = 0; i < edges.length; i++) {
        var e = edges[i]; var ia = e.a.__idx, ib = e.b.__idx;
        if (ia == null || ib == null) continue;
        var target = e.sameCategory ? 780 : 1520; var vx = pos[ib * 3] - pos[ia * 3];
        var vy = pos[ib * 3 + 1] - pos[ia * 3 + 1]; var vz = pos[ib * 3 + 2] - pos[ia * 3 + 2];
        var dd = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1; var ff = ((dd - target) / dd) * 0.016 * alpha;
        vx *= ff; vy *= ff; vz *= ff; pos[ia * 3] += vx; pos[ia * 3 + 1] += vy; pos[ia * 3 + 2] += vz;
        pos[ib * 3] -= vx; pos[ib * 3 + 1] -= vy; pos[ib * 3 + 2] -= vz;
      }

      for (i = 0; i < n; i++) {
        var anc = anchors[nodes[i].category] || { x: 0, y: 0, z: 0 };
        pos[i * 3] += (anc.x - pos[i * 3]) * 0.0065 * alpha;
        pos[i * 3 + 1] += (anc.y - pos[i * 3 + 1]) * 0.0065 * alpha;
        pos[i * 3 + 2] += (anc.z - pos[i * 3 + 2]) * 0.0065 * alpha;
        var rr2 = Math.sqrt(pos[i * 3] * pos[i * 3] + pos[i * 3 + 1] * pos[i * 3 + 1] + pos[i * 3 + 2] * pos[i * 3 + 2]);
        if (rr2 > 2400) {
          var s = 2400 / rr2; pos[i * 3] *= s; pos[i * 3 + 1] *= s; pos[i * 3 + 2] *= s;
        }
      }
    }

    var cx = 0, cy = 0, cz = 0;
    for (i = 0; i < n; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
    if (n) { cx /= n; cy /= n; cz /= n; }
    var maxR = 0;
    for (i = 0; i < n; i++) {
      pos[i * 3] -= cx; pos[i * 3 + 1] -= cy; pos[i * 3 + 2] -= cz;
      var rr3 = Math.sqrt(pos[i * 3] * pos[i * 3] + pos[i * 3 + 1] * pos[i * 3 + 1] + pos[i * 3 + 2] * pos[i * 3 + 2]);
      if (rr3 > maxR) maxR = rr3;
    }
    var scale = maxR > 0 ? 1280 / maxR : 1;
    for (i = 0; i < n; i++) {
      pos[i * 3] *= scale; pos[i * 3 + 1] *= scale; pos[i * 3 + 2] *= scale;
      nodes[i].p = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      nodes[i].__baseP = nodes[i].p.clone();
    }
    return { anchors: anchors, scale: scale };
  }

  /* ---------- 恒星「陌浔」行星系开普勒公转轨道构建（每个记忆为行星节点，大间距无碰撞排布） ---------- */

  function buildHierarchyAndOrbits(THREE, nodes, categories) {
    var catIndexMap = {};
    var catCount = Math.max(1, categories.length);
    categories.forEach(function (c, i) { catIndexMap[c] = i; });
    nodes.forEach(function (nd) {
      nd.__isGalaxyCore = false; nd.__galaxy = null; nd.__orbit = null; nd.__hasRing3d = false;
    });

    var planetNodes = nodes.filter(function (nd) { return nd.__tier === "planet"; });
    /* 按关联度与确定性哈希交错排布，使内圈至外圈均匀分布岩质行星、海洋星与带环巨行星 */
    var orderedPlanets = planetNodes.slice().sort(function (a, b) {
      var sa = (hashStr("shell:" + a.id) % 1000) + (a.__deg >= 6 ? -180 : 0);
      var sb = (hashStr("shell:" + b.id) % 1000) + (b.__deg >= 6 ? -180 : 0);
      return sa - sb;
    });

    var pCount = Math.max(1, orderedPlanets.length);
    orderedPlanets.forEach(function (pl, idx) {
      var rand = rng(hashStr("plOrb:" + pl.id) ^ 0x5bd1e995);
      var cIdx = catIndexMap[pl.category] != null ? catIndexMap[pl.category] : 0;
      var catSector = (cIdx / catCount) * Math.PI * 2;
      var frac = pCount > 1 ? idx / (pCount - 1) : 0.4;
      var a = 305 + frac * 1055 + (rand() - 0.5) * 14;
      var ecc = 0.035 + rand() * 0.065;
      var catInc = (cIdx % 2 === 0 ? 1 : -1) * (0.07 + (cIdx % 3) * 0.045);
      var inc = catInc + (rand() - 0.5) * 0.22;
      var period = clamp(24.0 * Math.pow(a / 480, 1.32), 14.5, 96.0);
      var m0 = (catSector + (rand() - 0.5) * 1.18 + idx * 0.46) % (Math.PI * 2);
      if (m0 < 0) m0 += Math.PI * 2;

      pl.__orbit = {
        mode: "sun",
        parentNode: null,
        a: a,
        e: ecc,
        M0: m0,
        omega: ((Math.PI * 2) / period) * (rand() > 0.12 ? 1 : -1),
        basis: buildOrbitBasis(THREE, inc, catSector * 0.5 + rand() * 1.2, rand() * Math.PI * 2),
        showTrack: true
      };
    });

    var ringTargetCount = planetNodes.length ? Math.max(2, Math.round(planetNodes.length * 0.38)) : 0;
    planetNodes.slice().sort(function (a, b) {
      var da = (b.__deg >= 6 ? 1 : 0) - (a.__deg >= 6 ? 1 : 0);
      if (da !== 0) return da;
      return (hashStr(a.id + ":ring") >>> 0) - (hashStr(b.id + ":ring") >>> 0);
    }).forEach(function (pl, idx) {
      pl.__hasRing3d = idx < ringTargetCount;
    });

    var childCounters = {};
    function nextSiblingIndex(parentId) {
      childCounters[parentId] = (childCounters[parentId] || 0) + 1;
      return childCounters[parentId] - 1;
    }

    var satNodes = nodes.filter(function (nd) { return nd.__tier === "satellite"; });
    satNodes.forEach(function (sat) {
      var soleNb = sat.__neighbors.length ? sat.__neighbors[0].node : null;
      var rand = rng(hashStr("satOrb:" + sat.id));
      var sib = soleNb ? nextSiblingIndex(soleNb.id) : 0;
      var hostR = soleNb ? soleNb.r3 : 26;
      var a = hostR * 2.85 + 54 + sib * 42 + rand() * 20;
      var ecc = 0.16 + rand() * 0.12;
      var inc = (0.36 + rand() * 0.52) * (rand() > 0.5 ? 1 : -1);
      var period = clamp(9.2 + sib * 3.4 + rand() * 4.5, 8.5, 19.5);

      if (soleNb && soleNb !== sat) {
        sat.__orbit = {
          mode: "parent", parentNode: soleNb, anchor: sat.__baseP.clone(), a: a, e: ecc,
          M0: rand() * Math.PI * 2, omega: (Math.PI * 2) / period,
          basis: buildOrbitBasis(THREE, inc, rand() * Math.PI * 2, rand() * Math.PI * 2), showTrack: true
        };
      } else {
        sat.__orbit = {
          mode: "sun", parentNode: null, a: 820 + rand() * 180, e: 0.10,
          M0: rand() * Math.PI * 2, omega: (Math.PI * 2) / 36.0,
          basis: buildOrbitBasis(THREE, inc, rand() * Math.PI * 2, rand() * Math.PI * 2), showTrack: true
        };
      }
    });

    var bhNodes = nodes.filter(function (nd) { return nd.__tier === "blackhole"; });
    bhNodes.forEach(function (bh, idx) {
      var rand = rng(hashStr("bhPos:" + bh.id));
      var haloDist = 1540 + (idx % 3) * 130 + rand() * 90;
      bh.__orbit = {
        mode: "sun",
        a: haloDist,
        e: 0.08,
        M0: 2.35 + idx * 2.1 + rand() * 0.8,
        omega: (Math.PI * 2) / (148 + rand() * 42),
        basis: buildOrbitBasis(THREE, (0.24 + rand() * 0.28) * (idx % 2 === 0 ? 1 : -1), rand() * 6.28, rand() * 6.28),
        showTrack: false
      };
    });

    return { galaxies: [], galaxyByCat: {} };
  }

  function updateAllWorldPositions(t) {
    var i, p;
    var entryByNodeId = state.planetById;
    var visited = {};

    function evalEntry(entry, depth) {
      if (!entry || visited[entry.node.id]) return;
      visited[entry.node.id] = true; var orb = entry.node.__orbit;
      if (!orb) {
        entry.worldPos.copy(entry.node.__baseP);
      } else if (orb.mode === "sun") {
        evalKeplerOrbit(orb.M0 + t * orb.omega, orb.a, orb.e, orb.basis.u, orb.basis.v, entry.worldPos);
      } else if (orb.mode === "anchor") {
        evalKeplerOrbit(orb.M0 + t * orb.omega, orb.a, orb.e, orb.basis.u, orb.basis.v, state.tmpV2);
        entry.worldPos.copy(orb.anchor).add(state.tmpV2);
      } else if (orb.mode === "parent" && orb.parentNode) {
        var parentEntry = entryByNodeId[orb.parentNode.id];
        if (parentEntry && depth < 6) evalEntry(parentEntry, depth + 1);
        var hostPos = parentEntry ? parentEntry.worldPos : orb.parentNode.__baseP;
        evalKeplerOrbit(orb.M0 + t * orb.omega, orb.a, orb.e, orb.basis.u, orb.basis.v, state.tmpV2);
        entry.worldPos.copy(hostPos).add(state.tmpV2);
      }
      entry.node.p.copy(entry.worldPos); entry.group.position.copy(entry.worldPos);
    }

    for (i = 0; i < state.planets.length; i++) {
      p = state.planets[i]; evalEntry(p, 0);
    }

    if (state.wormhole) {
      var wh = state.wormhole;
      evalKeplerOrbit(wh.M0 + t * wh.omega, wh.a, wh.e, wh.basis.u, wh.basis.v, wh.worldPos);
      wh.group.position.copy(wh.worldPos);
    }
  }

  /* 计算天体食/遮挡系数：当子天体运行至母天体背对太阳的本影锥内时平滑变暗 */
  function computeEclipseFactor(bodyPos, occluderPos, occluderR) {
    if (!occluderPos || occluderR <= 0) return 0;
    var dBody = bodyPos.length(); var dOcc = occluderPos.length();
    if (dBody <= dOcc + occluderR * 0.5 || dOcc < 1) return 0;
    var invOcc = 1 / dOcc;
    var dirX = occluderPos.x * invOcc, dirY = occluderPos.y * invOcc, dirZ = occluderPos.z * invOcc;
    var proj = bodyPos.x * dirX + bodyPos.y * dirY + bodyPos.z * dirZ;
    if (proj <= dOcc) return 0;
    var px = bodyPos.x - dirX * proj; var py = bodyPos.y - dirY * proj; var pz = bodyPos.z - dirZ * proj;
    var perp = Math.sqrt(px * px + py * py + pz * pz);
    if (perp >= occluderR * 1.45) return 0;
    return 1.0 - smoothstepJS(occluderR * 0.72, occluderR * 1.45, perp);
  }

  /* ---------- 中心超巨型写实太阳与黑洞组装器 ---------- */

  function createCentralSun(THREE) {
    var sunGroup = new THREE.Group(); state.root.add(sunGroup);

    var sunGeo = new THREE.SphereGeometry(1, 56, 40);
    var sunMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1.0 }, uStorm: { value: 0.0 } },
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG
    });
    var sunMesh = new THREE.Mesh(sunGeo, sunMat); sunMesh.scale.setScalar(SUN_RADIUS);
    sunMesh.renderOrder = 4; sunGroup.add(sunMesh);

    var coronaMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1.0 }, uStorm: { value: 0.0 } },
      vertexShader: SUN_CORONA_VERT,
      fragmentShader: SUN_CORONA_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    var coronaSpan = SUN_RADIUS * 12.6;
    var coronaPlane = new THREE.Mesh(new THREE.PlaneGeometry(coronaSpan, coronaSpan), coronaMat);
    coronaPlane.frustumCulled = false; coronaPlane.renderOrder = 5; sunGroup.add(coronaPlane);

    var outerBloom = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.texCache.glow,
      color: 0xffb347,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    outerBloom.scale.set(SUN_RADIUS * 14.0, SUN_RADIUS * 14.0, 1);
    sunGroup.add(outerBloom);

    var promGroup = new THREE.Group(); promGroup.visible = !state.degraded; sunGroup.add(promGroup);
    state.jetGroups.push(promGroup);

    var promMats = [];
    [
      { lat: 0.32, lon: 0.45, tilt: 0.25, span: SUN_RADIUS * 0.34, h: SUN_RADIUS * 0.24, phase: 0.4 },
      { lat: -0.26, lon: 2.35, tilt: -0.32, span: SUN_RADIUS * 0.40, h: SUN_RADIUS * 0.29, phase: 2.3 },
      { lat: 0.22, lon: 4.38, tilt: 0.18, span: SUN_RADIUS * 0.30, h: SUN_RADIUS * 0.20, phase: 4.5 }
    ].forEach(function (cfg) {
      var anchor = new THREE.Group(); var nx = Math.cos(cfg.lat) * Math.cos(cfg.lon);
      var ny = Math.sin(cfg.lat); var nz = Math.cos(cfg.lat) * Math.sin(cfg.lon);
      anchor.position.set(nx * SUN_RADIUS * 0.985, ny * SUN_RADIUS * 0.985, nz * SUN_RADIUS * 0.985);
      anchor.rotation.y = -cfg.lon + Math.PI * 0.5; anchor.rotation.x = -cfg.lat;
      anchor.rotation.z = cfg.tilt; promGroup.add(anchor);

      var pMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPhase: { value: cfg.phase }, uDim: { value: 1.0 } },
        vertexShader: PROMINENCE_VERT,
        fragmentShader: PROMINENCE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      var archGeo = buildProminenceArchGeometry(THREE, cfg.span, cfg.h);
      var m1 = new THREE.Mesh(archGeo, pMat); anchor.add(m1); var m2 = new THREE.Mesh(archGeo, pMat);
      m2.rotation.y = Math.PI * 0.42; anchor.add(m2); promMats.push(pMat);
    });

    state.lensGhosts = [];
    [
      { t: -0.36, size: 7.5, col: 0xffe4a3, op: 0.12, tex: state.texCache.lensGhost },
      { t: 0.26, size: 4.2, col: 0x7dd3fc, op: 0.11, tex: state.texCache.lensGhost },
      { t: 0.58, size: 9.8, col: 0xc084fc, op: 0.08, tex: state.texCache.lensGhost },
      { t: 0.96, size: 5.6, col: 0x5eead4, op: 0.10, tex: state.texCache.glow }
    ].forEach(function (gCfg) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: gCfg.tex,
        color: gCfg.col,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      }));
      sp.renderOrder = 20; state.scene.add(sp);
      state.lensGhosts.push({ sprite: sp, t: gCfg.t, size: gCfg.size, baseOp: gCfg.op });
    });

    state.centralSun = {
      group: sunGroup, mesh: sunMesh, sunMat: sunMat, coronaMat: coronaMat, outerBloom: outerBloom,
      promGroup: promGroup, promMats: promMats
    };
  }

  function updateCentralSunAndOptics(t, simDt, dim) {
    var sun = state.centralSun;
    if (!sun) return;
    var stormWave = state.reduced ? 0.15 : (Math.pow(Math.max(0, Math.sin(t * 0.48) * Math.cos(t * 0.19 + 0.8)), 4.0));
    sun.sunMat.uniforms.uTime.value = t; sun.sunMat.uniforms.uDim.value = dim;
    sun.sunMat.uniforms.uStorm.value = stormWave; sun.coronaMat.uniforms.uTime.value = t;
    sun.coronaMat.uniforms.uDim.value = dim; sun.coronaMat.uniforms.uStorm.value = stormWave;
    sun.outerBloom.material.opacity = (0.30 + stormWave * 0.12) * dim;
    if (simDt > 0) sun.promGroup.rotation.y += simDt * 0.065;
    for (var i = 0; i < sun.promMats.length; i++) {
      sun.promMats[i].uniforms.uTime.value = t; sun.promMats[i].uniforms.uDim.value = dim;
    }

    var cam = state.camera;
    if (state.envOnly) {
      for (var gi0 = 0; gi0 < state.lensGhosts.length; gi0++) {
        state.lensGhosts[gi0].sprite.visible = false;
      }
      return;
    }
    state.tmpV.set(0, 0, 0).project(cam);
    var sx = state.tmpV.x, sy = state.tmpV.y, sz = state.tmpV.z; var rScreen = Math.sqrt(sx * sx + sy * sy);
    var visible = sz > -1 && sz < 1 && rScreen < 1.28;
    if (!visible) {
      for (var gi = 0; gi < state.lensGhosts.length; gi++) {
        state.lensGhosts[gi].sprite.visible = false;
      }
      return;
    }

    var edgeFade = smoothstepJS(1.28, 0.22, rScreen) * smoothstepJS(0.03, 0.16, rScreen + 0.08);
    var galAtten = 1.0 - smoothstepJS(3400, 6800, state.radius);
    if (galAtten < 0.01) {
      for (var gi2 = 0; gi2 < state.lensGhosts.length; gi2++) {
        state.lensGhosts[gi2].sprite.visible = false;
      }
      return;
    }
    var sunCamDist = cam.position.length(); var occAtten = galAtten;
    if (state.selectedEntry) {
      var eDist = cam.position.distanceTo(state.selectedEntry.worldPos);
      if (eDist < sunCamDist) occAtten = 0.35;
    }

    var fx = state.target.x - cam.position.x; var fy = state.target.y - cam.position.y;
    var fz = state.target.z - cam.position.z; var fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    var rx = -fz, rz = fx; var rl = Math.sqrt(rx * rx + rz * rz) || 1; rx /= rl; rz /= rl;
    var ux = -rz * fy; var uy = rz * fx - rx * fz; var uz = rx * fy;

    var ghostDepth = Math.max(cam.near * 18, 42);
    var halfH = Math.tan((cam.fov * Math.PI / 180) * 0.5) * ghostDepth;
    var halfW = halfH * cam.aspect; var baseX = cam.position.x + fx * ghostDepth;
    var baseY = cam.position.y + fy * ghostDepth; var baseZ = cam.position.z + fz * ghostDepth;

    for (var k = 0; k < state.lensGhosts.length; k++) {
      var gh = state.lensGhosts[k]; var offX = (-sx * gh.t) * halfW; var offY = (-sy * gh.t) * halfH;
      gh.sprite.visible = true;
      gh.sprite.position.set(
        baseX + rx * offX + ux * offY,
        baseY + uy * offY,
        baseZ + rz * offX + uz * offY
      ); gh.sprite.scale.set(gh.size, gh.size, 1);
      gh.sprite.material.opacity = gh.baseOp * edgeFade * occAtten * dim * (1.0 + stormWave * 0.35);
    }
  }

  function assembleGargantuaRig(THREE, group, radius, innerHex, outerHex, sharedGeos, withJets, seedVal) {
    var rand = rng(seedVal >>> 0);

    var horizonMesh = new THREE.Mesh(
      sharedGeos.highSphere,
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    ); horizonMesh.scale.setScalar(radius); horizonMesh.renderOrder = 6; group.add(horizonMesh);

    var lensedMat = new THREE.ShaderMaterial({
      uniforms: {
        uInnerCol: { value: new THREE.Color(innerHex) }, uOuterCol: { value: new THREE.Color(outerHex) },
        uTime: { value: 0 }, uDim: { value: 1.0 }, uBoost: { value: 0.0 },
        uRoll: { value: (rand() - 0.5) * 0.28 }
      },
      vertexShader: BH_SHELL_VERT,
      fragmentShader: BH_SHELL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    var lensedPlane = new THREE.Mesh(new THREE.PlaneGeometry(radius * 9.4, radius * 9.4), lensedMat);
    lensedPlane.frustumCulled = false; lensedPlane.renderOrder = 7; group.add(lensedPlane);

    var innerR = radius * 1.26; var outerR = radius * 4.45; var diskGroup = new THREE.Group();
    diskGroup.rotation.x = Math.PI * 0.44 + (rand() - 0.5) * 0.16;
    diskGroup.rotation.z = (rand() - 0.5) * 0.34; group.add(diskGroup);

    var accMat = new THREE.ShaderMaterial({
      uniforms: {
        uInnerR: { value: innerR }, uOuterR: { value: outerR }, uTime: { value: 0 }, uDim: { value: 1.0 },
        uBoost: { value: 0.0 }, uInnerCol: { value: new THREE.Color(innerHex) },
        uOuterCol: { value: new THREE.Color(outerHex) }
      },
      vertexShader: ACCRETION_VERT,
      fragmentShader: ACCRETION_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var accMesh = new THREE.Mesh(new THREE.RingGeometry(innerR, outerR, 92, 18), accMat);
    accMesh.renderOrder = 8; diskGroup.add(accMesh);

    var lensSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.texCache.lensRing,
      color: 0xfff3dc,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    lensSprite.scale.set(radius * 6.8, radius * 6.8, 1); group.add(lensSprite);

    var jetGroup = null, jetMat = null;
    if (withJets) {
      jetGroup = new THREE.Group(); jetGroup.visible = !state.degraded; diskGroup.add(jetGroup);
      var jetLen = radius * 6.2, jetW = radius * 0.68;
      jetMat = new THREE.MeshBasicMaterial({
        map: state.texCache.jetBeam, color: 0xfde68a, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      });
      [-1, 1].forEach(function (dir) {
        for (var cr = 0; cr < 2; cr++) {
          var jp = new THREE.Mesh(new THREE.PlaneGeometry(jetW, jetLen), jetMat);
          jp.rotation.x = Math.PI * 0.5; jp.position.z = dir * (jetLen * 0.5 + radius * 0.9);
          if (dir < 0) jp.rotation.y = Math.PI;
          jp.rotation.z = cr * (Math.PI * 0.5); jetGroup.add(jp);
        }
      });
      state.jetGroups.push(jetGroup);
    }

    return {
      horizonMesh: horizonMesh, lensedPlane: lensedPlane, lensedMat: lensedMat, accMesh: accMesh,
      accMat: accMat, lensSprite: lensSprite, jetGroup: jetGroup, jetMat: jetMat
    };
  }

  /* ---------- 星系盘、深空背景、小行星带、彗星、微流星体、HUD 与深空航天器 ---------- */

  /* ---------- 宏大倾斜旋臂银河星系（缩小图复刻深空仙女座/银河系全景，凸显「陌浔」恒星系之渺小） ---------- */

  function syncGalaxyDimensionMode() {
    var gg = state.grandGalaxy;
    if (!gg) return;
    var is2D = !!state.envOnly;
    gg.group.position.copy(is2D ? gg.center2D : gg.center3D);
    gg.group.quaternion.copy(is2D ? gg.quat2D : gg.quat3D);
    gg.group.scale.set(1, is2D ? 0.0005 : 1, 1);
    if (state.galaxyCenter) {
      state.galaxyCenter.copy(is2D ? gg.center2D : gg.center3D);
    }
    gg.diskMat.uniforms.uFlat2D.value = is2D ? 1.0 : 0.0;
    if (gg.core3DGroup) {
      gg.core3DGroup.visible = !is2D;
    }
    if (gg.polarJets3D) {
      gg.polarJets3D.visible = !is2D;
    }
    if (gg.galGridLines) {
      gg.galGridLines.visible = is2D;
    }
    if (gg.nebulaMat) {
      gg.nebulaMat.uniforms.uOpacity.value = is2D ? 0.13 : 0.24;
    }
    if (gg.dustMat) {
      gg.dustMat.uniforms.uOpacity.value = is2D ? 0.20 : 0.34;
    }
    if (gg.meteorMat) {
      gg.meteorMat.uniforms.uOpacity.value = is2D ? 0.50 : 0.78;
    }
    if (gg.companions) {
      for (var i = 0; i < gg.companions.length; i++) {
        var c = gg.companions[i];
        c.group.position.y = is2D ? 0 : c.ly3D;
      }
    }
  }

  function createGrandSpiralGalaxy(THREE, starBudget) {
    /* 1) 3D 立体倾斜坐标系：星系长轴沿屏幕左下→右上约 29° 倾斜、盘面倾角 63.5° */
    var refPhi = 1.00, refTheta = DEFAULT_THETA;
    var v0 = new THREE.Vector3(
      Math.sin(refPhi) * Math.cos(refTheta),
      Math.cos(refPhi),
      Math.sin(refPhi) * Math.sin(refTheta)
    ).normalize();
    var r0 = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), v0).normalize();
    var u0 = new THREE.Vector3().crossVectors(v0, r0).normalize();

    var diagAng = 0.506;
    var incAng = 1.108;
    var axisX = new THREE.Vector3()
      .addScaledVector(r0, Math.cos(diagAng))
      .addScaledVector(u0, Math.sin(diagAng))
      .normalize();
    var screenPerp = new THREE.Vector3()
      .addScaledVector(r0, -Math.sin(diagAng))
      .addScaledVector(u0, Math.cos(diagAng))
      .normalize();
    var axisY = new THREE.Vector3()
      .addScaledVector(v0, Math.cos(incAng))
      .addScaledVector(screenPerp, Math.sin(incAng))
      .normalize();
    var axisZ = new THREE.Vector3().crossVectors(axisX, axisY).normalize();
    axisY.crossVectors(axisZ, axisX).normalize();

    /* 2) 2D 纯平面顶视坐标系：盘面 100% 平行于 2D 观测视平面（倾角 0°、法向正对平面相机、厚度压平为 0），
     *    与升级后的 3D 星系完全同源，仅存在 3D 立体 vs 2D 平面维度差异 */
    var vPlanar = new THREE.Vector3(
      Math.sin(PLANAR_PHI) * Math.cos(PLANAR_THETA),
      Math.cos(PLANAR_PHI),
      Math.sin(PLANAR_PHI) * Math.sin(PLANAR_THETA)
    ).normalize();
    var rPlanar = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), vPlanar).normalize();
    var uPlanar = new THREE.Vector3().crossVectors(vPlanar, rPlanar).normalize();
    var diagAng2D = 0.34;
    var axisX2D = new THREE.Vector3()
      .addScaledVector(rPlanar, Math.cos(diagAng2D))
      .addScaledVector(uPlanar, Math.sin(diagAng2D))
      .normalize();
    var axisY2D = vPlanar.clone();
    var axisZ2D = new THREE.Vector3().crossVectors(axisX2D, axisY2D).normalize();

    /* 「陌浔」位于银心外约 0.433R 的旋臂区，整座行星系仅占银河直径不足 7% */
    var moxunGalX = 7800;
    var moxunGalZ = -2900;
    var moxunGalR = Math.hypot(moxunGalX, moxunGalZ);
    var moxunGalAng = Math.atan2(moxunGalZ, moxunGalX);

    var center3D = new THREE.Vector3()
      .addScaledVector(axisX, -moxunGalX)
      .addScaledVector(axisZ, -moxunGalZ);
    var center2D = new THREE.Vector3()
      .addScaledVector(axisX2D, -moxunGalX)
      .addScaledVector(axisZ2D, -moxunGalZ);

    var quat3D = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axisX, axisY, axisZ));
    var quat2D = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axisX2D, axisY2D, axisZ2D));

    state.galaxyCenter = (state.envOnly ? center2D : center3D).clone();

    var galGroup = new THREE.Group();
    state.root.add(galGroup);

    /* 1. 超高清多倍频丝缕旋臂盘（3D 侧视时自动柔化过渡，让位给真实 3D 立体星海、星云与陨石群厚度） */
    var diskMat = new THREE.ShaderMaterial({
      uniforms: {
        uRadius: { value: GRAND_GALAXY_R },
        uTime: { value: 0 },
        uDim: { value: 1.0 },
        uNearFade: { value: 1.0 },
        uFlat2D: { value: state.envOnly ? 1.0 : 0.0 },
        uWarpAmp: { value: 0.036 },
        uLayerAlpha: { value: 1.0 },
        uLayerSoft: { value: 0.0 }
      },
      vertexShader: GRAND_GALAXY_VERT,
      fragmentShader: GRAND_GALAXY_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    var diskSpan = GRAND_GALAXY_R * 2.04;
    var diskGeo = new THREE.PlaneGeometry(diskSpan, diskSpan, 40, 40);
    var diskMesh = new THREE.Mesh(diskGeo, diskMat);
    diskMesh.rotation.x = -Math.PI * 0.5;
    diskMesh.frustumCulled = false;
    diskMesh.renderOrder = -5;
    galGroup.add(diskMesh);

    /* 2. 银心柔美自然光晕（彻底移除生硬外圈，全部改用柔和暖金星云辉光融入环境） */
    var bulgeInner = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.texCache.glow,
      color: 0xffdfaa,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    bulgeInner.scale.set(GRAND_GALAXY_R * 0.24, GRAND_GALAXY_R * 0.18, 1);
    bulgeInner.renderOrder = -3;
    galGroup.add(bulgeInner);

    var bulgeOuter = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.texCache.glow,
      color: 0xd99b66,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    bulgeOuter.scale.set(GRAND_GALAXY_R * 0.44, GRAND_GALAXY_R * 0.28, 1);
    bulgeOuter.renderOrder = -4;
    galGroup.add(bulgeOuter);

    /* 2b. 3D 专属立体星系中心核心组（更宏大的自然维和黑洞 + 视向引力透镜光晕 + 渐融吸积流 + 丰盈立体核球） */
    var core3DGroup = new THREE.Group();
    galGroup.add(core3DGroup);

    // 立体暖金棒状核球柔雾（侧看丰满柔和隆起，无缝包覆黑洞）
    var bulgeVolMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1.0 }, uNearFade: { value: 1.0 } },
      vertexShader: GALAXY_BULGE_VERT,
      fragmentShader: GALAXY_BULGE_FRAG,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var bulgeVolMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 44, 32), bulgeVolMat);
    bulgeVolMesh.scale.set(GRAND_GALAXY_R * 0.265, GRAND_GALAXY_R * 0.165, GRAND_GALAXY_R * 0.185);
    bulgeVolMesh.rotation.y = -0.38;
    bulgeVolMesh.frustumCulled = false;
    bulgeVolMesh.renderOrder = -4;
    core3DGroup.add(bulgeVolMesh);

    // 更宏大的中心超大质量黑洞视界球（直径提升近一倍，与周围暖金核球自然相融）
    var smbhR = GRAND_GALAXY_R * 0.029;
    var smbhMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1.0 }, uNearFade: { value: 1.0 } },
      vertexShader: GALAXY_BULGE_VERT,
      fragmentShader: SMBH_HORIZON_FRAG,
      transparent: true,
      depthWrite: false
    });
    var smbhMesh = new THREE.Mesh(new THREE.SphereGeometry(smbhR, 42, 32), smbhMat);
    smbhMesh.frustumCulled = false;
    smbhMesh.renderOrder = 3;
    core3DGroup.add(smbhMesh);

    // 视向自适应 Gargantua 引力透镜柔光弧（始终顺应相机视角平滑包裹黑洞，零硬边零切面）
    var smbhLensMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1.0 }, uNearFade: { value: 1.0 } },
      vertexShader: SMBH_LENS_VERT,
      fragmentShader: SMBH_LENS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var smbhLensMesh = new THREE.Mesh(new THREE.PlaneGeometry(smbhR * 6.6, smbhR * 6.6), smbhLensMat);
    smbhLensMesh.frustumCulled = false;
    smbhLensMesh.renderOrder = 2;
    core3DGroup.add(smbhLensMesh);

    // 柔和旋入式赤道吸积盘（外缘指数消融进黄金核球与星云，毫无生硬圆圈边界）
    var accMat = new THREE.ShaderMaterial({
      uniforms: { uRadius: { value: smbhR * 5.6 }, uTime: { value: 0 }, uDim: { value: 1.0 }, uNearFade: { value: 1.0 }, uFlat2D: { value: 1.0 }, uWarpAmp: { value: 0.0 } },
      vertexShader: GRAND_GALAXY_VERT,
      fragmentShader: ACCRETION_DISK_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var accDiskMesh = new THREE.Mesh(new THREE.PlaneGeometry(smbhR * 11.2, smbhR * 11.2), accMat);
    accDiskMesh.rotation.x = -Math.PI * 0.5 + 0.11;
    accDiskMesh.rotation.z = 0.22;
    accDiskMesh.frustumCulled = false;
    accDiskMesh.renderOrder = 1;
    core3DGroup.add(accDiskMesh);

    /* 2c. 致密核球星团与环黑洞星辰（5,000 颗柔和 3D 分布，无任何线框轨道，自然包裹黑洞并向核球过渡） */
    var ncCount = state.degraded ? 2200 : 5000;
    var ncPos = new Float32Array(ncCount * 3);
    var ncCol = new Float32Array(ncCount * 3);
    var ncSz = new Float32Array(ncCount);
    var ncOrb = new Float32Array(ncCount * 3);
    var ncRand = rng(0x2026a5a5);
    for (var ni = 0; ni < ncCount; ni++) {
      var modeSel = ni % 10;
      var nRad, nAng, nY, nR, nG, nB, nSize;
      if (modeSel < 2) {
        // 环绕大黑洞自然起舞的近核星辰（暖白与浅金蓝，无几何线框）
        var sR = smbhR * (1.42 + Math.pow(ncRand(), 1.45) * 4.8);
        nAng = ncRand() * Math.PI * 2;
        var el = Math.acos(ncRand() * 2 - 1);
        nY = Math.cos(el) * sR * 0.72;
        nRad = Math.max(smbhR * 1.32, Math.sin(el) * sR);
        nR = 0.92 + ncRand() * 0.08; nG = 0.86 + ncRand() * 0.12; nB = 0.72 + ncRand() * 0.28;
        nSize = 1.45 + Math.pow(ncRand(), 2.0) * 2.35;
      } else if (modeSel < 8) {
        // 丰盈 3D 棒状核球致密恒星海洋（侧视饱满厚实，彻底消除中心孤立感）
        var rn = Math.pow(ncRand(), 1.42) * 0.24;
        nRad = smbhR * 1.65 + rn * GRAND_GALAXY_R;
        var bSide = (ni % 2 === 0) ? 0 : Math.PI;
        nAng = -0.38 + bSide + (ncRand() + ncRand() - 1) * 1.38;
        var bulgeH = 0.165 * Math.exp(-rn * 4.8) + 0.030;
        nY = GRAND_GALAXY_R * bulgeH * (ncRand() + ncRand() + ncRand() - 1.5) * 0.92;
        nR = 1.0; nG = 0.76 + ncRand() * 0.20; nB = 0.44 + ncRand() * 0.36;
        nSize = 1.35 + Math.pow(ncRand(), 2.2) * 2.4;
      } else {
        // 柔和星暴云区年轻恒星簇（自然融入内旋臂，无生硬环形边界）
        nRad = GRAND_GALAXY_R * (0.095 + (ncRand() + ncRand() - 1) * 0.055);
        nAng = ncRand() * Math.PI * 2;
        nY = GRAND_GALAXY_R * 0.048 * (ncRand() + ncRand() + ncRand() - 1.5) * 0.85;
        var isPinkHii = (ni % 3 !== 0);
        if (isPinkHii) {
          nR = 1.0; nG = 0.38 + ncRand() * 0.26; nB = 0.66 + ncRand() * 0.24;
          nSize = 1.75 + Math.pow(ncRand(), 1.9) * 2.6;
        } else {
          nR = 0.46 + ncRand() * 0.34; nG = 0.84 + ncRand() * 0.14; nB = 1.0;
          nSize = 1.55 + Math.pow(ncRand(), 2.0) * 2.3;
        }
      }
      ncPos[ni * 3] = Math.cos(nAng) * nRad;
      ncPos[ni * 3 + 1] = nY;
      ncPos[ni * 3 + 2] = Math.sin(nAng) * nRad;
      ncOrb[ni * 3] = nRad;
      ncOrb[ni * 3 + 1] = nAng;
      ncOrb[ni * 3 + 2] = nY;
      var nbr = 0.68 + ncRand() * 0.38;
      ncCol[ni * 3] = clamp(nR * nbr, 0, 1);
      ncCol[ni * 3 + 1] = clamp(nG * nbr, 0, 1);
      ncCol[ni * 3 + 2] = clamp(nB * nbr, 0, 1);
      ncSz[ni] = nSize;
    }
    var ncGeo = new THREE.BufferGeometry();
    ncGeo.setAttribute("position", new THREE.Float32BufferAttribute(ncPos, 3));
    ncGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(ncCol, 3));
    ncGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(ncSz, 1));
    ncGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(ncOrb, 3));
    var ncMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 0.085 },
        uCoreR: { value: smbhR * 3.8 },
        uPixelRatio: { value: state.dpr },
        uSizeScale: { value: 3500.0 },
        uOpacity: { value: 0.94 },
        uDim: { value: 1.0 }
      },
      vertexShader: GRAND_GALAXY_STAR_VERT,
      fragmentShader: GRAND_GALAXY_STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var ncPts = new THREE.Points(ncGeo, ncMat);
    ncPts.frustumCulled = false;
    ncPts.renderOrder = 1;
    galGroup.add(ncPts);
    registerPoints(ncPts, ncCount);

    /* 2d. 3D 体积发光星云云海（3,200 团柔和多层 FBM 立体星云，赋予星系真正的立体云雾厚度，绝非星球） */
    var nebCount = state.degraded ? 1500 : 3200;
    var nebPos = new Float32Array(nebCount * 3);
    var nebCol = new Float32Array(nebCount * 3);
    var nebSz = new Float32Array(nebCount);
    var nebSeed = new Float32Array(nebCount);
    var nebOrb = new Float32Array(nebCount * 3);
    var nebRand = rng(0x7c19e4b2);
    var coreR = GRAND_GALAXY_R * 0.135;
    for (var nbi = 0; nbi < nebCount; nbi++) {
      var nType = nbi % 20;
      var nbRNorm, nbAng, nbY, nbCr, nbCg, nbCb, nbSize;
      if (nType < 6) {
        // 核球暖金/桃杏色立体星云雾海（包裹大黑洞与核星团）
        nbRNorm = 0.032 + Math.pow(nebRand(), 1.35) * 0.25;
        var nbBarSide = (nbi % 2 === 0) ? 0 : Math.PI;
        nbAng = -0.38 + nbBarSide + (nebRand() + nebRand() - 1) * 1.45;
        nbY = GRAND_GALAXY_R * (0.165 * Math.exp(-nbRNorm * 4.2) + 0.032) * (nebRand() + nebRand() + nebRand() - 1.5) * 0.88;
        nbCr = 0.96 + nebRand() * 0.04;
        nbCg = 0.66 + nebRand() * 0.22;
        nbCb = 0.38 + nebRand() * 0.28;
        nbSize = 18.0 + nebRand() * 24.0;
      } else if (nType < 15) {
        // 主旋臂蓝紫/青蓝立体星云厚层（侧看呈现云雾缭绕的丰厚星系盘）
        nbRNorm = 0.11 + Math.pow(nebRand(), 1.02) * 0.84;
        var nbArms = (nbi % 5 >= 3) ? 4 : 2;
        var nbArmBase = ((nbi % nbArms) / nbArms) * Math.PI * 2;
        var nbSpiral = Math.log(nbRNorm + 0.058) * 4.20;
        nbAng = nbArmBase + nbSpiral + (0.18 + nbRNorm * 0.30) * (nebRand() + nebRand() - 1);
        var nbWarp = Math.sin(nbAng - 0.55) * Math.pow(nbRNorm, 2.15) * GRAND_GALAXY_R * 0.036;
        var nbThick = (0.095 * (1.0 - nbRNorm * 0.38) + 0.032);
        nbY = nbWarp + GRAND_GALAXY_R * nbThick * (nebRand() + nebRand() + nebRand() - 1.5) * 0.82;
        var blueMix = nebRand();
        nbCr = lerp(0.24, 0.54, blueMix);
        nbCg = lerp(0.52, 0.56, blueMix);
        nbCb = lerp(0.96, 1.00, blueMix);
        nbSize = 20.0 + nebRand() * 28.0;
      } else if (nType < 18) {
        // H-alpha 玫红/琥珀玫瑰星云团（嵌入旋臂与星暴区，增添深空层次）
        nbRNorm = 0.08 + Math.pow(nebRand(), 1.12) * 0.72;
        var hrBase = ((nbi % 2) / 2) * Math.PI * 2;
        nbAng = hrBase + Math.log(nbRNorm + 0.058) * 4.20 + (0.14 + nbRNorm * 0.22) * (nebRand() + nebRand() - 1);
        var hrWarp = Math.sin(nbAng - 0.55) * Math.pow(nbRNorm, 2.15) * GRAND_GALAXY_R * 0.036;
        nbY = hrWarp + GRAND_GALAXY_R * (0.068 * (1.0 - nbRNorm * 0.3)) * (nebRand() + nebRand() - 1);
        nbCr = 0.92; nbCg = 0.34 + nebRand() * 0.24; nbCb = 0.60 + nebRand() * 0.24;
        nbSize = 15.0 + nebRand() * 20.0;
      } else {
        // 外银晕淡紫/深蓝薄雾（让盘面边缘柔滑融入深空宇宙）
        nbRNorm = 0.22 + Math.pow(nebRand(), 0.82) * 0.75;
        nbAng = nebRand() * Math.PI * 2;
        nbY = GRAND_GALAXY_R * (0.18 * (1.0 - nbRNorm * 0.38)) * (nebRand() + nebRand() - 1);
        nbCr = 0.30; nbCg = 0.42; nbCb = 0.78;
        nbSize = 24.0 + nebRand() * 28.0;
      }
      var nbRad = smbhR * 1.45 + nbRNorm * GRAND_GALAXY_R;
      nebPos[nbi * 3] = Math.cos(nbAng) * nbRad;
      nebPos[nbi * 3 + 1] = nbY;
      nebPos[nbi * 3 + 2] = Math.sin(nbAng) * nbRad;
      nebOrb[nbi * 3] = nbRad;
      nebOrb[nbi * 3 + 1] = nbAng;
      nebOrb[nbi * 3 + 2] = nbY;
      var nbBr = 0.55 + nebRand() * 0.45;
      nebCol[nbi * 3] = clamp(nbCr * nbBr, 0, 1);
      nebCol[nbi * 3 + 1] = clamp(nbCg * nbBr, 0, 1);
      nebCol[nbi * 3 + 2] = clamp(nbCb * nbBr, 0, 1);
      nebSz[nbi] = nbSize;
      nebSeed[nbi] = nebRand();
    }
    var nebGeo = new THREE.BufferGeometry();
    nebGeo.setAttribute("position", new THREE.Float32BufferAttribute(nebPos, 3));
    nebGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(nebCol, 3));
    nebGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(nebSz, 1));
    nebGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(nebSeed, 1));
    nebGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(nebOrb, 3));
    var nebulaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 0.018 },
        uCoreR: { value: coreR },
        uPixelRatio: { value: state.dpr },
        uSizeScale: { value: 26500.0 },
        uOpacity: { value: 0.24 },
        uDim: { value: 1.0 },
        uNearFade: { value: 1.0 }
      },
      vertexShader: GALAXY_NEBULA_VERT,
      fragmentShader: GALAXY_NEBULA_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var nebulaPts = new THREE.Points(nebGeo, nebulaMat);
    nebulaPts.frustumCulled = false;
    nebulaPts.renderOrder = -3;
    galGroup.add(nebulaPts);
    registerPoints(nebulaPts, nebCount);

    /* 2e. 3D 暗赭色分子尘埃立体云带（类似草帽星系 M104 侧视暗尘带，立体穿插于赤道盘面与内核尘埃区） */
    var dustCount = state.degraded ? 550 : 1150;
    var dustPos = new Float32Array(dustCount * 3);
    var dustCol = new Float32Array(dustCount * 3);
    var dustSz = new Float32Array(dustCount);
    var dustSeed = new Float32Array(dustCount);
    var dustOrb = new Float32Array(dustCount * 3);
    var dustRand = rng(0x5a3d91c7);
    for (var dti = 0; dti < dustCount; dti++) {
      var isInnerDust = (dti % 4 === 0);
      var dRNorm = isInnerDust ? (0.055 + Math.pow(dustRand(), 1.2) * 0.17) : (0.14 + Math.pow(dustRand(), 1.05) * 0.68);
      var dRad = smbhR * 2.1 + dRNorm * GRAND_GALAXY_R;
      var dArm = ((dti % 2) / 2) * Math.PI * 2;
      var dAng = isInnerDust
        ? (dustRand() * Math.PI * 2)
        : (dArm + Math.log(dRNorm + 0.058) * 4.20 + 0.52 + (dustRand() + dustRand() - 1) * 0.26);
      var dWarp = Math.sin(dAng - 0.55) * Math.pow(dRNorm, 2.15) * GRAND_GALAXY_R * 0.036;
      var dThick = isInnerDust ? 0.054 : (0.048 * (1.0 - dRNorm * 0.30));
      var dY = dWarp + GRAND_GALAXY_R * dThick * (dustRand() + dustRand() - 1);
      dustPos[dti * 3] = Math.cos(dAng) * dRad;
      dustPos[dti * 3 + 1] = dY;
      dustPos[dti * 3 + 2] = Math.sin(dAng) * dRad;
      dustOrb[dti * 3] = dRad;
      dustOrb[dti * 3 + 1] = dAng;
      dustOrb[dti * 3 + 2] = dY;
      var warmEdge = isInnerDust ? 0.65 : (dustRand() * 0.45);
      dustCol[dti * 3] = lerp(0.05, 0.28, warmEdge);
      dustCol[dti * 3 + 1] = lerp(0.025, 0.11, warmEdge);
      dustCol[dti * 3 + 2] = lerp(0.04, 0.06, warmEdge);
      dustSz[dti] = (isInnerDust ? 14.0 : 18.0) + dustRand() * 19.0;
      dustSeed[dti] = dustRand();
    }
    var dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dustPos, 3));
    dustGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(dustCol, 3));
    dustGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(dustSz, 1));
    dustGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(dustSeed, 1));
    dustGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(dustOrb, 3));
    var dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 0.018 },
        uCoreR: { value: coreR },
        uPixelRatio: { value: state.dpr },
        uSizeScale: { value: 22500.0 },
        uOpacity: { value: 0.34 },
        uDim: { value: 1.0 },
        uNearFade: { value: 1.0 }
      },
      vertexShader: GALAXY_NEBULA_VERT,
      fragmentShader: GALAXY_NEBULA_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    var dustPts = new THREE.Points(dustGeo, dustMat);
    dustPts.frustumCulled = false;
    dustPts.renderOrder = -2;
    galGroup.add(dustPts);
    registerPoints(dustPts, dustCount);

    /* 2f. 3D 陨石群 / 小行星碎石带与冰晶微尘流（4,400 颗不规则多棱碎石微粒，构成丰盈的太空质地，严禁圆球行星） */
    var metCount = state.degraded ? 2000 : 4400;
    var metPos = new Float32Array(metCount * 3);
    var metCol = new Float32Array(metCount * 3);
    var metSz = new Float32Array(metCount);
    var metSeed = new Float32Array(metCount);
    var metOrb = new Float32Array(metCount * 3);
    var metRand = rng(0x88f13c29);
    for (var mti = 0; mti < metCount; mti++) {
      var isCoreBelt = (mti % 4 === 0);
      var mRNorm = isCoreBelt ? (0.048 + Math.pow(metRand(), 1.18) * 0.20) : (0.12 + Math.pow(metRand(), 0.96) * 0.82);
      var mRad = smbhR * 2.15 + mRNorm * GRAND_GALAXY_R;
      var mArms = (mti % 5 >= 3) ? 4 : 2;
      var mArmBase = ((mti % mArms) / mArms) * Math.PI * 2;
      var mAng = isCoreBelt
        ? (metRand() * Math.PI * 2)
        : (mArmBase + Math.log(mRNorm + 0.058) * 4.20 + (0.20 + mRNorm * 0.34) * (metRand() + metRand() - 1));
      var mWarp = Math.sin(mAng - 0.55) * Math.pow(mRNorm, 2.15) * GRAND_GALAXY_R * 0.036;
      var mThick = isCoreBelt ? (0.088 * (1.0 - mRNorm * 1.4) + 0.032) : (0.082 * (1.0 - mRNorm * 0.36));
      var mY = mWarp + GRAND_GALAXY_R * mThick * (metRand() + metRand() + metRand() - 1.5) * 0.82;
      var mlx = Math.cos(mAng) * mRad;
      var mlz = Math.sin(mAng) * mRad;
      var mdSq = (mlx - moxunGalX) * (mlx - moxunGalX) + (mlz - moxunGalZ) * (mlz - moxunGalZ);
      if (mdSq < 420 * 420) {
        mRad += 520;
        mlx = Math.cos(mAng) * mRad;
        mlz = Math.sin(mAng) * mRad;
      }
      metPos[mti * 3] = mlx;
      metPos[mti * 3 + 1] = mY;
      metPos[mti * 3 + 2] = mlz;
      metOrb[mti * 3] = mRad;
      metOrb[mti * 3 + 1] = mAng;
      metOrb[mti * 3 + 2] = mY;
      var rockTint = metRand();
      if (isCoreBelt) {
        // 内核受暖金光照亮的古铜/铁镍碎岩陨石群
        metCol[mti * 3] = lerp(0.72, 0.96, rockTint);
        metCol[mti * 3 + 1] = lerp(0.54, 0.74, rockTint);
        metCol[mti * 3 + 2] = lerp(0.38, 0.52, rockTint);
      } else if (mti % 3 === 0) {
        // 冰晶慧核碎屑（冷银青色微闪）
        metCol[mti * 3] = lerp(0.56, 0.78, rockTint);
        metCol[mti * 3 + 1] = lerp(0.68, 0.88, rockTint);
        metCol[mti * 3 + 2] = lerp(0.84, 0.98, rockTint);
      } else {
        // 硅酸盐/碳质小行星与陨石群（暖灰褐与星光照亮的岩石棱面）
        metCol[mti * 3] = lerp(0.46, 0.72, rockTint);
        metCol[mti * 3 + 1] = lerp(0.44, 0.64, rockTint);
        metCol[mti * 3 + 2] = lerp(0.48, 0.68, rockTint);
      }
      metSz[mti] = 1.65 + Math.pow(metRand(), 1.9) * 3.1;
      metSeed[mti] = metRand();
    }
    var metGeo = new THREE.BufferGeometry();
    metGeo.setAttribute("position", new THREE.Float32BufferAttribute(metPos, 3));
    metGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(metCol, 3));
    metGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(metSz, 1));
    metGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(metSeed, 1));
    metGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(metOrb, 3));
    var meteorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 0.021 },
        uCoreR: { value: coreR },
        uPixelRatio: { value: state.dpr },
        uSizeScale: { value: 3800.0 },
        uOpacity: { value: 0.78 },
        uDim: { value: 1.0 },
        uNearFade: { value: 1.0 }
      },
      vertexShader: GALAXY_METEOR_VERT,
      fragmentShader: GALAXY_METEOR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    var meteorPts = new THREE.Points(metGeo, meteorMat);
    meteorPts.frustumCulled = false;
    meteorPts.renderOrder = -1;
    galGroup.add(meteorPts);
    registerPoints(meteorPts, metCount);

    /* 3. 46,000+ 立体厚盘恒星海与 96 座真实 3D 星团（大幅加厚垂直分布，侧看如璀璨立体的三维星河） */
    var count = Math.max(14000, starBudget | 0);
    var positions = new Float32Array(count * 3);
    var colors = new Float32Array(count * 3);
    var sizes = new Float32Array(count);
    var orbits = new Float32Array(count * 3);
    var rand = rng(0x5fe42834);

    // 预生成 96 座立体疏散星团与球状星团中心，构成丰盈的 3D 太空集群层次
    var starClusters = [];
    for (var sci = 0; sci < 96; sci++) {
      var scIsGlob = (sci % 4 === 0);
      var scRN = scIsGlob ? (0.10 + Math.pow(rand(), 0.9) * 0.76) : (0.10 + Math.pow(rand(), 1.02) * 0.80);
      var scRad = smbhR * 2.0 + scRN * GRAND_GALAXY_R;
      var scArm = ((sci % 2) / 2) * Math.PI * 2;
      var scAng = scIsGlob
        ? (rand() * Math.PI * 2)
        : (scArm + Math.log(scRN + 0.058) * 4.20 + (rand() - 0.5) * 0.28);
      var scWarp = scIsGlob ? 0 : (Math.sin(scAng - 0.55) * Math.pow(scRN, 2.15) * GRAND_GALAXY_R * 0.036);
      var scY = scIsGlob
        ? (GRAND_GALAXY_R * 0.26 * (1.0 - scRN * 0.35) * (rand() + rand() - 1))
        : (scWarp + GRAND_GALAXY_R * (0.088 * (1.0 - scRN * 0.32)) * (rand() + rand() - 1));
      starClusters.push({
        rad: scRad,
        ang: scAng,
        y: scY,
        rNorm: scRN,
        spreadR: GRAND_GALAXY_R * (scIsGlob ? (0.016 + rand() * 0.018) : (0.018 + rand() * 0.024)),
        spreadY: GRAND_GALAXY_R * (scIsGlob ? (0.016 + rand() * 0.018) : (0.014 + rand() * 0.018)),
        isGlob: scIsGlob,
        warm: scIsGlob || (scRN < 0.26)
      });
    }

    for (var i = 0; i < count; i++) {
      var u = rand();
      var inCluster = (i % 6 === 0);
      var isGlobular = (!inCluster && (i % 8 === 0));
      var isThickDisk = (!inCluster && !isGlobular && (i % 3 !== 0));
      var isOBCluster = (!inCluster && !isGlobular && !isThickDisk && (i % 5 === 0));
      var rNorm, rad, ang, thickness;

      if (inCluster) {
        var cl = starClusters[i % starClusters.length];
        var crRand = Math.pow(rand(), 1.35);
        var ca1 = rand() * Math.PI * 2;
        var ca2 = Math.acos(rand() * 2 - 1);
        var offX = Math.sin(ca2) * Math.cos(ca1) * cl.spreadR * crRand;
        var offZ = Math.sin(ca2) * Math.sin(ca1) * cl.spreadR * crRand;
        var offY = Math.cos(ca2) * cl.spreadY * crRand;
        var cx = Math.cos(cl.ang) * cl.rad + offX;
        var cz = Math.sin(cl.ang) * cl.rad + offZ;
        rad = Math.max(smbhR * 1.45, Math.hypot(cx, cz));
        ang = Math.atan2(cz, cx);
        rNorm = clamp((rad - smbhR * 1.45) / GRAND_GALAXY_R, 0.02, 0.98);
        thickness = cl.y + offY;
      } else {
        rNorm = isGlobular ? Math.pow(u, 0.72) * 0.96 : Math.pow(u, 1.06) * 0.96;
        rad = smbhR * 1.38 + rNorm * GRAND_GALAXY_R;
        var useSpur = (i % 5 >= 3);
        var arms = useSpur ? 4 : 2;
        var armBase = ((i % arms) / arms) * Math.PI * 2;
        var logR = Math.log(rNorm + 0.058);
        var spiral = logR * 4.20;
        var spreadScale = isGlobular ? 1.95 : (isOBCluster ? (0.075 + rNorm * 0.14) : (0.16 + rNorm * 0.30));
        var spread = spreadScale * (rand() + rand() - 1);
        ang = armBase + spiral + spread;

        /* 银心恒星棒聚集（rNorm < 0.22 时自然收拢融入棒状核球） */
        if (!isGlobular && rNorm < 0.22 && (i % 3 !== 0)) {
          var barSide = (i % 2 === 0) ? 0 : Math.PI;
          ang = -0.38 + barSide + (rand() - 0.5) * 0.62;
        }

        /* 大幅加厚的真实 3D 垂直星辰包络：丰盈立体核球 + 厚盘星海 + 旋臂厚带 + 广袤球状银晕 */
        var thickEnv = isGlobular
          ? (0.33 * (1 - rNorm * 0.36))
          : (0.245 * Math.exp(-rNorm * 3.8) + (isThickDisk ? 0.112 : 0.056) * (1 - rNorm * 0.28));
        var warpY = isGlobular ? 0 : (Math.sin(ang - 0.55) * Math.pow(rNorm, 2.15) * GRAND_GALAXY_R * 0.036);
        thickness = warpY + GRAND_GALAXY_R * thickEnv * (rand() + rand() + rand() - 1.5) * 0.84;
      }

      var lx = Math.cos(ang) * rad;
      var lz = Math.sin(ang) * rad;
      var dMoxunSq = (lx - moxunGalX) * (lx - moxunGalX) + (lz - moxunGalZ) * (lz - moxunGalZ);
      if (dMoxunSq < 360 * 360) {
        rad += 440;
        lx = Math.cos(ang) * rad;
        lz = Math.sin(ang) * rad;
      }

      positions[i * 3] = lx;
      positions[i * 3 + 1] = thickness;
      positions[i * 3 + 2] = lz;

      orbits[i * 3] = rad;
      orbits[i * 3 + 1] = ang;
      orbits[i * 3 + 2] = thickness;

      var cr, cg, cb;
      if (rNorm < 0.22) {
        var kb = rNorm / 0.22;
        cr = lerp(1.00, 0.99, kb);
        cg = lerp(0.95, 0.79, kb);
        cb = lerp(0.84, 0.62, kb);
      } else if (rNorm < 0.48) {
        var km = (rNorm - 0.22) / 0.26;
        cr = lerp(0.96, 0.42, km);
        cg = lerp(0.76, 0.70, km);
        cb = lerp(0.70, 1.00, km);
      } else {
        var ko = (rNorm - 0.48) / 0.52;
        var isHii = (!isGlobular && (i % 16 === 0));
        var isOiii = (!isGlobular && !isHii && (i % 23 === 0));
        if (isHii) {
          cr = 0.98; cg = 0.44; cb = 0.72;
        } else if (isOiii) {
          cr = 0.30; cg = 0.88; cb = 1.00;
        } else {
          cr = lerp(0.36, 0.58, ko * 0.75);
          cg = lerp(0.66, 0.58, ko * 0.75);
          cb = 1.00;
        }
      }
      var br = isGlobular ? (0.46 + rand() * 0.44) : (0.62 + Math.pow(rand(), 1.25) * 0.52);
      colors[i * 3] = clamp(cr * br, 0, 1);
      colors[i * 3 + 1] = clamp(cg * br, 0, 1);
      colors[i * 3 + 2] = clamp(cb * br, 0, 1);

      sizes[i] = (rNorm < 0.16 ? 2.0 : 1.35) + Math.pow(rand(), 2.35) * ((isOBCluster || inCluster) ? 2.85 : 2.2);
    }

    var ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    ptsGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
    ptsGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    ptsGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(orbits, 3));

    var ptsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 0.018 },
        uCoreR: { value: coreR },
        uPixelRatio: { value: state.dpr },
        uSizeScale: { value: 3350.0 },
        uOpacity: { value: 0.93 },
        uDim: { value: 1.0 }
      },
      vertexShader: GRAND_GALAXY_STAR_VERT,
      fragmentShader: GRAND_GALAXY_STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var pts = new THREE.Points(ptsGeo, ptsMat);
    pts.frustumCulled = false;
    pts.renderOrder = -1;
    galGroup.add(pts);
    registerPoints(pts, count);

    /* 4. 仅限 2D 平面模式的超淡外缘天体测量刻度（3D 模式下完全隐藏，绝不在星系上画出僵硬的扁平圆环） */
    var gridSegs = [];
    function pushGalLine(x1, y1, z1, x2, y2, z2, r1, g1, b1, r2, g2, b2) {
      gridSegs.push(x1, y1, z1, x2, y2, z2, r1, g1, b1, r2, g2, b2);
    }
    var ringCfgs = [
      { r: moxunGalR, segs: 144, dash: true, col: [0.22, 0.84, 0.98], k: 0.36 },
      { r: GRAND_GALAXY_R * 0.95, segs: 180, dash: false, col: [0.34, 0.72, 0.96], k: 0.26 }
    ];
    for (var rci = 0; rci < ringCfgs.length; rci++) {
      var rc = ringCfgs[rci];
      for (var s = 0; s < rc.segs; s++) {
        if (rc.dash && (s % 2 === 1)) continue;
        var a0 = (s / rc.segs) * Math.PI * 2;
        var a1 = ((s + 1) / rc.segs) * Math.PI * 2;
        var cR = rc.col[0] * rc.k, cG = rc.col[1] * rc.k, cB = rc.col[2] * rc.k;
        pushGalLine(
          Math.cos(a0) * rc.r, 0, Math.sin(a0) * rc.r,
          Math.cos(a1) * rc.r, 0, Math.sin(a1) * rc.r,
          cR, cG, cB, cR, cG, cB
        );
      }
    }
    var outerRimR = GRAND_GALAXY_R * 0.95;
    for (var deg = 0; deg < 360; deg += 10) {
      var dRad = (deg * Math.PI) / 180;
      var tLen = (deg % 90 === 0) ? 420 : ((deg % 30 === 0) ? 240 : 110);
      var tk = (deg % 30 === 0) ? 0.38 : 0.18;
      pushGalLine(
        Math.cos(dRad) * (outerRimR - tLen * 0.5), 0, Math.sin(dRad) * (outerRimR - tLen * 0.5),
        Math.cos(dRad) * (outerRimR + tLen * 0.5), 0, Math.sin(dRad) * (outerRimR + tLen * 0.5),
        0.32 * tk, 0.82 * tk, 1.0 * tk, 0.32 * tk, 0.82 * tk, 1.0 * tk
      );
    }

    var gLineCount = gridSegs.length / 12;
    var gPosArr = new Float32Array(gLineCount * 6);
    var gColArr = new Float32Array(gLineCount * 6);
    for (var gli = 0; gli < gLineCount; gli++) {
      var srcOff = gli * 12, dstOff = gli * 6;
      for (var gp = 0; gp < 6; gp++) {
        gPosArr[dstOff + gp] = gridSegs[srcOff + gp];
        gColArr[dstOff + gp] = gridSegs[srcOff + 6 + gp];
      }
    }
    var galGridGeo = new THREE.BufferGeometry();
    galGridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gPosArr, 3));
    galGridGeo.setAttribute("color", new THREE.Float32BufferAttribute(gColArr, 3));
    var galGridMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var galGridLines = new THREE.LineSegments(galGridGeo, galGridMat);
    galGridLines.frustumCulled = false;
    galGridLines.renderOrder = -1;
    galGroup.add(galGridLines);

    /* 5. 3D 专属轻柔半透明星际极向等离子羽雾 + 漂浮电离星尘（彻底移除刺眼白柱与虚线环，自然消融于宇宙） */
    var polarJets3D = new THREE.Group();
    var jetConeMats = [];
    var jetH = GRAND_GALAXY_R * 0.25;
    for (var jDir = -1; jDir <= 1; jDir += 2) {
      var coneGeo = new THREE.CylinderGeometry(
        jDir > 0 ? GRAND_GALAXY_R * 0.056 : smbhR * 0.62,
        jDir > 0 ? smbhR * 0.62 : GRAND_GALAXY_R * 0.056,
        jetH,
        28,
        1,
        true
      );
      var coneMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uDim: { value: 1.0 }, uNearFade: { value: 1.0 }, uDir: { value: jDir } },
        vertexShader: AGN_JET_VERT,
        fragmentShader: AGN_JET_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      var coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.y = jDir * (smbhR * 0.72 + jetH * 0.5);
      coneMesh.frustumCulled = false;
      coneMesh.renderOrder = 0;
      polarJets3D.add(coneMesh);
      jetConeMats.push(coneMat);
    }

    // 极向漂浮电离微尘/柔雾星点（让极向流出物也由细腻星尘构成，与周围环境融为一体）
    var jdCount = state.degraded ? 400 : 900;
    var jdPos = new Float32Array(jdCount * 3);
    var jdCol = new Float32Array(jdCount * 3);
    var jdSz = new Float32Array(jdCount);
    var jdOrb = new Float32Array(jdCount * 3);
    var jdRand = rng(0x31a9f042);
    for (var jdi = 0; jdi < jdCount; jdi++) {
      var jSign = (jdi % 2 === 0) ? 1 : -1;
      var jFrac = Math.pow(jdRand(), 1.35);
      var jy = jSign * (smbhR * 1.25 + jFrac * jetH * 1.05);
      var jSpread = (smbhR * 0.55 + jFrac * GRAND_GALAXY_R * 0.052) * Math.pow(jdRand(), 0.65);
      var jAng = jdRand() * Math.PI * 2;
      jdPos[jdi * 3] = Math.cos(jAng) * jSpread;
      jdPos[jdi * 3 + 1] = jy;
      jdPos[jdi * 3 + 2] = Math.sin(jAng) * jSpread;
      jdOrb[jdi * 3] = jSpread;
      jdOrb[jdi * 3 + 1] = jAng;
      jdOrb[jdi * 3 + 2] = jy;
      var jFade = (1.0 - jFrac) * (0.45 + jdRand() * 0.55);
      jdCol[jdi * 3] = lerp(0.95, 0.52, jFrac) * jFade;
      jdCol[jdi * 3 + 1] = lerp(0.78, 0.64, jFrac) * jFade;
      jdCol[jdi * 3 + 2] = lerp(0.58, 0.96, jFrac) * jFade;
      jdSz[jdi] = 1.25 + Math.pow(jdRand(), 2.0) * 2.1;
    }
    var jdGeo = new THREE.BufferGeometry();
    jdGeo.setAttribute("position", new THREE.Float32BufferAttribute(jdPos, 3));
    jdGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(jdCol, 3));
    jdGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(jdSz, 1));
    jdGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(jdOrb, 3));
    var jetDustMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 0.16 },
        uCoreR: { value: smbhR * 2.5 },
        uPixelRatio: { value: state.dpr },
        uSizeScale: { value: 3200.0 },
        uOpacity: { value: 0.62 },
        uDim: { value: 1.0 }
      },
      vertexShader: GRAND_GALAXY_STAR_VERT,
      fragmentShader: GRAND_GALAXY_STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var jetDustPts = new THREE.Points(jdGeo, jetDustMat);
    jetDustPts.frustumCulled = false;
    jetDustPts.renderOrder = 0;
    polarJets3D.add(jetDustPts);
    registerPoints(jetDustPts, jdCount);
    galGroup.add(polarJets3D);

    /* 6. 两座高清晰伴矮椭圆星系（M110 / M32：采用共面着色器圆盘 + 锐利星团，零模糊贴图且支持 2D 完全共面） */
    var companions = [];
    [
      { lx: 1850, ly: -520, lz: 8900, span: 3600, rotY: -0.42, haloCol: 0x93c5fd, coreCol: 0xfff8eb, stars: 1500, spread: 1420 },
      { lx: -4600, ly: 380, lz: -5600, span: 1850, rotY: 0.35, haloCol: 0xfde68a, coreCol: 0xffffff, stars: 900, spread: 640 }
    ].forEach(function (dw, dIdx) {
      var dwGroup = new THREE.Group();
      dwGroup.position.set(dw.lx, dw.ly, dw.lz);
      galGroup.add(dwGroup);

      var compMat = new THREE.ShaderMaterial({
        uniforms: {
          uRadius: { value: dw.span * 0.5 },
          uFlat2D: { value: 1.0 },
          uWarpAmp: { value: 0.0 },
          uCoreCol: { value: new THREE.Color(dw.coreCol) },
          uHaloCol: { value: new THREE.Color(dw.haloCol) },
          uDim: { value: 1.0 },
          uNearFade: { value: 1.0 }
        },
        vertexShader: GRAND_GALAXY_VERT,
        fragmentShader: COMPANION_GALAXY_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      var compMesh = new THREE.Mesh(new THREE.PlaneGeometry(dw.span, dw.span), compMat);
      compMesh.rotation.x = -Math.PI * 0.5;
      compMesh.rotation.z = dw.rotY;
      compMesh.frustumCulled = false;
      compMesh.renderOrder = -3;
      dwGroup.add(compMesh);

      var dc = dw.stars;
      var dp = new Float32Array(dc * 3);
      var dcol = new Float32Array(dc * 3);
      var dsz = new Float32Array(dc);
      var dorb = new Float32Array(dc * 3);
      var dr = rng(0x9101 + dIdx * 773);
      for (var k = 0; k < dc; k++) {
        var rr = Math.pow(dr(), 1.75) * dw.spread;
        var a1 = dr() * Math.PI * 2;
        var a2 = Math.acos(dr() * 2 - 1);
        dp[k * 3] = Math.sin(a2) * Math.cos(a1) * rr * 1.28;
        dp[k * 3 + 1] = Math.cos(a2) * rr * 0.45;
        dp[k * 3 + 2] = Math.sin(a2) * Math.sin(a1) * rr * 0.78;
        var b = 0.52 + dr() * 0.48;
        dcol[k * 3] = 0.88 * b; dcol[k * 3 + 1] = 0.92 * b; dcol[k * 3 + 2] = 1.0 * b;
        dsz[k] = 1.2 + Math.pow(dr(), 2.2) * 1.8;
      }
      var dGeo = new THREE.BufferGeometry();
      dGeo.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
      dGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(dcol, 3));
      dGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(dsz, 1));
      dGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(dorb, 3));
      var dPts = new THREE.Points(dGeo, new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uSpin: { value: 0 }, uCoreR: { value: 0 },
          uPixelRatio: { value: state.dpr }, uSizeScale: { value: 3100.0 },
          uOpacity: { value: 0.86 }, uDim: { value: 1.0 }
        },
        vertexShader: GRAND_GALAXY_STAR_VERT,
        fragmentShader: GRAND_GALAXY_STAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      dPts.frustumCulled = false;
      dPts.renderOrder = -2;
      dwGroup.add(dPts);
      registerPoints(dPts, dc);
      companions.push({ group: dwGroup, mat: compMat, ly3D: dw.ly });
    });

    /* 注册多恒星（朋友）世界架构：当前仅「陌浔」一颗激活恒星系在线，预留朋友恒星扩展接口 */
    state.stellarSystems = [
      { id: "moxun", name: SUN_NAME, isSelf: true, worldPos: new THREE.Vector3(0, 0, 0) }
    ];
    if (state.rawModel && Array.isArray(state.rawModel.friends)) {
      state.rawModel.friends.forEach(function (fr, fi) {
        if (!fr || !fr.name) return;
        var fAng = 1.85 + fi * 1.35;
        var fRad = GRAND_GALAXY_R * (0.32 + (fi % 3) * 0.14);
        var fPos = center3D.clone()
          .addScaledVector(axisX, Math.cos(fAng) * fRad)
          .addScaledVector(axisZ, Math.sin(fAng) * fRad);
        state.stellarSystems.push({ id: fr.id || ("friend-" + fi), name: fr.name, isSelf: false, worldPos: fPos });
      });
    }

    state.grandGalaxy = {
      group: galGroup,
      diskMesh: diskMesh,
      diskMat: diskMat,
      core3DGroup: core3DGroup,
      bulgeVolMat: bulgeVolMat,
      smbhMat: smbhMat,
      smbhLensMat: smbhLensMat,
      smbhLensMesh: smbhLensMesh,
      accMat: accMat,
      accDiskMesh: accDiskMesh,
      ncMat: ncMat,
      nebulaMat: nebulaMat,
      dustMat: dustMat,
      meteorMat: meteorMat,
      pts: pts,
      ptsMat: ptsMat,
      bulgeInner: bulgeInner,
      bulgeOuter: bulgeOuter,
      galGridLines: galGridLines,
      galGridMat: galGridMat,
      polarJets3D: polarJets3D,
      jetConeMats: jetConeMats,
      jetDustMat: jetDustMat,
      companions: companions,
      center3D: center3D,
      center2D: center2D,
      quat3D: quat3D,
      quat2D: quat2D,
      axisX: axisX,
      axisY: axisY,
      axisZ: axisZ,
      tmpQuat: new THREE.Quaternion()
    };
    syncGalaxyDimensionMode();
  }

  /* ---------- 「陌浔」恒星区域唯一爱因斯坦-罗森星际虫洞（跨恒星朋友通行门户） ---------- */

  function createStellarWormhole(THREE, sharedGeos) {
    var whGroup = new THREE.Group();
    state.root.add(whGroup);

    var throatMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1.0 }, uBoost: { value: 0.0 } },
      vertexShader: WORMHOLE_THROAT_VERT,
      fragmentShader: WORMHOLE_THROAT_FRAG
    });
    var throatMesh = new THREE.Mesh(sharedGeos.highSphere, throatMat);
    throatMesh.scale.setScalar(WORMHOLE_RADIUS);
    throatMesh.renderOrder = 6;
    whGroup.add(throatMesh);

    var funnelGroup = new THREE.Group();
    funnelGroup.rotation.x = Math.PI * 0.36;
    funnelGroup.rotation.z = -0.28;
    whGroup.add(funnelGroup);

    var innerR = WORMHOLE_RADIUS * 1.06;
    var outerR = WORMHOLE_RADIUS * 3.15;
    var funnelMat = new THREE.ShaderMaterial({
      uniforms: {
        uInnerR: { value: innerR },
        uOuterR: { value: outerR },
        uTime: { value: 0 },
        uDim: { value: 1.0 },
        uBoost: { value: 0.0 }
      },
      vertexShader: WORMHOLE_FUNNEL_VERT,
      fragmentShader: WORMHOLE_FUNNEL_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var funnelMesh = new THREE.Mesh(new THREE.RingGeometry(innerR, outerR, 88, 16), funnelMat);
    funnelMesh.renderOrder = 7;
    funnelGroup.add(funnelMesh);

    /* 三轴反向旋转硬科幻磁约束陀螺环 */
    var gimbals = [];
    [
      { r: WORMHOLE_RADIUS * 1.34, tube: 1.15, col: 0x22d3ee, rx: 0.45, ry: 0.0, sx: 0.42, sy: 0.68, sz: 0.15 },
      { r: WORMHOLE_RADIUS * 1.56, tube: 1.00, col: 0x818cf8, rx: -0.62, ry: 0.8, sx: -0.31, sy: 0.24, sz: 0.56 },
      { r: WORMHOLE_RADIUS * 1.78, tube: 0.85, col: 0xbae6fd, rx: 1.12, ry: -0.5, sx: 0.18, sy: -0.48, sz: -0.34 }
    ].forEach(function (gCfg) {
      var gMat = new THREE.MeshBasicMaterial({
        color: gCfg.col,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      var gMesh = new THREE.Mesh(new THREE.TorusGeometry(gCfg.r, gCfg.tube, 8, 64), gMat);
      gMesh.rotation.x = gCfg.rx;
      gMesh.rotation.y = gCfg.ry;
      whGroup.add(gMesh);
      gimbals.push({ mesh: gMesh, mat: gMat, sx: gCfg.sx, sy: gCfg.sy, sz: gCfg.sz });
    });

    var haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.texCache.lensRing,
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    haloSprite.scale.set(WORMHOLE_RADIUS * 3.85, WORMHOLE_RADIUS * 3.85, 1);
    whGroup.add(haloSprite);

    /* 连接「陌浔」恒星外环与虫洞入口的科技感测地航道引导线 */
    var corrSegs = 28;
    var corrPos = new Float32Array(corrSegs * 6);
    var corrCol = new Float32Array(corrSegs * 6);
    for (var ci = 0; ci < corrSegs; ci++) {
      var kFade = 0.25 + 0.75 * (ci / corrSegs);
      corrCol[ci * 6] = 0.14 * kFade; corrCol[ci * 6 + 1] = 0.82 * kFade; corrCol[ci * 6 + 2] = 0.98 * kFade;
      corrCol[ci * 6 + 3] = 0.38 * kFade; corrCol[ci * 6 + 4] = 0.62 * kFade; corrCol[ci * 6 + 5] = 1.00 * kFade;
    }
    var corrGeo = new THREE.BufferGeometry();
    corrGeo.setAttribute("position", new THREE.Float32BufferAttribute(corrPos, 3));
    corrGeo.setAttribute("color", new THREE.Float32BufferAttribute(corrCol, 3));
    var corrLine = new THREE.LineSegments(corrGeo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    corrLine.frustumCulled = false;
    state.root.add(corrLine);

    var whBasis = buildOrbitBasis(THREE, 0.14, -0.52, 0.28);
    var whWorld = new THREE.Vector3();
    evalKeplerOrbit(5.58, 1240, 0.03, whBasis.u, whBasis.v, whWorld);
    whGroup.position.copy(whWorld);

    state.wormhole = {
      group: whGroup,
      throatMesh: throatMesh,
      throatMat: throatMat,
      funnelMesh: funnelMesh,
      funnelMat: funnelMat,
      gimbals: gimbals,
      haloSprite: haloSprite,
      corrLine: corrLine,
      corrSegs: corrSegs,
      worldPos: whWorld,
      base: WORMHOLE_RADIUS,
      a: 1240,
      e: 0.03,
      M0: 5.58,
      omega: (Math.PI * 2) / 190.0,
      basis: whBasis
    };
  }

  function updateGrandGalaxyAndWormhole(t, simDt, focusDim) {
    var gg = state.grandGalaxy;
    if (gg) {
      if (simDt > 0) {
        gg.diskMesh.rotation.z += simDt * 0.012;
      }
      gg.diskMat.uniforms.uTime.value = t;
      gg.diskMat.uniforms.uDim.value = focusDim;
      var nearFade = lerp(0.56, 1.0, smoothstepJS(1600, 5600, state.radius));
      gg.diskMat.uniforms.uNearFade.value = nearFade;
      if (gg.bulgeVolMat) {
        gg.bulgeVolMat.uniforms.uTime.value = t;
        gg.bulgeVolMat.uniforms.uDim.value = focusDim;
        gg.bulgeVolMat.uniforms.uNearFade.value = nearFade;
      }
      if (gg.smbhMat) {
        gg.smbhMat.uniforms.uTime.value = t;
        gg.smbhMat.uniforms.uDim.value = focusDim;
        gg.smbhMat.uniforms.uNearFade.value = nearFade;
      }
      if (gg.smbhLensMat && gg.smbhLensMesh && !state.envOnly && state.camera) {
        gg.smbhLensMat.uniforms.uTime.value = t;
        gg.smbhLensMat.uniforms.uDim.value = focusDim;
        gg.smbhLensMat.uniforms.uNearFade.value = nearFade;
        gg.tmpQuat.copy(gg.group.quaternion).invert().multiply(state.camera.quaternion);
        gg.smbhLensMesh.quaternion.copy(gg.tmpQuat);
      }
      if (gg.accMat) {
        gg.accMat.uniforms.uTime.value = t;
        gg.accMat.uniforms.uDim.value = focusDim;
        gg.accMat.uniforms.uNearFade.value = nearFade;
      }
      if (gg.ncMat) {
        gg.ncMat.uniforms.uTime.value = t;
        gg.ncMat.uniforms.uDim.value = focusDim;
      }
      if (gg.nebulaMat) {
        gg.nebulaMat.uniforms.uTime.value = t;
        gg.nebulaMat.uniforms.uDim.value = focusDim;
        gg.nebulaMat.uniforms.uNearFade.value = nearFade;
      }
      if (gg.dustMat) {
        gg.dustMat.uniforms.uTime.value = t;
        gg.dustMat.uniforms.uDim.value = focusDim;
        gg.dustMat.uniforms.uNearFade.value = nearFade;
      }
      if (gg.meteorMat) {
        gg.meteorMat.uniforms.uTime.value = t;
        gg.meteorMat.uniforms.uDim.value = focusDim;
        gg.meteorMat.uniforms.uNearFade.value = nearFade;
      }
      gg.ptsMat.uniforms.uTime.value = t;
      gg.ptsMat.uniforms.uDim.value = focusDim;
      var bPulse = state.reduced ? 1.0 : (1.0 + 0.03 * Math.sin(t * 0.85));
      gg.bulgeInner.material.opacity = (state.envOnly ? 0.26 : 0.34) * nearFade * bPulse * focusDim;
      gg.bulgeOuter.material.opacity = (state.envOnly ? 0.18 : 0.22) * nearFade * focusDim;
      var galGridFade = smoothstepJS(5600, 12600, state.radius);
      if (gg.galGridMat) {
        gg.galGridMat.opacity = (state.envOnly ? 0.22 : 0.0) * galGridFade * focusDim;
      }
      if (gg.jetConeMats && !state.envOnly) {
        for (var jci = 0; jci < gg.jetConeMats.length; jci++) {
          gg.jetConeMats[jci].uniforms.uTime.value = t;
          gg.jetConeMats[jci].uniforms.uDim.value = focusDim;
          gg.jetConeMats[jci].uniforms.uNearFade.value = nearFade;
        }
      }
      if (gg.jetDustMat && !state.envOnly) {
        gg.jetDustMat.uniforms.uTime.value = t;
        gg.jetDustMat.uniforms.uDim.value = focusDim;
      }
      if (gg.companions) {
        for (var ci0 = 0; ci0 < gg.companions.length; ci0++) {
          gg.companions[ci0].mat.uniforms.uDim.value = focusDim;
          gg.companions[ci0].mat.uniforms.uNearFade.value = nearFade;
        }
      }
    }

    if (state.hudLines) {
      var hudFade = 1.0 - smoothstepJS(4200, 8200, state.radius);
      state.hudLines.material.opacity = 0.28 * hudFade * focusDim;
    }

    var wh = state.wormhole;
    if (wh) {
      var isWhFocus = state.focusedSpecial === "wormhole";
      var isWhHover = state.hoveredSpecial === "wormhole";
      var boost = isWhFocus ? 1.0 : (isWhHover ? 0.55 : 0.0);
      wh.throatMat.uniforms.uTime.value = t;
      wh.throatMat.uniforms.uDim.value = focusDim;
      wh.throatMat.uniforms.uBoost.value = boost;
      wh.funnelMat.uniforms.uTime.value = t;
      wh.funnelMat.uniforms.uDim.value = focusDim;
      wh.funnelMat.uniforms.uBoost.value = boost;
      wh.haloSprite.material.opacity = (0.48 + boost * 0.28 + (state.reduced ? 0 : 0.06 * Math.sin(t * 2.4))) * focusDim;
      for (var gi = 0; gi < wh.gimbals.length; gi++) {
        var g = wh.gimbals[gi];
        if (simDt > 0) {
          g.mesh.rotation.x += simDt * g.sx;
          g.mesh.rotation.y += simDt * g.sy;
          g.mesh.rotation.z += simDt * g.sz;
        }
        g.mat.opacity = (0.46 + boost * 0.34) * focusDim;
      }

      /* 更新恒星外环至虫洞的脉冲虚线测地航道 */
      var cAttr = wh.corrLine.geometry.getAttribute("position");
      var cArr = cAttr.array;
      var wx = wh.worldPos.x, wy = wh.worldPos.y, wz = wh.worldPos.z;
      var wLen = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
      var ux = wx / wLen, uy = wy / wLen, uz = wz / wLen;
      var rStart = SUN_RADIUS * 2.15;
      var rEnd = Math.max(rStart + 60, wLen - WORMHOLE_RADIUS * 2.35);
      var span = rEnd - rStart;
      var dashShift = state.reduced ? 0 : ((t * 0.38) % 1.0);
      for (var ci = 0; ci < wh.corrSegs; ci++) {
        var f0 = ((ci + dashShift) / wh.corrSegs) % 1.0;
        var f1 = Math.min(1.0, f0 + 0.52 / wh.corrSegs);
        var d0 = rStart + span * f0;
        var d1 = rStart + span * f1;
        cArr[ci * 6] = ux * d0; cArr[ci * 6 + 1] = uy * d0; cArr[ci * 6 + 2] = uz * d0;
        cArr[ci * 6 + 3] = ux * d1; cArr[ci * 6 + 4] = uy * d1; cArr[ci * 6 + 5] = uz * d1;
      }
      cAttr.needsUpdate = true;
      wh.corrLine.material.opacity = (isWhFocus || isWhHover ? 0.68 : 0.30) * focusDim;
    }
  }

  function registerPoints(pts, fullCount) {
    pts.userData.fullCount = fullCount;
    if (state.degraded) {
      pts.geometry.setDrawRange(0, Math.max(1, Math.floor(fullCount * 0.5)));
    }
    state.pointSystems.push(pts);
  }

  function setupCosmicBackground(THREE, deepStarBudget) {
    var bgGroup = new THREE.Group(); state.scene.add(bgGroup); state.bgGroup = bgGroup;

    var skyDomeMat = new THREE.ShaderMaterial({
      uniforms: { uMilkyTex: { value: state.texCache.milky }, uTime: { value: 0 } },
      vertexShader: SKYDOME_VERT,
      fragmentShader: SKYDOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false
    });
    var skyDome = new THREE.Mesh(new THREE.SphereGeometry(52000, 48, 32), skyDomeMat);
    skyDome.frustumCulled = false; skyDome.renderOrder = -10; bgGroup.add(skyDome);
    state.skyDomeMat = skyDomeMat;

    var nebRand = rng(0x31415926);
    for (var ni = 0; ni < 12; ni++) {
      var isSmoke = ni < 7;
      var tex = isSmoke ? state.texCache.darkDust : state.texCache.nebulae[(ni - 7) % state.texCache.nebulae.length];
      var dist = isSmoke ? (18500 + nebRand() * 5500) : (22000 + nebRand() * 6800);
      var az = (ni / 12) * Math.PI * 2 + nebRand() * 0.55;
      var el = (nebRand() - 0.5) * (isSmoke ? 0.72 : 1.05);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: isSmoke ? 0.46 : (0.11 + nebRand() * 0.06),
        depthWrite: false,
        blending: isSmoke ? THREE.NormalBlending : THREE.AdditiveBlending
      }));
      sp.position.set(
        Math.cos(el) * Math.cos(az) * dist,
        Math.sin(el) * dist + (nebRand() - 0.5) * 1600,
        Math.cos(el) * Math.sin(az) * dist
      );
      var sc = isSmoke ? (11000 + nebRand() * 4800) : (9400 + nebRand() * 4200);
      sp.scale.set(sc * 1.45, sc * 0.86, 1);
      sp.renderOrder = -9;
      bgGroup.add(sp);
    }

    var dgRand = rng(0x16180339);
    for (var gi = 0; gi < 18; gi++) {
      var gAz = dgRand() * Math.PI * 2; var gEl = Math.asin(dgRand() * 1.78 - 0.89);
      var gDist = 29000 + dgRand() * 9000; var isSp = gi % 3 !== 0;
      var dgSp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: isSp ? state.texCache.distantSpiral : state.texCache.distantEllip,
        color: isSp ? 0xdbeafe : 0xfef3c7,
        transparent: true,
        opacity: 0.36 + dgRand() * 0.28,
        rotation: dgRand() * Math.PI * 2,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      dgSp.position.set(
        Math.cos(gEl) * Math.cos(gAz) * gDist,
        Math.sin(gEl) * gDist,
        Math.cos(gEl) * Math.sin(gAz) * gDist
      );
      var gSize = 360 + dgRand() * 440;
      dgSp.scale.set(gSize, gSize, 1);
      dgSp.renderOrder = -8;
      bgGroup.add(dgSp);
    }

    /* 多光谱深空摄影星场：密集白/蓝/金针尖背景星 + 明亮宝蓝/暖橙前景星（复刻参考图1与图2丰富星场） */
    var sCount = Math.max(3000, deepStarBudget | 0);
    var sPos = new Float32Array(sCount * 3);
    var sCol = new Float32Array(sCount * 3);
    var sSize = new Float32Array(sCount);
    var sOrb = new Float32Array(sCount * 3);
    var sr = rng(0x80f041ec);

    for (var i = 0; i < sCount; i++) {
      var inBand = (i % 5 < 3);
      var theta = sr() * Math.PI * 2;
      var lat = inBand ? ((sr() + sr() + sr() - 1.5) * 0.42) : Math.asin(sr() * 2 - 1);
      var rad = 22000 + sr() * 18000;
      var x = Math.cos(lat) * Math.cos(theta) * rad;
      var y = Math.sin(lat) * rad;
      var z = Math.cos(lat) * Math.sin(theta) * rad;
      var cz = Math.cos(0.54), sz = Math.sin(0.54);
      sPos[i * 3] = x * cz - y * sz;
      sPos[i * 3 + 1] = x * sz + y * cz;
      sPos[i * 3 + 2] = z;

      var specRoll = sr();
      var rC, gC, bC;
      if (specRoll < 0.24) {
        /* 宝蓝 / 电光蓝高温 O-B 星 */
        rC = 0.42 + sr() * 0.22; gC = 0.68 + sr() * 0.20; bC = 1.00;
      } else if (specRoll < 0.42) {
        /* 暖琥珀 / 橙金 K-M 巨星 */
        rC = 1.00; gC = 0.66 + sr() * 0.22; bC = 0.36 + sr() * 0.22;
      } else {
        var kv = kelvinToRGB(4400 + Math.pow(sr(), 0.85) * 6800);
        rC = kv[0]; gC = kv[1]; bC = kv[2];
      }
      var isBrightFg = (i % 48 === 0);
      var br = isBrightFg ? 1.15 : (0.62 + sr() * 0.55);
      sCol[i * 3] = clamp(rC * br, 0, 1);
      sCol[i * 3 + 1] = clamp(gC * br, 0, 1);
      sCol[i * 3 + 2] = clamp(bC * br, 0, 1);
      sSize[i] = isBrightFg ? (9.5 + sr() * 7.2) : (2.2 + Math.pow(sr(), 2.1) * 5.8);
    }

    var sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.Float32BufferAttribute(sPos, 3));
    sGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(sCol, 3));
    sGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(sSize, 1));
    sGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(sOrb, 3));
    var sPts = new THREE.Points(sGeo, new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSpin: { value: 0 }, uCoreR: { value: 0 },
        uPixelRatio: { value: state.dpr }, uSizeScale: { value: 24500.0 },
        uOpacity: { value: 0.98 }, uDim: { value: 1.0 }
      },
      vertexShader: GALAXY_PTS_VERT,
      fragmentShader: GALAXY_PTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    sPts.frustumCulled = false;
    sPts.renderOrder = -7;
    bgGroup.add(sPts);
    registerPoints(sPts, sCount);

    /* 前景明亮深空星芒光晕（复刻参考图2中散落的亮蓝色与金橙色前景亮星） */
    var fgRand = rng(0x20261125);
    for (var fgi = 0; fgi < 54; fgi++) {
      var fAz = fgRand() * Math.PI * 2;
      var fEl = Math.asin(fgRand() * 1.88 - 0.94);
      var fDist = 23000 + fgRand() * 8500;
      var isSapphire = (fgi % 4 !== 0);
      var fgSp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.texCache.corona,
        color: isSapphire ? (fgi % 2 === 0 ? 0x5299ff : 0x93c5fd) : 0xfb923c,
        transparent: true,
        opacity: 0.72 + fgRand() * 0.26,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      fgSp.position.set(
        Math.cos(fEl) * Math.cos(fAz) * fDist,
        Math.sin(fEl) * fDist,
        Math.cos(fEl) * Math.sin(fAz) * fDist
      );
      var fgScale = 560 + fgRand() * 560;
      fgSp.scale.set(fgScale, fgScale, 1);
      fgSp.renderOrder = -6;
      bgGroup.add(fgSp);
    }

    state.pulsars = [];
    [
      { pos: [-14500, 5200, -11800], spin: 1.85, tilt: 0.68, color: 0xbae6fd },
      { pos: [15200, -4800, -10800], spin: -1.42, tilt: 0.58, color: 0xfde68a }
    ].forEach(function (cfg) {
      var pRoot = new THREE.Group(); pRoot.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      pRoot.rotation.z = 0.35; bgGroup.add(pRoot);

      pRoot.add(new THREE.Mesh(
        new THREE.SphereGeometry(28, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      ));

      var halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.texCache.corona,
        color: cfg.color,
        transparent: true,
        opacity: 0.54,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      halo.scale.set(420, 420, 1); pRoot.add(halo);

      var spinPivot = new THREE.Group(); pRoot.add(spinPivot); var magAxis = new THREE.Group();
      magAxis.rotation.x = cfg.tilt; spinPivot.add(magAxis);

      var beamLen = 2400, beamW = 220;
      var beamMat = new THREE.MeshBasicMaterial({
        map: state.texCache.pulsarBeam, color: cfg.color, transparent: true, opacity: 0.14,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
      });
      [-1, 1].forEach(function (dir) {
        for (var cr = 0; cr < 2; cr++) {
          var plane = new THREE.Mesh(new THREE.PlaneGeometry(beamW, beamLen), beamMat);
          plane.position.y = dir * (beamLen * 0.5 + 28);
          if (dir < 0) plane.rotation.z = Math.PI;
          plane.rotation.y = cr * (Math.PI * 0.5); magAxis.add(plane);
        }
      });

      state.pulsars.push({ pivot: spinPivot, halo: halo, spin: cfg.spin });
    });
  }

  /* 装配日心硬科幻宇宙元素：3D 小行星带、近景尘埃反光、双尾彗星、微流星体、HUD 方位标尺环、导航信标、空间站与废弃探测器 */
  function setupHardSciFiElements(THREE, dustBudget) {
    var rockMat = new THREE.ShaderMaterial({
      uniforms: { uSunPosV: { value: new THREE.Vector3(0, 0, 0) }, uDim: { value: 1.0 }, uSpec: { value: 0.14 } },
      vertexShader: ROCK_VERT,
      fragmentShader: ROCK_FRAG
    });
    state.rockSharedMat = rockMat;

    var beltGeo = buildBatchedAsteroidBeltGeometry(THREE, 220, 490, 635, 0x20261125);
    var beltMesh = new THREE.Mesh(beltGeo, rockMat); beltMesh.rotation.x = 0.12;
    beltMesh.rotation.z = -0.09; state.root.add(beltMesh); state.asteroidBelt = beltMesh;

    state.flybyRocks = [];
    for (var fi = 0; fi < 2; fi++) {
      var fr = rng(0x88442211 + fi * 97);
      var fGeo = buildIrregularBodyGeometry(THREE, 12, 8, 9101 + fi * 313, 0.42, [1.34, 0.74, 0.92]);
      var vCount = fGeo.getAttribute("position").count; var fCol = new Float32Array(vCount * 3);
      for (var vc = 0; vc < vCount; vc++) {
        fCol[vc * 3] = 0.48; fCol[vc * 3 + 1] = 0.45; fCol[vc * 3 + 2] = 0.42;
      }
      fGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(fCol, 3));
      var fMesh = new THREE.Mesh(fGeo, rockMat); var fScale = 7.5 + fi * 3.2; fMesh.scale.setScalar(fScale);
      state.root.add(fMesh);
      state.flybyRocks.push({
        mesh: fMesh,
        a: 820 + fi * 460,
        e: 0.42,
        M0: fi * 3.1 + 0.8,
        omega: (Math.PI * 2) / (26 + fi * 11),
        basis: buildOrbitBasis(THREE, (0.38 + fr() * 0.4) * (fi === 0 ? 1 : -1), fr() * 6.28, fr() * 6.28),
        spinX: 0.55 + fr() * 0.4,
        spinY: 0.72 + fr() * 0.5
      });
    }

    var dCount = Math.max(120, dustBudget | 0); var dPos = new Float32Array(dCount * 3);
    var dCol = new Float32Array(dCount * 3); var dSize = new Float32Array(dCount);
    var dOrb = new Float32Array(dCount * 3); var dr = rng(0x55aa7733);
    for (var di = 0; di < dCount; di++) {
      var dRad = 320 + dr() * 2100; var dAng = dr() * Math.PI * 2; var dY = (dr() + dr() - 1) * 580;
      dPos[di * 3] = Math.cos(dAng) * dRad; dPos[di * 3 + 1] = dY; dPos[di * 3 + 2] = Math.sin(dAng) * dRad;
      dOrb[di * 3] = dRad; dOrb[di * 3 + 1] = dAng; dOrb[di * 3 + 2] = dY; var glint = 0.58 + dr() * 0.42;
      dCol[di * 3] = 1.0 * glint; dCol[di * 3 + 1] = 0.94 * glint; dCol[di * 3 + 2] = 0.80 * glint;
      dSize[di] = 1.2 + dr() * 2.1;
    }
    var dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dPos, 3));
    dustGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(dCol, 3));
    dustGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(dSize, 1));
    dustGeo.setAttribute("aOrbit", new THREE.Float32BufferAttribute(dOrb, 3));
    var dustPts = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSpin: { value: 0.045 }, uCoreR: { value: 300 },
        uPixelRatio: { value: state.dpr }, uSizeScale: { value: 980.0 },
        uOpacity: { value: 0.56 }, uDim: { value: 1.0 }
      },
      vertexShader: GALAXY_PTS_VERT,
      fragmentShader: GALAXY_PTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    dustPts.frustumCulled = false; state.root.add(dustPts); registerPoints(dustPts, dCount);

    var hudVerts = []; var hudCols = [];
    function pushSeg(x1, y1, z1, x2, y2, z2, r, g, b) {
      hudVerts.push(x1, y1, z1, x2, y2, z2); hudCols.push(r, g, b, r, g, b);
    }
    var ringRadii = [305, 735, 1240, 1520, 1556];
    for (var ri = 0; ri < ringRadii.length; ri++) {
      var hr = ringRadii[ri]; var segs = ri < 2 ? 96 : 144;
      var cInt = ri === 3 ? 0.38 : (ri === 2 ? 0.28 : 0.18);
      for (var si = 0; si < segs; si++) {
        if ((ri === 0 || ri === 4) && si % 3 === 0) continue;
        var a0 = (si / segs) * Math.PI * 2; var a1 = ((si + 1) / segs) * Math.PI * 2;
        pushSeg(
          Math.cos(a0) * hr, 0, Math.sin(a0) * hr,
          Math.cos(a1) * hr, 0, Math.sin(a1) * hr,
          0.22 * cInt, 0.80 * cInt, 1.00 * cInt
        );
      }
    }
    for (var deg = 0; deg < 360; deg += 5) {
      var radA = (deg * Math.PI) / 180; var isCard = (deg % 90 === 0); var isMajor = (deg % 30 === 0);
      var rIn = isCard ? 1470 : (isMajor ? 1496 : 1510); var rOut = isCard ? 1600 : (isMajor ? 1572 : 1538);
      var kBr = isCard ? 0.68 : (isMajor ? 0.40 : 0.22);
      pushSeg(
        Math.cos(radA) * rIn, 0, Math.sin(radA) * rIn,
        Math.cos(radA) * rOut, 0, Math.sin(radA) * rOut,
        (isCard ? 0.96 : 0.28) * kBr, (isCard ? 0.84 : 0.82) * kBr, (isCard ? 0.46 : 1.00) * kBr
      );
    }
    var hudGeo = new THREE.BufferGeometry();
    hudGeo.setAttribute("position", new THREE.Float32BufferAttribute(hudVerts, 3));
    hudGeo.setAttribute("color", new THREE.Float32BufferAttribute(hudCols, 3));
    var hudLines = new THREE.LineSegments(hudGeo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    hudLines.rotation.x = 0.06; hudLines.rotation.z = -0.04; state.root.add(hudLines);
    state.hudLines = hudLines;

    state.beacons = [];
    [
      { az: 0.42, r: 1940, y: 120, col: 0x38bdf8, phase: 0.0 },
      { az: 2.54, r: 2020, y: -145, col: 0xfbbf24, phase: 2.1 },
      { az: 4.68, r: 1890, y: 95, col: 0x2dd4bf, phase: 4.2 }
    ].forEach(function (bc) {
      var bGroup = new THREE.Group();
      bGroup.position.set(Math.cos(bc.az) * bc.r, bc.y, Math.sin(bc.az) * bc.r);
      state.root.add(bGroup);

      var mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 16, 6, 1, false),
        new THREE.MeshBasicMaterial({ color: 0x64748b })
      ); bGroup.add(mast);

      var strobe = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.texCache.corona,
        color: bc.col,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      strobe.position.y = 9; strobe.scale.set(34, 34, 1); bGroup.add(strobe);
      state.beacons.push({ group: bGroup, strobe: strobe, phase: bc.phase });
    });

    function tintGeo(geo, r, g, b) {
      var cnt = geo.getAttribute("position").count; var arr = new Float32Array(cnt * 3);
      for (var idx = 0; idx < cnt; idx++) {
        arr[idx * 3] = r; arr[idx * 3 + 1] = g; arr[idx * 3 + 2] = b;
      }
      geo.setAttribute("aColor", new THREE.Float32BufferAttribute(arr, 3));
      return geo;
    }

    var stationGroup = new THREE.Group(); state.root.add(stationGroup);
    var panelMat = new THREE.ShaderMaterial({
      uniforms: { uSunPosV: rockMat.uniforms.uSunPosV, uDim: rockMat.uniforms.uDim, uSpec: { value: 0.92 } },
      vertexShader: ROCK_VERT,
      fragmentShader: ROCK_FRAG,
      side: THREE.DoubleSide
    });

    var truss = new THREE.Mesh(tintGeo(new THREE.CylinderGeometry(0.7, 0.7, 46, 8, 1, false), 0.72, 0.75, 0.80), rockMat);
    truss.rotation.z = Math.PI * 0.5; stationGroup.add(truss);

    var habCore = new THREE.Mesh(tintGeo(new THREE.CylinderGeometry(2.4, 2.4, 18, 12, 1, false), 0.86, 0.88, 0.92), rockMat);
    stationGroup.add(habCore);

    var dockMod = new THREE.Mesh(tintGeo(new THREE.CylinderGeometry(1.7, 2.1, 11, 10, 1, false), 0.78, 0.81, 0.86), rockMat);
    dockMod.position.y = 13; stationGroup.add(dockMod);

    var gravRing = new THREE.Mesh(tintGeo(new THREE.RingGeometry(6.8, 8.6, 28, 1), 0.82, 0.84, 0.88), panelMat);
    gravRing.rotation.x = Math.PI * 0.5; stationGroup.add(gravRing);

    var solarGeo = tintGeo(new THREE.PlaneGeometry(5.2, 18.5), 0.16, 0.38, 0.76);
    [-19, -11, 11, 19].forEach(function (xPos) {
      [-1, 1].forEach(function (zDir) {
        var wing = new THREE.Mesh(solarGeo, panelMat); wing.position.set(xPos, 0, zDir * 10.5); wing.rotation.x = Math.PI * 0.5; stationGroup.add(wing);
      });
    });

    var navDockLight = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.texCache.glow,
      color: 0xfef08a,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    navDockLight.position.set(0, 19.5, 0); navDockLight.scale.set(14, 14, 1);
    stationGroup.add(navDockLight);

    state.spaceStation = {
      group: stationGroup, gravRing: gravRing, navLight: navDockLight, panelMat: panelMat, a: 735, e: 0.04,
      M0: 1.15, omega: (Math.PI * 2) / 48, basis: buildOrbitBasis(THREE, 0.21, 0.9, 0.4)
    };

    var probeOrbitGroup = new THREE.Group(); state.root.add(probeOrbitGroup);
    var probeBody = new THREE.Group(); probeOrbitGroup.add(probeBody);

    var dish = new THREE.Mesh(tintGeo(new THREE.CylinderGeometry(5.6, 0.9, 2.4, 16, 1, true), 0.88, 0.85, 0.78), panelMat);
    dish.position.y = 2.4; probeBody.add(dish);

    var bus = new THREE.Mesh(tintGeo(new THREE.CylinderGeometry(2.1, 2.1, 4.2, 8, 1, false), 0.76, 0.58, 0.22), panelMat);
    probeBody.add(bus);

    var boom = new THREE.Mesh(tintGeo(new THREE.CylinderGeometry(0.22, 0.22, 14, 6, 1, false), 0.65, 0.68, 0.74), rockMat);
    boom.position.set(4.5, -2.2, 0); boom.rotation.z = -0.65; probeBody.add(boom);

    var plumeMat = new THREE.MeshBasicMaterial({
      map: state.texCache.pulsarBeam, color: 0xbae6fd, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    var plumeGroup = new THREE.Group(); plumeGroup.position.set(-2.2, -2.4, 0);
    plumeGroup.rotation.z = 1.25; plumeGroup.visible = !state.degraded; probeBody.add(plumeGroup);
    state.jetGroups.push(plumeGroup);
    for (var pc = 0; pc < 2; pc++) {
      var pm = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 13.0), plumeMat);
      pm.position.y = -6.5; pm.rotation.z = Math.PI; pm.rotation.y = pc * Math.PI * 0.5; plumeGroup.add(pm);
    }

    var probeStrobe = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.texCache.corona,
      color: 0xfb7185,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    probeStrobe.position.set(0, 4.6, 0); probeStrobe.scale.set(22, 22, 1); probeBody.add(probeStrobe);

    var debGeo = buildBatchedAsteroidBeltGeometry(THREE, 16, 10, 32, 0x77113355);
    var debMesh = new THREE.Mesh(debGeo, panelMat); debMesh.scale.setScalar(0.32);
    probeOrbitGroup.add(debMesh);

    var laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    var laserLine = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    laserLine.frustumCulled = false; state.root.add(laserLine);

    state.derelictProbe = {
      orbitGroup: probeOrbitGroup, body: probeBody, debris: debMesh, plumeMat: plumeMat, strobe: probeStrobe,
      laserLine: laserLine, a: 1060, e: 0.14, M0: 3.7, omega: (Math.PI * 2) / 64,
      basis: buildOrbitBasis(THREE, -0.29, 2.2, 1.1)
    };

    var trailSegs = 26; var dustTailGeo = new THREE.BufferGeometry();
    var dustPos = new Float32Array(trailSegs * 3); var dustCol = new Float32Array(trailSegs * 3);
    for (var ti = 0; ti < trailSegs; ti++) {
      var fade = Math.pow(1 - ti / (trailSegs - 1), 1.75); dustCol[ti * 3] = 1.0 * fade;
      dustCol[ti * 3 + 1] = 0.91 * fade; dustCol[ti * 3 + 2] = 0.72 * fade;
    }
    dustTailGeo.setAttribute("position", new THREE.Float32BufferAttribute(dustPos, 3));
    dustTailGeo.setAttribute("color", new THREE.Float32BufferAttribute(dustCol, 3));

    var ionSegs = 12; var ionTailGeo = new THREE.BufferGeometry();
    var ionPos = new Float32Array(ionSegs * 3); var ionCol = new Float32Array(ionSegs * 3);
    for (var ii = 0; ii < ionSegs; ii++) {
      var iFade = Math.pow(1 - ii / (ionSegs - 1), 1.45); ionCol[ii * 3] = 0.42 * iFade;
      ionCol[ii * 3 + 1] = 0.80 * iFade; ionCol[ii * 3 + 2] = 1.0 * iFade;
    }
    ionTailGeo.setAttribute("position", new THREE.Float32BufferAttribute(ionPos, 3));
    ionTailGeo.setAttribute("color", new THREE.Float32BufferAttribute(ionCol, 3));

    var cometGroup = new THREE.Group(); cometGroup.visible = false; state.root.add(cometGroup);

    var dustLine = new THREE.Line(dustTailGeo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    dustLine.frustumCulled = false; cometGroup.add(dustLine);

    var ionLine = new THREE.Line(ionTailGeo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    ionLine.frustumCulled = false; cometGroup.add(ionLine);

    var nucleusGeo = buildIrregularBodyGeometry(THREE, 8, 6, 4409, 0.45, [1.35, 0.78, 0.88]);
    tintGeo(nucleusGeo, 0.32, 0.34, 0.38); var nucleusMesh = new THREE.Mesh(nucleusGeo, rockMat);
    nucleusMesh.scale.setScalar(3.8); cometGroup.add(nucleusMesh);

    var comaSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.texCache.corona,
      color: 0xe0f7ff,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    comaSprite.scale.set(62, 62, 1); cometGroup.add(comaSprite);

    state.comet = {
      group: cometGroup, dustLine: dustLine, ionLine: ionLine, nucleus: nucleusMesh, head: comaSprite,
      segs: trailSegs, ionSegs: ionSegs, active: false, elapsed: 0, duration: 3.2, nextIn: 12.8, seed: 101,
      start: new THREE.Vector3(), vel: new THREE.Vector3(), curve: new THREE.Vector3()
    };

    state.microMeteors = [];
    for (var mmi = 0; mmi < 2; mmi++) {
      var mmGeo = new THREE.BufferGeometry();
      mmGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      mmGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array([1, 1, 1, 0, 0.7, 1]), 3));
      var mmLine = new THREE.Line(mmGeo, new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      mmLine.frustumCulled = false; mmLine.visible = false; state.root.add(mmLine);
      state.microMeteors.push({
        line: mmLine, active: false, elapsed: 0, duration: 0.44,
        nextIn: 3.4 + mmi * 3.1, seed: 509 + mmi * 211, pos: new THREE.Vector3(), vel: new THREE.Vector3()
      });
    }
  }

  function updateCometAndMeteors(dt) {
    var c = state.comet;
    if (c) {
      if (state.degraded || state.reduced) {
        if (c.active) { c.active = false; c.group.visible = false; }
      } else if (!c.active) {
        c.nextIn -= dt;
        if (c.nextIn <= 0) {
          var r = rng((c.seed += 7919)); var az = r() * Math.PI * 2; var el = (r() - 0.5) * 0.75;
          var dist = 1750 + r() * 520;
          c.start.set(Math.cos(el) * Math.cos(az) * dist, Math.sin(el) * dist + 280, Math.cos(el) * Math.sin(az) * dist);
          var tangent = new global.THREE.Vector3(-Math.sin(az), -0.22 - r() * 0.18, Math.cos(az)).normalize();
          c.vel.copy(tangent).multiplyScalar(820 + r() * 260);
          c.curve.set(-c.start.x * 0.08, -65, -c.start.z * 0.08); c.duration = 2.8 + r() * 0.8;
          c.elapsed = 0; c.active = true; c.group.visible = true;
          c.nextIn = COMET_MIN_INTERVAL + r() * (COMET_MAX_INTERVAL - COMET_MIN_INTERVAL);
        }
      } else {
        c.elapsed += dt;
        if (c.elapsed >= c.duration) {
          c.active = false; c.group.visible = false;
        } else {
          var env = Math.sin((c.elapsed / c.duration) * Math.PI); c.head.material.opacity = 0.92 * env;
          c.dustLine.material.opacity = 0.80 * env; c.ionLine.material.opacity = 0.74 * env;

          var dAttr = c.dustLine.geometry.getAttribute("position"); var dArr = dAttr.array;
          var headX = 0, headY = 0, headZ = 0;
          for (var i = 0; i < c.segs; i++) {
            var ts = Math.max(0, c.elapsed - i * 0.032);
            var px = c.start.x + c.vel.x * ts + 0.5 * c.curve.x * ts * ts;
            var py = c.start.y + c.vel.y * ts + 0.5 * c.curve.y * ts * ts;
            var pz = c.start.z + c.vel.z * ts + 0.5 * c.curve.z * ts * ts;
            dArr[i * 3] = px; dArr[i * 3 + 1] = py; dArr[i * 3 + 2] = pz;
            if (i === 0) {
              headX = px; headY = py; headZ = pz; c.head.position.set(px, py, pz);
              c.nucleus.position.set(px, py, pz); c.nucleus.rotation.x += dt * 1.4;
              c.nucleus.rotation.y += dt * 1.9;
            }
          }
          dAttr.needsUpdate = true;

          var rLen = Math.sqrt(headX * headX + headY * headY + headZ * headZ) || 1;
          var rx = headX / rLen, ry = headY / rLen, rz = headZ / rLen;
          var iAttr = c.ionLine.geometry.getAttribute("position"); var iArr = iAttr.array; var ionLen = 280;
          for (var k = 0; k < c.ionSegs; k++) {
            var fk = k / (c.ionSegs - 1); iArr[k * 3] = headX + rx * ionLen * fk;
            iArr[k * 3 + 1] = headY + ry * ionLen * fk; iArr[k * 3 + 2] = headZ + rz * ionLen * fk;
          }
          iAttr.needsUpdate = true;
        }
      }
    }

    for (var mi = 0; mi < state.microMeteors.length; mi++) {
      var mm = state.microMeteors[mi];
      if (state.degraded || state.reduced) {
        if (mm.active) { mm.active = false; mm.line.visible = false; }
        continue;
      }
      if (!mm.active) {
        mm.nextIn -= dt;
        if (mm.nextIn <= 0) {
          var mr = rng((mm.seed += 4999)); var maz = mr() * Math.PI * 2; var mrad = 950 + mr() * 1100;
          mm.pos.set(Math.cos(maz) * mrad, (mr() - 0.5) * 900, Math.sin(maz) * mrad);
          mm.vel.set(-Math.sin(maz) + (mr() - 0.5) * 0.6, (mr() - 0.5) * 0.7, Math.cos(maz) + (mr() - 0.5) * 0.6).normalize().multiplyScalar(2100);
          mm.duration = 0.36 + mr() * 0.18; mm.elapsed = 0; mm.active = true; mm.line.visible = true;
          mm.nextIn = 4.6 + mr() * 4.4;
        }
      } else {
        mm.elapsed += dt;
        if (mm.elapsed >= mm.duration) {
          mm.active = false; mm.line.visible = false;
        } else {
          mm.pos.x += mm.vel.x * dt; mm.pos.y += mm.vel.y * dt; mm.pos.z += mm.vel.z * dt; var mArr = mm.line.geometry.getAttribute("position").array; mArr[0] = mm.pos.x; mArr[1] = mm.pos.y; mArr[2] = mm.pos.z; mArr[3] = mm.pos.x - mm.vel.x * 0.045; mArr[4] = mm.pos.y - mm.vel.y * 0.045; mArr[5] = mm.pos.z - mm.vel.z * 0.045; mm.line.geometry.getAttribute("position").needsUpdate = true; mm.line.material.opacity = Math.sin((mm.elapsed / mm.duration) * Math.PI) * 0.72;
        }
      }
    }
  }

  function updateHardSciFiScene(t, simDt, viewInv, focusDim) {
    state.tmpSunV.set(
      viewInv.elements[12] || 0,
      viewInv.elements[13] || 0,
      viewInv.elements[14] || 0
    );
    if (state.tmpSunV.lengthSq() < 0.0001 && state.camera) {
      var cp = state.camera.position; var el = viewInv.elements;
      state.tmpSunV.set(
        -(el[0] * cp.x + el[4] * cp.y + el[8] * cp.z),
        -(el[1] * cp.x + el[5] * cp.y + el[9] * cp.z),
        -(el[2] * cp.x + el[6] * cp.y + el[10] * cp.z)
      );
    }

    if (state.rockSharedMat) {
      state.rockSharedMat.uniforms.uSunPosV.value.copy(state.tmpSunV);
      state.rockSharedMat.uniforms.uDim.value = focusDim;
    }

    if (state.asteroidBelt && simDt > 0) {
      state.asteroidBelt.rotation.y += simDt * 0.032;
    }

    for (var fi = 0; fi < state.flybyRocks.length; fi++) {
      var fr = state.flybyRocks[fi];
      evalKeplerOrbit(fr.M0 + t * fr.omega, fr.a, fr.e, fr.basis.u, fr.basis.v, fr.mesh.position);
      if (simDt > 0) {
        fr.mesh.rotation.x += simDt * fr.spinX; fr.mesh.rotation.y += simDt * fr.spinY;
      }
    }

    for (var bi = 0; bi < state.beacons.length; bi++) {
      var bc = state.beacons[bi]; var cyc = (t * 0.75 + bc.phase) % 1.0;
      var flash = (cyc < 0.08 || (cyc > 0.16 && cyc < 0.22)) ? 0.85 : 0.08;
      bc.strobe.material.opacity = (state.reduced ? 0.35 : flash) * focusDim;
    }

    var st = state.spaceStation;
    if (st) {
      evalKeplerOrbit(st.M0 + t * st.omega, st.a, st.e, st.basis.u, st.basis.v, st.group.position);
      if (simDt > 0) {
        st.gravRing.rotation.z += simDt * 0.65;
        st.group.rotation.y = Math.atan2(-st.group.position.z, -st.group.position.x);
      }
      st.navLight.material.opacity = (0.45 + 0.35 * Math.sin(t * 3.2)) * focusDim;
    }

    var pr = state.derelictProbe;
    if (pr) {
      evalKeplerOrbit(pr.M0 + t * pr.omega, pr.a, pr.e, pr.basis.u, pr.basis.v, pr.orbitGroup.position);
      if (simDt > 0) {
        pr.body.rotation.x += simDt * 0.34; pr.body.rotation.z += simDt * 0.23;
        pr.debris.rotation.y -= simDt * 0.18; pr.debris.rotation.x += simDt * 0.11;
      }
      var pBlink = ((t * 0.9) % 1.0) < 0.09 ? 0.95 : 0.04;
      pr.strobe.material.opacity = (state.reduced ? 0.30 : pBlink) * focusDim;
      var puffWindow = (t % 5.6);
      var puff = (!state.reduced && !state.degraded && puffWindow < 0.30) ? Math.sin((puffWindow / 0.30) * Math.PI) * 0.52 : 0;
      pr.plumeMat.opacity = puff * focusDim;

      if (st) {
        var lArr = pr.laserLine.geometry.getAttribute("position").array;
        lArr[0] = st.group.position.x; lArr[1] = st.group.position.y + 18; lArr[2] = st.group.position.z;
        lArr[3] = pr.orbitGroup.position.x; lArr[4] = pr.orbitGroup.position.y; lArr[5] = pr.orbitGroup.position.z;
        pr.laserLine.geometry.getAttribute("position").needsUpdate = true;
        pr.laserLine.material.opacity = (0.05 + 0.09 * Math.max(0, Math.sin(t * 2.4))) * focusDim;
      }
    }

    for (var pi = 0; pi < state.pointSystems.length; pi++) {
      var ps = state.pointSystems[pi];
      if (ps.material.uniforms.uCoreR && ps.material.uniforms.uCoreR.value === 300) {
        ps.material.uniforms.uTime.value = t; ps.material.uniforms.uDim.value = focusDim;
      }
    }
  }

  /* ---------- 单体天体装配：黑洞 / 6类差异化恒星 / 5类行星(+投影冰尘环+小卫星) / 卫星与不规则小天体 ---------- */

  function createOrbitTrackLine(THREE, orb, colorHex, baseOpacity) {
    var SEG = 72; var pts = new Float32Array((SEG + 1) * 3); var out = new THREE.Vector3();
    for (var i = 0; i <= SEG; i++) {
      evalKeplerOrbit((i / SEG) * Math.PI * 2, orb.a, orb.e, orb.basis.u, orb.basis.v, out);
      pts[i * 3] = out.x; pts[i * 3 + 1] = out.y; pts[i * 3 + 2] = out.z;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    var mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex), transparent: true, opacity: baseOpacity, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var line = new THREE.Line(geo, mat); line.frustumCulled = false; state.root.add(line);
    return { line: line, mat: mat, orb: orb, baseOpacity: baseOpacity };
  }

  /* 6 类恒星球面光谱色板（彻底消除千篇一律的纯白圆球，保留各自星冕与旋臂粒子不变） */
  var STAR_ARCHETYPES = [
    { deep: [0.22, 0.03, 0.03], mid: [0.84, 0.19, 0.09], high: [1.00, 0.64, 0.22], vein: [1.00, 0.86, 0.42], corona: 0xf97316 },
    { deep: [0.04, 0.14, 0.42], mid: [0.14, 0.54, 0.94], high: [0.62, 0.90, 1.00], vein: [0.38, 0.96, 1.00], corona: 0x38bdf8 },
    { deep: [0.28, 0.11, 0.02], mid: [0.92, 0.54, 0.08], high: [1.00, 0.86, 0.44], vein: [1.00, 0.94, 0.68], corona: 0xfbbf24 },
    { deep: [0.02, 0.22, 0.22], mid: [0.09, 0.68, 0.62], high: [0.56, 0.96, 0.86], vein: [0.45, 1.00, 0.90], corona: 0x2dd4bf },
    { deep: [0.14, 0.05, 0.30], mid: [0.56, 0.24, 0.88], high: [0.90, 0.68, 1.00], vein: [0.96, 0.48, 0.84], corona: 0xc084fc },
    { deep: [0.28, 0.06, 0.14], mid: [0.88, 0.34, 0.48], high: [1.00, 0.78, 0.76], vein: [1.00, 0.88, 0.74], corona: 0xfb7185 }
  ];

  function buildCelestialBody(THREE, nd, sharedGeos) {
    var pal = nd.palette; var tier = nd.__tier; var hVal = hashStr("body:" + nd.id);
    var rand = rng(hVal ^ 0x85ebca6b);

    var group = new THREE.Group(); group.position.copy(nd.p); state.root.add(group);

    var entry = {
      node: nd, tier: tier, group: group, worldPos: nd.p.clone(),
      mesh: null, glow: null, coronaOuter: null, ring: null, ringMat: null,
      bhRig: null, track: null, lightSourceNode: null, label: null,
      base: nd.r3, spin: 0.09 + rand() * 0.20, pulsePhase: rand() * Math.PI * 2
    };

    if (tier === "blackhole") {
      var rig = assembleGargantuaRig(
        THREE, group, nd.r3,
        0xffcf75, palColor(pal, "atmo"),
        sharedGeos, true, hashStr(nd.id)
      ); entry.mesh = rig.horizonMesh; entry.ring = rig.accMesh; entry.glow = rig.lensSprite;
      entry.bhRig = rig;

    } else if (tier === "star") {
      var archIdx = (hVal + nd.__idx * 5) % STAR_ARCHETYPES.length; var spec = STAR_ARCHETYPES[archIdx];
      var catAtmo = palArr(pal, "atmo");

      var deepCol = new THREE.Color(spec.deep[0], spec.deep[1], spec.deep[2]);
      var midCol = new THREE.Color(
        lerp(spec.mid[0], catAtmo[0] / 255, 0.18),
        lerp(spec.mid[1], catAtmo[1] / 255, 0.18),
        lerp(spec.mid[2], catAtmo[2] / 255, 0.18)
      ); var highCol = new THREE.Color(spec.high[0], spec.high[1], spec.high[2]);
      var veinCol = new THREE.Color(spec.vein[0], spec.vein[1], spec.vein[2]);

      var starMat = new THREE.ShaderMaterial({
        uniforms: {
          uDeepCol: { value: deepCol }, uMidCol: { value: midCol }, uHighCol: { value: highCol },
          uVeinCol: { value: veinCol }, uArchetype: { value: archIdx }, uTime: { value: 0 },
          uSeed: { value: (hashStr(nd.id) % 1000) * 0.017 }, uDim: { value: 1.0 }, uBoost: { value: 0.0 }
        },
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG
      });
      var starMesh = new THREE.Mesh(sharedGeos.highSphere, starMat);
      starMesh.scale.setScalar(nd.r3); starMesh.rotation.z = (rand() - 0.5) * 0.55; group.add(starMesh);
      entry.mesh = starMesh;

      var corona = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.texCache.corona,
        color: new THREE.Color(spec.corona),
        transparent: true,
        opacity: nd.__isGalaxyCore ? 0.68 : 0.50,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      var cScale = nd.r3 * (nd.__isGalaxyCore ? 5.2 : 4.1); corona.scale.set(cScale, cScale, 1);
      group.add(corona); entry.glow = corona;

      var outerHalo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.texCache.glow,
        color: new THREE.Color(palColor(pal, "atmo")),
        transparent: true,
        opacity: nd.__isGalaxyCore ? 0.26 : 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      outerHalo.scale.set(nd.r3 * 6.0, nd.r3 * 6.0, 1); group.add(outerHalo); entry.coronaOuter = outerHalo;

    } else if (tier === "planet") {
      var pArch = (hVal + nd.__idx * 3) % 8; var pTex = buildPlanetTexture(THREE, nd, pArch);
      var hasOceanSpec = (pArch === 0 || pArch === 2 || pArch === 5 || pArch === 6);
      var pMat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: pTex },
          uRim: { value: new THREE.Color(pArch === 0 || pArch === 5 ? 0x38bdf8 : palColor(pal, "atmo")) },
          uLightDirV: { value: new THREE.Vector3(-0.55, 0.60, 0.58).normalize() }, uDim: { value: 1.0 },
          uGlow: { value: 0.0 }, uAlbedo: { value: 1.06 }, uAtmo: { value: pArch === 4 ? 0.30 : 0.78 },
          uNightGlow: { value: (pArch === 0 || pArch === 4 || pArch === 6) ? 1.0 : 0.0 },
          uSpecStrength: { value: hasOceanSpec ? 1.0 : 0.34 }, uEclipse: { value: 0.0 }
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG
      });
      var pMesh = new THREE.Mesh(sharedGeos.highSphere, pMat); pMesh.scale.setScalar(nd.r3);
      pMesh.rotation.z = (rand() - 0.5) * 0.42; group.add(pMesh); entry.mesh = pMesh;
      entry.lightSourceNode = (nd.__orbit && nd.__orbit.parentNode) || null;

      var pGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.texCache.glow,
        color: new THREE.Color(pArch === 0 || pArch === 5 ? 0x38bdf8 : palColor(pal, "atmo")),
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      pGlow.scale.set(nd.r3 * 3.6, nd.r3 * 3.6, 1); group.add(pGlow); entry.glow = pGlow;

      if (nd.__hasRing3d) {
        var rTex = buildRingTexture(THREE, pal, nd.id);
        var rGeo = new THREE.RingGeometry(nd.r3 * 1.46, nd.r3 * 2.52, 84, 1);
        var rMat = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: rTex }, uPlanetCenterV: { value: new THREE.Vector3() },
            uLightDirV: { value: new THREE.Vector3(-0.55, 0.60, 0.58).normalize() },
            uPlanetR: { value: nd.r3 }, uDim: { value: 1.0 }, uEclipse: { value: 0.0 }
          },
          vertexShader: PLANET_RING_VERT,
          fragmentShader: PLANET_RING_FRAG,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        var rMesh = new THREE.Mesh(rGeo, rMat);
        rMesh.rotation.x = Math.PI / 2 + ((rand() - 0.5) * 0.72 || 0.30);
        rMesh.rotation.z = rand() * Math.PI; group.add(rMesh); entry.ring = rMesh; entry.ringMat = rMat;
      }

      var moonCount = nd.__deg >= 5 ? 2 : 1;
      for (var mi = 0; mi < moonCount; mi++) {
        var mr = rng(hashStr(nd.id + ":mini:" + mi)); var mRad = 3.5 + mr() * 1.8;
        var mTex = buildMoonTexture(THREE, nd.id + ":mini:" + mi, pal);
        var mMat = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: mTex }, uRim: { value: new THREE.Color(0x94a3b8) },
            uLightDirV: { value: new THREE.Vector3(-0.55, 0.60, 0.58).normalize() }, uDim: { value: 1.0 },
            uGlow: { value: 0.0 }, uAlbedo: { value: 0.84 }, uAtmo: { value: 0.05 },
            uNightGlow: { value: 0.0 }, uSpecStrength: { value: 0.12 }, uEclipse: { value: 0.0 }
          },
          vertexShader: PLANET_VERT,
          fragmentShader: PLANET_FRAG
        });
        var mGeo = mi === 1 ? sharedGeos.irregularMoonA : sharedGeos.lowSphere;
        var mMesh = new THREE.Mesh(mGeo, mMat); mMesh.scale.setScalar(mRad); group.add(mMesh);

        var mOrbA = nd.r3 * (nd.__hasRing3d ? 2.85 : 2.15) + mi * 18 + mr() * 10;
        var mPeriod = 4.2 + mi * 2.1 + mr() * 1.5;
        state.miniMoons.push({
          hostEntry: entry, mesh: mMesh, mat: mMat, baseR: mRad,
          a: mOrbA, e: 0.06 + mr() * 0.08, M0: mr() * Math.PI * 2,
          omega: (Math.PI * 2) / mPeriod,
          basis: buildOrbitBasis(THREE, (0.28 + mr() * 0.55) * (mi % 2 === 0 ? 1 : -1), mr() * 6.28, mr() * 6.28)
        });
      }

      if (nd.__orbit && nd.__orbit.showTrack) {
        entry.track = createOrbitTrackLine(THREE, nd.__orbit, palColor(pal, "atmo"), 0.085);
        state.orbitLines.push(entry.track);
      }

    } else {
      var isIrregular = (hVal % 2 === 1); var sTex = buildMoonTexture(THREE, nd.id, pal);
      var sMat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: sTex }, uRim: { value: new THREE.Color(palColor(pal, "atmo")) },
          uLightDirV: { value: new THREE.Vector3(-0.55, 0.60, 0.58).normalize() }, uDim: { value: 1.0 },
          uGlow: { value: 0.0 }, uAlbedo: { value: 0.80 }, uAtmo: { value: 0.08 }, uNightGlow: { value: 0.0 },
          uSpecStrength: { value: 0.15 }, uEclipse: { value: 0.0 }
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG
      });
      var satGeo = isIrregular ? sharedGeos.irregularSat : sharedGeos.midSphere;
      var sMesh = new THREE.Mesh(satGeo, sMat); sMesh.scale.setScalar(nd.r3); group.add(sMesh);
      entry.mesh = sMesh; entry.lightSourceNode = (nd.__orbit && nd.__orbit.parentNode) || null;

      var sGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.texCache.glow,
        color: new THREE.Color(palColor(pal, "atmo")),
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      sGlow.scale.set(nd.r3 * 2.8, nd.r3 * 2.8, 1); group.add(sGlow); entry.glow = sGlow;

      if (nd.__orbit && nd.__orbit.showTrack) {
        entry.track = createOrbitTrackLine(THREE, nd.__orbit, palColor(pal, "atmo"), 0.11);
        state.orbitLines.push(entry.track);
      }
    }

    var label = document.createElement("div"); label.className = "mg3d-label is-tier-" + tier;
    label.textContent = tier === "blackhole" ? ((nd.title || "未命名") + " · 孤立") : (nd.title || "未命名");
    state.labelBox.appendChild(label); entry.label = label;

    label.addEventListener("click", function (ev) { ev.stopPropagation(); selectNode(entry); });

    return entry;
  }

  /* ---------- 科技感提示与左下角星际测绘 HUD 遥测台 ---------- */

  function showSpaceToast(msg) {
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

  function createSpecialLabelsAndHud(container) {
    /* 1. 恒星「陌浔」专属名称标签（近景显示恒星徽章，缩小至银河全景切换为菱形科技定位准星） */
    var sunLbl = document.createElement("div");
    sunLbl.className = "mg3d-label is-tier-sun";
    sunLbl.setAttribute("role", "button");
    sunLbl.setAttribute("tabindex", "0");
    sunLbl.dataset.pinMode = "stellar";
    sunLbl.innerHTML = '<span class="mg3d-sun-glyph" aria-hidden="true">☀</span><span class="mg3d-sun-name">' + SUN_NAME + '</span><span class="mg3d-sun-tag">恒星</span>';
    sunLbl.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (state.radius > 5400) {
        focusStellarSystem();
        showSpaceToast("已跃迁回「" + SUN_NAME + "」恒星系 · 共环绕 " + state.planets.length + " 颗记忆天体");
      } else {
        focusSunCloseUp();
      }
    });
    state.labelBox.appendChild(sunLbl);
    state.sunLabelEl = sunLbl;

    /* 2. 本恒星区域唯一「星际虫洞」专属标签 */
    var whLbl = document.createElement("div");
    whLbl.className = "mg3d-label is-tier-wormhole";
    whLbl.setAttribute("role", "button");
    whLbl.setAttribute("tabindex", "0");
    whLbl.innerHTML = '<span class="mg3d-wh-glyph" aria-hidden="true">◎</span><span>星际虫洞 · 待接入</span>';
    whLbl.addEventListener("click", function (ev) {
      ev.stopPropagation();
      focusWormhole();
    });
    state.labelBox.appendChild(whLbl);
    state.wormholeLabelEl = whLbl;

    /* 3. 左下角深空科技感 HUD 遥测与星域快速跃迁栏 */
    var hud = document.createElement("div");
    hud.className = "mg3d-hud";
    hud.innerHTML = ''
      + '<div class="mg3d-hud-readout">'
      + '  <span class="mg3d-hud-dot" aria-hidden="true"></span>'
      + '  <span class="mg3d-hud-sector">银河旋臂 · 陌浔恒星系</span>'
      + '  <span class="mg3d-hud-scale">1 恒星 · ' + state.nodes.length + ' 记忆行星 · 1 虫洞</span>'
      + '</div>'
      + '<div class="mg3d-hud-nav" role="group" aria-label="星域尺度快速切换">'
      + '  <button type="button" class="mg3d-hud-btn is-active" data-nav="sun">☀ 陌浔恒星系</button>'
      + '  <button type="button" class="mg3d-hud-btn" data-nav="galaxy">🌀 银河全景</button>'
      + '  <button type="button" class="mg3d-hud-btn" data-nav="wormhole">◎ 星际虫洞</button>'
      + '</div>';

    hud.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    hud.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var btn = ev.target.closest("[data-nav]");
      if (!btn) return;
      var nav = btn.getAttribute("data-nav");
      if (state.envOnly && global.MemoryGraph && global.MemoryGraph.handleHudNav) {
        global.MemoryGraph.handleHudNav(nav);
        return;
      }
      if (nav === "sun") focusStellarSystem();
      else if (nav === "galaxy") focusGrandGalaxy();
      else if (nav === "wormhole") focusWormhole();
    });

    container.appendChild(hud);
    state.hudEl = hud;
    state.hudSectorEl = hud.querySelector(".mg3d-hud-sector");
    state.hudScaleEl = hud.querySelector(".mg3d-hud-scale");
    state.hudBtns = {
      sun: hud.querySelector('[data-nav="sun"]'),
      galaxy: hud.querySelector('[data-nav="galaxy"]'),
      wormhole: hud.querySelector('[data-nav="wormhole"]')
    };
  }

  function updateHudTelemetry() {
    if (!state.hudEl) return;
    var isWormhole = state.focusedSpecial === "wormhole";
    var isGalaxy = !isWormhole && !state.selectedEntry && state.radius > 7200;
    var activeKey = isWormhole ? "wormhole" : (isGalaxy ? "galaxy" : "sun");

    if (state.hudSectorEl) {
      if (isWormhole) {
        state.hudSectorEl.textContent = "星际虫洞 · 爱因斯坦-罗森桥";
      } else if (isGalaxy) {
        state.hudSectorEl.textContent = "银河星系全景 · 旋臂坐标〔" + SUN_NAME + "〕";
      } else {
        state.hudSectorEl.textContent = "银河旋臂 · " + SUN_NAME + "恒星系" + (state.planar ? " · 2D平面" : "");
      }
    }
    if (state.hudScaleEl) {
      var onlineCount = state.stellarSystems ? state.stellarSystems.length : 1;
      if (isGalaxy) {
        state.hudScaleEl.textContent = "在线恒星 " + onlineCount + "（" + SUN_NAME + "）· 占星系尺度 <8%";
      } else if (isWormhole) {
        state.hudScaleEl.textContent = "跨恒星系通道 · 邀请朋友后激活跃迁";
      } else {
        state.hudScaleEl.textContent = onlineCount + " 恒星 · " + state.nodes.length + " 记忆天体 · 1 虫洞";
      }
    }
    if (state.hudBtns) {
      if (state.hudBtns.sun) state.hudBtns.sun.classList.toggle("is-active", activeKey === "sun");
      if (state.hudBtns.galaxy) state.hudBtns.galaxy.classList.toggle("is-active", activeKey === "galaxy");
      if (state.hudBtns.wormhole) state.hudBtns.wormhole.classList.toggle("is-active", activeKey === "wormhole");
    }
  }

  /* ---------- 场景总装配 ---------- */

  function setupScene(container, model, restoreSnap) {
    var THREE = global.THREE; state.container = container; state.nodes = model.nodes;
    state.edges = model.edges;
    state.onSelect = model.onSelect || function () {};
    state.planar = restoreSnap ? !!restoreSnap.planar : !!model.planar;
    state.envOnly = restoreSnap ? !!restoreSnap.envOnly : !!model.envOnly;
    state.degraded = restoreSnap ? !!restoreSnap.degraded : isMobileDevice();
    state.warmupFrames = 0; state.fpsFrames = 0; state.fpsAccum = 0;

    var w = Math.max(1, container.clientWidth); var h = Math.max(1, container.clientHeight);
    state.width = w; state.height = h; state.dpr = Math.min(global.devicePixelRatio || 1, MAX_DPR);

    state.renderer = new THREE.WebGLRenderer({
      antialias: !state.degraded, alpha: false, powerPreference: "high-performance"
    });
    state.renderer.setPixelRatio(state.dpr); state.renderer.setSize(w, h, false);
    state.renderer.setClearColor(0x020308, 1);

    var cv = state.renderer.domElement; cv.className = "mg3d-canvas"; container.appendChild(cv);

    state.scene = new THREE.Scene(); state.camera = new THREE.PerspectiveCamera(FOV, w / h, 4.0, 110000);

    computeLayout(THREE, state.nodes, state.edges, model.categories || []);
    var hier = buildHierarchyAndOrbits(THREE, state.nodes, model.categories || []);
    state.galaxies = hier.galaxies; state.galaxyByCat = hier.galaxyByCat;

    state.theta = restoreSnap ? restoreSnap.theta : (state.planar ? PLANAR_THETA : DEFAULT_THETA);
    state.phi = restoreSnap ? restoreSnap.phi : (state.planar ? PLANAR_PHI : DEFAULT_PHI);
    state.radius = restoreSnap ? restoreSnap.radius : DEFAULT_RADIUS;
    state.targetRadius = restoreSnap ? restoreSnap.targetRadius : DEFAULT_RADIUS;
    state.target = restoreSnap && restoreSnap.target ? restoreSnap.target.clone() : new THREE.Vector3(0, 0, 0);
    state.targetFocus = restoreSnap && restoreSnap.targetFocus ? restoreSnap.targetFocus.clone() : new THREE.Vector3(0, 0, 0);
    state.baseFocus = new THREE.Vector3(0, 0, 0);
    state.panOffset = restoreSnap && restoreSnap.panOffset ? restoreSnap.panOffset.clone() : new THREE.Vector3(0, 0, 0);
    state.simTime = restoreSnap ? restoreSnap.simTime : 0;
    state.focusedSpecial = null;
    state.hoveredSpecial = null;

    state.tmpV = new THREE.Vector3(); state.tmpV2 = new THREE.Vector3(); state.tmpV3 = new THREE.Vector3();
    state.tmpLight = new THREE.Vector3(); state.tmpSunV = new THREE.Vector3();
    state.tmpCamR = new THREE.Vector3(); state.tmpCamU = new THREE.Vector3();
    state.ray = new THREE.Raycaster();

    state.texCache = {
      glow: buildGlowTexture(THREE),
      corona: buildStarCoronaTexture(THREE),
      lensGhost: buildLensGhostTexture(THREE),
      distantSpiral: buildDistantGalaxyTexture(THREE, true, 1.2),
      distantEllip: buildDistantGalaxyTexture(THREE, false, 2.7),
      lensRing: buildLensRingTexture(THREE),
      jetBeam: buildBeamTexture(THREE, 2.5),
      pulsarBeam: buildBeamTexture(THREE, 1.9),
      milky: buildMilkyWayTexture(THREE),
      darkDust: buildNebulaTexture(THREE, [72, 88, 120], [12, 16, 28], true, 901),
      nebulae: [
        buildNebulaTexture(THREE, [218, 118, 42], [92, 34, 20], false, 103),
        buildNebulaTexture(THREE, [38, 148, 198], [22, 46, 108], false, 317),
        buildNebulaTexture(THREE, [138, 92, 212], [32, 152, 142], false, 619)
      ]
    };

    state.pointSystems = []; state.jetGroups = []; state.orbitLines = []; state.miniMoons = [];
    state.planets = [];
    state.planetById = {};
    state.labels = [];

    var deepStarBudget = 18500; var sunlitDustBudget = 420;
    var grandGalaxyStarBudget = Math.min(46000, MAX_PARTICLES - deepStarBudget - sunlitDustBudget - 15000);
    setupCosmicBackground(THREE, deepStarBudget);

    state.root = new THREE.Group(); state.scene.add(state.root);

    var sharedGeos = {
      highSphere: new THREE.SphereGeometry(1, 42, 28), midSphere: new THREE.SphereGeometry(1, 28, 20),
      lowSphere: new THREE.SphereGeometry(1, 16, 12),
      irregularSat: buildIrregularBodyGeometry(THREE, 22, 16, 0x314159, 0.36, [1.24, 0.78, 0.94]),
      irregularMoonA: buildIrregularBodyGeometry(THREE, 14, 10, 0x271828, 0.42, [1.30, 0.72, 0.88])
    };

    /* 装配宏大银河星系；3D 恒星系前景放入独立分组以便与 2D 扁平星图零销毁瞬时切换 */
    createGrandSpiralGalaxy(THREE, grandGalaxyStarBudget);

    var realRoot = state.root;
    var fgGroup = new THREE.Group();
    realRoot.add(fgGroup);
    state.stellarFgGroup = fgGroup;
    state.root = fgGroup;

    createCentralSun(THREE);
    setupHardSciFiElements(THREE, sunlitDustBudget);
    createStellarWormhole(THREE, sharedGeos);

    var labelBox = document.createElement("div"); labelBox.className = "mg3d-labels";
    container.appendChild(labelBox); state.labelBox = labelBox;

    state.nodes.forEach(function (nd) {
      var entry = buildCelestialBody(THREE, nd, sharedGeos); state.planets.push(entry); state.planetById[nd.id] = entry; state.labels.push(entry);
    });

    createSpecialLabelsAndHud(container);

    updateAllWorldPositions(state.simTime);

    state.edgeMeta = [];
    if (state.edges.length) {
      var eCount = state.edges.length; var edgePos = new Float32Array(eCount * 6);
      var edgeCol = new Float32Array(eCount * 6); var edgeBaseCol = new Float32Array(eCount * 6);

      for (var ei = 0; ei < eCount; ei++) {
        var e = state.edges[ei]; var ea = state.planetById[e.a.id], eb = state.planetById[e.b.id];
        var pa = ea ? ea.worldPos : e.a.p; var pb = eb ? eb.worldPos : e.b.p; var off = ei * 6;
        edgePos[off] = pa.x; edgePos[off + 1] = pa.y; edgePos[off + 2] = pa.z;
        edgePos[off + 3] = pb.x; edgePos[off + 4] = pb.y; edgePos[off + 5] = pb.z;

        var ca = palArr(e.a.palette, "atmo"); var cb = palArr(e.b.palette, "atmo");
        var inten = clamp(((e.w || 0.16) - 0.12) / 0.4, 0, 1); var k = 0.30 + inten * 0.42;
        edgeBaseCol[off] = lerp(ca[0], 238, 0.40) / 255 * k;
        edgeBaseCol[off + 1] = lerp(ca[1], 244, 0.40) / 255 * k;
        edgeBaseCol[off + 2] = lerp(ca[2], 252, 0.40) / 255 * k;
        edgeBaseCol[off + 3] = lerp(cb[0], 238, 0.40) / 255 * k;
        edgeBaseCol[off + 4] = lerp(cb[1], 244, 0.40) / 255 * k;
        edgeBaseCol[off + 5] = lerp(cb[2], 252, 0.40) / 255 * k;

        for (var ci = 0; ci < 6; ci++) edgeCol[off + ci] = edgeBaseCol[off + ci];
        state.edgeMeta.push({ a: e.a, b: e.b, ea: ea, eb: eb, baseOffset: off });
      }

      var eGeo = new THREE.BufferGeometry();
      eGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgePos, 3));
      eGeo.setAttribute("color", new THREE.Float32BufferAttribute(edgeCol, 3));
      eGeo.userData.baseColors = edgeBaseCol;
      state.edgesObj = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      state.edgesObj.frustumCulled = false; state.root.add(state.edgesObj);
    }

    state.root = realRoot;

    if (restoreSnap) {
      state.focusCat = restoreSnap.focusCat || null;
      if (restoreSnap.selected && state.planetById[restoreSnap.selected]) {
        state.selected = restoreSnap.selected; state.selectedEntry = state.planetById[restoreSnap.selected];
        state.selectedEntry.label.classList.add("is-selected");
      }
    }

    applyEnvOnlyState();
    bindEvents(cv); bindContextLoss(cv); resize(); updateCamera(0);

    state.active = true; state.lastTs = 0; setupReducedMotion(); animate();
  }

  /* ---------- 低帧率降级与 WebGL 上下文丢失恢复 ---------- */

  function applyDegradation() {
    if (state.degraded) return;
    state.degraded = true;
    for (var i = 0; i < state.pointSystems.length; i++) {
      var pts = state.pointSystems[i]; var full = pts.userData.fullCount || 0;
      if (full > 0) pts.geometry.setDrawRange(0, Math.max(1, Math.floor(full * 0.5)));
    }
    for (var j = 0; j < state.jetGroups.length; j++) {
      state.jetGroups[j].visible = false;
    }
    if (state.comet) {
      state.comet.active = false; state.comet.group.visible = false;
    }
    for (var k = 0; k < state.microMeteors.length; k++) {
      state.microMeteors[k].active = false; state.microMeteors[k].line.visible = false;
    }
  }

  function setupReducedMotion() {
    if (!global.matchMedia) { state.reduced = false; return; }
    var mq = global.matchMedia("(prefers-reduced-motion: reduce)");
    state.reduceMq = mq; state.reduced = !!mq.matches;
    if (!state._onReduceChange) {
      state._onReduceChange = function (ev) { state.reduced = !!(ev && ev.matches); };
    }
    if (mq.addEventListener) mq.addEventListener("change", state._onReduceChange);
    else if (mq.addListener) mq.addListener(state._onReduceChange);
  }

  function bindContextLoss(cv) {
    state.onCtxLost = function (e) {
      e.preventDefault();
      if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
      if (state.contextRebuilt || !state.active) return;

      var snap = {
        planar: state.planar,
        theta: state.theta,
        phi: state.phi,
        radius: state.radius,
        targetRadius: state.targetRadius,
        target: state.target ? state.target.clone() : null,
        targetFocus: state.targetFocus ? state.targetFocus.clone() : null,
        panOffset: state.panOffset ? state.panOffset.clone() : null,
        selected: state.selected,
        focusCat: state.focusCat,
        simTime: state.simTime,
        degraded: state.degraded
      };
      if (state.rebuildTimer) clearTimeout(state.rebuildTimer);
      state.rebuildTimer = setTimeout(function () {
        state.rebuildTimer = 0;
        if (state.contextRebuilt || !state.container || !state.rawModel) return;
        state.contextRebuilt = true; var savedContainer = state.container; var savedModel = state.rawModel;
        disposeSceneOnly(); setupScene(savedContainer, savedModel, snap);
      }, 160);
    };

    state.onCtxRestored = function () {
      if (!state.contextRebuilt && state.active && !state.raf) {
        state.lastTs = 0; animate();
      }
    };

    cv.addEventListener("webglcontextlost", state.onCtxLost, false);
    cv.addEventListener("webglcontextrestored", state.onCtxRestored, false);
  }

  /* ---------- 相机、2D/3D 双模同源交互与银河全景平滑过渡 ---------- */

  function updateCamera(dt) {
    var cam = state.camera;
    if (!cam) return;

    var dampSpeed = state.planar ? 7.2 : 5.0;
    var kR = dt > 0 ? Math.min(1, dt * dampSpeed) : 1;
    var kT = dt > 0 ? Math.min(1, dt * (state.planar ? 7.2 : 4.5)) : 1;
    state.radius = lerp(state.radius, state.targetRadius, kR);

    if (state.selectedEntry) {
      state.baseFocus.copy(state.selectedEntry.worldPos);
    } else if (!state.envOnly && state.focusedSpecial === "wormhole" && state.wormhole) {
      state.baseFocus.copy(state.wormhole.worldPos);
    } else if (state.focusedSpecial === "sun" || (state.envOnly && (state.focusedSpecial === "wormhole" || state.focusedSpecial === "node2d"))) {
      state.baseFocus.set(0, 0, 0);
    } else if (state.focusCat) {
      var sub = state.planets.filter(function (p) { return p.node.category === state.focusCat; });
      if (sub.length) {
        state.tmpV.set(0, 0, 0);
        for (var i = 0; i < sub.length; i++) state.tmpV.add(sub[i].worldPos);
        state.tmpV.multiplyScalar(1 / sub.length);
        state.baseFocus.copy(state.tmpV);
      } else {
        state.baseFocus.set(0, 0, 0);
      }
    } else {
      /* 随镜头拉远平滑过渡视点至银河星系中心，呈现完整倾斜旋臂全景与「陌浔」的渺小比例 */
      var galBlend = smoothstepJS(4400, 15200, state.radius);
      if (state.galaxyCenter && galBlend > 0.0001) {
        state.baseFocus.set(
          state.galaxyCenter.x * galBlend,
          state.galaxyCenter.y * galBlend,
          state.galaxyCenter.z * galBlend
        );
      } else {
        state.baseFocus.set(0, 0, 0);
      }
    }

    state.targetFocus.copy(state.baseFocus);
    if (state.panOffset) state.targetFocus.add(state.panOffset);
    state.target.lerp(state.targetFocus, kT);

    if (state.planar) {
      /* 平面 2D 模式：锁定最佳深空俯视倾角，保留全部 3D 动态天体公转与银河特效 */
      var kAng = dt > 0 ? Math.min(1, dt * 7.5) : 1;
      state.theta = lerp(state.theta, PLANAR_THETA, kAng);
      state.phi = lerp(state.phi, PLANAR_PHI, kAng);
    } else if (!state.dragging && !state.reduced && dt > 0) {
      var galSlow = 1.0 - smoothstepJS(5000, 14000, state.radius) * 0.92;
      state.theta += dt * 0.016 * galSlow;
    }

    var sp = Math.sin(state.phi), cp = Math.cos(state.phi);
    cam.position.set(
      state.target.x + state.radius * sp * Math.cos(state.theta),
      state.target.y + state.radius * cp,
      state.target.z + state.radius * sp * Math.sin(state.theta)
    );
    cam.lookAt(state.target);
    cam.updateMatrixWorld();
  }

  function raycastScene(clientX, clientY) {
    if (!state.renderer || !state.camera) return null;
    var rect = state.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var x = ((clientX - rect.left) / rect.width) * 2 - 1;
    var y = -((clientY - rect.top) / rect.height) * 2 + 1;
    state.ray.setFromCamera({ x: x, y: y }, state.camera);
    var orig = state.ray.ray.origin; var dir = state.ray.ray.direction;

    var best = null; var bestT = Infinity;

    if (state.radius < 7200) {
      for (var i = 0; i < state.planets.length; i++) {
        var p = state.planets[i]; var hitR = Math.max(p.base * 1.28, 22);
        var ox = p.worldPos.x - orig.x; var oy = p.worldPos.y - orig.y; var oz = p.worldPos.z - orig.z;
        var proj = ox * dir.x + oy * dir.y + oz * dir.z;
        if (proj < 0) continue;
        var d2 = (ox * ox + oy * oy + oz * oz) - proj * proj;
        if (d2 <= hitR * hitR) {
          var tHit = proj - Math.sqrt(Math.max(0, hitR * hitR - d2));
          if (tHit < bestT) { bestT = tHit; best = { type: "node", entry: p }; }
        }
      }

      if (state.wormhole) {
        var wh = state.wormhole;
        var wHitR = WORMHOLE_RADIUS * 1.85;
        var wox = wh.worldPos.x - orig.x, woy = wh.worldPos.y - orig.y, woz = wh.worldPos.z - orig.z;
        var wProj = wox * dir.x + woy * dir.y + woz * dir.z;
        if (wProj > 0) {
          var wd2 = (wox * wox + woy * woy + woz * woz) - wProj * wProj;
          if (wd2 <= wHitR * wHitR) {
            var wHitT = wProj - Math.sqrt(Math.max(0, wHitR * wHitR - wd2));
            if (wHitT < bestT) { bestT = wHitT; best = { type: "wormhole", entry: null }; }
          }
        }
      }
    }

    var sox = -orig.x, soy = -orig.y, soz = -orig.z; var sProj = sox * dir.x + soy * dir.y + soz * dir.z;
    if (sProj > 0) {
      var sd2 = (sox * sox + soy * soy + soz * soz) - sProj * sProj;
      var sHitR = state.radius > 7200 ? 480 : (SUN_RADIUS * 1.12);
      if (sd2 <= sHitR * sHitR) {
        var sHitT = sProj - Math.sqrt(Math.max(0, sHitR * sHitR - sd2));
        if (sHitT < bestT) best = { type: "sun", entry: null };
      }
    }
    return best;
  }

  function bindEvents(cv) {
    cv.addEventListener("pointerdown", function (e) {
      if (cv.setPointerCapture) {
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      }
      state.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(state.pointers);
      if (ids.length === 1) {
        state.dragging = true; state.moved = 0; state.lastX = e.clientX; state.lastY = e.clientY;
      } else if (ids.length === 2) {
        var a = state.pointers[ids[0]], b = state.pointers[ids[1]]; state.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });

    cv.addEventListener("pointermove", function (e) {
      if (state.pointers[e.pointerId]) state.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(state.pointers);
      if (ids.length >= 2) {
        var a = state.pointers[ids[0]], b = state.pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (state.pinchDist > 0) {
          var ratio = dist / state.pinchDist;
          if (state.focusedSpecial === "sun" || state.focusedSpecial === "wormhole") state.focusedSpecial = null;
          state.targetRadius = clamp(state.targetRadius / ratio, MIN_RADIUS, MAX_RADIUS);
          state.radius = clamp(state.radius / ratio, MIN_RADIUS, MAX_RADIUS);
        }
        state.pinchDist = dist;
        return;
      }
      if (!state.dragging) {
        hoverAt(e.clientX, e.clientY);
        return;
      }
      var dx = e.clientX - state.lastX; var dy = e.clientY - state.lastY; state.lastX = e.clientX;
      state.lastY = e.clientY; state.moved += Math.abs(dx) + Math.abs(dy);

      if (state.planar && state.camera && state.panOffset) {
        /* 平面 2D 拖拽：沿视平面精确 1:1 屏幕像素平移 */
        var el = state.camera.matrixWorld.elements;
        state.tmpCamR.set(el[0], el[1], el[2]).normalize();
        state.tmpCamU.set(el[4], el[5], el[6]).normalize();
        var worldPerPx = (2 * state.radius * Math.tan((FOV * Math.PI / 180) * 0.5)) / Math.max(1, state.height);
        state.panOffset.addScaledVector(state.tmpCamR, -dx * worldPerPx);
        state.panOffset.addScaledVector(state.tmpCamU, dy * worldPerPx);
        var maxPan = GRAND_GALAXY_R * 1.15;
        if (state.panOffset.length() > maxPan) state.panOffset.setLength(maxPan);
      } else {
        state.theta -= dx * 0.0055;
        state.phi = clamp(state.phi - dy * 0.0055, 0.18, Math.PI - 0.18);
      }
    });

    function endPointer(e) {
      if (state.pointers[e.pointerId]) delete state.pointers[e.pointerId];
      var ids = Object.keys(state.pointers);
      if (!ids.length) {
        if (state.dragging && state.moved < 8) pickAt(e.clientX, e.clientY);
        state.dragging = false; state.pinchDist = 0;
      }
    }
    cv.addEventListener("pointerup", endPointer); cv.addEventListener("pointercancel", endPointer);
    cv.addEventListener("pointerleave", function () {
      state.hovered = null; state.hoveredSpecial = null;
      if (state.renderer && state.renderer.domElement) state.renderer.domElement.style.cursor = "grab";
    });

    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (state.focusedSpecial === "sun" || state.focusedSpecial === "wormhole") {
        if (e.deltaY > 0) state.focusedSpecial = null;
      }
      if (e.deltaY < 0 && !state.selectedEntry && state.hovered && state.planetById[state.hovered.id] && state.targetRadius < 1200) {
        state.targetFocus.lerp(state.planetById[state.hovered.id].worldPos, 0.35);
      }
      var next = state.targetRadius * (1 + clamp(e.deltaY, -160, 160) * 0.0021);
      state.targetRadius = clamp(next, MIN_RADIUS, MAX_RADIUS);
    }, { passive: false });

    cv.addEventListener("dblclick", function () { resetView(); });
  }

  function clearLabelSelectionClasses() {
    if (state.planets) {
      for (var i = 0; i < state.planets.length; i++) {
        state.planets[i].label.classList.remove("is-selected");
      }
    }
    if (state.sunLabelEl) state.sunLabelEl.classList.remove("is-selected");
    if (state.wormholeLabelEl) state.wormholeLabelEl.classList.remove("is-selected");
  }

  function focusSunCloseUp() {
    state.selected = null; state.selectedEntry = null; state.focusCat = null;
    state.focusedSpecial = "sun";
    if (state.panOffset) state.panOffset.set(0, 0, 0);
    state.targetRadius = SUN_RADIUS * 4.2;
    state.onSelect(null);
    clearLabelSelectionClasses();
    if (state.sunLabelEl) state.sunLabelEl.classList.add("is-selected");
    showSpaceToast("恒星「" + SUN_NAME + "」· 个人记忆主星（共统御 " + state.nodes.length + " 颗记忆行星）");
  }

  function focusStellarSystem() {
    state.selected = null; state.selectedEntry = null; state.focusCat = null;
    state.focusedSpecial = null;
    if (state.panOffset) state.panOffset.set(0, 0, 0);
    state.targetRadius = DEFAULT_RADIUS;
    if (!state.planar) { state.theta = DEFAULT_THETA; state.phi = DEFAULT_PHI; }
    state.onSelect(null);
    clearLabelSelectionClasses();
  }

  function focusGrandGalaxy() {
    state.selected = null; state.selectedEntry = null; state.focusCat = null;
    state.focusedSpecial = "galaxy";
    if (state.panOffset) state.panOffset.set(0, 0, 0);
    state.theta = state.planar ? PLANAR_THETA : DEFAULT_THETA;
    state.phi = state.planar ? PLANAR_PHI : 1.00;
    state.targetRadius = state.envOnly ? GALAXY_OVERVIEW_RADIUS_2D : GALAXY_OVERVIEW_RADIUS;
    state.onSelect(null);
    clearLabelSelectionClasses();
  }

  function focusWormhole() {
    state.selected = null; state.selectedEntry = null; state.focusCat = null;
    state.focusedSpecial = "wormhole";
    if (state.panOffset) state.panOffset.set(0, 0, 0);
    state.targetRadius = WORMHOLE_RADIUS * 5.8;
    state.onSelect(null);
    clearLabelSelectionClasses();
    if (state.wormholeLabelEl) state.wormholeLabelEl.classList.add("is-selected");
    showSpaceToast("星际虫洞 · 当前仅「" + SUN_NAME + "」恒星系在线，邀请朋友后可跨恒星系通行");
  }

  function applyEnvOnlyState() {
    syncGalaxyDimensionMode();
    if (state.stellarFgGroup) state.stellarFgGroup.visible = !state.envOnly;
    if (state.labelBox) state.labelBox.style.display = state.envOnly ? "none" : "";
    if (state.renderer && state.renderer.domElement) {
      state.renderer.domElement.style.pointerEvents = state.envOnly ? "none" : "";
      state.renderer.domElement.style.zIndex = state.envOnly ? "1" : "";
    }
    if (state.envOnly) {
      for (var i = 0; i < state.lensGhosts.length; i++) {
        state.lensGhosts[i].sprite.visible = false;
      }
    }
  }

  function setEnvOnly(isEnvOnly) {
    state.envOnly = !!isEnvOnly;
    state.planar = !!isEnvOnly;
    state.selected = null;
    state.selectedEntry = null;
    state.hovered = null;
    state.hoveredSpecial = null;
    state.focusedSpecial = null;
    if (state.panOffset) state.panOffset.set(0, 0, 0);
    if (state.planar) {
      state.theta = PLANAR_THETA;
      state.phi = PLANAR_PHI;
      updateCamera(0);
    } else {
      state.theta = DEFAULT_THETA;
      state.phi = DEFAULT_PHI;
    }
    applyEnvOnlyState();
    updateHudTelemetry();
  }

  function getEnvProjection() {
    if (!state.active || !state.camera) return null;
    var w = state.width || 1, h = state.height || 1;
    var tanHalf = Math.tan((FOV * Math.PI / 180) * 0.5);
    state.tmpV.set(0, 0, 0).project(state.camera);
    var sx = (state.tmpV.x * 0.5 + 0.5) * w;
    var sy = (-state.tmpV.y * 0.5 + 0.5) * h;
    var scale2D = h / Math.max(1, 2 * state.radius * tanHalf);
    return {
      x: sx,
      y: sy,
      scale: scale2D,
      radius: state.radius,
      targetRadius: state.targetRadius,
      settled: Math.abs(state.radius - state.targetRadius) < Math.max(4, state.targetRadius * 0.012) && (!state.target || !state.targetFocus || state.target.distanceTo(state.targetFocus) < 16),
      behind: state.tmpV.z > 1
    };
  }

  function panByPixels(dx, dy) {
    if (!state.active || !state.camera || !state.panOffset) return;
    if (state.focusedSpecial === "sun" || state.focusedSpecial === "wormhole" || state.focusedSpecial === "node2d") {
      state.focusedSpecial = null;
    }
    var el = state.camera.matrixWorld.elements;
    state.tmpCamR.set(el[0], el[1], el[2]).normalize();
    state.tmpCamU.set(el[4], el[5], el[6]).normalize();
    var worldPerPx = (2 * state.radius * Math.tan((FOV * Math.PI / 180) * 0.5)) / Math.max(1, state.height);
    var stepX = -dx * worldPerPx;
    var stepY = dy * worldPerPx;
    state.panOffset.addScaledVector(state.tmpCamR, stepX);
    state.panOffset.addScaledVector(state.tmpCamU, stepY);
    var maxPan = GRAND_GALAXY_R * 1.15;
    if (state.panOffset.length() > maxPan) {
      state.panOffset.setLength(maxPan);
    } else if (state.target) {
      state.target.addScaledVector(state.tmpCamR, stepX);
      state.target.addScaledVector(state.tmpCamU, stepY);
    }
  }

  function zoomByFactor(factor) {
    if (!state.active) return;
    if (factor > 1 && (state.focusedSpecial === "sun" || state.focusedSpecial === "wormhole")) {
      state.focusedSpecial = null;
    }
    state.targetRadius = clamp(state.targetRadius * factor, MIN_RADIUS, MAX_RADIUS);
  }

  function focus2DPoint(wx, wy, targetRad, rightReservePx, specialTag) {
    if (!state.active || !state.camera || !state.panOffset) return;
    state.selected = null;
    state.selectedEntry = null;
    state.focusCat = null;
    if (specialTag !== undefined) {
      state.focusedSpecial = specialTag || null;
    }
    var rad = targetRad != null ? clamp(targetRad, MIN_RADIUS, MAX_RADIUS) : state.targetRadius;
    if (targetRad != null) {
      state.targetRadius = rad;
    }
    if (state.planar && (Math.abs(state.theta - PLANAR_THETA) > 0.001 || Math.abs(state.phi - PLANAR_PHI) > 0.001)) {
      state.theta = PLANAR_THETA;
      state.phi = PLANAR_PHI;
      updateCamera(0);
    }
    var el = state.camera.matrixWorld.elements;
    state.tmpCamR.set(el[0], el[1], el[2]).normalize();
    state.tmpCamU.set(el[4], el[5], el[6]).normalize();
    var tanHalf = Math.tan((FOV * Math.PI / 180) * 0.5);
    var worldPerPx = (2 * rad * tanHalf) / Math.max(1, state.height);
    var reserveWorld = ((rightReservePx || 0) * 0.5) * worldPerPx;
    state.panOffset.set(0, 0, 0)
      .addScaledVector(state.tmpCamR, wx + reserveWorld)
      .addScaledVector(state.tmpCamU, -wy);
    updateHudTelemetry();
  }

  function setPlanar(isPlanar) {
    state.planar = !!isPlanar;
    if (state.planar) {
      state.theta = PLANAR_THETA;
      state.phi = PLANAR_PHI;
    }
    updateHudTelemetry();
  }

  function pickAt(clientX, clientY) {
    var hit = raycastScene(clientX, clientY);
    if (hit && hit.type === "node") {
      selectNode(hit.entry);
    } else if (hit && hit.type === "wormhole") {
      focusWormhole();
    } else if (hit && hit.type === "sun") {
      if (state.radius > 5400) {
        focusStellarSystem();
      } else {
        focusSunCloseUp();
      }
    } else {
      if (state.selectedEntry || state.focusedSpecial === "sun" || state.focusedSpecial === "wormhole") {
        state.selected = null; state.selectedEntry = null; state.focusedSpecial = null;
        clearLabelSelectionClasses();
        state.onSelect(null);
        if (state.radius < DEFAULT_RADIUS * 0.72) state.targetRadius = DEFAULT_RADIUS;
      } else {
        state.onSelect(null);
      }
    }
  }

  function hoverAt(clientX, clientY) {
    var hit = raycastScene(clientX, clientY);
    state.hovered = (hit && hit.type === "node") ? hit.entry.node : null;
    state.hoveredSpecial = (hit && (hit.type === "wormhole" || hit.type === "sun")) ? hit.type : null;
    if (state.renderer && state.renderer.domElement) {
      state.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    }
  }

  function selectNode(entry) {
    var node = entry ? entry.node : null; state.selected = node ? node.id : null;
    state.selectedEntry = entry || null;
    state.focusedSpecial = null;
    if (state.panOffset) state.panOffset.set(0, 0, 0);
    if (entry) {
      state.focusCat = null;
      var ringFactor = entry.ring ? 5.2 : 4.2;
      state.targetRadius = clamp(entry.base * ringFactor, MIN_RADIUS + 8, 520);
    } else {
      state.targetRadius = DEFAULT_RADIUS;
    }
    state.onSelect(node);
    clearLabelSelectionClasses();
    if (entry && entry.label) entry.label.classList.add("is-selected");
  }

  function focusCategory(cat) {
    state.selected = null; state.selectedEntry = null; state.focusedSpecial = null;
    if (state.panOffset) state.panOffset.set(0, 0, 0);
    clearLabelSelectionClasses();
    if (!cat || state.focusCat === cat) {
      state.focusCat = null; state.targetRadius = DEFAULT_RADIUS;
      return null;
    }
    state.focusCat = cat;
    var list = state.planets.filter(function (p) { return p.node.category === cat; });
    state.targetRadius = list.length ? 1480 : DEFAULT_RADIUS;
    return state.focusCat;
  }

  function resetView() {
    state.selected = null; state.selectedEntry = null; state.focusCat = null;
    state.hovered = null; state.hoveredSpecial = null; state.focusedSpecial = null;
    if (state.panOffset) state.panOffset.set(0, 0, 0);
    state.targetRadius = DEFAULT_RADIUS;
    state.theta = state.planar ? PLANAR_THETA : DEFAULT_THETA;
    state.phi = state.planar ? PLANAR_PHI : DEFAULT_PHI;
    state.onSelect(null);
    clearLabelSelectionClasses();
  }

  function clearSelection() {
    if (!state.selected && !state.focusedSpecial) return;
    state.selected = null; state.selectedEntry = null; state.focusedSpecial = null;
    clearLabelSelectionClasses();
  }

  /* ---------- 每帧主循环 ---------- */

  function updateGargantuaRig(rig, t, dim, boost) {
    if (!rig) return;
    rig.accMat.uniforms.uTime.value = t; rig.accMat.uniforms.uDim.value = dim;
    rig.accMat.uniforms.uBoost.value = boost; rig.lensedMat.uniforms.uTime.value = t;
    rig.lensedMat.uniforms.uDim.value = dim; rig.lensedMat.uniforms.uBoost.value = boost;
    rig.lensSprite.material.opacity = (0.34 + boost * 0.22) * dim;
    if (rig.jetGroup && rig.jetGroup.visible && rig.jetMat) {
      var jPulse = state.reduced ? 0.14 : (0.12 + 0.05 * Math.sin(t * 1.4));
      rig.jetMat.opacity = (jPulse + boost * 0.10) * dim;
    }
  }

  function updateEdgesDynamic() {
    if (!state.edgesObj || !state.edgeMeta.length) return;
    var geo = state.edgesObj.geometry; var posAttr = geo.getAttribute("position");
    var colAttr = geo.getAttribute("color"); var posArr = posAttr.array; var colArr = colAttr.array;
    var baseCol = geo.userData.baseColors;

    var selId = state.selected; var hovId = state.hovered ? state.hovered.id : null;
    var focus = state.focusCat;
    var galFade = 1.0 - smoothstepJS(4200, 7800, state.radius);

    state.edgesObj.material.opacity = (selId ? 0.88 : (focus ? 0.38 : 0.34)) * galFade;

    for (var i = 0; i < state.edgeMeta.length; i++) {
      var m = state.edgeMeta[i]; var pa = m.ea ? m.ea.worldPos : m.a.p;
      var pb = m.eb ? m.eb.worldPos : m.b.p; var off = m.baseOffset;
      posArr[off] = pa.x; posArr[off + 1] = pa.y; posArr[off + 2] = pa.z;
      posArr[off + 3] = pb.x; posArr[off + 4] = pb.y; posArr[off + 5] = pb.z;

      var mul = 1.0;
      if (selId) {
        mul = (m.a.id === selId || m.b.id === selId) ? 1.95 : 0.14;
      } else if (hovId) {
        mul = (m.a.id === hovId || m.b.id === hovId) ? 1.55 : 0.78;
      } else if (focus) {
        var inCat = (m.a.category === focus && m.b.category === focus);
        var halfCat = (m.a.category === focus || m.b.category === focus);
        mul = inCat ? 1.30 : (halfCat ? 0.44 : 0.16);
      }

      colArr[off] = Math.min(1, baseCol[off] * mul); colArr[off + 1] = Math.min(1, baseCol[off + 1] * mul);
      colArr[off + 2] = Math.min(1, baseCol[off + 2] * mul);
      colArr[off + 3] = Math.min(1, baseCol[off + 3] * mul);
      colArr[off + 4] = Math.min(1, baseCol[off + 4] * mul);
      colArr[off + 5] = Math.min(1, baseCol[off + 5] * mul);
    }

    posAttr.needsUpdate = true; colAttr.needsUpdate = true;
  }

  function animate() {
    if (!state.active || !state.renderer) return;
    state.raf = requestAnimationFrame(animate);

    var ts = performance.now();
    if (!state.lastTs) state.lastTs = ts;
    var rawDt = (ts - state.lastTs) / 1000; state.lastTs = ts;

    if (rawDt > 0.001 && rawDt < 0.5) {
      if (state.warmupFrames < 6) {
        state.warmupFrames++;
      } else if (!state.degraded) {
        state.fpsFrames++; state.fpsAccum += rawDt;
        if (state.fpsFrames >= 60) {
          var avgFps = 60 / state.fpsAccum; state.fpsFrames = 0; state.fpsAccum = 0;
          if (avgFps < 40) applyDegradation();
        }
      }
    }

    var dt = rawDt <= 0 ? 0 : clamp(rawDt, 0.001, 0.06); var simDt = state.reduced ? 0 : dt;
    state.simTime += simDt; var t = state.simTime;

    if (simDt > 0) {
      updateAllWorldPositions(t);
    }

    updateCamera(dt);

    if (state.bgGroup && state.camera) {
      state.bgGroup.position.copy(state.camera.position);
    }
    if (state.skyDomeMat) state.skyDomeMat.uniforms.uTime.value = t;

    var focus = state.focusCat; var focusDim = focus ? 0.52 : 1.0;

    updateGrandGalaxyAndWormhole(t, simDt, focusDim);
    updateCentralSunAndOptics(t, simDt, focusDim);

    for (var pi = 0; pi < state.pulsars.length; pi++) {
      var ps = state.pulsars[pi];
      if (simDt > 0) ps.pivot.rotation.y += simDt * ps.spin;
      ps.halo.material.opacity = 0.46 + 0.12 * Math.sin(t * 5.2 + pi * 1.7);
    }
    updateCometAndMeteors(simDt);

    var viewInv = state.camera.matrixWorldInverse; updateHardSciFiScene(t, simDt, viewInv, focusDim);

    var orbitGalFade = 1.0 - smoothstepJS(3800, 7200, state.radius);
    var camPos = state.camera.position; var i, p;
    for (i = 0; i < state.planets.length; i++) {
      p = state.planets[i]; var dim = focus && p.node.category !== focus ? 0.22 : 1.0;
      var isSel = state.selected === p.node.id;
      var isHover = !!(state.hovered && state.hovered.id === p.node.id);
      var boost = isSel ? 1.0 : (isHover ? 0.52 : 0.0);

      var targetScale = isSel ? 1.12 : (isHover ? 1.06 : 1.0); var curScale = p.mesh.scale.x / p.base;
      var nextScale = lerp(curScale, targetScale, Math.min(1, dt * 8));
      p.mesh.scale.setScalar(p.base * nextScale);

      if (p.tier === "blackhole") {
        updateGargantuaRig(p.bhRig, t, dim, boost);

      } else {
        var pu = p.mesh.material.uniforms; pu.uDim.value = lerp(pu.uDim.value, dim, Math.min(1, dt * 6));
        pu.uGlow.value = lerp(pu.uGlow.value, isSel ? 0.65 : (isHover ? 0.36 : 0.0), Math.min(1, dt * 8));

        var srcEntry = p.lightSourceNode ? state.planetById[p.lightSourceNode.id] : null;
        var eclipseVal = 0;
        state.tmpLight.set(-p.worldPos.x, -p.worldPos.y, -p.worldPos.z).normalize();
        if (srcEntry) {
          eclipseVal = computeEclipseFactor(p.worldPos, srcEntry.worldPos, srcEntry.base);
        }
        if (state.tmpLight.lengthSq() > 0.001) {
          state.tmpLight.transformDirection(viewInv); pu.uLightDirV.value.copy(state.tmpLight);
        }
        pu.uEclipse.value = lerp(pu.uEclipse.value, eclipseVal, Math.min(1, dt * 8));

        if (p.ring && p.ringMat) {
          p.ring.scale.setScalar(nextScale); var el = viewInv.elements;
          var rx = p.worldPos.x - camPos.x, ry = p.worldPos.y - camPos.y, rz = p.worldPos.z - camPos.z;
          p.ringMat.uniforms.uPlanetCenterV.value.set(
            el[0] * rx + el[4] * ry + el[8] * rz,
            el[1] * rx + el[5] * ry + el[9] * rz,
            el[2] * rx + el[6] * ry + el[10] * rz
          ); p.ringMat.uniforms.uLightDirV.value.copy(pu.uLightDirV.value);
          p.ringMat.uniforms.uPlanetR.value = p.base * nextScale; p.ringMat.uniforms.uDim.value = dim;
          p.ringMat.uniforms.uEclipse.value = pu.uEclipse.value;
        }
        var gBase = p.tier === "planet" ? 0.28 : 0.14;
        p.glow.material.opacity = lerp(p.glow.material.opacity, (isSel ? 0.58 : (isHover ? 0.44 : gBase)) * dim, Math.min(1, dt * 6));
        if (simDt > 0) p.mesh.rotation.y += simDt * p.spin;
      }

      if (p.track) {
        if (p.track.orb.parentNode) {
          var hostE = state.planetById[p.track.orb.parentNode.id];
          if (hostE) p.track.line.position.copy(hostE.worldPos);
        }
        var catBoost = (focus && p.node.category === focus) ? 0.24 : p.track.baseOpacity;
        p.track.mat.opacity = ((isSel || isHover) ? 0.44 : catBoost) * dim * orbitGalFade;
      }
    }

    for (var mi = 0; mi < state.miniMoons.length; mi++) {
      var mm = state.miniMoons[mi];
      evalKeplerOrbit(mm.M0 + t * mm.omega, mm.a, mm.e, mm.basis.u, mm.basis.v, state.tmpV2);
      mm.mesh.position.copy(state.tmpV2);
      if (simDt > 0) mm.mesh.rotation.y += simDt * 0.48;
      var hostDim = focus && mm.hostEntry.node.category !== focus ? 0.22 : 1.0;
      var mWorld = state.tmpV3.copy(mm.hostEntry.worldPos).add(state.tmpV2);
      var mEclipse = computeEclipseFactor(mWorld, mm.hostEntry.worldPos, mm.hostEntry.base);
      mm.mat.uniforms.uDim.value = hostDim; mm.mat.uniforms.uEclipse.value = mEclipse;
      mm.mat.uniforms.uLightDirV.value.copy(mm.hostEntry.mesh.material.uniforms.uLightDirV.value);
    }

    updateEdgesDynamic();
    updateLabels();
    updateHudTelemetry();

    state.renderer.render(state.scene, state.camera);
  }

  /* ---------- 标签投影与防重叠（含恒星「陌浔」远近双态标识、唯一虫洞标识及行星节点防重叠） ---------- */

  function updateLabels() {
    if (state.envOnly || !state.labelBox || !state.camera) return;
    var w = state.width, h = state.height; var tanHalf = Math.tan((FOV * Math.PI / 180) / 2);
    var camPos = state.camera.position; var v = state.tmpV; var focus = state.focusCat;
    var planetGalFade = 1.0 - smoothstepJS(4200, 6200, state.radius);
    var placed = [];

    /* 1. 恒星「陌浔」标签：近景为太阳主标签，缩小至银河全景时变为旋臂上的菱形科技定位准星 */
    if (state.sunLabelEl) {
      var sEl = state.sunLabelEl;
      v.set(0, 0, 0);
      var sunDist = camPos.distanceTo(v);
      v.project(state.camera);
      if (v.z > 1 || v.z < -1) {
        sEl.style.visibility = "hidden";
      } else {
        var sunSx = (v.x * 0.5 + 0.5) * w;
        var sunCenterY = (-v.y * 0.5 + 0.5) * h;
        var isGalPin = state.radius >= 5400;
        if (isGalPin && sEl.dataset.pinMode !== "galactic") {
          sEl.dataset.pinMode = "galactic";
          sEl.classList.add("is-galactic-pin");
          sEl.innerHTML = '<span class="mg3d-reticle" aria-hidden="true"></span><span class="mg3d-pin-tag">◈ ' + SUN_NAME + '</span>';
        } else if (!isGalPin && sEl.dataset.pinMode !== "stellar") {
          sEl.dataset.pinMode = "stellar";
          sEl.classList.remove("is-galactic-pin");
          sEl.innerHTML = '<span class="mg3d-sun-glyph" aria-hidden="true">☀</span><span class="mg3d-sun-name">' + SUN_NAME + '</span><span class="mg3d-sun-tag">恒星</span>';
        }
        var sunProjPx = (SUN_RADIUS * (h / (2 * tanHalf))) / Math.max(1, sunDist);
        var sunSy = isGalPin ? sunCenterY : (sunCenterY + Math.min(sunProjPx * 0.92, h * 0.35) + 14);
        if (sunSx < -80 || sunSx > w + 80 || sunSy < -40 || sunSy > h + 40) {
          sEl.style.visibility = "hidden";
        } else {
          sEl.style.visibility = "visible";
          sEl.style.opacity = "1";
          sEl.style.pointerEvents = "auto";
          sEl.style.zIndex = "8";
          sEl.style.transform = "translate3d(" + sunSx.toFixed(1) + "px," + sunSy.toFixed(1) + "px,0) translate(-50%,-50%)";
          sEl.classList.toggle("is-hovered", state.hoveredSpecial === "sun");
          placed.push({ x: sunSx, y: sunSy, w: 112, h: 30 });
          if (!isGalPin) {
            var blockSunD = Math.min(sunProjPx * 1.75, 180);
            placed.push({ x: sunSx, y: sunCenterY, w: blockSunD, h: blockSunD });
          }
        }
      }
    }

    /* 2. 本恒星区域唯一「星际虫洞」标签 */
    if (state.wormholeLabelEl && state.wormhole) {
      var wEl = state.wormholeLabelEl;
      var whFade = state.focusedSpecial === "wormhole" ? 1.0 : (1.0 - smoothstepJS(4800, 7400, state.radius));
      if (whFade < 0.05) {
        wEl.style.visibility = "hidden";
        wEl.style.pointerEvents = "none";
      } else {
        v.copy(state.wormhole.worldPos);
        var whDist = camPos.distanceTo(v);
        v.project(state.camera);
        if (v.z > 1 || v.z < -1) {
          wEl.style.visibility = "hidden";
        } else {
          var whProjPx = (WORMHOLE_RADIUS * 1.45 * (h / (2 * tanHalf))) / Math.max(1, whDist);
          var whSx = (v.x * 0.5 + 0.5) * w;
          var whCenterY = (-v.y * 0.5 + 0.5) * h;
          var whSy = whCenterY + Math.min(whProjPx, h * 0.30) + 14;
          if (whSx < -80 || whSx > w + 80 || whSy < -40 || whSy > h + 40) {
            wEl.style.visibility = "hidden";
          } else {
            wEl.style.visibility = "visible";
            wEl.style.opacity = whFade.toFixed(3);
            wEl.style.pointerEvents = whFade > 0.2 ? "auto" : "none";
            wEl.style.zIndex = "7";
            wEl.style.transform = "translate3d(" + whSx.toFixed(1) + "px," + whSy.toFixed(1) + "px,0) translate(-50%,-50%)";
            wEl.classList.toggle("is-hovered", state.hoveredSpecial === "wormhole");
            placed.push({ x: whSx, y: whSy, w: 142, h: 28 });
            var blockWhD = Math.min(whProjPx * 1.85, 220);
            placed.push({ x: whSx, y: whCenterY, w: blockWhD, h: blockWhD });
          }
        }
      }
    }

    var list = state.labels; var n = list.length; var i, p, nd, el;
    if (planetGalFade < 0.03 && !state.selectedEntry && !state.hovered) {
      for (i = 0; i < n; i++) {
        list[i].label.style.opacity = "0";
        list[i].label.style.pointerEvents = "none";
      }
      return;
    }

    for (i = 0; i < n; i++) {
      p = list[i]; nd = p.node; el = p.label; v.copy(p.worldPos); p._dist = camPos.distanceTo(v);
      v.project(state.camera);
      if (v.z > 1 || v.z < -1) {
        p._vis = false; el.style.visibility = "hidden"; continue;
      }
      var projRadiusPx = (p.base * (h / (2 * tanHalf))) / Math.max(1, p._dist);
      var sx = (v.x * 0.5 + 0.5) * w;
      var sy = (-v.y * 0.5 + 0.5) * h + Math.min(projRadiusPx * 0.86, h * 0.36) + 11;
      if (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) {
        p._vis = false; el.style.visibility = "hidden"; continue;
      }
      p._vis = true; p._x = sx; p._y = sy; var txt = el.textContent || ""; var pxEst = 24;
      for (var ci = 0; ci < txt.length; ci++) {
        pxEst += txt.charCodeAt(ci) > 255 ? 11.2 : 6.6;
      }
      var estW = Math.min(168, pxEst); var realW = el.offsetWidth || 0;
      p._w = Math.max(estW, realW > 12 ? realW : 0); p._h = Math.max(20, el.offsetHeight || 20);
    }

    var order = [];
    for (i = 0; i < n; i++) {
      if (list[i]._vis) order.push(i);
    }
    order.sort(function (ia, ib) {
      var pa = list[ia], pb = list[ib];
      var aForce = (state.selected === pa.node.id ? 2 : 0) + (state.hovered && state.hovered.id === pa.node.id ? 1 : 0);
      var bForce = (state.selected === pb.node.id ? 2 : 0) + (state.hovered && state.hovered.id === pb.node.id ? 1 : 0);
      if (aForce !== bForce) return bForce - aForce;
      if (focus) {
        var aFoc = pa.node.category === focus ? 1 : 0; var bFoc = pb.node.category === focus ? 1 : 0;
        if (aFoc !== bFoc) return bFoc - aFoc;
      }
      return pa._dist - pb._dist;
    });

    var visibleCount = 0;

    for (var oi = 0; oi < order.length; oi++) {
      p = list[order[oi]]; el = p.label; nd = p.node; var isSel = state.selected === nd.id;
      var isHov = !!(state.hovered && state.hovered.id === nd.id); var mustShow = isSel || isHov;

      if (!mustShow && (visibleCount >= MAX_VISIBLE_LABELS || planetGalFade < 0.05)) {
        el.style.opacity = "0"; el.style.pointerEvents = "none"; continue;
      }

      var x = p._x, y = p._y; var bw = p._w + 8, bh = p._h + 4; var free = false, ty = y;
      for (var attempt = 0; attempt < 6; attempt++) {
        ty = y + attempt * (bh + 2); free = true;
        for (var k = 0; k < placed.length; k++) {
          var r = placed[k];
          if (Math.abs(r.x - x) < (r.w + bw) * 0.5 && Math.abs(r.y - ty) < (r.h + bh) * 0.5) {
            free = false; break;
          }
        }
        if (free) break;
      }

      var dimmed = !!(focus && nd.category !== focus);
      if (!free && !mustShow) {
        el.style.opacity = "0"; el.style.pointerEvents = "none"; continue;
      }

      placed.push({ x: x, y: free ? ty : y, w: bw, h: bh });
      visibleCount++;

      var finalY = free ? ty : y; el.style.visibility = "visible";
      el.style.pointerEvents = (mustShow || planetGalFade > 0.25) ? "auto" : "none";
      el.style.transform = "translate3d(" + x.toFixed(1) + "px," + finalY.toFixed(1) + "px,0) translate(-50%,-50%)";
      var near = clamp(1.18 - p._dist / 4200, 0.52, 1);
      var op = (dimmed ? 0.15 : (mustShow ? 1 : (0.64 * near + 0.26))) * (mustShow ? 1 : planetGalFade);
      el.style.opacity = op.toFixed(3);
      el.style.zIndex = String(isSel ? 5 : (isHov ? 4 : (dimmed ? 1 : 2)));
      el.classList.toggle("is-focus", !!(focus && nd.category === focus));
      el.classList.toggle("is-hovered", isHov && !isSel);
    }
  }

  /* ---------- 尺寸自适应与 100% 资源释放 ---------- */

  function resize() {
    if (!state.renderer || !state.container || !state.camera) return;
    var w = Math.max(1, state.container.clientWidth); var h = Math.max(1, state.container.clientHeight);
    if (!w || !h) return;
    state.width = w; state.height = h; state.dpr = Math.min(global.devicePixelRatio || 1, MAX_DPR);
    state.camera.aspect = w / h; state.camera.updateProjectionMatrix();
    state.renderer.setPixelRatio(state.dpr); state.renderer.setSize(w, h, false);
    for (var i = 0; i < state.pointSystems.length; i++) {
      var u = state.pointSystems[i].material.uniforms;
      if (u && u.uPixelRatio) u.uPixelRatio.value = state.dpr;
    }
  }

  function onResize() { resize(); }

  function onVisibility() {
    if (document.hidden) {
      if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    } else if (state.active && !state.raf) { state.lastTs = 0; animate(); }
  }

  function disposeMaterial(mat, disposedTex) {
    if (!mat) return;
    if (mat.map && !disposedTex.has(mat.map)) {
      disposedTex.add(mat.map); mat.map.dispose();
    }
    if (mat.uniforms) {
      var keys = Object.keys(mat.uniforms);
      for (var i = 0; i < keys.length; i++) {
        var val = mat.uniforms[keys[i]] && mat.uniforms[keys[i]].value;
        if (val && val.isTexture && !disposedTex.has(val)) {
          disposedTex.add(val); val.dispose();
        }
      }
    }
    mat.dispose();
  }

  function disposeSceneOnly() {
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }

    var disposedGeos = new Set(); var disposedMats = new Set(); var disposedTex = new Set();

    if (state.scene) {
      state.scene.traverse(function (obj) {
        if (obj.geometry && !disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry); obj.geometry.dispose();
        }
        if (obj.material) {
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (var i = 0; i < mats.length; i++) {
            if (mats[i] && !disposedMats.has(mats[i])) {
              disposedMats.add(mats[i]); disposeMaterial(mats[i], disposedTex);
            }
          }
        }
      });
    }

    if (state.texCache) {
      Object.keys(state.texCache).forEach(function (k) {
        var item = state.texCache[k]; var arr = Array.isArray(item) ? item : [item];
        arr.forEach(function (tex) {
          if (tex && tex.dispose && !disposedTex.has(tex)) {
            disposedTex.add(tex); tex.dispose();
          }
        });
      });
      state.texCache = null;
    }

    if (state.renderer) {
      var cv = state.renderer.domElement;
      if (cv) {
        if (state.onCtxLost) cv.removeEventListener("webglcontextlost", state.onCtxLost, false);
        if (state.onCtxRestored) cv.removeEventListener("webglcontextrestored", state.onCtxRestored, false);
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      }
      state.renderer.dispose();
    }

    if (state.labelBox && state.labelBox.parentNode) {
      state.labelBox.parentNode.removeChild(state.labelBox);
    }
    if (state.hudEl && state.hudEl.parentNode) {
      state.hudEl.parentNode.removeChild(state.hudEl);
    }

    if (state.reduceMq && state._onReduceChange) {
      if (state.reduceMq.removeEventListener) state.reduceMq.removeEventListener("change", state._onReduceChange);
      else if (state.reduceMq.removeListener) state.reduceMq.removeListener(state._onReduceChange);
      state.reduceMq = null;
    }

    state.renderer = null; state.scene = null; state.camera = null; state.root = null; state.bgGroup = null;
    state.stellarFgGroup = null;
    state.centralSun = null; state.grandGalaxy = null; state.galaxyCenter = null; state.wormhole = null;
    state.stellarSystems = []; state.sunLabelEl = null; state.wormholeLabelEl = null;
    state.hudEl = null; state.hudSectorEl = null; state.hudScaleEl = null; state.hudBtns = {};
    state.lensGhosts = []; state.skyDomeMat = null; state.asteroidBelt = null; state.hudLines = null;
    state.rockSharedMat = null; state.flybyRocks = []; state.microMeteors = []; state.beacons = [];
    state.spaceStation = null; state.derelictProbe = null; state.labelBox = null; state.edgesObj = null;
    state.edgeMeta = []; state.planets = [];
    state.planetById = {};
    state.galaxies = [];
    state.galaxyByCat = {};
    state.filaments = []; state.pulsars = []; state.pointSystems = []; state.jetGroups = [];
    state.orbitLines = []; state.miniMoons = []; state.comet = null; state.labels = [];
    state.pointers = {};
  }

  /* ---------- 生命周期与对外接口（保持签名与行为完全兼容，新增 planar / 星域跃迁能力） ---------- */

  function render(container, model, opts) {
    destroy();
    if (!container) return { nodes: 0, edges: 0 };
    if (!global.THREE) return { nodes: 0, edges: 0, error: "no-three" };

    var normalized = normalizeModel(model, opts);
    if (!normalized) return { nodes: 0, edges: 0, error: "no-model" };
    if (!normalized.nodes.length) return { nodes: 0, edges: 0 };

    state.rawModel = normalized; state.contextRebuilt = false; setupScene(container, normalized, null);

    global.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return { nodes: normalized.nodes.length, edges: normalized.edges.length };
  }

  function destroy() {
    state.active = false;
    if (state.rebuildTimer) {
      clearTimeout(state.rebuildTimer); state.rebuildTimer = 0;
    }
    if (state.toastTimer) {
      clearTimeout(state.toastTimer); state.toastTimer = 0;
    }
    global.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);

    disposeSceneOnly();

    state.nodes = []; state.edges = []; state.rawModel = null; state.selected = null;
    state.selectedEntry = null; state.hovered = null; state.hoveredSpecial = null;
    state.focusCat = null; state.focusedSpecial = null; state.container = null;
  }

  function supported() {
    if (!global.THREE) return false;
    try {
      var c = document.createElement("canvas");
      return !!(global.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) {
      return false;
    }
  }

  global.MemoryGraph3D = {
    render: render, destroy: destroy, resetView: resetView, focusCategory: focusCategory,
    clearSelection: clearSelection, supported: supported, setPlanar: setPlanar, setEnvOnly: setEnvOnly,
    getEnvProjection: getEnvProjection, panByPixels: panByPixels, zoomByFactor: zoomByFactor,
    focus2DPoint: focus2DPoint, showSpaceToast: showSpaceToast,
    focusGrandGalaxy: focusGrandGalaxy, focusWormhole: focusWormhole, focusStellarSystem: focusStellarSystem,
    isActive: function () { return !!state.active; },
    isEnvOnly: function () { return !!(state.active && state.envOnly); }
  };
})(window);
