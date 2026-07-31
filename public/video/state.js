/*
 * Stellaflix 影视模块 — 双态状态机 (Step 2)
 * 持有 spaceMode('music'|'video')，翻转 body.video-space-active，派发 spacechange。
 * 硬约束：逻辑独立成文件，不写入 index.html。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var STORAGE_KEY = 'stellaflix-space-mode';
  var EVENT = 'spacechange';

  var spaceMode = 'music'; // 'music' | 'video'
  var initialized = false;

  function getBody() {
    return global.document ? global.document.body : null;
  }

  function applyBodyClass() {
    var body = getBody();
    if (!body || !body.classList) return;
    body.classList.toggle('video-space-active', spaceMode === 'video');
  }

  function persist() {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, spaceMode);
    } catch (e) {
      /* 隐私模式 / 配额溢出时静默降级 */
    }
  }

  function emit() {
    var detail = { spaceMode: spaceMode };
    try {
      if (global.CustomEvent) {
        global.dispatchEvent(new global.CustomEvent(EVENT, { detail: detail }));
        return;
      }
    } catch (e) {
      /* fallthrough */
    }
    try {
      var ev = global.document.createEvent('Event');
      ev.initEvent(EVENT, false, false);
      ev.detail = detail;
      global.dispatchEvent(ev);
    } catch (e2) {
      /* 无法派发则忽略，调用方仍可通过 getSpace() 读最新态 */
    }
  }

  function setSpace(mode, opts) {
    opts = opts || {};
    if (mode !== 'music' && mode !== 'video') return;
    if (mode === spaceMode && initialized && !opts.force) return;
    spaceMode = mode;
    initialized = true;
    applyBodyClass();
    persist();
    if (!opts.silent) emit();
  }

  function toggle(opts) {
    setSpace(spaceMode === 'video' ? 'music' : 'video', opts);
  }

  function getSpace() {
    return spaceMode;
  }

  function isVideo() {
    return spaceMode === 'video';
  }

  function isMusic() {
    return spaceMode === 'music';
  }

  // 启动时默认音乐态（避免开屏直接进影视态造成困惑）；不自动恢复上次持久态。
  function init() {
    if (initialized) return;
    initialized = true;
    applyBodyClass();
  }

  SFV.state = {
    init: init,
    setSpace: setSpace,
    toggle: toggle,
    getSpace: getSpace,
    isVideo: isVideo,
    isMusic: isMusic,
    EVENT: EVENT,
    STORAGE_KEY: STORAGE_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
