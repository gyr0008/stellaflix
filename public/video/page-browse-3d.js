/*
 * Stellaflix 影视模块 — 电影/动漫分页 3D 海报墙（方案 B · 单张大透明卡 · 窗口自适应 · 卡内滚网格/卡外视差呼吸 · 无 hover 放大）
 *
 * 设计铁律（与影视模块专项守则一致）：
 *   - 全局复用 window.scene / camera / renderer / orbit（经典脚本顶层 var，
 *     即 window.* 全局），**零改动 public/index.html** 的 3D 引擎代码。
 *   - 海报墙 = 单张「大的透明卡片」：一个 PlaneGeometry，其 CanvasTexture 由一张
 *     大 2D 画布绘制——画布内按响应式网格把一张张海报拼进去。
 *   - **进入时只建一次**：wallMesh / wallCanvas / wallTexture 三件套在 activate 时创建，
 *     永不销毁重建；翻页/加载新海报只是「滑动窗口 + 重绘画布像素」，不重建几何体/纹理。
 *   - 无限滚动：应用层 scrollTop(0..1 连续) 驱动画布只画当前窗口 [scrollTop*maxStartRow, +WINDOW]
 *     的海报；靠近末尾自动 loadMore 追加 items（无上限，真·无限）。
 *   - **单卡无 hover 放大**：大卡不做歌单架式 hover 放大；卡片静态边框 1px rgba(255,255,255,.1)
 *     + 静态阴影 0 2px 8px（仅可读性），hover 不放大、不加深。
 *   - **指针在卡内 vs 卡外（方案 B 交互核心）**：
 *       · 指针在卡内 → 整卡静止（倾斜=0、呼吸=0），滚轮只用于滚动内部海报网格（无限）；
 *       · 指针在卡外 → 整卡随指针视差倾斜 + 呼吸（与普通 3D 歌单架观感一致）。
 *     判定：每帧 pointermove 用 Raycaster 命中大平面 → inCard；cardFocus 缓动(卡内→0/卡外→1)
 *     同时调制 tilt 与 breath。
 *   - 点击：Raycaster 命中大平面→取 UV→col/row（全局）→index→onCardClick（单张海报进播放）。
 *   - 卡片绘制管线 = 「Canvas 2D 画 → CanvasTexture → 贴平面合成」，与歌单架 buildOneCard 同款。
 *   - 透明透出首页星空：覆盖层永久透明；大卡材质 depthTest:false（同歌单架）+ renderOrder 排序。
 *   - 湖光：真·镜像倒影（共享大画布纹理，仅多一张翻转 mesh，显存友好）。
 *   - 响应式网格（Request 2 规格）：<640→2列, 640–767→3列, 768–1023→4列, ≥1024→5列；
 *     容器内边距/间隙：默认16px, ≥640→24px, ≥1024→32px；网格最大宽度 1280（画布逻辑宽封顶）。
 *   - 过渡：向心淡出(scale 1→0) → 卸载，全部手写 rAF lerp，**零 GSAP**。
 *
 * 红圈区（#search-area 顶栏）全程不动：3D 仅渲染于背景 WebGL 画布层，
 * 不触碰顶栏，pointup 命中顶栏/过滤器等交互元素时跳过 raycast。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  if (SFV.browse3d) return; // 防御性：避免重复注册（HMR/重复加载）

  var THREE = global.THREE;
  // 延迟捕获：index.html 的 3D shelf 全局（scene/camera/renderer/orbit）在 <body> 脚本中定义，
  // 本文件在 <head> 加载时它们尚不存在，故在 activate() 内首次使用时再取全局引用。
  var scene, camera, renderer, orbit;
  var raf = (global.requestAnimationFrame)
    ? global.requestAnimationFrame.bind(global)
    : function (f) { return setTimeout(f, 16); };

  // ---- 常量 ----
  var GRID_RADIUS = 9.2;            // 网格视图相机距离（复用 orbit.userRadius）
  var TEXTURE_MAX = 80;             // 海报图 LRU 上限（每张图独立 Image 对象）
  var COLLAPSE_MS = 360;            // 向心坍缩时长
  var LERP_K = 0.12;                // rAF lerp 系数
  var EPS = 0.01;                   // 收敛阈值
  var WINDOW_ROWS = 5;              // 画布窗口行数（可见窗口）
  var WALL_CANVAS_W = 1280;         // 大画布逻辑宽（= 网格最大宽度 1280，封顶）
  var LONG_EDGE = 4096;             // 大画布长边封顶，防显存爆炸
  var MAX_TILT = 0.16;              // 指针视差最大倾角(rad)
  var WALL_H_WORLD = 6.0;           // 大卡世界高度（固定 → 卡大小稳定，只滑窗不缩放）
  var WALL_MAX_W = 7.4;             // 大卡世界宽度上限

  // ---- 状态 ----
  var group = null;                 // THREE.Group
  var active = false;
  var mediaType = null;
  var host = null;
  var onCardClick = null;
  var loadPageFn = null;            // 分类感知翻页加载器（湖光浏览厅注入）
  var savedOrbit = null;
  var lakeMesh = null;              // 湖面辉光带
  var items = [];                   // 所有已加载海报 meta（跨页，只 append，不切页）
  var pageNo = 0, loading = false;

  var wallMesh = null, wallCanvas = null, wallTexture = null;
  var wallReflMesh = null, wallReflMat = null;
  var gridCols = 4;
  var totalRows = 1;                // 全局网格总行数（供 raycast 命中坐标换算）
  var canvasW = WALL_CANVAS_W, canvasH = WALL_CANVAS_W, wallAspect = 1;
  var W_world = 4, H_world = WALL_H_WORLD;
  var cellW = 0, cellH = 0, gap = 24, PAD = 24;

  var scrollTop = 0;                // 应用层滚动（0..1，连续）
  var winStart = 0;                 // 当前窗口起始海报 index
  var winCount = 0;                 // 当前窗口海报数
  var winToken = 0;                 // 窗口重绘令牌（防旧异步回调画到错位窗口）

  var pointerTiltX = 0, pointerTiltY = 0;   // 原始指针视差（不乘 focus）
  var tiltX = 0, tiltY = 0;                 // 当前倾斜（缓动后）
  var cardFocus = 1;                        // 卡焦点：卡内→0(静止) / 卡外→1(视差+呼吸)，缓动
  var inCard = false;                       // 指针射线是否命中大卡
  var breathT = 0;
  var wallOpacity = 0, wallOpacityTarget = 0;
  var wallScaleCur = 0.9, wallScaleTarget = 1;

  var redrawScheduled = false;      // 异步图片到达后的去抖重绘

  var ticking = false;
  var pointerAttached = false;
  var pointerDown = null;           // { x, y, t }
  var imageCache = {};              // url -> { img, at, disposed }
  var imageOrder = [];
  var textureDisposed = 0;          // CanvasTexture 释放计数（用于测试 + 监控）

  var raycaster = (THREE && THREE.Raycaster) ? new THREE.Raycaster() : null;
  var ndc = (THREE && THREE.Vector2) ? new THREE.Vector2()
    : { x: 0, y: 0, set: function (a, b) { this.x = a; this.y = b; } };

  function now() {
    return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
  }

  // ============================================================
  //  2D 圆角矩形路径（对齐歌单架 makeRoundRect 的等价 canvas 行为）
  // ============================================================
  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ============================================================
  //  海报图 LRU（Image 对象，CanvasTexture 跟卡片走）
  // ============================================================
  function evictImages() {
    while (imageOrder.length > TEXTURE_MAX) {
      var url = imageOrder.shift();
      var rec = imageCache[url];
      if (rec) rec.disposed = true;
      delete imageCache[url];
    }
  }
  function getPosterImage(url, onReady) {
    if (!url) { if (onReady) onReady(null); return null; }
    var rec = imageCache[url];
    if (rec && !rec.disposed && rec.img && rec.img.complete && rec.img.naturalWidth) {
      var idx = imageOrder.indexOf(url);
      if (idx !== -1) imageOrder.splice(idx, 1);
      imageOrder.push(url);
      rec.at = now();
      if (onReady) onReady(rec.img);
      return rec.img;
    }
    var img = new Image();
    if ('crossOrigin' in img) { try { img.crossOrigin = 'anonymous'; } catch (e) {} }
    img.onload = function () {
      var r2 = imageCache[url] || (imageCache[url] = { img: null, at: now(), disposed: false });
      r2.img = img; r2.at = now(); r2.disposed = false;
      if (imageOrder.indexOf(url) === -1) imageOrder.push(url);
      evictImages();
      if (onReady) onReady(img);
    };
    img.onerror = function () { if (onReady) onReady(null); };
    img.src = url;
    return null;
  }
  function clearImageCache() {
    imageOrder.forEach(function (url) { var r = imageCache[url]; if (r) r.disposed = true; });
    imageCache = {}; imageOrder = [];
  }

  // ============================================================
  //  卡片绘制（仿歌单架 drawCard 风格，直接画进大画布）
  //  无 hover 放大：静态边框 1px rgba(255,255,255,.1) + 静态阴影 0 2px 8px，海报 scale=1。
  // ============================================================
  function drawCardDirect(ctx, item, img, x, y, w, h) {
    var sScale = canvasW / WALL_CANVAS_W;          // 以 1280 设计宽归一化（2px/1px 等按设计宽）
    var cardPad = w * 0.018;
    var radius = w * 0.05;

    // 静态阴影（0 2px 8px，固定不增强）
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8 * sScale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * sScale;
    roundRect(ctx, x + cardPad, y + cardPad, w - cardPad * 2, h - cardPad * 2, radius);
    var bgGrad = ctx.createLinearGradient(0, y, 0, y + h);
    bgGrad.addColorStop(0, 'rgba(34, 38, 46, 0.97)');
    bgGrad.addColorStop(1, 'rgba(14, 18, 24, 0.97)');
    ctx.fillStyle = bgGrad;
    ctx.fill();
    ctx.restore();

    // 卡片边框：1px solid rgba(255,255,255,0.1)（深色，静态）
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = Math.max(1, sScale);
    roundRect(ctx, x + cardPad, y + cardPad, w - cardPad * 2, h - cardPad * 2, radius);
    ctx.stroke();

    // 海报区（按比例留出标题块，避免标题溢出）
    var posterPad = cardPad + w * 0.012;
    var titleBlock = h * 0.15;
    var availH = (h - cardPad * 2) - titleBlock;
    var posterW = Math.min(w - posterPad * 2, availH / 1.5);
    var posterH = posterW * 1.5;
    var posterX = x + (w - posterW) / 2;
    var posterY = y + cardPad + 4;
    var posterRadius = w * 0.04;

    ctx.save();
    roundRect(ctx, posterX, posterY, posterW, posterH, posterRadius);
    ctx.clip();
    if (img && img.naturalWidth) {
      var iw = img.naturalWidth, ih = img.naturalHeight;
      var sR = iw / ih, dR = posterW / posterH;
      var dw, dh, dx, dy;
      if (sR > dR) { dh = posterH; dw = dh * sR; dx = posterX - (dw - posterW) / 2; dy = posterY; }
      else         { dw = posterW; dh = dw / sR; dx = posterX; dy = posterY - (dh - posterH) / 2; }
      // 无 hover 放大：原尺寸绘制
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = 'rgba(40, 44, 52, 1)';
      ctx.fillRect(posterX, posterY, posterW, posterH);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.font = Math.round(w * 0.18) + 'px "Segoe UI Emoji", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎬', posterX + posterW / 2, posterY + posterH / 2);
    }
    ctx.restore();

    // 海报细边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    roundRect(ctx, posterX, posterY, posterW, posterH, posterRadius);
    ctx.stroke();

    // 评分徽章（右上角，参考歌单架渐变胶囊）
    if (item.rating) {
      var badgeW = w * 0.16, badgeH = h * 0.038;
      var badgeX = posterX + posterW - badgeW - w * 0.018;
      var badgeY = posterY + h * 0.012;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH * 0.34);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.42)';
      ctx.lineWidth = Math.max(0.6, 0.8 * sScale);
      ctx.stroke();
      ctx.font = '700 ' + Math.round(h * 0.026) + 'px Inter, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(255, 220, 120, 1)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★ ' + item.rating.toFixed(1), badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);
    }

    // 标题（标题块内左对齐）
    var titleFont = Math.max(11, Math.round(w * 0.058));
    var titleY = y + h - cardPad - titleBlock * 0.34;
    ctx.font = '700 ' + titleFont + 'px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var title = item.title || '';
    var maxChars = Math.max(4, Math.floor((w - posterPad * 2) / (titleFont * 0.62)));
    if (title.length > maxChars) title = title.substring(0, maxChars - 1) + '…';
    ctx.fillText(title, x + posterPad, titleY);

    // 副标题（年份）
    if (item.year) {
      ctx.font = '400 ' + Math.round(titleFont * 0.74) + 'px Inter, "Microsoft YaHei", Arial';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.fillText(String(item.year), x + posterPad, titleY + titleFont * 0.92);
    }

    // 底部柔和暗角
    var vg = ctx.createLinearGradient(0, y + h - h * 0.12, 0, y + h);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = vg;
    roundRect(ctx, x + cardPad, y + cardPad, w - cardPad * 2, h - cardPad * 2, radius);
    ctx.fill();
  }

  // ============================================================
  //  响应式网格（Request 2 规格）
  // ============================================================
  function metricsForWidth(w) {
    var cols = w < 640 ? 2 : (w < 768 ? 3 : (w < 1024 ? 4 : 5));
    var pad = w >= 1024 ? 32 : (w >= 640 ? 24 : 16); // 容器内边距/间隙：默认16 / ≥640→24 / ≥1024→32
    return { cols: cols, pad: pad, gap: pad };
  }

  // 计算网格几何（cell 尺寸、行数、画布尺寸），随 items 与窗口宽度自适应
  function computeGrid() {
    var w = global.innerWidth || 1280;
    var m = metricsForWidth(w);
    gridCols = m.cols; gap = m.gap; PAD = m.pad;
    cellW = (WALL_CANVAS_W - 2 * PAD - (gridCols - 1) * gap) / gridCols;
    cellH = cellW * 1.5;
    var total = items.length || gridCols * WINDOW_ROWS;
    var gridRows = Math.ceil(total / gridCols);
    var gridW = gridCols * cellW + (gridCols - 1) * gap;
    var gridH = gridRows * cellH + (gridRows - 1) * gap;
    canvasW = WALL_CANVAS_W;
    canvasH = (gridH + 2 * PAD) * 1.05; // 1.05 缓冲：滑窗时画布略高于当前内容，避免频繁 resize
    // 长边封顶：等比压缩所有尺寸，防显存爆炸（尤其手机 2 列堆很多行）
    var longEdge = Math.max(canvasW, canvasH);
    if (longEdge > LONG_EDGE) {
      var f = LONG_EDGE / longEdge;
      cellW *= f; cellH *= f; gap *= f; PAD *= f;
      canvasW *= f; canvasH *= f;
    }
    wallAspect = canvasW / canvasH;
    totalRows = gridRows;            // 供 raycast 命中坐标换算（onClick/onPointerMove）
    return { cellW: cellW, cellH: cellH, gap: gap };
  }

  // 把当前滑动窗口的海报拼进大画布（复合绘制）；只动画布像素，不重建纹理对象
  function drawWindow() {
    if (!wallCanvas) return;
    var g = computeGrid();
    var newW = Math.max(2, Math.round(canvasW));
    var newH = Math.max(2, Math.round(canvasH));
    if (wallCanvas.width !== newW || wallCanvas.height !== newH) {
      wallCanvas.width = newW; wallCanvas.height = newH; // 仅尺寸变化时 resize（极少）
    }
    var ctx = wallCanvas.getContext('2d');
    ctx.clearRect(0, 0, wallCanvas.width, wallCanvas.height);

    var count = items.length;
    var maxStartRow = Math.max(0, totalRows - WINDOW_ROWS);
    var startRow = Math.floor(scrollTop * maxStartRow);
    if (startRow < 0) startRow = 0;
    winStart = startRow * gridCols;
    winCount = Math.min(gridCols * WINDOW_ROWS, count - winStart);
    if (winCount < 0) winCount = 0;
    winToken++;
    var token = winToken;

    for (var i = 0; i < winCount; i++) {
      var item = items[winStart + i];
      if (!item) continue;
      var col = i % gridCols, row = Math.floor(i / gridCols);
      var x = PAD + col * (g.cellW + g.gap);
      var y = PAD + row * (g.cellH + g.gap);
      var img = item.poster ? getPosterImage(item.poster, function (loadedImg) {
        if (token !== winToken) return;
        scheduleRedraw();
      }) : null;
      drawCardDirect(ctx, item, img, x, y, g.cellW, g.cellH);
    }
    if (wallTexture) wallTexture.needsUpdate = true;
  }

  // 异步图片到达后的去抖重绘（事件驱动，不每帧）
  function scheduleRedraw() {
    if (redrawScheduled) return;
    redrawScheduled = true;
    raf(function () {
      redrawScheduled = false;
      if (active && wallCanvas && wallMesh && wallMesh.parent) drawWindow();
    });
  }

  // 按画布宽高比缩放世界尺寸，并封顶宽度；同时定位湖面
  // 注意：WALL_H_WORLD 固定 → 卡的大小稳定，只滑窗不缩放
  function fitWall() {
    if (!wallMesh) return;
    H_world = WALL_H_WORLD;
    W_world = H_world * wallAspect;
    if (W_world > WALL_MAX_W) {
      var k = WALL_MAX_W / W_world;
      W_world *= k; H_world *= k;
    }
    wallMesh.position.set(0, 0, 0);
    wallMesh.scale.set(W_world, H_world, 1);
    if (wallReflMesh) {
      wallReflMesh.position.set(0, -(H_world / 2 + 0.12), 0);
      wallReflMesh.scale.set(W_world, -H_world, 1);
    }
    if (lakeMesh) lakeMesh.position.set(0, -(H_world / 2 + 0.10), 0);
  }

  // 建单张大卡（1 主平面 + 1 倒影平面，共享纹理）—— 只建一次，永不重建
  function makeWall() {
    wallCanvas = global.document.createElement('canvas');
    var g = computeGrid();
    wallCanvas.width = Math.max(2, Math.round(canvasW));
    wallCanvas.height = Math.max(2, Math.round(canvasH));
    wallTexture = new THREE.CanvasTexture(wallCanvas);
    wallTexture.minFilter = THREE.LinearFilter;
    wallTexture.magFilter = THREE.LinearFilter;
    wallTexture.generateMipmaps = false;

    var mat = new THREE.MeshBasicMaterial({
      map: wallTexture, transparent: true, opacity: 0,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide
    });
    wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    wallMesh.renderOrder = 6;        // 绘制于背景（紫球/粒子）之上
    group.add(wallMesh);

    // 湖光：真·镜像倒影（共享大画布纹理，仅多一张翻转 mesh）
    wallReflMat = new THREE.MeshBasicMaterial({
      map: wallTexture, transparent: true, opacity: 0.30,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide
    });
    wallReflMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallReflMat);
    wallReflMesh.renderOrder = 5;    // 在卡片之下、背景之上
    group.add(wallReflMesh);

    drawWindow();
    fitWall();
    wallMesh.material.opacity = 0;
    wallScaleCur = 0.9;
  }

  // ============================================================
  //  过渡动画（手写 rAF lerp，零 GSAP）
  //   - wallTick：入场/出场 不透明度 + 缩放 + 指针视差(随 cardFocus) + 呼吸(随 cardFocus)
  //     cardFocus：卡内→0（整卡静止，专心滚网格）/ 卡外→1（视差倾斜+呼吸，歌单架风格）
  // ============================================================
  function wallTick() {
    if (!ticking) return;
    var any = false, t = now();
    // 卡焦点缓动
    cardFocus += ((inCard ? 0 : 1) - cardFocus) * LERP_K;
    // 倾斜目标 = 原始指针视差 × cardFocus（卡内归零）
    var tiltTX = pointerTiltX * cardFocus;
    var tiltTY = pointerTiltY * cardFocus;
    tiltX += (tiltTX - tiltX) * LERP_K;
    tiltY += (tiltTY - tiltY) * LERP_K;
    breathT += 0.016;
    var breath = Math.sin(breathT * 0.9) * 0.012 * cardFocus;  // 卡内→无呼吸
    wallOpacity += (wallOpacityTarget - wallOpacity) * LERP_K;
    wallScaleCur += (wallScaleTarget - wallScaleCur) * LERP_K;

    if (wallMesh) {
      wallMesh.rotation.x = tiltX + breath;
      wallMesh.rotation.y = tiltY;
      wallMesh.material.opacity = wallOpacity;
      wallMesh.scale.set(W_world * wallScaleCur, H_world * wallScaleCur, 1);
    }
    if (wallReflMesh) {
      wallReflMesh.rotation.x = tiltX + breath;
      wallReflMesh.rotation.y = tiltY;
      wallReflMesh.material.opacity = Math.max(0, wallOpacity * 0.30);
      wallReflMesh.scale.set(W_world * wallScaleCur, -H_world * wallScaleCur, 1);
    }
    if (Math.abs(wallOpacityTarget - wallOpacity) > EPS ||
        Math.abs(wallScaleTarget - wallScaleCur) > EPS ||
        Math.abs(cardFocus - (inCard ? 0 : 1)) > 0.002) {
      raf(wallTick);
    } else {
      ticking = false;
    }
  }
  function startWallTick() { if (!ticking) { ticking = true; raf(wallTick); } }

  // ============================================================
  //  数据加载（与 DOM 网格同数据源 SFV.tmdb.popular）—— 只 append，不切页
  // ============================================================
  function defaultLoader(p) {
    if (!SFV.tmdb || !SFV.tmdb.popular) return Promise.resolve([]);
    return SFV.tmdb.popular(mediaType, p);
  }
  function loadMore() {
    if (loading) return;
    var loader = loadPageFn || defaultLoader;
    loading = true;
    var p = pageNo + 1;
    Promise.resolve(loader(p)).then(function (resItems) {
      pageNo = p; loading = false;
      if (!resItems || !resItems.length) return;
      items = items.concat(resItems);   // 只追加，不切页
      drawWindow();                       // 重绘画布像素（不重建纹理对象）
      fitWall();
      startWallTick();
    }).catch(function () { loading = false; });
  }

  function disposeWall() {
    if (wallMesh) {
      if (wallMesh.parent) wallMesh.parent.remove(wallMesh);
      if (wallMesh.geometry && wallMesh.geometry.dispose) wallMesh.geometry.dispose();
      if (wallMesh.material) wallMesh.material.dispose();
      wallMesh = null;
    }
    if (wallReflMesh) {
      if (wallReflMesh.parent) wallReflMesh.parent.remove(wallReflMesh);
      if (wallReflMesh.geometry && wallReflMesh.geometry.dispose) wallReflMesh.geometry.dispose();
      if (wallReflMesh.material) wallReflMesh.material.dispose();
      wallReflMesh = null;
    }
    if (wallTexture && wallTexture.dispose) {
      try { wallTexture.dispose(); textureDisposed++; } catch (e) {}
    }
    wallTexture = null;
    wallCanvas = null;
  }

  // ============================================================
  //  orbit 复用 / 还原（相机锁定：recentering + 基准值固定）
  // ============================================================
  function saveOrbit() {
    if (!orbit) return;
    savedOrbit = {
      userRadius: orbit.userRadius, baselineRadius: orbit.baselineRadius,
      userTheta: orbit.userTheta, baselineTheta: orbit.baselineTheta,
      userPhi: orbit.userPhi, baselinePhi: orbit.baselinePhi,
      recentering: !!orbit.recentering
    };
  }
  function setOrbitGrid() {
    if (!orbit) return;
    orbit.userRadius = GRID_RADIUS; orbit.baselineRadius = GRID_RADIUS;
    orbit.userTheta = 0; orbit.baselineTheta = 0;
    orbit.userPhi = 0.04; orbit.baselinePhi = 0.04;
    orbit.recentering = true; // 强制回锁 → 卡片始终以正面朝向呈现，不被相机绕动
  }
  function restoreOrbit() {
    if (!orbit || !savedOrbit) return;
    orbit.userRadius = savedOrbit.userRadius; orbit.baselineRadius = savedOrbit.baselineRadius;
    orbit.userTheta = savedOrbit.userTheta; orbit.baselineTheta = savedOrbit.baselineTheta;
    orbit.userPhi = savedOrbit.userPhi; orbit.baselinePhi = savedOrbit.baselinePhi;
    orbit.recentering = !!savedOrbit.recentering;
    savedOrbit = null;
  }

  // ============================================================
  //  指针 / Raycaster / 滚轮 / 键盘
  // ============================================================
  function attachPointer() {
    if (pointerAttached || !global.addEventListener) return;
    pointerAttached = true;
    global.addEventListener('pointerdown', onPointerDown, true);
    global.addEventListener('pointerup', onPointerUp, true);
    global.addEventListener('pointermove', onPointerMove, true);
    global.addEventListener('wheel', onWheel, true);
    global.addEventListener('keydown', onKeyDown, true);
    global.addEventListener('resize', onResize, true);
  }
  function detachPointer() {
    if (!pointerAttached || !global.removeEventListener) return;
    pointerAttached = false;
    global.removeEventListener('pointerdown', onPointerDown, true);
    global.removeEventListener('pointerup', onPointerUp, true);
    global.removeEventListener('pointermove', onPointerMove, true);
    global.removeEventListener('wheel', onWheel, true);
    global.removeEventListener('keydown', onKeyDown, true);
    global.removeEventListener('resize', onResize, true);
  }
  function onPointerDown(e) {
    if (!active) return;
    pointerDown = { x: e.clientX || 0, y: e.clientY || 0, t: now() };
  }
  function onPointerMove(e) {
    if (!active) return;
    var nx = ((e.clientX || 0) / (global.innerWidth || 1)) * 2 - 1;
    var ny = ((e.clientY || 0) / (global.innerHeight || 1)) * 2 - 1;
    pointerTiltX = nx * MAX_TILT;
    pointerTiltY = -ny * MAX_TILT;       // 上移→卡上仰
    // 判定指针是否在卡内（仅当不在 FX 面板/顶栏等排除元素上）
    if (!isInsideBrowse(e) || !wallMesh || !raycaster || !raycaster.setFromCamera) {
      inCard = false;
      return;
    }
    var rect = (renderer && renderer.domElement && renderer.domElement.getBoundingClientRect)
      ? renderer.domElement.getBoundingClientRect()
      : { left: 0, top: 0, width: global.innerWidth || 1, height: global.innerHeight || 1 };
    var sx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var sy = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ndc.set(sx, sy);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObject(wallMesh, false);
    inCard = !!(hits && hits.length);
  }
  function onWheel(e) {
    if (!active || !wallMesh) return;
    if (!isInsideBrowse(e)) return;   // FX 面板/顶栏 → 放行
    if (!inCard) return;              // 卡外 → 放行（滚轮不归海报墙，留给普通 3D 歌单架行为）
    e.preventDefault();
    e.stopPropagation();
    var count = items.length || 1;
    var maxStartRow = Math.max(0, totalRows - WINDOW_ROWS);
    var delta = (e.deltaY || 0) * 0.0016; // 灵敏度
    scrollTop += delta / (maxStartRow || 1);
    if (scrollTop < 0) scrollTop = 0;
    if (scrollTop > 1) scrollTop = 1;
    drawWindow();
    var footRows = Math.min(2, maxStartRow);
    if (scrollTop + 1 > (maxStartRow - footRows + 1) / (maxStartRow || 1) && !loading) {
      loadMore();
    }
  }
  function onPointerUp(e) {
    if (!active || !pointerDown) return;
    var dx = (e.clientX || 0) - pointerDown.x, dy = (e.clientY || 0) - pointerDown.y;
    var moved = Math.sqrt(dx * dx + dy * dy);
    var dt = now() - pointerDown.t;
    pointerDown = null;
    if (moved > 6 || dt > 600) return;        // 拖拽/长按 → 视为 orbit 操作，非点击
    onClick(e);
  }
  function onKeyDown(e) {
    if (!active) return;
    var tag = (e.target && e.target.tagName) ? e.target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var maxStartRow = Math.max(0, totalRows - WINDOW_ROWS);
    if (e.key === 'ArrowDown') { scrollTop = Math.min(1, scrollTop + 0.1); drawWindow(); }
    else if (e.key === 'ArrowUp') { scrollTop = Math.max(0, scrollTop - 0.1); drawWindow(); }
    else if (e.key === 'PageDown') { scrollTop = Math.min(1, scrollTop + 0.5); drawWindow(); }
    else if (e.key === 'PageUp') { scrollTop = Math.max(0, scrollTop - 0.5); drawWindow(); }
    if (scrollTop + 1 > (maxStartRow - Math.min(2, maxStartRow) + 1) / (maxStartRow || 1) && !loading) {
      loadMore();
    }
  }
  function onResize() {
    if (!active || !wallMesh) return;
    drawWindow();
    fitWall();
    startWallTick();
  }
  function isInsideBrowse(e) {
    var t = e.target;
    var doc = global.document;
    while (t && t !== doc && t !== doc.body) {
      if (t.id === 'search-area') return false;             // 红圈区顶栏
      if (t.className && /sfv-mfilter/.test(t.className)) return false; // 过滤条
      if (t.className && /sfv-hall|sfv-picker|fx-panel|fx-fab/.test(t.className)) return false; // 浏览厅/弹窗/ FX 浮层 DOM 不穿透
      if (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'A') return false;
      t = t.parentNode;
    }
    return true;
  }
  function onClick(e) {
    if (!active || !wallMesh) return;
    if (!isInsideBrowse(e)) return;
    var rect = (renderer && renderer.domElement && renderer.domElement.getBoundingClientRect)
      ? renderer.domElement.getBoundingClientRect()
      : { left: 0, top: 0, width: global.innerWidth || 1, height: global.innerHeight || 1 };
    var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (!raycaster || !raycaster.setFromCamera) return;
    ndc.set(nx, ny);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObject(wallMesh, false);
    if (!hits || !hits.length) return;
    var uv = hits[0].uv;
    if (!uv) return;
    var col = Math.floor(uv.x * gridCols);
    var row = Math.floor((1 - uv.y) * totalRows); // 纹理 flipY：画布顶部→v=1
    if (col < 0) col = 0; if (col >= gridCols) col = gridCols - 1;
    if (row < 0) row = 0; if (row >= totalRows) row = totalRows - 1;
    var idx = row * gridCols + col;
    if (idx < 0 || idx >= items.length) return;
    var item = items[idx];
    if (item && onCardClick) onCardClick(item);
  }

  // ============================================================
  //  湖面辉光带（暗示水线）
  // ============================================================
  function addLakeFloor() {
    if (!THREE || !group || lakeMesh) return;
    var cv = global.document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(130,175,255,0.18)');
    g.addColorStop(0.5, 'rgba(40,80,140,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    var tex = new THREE.CanvasTexture(cv);
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    lakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), mat);
    lakeMesh.rotation.x = -Math.PI / 2;
    lakeMesh.position.set(0, -(H_world / 2 + 0.10), 0);
    lakeMesh.renderOrder = 4;
    group.add(lakeMesh);
  }

  // ============================================================
  //  激活 / 反激活
  // ============================================================
  function switchMedia(newMedia) {
    mediaType = newMedia;
    wallOpacityTarget = 0; wallScaleTarget = 0; startWallTick();
    setTimeout(function () {
      items = []; pageNo = 0; loading = false; scrollTop = 0;
      if (wallMesh) drawWindow();
      wallOpacityTarget = 1; wallScaleTarget = 1; startWallTick();
      loadMore();
    }, COLLAPSE_MS);
  }
  function setLoader(fn) {
    loadPageFn = fn || loadPageFn;
    if (!active) return;
    wallOpacityTarget = 0; wallScaleTarget = 0; startWallTick();
    setTimeout(function () {
      items = []; pageNo = 0; loading = false; scrollTop = 0;
      if (wallMesh) drawWindow();
      wallOpacityTarget = 1; wallScaleTarget = 1; startWallTick();
      loadMore();
    }, COLLAPSE_MS);
  }
  function activate(opts) {
    opts = opts || {};
    if (!scene) scene = global.scene;
    if (!camera) camera = global.camera;
    if (!renderer) renderer = global.renderer;
    if (!orbit) orbit = global.orbit;
    mediaType = opts.mediaType || mediaType || 'movie';
    host = opts.host || host;
    onCardClick = opts.onCardClick || onCardClick;
    loadPageFn = opts.loadPage || loadPageFn;   // 湖光：分类感知加载器
    if (!scene || !THREE) return;

    // 防御性挂载：已激活且同组已在场景 → 仅切换加载器/媒体或忽略
    if (active && group && group.parent === scene) {
      if (opts.loadPage && opts.loadPage !== loadPageFn) setLoader(opts.loadPage);
      else if (opts.mediaType && opts.mediaType !== mediaType) switchMedia(opts.mediaType);
      return;
    }

    // 清理可能残留的旧 group（deactivate 后的 360ms 窗口内再次 activate）
    if (group && group.parent) group.parent.remove(group);
    disposeWall();

    active = true;

    if (host && host.classList) host.classList.add('sfv-3d-on');

    saveOrbit();
    setOrbitGrid();

    group = new THREE.Group();
    scene.add(group);
    makeWall();            // 建单张大卡 + 倒影 + 绘制 + 适配（只建一次）
    addLakeFloor();        // 湖面（用 H_world 定位）
    attachPointer();

    try {
      console.log('[SFV] browse3d activated (' + (opts && opts.mediaType ? opts.mediaType : '?') +
        '); single transparent wall added to scene (built once, no card hover-zoom, in-card=scroll / out-card=parallax+breath)' +
        (host ? '; host.sfv-3d-on set' : '') + '.');
    } catch (_) {}

    items = []; pageNo = 0; loading = false; scrollTop = 0;
    wallOpacityTarget = 1; wallScaleTarget = 1;
    startWallTick();
    loadMore();
  }
  function finalizeDeactivate() {
    if (active) return; // 坍缩期间被重新激活 → 跳过清理
    if (group && group.parent) group.parent.remove(group);
    disposeWall();
    clearImageCache();
    restoreOrbit();
    lakeMesh = null;
    group = null;
  }
  function deactivate() {
    if (!active) return;
    active = false;
    if (host && host.classList) host.classList.remove('sfv-3d-on');
    detachPointer();
    wallOpacityTarget = 0; wallScaleTarget = 0;
    if (!group) { finalizeDeactivate(); return; }
    startWallTick();
    setTimeout(finalizeDeactivate, COLLAPSE_MS);
  }

  // ============================================================
  //  spacechange：离开影视态 → 反激活（还原 orbit）
  // ============================================================
  function onSpaceChange() {
    var doc = global.document;
    var inVideo = doc && doc.body && doc.body.classList.contains('video-space-active');
    if (!inVideo && active) deactivate();
  }
  if (global.addEventListener) {
    var evName = (SFV.state && SFV.state.EVENT) ? SFV.state.EVENT : 'spacechange';
    global.addEventListener(evName, onSpaceChange);
  }

  // ============================================================
  //  导出 + 通知动态加载器
  // ============================================================
  SFV.browse3d = {
    activate: activate,
    deactivate: deactivate,
    setLoader: setLoader,
    isActive: function () { return active; },
    handleResize: function () { if (active) onResize(); },

    // —— 诊断接口（验收用）——
    _state: function () {
      return {
        active: active, media: mediaType,
        total: items.length, scrollTop: +scrollTop.toFixed(3),
        winStart: winStart, winItems: winCount,
        cards: winCount,                // 兼容旧字段（= 当前窗口张数）
        cols: gridCols, rows: totalRows,
        inCard: inCard ? 1 : 0, cardFocus: +cardFocus.toFixed(2),
        groupInScene: (group && group.parent === scene) ? 1 : 0,
        canvasW: Math.round(canvasW), canvasH: Math.round(canvasH),
        worldW: +W_world.toFixed(2), worldH: +H_world.toFixed(2),
        loading: loading,
        customLoader: !!loadPageFn, mediaDefault: mediaType
      };
    },
    _dump: function () {
      var s = this._state();
      try { console.log('[SFV-BROWSE3D-DIAG] dump: ' + JSON.stringify(s)); } catch (_) {}
      return s;
    }
  };

})(typeof window !== 'undefined' ? window : this);
