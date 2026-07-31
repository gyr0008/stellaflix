/*
 * Stellaflix 影视模块 — 数据模型 (Step 2)
 * 影视数据模型 + stellaflix-video-* localStorage 命名空间。
 * 注意：计划文档原写 mineradio-video-*，但 C-2 改名后前缀已统一为 stellaflix-*，以本文件为准。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var NS = 'stellaflix-video-';
  var KEY_PROGRESS = NS + 'progress'; // { [videoId]: { position, duration, updatedAt } }
  var KEY_LIBRARY = NS + 'library'; // [ { id, title, ... } ]

  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, val) {
    try {
      global.localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- 观看进度 ----
  function getProgress(videoId) {
    var all = readJSON(KEY_PROGRESS, {});
    return all[videoId] || null;
  }

  function setProgress(videoId, position, duration) {
    if (!videoId) return null;
    var all = readJSON(KEY_PROGRESS, {});
    all[videoId] = {
      position: position | 0,
      duration: duration | 0,
      updatedAt: Date.now(),
    };
    writeJSON(KEY_PROGRESS, all);
    return all[videoId];
  }

  function clearProgress(videoId) {
    var all = readJSON(KEY_PROGRESS, {});
    delete all[videoId];
    writeJSON(KEY_PROGRESS, all);
  }

  // ---- 片库 ----
  function getLibrary() {
    return readJSON(KEY_LIBRARY, []);
  }

  function addToLibrary(item) {
    if (!item || !item.id) return getLibrary();
    var lib = readJSON(KEY_LIBRARY, []);
    if (!lib.some(function (x) { return x.id === item.id; })) {
      lib.push(item);
      writeJSON(KEY_LIBRARY, lib);
    }
    return lib;
  }

  function removeFromLibrary(id) {
    var lib = readJSON(KEY_LIBRARY, []);
    var next = lib.filter(function (x) { return x.id !== id; });
    writeJSON(KEY_LIBRARY, next);
    return next;
  }

  SFV.model = {
    NS: NS,
    getProgress: getProgress,
    setProgress: setProgress,
    clearProgress: clearProgress,
    getLibrary: getLibrary,
    addToLibrary: addToLibrary,
    removeFromLibrary: removeFromLibrary,
  };
})(typeof window !== 'undefined' ? window : this);
