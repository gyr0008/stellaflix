/**
 * 本地音乐库渲染层(移植自 1.5.7 分支的本地曲库逻辑,适配双态共存形态)。
 * 职责:
 *  - 文件夹导入/快照恢复,构建 provider='local' 的歌曲对象进入现有播放队列
 *  - 同名 .lrc/.txt 歌词与同名封面图片匹配(路径/文件名/归一化三级索引)
 *  - 后台水合封面与歌词(IPC 范围读取,限并发,批量刷新 UI)
 * 播放短路在 legacy-music.js resolveOnlinePlaybackData(provider==='local' → /api/local-file 代理直连)。
 * 本模块加载于 music.js 之后,复用其全局助手(showToast/safeRenderQueuePanel/playQueueAt 等)。
 */
(function () {
  'use strict';

  var FOLDER_STORE_KEY = 'stellaflix-local-library-folder-v1';
  var SNAPSHOT_STORE_KEY = 'stellaflix-local-library-snapshot-v1';
  var AUDIO_RE = /\.(mp3|flac|m4a|wav|ogg)$/i;
  var LYRIC_RE = /\.(lrc|txt)$/i;
  var COVER_RE = /\.(jpe?g|png|webp)$/i;
  var HYDRATE_CONCURRENCY = 2;
  var HYDRATE_UI_BATCH = 12;

  var state = { songs: [], folderPath: '', ready: false, importing: false };
  var hydrationToken = 0;
  var snapshotQuotaWarned = false;

  function desktopApi() {
    var api = window.desktopWindow;
    return api && api.isDesktop ? api : null;
  }

  function filePath(file) {
    return String((file && (file.webkitRelativePath || file.relativePath || file.name)) || '').replace(/\\/g, '/');
  }
  function fileFullPath(file) {
    return String((file && (file.fullPath || file.filePath || file.path)) || '');
  }
  function baseStem(file) {
    var p = filePath(file);
    var idx = p.lastIndexOf('/');
    var name = idx >= 0 ? p.slice(idx + 1) : p;
    var dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(0, dot) : name;
  }
  function dirOf(file) {
    var p = filePath(file);
    var idx = p.lastIndexOf('/');
    return idx >= 0 ? p.slice(0, idx + 1) : '';
  }
  function normalizeAssetName(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[\[\(（【].*?[\]\)）】]/g, '')
      .replace(/[\s._\-–—~·・、，,。!！?？:：;；'"“”‘’/\\|]+/g, '');
  }
  function isAudioFile(file) {
    return !!(file && ((file.type && String(file.type).indexOf('audio/') === 0) || AUDIO_RE.test(file.name || '')));
  }

  // 歌名/歌手:去掉音轨号前缀,按 " - " 拆歌手与标题
  function parseNameParts(name) {
    var cleaned = String(name || '').trim().replace(/^\d+[\s.\-_]+/, '');
    var parts = cleaned.split(/\s+-\s+/);
    if (parts.length >= 2) return { artist: parts[0].trim(), name: parts.slice(1).join(' - ').trim() };
    return { artist: '', name: cleaned };
  }

  // 同名资产三级索引:全路径 > 同目录文件名 > 归一化文件名(跨目录兜底)
  function buildAssetMaps(files, pattern) {
    var maps = { byPath: {}, byBase: {}, byLoose: {} };
    var length = files && files.length || 0;
    for (var i = 0; i < length; i++) {
      var file = files[i];
      if (!file || !pattern.test(file.name || '')) continue;
      var pathKey = (dirOf(file) + baseStem(file)).toLowerCase();
      var baseKey = baseStem(file).toLowerCase();
      var looseKey = normalizeAssetName(baseStem(file));
      if (pathKey && !maps.byPath[pathKey]) maps.byPath[pathKey] = file;
      if (baseKey && !maps.byBase[baseKey]) maps.byBase[baseKey] = file;
      if (looseKey && !maps.byLoose[looseKey]) maps.byLoose[looseKey] = file;
    }
    return maps;
  }
  function findAssetFile(audioFile, maps) {
    var pathKey = (dirOf(audioFile) + baseStem(audioFile)).toLowerCase();
    var baseKey = baseStem(audioFile).toLowerCase();
    var looseKey = normalizeAssetName(baseStem(audioFile));
    return maps.byPath[pathKey] || maps.byBase[baseKey] || maps.byLoose[looseKey] || null;
  }

  function makeLocalSong(file, lyricFile, coverFile) {
    var parts = parseNameParts(baseStem(file));
    return {
      provider: 'local',
      type: 'local',
      source: 'local',
      id: 'local:' + (fileFullPath(file) || filePath(file)),
      name: parts.name || baseStem(file),
      artist: parts.artist || '',
      album: '',
      duration: 0,
      cover: '',
      localFile: file,
      localUrl: String((file && file.url) || ''),
      localLyricFile: lyricFile || null,
      localCoverFile: coverFile || null,
      localLyricText: null
    };
  }

  function buildSongs(files) {
    var list = Array.isArray(files) ? files : [];
    var lyricMaps = buildAssetMaps(list, LYRIC_RE);
    var coverMaps = buildAssetMaps(list, COVER_RE);
    var audioFiles = [];
    for (var i = 0; i < list.length; i++) {
      if (isAudioFile(list[i])) audioFiles.push(list[i]);
    }
    audioFiles.sort(function (a, b) { return filePath(a) < filePath(b) ? -1 : 1; });
    var songs = new Array(audioFiles.length);
    for (var j = 0; j < audioFiles.length; j++) {
      songs[j] = makeLocalSong(audioFiles[j], findAssetFile(audioFiles[j], lyricMaps), findAssetFile(audioFiles[j], coverMaps));
    }
    return songs;
  }

  function saveFolder(folderPath) {
    try { window.localStorage.setItem(FOLDER_STORE_KEY, String(folderPath || '')); } catch (e) {}
  }
  function readFolder() {
    try { return String(window.localStorage.getItem(FOLDER_STORE_KEY) || ''); } catch (e) { return ''; }
  }
  function saveSnapshot(result) {
    try {
      window.localStorage.setItem(SNAPSHOT_STORE_KEY, JSON.stringify({
        files: result.files || [],
        directories: result.directories || [],
        truncated: !!result.truncated,
        savedAt: Date.now()
      }));
    } catch (e) {
      if (!snapshotQuotaWarned) {
        snapshotQuotaWarned = true;
        console.warn('[LocalLibrary] snapshot persist skipped (quota):', e && e.message);
      }
    }
  }
  function readSnapshot() {
    try {
      var raw = window.localStorage.getItem(SNAPSHOT_STORE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.files) ? parsed : null;
    } catch (e) { return null; }
  }

  function applyToQueue(opts) {
    opts = opts || {};
    try { if (typeof finalizeListenSession === 'function') finalizeListenSession(false); } catch (e) {}
    playQueue = state.songs.slice();
    currentIdx = 0;
    try { resetPlaylistPanelRenderLimit(); } catch (e) {}
    safeRenderQueuePanel('local-library-apply');
    try { setPeek(document.getElementById('playlist-panel'), true, 'pl'); } catch (e) {}
    if (typeof showToast === 'function') showToast('已载入 ' + state.songs.length + ' 首本地音乐');
    if (opts.autoPlay) playQueueAt(0, { manual: true });
  }

  function applyScanResult(result, opts) {
    opts = opts || {};
    var songs = buildSongs(result && result.files || []);
    if (!songs.length) {
      if (typeof showToast === 'function') showToast('文件夹里没有找到可播放的本地音乐');
      return false;
    }
    state.songs = songs;
    state.folderPath = String((result && result.folderPath) || '');
    state.ready = true;
    if (opts.persist) {
      saveFolder(state.folderPath);
      saveSnapshot(result);
    }
    applyToQueue(opts);
    hydrateAssetsInBackground();
    return true;
  }

  function importFolder() {
    var api = desktopApi();
    if (!api) {
      if (typeof showToast === 'function') showToast('本地音乐库仅桌面版可用');
      return;
    }
    if (state.importing) return;
    state.importing = true;
    api.chooseLocalMusicFolder().then(function (result) {
      if (!result || result.canceled) return;
      if (!result.ok) throw new Error(result.error || 'LOCAL_LIBRARY_CHOOSE_FAILED');
      applyScanResult(result, { persist: true, autoPlay: true });
    }).catch(function (e) {
      console.warn('[LocalFolderChoose]', e);
      if (typeof showToast === 'function') showToast('本地音乐文件夹打开失败');
    }).then(function () { state.importing = false; });
  }

  function restore() {
    var api = desktopApi();
    var folderPath = readFolder();
    if (!folderPath || !api) return Promise.resolve(false);
    var snapshot = readSnapshot();
    var restoreRun = snapshot
      ? api.refreshLocalMusicFiles(folderPath, snapshot).catch(function () { return api.scanLocalMusicFolder(folderPath); })
      : api.scanLocalMusicFolder(folderPath);
    return restoreRun.then(function (result) {
      if (!result || !result.ok) throw new Error('LOCAL_LIBRARY_RESTORE_FAILED');
      var songs = buildSongs(result.files || []);
      state.songs = songs;
      state.folderPath = String(result.folderPath || folderPath);
      state.ready = songs.length > 0;
      saveSnapshot(result);
      hydrateAssetsInBackground();
      return songs.length > 0;
    }).catch(function (e) {
      console.warn('[LocalLibraryRestore]', e);
      return false;
    });
  }

  // 显式入口:把已恢复/已导入的曲库放进队列(不自播)
  function openLibrary() {
    if (state.ready && state.songs.length) {
      applyToQueue({ autoPlay: false });
      return;
    }
    restore().then(function (ok) {
      if (ok) applyToQueue({ autoPlay: false });
      else if (typeof showToast === 'function') showToast('还没有本地音乐,点击导入文件夹');
    });
  }

  function ensureLocalSongUrl(song) {
    if (!song) return '';
    if (song.localUrl) return song.localUrl;
    if (song.localFile && song.localFile.url) return song.localUrl = song.localFile.url;
    return '';
  }

  function decodeLocalTextBuffer(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
    var decoder = null;
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) decoder = new TextDecoder('utf-16le');
    else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) decoder = new TextDecoder('utf-16be');
    else decoder = new TextDecoder('utf-8');
    var text = decoder.decode(bytes).replace(/^\uFEFF/, '');
    var bad = 0;
    for (var i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 0xfffd) bad += 1;
    }
    if (bad) {
      try {
        var gbText = new TextDecoder('gb18030').decode(bytes).replace(/^\uFEFF/, '');
        var gbBad = 0;
        for (var j = 0; j < gbText.length; j++) {
          if (gbText.charCodeAt(j) === 0xfffd) gbBad += 1;
        }
        if (gbBad < bad) text = gbText;
      } catch (e) {}
    }
    return text;
  }

  function base64ChunksToBytes(chunks, byteLength) {
    var expected = Math.max(0, Number(byteLength) || 0);
    var bytes = new Uint8Array(expected);
    var offset = 0;
    for (var i = 0; i < chunks.length; i++) {
      var binary = atob(String(chunks[i] || ''));
      if (offset + binary.length > expected) throw new Error('LOCAL_FILE_RANGE_LENGTH_MISMATCH');
      for (var j = 0; j < binary.length; j++) bytes[offset + j] = binary.charCodeAt(j);
      offset += binary.length;
    }
    if (offset !== expected) throw new Error('LOCAL_FILE_RANGE_LENGTH_MISMATCH');
    return bytes;
  }

  function readLocalLyricText(song) {
    if (song.localLyricText != null) return Promise.resolve(song.localLyricText);
    var file = song && song.localLyricFile;
    var api = desktopApi();
    var fullPath = file && fileFullPath(file);
    if (!file || !api || !fullPath || !LYRIC_RE.test(file.name || '')) {
      song.localLyricText = '';
      return Promise.resolve('');
    }
    return api.readLocalFileRange(fullPath, 0, null).then(function (result) {
      if (!result || !result.ok) return '';
      return decodeLocalTextBuffer(base64ChunksToBytes(result.base64Chunks || [], result.byteLength || 0));
    }).catch(function () {
      return '';
    }).then(function (text) {
      song.localLyricText = String(text || '');
      return song.localLyricText;
    });
  }

  function hydrateAssetsInBackground() {
    var api = desktopApi();
    if (!api) return;
    var token = ++hydrationToken;
    var pending = state.songs.filter(function (song) {
      return song && (song.localCoverFile || song.localLyricFile);
    });
    if (!pending.length) return;
    var cursor = 0;
    var doneInBatch = 0;
    function refreshUi() {
      if (token !== hydrationToken) return;
      try {
        safeRenderQueuePanel('local-asset-hydrated');
        if (currentIdx >= 0 && playQueue[currentIdx]) updateControlTrackInfo(playQueue[currentIdx]);
      } catch (e) {}
    }
    function worker() {
      if (token !== hydrationToken) return Promise.resolve();
      if (cursor >= pending.length) return Promise.resolve();
      var song = pending[cursor++];
      var tasks = [];
      if (song.localCoverFile && !song.cover) {
        tasks.push(api.readLocalFileDataUrl(fileFullPath(song.localCoverFile)).then(function (result) {
          if (result && result.ok && result.dataUrl) song.cover = result.dataUrl;
        }).catch(function () {}));
      }
      if (song.localLyricFile && song.localLyricText == null) {
        tasks.push(readLocalLyricText(song).catch(function () {}));
      }
      return Promise.all(tasks).then(function () {
        doneInBatch += 1;
        if (doneInBatch % HYDRATE_UI_BATCH === 0) refreshUi();
        return worker();
      });
    }
    var workers = [];
    for (var i = 0; i < HYDRATE_CONCURRENCY; i++) workers.push(worker());
    Promise.all(workers).then(refreshUi);
  }

  window.SFLocalLibrary = {
    state: state,
    importFolder: importFolder,
    openLibrary: openLibrary,
    restore: restore,
    ensureLocalSongUrl: ensureLocalSongUrl,
    readLocalLyricText: readLocalLyricText
  };

  // 启动恢复:仅装载曲库状态,不抢占队列;用户点击「本地音乐」按钮时再入队
  if (desktopApi()) {
    setTimeout(function () { restore(); }, 900);
  }
})();
