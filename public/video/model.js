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

  // ---- 在线闭环新增：用户数据模型 ----
  // 历史：用户播放过的每一个 vod（在线/本地统一），按 key 去重，最新在前的数组。
  var KEY_HISTORY = NS + 'history'; // [ { key, title, pic, year, sourceId, vodId, ts } ]
  // 标记：心动(liked)/片单(inList) 两类布尔旗，按 vod key 索引。
  var KEY_FLAG = NS + 'flag'; // { [vodKey]: { liked, inList } }
  // 元信息缓存：vod key → 基本元数据，保证即便源被删/离线，各类列表仍能渲染标题封面。
  var KEY_META = NS + 'meta'; // { [vodKey]: { key, title, pic, year, sourceId, vodId } }
  // 追片（Kazumi 等价）：互斥单值观看状态，按 vod key 索引。
  // 值 ∈ TRACK_STATUSES；键不存在 = 未收藏(none)；清除 = 删除键。
  var KEY_TRACK = NS + 'track'; // { [vodKey]: 'watching'|'planToWatch'|'onHold'|'watched'|'abandoned' }

  var FLAG_FIELDS = ['liked', 'inList'];
  // 追片 5 状态（与 Kazumi CollectType 一致，none 表示未收藏=键不存在）
  var TRACK_STATUSES = ['watching', 'planToWatch', 'onHold', 'watched', 'abandoned'];
  var TRACK_LABELS = {
    watching: '在看', planToWatch: '想看', onHold: '搁置', watched: '看过', abandoned: '抛弃',
  };
  var HISTORY_CAP = 300;

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

  // ---- 在线闭环：四类数据模型 ----

  // vodKey 由 public/video/sources.js 的 normalizeVod 生成（sourceId:vodId），
  // 也用于本地条目（file:xxx / url:xxx）。此处不依赖 sources.js 是否已加载。
  function getHistory() {
    var arr = readJSON(KEY_HISTORY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function addHistory(rec) {
    if (!rec || !rec.key) return getHistory();
    var arr = getHistory();
    arr = arr.filter(function (x) { return x.key !== rec.key; });
    arr.unshift({
      key: rec.key,
      title: rec.title || rec.key,
      pic: rec.pic || '',
      year: rec.year || '',
      sourceId: rec.sourceId || '',
      vodId: rec.vodId || '',
      ts: Date.now(),
    });
    if (arr.length > HISTORY_CAP) arr = arr.slice(0, HISTORY_CAP);
    writeJSON(KEY_HISTORY, arr);
    return arr;
  }

  function clearHistory() { writeJSON(KEY_HISTORY, []); return []; }

  function getFlag(key) {
    var all = readJSON(KEY_FLAG, {});
    var f = all[key] || {};
    return { liked: !!f.liked, inList: !!f.inList };
  }

  function setFlag(key, field, on) {
    if (!key || FLAG_FIELDS.indexOf(field) < 0) return getFlag(key);
    var all = readJSON(KEY_FLAG, {});
    if (!all[key]) all[key] = {};
    all[key][field] = !!on;
    // 两类旗全为假时直接删键，避免脏数据膨胀
    var f = all[key];
    if (!f.liked && !f.inList) delete all[key];
    writeJSON(KEY_FLAG, all);
    return getFlag(key);
  }

  function toggleFlag(key, field) {
    var f = getFlag(key);
    return setFlag(key, field, !f[field]);
  }

  // ---- 追片（Kazumi 等价：互斥单值观看状态）----
  function getTrackStatus(key) {
    var all = readJSON(KEY_TRACK, {});
    var s = all[key];
    return (s && TRACK_STATUSES.indexOf(s) >= 0) ? s : null;
  }

  // status 为空 / 'none' -> 清除（删除键）；
  // 有效状态 -> 直接覆盖（天然互斥）；
  // 其它无效非空值 -> 忽略，保留原状态（防御性，避免误清空）。
  function setTrackStatus(key, status) {
    if (!key) return null;
    var all = readJSON(KEY_TRACK, {});
    if (!status || status === 'none') {
      if (all[key]) { delete all[key]; writeJSON(KEY_TRACK, all); }
      return null;
    }
    if (TRACK_STATUSES.indexOf(status) < 0) return getTrackStatus(key); // 无效状态忽略
    all[key] = status;
    writeJSON(KEY_TRACK, all);
    return status;
  }

  // 返回某追片状态下所有 vod key（数组）
  function getKeysByTrack(status) {
    if (TRACK_STATUSES.indexOf(status) < 0) return [];
    var all = readJSON(KEY_TRACK, {});
    var out = [];
    Object.keys(all).forEach(function (k) { if (all[k] === status) out.push(k); });
    return out;
  }

  // 已追片（任意非 none 状态）总数
  function getTrackCount() {
    var all = readJSON(KEY_TRACK, {});
    return Object.keys(all).length;
  }

  // 所有已追片 key（任意状态），供首页封面聚合等使用
  function getTrackKeys() {
    var all = readJSON(KEY_TRACK, {});
    return Object.keys(all);
  }

  // 清除某片追片状态（= 设为 none）
  function clearTrack(key) { return setTrackStatus(key, null); }

  // 返回某标记类下所有 vod key（数组）
  function getKeysByFlag(field) {
    if (FLAG_FIELDS.indexOf(field) < 0) return [];
    var all = readJSON(KEY_FLAG, {});
    var out = [];
    Object.keys(all).forEach(function (k) {
      if (all[k] && all[k][field]) out.push(k);
    });
    return out;
  }

  function getMeta(key) {
    var all = readJSON(KEY_META, {});
    return all[key] || null;
  }

  function setMeta(rec) {
    if (!rec || !rec.key) return;
    var all = readJSON(KEY_META, {});
    all[rec.key] = {
      key: rec.key,
      title: rec.title || (all[rec.key] && all[rec.key].title) || rec.key,
      pic: rec.pic || (all[rec.key] && all[rec.key].pic) || '',
      year: rec.year || (all[rec.key] && all[rec.key].year) || '',
      sourceId: rec.sourceId || '',
      vodId: rec.vodId || '',
    };
    writeJSON(KEY_META, all);
  }

  // 供 online.js 一次性取「某分类」的完整列表：以 meta 为主、缺失时用 history 兜底
  function resolveList(keys) {
    var out = [];
    (keys || []).forEach(function (k) {
      var m = getMeta(k);
      if (!m) {
        var h = getHistory().filter(function (x) { return x.key === k; })[0];
        if (h) m = { key: k, title: h.title, pic: h.pic, year: h.year, sourceId: h.sourceId, vodId: h.vodId };
      }
      if (m) out.push(m);
    });
    return out;
  }

  SFV.model = {
    NS: NS,
    getProgress: getProgress,
    setProgress: setProgress,
    clearProgress: clearProgress,
    getLibrary: getLibrary,
    addToLibrary: addToLibrary,
    removeFromLibrary: removeFromLibrary,
    // 在线闭环新增
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory,
    getFlag: getFlag,
    setFlag: setFlag,
    toggleFlag: toggleFlag,
    getKeysByFlag: getKeysByFlag,
    getMeta: getMeta,
    setMeta: setMeta,
    resolveList: resolveList,
    FLAG_FIELDS: FLAG_FIELDS,
    // 追片（Kazumi 等价）
    getTrackStatus: getTrackStatus,
    setTrackStatus: setTrackStatus,
    getKeysByTrack: getKeysByTrack,
    getTrackCount: getTrackCount,
    getTrackKeys: getTrackKeys,
    clearTrack: clearTrack,
    TRACK_STATUSES: TRACK_STATUSES,
    TRACK_LABELS: TRACK_LABELS,
  };
})(typeof window !== 'undefined' ? window : this);
