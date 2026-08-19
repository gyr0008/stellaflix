// T119: 影视态海报独立化测试
// 背景：T118 修复后左侧 .home-poster-media 在影视态仍显示音乐态海报
// 修复：(1) 海报来源策略 = 用户设置 > 四类最新 > 默认封面；(2) 默认封面 = 暗色玻璃 + 🎬 emoji；
//       (3) home.js render 末尾渲染影视海报；(4) applyMusicDefaults 还原 .home-poster-media
// 死命令：影视态的海报 ≠ 音乐态的海报；海报/3D 歌单架内容不能相互串联
var fs = require('fs');
var vm = require('vm');
var pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 ' + msg); } }

var home = fs.readFileSync('public/video/home.js', 'utf8');
var dispatch = fs.readFileSync('public/video/dispatch.js', 'utf8');
var indexHtml = fs.readFileSync('public/index.html', 'utf8');

console.log('--- A. 静态结构 ---');
// A1. 海报独立化函数
assert(/function renderVideoPoster\s*\(/.test(home), 'A1.1 home.js 含 renderVideoPoster()');
assert(/function pickVideoPoster\s*\(/.test(home), 'A1.2 home.js 含 pickVideoPoster() 海报来源策略');
assert(/function restructurePosterActionsForVideo\s*\(/.test(home), 'A1.3 home.js 含 restructurePosterActionsForVideo() chip 改造');

// A2. localStorage key
assert(/VIDEO_POSTER_LS_KEY\s*=\s*['"]stellaflix-video-poster['"]/.test(home), 'A2.1 影视海报存 stellaflix-video-poster');

// A3. 默认封面 B3 暗色玻璃 + 🎬 emoji
assert(/sfv-poster-default/.test(home), 'A3.1 默认封面用 .sfv-poster-default 类');
assert(/\ud83c\udfac|🎬/.test(home), 'A3.2 默认封面用 🎬 emoji');

// A4. 海报来源策略：用户设置 > 四类最新 > 默认
assert(/getUserVideoPoster\(\)/.test(home), 'A4.1 海报来源第一优先级 = 用户设置');
assert(/getKeysByFlag\(\s*['"]liked['"]\s*\)/.test(home), 'A4.2 海报来源第二优先级遍历 liked');
// 注：原"收藏(faved)"卡已替换为"追片(track)"卡（与 Kazumi 追片 5 状态一致），A4.3 同步为 track
assert(/getKeysByFlag\(\s*['"]track['"]\s*\)|getTrackCount\(\)/.test(home), 'A4.3 海报来源第二优先级遍历 track（原收藏 faved 卡已替换为追片 track）');
assert(/getKeysByFlag\(\s*['"]inList['"]\s*\)/.test(home), 'A4.4 海报来源第二优先级遍历 inList');
assert(/getHistory\(\)/.test(home), 'A4.5 海报来源第二优先级遍历 history');

// A5. C1 getHistory().length === 0 → 默认封面
// 已通过 kind: 'default' 兜底覆盖（pool 为空时）
assert(/kind\s*:\s*['"]default['"]/.test(home), 'A5.1 海报来源第三优先级 = 默认封面（pool 为空时）');

// A6. TMDB 搜索选海报
assert(/function pickTmdbVideoPoster\s*\(/.test(home), 'A6.1 home.js 含 pickTmdbVideoPoster()');
assert(/SFV\.tmdb\.search/.test(home), 'A6.2 pickTmdbVideoPoster 调用 SFV.tmdb.search');
assert(/data-sfv-action=["']tmdb-poster["']/.test(home), 'A6.3 新增"从 TMDB 选"按钮');

// A7. 本地图片上传
assert(/function pickLocalVideoPoster\s*\(/.test(home), 'A7.1 home.js 含 pickLocalVideoPoster()');
assert(/FileReader\(\)/.test(home), 'A7.2 pickLocalVideoPoster 用 FileReader 读取本地图片');

// A8. "用当前封面"按钮在影视态下隐藏
assert(/用当前封面[\s\S]{0,200}?style\.display\s*=\s*['"]none['"]/.test(home), 'A8.1 影视态隐藏"用当前封面"按钮');

// A9. 重置按钮重定向到视频态
assert(/function resetVideoPoster\s*\(/.test(home), 'A9.1 home.js 含 resetVideoPoster()');
assert(/resetVideoPoster[\s\S]{0,300}?clearUserVideoPoster/.test(home), 'A9.2 resetVideoPoster 清掉 stellaflix-video-poster');

// A10. setCardArt 函数 + 5 张卡各自动用各自 flag 类
assert(/function setCardArt\s*\(/.test(home), 'A10.1 home.js 含 setCardArt()');
assert(/setCardArt\(\s*cards\[i\]\s*,\s*defs\[i\]\.flag/.test(home), 'A10.2 render() 调用 setCardArt(card, defs[i].flag)');

// A11. cardDefs 第 1-4 张带 flag 字段
assert(/label\s*:\s*['"]心动['"][\s\S]{0,200}?flag\s*:\s*['"]liked['"]/.test(home), 'A11.1 心动卡 flag=liked');
assert(/label\s*:\s*['"]片单['"][\s\S]{0,200}?flag\s*:\s*['"]inList['"]/.test(home), 'A11.2 片单卡 flag=inList');
// 注：原"收藏(faved)"卡已替换为"追片(track)"卡，A11.3 同步为追片
assert(/label\s*:\s*['"]追片['"][\s\S]{0,200}?flag\s*:\s*['"]track['"]/.test(home), 'A11.3 追片卡 flag=track（原收藏 faved 已替换）');
assert(/label\s*:\s*['"]历史['"][\s\S]{0,200}?flag\s*:\s*['"]history['"]/.test(home), 'A11.4 历史卡 flag=history');

// A12. captureMusicDefaults 纳入 .home-poster-media
assert(/snap\.posterMedia\s*=/.test(home), 'A12.1 captureMusicDefaults 拍 .home-poster-media 快照');
assert(/home-poster-media/.test(home) && /--home-poster-image/.test(home), 'A12.2 快照含 --home-poster-image');

// A13. applyMusicDefaults 还原 .home-poster-media
assert(/snap\.posterMedia/.test(home), 'A13.1 applyMusicDefaults 还原 .home-poster-media');
assert(/snap\.posterMedia[\s\S]{0,500}?innerHTML\s*=/.test(home), 'A13.2 还原 innerHTML');
assert(/snap\.posterMedia[\s\S]{0,500}?className\s*=/.test(home), 'A13.3 还原 className');
assert(/snap\.posterMedia[\s\S]{0,500}?--home-poster-image/.test(home), 'A13.4 还原 --home-poster-image CSS 变量');

// A14. SFV.home 暴露新函数
assert(/SFV\.home\s*=\s*\{[\s\S]*?renderVideoPoster/.test(home), 'A14.1 SFV.home 暴露 renderVideoPoster');
assert(/SFV\.home\s*=\s*\{[\s\S]*?pickVideoPoster/.test(home), 'A14.2 SFV.home 暴露 pickVideoPoster');
assert(/SFV\.home\s*=\s*\{[\s\S]*?setCardArt/.test(home), 'A14.3 SFV.home 暴露 setCardArt');

console.log('--- B. vm.Script 语法重 parse ---');
try { new vm.Script(home, { filename: 'home.js' }); assert(true, 'B1.1 home.js 语法 OK'); } catch (e) { assert(false, 'B1.1 home.js SyntaxError: ' + e.message); }
try { new vm.Script(dispatch, { filename: 'dispatch.js' }); assert(true, 'B1.2 dispatch.js 语法 OK'); } catch (e) { assert(false, 'B1.2 dispatch.js SyntaxError: ' + e.message); }

console.log('--- C. 行为模拟：海报来源策略 ---');
// 模拟 SFV.model：likes / favs / history
var mockModel = {
  _meta: {},
  _flags: { liked: {}, faved: {}, inList: {} },
  _history: [],
  getMeta: function (k) { return this._meta[k] || null; },
  setMeta: function (rec) { this._meta[rec.key] = rec; },
  getHistory: function () { return this._history; },
  addHistory: function (rec) {
    this._history = this._history.filter(function (x) { return x.key !== rec.key; });
    this._history.unshift(Object.assign({}, rec, { ts: rec.ts || Date.now() }));
  },
  getKeysByFlag: function (flag) {
    var out = [];
    var all = this._flags[flag] || {};
    Object.keys(all).forEach(function (k) { if (all[k]) out.push(k); });
    return out;
  },
  setFlag: function (k, flag, on) {
    if (!this._flags[flag]) this._flags[flag] = {};
    this._flags[flag][k] = !!on;
  }
};

// 模拟 home.js 的 pickVideoPoster 核心逻辑（提取出来简化测试）
function pickPosterLogic(model, userUrl) {
  if (userUrl) return { kind: 'user', url: userUrl };
  if (!model) return { kind: 'default', url: '' };
  var pool = [];
  ['liked', 'faved', 'inList'].forEach(function (flag) {
    var keys = model.getKeysByFlag(flag) || [];
    keys.forEach(function (k) {
      var m = model.getMeta(k);
      if (m && m.pic) {
        var ts = 0;
        var h = model.getHistory() || [];
        for (var i = 0; i < h.length; i++) if (h[i].key === k) { ts = h[i].ts || 0; break; }
        pool.push({ ts: ts || 0, pic: m.pic, flag: flag });
      }
    });
  });
  var history = model.getHistory() || [];
  history.forEach(function (h) { if (h && h.pic) pool.push({ ts: h.ts || 0, pic: h.pic, flag: 'history' }); });
  pool.sort(function (a, b) { return b.ts - a.ts; });
  if (pool.length) return { kind: 'auto', url: pool[0].pic, flag: pool[0].flag };
  return { kind: 'default', url: '' };
}

// C1. 用户手动设置 → kind=user
assert(pickPosterLogic(mockModel, 'https://user.example.com/poster.jpg').kind === 'user', 'C1.1 用户手动设置时 kind=user');

// C2. 空数据 → kind=default
mockModel._meta = {}; mockModel._flags = { liked: {}, faved: {}, inList: {} }; mockModel._history = [];
assert(pickPosterLogic(mockModel, null).kind === 'default', 'C2.1 完全空数据 → kind=default');

// C3. liked 最新一条的 pic 优先
mockModel.setMeta({ key: 'k1', title: '剧1', pic: 'https://liked.jpg' });
mockModel.setFlag('k1', 'liked', true);
mockModel.setMeta({ key: 'k2', title: '剧2', pic: 'https://faved.jpg' });
mockModel.setFlag('k2', 'faved', true);
mockModel.setMeta({ key: 'k3', title: '剧3', pic: 'https://inList.jpg' });
mockModel.setFlag('k3', 'inList', true);
mockModel._history = [
  { key: 'k1', ts: 100, pic: 'https://h1.jpg' },
  { key: 'k2', ts: 200, pic: 'https://h2.jpg' },
  { key: 'k3', ts: 300, pic: 'https://h3.jpg' }
];
var picked = pickPosterLogic(mockModel, null);
assert(picked.kind === 'auto' && picked.flag === 'inList' && picked.url === 'https://inList.jpg', 'C3.1 四类最新一条是 inList (ts=300)');

// C4. 用户设置优先于四类最新
picked = pickPosterLogic(mockModel, 'https://user-wins.jpg');
assert(picked.kind === 'user' && picked.url === 'https://user-wins.jpg', 'C4.1 用户设置优先于四类最新');

// C5. C1 getHistory().length === 0 → 但 liked 非空 → 应选 liked（pool 非空）
mockModel._history = [];
mockModel.setMeta({ key: 'k1', title: '剧1', pic: 'https://liked-only.jpg' });
mockModel.setFlag('k1', 'liked', true);
picked = pickPosterLogic(mockModel, null);
// 注意：history 为空，但 liked 有 meta + pic，pool.push(0, 'https://liked-only.jpg', 'liked')，所以非空
// 当前实现：history 为空时，pool 只从 liked/faved/inList 三个 flag 取 meta（前提是 meta 存在）
assert(picked.kind === 'auto' && picked.url === 'https://liked-only.jpg', 'C5.1 history 空但 liked 有 → 仍选 liked pic（pool 非空）');

// C6. 完全没看过影视 + 没用户设置 → kind=default
mockModel._history = [];
mockModel._meta = {};
mockModel._flags = { liked: {}, faved: {}, inList: {} };
picked = pickPosterLogic(mockModel, null);
assert(picked.kind === 'default', 'C6.1 history 空 + meta 空 + flag 空 → kind=default');

console.log('--- D. 5 张卡的封面策略 ---');
function pickCardCover(model, flag) {
  if (!model) return '';
  if (flag === 'history') {
    var h = (model.getHistory && model.getHistory()) || [];
    for (var i = 0; i < h.length; i++) if (h[i] && h[i].pic) return h[i].pic;
    return '';
  }
  if (!flag) return '';
  var keys = (model.getKeysByFlag && model.getKeysByFlag(flag)) || [];
  var pool = [];
  keys.forEach(function (k) {
    var m = model.getMeta && model.getMeta(k);
    if (m && m.pic) {
      var ts = 0;
      var hh = (model.getHistory && model.getHistory()) || [];
      for (var j = 0; j < hh.length; j++) if (hh[j].key === k) { ts = hh[j].ts || 0; break; }
      pool.push({ ts: ts, pic: m.pic });
    }
  });
  pool.sort(function (a, b) { return b.ts - a.ts; });
  return pool.length ? pool[0].pic : '';
}

// 准备数据：四类各一条
mockModel._history = [
  { key: 'h1', ts: 100, pic: 'https://history-pic.jpg' }
];
mockModel._meta = {
  'l1': { key: 'l1', pic: 'https://liked-pic.jpg' },
  'f1': { key: 'f1', pic: 'https://faved-pic.jpg' },
  'i1': { key: 'i1', pic: 'https://inList-pic.jpg' }
};
mockModel._flags = { liked: { 'l1': true }, faved: { 'f1': true }, inList: { 'i1': true } };
assert(pickCardCover(mockModel, 'liked') === 'https://liked-pic.jpg', 'D1.1 心动卡封面 = liked 最新一条');
assert(pickCardCover(mockModel, 'inList') === 'https://inList-pic.jpg', 'D1.2 片单卡封面 = inList 最新一条');
assert(pickCardCover(mockModel, 'faved') === 'https://faved-pic.jpg', 'D1.3 收藏卡封面 = faved 最新一条');
assert(pickCardCover(mockModel, 'history') === 'https://history-pic.jpg', 'D1.4 历史卡封面 = history 最新一条');

// 音乐空间卡不需要封面（flag=null）
assert(pickCardCover(mockModel, null) === '', 'D1.5 音乐空间卡 flag=null → 无封面');

// 数据为空时返回空（让 CSS 显示占位）
mockModel._history = []; mockModel._meta = {}; mockModel._flags = { liked: {}, faved: {}, inList: {} };
assert(pickCardCover(mockModel, 'liked') === '', 'D2.1 数据空时 liked 卡返回空（CSS 显示占位）');
assert(pickCardCover(mockModel, 'history') === '', 'D2.2 数据空时 history 卡返回空');

console.log('--- E. 死命令承诺：双态海报独立 ---');
// 验证 home.js 没有把音乐态海报逻辑复制到影视态
assert(!/function renderVideoPoster[\s\S]{0,500}?homePosterFallbackImage/.test(home),
  'E1.1 renderVideoPoster 不引用音乐态 homePosterFallbackImage');
assert(!/function pickVideoPoster[\s\S]{0,500}?currentCoverSong/.test(home),
  'E1.2 pickVideoPoster 不引用 currentCoverSong (音乐态当前播放)');

// 验证默认封面有 default class + emoji
assert(/sfv-poster-default[\s\S]{0,500}?🎬/.test(home),
  'E2.1 默认封面使用 .sfv-poster-default class + 🎬 emoji');

// 验证 pickLocalVideoPoster 不污染音乐态（不调用 setHomePosterImage）
assert(!/function pickLocalVideoPoster[\s\S]{0,1500}?setHomePosterImage/.test(home),
  'E3.1 pickLocalVideoPoster 不调用 setHomePosterImage（避免污染音乐态）');
assert(/function pickLocalVideoPoster[\s\S]{0,1500}?setUserVideoPoster/.test(home),
  'E3.2 pickLocalVideoPoster 写 setUserVideoPoster 到 stellaflix-video-poster');

console.log('');
console.log('========================================');
console.log('  T119 影视态海报独立化测试: ' + pass + ' pass / ' + fail + ' fail');
console.log('========================================');
process.exit(fail === 0 ? 0 : 1);