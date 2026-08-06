/*
 * Stellaflix 影视模块 — 底部控制器桥接 (影视态 #bottom-bar → 视频播放器唯一控制器)
 *
 * 职责（单文件，逻辑全在此，不写进 index.html）：
 *  - 监听 player.js 派发的 sfv:player-open / sfv:player-close，切换 body.video-player-active；
 *    影视态非播放场景 #bottom-bar 由 CSS 隐藏，仅播放态显示并浮于视频之上。
 *  - 激活时：捕获并替换 play/prev/next/mode/fullscreen 的 onclick 为视频处理函数；
 *    动态注入 倍速/字幕/弹幕/音轨/关闭 五个视频键；绑定 videoEl 事件更新进度/时间/图标/音量/标题。
 *  - 退出时：恢复原始 onclick、移除注入键、解绑事件。
 *  - 嵌入态（meta.embed）不激活：iframe 自带播放器，无跨域控制先例，沿用其自带 UI。
 *  - 监听 spacechange：切到音乐空间且视频在播时强制 SFV.player.close()（铁律：仅空间按钮能切换空间）。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  var doc = global.document;

  var origHandlers = {};   // 按钮 id -> 原始 onclick（用于恢复）
  var injectedBtns = [];   // 动态注入的视频键 DOM
  var videoEl = null;
  var active = false;

  function $(id) { return doc && doc.getElementById ? doc.getElementById(id) : null; }
  function fmt(sec) {
    sec = Math.max(0, sec | 0);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  // ---------- 激活 / 退出 ----------
  function activate(meta) {
    meta = meta || {};
    if (meta.embed) return;            // 嵌入态不启用底部控制器
    if (!doc || !doc.body) return;
    if (active) { applyMeta(meta); return; }
    active = true;
    var bar = $('bottom-bar');
    doc.body.classList.add('video-player-active');
    if (bar) bar.classList.add('visible');
    videoEl = (SFV.player && SFV.player.getVideoEl) ? SFV.player.getVideoEl() : null;
    swapHandlers(true);
    injectVideoButtons();
    bindVideoEvents();
    applyMeta(meta);
    updateNavButtons();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    swapHandlers(false);
    removeInjectedButtons();
    unbindVideoEvents();
    if (doc && doc.body) doc.body.classList.remove('video-player-active', 'video-player-idle');
    var bar = $('bottom-bar');
    if (bar) bar.classList.remove('visible');
    videoEl = null;
  }

  // ---------- onclick 替换 ----------
  function swapHandlers(on) {
    var map = {
      'play-btn': on ? onPlay : null,
      'prev-btn': on ? onPrev : null,
      'next-btn': on ? onNext : null,
      'play-mode-btn': on ? onMode : null,
      'fullscreen-toggle-btn': on ? onFullscreen : null
    };
    Object.keys(map).forEach(function (id) {
      // fullscreen-toggle-btn 在 #bottom-bar 中是 class 而非 id，需单独按类查找
      var el = (id === 'fullscreen-toggle-btn')
        ? (doc.querySelector ? doc.querySelector('.fullscreen-toggle-btn') : null)
        : $(id);
      if (!el) return;
      if (on) {
        if (!origHandlers[id]) origHandlers[id] = el.onclick;
        el.onclick = map[id];
      } else {
        el.onclick = origHandlers[id] || null;
        delete origHandlers[id];
      }
    });
  }

  function onPlay(e) { e && e.preventDefault(); if (SFV.player) SFV.player.togglePlay(); }
  function onPrev(e) { e && e.preventDefault(); if (SFV.player) SFV.player.playPrevEpisode(); updateNavButtons(); }
  function onNext(e) { e && e.preventDefault(); if (SFV.player) SFV.player.playNextEpisode(); updateNavButtons(); }
  function onMode(e) { e && e.preventDefault(); if (SFV.player) SFV.player.cyclePlayMode(); refreshModeBtn(); }
  function onFullscreen(e) { e && e.preventDefault(); if (SFV.player) SFV.player.toggleFullscreen(); }

  // ---------- 动态注入视频键 ----------
  function mkVideoBtn(id, label, onClick, title) {
    var b = doc.createElement('button');
    b.id = id; b.type = 'button'; b.className = 'ctrl-btn sfv-vbtn'; b.textContent = label;
    if (title) b.title = title;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function injectVideoButtons() {
    var modes = doc.querySelector && doc.querySelector('#bottom-bar .control-cluster.modes');
    if (!modes) return;
    var ref = doc.querySelector ? doc.querySelector('.fullscreen-toggle-btn') : null;
    var speed = mkVideoBtn('sfv-ctrl-speed', '1x', function (e) { e.preventDefault(); if (SFV.player) { SFV.player.cycleSpeed(); refreshSpeed(); } }, '倍速');
    var sub = mkVideoBtn('sfv-ctrl-sub', '字幕', function (e) { e.preventDefault(); if (SFV.player) SFV.player.openSubtitleMenu(); }, '字幕');
    var dan = mkVideoBtn('sfv-ctrl-dan', '弹幕', function (e) { e.preventDefault(); if (SFV.danmaku && SFV.danmaku.ui && SFV.danmaku.ui.openPanel) SFV.danmaku.ui.openPanel(); }, '弹幕');
    var aud = mkVideoBtn('sfv-ctrl-audio', '音轨', function (e) { e.preventDefault(); if (SFV.player) SFV.player.cycleAudio(); }, '音轨');
    var close = mkVideoBtn('sfv-ctrl-close', '✕', function (e) { e.preventDefault(); if (SFV.player) SFV.player.close(); }, '关闭');
    injectedBtns = [speed, sub, dan, aud, close];
    injectedBtns.forEach(function (b) {
      if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref);
      else modes.appendChild(b);
    });
  }
  function removeInjectedButtons() {
    injectedBtns.forEach(function (b) { if (b.parentNode) b.parentNode.removeChild(b); });
    injectedBtns = [];
  }
  function refreshSpeed() {
    var b = $('sfv-ctrl-speed');
    if (b && SFV.player && SFV.player.getSpeed) b.textContent = SFV.player.getSpeed() + 'x';
  }
  function refreshModeBtn() {
    var btn = $('play-mode-btn');
    if (!btn || !SFV.player || !SFV.player.getPlayMode) return;
    var mode = SFV.player.getPlayMode();
    var label = { sequence: '连播', 'repeat-one': '单集循环', off: '不连播' };
    btn.title = label[mode] || mode;
    btn.setAttribute('data-mode', mode === 'sequence' ? 'loop' : (mode === 'repeat-one' ? 'single' : 'off'));
  }
  function updateNavButtons() {
    var prev = $('prev-btn'), next = $('next-btn');
    var hasPrev = SFV.player && SFV.player.hasPrevEpisode ? SFV.player.hasPrevEpisode() : false;
    var hasNext = SFV.player && SFV.player.hasNextEpisode ? SFV.player.hasNextEpisode() : false;
    if (prev) { prev.disabled = !hasPrev; prev.style.opacity = hasPrev ? '' : '0.38'; }
    if (next) { next.disabled = !hasNext; next.style.opacity = hasNext ? '' : '0.38'; }
  }

  // ---------- videoEl 事件绑定 ----------
  function onTimeUpdate() {
    if (!videoEl) return;
    var c = Math.floor(videoEl.currentTime || 0), d = Math.floor(videoEl.duration || 0);
    var ratio = d ? (c / d) : 0;
    var fill = $('progress-fill'), thumb = $('progress-thumb'), time = $('time-display');
    if (fill) fill.style.width = (ratio * 100) + '%';
    if (thumb) thumb.style.left = (ratio * 100) + '%';
    if (time) time.textContent = fmt(c) + ' / ' + fmt(d);
  }
  function refreshPlayIcon() {
    var b = $('play-icon');
    if (!b || !videoEl) return;
    b.innerHTML = videoEl.paused
      ? '<path d="M8 5v14l11-7z"/>'
      : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  }
  function refreshVolumeIcon() {
    var vc = $('volume-control');
    if (vc && videoEl) vc.classList.toggle('muted', !!(videoEl.muted || videoEl.volume === 0));
  }
  function bindVideoEvents() {
    if (!videoEl) return;
    videoEl.addEventListener('timeupdate', onTimeUpdate);
    videoEl.addEventListener('durationchange', onTimeUpdate);
    videoEl.addEventListener('loadedmetadata', onTimeUpdate);
    videoEl.addEventListener('play', refreshPlayIcon);
    videoEl.addEventListener('pause', refreshPlayIcon);
    videoEl.addEventListener('ended', refreshPlayIcon);
    videoEl.addEventListener('volumechange', refreshVolumeIcon);
    onTimeUpdate(); refreshPlayIcon(); refreshVolumeIcon(); refreshSpeed(); refreshModeBtn();
  }
  function unbindVideoEvents() {
    if (!videoEl) return;
    videoEl.removeEventListener('timeupdate', onTimeUpdate);
    videoEl.removeEventListener('durationchange', onTimeUpdate);
    videoEl.removeEventListener('loadedmetadata', onTimeUpdate);
    videoEl.removeEventListener('play', refreshPlayIcon);
    videoEl.removeEventListener('pause', refreshPlayIcon);
    videoEl.removeEventListener('ended', refreshPlayIcon);
    videoEl.removeEventListener('volumechange', refreshVolumeIcon);
  }

  // ---------- 元信息 ----------
  function applyMeta(meta) {
    meta = meta || {};
    var title = $('control-title'), artist = $('control-artist'), cover = $('control-cover');
    if (title) title.textContent = meta.title || '';
    if (artist) artist.textContent = meta.subtitle || '';
    if (cover) {
      if (meta.cover) {
        cover.style.backgroundImage = 'url("' + String(meta.cover).replace(/"/g, '\\"') + '")';
        cover.classList.remove('cover-empty');
      } else {
        cover.style.backgroundImage = '';
        cover.classList.add('cover-empty');
      }
    }
    refreshModeBtn(); refreshSpeed(); updateNavButtons();
  }

  // ---------- 空间切换：切到音乐空间强制关闭视频 ----------
  function onSpaceChange(detail) {
    if (detail && detail.spaceMode === 'music' && SFV.player && SFV.player.isOpen && SFV.player.isOpen()) {
      SFV.player.close();
    }
  }

  // ---------- 初始化 ----------
  function init() {
    if (!doc) return;
    global.addEventListener('sfv:player-open', function (e) { activate(e && e.detail); });
    global.addEventListener('sfv:player-close', function () { deactivate(); });
    // 元信息晚到（如 source-adapter 解析出真实封面/标题）时刷新底部控制器
    global.addEventListener('sfv:player-meta', function (e) { if (active) applyMeta(e && e.detail); });
    if (SFV.state && SFV.state.EVENT) {
      global.addEventListener(SFV.state.EVENT, function (e) { onSpaceChange(e && e.detail); });
    }
  }

  SFV.playerController = { init: init, activate: activate, deactivate: deactivate };

  if (doc && doc.readyState !== 'loading') init();
  else doc.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : this);
