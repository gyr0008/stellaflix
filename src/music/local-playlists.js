/**
 * 本地歌单数据层(阶段二:登录降级为歌单导入器)。
 * 职责:
 *  - 平台歌单快照导入:登录状态下把网易云/QQ/酷狗歌单的曲目列表拉全,存为本地歌单
 *  - 本地红心:likedSongMap 的持久化后端(未登录也可红心;已登录时由 legacy-music 同步平台)
 *  - 「红心喜欢」合成歌单:聚合本地红心快照,在歌单面板本地分组置顶展示
 * 存储均为 localStorage(配额失败仅告警降级);歌曲对象保留 provider 等字段,
 * 播放走既有 resolveOnlinePlaybackData 链(本地库歌曲 provider='local' 走代理短路)。
 * 测试友好:storage 经 getStorage() 间接访问,可在 node 下以 window 桩运行。
 */
(function () {
  'use strict';

  var STORE_KEY = 'stellaflix-local-playlists-v1';
  var LIKES_STORE_KEY = 'stellaflix-local-likes-v1';
  var LIKED_PLAYLIST_ID = 'local:liked';
  var MAX_PLAYLISTS = 60;
  var quotaWarned = false;

  var playlists = null;
  var likes = null;

  function getStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    return null;
  }

  function ensureLoaded() {
    if (playlists) return;
    playlists = [];
    likes = { order: [], songs: {} };
    var storage = getStorage();
    if (!storage) return;
    try {
      var rawPl = storage.getItem(STORE_KEY);
      var parsedPl = rawPl ? JSON.parse(rawPl) : [];
      if (Array.isArray(parsedPl)) {
        playlists = parsedPl.filter(function (pl) { return pl && pl.id && Array.isArray(pl.songs); });
      }
    } catch (e) { console.warn('[LocalPlaylists] store parse failed:', e && e.message); }
    try {
      var rawLikes = storage.getItem(LIKES_STORE_KEY);
      var parsedLikes = rawLikes ? JSON.parse(rawLikes) : null;
      if (parsedLikes && Array.isArray(parsedLikes.order) && parsedLikes.songs && typeof parsedLikes.songs === 'object') {
        likes = parsedLikes;
      }
    } catch (e) { console.warn('[LocalPlaylists] likes parse failed:', e && e.message); }
  }

  function persistPlaylists() {
    var storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORE_KEY, JSON.stringify(playlists.slice(0, MAX_PLAYLISTS)));
    } catch (e) {
      if (!quotaWarned) { quotaWarned = true; console.warn('[LocalPlaylists] persist skipped (quota):', e && e.message); }
    }
  }

  function persistLikes() {
    var storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(LIKES_STORE_KEY, JSON.stringify(likes));
    } catch (e) {
      if (!quotaWarned) { quotaWarned = true; console.warn('[LocalPlaylists] likes persist skipped (quota):', e && e.message); }
    }
  }

  // 歌曲快照:保留播放/展示必需字段,丢弃运行时临时态
  function slimSong(song) {
    song = song || {};
    return {
      provider: song.provider || song.source || song.type || 'netease',
      type: song.type || song.provider || '',
      source: song.source || song.provider || '',
      id: song.id != null ? song.id : '',
      mid: song.mid || song.songmid || '',
      mediaMid: song.mediaMid || song.media_mid || '',
      hash: song.hash || '',
      albumAudioId: song.albumAudioId || song.album_audio_id || '',
      qishuiTrackId: song.qishuiTrackId || '',
      qishuiMediaType: song.qishuiMediaType || '',
      name: song.name || song.title || '',
      artist: song.artist || '',
      album: typeof song.album === 'object' ? (song.album && song.album.name || '') : (song.album || ''),
      albumId: song.albumId || song.album_id || song.albumMid || '',
      cover: typeof song.cover === 'string' ? song.cover : '',
      duration: song.duration || 0,
      localFile: null,
      localUrl: song.localUrl || '',
      localLyricText: null
    };
  }

  function playlistEndpoint(provider, pid) {
    if (provider === 'qq') return '/api/qq/playlist/tracks?id=' + encodeURIComponent(pid);
    if (provider === 'kugouMusic') return '/api/kugou-music/playlist/tracks?id=' + encodeURIComponent(pid);
    if (provider === 'kugou') return '/api/kugou/playlist/tracks?id=' + encodeURIComponent(pid);
    return '/api/playlist/tracks?id=' + encodeURIComponent(pid);
  }

  function defaultFetchTracks(provider, pid) {
    var url = playlistEndpoint(provider, pid);
    if (typeof apiJson === 'function') return apiJson(url);
    return fetch(url).then(function (r) { return r.json(); });
  }

  function list() {
    ensureLoaded();
    return playlists.slice();
  }

  function get(pid) {
    ensureLoaded();
    for (var i = 0; i < playlists.length; i++) {
      if (playlists[i].id === pid) return playlists[i];
    }
    return null;
  }

  function findByRemote(remoteProvider, remoteId) {
    ensureLoaded();
    for (var i = 0; i < playlists.length; i++) {
      if (playlists[i].remoteProvider === remoteProvider && String(playlists[i].remoteId) === String(remoteId)) return playlists[i];
    }
    return null;
  }

  function likedCount() {
    ensureLoaded();
    return likes.order.length;
  }

  function likedSynthetic() {
    return {
      id: LIKED_PLAYLIST_ID,
      provider: 'local',
      source: 'local',
      name: '红心喜欢',
      cover: '',
      creator: '本地',
      trackCount: likedCount(),
      remoteProvider: '',
      remoteId: '',
      likedList: true
    };
  }

  function panelLists() {
    ensureLoaded();
    var out = [likedSynthetic()];
    for (var i = playlists.length - 1; i >= 0; i--) out.push(playlists[i]);
    return out;
  }

  function hasContent() {
    ensureLoaded();
    return !!(playlists.length || likes.order.length);
  }

  function tracksFor(pid) {
    ensureLoaded();
    if (pid === LIKED_PLAYLIST_ID) {
      var likedSongs = [];
      for (var i = 0; i < likes.order.length; i++) {
        var snap = likes.songs[likes.order[i]];
        if (snap) likedSongs.push(snap);
      }
      return { provider: 'local', loggedIn: true, playlist: likedSynthetic(), tracks: likedSongs };
    }
    var pl = get(pid);
    return {
      provider: 'local',
      loggedIn: true,
      playlist: pl || { id: pid, provider: 'local', name: '本地歌单', trackCount: 0 },
      tracks: pl ? pl.songs.slice() : []
    };
  }

  function normalizeImportedTracks(rawTracks) {
    var arr = Array.isArray(rawTracks) ? rawTracks : [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var song = arr[i];
      if (!song || !song.name) continue;
      out.push(typeof normalizePlaylistPanelTrack === 'function' ? normalizePlaylistPanelTrack(song) : slimSong(song));
    }
    return out;
  }

  /**
   * 导入(或更新)一个平台歌单快照。同 remoteProvider+remoteId 已存在时更新原歌单。
   * @returns {Promise<{pl: object, updated: boolean, count: number}>}
   */
  function importRemotePlaylist(provider, pid, meta, fetcher) {
    ensureLoaded();
    meta = meta || {};
    var fetchTracks = fetcher || defaultFetchTracks;
    return Promise.resolve().then(function () {
      return fetchTracks(provider, pid);
    }).then(function (r) {
      var tracks = normalizeImportedTracks(r && r.tracks);
      if (!tracks.length) throw new Error('EMPTY_PLAYLIST');
      var existing = findByRemote(provider, pid);
      var pl = existing || {
        id: 'local:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
        provider: 'local',
        source: 'local',
        creator: '本地快照',
        importedAt: Date.now()
      };
      pl.name = meta.name || pl.name || (r && r.playlist && r.playlist.name) || ('导入歌单 ' + pid);
      pl.cover = meta.cover || pl.cover || (r && r.playlist && r.playlist.cover) || (tracks[0] && tracks[0].cover) || '';
      pl.remoteProvider = provider;
      pl.remoteId = String(pid);
      pl.updatedAt = Date.now();
      pl.trackCount = tracks.length;
      pl.songs = tracks;
      if (!existing) playlists.unshift(pl);
      if (playlists.length > MAX_PLAYLISTS) playlists.length = MAX_PLAYLISTS;
      persistPlaylists();
      return { pl: pl, updated: !!existing, count: tracks.length };
    });
  }

  function removePlaylist(pid) {
    ensureLoaded();
    if (pid === LIKED_PLAYLIST_ID) return false;
    var next = playlists.filter(function (pl) { return pl.id !== pid; });
    if (next.length === playlists.length) return false;
    playlists = next;
    persistPlaylists();
    return true;
  }

  // ---------- 本地红心 ----------

  function likeKeyOf(song) {
    // 必须与 legacy-music.js songLikeKey 完全一致(kugou 用 hash,其余用 id),否则两边红心状态错位。
    song = song || {};
    var provider = song.provider || song.source || song.type || 'netease';
    var id = provider === 'kugou'
      ? (song.hash || song.albumAudioId || song.album_audio_id || song.id || '')
      : (song.id || '');
    id = String(id == null ? '' : id).toLowerCase();
    return id ? (provider + ':' + id) : '';
  }

  function isLiked(song) {
    ensureLoaded();
    var key = likeKeyOf(song);
    return !!(key && likes.songs[key]);
  }

  /**
   * 本地红心开关。desired 缺省时按当前状态取反。
   * @returns {boolean} 最终状态
   */
  function toggleLike(song, desired) {
    ensureLoaded();
    var key = likeKeyOf(song);
    if (!key) return false;
    var next = arguments.length >= 2 ? !!desired : !likes.songs[key];
    if (next) {
      if (!likes.songs[key]) likes.order.push(key);
      likes.songs[key] = slimSong(song);
    } else {
      delete likes.songs[key];
      var idx = likes.order.indexOf(key);
      if (idx >= 0) likes.order.splice(idx, 1);
    }
    if (likes.order.length > 5000) likes.order.length = 5000;
    persistLikes();
    return next;
  }

  function likedKeys() {
    ensureLoaded();
    return likes.order.slice();
  }

  function seedLikedMap(map) {
    ensureLoaded();
    for (var i = 0; i < likes.order.length; i++) {
      var key = likes.order[i];
      if (!(key in map)) map[key] = true;
    }
    return map;
  }

  window.SFLocalPlaylists = {
    LIKED_PLAYLIST_ID: LIKED_PLAYLIST_ID,
    list: list,
    panelLists: panelLists,
    hasContent: hasContent,
    tracksFor: tracksFor,
    importRemotePlaylist: importRemotePlaylist,
    removePlaylist: removePlaylist,
    likeKeyOf: likeKeyOf,
    isLiked: isLiked,
    toggleLike: toggleLike,
    likedKeys: likedKeys,
    seedLikedMap: seedLikedMap,
    likedCount: likedCount
  };

  // 启动播种:本地红心并入 legacy-music.js 的 likedSongMap(本脚本加载晚于 music.js,全局已存在)
  if (typeof likedSongMap !== 'undefined' && likedSongMap && typeof likedSongMap === 'object') {
    seedLikedMap(likedSongMap);
  }
})();
