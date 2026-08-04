/*
 * Stellaflix 影视模块 — 视频播放器 (Step 3, 方案 B 全屏弹层)
 *
 * 设计：独立覆盖层承载 <video>，不触碰 Three.js 内部。S4 共存由 player.css 的
 *   body.video-space-active #canvas-container{transition:none!important} + 覆盖层
 *   极高 z-index 保证「粒子视觉让位」；另派发非侵入式 `sfv:render-pause` 钩子
 *   (detail.paused)，供 Three.js 层后续按需暂停渲染以降低 GPU 占用——本文件不修改 Three.js。
 *
 * 约束：单文件 <= 500 行；任何影视逻辑不写进 index.html；仅向 window.StellaflixVideo.player
 *       注册 API，供 Step 4 切换入口与本地媒体库调用。
 *
 * 范围：核心播放器 + 与 source-adapter 协同处理 HLS。HLS(.m3u8) 由 source-adapter
 *       动态加载 hls.js 并经自定义代理 loader 接入（跨域分片统一走 /api/proxy）。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var SETTINGS_KEY = 'stellaflix-video-settings';
  var SPEED_STEPS = [0.5, 1, 1.25, 1.5, 2];

  var overlay = null, videoEl = null, controls = null, fileInput = null;
  var playBtn = null, speedBtn = null, audioBtn = null, fillEl = null, timeEl = null;
  var currentId = null, currentUrl = null;
  var embedFrame = null, embedCloseBtn = null; // 第三方解析器 iframe 嵌入态
  var subtitleRenderer = null, subFileInput = null; // 字幕渲染器 / 本地字幕选择器
  var playNextFn = null, modeBtn = null;            // 连播：下一集回调 / 模式按钮
  var hideTimer = null, lastSpeedIdx = 1, lastSaveAt = 0;
  var danmakuLayer = null, danmakuEngine = null;    // 弹幕覆盖层 / 弹幕引擎实例

  function getDoc() { return global.document; }

  function getSettings() {
    try {
      var raw = global.localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function setSetting(k, v) {
    var s = getSettings(); s[k] = v;
    try { global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  // ---- 播放模式（③ 连播）----
  // sequence   : 播完自动下一集（无下一集则停）
  // repeat-one : 单集循环
  // off        : 播完即停
  var MODE_ORDER = ['sequence', 'repeat-one', 'off'];
  var MODE_LABEL = { 'sequence': '连播', 'repeat-one': '单集循环', 'off': '不连播' };

  function getPlayMode() {
    var m = getSettings().playMode;
    return MODE_LABEL[m] ? m : 'sequence'; // 默认连播；非法值回落
  }
  function setPlayMode(m) {
    if (!MODE_LABEL[m]) m = 'sequence';
    setSetting('playMode', m);
    if (modeBtn) modeBtn.textContent = MODE_LABEL[m];
    return m;
  }
  function cyclePlayMode() {
    var i = MODE_ORDER.indexOf(getPlayMode());
    return setPlayMode(MODE_ORDER[(i + 1) % MODE_ORDER.length]);
  }

  /**
   * 注册「下一集」回调。由 online.js 在成功起播某一集之后调用（必须在 open 之后，
   * 因为 prepareForPlay / openFile / openEmbed 会主动清空，确保不会跨片残留）。
   * 传 null / 非函数即注销。
   */
  function setPlayNext(fn) { playNextFn = (typeof fn === 'function') ? fn : null; }
  function hasPlayNext() { return !!playNextFn; }

  function onMediaEnded() {
    saveProgress();
    var mode = getPlayMode();
    if (mode === 'repeat-one') {
      try { videoEl.currentTime = 0; } catch (e) {}
      var p0 = videoEl.play();
      if (p0 && p0.catch) p0.catch(function () {});
      return;
    }
    if (mode !== 'sequence' || !playNextFn) return;
    var fn = playNextFn;
    playNextFn = null; // 先摘钩再调用，避免异常导致重复触发
    try { fn(); } catch (e) {
      if (global.console) global.console.warn('[SFV player] 连播下一集失败:', e && e.message);
    }
  }

  // 非侵入式 GPU 让位钩子：不修改 Three.js，仅广播意图。
  function emitRenderPause(paused) {
    if (global.CustomEvent && global.dispatchEvent) {
      try {
        global.dispatchEvent(new global.CustomEvent('sfv:render-pause', { detail: { paused: !!paused } }));
      } catch (e) { /* 无监听方则忽略 */ }
    }
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    var d = getDoc();

    overlay = d.createElement('div');
    overlay.id = 'sfv-overlay';
    overlay.className = 'sfv-overlay';

    videoEl = d.createElement('video');
    videoEl.className = 'sfv-video';
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    // 默认静音：Chrome 自动播放策略要求未静音视频必须有用户手势才能 play()。
    // HLS 加载链路是异步的（加载 hls.js → 拉取 m3u8 → 解析清单），到 MANIFEST_PARSED 时
    // 早已脱离手势上下文，play() 会被浏览器拦截导致黑屏（有时长无画面）。
    // 默认 muted 保证 autoplay 始终合法；用户可通过音轨按钮或首次点击取消静音。
    videoEl.muted = true;
    videoEl.setAttribute('muted', '');

    controls = d.createElement('div');
    controls.id = 'sfv-controls';

    var progress = d.createElement('div');
    progress.className = 'sfv-progress';
    fillEl = d.createElement('div');
    fillEl.className = 'sfv-progress-fill';
    progress.appendChild(fillEl);
    progress.addEventListener('click', function (ev) {
      var rect = progress.getBoundingClientRect ? progress.getBoundingClientRect() : { width: 1, left: 0 };
      var x = (ev && typeof ev.offsetX === 'number') ? ev.offsetX : 0;
      var ratio = rect.width ? (x - (rect.left || 0)) / rect.width : 0;
      seek(ratio);
    });

    timeEl = d.createElement('div');
    timeEl.className = 'sfv-time';
    timeEl.textContent = '0:00 / 0:00';

    playBtn = mkBtn('sfv-btn-play', '▶', togglePlay);
    speedBtn = mkBtn('sfv-btn-speed', '1x', cycleSpeed);
    audioBtn = mkBtn('sfv-btn-audio', '音轨', cycleAudio);
    var btnFs = mkBtn('sfv-btn-fs', '⛶', toggleFullscreen);
    var btnClose = mkBtn('sfv-btn-close', '✕', close);

    controls.appendChild(playBtn);
    controls.appendChild(progress);
    controls.appendChild(timeEl);
    controls.appendChild(speedBtn);
    controls.appendChild(audioBtn);
    var btnSub = mkBtn('sfv-btn-sub', '字幕', openSubtitleMenu);
    controls.appendChild(btnSub);
    var btnDanmaku = mkBtn('sfv-btn-danmaku', '弹幕', function () {
      if (SFV.danmaku && SFV.danmaku.ui && SFV.danmaku.ui.openPanel) SFV.danmaku.ui.openPanel();
    });
    controls.appendChild(btnDanmaku);
    modeBtn = mkBtn('sfv-btn-mode', MODE_LABEL[getPlayMode()], cyclePlayMode);
    controls.appendChild(modeBtn);
    controls.appendChild(btnFs);
    controls.appendChild(btnClose);

    overlay.appendChild(videoEl);

    // 弹幕覆盖层：覆盖整个播放区，穿透点击（pointer-events:none），置于视频之上、控制条之下
    danmakuLayer = d.createElement('div');
    danmakuLayer.id = 'sfv-danmaku-layer';
    danmakuLayer.className = 'sfv-danmaku-layer';
    overlay.appendChild(danmakuLayer);
    if (SFV.danmaku && SFV.danmaku.engine) {
      try {
        danmakuEngine = new SFV.danmaku.engine.DanmakuEngine();
        danmakuEngine.mount(danmakuLayer);
      } catch (e) { danmakuEngine = null; }
    }
    // 注入已保存的弹幕凭证/选项（如 ui.js 已加载）
    if (SFV.danmaku && SFV.danmaku.ui && SFV.danmaku.ui.init) {
      try { SFV.danmaku.ui.init(); } catch (e) {}
    }

    overlay.appendChild(controls);

    // 隐藏的文件选择器，供 openFilePicker 调起
    fileInput = d.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) openFile(fileInput.files[0]);
    });

    // 字幕文件选择器（.vtt / .srt）
    subFileInput = d.createElement('input');
    subFileInput.type = 'file';
    subFileInput.accept = '.vtt,.srt,text/vtt,text/plain';
    subFileInput.style.display = 'none';
    subFileInput.addEventListener('change', function () {
      if (subFileInput.files && subFileInput.files[0]) {
        loadSubtitle(subFileInput.files[0]).catch(function (e) {
          if (SFV.online && SFV.online.toast) SFV.online.toast('字幕加载失败：' + (e && e.message ? e.message : e));
        });
      }
    });

    d.body.appendChild(overlay);
    d.body.appendChild(fileInput);
    d.body.appendChild(subFileInput);

    wireVideoEvents();
    wireIdle();
    wireUnmuteOnInteraction();
    return overlay;
  }

  function mkBtn(cls, label, onClick) {
    var b = getDoc().createElement('button');
    b.className = 'sfv-btn ' + cls;
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function wireVideoEvents() {
    videoEl.addEventListener('loadedmetadata', updateTime);
    videoEl.addEventListener('timeupdate', function () {
      updateTime();
      var now = Date.now();
      if (now - lastSaveAt > 4000) { lastSaveAt = now; saveProgress(); }
      var sr = getSubRenderer();
      if (sr) sr.update(videoEl.currentTime);
      if (danmakuEngine) danmakuEngine.update(videoEl.currentTime);
    });
    videoEl.addEventListener('seeked', function () {
      if (danmakuEngine) danmakuEngine.update(videoEl.currentTime);
    });
    videoEl.addEventListener('play', function () { setPlayIcon(true); });
    videoEl.addEventListener('pause', function () { setPlayIcon(false); saveProgress(); });
    videoEl.addEventListener('ended', onMediaEnded);
    videoEl.addEventListener('error', function () {
      if (global.console) global.console.warn('[SFV player] media error for', currentId);
    });
  }

  // 首次用户交互时取消静音（Chrome 自动播放策略兼容）。
  // 仅触发一次：用户首次点击/触摸播放区域后即恢复声音，之后不再干预。
  function wireUnmuteOnInteraction() {
    if (!videoEl || !overlay) return;
    function unmuteOnce() {
      if (videoEl && videoEl.muted) {
        videoEl.muted = false;
        videoEl.removeAttribute('muted');
      }
      overlay.removeEventListener('click', unmuteOnce);
      overlay.removeEventListener('touchstart', unmuteOnce);
      if (videoEl) { videoEl.removeEventListener('click', unmuteOnce); videoEl.removeEventListener('touchstart', unmuteOnce); }
    }
    overlay.addEventListener('click', unmuteOnce);
    overlay.addEventListener('touchstart', unmuteOnce);
    videoEl.addEventListener('click', unmuteOnce);
    videoEl.addEventListener('touchstart', unmuteOnce);
  }

  function wireIdle() {
    var onMove = function () {
      if (!overlay) return;
      overlay.classList.remove('sfv-idle');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        if (overlay && SFV.state && SFV.state.getSpace() === 'video') overlay.classList.add('sfv-idle');
      }, 3000);
    };
    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('touchstart', onMove);
  }

  function setPlayIcon(playing) {
    if (playBtn) playBtn.textContent = playing ? '⏸' : '▶';
  }

  function updateTime() {
    if (!timeEl || !videoEl) return;
    var c = Math.floor(videoEl.currentTime || 0);
    var d = Math.floor(videoEl.duration || 0);
    timeEl.textContent = fmt(c) + ' / ' + fmt(d);
    var ratio = d ? (c / d) : 0;
    if (fillEl) fillEl.style.width = (ratio * 100) + '%';
  }

  function fmt(sec) {
    sec = Math.max(0, sec | 0);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function openFile(file) {
    if (!file) return false;
    ensureOverlay();
    clearEmbed();
    clearSubtitle();
    playNextFn = null;
    var id = 'file:' + (file.path || file.name || ('blob-' + Date.now()));
    currentId = id;
    var url = null;
    if (typeof URL !== 'undefined' && URL.createObjectURL &&
        (typeof Blob !== 'undefined' && file instanceof Blob) || (typeof File !== 'undefined' && file instanceof File)) {
      url = URL.createObjectURL(file);
    } else {
      url = file.path || file.name || '';
    }
    if (!url) return false;
    currentUrl = url;
    videoEl.src = url;
    restoreProgress();
    var sp = getSettings().speed;
    if (sp) videoEl.playbackRate = sp;
    SFV.model.addToLibrary({ id: id, title: (file.name || id), source: 'local' });
    SFV.state.setSpace('video');
    overlay.classList.add('sfv-show');
    emitRenderPause(true);
    var p = videoEl.play();
    if (p && p.catch) p.catch(function () {});
    return true;
  }

  // ---- 弹幕自动加载（对齐 Kazumi：播片时根据标题自动搜弹幕）----

  var AUTO_LOAD_KEY = 'stellaflix-danmaku-auto-load';  // localStorage 开关

  // 从标题提取集数（对齐 Kazumi extractEpisodeNumber）
  // 匹配：第3集 / 第03话 / 第12集 / EP03 / E.5 / S01E05 / 01-05 / 第3期 等
  function extractEpisode(title) {
    if (!title) return null;
    var patterns = [
      /(?:第\s*(\d+)\s*[话集季期])/i,           // 第3集 / 第03话 / 第12季
      /[Ss](\d{1,2})\s*[Ee]?[Pp]?(\d{1,2})/,   // S01E05 / S1EP3（取 episode）
      /(?:EP|[Ee])[Pp]?\s*\.?\s*(\d+)/i,        // EP03 / ep3 / E.5
      /(\d{1,2})\s*-\s*\d{1,2}/,                // 01-05 / 1-12（取后半部分）
      /\.(\d{1,3})\./,                           // 点分集数：.03. / .12.（CMS10 常见命名）
      /\s-\s*(\d{1,3})(?:\s|$|\[)/,              // 独立横杠集数：- 12 / - 12 [1080p]
      /^(\d{1,2})(?!\d)/                          // 纯数字开头：03 / 12
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = title.match(patterns[i]);
      if (m) {
        // S01E05 格式返回第二个捕获组（E 部分）
        var num = m[m.length - 1]; // 取最后一个捕获组
        if (num) return parseInt(num, 10) || null;
      }
    }
    return null;
  }

  // 番名归一化：去除集数标记与分辨率/编码后缀，仅用于弹弹play 搜索关键词，
  // 提升「脏标题（如 进击的巨人.03.BDRip）」的番剧匹配率。集数已由 extractEpisode 单独提取。
  function normalizeAnimeName(title) {
    if (!title) return title;
    var t = String(title);
    // 0) 去除方括号源标记 / 分辨率（如 [AGE] / [1080p]，Kazumi 规则源常见）
    t = t.replace(/\[[^\]]*\]/g, ' ');
    // 1) 去除集数标记（保留本函数仅用于番名搜索）
    t = t.replace(/(?:第\s*\d+\s*[话集季期])|[Ss]\d{1,2}[Ee][Pp]?\d{1,2}|(?:[Ee][Pp]?\s*\.?\s*\d+)|(?:\.\s*\d{1,3}\s*\.)|(?:\s*-\s*\d{1,3}(?:\s|$))/g, ' ');
    // 2) 去除常见后缀噪声（分辨率/编码/封装）
    t = t.replace(/\b(?:BDRip|BRRip|WEB[-]?DL|WEBRip|HDTV|HDRip|DVDRip|BluRay|BD|AAC|FLAC|MP4|MKV|AVI|HEVC|x264|x265|10bit|8bit|2160p|1080p|720p|4K|H264|H265)\b/gi, ' ');
    // 3) 统一分隔符并清理多余空格
    t = t.replace(/[._•·]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return t;
  }

  // 自动加载弹幕（异步、非阻塞，失败静默但有 toast 提示）
  function autoLoadDanmaku(title) {
    if (!title || !danmakuEngine || !SFV.player || !SFV.player.danmaku || !SFV.player.danmaku.loadFromClient) return;
    // 检查开关
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_LOAD_KEY) === 'false') return;
    } catch (e) { return; }
    // 检查凭证（无凭证则跳过，避免每次都弹错误）
    if (SFV.danmaku.client && !SFV.danmaku.client.hasCredentials()) return;
    var ep = extractEpisode(title);
    var cleanTitle = normalizeAnimeName(title); // 番名归一化：去集数/后缀，提升弹弹play 匹配率
    // toast: 开始搜索
    if (SFV.online && SFV.online.toast) {
      SFV.online.toast('正在搜索弹幕…');
    }
    SFV.player.danmaku.loadFromClient(cleanTitle, ep).then(function (list) {
      if (list && list.length) {
        if (SFV.online && SFV.online.toast) {
          SFV.online.toast('弹幕已载入 ' + list.length + ' 条');
        }
      } else {
        // 搜索成功但无结果（该番剧可能暂无弹幕）
        /* 静默 — 无弹幕不报错 */
      }
    }).catch(function (e) {
      // 仅在网络/认证错误时提示一次，避免每次播片都弹
      if (SFV.online && SFV.online.toast && e && e.message !== 'DANMAKU_AUTH_REQUIRED') {
        SFV.online.toast('弹幕加载失败：' + (e.message || '未知错误'));
      }
    });
  }

  // 准备播放（创建 overlay、设置 id/进度/空间态、显示层），但不设置 video.src。
  // 供 HLS 路径复用：hls.js 接管 src 设置。
  function prepareForPlay(id, title) {
    ensureOverlay();
    clearSubtitle(); // 换片必须清空上一部的字幕轨（openUrl / HLS / FLV 共用此入口）
    if (danmakuEngine) danmakuEngine.load([]); // 换片清空上一部弹幕
    playNextFn = null; // 换片默认无下一集；online.js 起播成功后会重新注册
    currentId = id;
    restoreProgress();
    var sp = getSettings().speed;
    if (sp) videoEl.playbackRate = sp;
    if (id.indexOf('file:') === 0 || id.indexOf('url:') === 0) {
      SFV.model.addToLibrary({ id: id, title: title || currentUrl || id, source: 'url' });
    }
    SFV.state.setSpace('video');
    overlay.classList.add('sfv-show');
    emitRenderPause(true);
    // 自动加载弹幕：根据视频标题搜弹幕（对齐 Kazumi 行为）
    try { autoLoadDanmaku(title); } catch (e) {}
    return true;
  }

  // opts 可选：{ id, title } —— 供 source-adapter 在走 /api/proxy 时把进度键锚定到
  // 原始 URL，而非代理后的 URL。不传时行为与旧版完全一致（向后兼容）。
  function openUrl(url, opts) {
    if (!url) return false;
    opts = opts || {};
    ensureOverlay();
    clearEmbed();
    var id = opts.id || ('url:' + url);
    currentUrl = url;
    prepareForPlay(id, opts.title);
    videoEl.src = url;
    var p = videoEl.play();
    if (p && p.catch) p.catch(function () {});
    return true;
  }

  function close() {
    if (!overlay) return;
    saveProgress();
    clearEmbed(); // 移除可能存活的解析器 iframe
    clearSubtitle();
    if (danmakuEngine) danmakuEngine.load([]); // 关闭时清空弹幕
    playNextFn = null;
    if (videoEl) videoEl.pause();
    // 通知 source-adapter 销毁可能存活的 hls.js 实例
    if (SFV.source && typeof SFV.source.onPlayerClose === 'function') {
      try { SFV.source.onPlayerClose(); } catch (e) {}
    }
    overlay.classList.remove('sfv-show');
    if (currentUrl && currentUrl.indexOf('blob:') === 0 && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(currentUrl); } catch (e) {}
    }
    currentUrl = null;
    currentId = null;
    // 关闭播放器 ≠ 切换空间（铁律：只有影视/音乐空间按钮能切换空间）
    // 仅隐藏播放器 overlay，保持当前空间状态不变
    emitRenderPause(false);
  }

  function getVideoEl() { ensureOverlay(); return videoEl; }
  function setCurrentUrl(u) { currentUrl = u; }

  // 清理嵌入态（移除解析器 iframe + 关闭按钮，恢复原生 video/控制条显示）。
  // 在 openUrl / openFile / openEmbed 入口调用，确保切换播放源时不会残留旧 iframe。
  function clearEmbed() {
    if (embedFrame && overlay) { try { overlay.removeChild(embedFrame); } catch (e) {} }
    embedFrame = null;
    if (embedCloseBtn && overlay) { try { overlay.removeChild(embedCloseBtn); } catch (e) {} }
    embedCloseBtn = null;
    if (videoEl) videoEl.style.display = '';
    if (controls) controls.style.display = '';
  }

  // ---- 字幕：渲染器懒加载（SFV.subtitle 在 player.js 之后引入，运行时必已存在）----
  function getSubRenderer() {
    if (!subtitleRenderer && SFV.subtitle && overlay) {
      try { subtitleRenderer = new SFV.subtitle.SubtitleRenderer(overlay); } catch (e) { return null; }
    }
    return subtitleRenderer;
  }

  /**
   * 加载字幕（URL 或本地 File），自动识别 SRT/VTT 并解析为 cue 后渲染。
   * @returns {Promise<number>} 解析到的 cue 数量
   */
  function loadSubtitle(urlOrFile) {
    ensureOverlay();
    var r = getSubRenderer();
    if (!r) return Promise.reject(new Error('no-subtitle-support'));
    return SFV.subtitle.fetchText(urlOrFile).then(function (text) {
      var fmt = SFV.subtitle.detectFormat(text);
      var cues = fmt === 'vtt' ? SFV.subtitle.parseVtt(text) : SFV.subtitle.parseSrt(text);
      if (!cues.length) throw new Error('no-cues-parsed');
      r.setCues(cues);
      r.setActive(true);
      return cues.length;
    });
  }

  function setSubtitleVisible(on) {
    var r = getSubRenderer();
    if (r) r.setActive(!!on);
  }

  function clearSubtitle() {
    if (subtitleRenderer) subtitleRenderer.clear();
  }

  /**
   * 字幕菜单：已加载则切换显隐；未加载则弹出 URL 输入条 + 本地文件选择。
   * 复用 .sfv-urlbar 样式（Electron 无 window.prompt，故自建）。
   */
  function openSubtitleMenu() {
    ensureOverlay();
    var r = getSubRenderer();
    if (r && r.cues.length) { // 已加载：切换显隐
      r.setActive(!r.active);
      return;
    }
    if (overlay.subBar && overlay.subBar.parentNode) {
      overlay.subBar.parentNode.removeChild(overlay.subBar);
      overlay.subBar = null;
      return;
    }
    var d = getDoc();
    var bar = d.createElement('div');
    bar.className = 'sfv-urlbar sfv-sub-bar';
    var input = d.createElement('input');
    input.className = 'sfv-urlbar-input';
    input.type = 'text';
    input.placeholder = '字幕 URL（.vtt / .srt）';
    var okBtn = mkBtn('sfv-btn-sub-open', '打开', function () {
      var v = (input.value || '').trim();
      if (!v) { closeSubBar(); return; }
      loadSubtitle(v).catch(function (e) {
        if (SFV.online && SFV.online.toast) SFV.online.toast('字幕加载失败：' + (e && e.message ? e.message : e));
      });
      closeSubBar();
    });
    var fileBtn = mkBtn('sfv-btn-sub-file', '本地文件', function () {
      if (subFileInput && subFileInput.click) subFileInput.click();
      closeSubBar();
    });
    var cancelBtn = mkBtn('sfv-btn-sub-cancel', '关闭', closeSubBar);
    bar.appendChild(input); bar.appendChild(okBtn); bar.appendChild(fileBtn); bar.appendChild(cancelBtn);
    overlay.appendChild(bar);
    overlay.subBar = bar;
    if (input.focus) input.focus();
    function closeSubBar() { if (bar.parentNode) bar.parentNode.removeChild(bar); overlay.subBar = null; }
  }

  // 嵌入第三方解析器页面播放（解析器自渲染播放器，客户端解密真实流地址）。
  // 用于 agedm.io 等「播放页本身不含直链、真实流由解析器 iframe 客户端解密」的站点。
  // 这类页面无法提取 m3u8/mp4 直链，只能把整个解析器页面嵌入 iframe 由其自行播放。
  function openEmbed(url, opts) {
    if (!url) return false;
    opts = opts || {};
    ensureOverlay();
    clearEmbed();
    clearSubtitle(); // 解析器 iframe 自带字幕，外层覆盖层字幕必须清掉避免双份
    playNextFn = null; // iframe 内播放无 ended 事件，无法连播
    currentId = opts.id || ('embed:' + url);

    // 隐藏原生 video 与控制条（解析器自带完整播放器 UI）
    if (videoEl) videoEl.style.display = 'none';
    if (controls) controls.style.display = 'none';

    embedFrame = getDoc().createElement('iframe');
    embedFrame.className = 'sfv-embed';
    // 放宽权限：自动播放 / 加密媒体 / 全屏 / 画中画，匹配解析器播放器所需能力
    embedFrame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope');
    embedFrame.setAttribute('allowfullscreen', '');
    embedFrame.setAttribute('referrerpolicy', 'no-referrer');
    embedFrame.src = url;
    overlay.appendChild(embedFrame);

    // 独立关闭按钮（控制条已隐藏）
    embedCloseBtn = getDoc().createElement('button');
    embedCloseBtn.className = 'sfv-embed-close';
    embedCloseBtn.type = 'button';
    embedCloseBtn.textContent = '✕';
    embedCloseBtn.setAttribute('title', '关闭');
    embedCloseBtn.addEventListener('click', close);
    overlay.appendChild(embedCloseBtn);

    if (opts.title) {
      try { SFV.model.addToLibrary({ id: currentId, title: opts.title, source: 'embed' }); } catch (e) {}
    }
    SFV.state.setSpace('video');
    overlay.classList.add('sfv-show');
    emitRenderPause(true);
    return true;
  }

  function saveProgress() {
    if (!videoEl || !currentId) return;
    var pos = Math.floor(videoEl.currentTime || 0);
    var dur = Math.floor(videoEl.duration || 0);
    SFV.model.setProgress(currentId, pos, dur);
  }

  function restoreProgress() {
    if (!videoEl || !currentId) return;
    var p = SFV.model.getProgress(currentId);
    if (p && p.position && (!videoEl.duration || p.position < videoEl.duration)) {
      try { videoEl.currentTime = p.position; } catch (e) {}
    }
  }

  function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) { var p = videoEl.play(); if (p && p.catch) p.catch(function () {}); }
    else videoEl.pause();
  }

  function seek(ratio) {
    if (!videoEl || !videoEl.duration) return;
    ratio = Math.max(0, Math.min(1, ratio));
    try { videoEl.currentTime = ratio * videoEl.duration; } catch (e) {}
  }

  function cycleSpeed() {
    lastSpeedIdx = (lastSpeedIdx + 1) % SPEED_STEPS.length;
    setSpeed(SPEED_STEPS[lastSpeedIdx]);
  }
  function setSpeed(rate) {
    if (!videoEl || !rate) return;
    videoEl.playbackRate = rate;
    setSetting('speed', rate);
    if (speedBtn) speedBtn.textContent = rate + 'x';
  }

  function cycleAudio() {
    if (!videoEl || !videoEl.audioTracks || !videoEl.audioTracks.length) return;
    var n = videoEl.audioTracks.length, cur = 0;
    for (var i = 0; i < n; i++) if (videoEl.audioTracks[i] && videoEl.audioTracks[i].enabled) cur = i;
    setAudioTrack((cur + 1) % n);
  }
  function setAudioTrack(index) {
    if (!videoEl || !videoEl.audioTracks) return;
    var n = videoEl.audioTracks.length;
    for (var i = 0; i < n; i++) {
      if (videoEl.audioTracks[i]) videoEl.audioTracks[i].enabled = (i === index);
    }
    setSetting('audioTrack', index);
  }

  function toggleFullscreen() {
    if (!overlay) return;
    var d = getDoc();
    try {
      if (d.fullscreenElement) { if (d.exitFullscreen) d.exitFullscreen(); }
      else if (overlay.requestFullscreen) overlay.requestFullscreen();
      else if (overlay.webkitRequestFullscreen) overlay.webkitRequestFullscreen();
    } catch (e) {}
  }

  function openFilePicker() {
    ensureOverlay();
    if (fileInput && fileInput.click) fileInput.click();
  }

  SFV.player = {
    openFile: openFile,
    openUrl: openUrl,
    openEmbed: openEmbed,
    close: close,
    togglePlay: togglePlay,
    seek: seek,
    setSpeed: setSpeed,
    cycleSpeed: cycleSpeed,
    setAudioTrack: setAudioTrack,
    cycleAudio: cycleAudio,
    toggleFullscreen: toggleFullscreen,
    openFilePicker: openFilePicker,
    loadSubtitle: loadSubtitle,
    setSubtitleVisible: setSubtitleVisible,
    clearSubtitle: clearSubtitle,
    openSubtitleMenu: openSubtitleMenu,
    getSubtitleRenderer: getSubRenderer,
    setPlayNext: setPlayNext,
    hasPlayNext: hasPlayNext,
    getPlayMode: getPlayMode,
    setPlayMode: setPlayMode,
    cyclePlayMode: cyclePlayMode,
    isOpen: function () { return !!(overlay && overlay.classList.contains('sfv-show')); },
    currentId: function () { return currentId; },
    getVideoEl: getVideoEl,
    setCurrentUrl: setCurrentUrl,
    prepareForPlay: prepareForPlay,
    // ---- 弹幕控制 API ----
    danmaku: {
      // 载入弹幕列表（DanmakuEntry[]），会重置引擎从头播放
      setEntries: function (entries) {
        if (!danmakuEngine) return false;
        danmakuEngine.load(entries || []);
        return true;
      },
      // 经多数据源管理器按「番名 + 集数」拉取并合并载入
      // （优先 sources.fetchAll，自动合并所有已启用源；回退到单 client）
      loadFromClient: function (animeTitle, episode) {
        if (!danmakuEngine) return Promise.reject(new Error('DANMAKU_UNAVAILABLE'));
        var params = { animeTitle: animeTitle, episode: episode };
        var ctx = { onProgress: function (msg) { if (SFV.online && SFV.online.toast) SFV.online.toast(msg); } };
        var fetcher = null;
        if (SFV.danmaku && SFV.danmaku.sources && SFV.danmaku.sources.fetchAll) {
          fetcher = function () { return SFV.danmaku.sources.fetchAll(params, ctx); };
        } else if (SFV.danmaku && SFV.danmaku.client) {
          fetcher = function () { return SFV.danmaku.client.fetchForEpisode(animeTitle, episode, ctx.onProgress); };
        }
        if (!fetcher) return Promise.reject(new Error('DANMAKU_UNAVAILABLE'));
        return Promise.resolve(fetcher()).then(function (list) {
          danmakuEngine.load(list || []);
          return list;
        });
      },
      // 清空当前弹幕
      clear: function () { if (danmakuEngine) danmakuEngine.load([]); },
      // 实时更新样式/开关（对象可只传部分字段）
      setOptions: function (opts) { if (danmakuEngine) danmakuEngine.setOptions(opts || {}); },
      getOptions: function () { return danmakuEngine ? danmakuEngine.opts : null; },
      // 显隐整个弹幕层
      setVisible: function (on) { if (danmakuLayer) danmakuLayer.style.display = on ? '' : 'none'; },
      isVisible: function () { return danmakuLayer ? danmakuLayer.style.display !== 'none' : false; },
      // 暴露引擎实例（供高级用法 / 测试）
      engine: function () { return danmakuEngine; },
      // 自动加载控制
      setAutoLoad: function (on) {
        try { if (typeof localStorage !== 'undefined') localStorage.setItem(AUTO_LOAD_KEY, on ? 'true' : 'false'); } catch (e) {}
      },
      getAutoLoad: function () {
        try { return localStorage.getItem(AUTO_LOAD_KEY) !== 'false'; } catch (e) { return true; }
      },
      AUTO_LOAD_KEY: AUTO_LOAD_KEY
    }
  };
})(typeof window !== 'undefined' ? window : this);
