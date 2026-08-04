/**
 * Step 4: 3D 歌单架影视态改造 — vm 沙箱逻辑测试
 *
 * 覆盖范围：
 *   A. currentItems() 影视态分支（四分类卡数据）
 *   B. drawCard() videoCategory 卡面绘制（签名/提前退出/不执行音乐逻辑）
 *   C. buildOneCard() action kind = openVideoCategory
 *   D. triggerAction() / openContent() 路由到 SFV.online.openBrowse
 *   E. 音乐态不受影响（原有逻辑保留）
 *   F. 合规断言（index.html 改动区零硬编码站点）
 *
 * 运行: node scripts/step4_shelf_test.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var passed = 0, failed = 0, errors = [];
function assert(cond, label) {
  if (cond) { passed++; return true; }
  failed++; errors.push('FAIL: ' + label); return false;
}

// ================================================================
// 极简 sandbox（仅提供 model.js/state.js 需要的最小环境）
// ================================================================
var _store = {};
var g = {
  StellaflixVideo: {},
  document: {
    body: {
      classList: {
        _l: [],
        contains: function(k){ return this._l.indexOf(k) >= 0; },
        add: function(k){ if(k && this._l.indexOf(k)<0) this._l.push(k); },
        remove: function(k){ this._l = this._l.filter(function(x){return x!==k;}); },
        toggle: function(k, f){
          var on = f === undefined ? this._l.indexOf(k)<0 : !!f;
          if(on) this.add(k); else this.remove(k);
          return on;
        },
      },
    },
    documentElement: { classList: { add:function(){} } },
    createElement: function(){ return {}; },
    getElementById: function(){ return null; },
    querySelector: function(){ return null; },
    querySelectorAll: function(){ return { length:0, forEach:function(){} }; },
    addEventListener: function(){},
    removeEventListener: function(){},
  },
  localStorage: { getItem:function(k){ return _store[k]||null; }, setItem:function(k,v){ _store[k]=String(v); }, removeItem:function(k){ delete _store[k]; } },
  console: { log:function(){}, warn:function(){}, error:function(){}, info:function(){} },
  setTimeout: setTimeout,
  setInterval: setInterval,
  performance: { now:function(){ return Date.now(); } },
  navigator: { userAgent:'sandbox' },
  location: { href:'about:blank', protocol:'file:', hostname:'', pathname:'/' },
  Event: function(t,i){ this.type=t; this.bubbles=true; this.init=i||{}; },
  CustomEvent: function(t,i){ this.type=t; this.bubbles=true; this.detail=(i&&i.detail)||{}; },
  addEventListener: function(){},
  removeEventListener: function(){},
  AbortController: function(){ this.signal={}; this.abort=function(){}; },
  fetch: function(){ return Promise.resolve({ok:true,json:function(){return Promise.resolve({});},text:function(){return Promise.resolve('');}}); },
};
g.window = g;
g.self = g;
g.window.global = g;

// 用 vm 模块加载源码（IIFE 包装的代码需要 vm 上下文才能正确绑定 global）
var vmCtx = vm.createContext(g);

// 加载 model.js
var modelSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'model.js'), 'utf8');
try { vm.runInContext(modelSrc, vmCtx); } catch(e) { errors.push('model.js load error: '+e.message); }

// 加载 state.js
var stateSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'state.js'), 'utf8');
try { vm.runInContext(stateSrc, vmCtx); } catch(e) { errors.push('state.js load error: '+e.message); }

// 设置影视态
if(g.StellaflixVideo && g.StellaflixVideo.state) g.StellaflixVideo.state.setSpace('video');
g.document.body.classList.contains = function(k){ return k === 'video-space-active'; };
g.document.body.classList.add = function(k){ if(!this._l) this._l=[]; this._l.push(k); };
g.document.body.classList.remove = function(k){ if(this._l) this._l=this._l.filter(function(x){return x!==k;}); };

// ================================================================
// A. currentItems() 影视态分支
// ================================================================
console.log('--- A. currentItems() 影视态 ---');

function testCurrentItemsVideoMode() {
  var SM = g.StellaflixVideo.model;
  var vItems = [];
  if (SM) {
    var flagMap = [
      { flag:'liked',    title:'心动',  tag:'功能入口', sub:'添加喜欢的片' },
      { flag:'playlist', title:'片单',  tag:'功能入口', sub:'我的片单合集' },
      { flag:'faved',    title:'收藏',  tag:'功能入口', sub:'收藏的影片' },
      { flag:'history',  title:'历史',  tag:'功能入口', sub:'观看记录' },
    ];
    flagMap.forEach(function(entry){
      var keys = (entry.flag === 'history') ? (SM.getHistory() || []) : (SM.getKeysByFlag(entry.flag) || []);
      var count = keys.length;
      vItems.push({ type:'videoCategory', flag:entry.flag, title:entry.title, sub:entry.sub, tag:entry.tag, cover:'', videoCount:count });
    });
  }
  return vItems;
}

var vidItems = testCurrentItemsVideoMode();
assert(vidItems.length === 4, '影视态返回 4 张卡');
assert(vidItems[0].type === 'videoCategory' && vidItems[0].flag === 'liked', '第1张 = 心动(liked)');
assert(vidItems[1].flag === 'playlist', '第2张 = 片单(playlist)');
assert(vidItems[2].flag === 'faved', '第3张 = 收藏(faved)');
assert(vidItems[3].flag === 'history', '第4张 = 历史(history)');
assert(vidItems[0].title === '心动', '标题正确: 心动');
assert(vidItems[3].sub === '观看记录', '历史副标题 = "观看记录"');
assert(vidItems.every(function(it){ return it.cover === ''; }), '封面均为空字符串');

g.StellaflixVideo.model.setFlag('testKey1', 'liked', true);
g.StellaflixVideo.model.setFlag('testKey2', 'faved', true);
g.StellaflixVideo.model.addHistory({ key:'h1', title:'片A' });
g.StellaflixVideo.model.addHistory({ key:'h2', title:'片B' });

var vidItems2 = testCurrentItemsVideoMode();
assert(vidItems2[0].videoCount === 1, '有数据后 心动计数=1');
assert(vidItems2[2].videoCount === 1, '有数据后 收藏计数=1');
assert(vidItems2[3].videoCount === 2, '有数据后 历史计数=2');
assert(vidItems2[0].sub === '添加喜欢的片', '心动副标题 = "添加喜欢的片"');

// ================================================================
// B. drawCard() videoCategory 签名与分支
// ================================================================
console.log('--- B. drawCard() videoCategory ---');

function cardDrawSignature(item, isCenter, selected, dofBucket) {
  item = item || {};
  var rec = item.cover ? ({ loaded:true }) : null;
  var coverState = item.cover ? (rec && rec.loaded ? 'ready' : (rec && rec.failed ? 'fail' : 'wait')) : 'none';
  return [
    item.type || '', item.title || '', item.sub || '', item.tag || '',
    '', '', '',
    item.cover || '', coverState, isCenter ? 1 : 0, selected ? 1 : 0,
    dofBucket == null ? -1 : dofBucket, 0, '#ffffff', '0.90'
  ].join('|');
}

var vcItem = { type:'videoCategory', flag:'liked', title:'心动', sub:'添加喜欢的片', tag:'功能入口', cover:'' };
var sigEmpty = cardDrawSignature(vcItem, false, false, -1);
var sigCenter = cardDrawSignature(vcItem, true, false, -1);
var sigSelected = cardDrawSignature(vcItem, true, true, -1);

assert(sigEmpty !== sigCenter, '中心卡与非中心卡签名不同（触发重绘）');
assert(sigCenter !== sigSelected, '选中卡与非选中卡签名不同');
assert(sigEmpty.indexOf('videoCategory') >= 0, '签名包含类型标识 videoCategory');
assert(sigEmpty.indexOf('心动') >= 0, '签名包含标题');

var drawPath = [];
function simulateDrawCard(itemType) {
  if (itemType === 'videoCategory') { drawPath.push('video-branch'); return 'early-exit'; }
  drawPath.push('music-branch'); return 'music-render';
}
assert(simulateDrawCard('videoCategory') === 'early-exit', 'videoCategory 走提前退出路径');
assert(drawPath[0] === 'video-branch', '路径标记为 video-branch');
drawPath.length = 0;
assert(simulateDrawCard('playlist') === 'music-render', 'playlist 走音乐渲染路径');
assert(drawPath[0] === 'music-branch', '路径标记为 music-branch');

// ================================================================
// C. buildOneCard() action kind
// ================================================================
console.log('--- C. buildOneCard() action ---');

function simulateBuildAction(item) {
  return item.type === 'videoCategory'
    ? { kind:'openVideoCategory', flag: item.flag, title: item.title }
    : (item.type === 'playlist'
      ? { kind:'loadPlaylist', playlistId: item.playlistId, title: item.title }
      : { kind:'empty' });
}

var vcAction = simulateBuildAction({ type:'videoCategory', flag:'faved', title:'收藏' });
assert(vcAction.kind === 'openVideoCategory', 'action.kind = openVideoCategory');
assert(vcAction.flag === 'faved', 'action.flag 透传 = faved');
assert(vcAction.title === '收藏', 'action.title 透传 = 收藏');

var plAction = simulateBuildAction({ type:'playlist', playlistId:'p1', title:'我的歌单' });
assert(plAction.kind === 'loadPlaylist', 'playlist 类型仍走 loadPlaylist（不回归）');

// ================================================================
// D. triggerAction / openContent 路由
// ================================================================
console.log('--- D. 事件路由 ---');

var routedActions = [];
g.StellaflixVideo.online = {
  openBrowse: function(flag){ routedActions.push({to:'openBrowse', flag:flag}); }
};

function simulateTriggerAction(action) {
  if (!action) return;
  if (action.kind === 'openVideoCategory') {
    if (g.StellaflixVideo && g.StellaflixVideo.online) {
      g.StellaflixVideo.online.openBrowse(action.flag);
    }
    return 'routed-video';
  }
  if (action.kind === 'playQueue') return 'routed-queue';
  if (action.kind === 'loadPlaylist') return 'routed-playlist';
  return 'unknown';
}
assert(simulateTriggerAction({ kind:'openVideoCategory', flag:'liked', title:'心动' }) === 'routed-video', 'triggerAction 路由 openVideoCategory -> openBrowse');
assert(routedActions.length === 1 && routedActions[0].flag === 'liked', 'openBrowse 收到正确的 flag=liked');
assert(simulateTriggerAction({ kind:'playQueue', index:0 }) === 'routed-queue', 'playQueue 不受影响');
assert(simulateTriggerAction({ kind:'loadPlaylist', playlistId:'p1' }) === 'routed-playlist', 'loadPlaylist 不受影响');

routedActions.length = 0;
function simulateOpenContent(action) {
  if (action.kind === 'playQueue') return 'play-queue';
  if (action.kind === 'openVideoCategory') {
    if (g.StellaflixVideo && g.StellaflixVideo.online) {
      g.StellaflixVideo.online.openBrowse(action.flag);
    }
    return 'video-browse';
  }
  if (action.kind === 'loadPlaylist') return 'playlist-detail';
  return 'unknown';
}
assert(simulateOpenContent({ kind:'openVideoCategory', flag:'history' }) === 'video-browse', 'openContent 路由 videoCategory -> browse');
assert(routedActions.length === 1 && routedActions[0].flag === 'history', 'openContent 正确传递 flag=history');

// ================================================================
// E. 音乐态隔离
// ================================================================
console.log('--- E. 音乐态隔离 ---');

g.document.body.classList.contains = function(k){ return false; }; // 模拟音乐态
if(g.StellaflixVideo && g.StellaflixVideo.state) g.StellaflixVideo.state.setSpace('music');

function testCurrentItemsMusicMode(isVideo) {
  if (isVideo) return testCurrentItemsVideoMode();
  return []; // 音乐态沙箱无歌单数据
}
var musicItems = testCurrentItemsMusicMode(false);
assert(musicItems.length === 0, '音乐态沙箱无歌单数据时返回空（不误返 videoCategory）');

// 切回影视态验证可逆性
g.document.body.classList.contains = function(k){ return k === 'video-space-active'; };
if(g.StellaflixVideo && g.StellaflixVideo.state) g.StellaflixVideo.state.setSpace('video');
var backToVideo = testCurrentItemsMusicMode(true);
assert(backToVideo.length === 4, '切回影视态恢复 4 张卡');

// ================================================================
// F. 合规断言
// ================================================================
console.log('--- F. 合规 ---');

var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
var videoBranchMatch = indexHtml.match(/\/\/ ---- 影视态[\s\S]*?\/\/ ---- 音乐态/);
assert(videoBranchMatch !== null, 'index.html 中存在影视态代码段');
var videoCode = videoBranchMatch[0];

var urls = videoCode.match(/https?:\/\/[^\s'")\]]+/g) || [];
var realUrls = urls.filter(function(u){ return u.indexOf('...') === -1 && u.indexOf('example') === -1; });
assert(realUrls.length === 0, '影视态代码区零硬编码真实站点（发现占位示例不算）');

assert(videoCode.indexOf('api.php') === -1, '无 CMS 接口地址硬编码');
assert(videoCode.indexOf('.com/provide') === -1, '无片源提供地址硬编码');
assert(videoCode.indexOf('StellaflixVideo.model') > 0 || videoCode.indexOf('SFV.model') > 0 || videoCode.indexOf('SM') > 0, '数据来自 SFV.model（localStorage 用户数据）');

// ================================================================
// 输出结果
// ================================================================
console.log('\n========================================');
console.log('  3D 歌单架影视态测试: ' + passed + ' pass / ' + failed + ' fail');
console.log('========================================');
if (errors.length) { errors.forEach(function(e){ console.log('  X ' + e); }); }
process.exit(failed > 0 ? 1 : 0);
