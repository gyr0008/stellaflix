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
 * 范围：本轮仅核心播放器。hls.js 在线 .m3u8 流留待网盘/在线源接入时按需动态加载。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var SETTINGS_KEY = 'stellaflix-video-settings';
  var SPEED_STEPS = [0.5, 1, 1.25, 1.5, 2];

  var overlay = null, videoEl = null, controls = null, fileInput = null;
  var playBtn = null, speedBtn = null, audioBtn = null, fillEl = null, timeEl = null;
  var currentId = null, currentUrl = null;
  var hideTimer = null, lastSpeedIdx = 1, lastSaveAt = 0;

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
    controls.appendChild(btnFs);
    controls.appendChild(btnClose);

    overlay.appendChild(videoEl);
    overlay.appendChild(controls);

    // 隐藏的文件选择器，供 openFilePicker 调起
    fileInput = d.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) openFile(fileInput.files[0]);
    });

    d.body.appendChild(overlay);
    d.body.appendChild(fileInput);

    wireVideoEvents();
    wireIdle();
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
    });
    videoEl.addEventListener('play', function () { setPlayIcon(true); });
    videoEl.addEventListener('pause', function () { setPlayIcon(false); saveProgress(); });
    videoEl.addEventListener('ended', saveProgress);
    videoEl.addEventListener('error', function () {
      if (global.console) global.console.warn('[SFV player] media error for', currentId);
    });
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

  // opts 可选：{ id, title } —— 供 source-adapter 在走 /api/proxy 时把进度键锚定到
  // 原始 URL，而非代理后的 URL。不传时行为与旧版完全一致（向后兼容）。
  function openUrl(url, opts) {
    if (!url) return false;
    opts = opts || {};
    ensureOverlay();
    var id = opts.id || ('url:' + url);
    currentId = id;
    currentUrl = url;
    videoEl.src = url;
    restoreProgress();
    var sp = getSettings().speed;
    if (sp) videoEl.playbackRate = sp;
    // 仅本地/直链进「片库」（本地文件标识 file: 与直链 url:）；在线剧集复合键
    // （站点:vod:集数）不入库，改由 online.js 记录「历史/心动/收藏/片单」四类模型。
    if (id.indexOf('file:') === 0 || id.indexOf('url:') === 0) {
      SFV.model.addToLibrary({ id: id, title: opts.title || url, source: 'url' });
    }
    SFV.state.setSpace('video');
    overlay.classList.add('sfv-show');
    emitRenderPause(true);
    var p = videoEl.play();
    if (p && p.catch) p.catch(function () {});
    return true;
  }

  function close() {
    if (!overlay) return;
    saveProgress();
    if (videoEl) videoEl.pause();
    overlay.classList.remove('sfv-show');
    if (currentUrl && currentUrl.indexOf('blob:') === 0 && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(currentUrl); } catch (e) {}
    }
    currentUrl = null;
    currentId = null;
    SFV.state.setSpace('music');
    emitRenderPause(false);
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
    close: close,
    togglePlay: togglePlay,
    seek: seek,
    setSpeed: setSpeed,
    cycleSpeed: cycleSpeed,
    setAudioTrack: setAudioTrack,
    cycleAudio: cycleAudio,
    toggleFullscreen: toggleFullscreen,
    openFilePicker: openFilePicker,
    isOpen: function () { return !!(overlay && overlay.classList.contains('sfv-show')); },
    currentId: function () { return currentId; },
  };
})(typeof window !== 'undefined' ? window : this);
