/*
 * Stellaflix 影视模块 — 双态状态机 (Step 2)
 * 持有 spaceMode('music'|'video')，翻转 body.video-space-active，派发 spacechange。
 * 硬约束：逻辑独立成文件，不写入 index.html。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var STORAGE_KEY = 'stellaflix-space-mode';
  var START_SPACE_KEY = 'stellaflix-start-space'; // 用户在设置面板中选择的「启动默认空间」
  var EVENT = 'spacechange';

  var spaceMode = 'music'; // 'music' | 'video'
  var initialized = false;
  var startSpacePreference = 'music'; // 'music' | 'video' — 与运行态解耦的启动偏好

  function getBody() {
    return global.document ? global.document.body : null;
  }

  function applyBodyClass() {
    var body = getBody();
    if (!body || !body.classList) return;
    var isVideo = spaceMode === 'video';
    body.classList.toggle('video-space-active', isVideo);
    /* T137：同步 html 元素 class（供影视态专用规则使用） */
    var root = document.documentElement;
    if (root) root.classList.toggle('video-space-active', isVideo);
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
    // 诊断日志：追踪所有空间切换调用（铁律：只有影视/音乐空间按钮能切换）
    var stack = '';
    try { stack = (new Error()).stack || ''; } catch(e) {}
    console.log('[SFV-STATE] setSpace(' + mode + ') ← ' + spaceMode + ' | caller:\n' + stack.split('\n').slice(1,4).join('\n'));
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

  // 启动偏好：用户从设置面板「状态切换器」选择的默认进入空间。
  // 与运行态空间（stellaflix-space-mode）解耦：用户运行中切到另一个空间离开，下次仍按偏好启动。
  function readStartSpacePreference() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(START_SPACE_KEY) : null;
      if (raw === 'video' || raw === 'music') return raw;
    } catch (e) { /* 隐私模式静默降级 */ }
    return 'music';
  }

  function getStartSpace() {
    return startSpacePreference;
  }

  function setStartSpace(mode) {
    if (mode !== 'music' && mode !== 'video') return;
    startSpacePreference = mode;
    try {
      if (global.localStorage) global.localStorage.setItem(START_SPACE_KEY, mode);
    } catch (e) { /* 配额溢出静默降级 */ }
  }

  // 启动时按用户偏好进入对应空间；默认音乐态。
  function init() {
    if (initialized) return;
    initialized = true;
    startSpacePreference = readStartSpacePreference();
    spaceMode = startSpacePreference; // 按设置决定启动空间
    applyBodyClass();
  }

  SFV.state = {
    init: init,
    setSpace: setSpace,
    toggle: toggle,
    getSpace: getSpace,
    isVideo: isVideo,
    isMusic: isMusic,
    getStartSpace: getStartSpace,
    setStartSpace: setStartSpace,
    EVENT: EVENT,
    STORAGE_KEY: STORAGE_KEY,
    START_SPACE_KEY: START_SPACE_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
