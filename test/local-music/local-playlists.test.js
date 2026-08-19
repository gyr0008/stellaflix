'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function makeEnv() {
  const mem = new Map();
  const localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: k => { mem.delete(k); },
  };
  global.window = { localStorage };
  delete require.cache[require.resolve('../../src/music/local-playlists.js')];
  require('../../src/music/local-playlists.js');
  return { window: global.window, mem, api: global.window.SFLocalPlaylists };
}

const TRACKS = [
  { id: 101, name: 'A', artist: 'X', album: { name: 'AL' }, cover: 'https://p.example/101.jpg', duration: 180000 },
  { id: 102, name: 'B', artist: 'Y', album: 'BL', duration: 200000 },
];

function fakeFetcher(tracks) {
  return () => Promise.resolve({ playlist: { name: '远端', cover: 'https://p.example/pl.jpg' }, tracks });
}

test('import snapshot stores slimmed tracks and lists them with the liked synthetic playlist', async () => {
  const { api } = makeEnv();
  const result = await api.importRemotePlaylist('netease', '7001', { name: '我的红', cover: '' }, fakeFetcher(TRACKS));
  assert.equal(result.updated, false);
  assert.equal(result.count, 2);
  assert.equal(result.pl.name, '我的红');
  assert.equal(result.pl.remoteProvider, 'netease');
  assert.equal(result.pl.remoteId, '7001');
  assert.equal(result.pl.trackCount, 2);

  const panels = api.panelLists();
  assert.equal(panels.length, 2);
  assert.equal(panels[0].id, api.LIKED_PLAYLIST_ID);
  assert.equal(panels[1].id, result.pl.id);

  const detail = api.tracksFor(result.pl.id);
  assert.equal(detail.provider, 'local');
  assert.equal(detail.tracks.length, 2);
  assert.equal(detail.tracks[0].provider, 'netease');
  assert.equal(detail.tracks[0].name, 'A');
  assert.equal(detail.tracks[0].album, 'AL');
});

test('re-import updates the existing snapshot instead of duplicating', async () => {
  const { api } = makeEnv();
  const first = await api.importRemotePlaylist('qq', 'q1', {}, fakeFetcher(TRACKS));
  const second = await api.importRemotePlaylist('qq', 'q1', {}, fakeFetcher(TRACKS.concat([{ id: 103, name: 'C' }])));
  assert.equal(second.updated, true);
  assert.equal(second.pl.id, first.pl.id);
  assert.equal(api.list().length, 1);
  assert.equal(api.tracksFor(first.pl.id).tracks.length, 3);
});

test('removePlaylist deletes snapshots but protects the liked playlist', async () => {
  const { api } = makeEnv();
  const result = await api.importRemotePlaylist('kugou', 'k1', {}, fakeFetcher(TRACKS));
  assert.equal(api.removePlaylist(api.LIKED_PLAYLIST_ID), false);
  assert.equal(api.removePlaylist(result.pl.id), true);
  assert.equal(api.list().length, 0);
});

test('empty remote track list rejects with EMPTY_PLAYLIST', async () => {
  const { api } = makeEnv();
  await assert.rejects(
    () => api.importRemotePlaylist('netease', 'x', {}, fakeFetcher([])),
    /EMPTY_PLAYLIST/
  );
});

test('local likes persist with legacy-compatible keys and seed likedSongMap', () => {
  const { api } = makeEnv();
  const neteaseSong = { provider: 'netease', id: 501, name: 'N', artist: 'Z' };
  const kugouSong = { provider: 'kugou', hash: 'ABC', id: 9, name: 'K' };
  const qqSong = { provider: 'qq', id: 771, mid: 'mm', name: 'Q' };
  const localSong = { provider: 'local', id: 'local:C:/a.mp3', name: 'L' };

  assert.equal(api.likeKeyOf(neteaseSong), 'netease:501');
  assert.equal(api.likeKeyOf(kugouSong), 'kugou:abc');
  assert.equal(api.likeKeyOf(qqSong), 'qq:771');
  assert.equal(api.likeKeyOf(localSong), 'local:local:c:/a.mp3');

  assert.equal(api.toggleLike(neteaseSong), true);
  assert.equal(api.toggleLike(kugouSong), true);
  assert.equal(api.toggleLike(localSong), true);
  assert.equal(api.likedCount(), 3);
  assert.equal(api.isLiked(qqSong), false);

  const map = {};
  api.seedLikedMap(map);
  assert.equal(map['netease:501'], true);
  assert.equal(map['kugou:abc'], true);
  assert.equal(map['local:local:c:/a.mp3'], true);

  // 红心合成歌单聚合快照
  const liked = api.tracksFor(api.LIKED_PLAYLIST_ID);
  assert.equal(liked.tracks.length, 3);
  assert.equal(liked.playlist.name, '红心喜欢');

  assert.equal(api.toggleLike(neteaseSong, false), false);
  assert.equal(api.likedCount(), 2);
});

test('legacy wiring: local provider branches, import actions and local-first likes', () => {
  const root = path.join(__dirname, '../..');
  const musicSrc = fs.readFileSync(path.join(root, 'src/music/legacy-music.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const playlistsSrc = fs.readFileSync(path.join(root, 'src/music/local-playlists.js'), 'utf8');
  const bundle = fs.readFileSync(path.join(root, 'public/assets/local-playlists.js'), 'utf8');

  // provider 'local' 成为歌单一等公民
  assert.match(musicSrc, /provider === 'qishui' \|\| provider === 'local' \? provider : 'netease'/);
  assert.match(musicSrc, /SFLocalPlaylists\.tracksFor\(pid\)/);
  assert.match(musicSrc, /data-pl-import/);
  assert.match(musicSrc, /data-pl-update/);
  assert.match(musicSrc, /data-pl-remove/);
  assert.match(musicSrc, /importRemotePlaylistSnapshot/);
  // 红心本地先行
  assert.match(musicSrc, /SFLocalPlaylists\.toggleLike\(song, next\)/);
  assert.match(musicSrc, /SFLocalPlaylists\.seedLikedMap\(likedSongMap\)/);
  assert.match(musicSrc, /本地歌单/);
  assert.match(page, /\/assets\/local-playlists\.js/);
  assert.match(page, /\.pl-card-action/);
  assert.match(playlistsSrc, /stellaflix-local-playlists-v1/);
  assert.match(playlistsSrc, /stellaflix-local-likes-v1/);
  assert.match(bundle, /SFLocalPlaylists/);
});
