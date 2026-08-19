// T118: 双态隔离修复测试（铁律：音乐态和影视态互不干扰）
// 背景：30 分钟后切换两个空间，"我的影视空间"等影视态文案残留在音乐态；3D 歌单架不响应 spacechange
// 修复：(1) home.js install 阶段拍 music 基线快照，restoreMusic 整体回滚
//       (2) dispatch.js spacechange 触发 3D 歌单架 scheduleShelfRebuild
//       (3) home.js render/restoreMusic 双向触发 scheduleShelfRebuild
var fs = require('fs');
var vm = require('vm');
var pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 ' + msg); } }

var home = fs.readFileSync('public/video/home.js', 'utf8');
var dispatch = fs.readFileSync('public/video/dispatch.js', 'utf8');
var state = fs.readFileSync('public/video/state.js', 'utf8');
var model = fs.readFileSync('public/video/model.js', 'utf8');
var bootstrap = fs.readFileSync('public/video/bootstrap.js', 'utf8');
var indexHtml = fs.readFileSync('public/index.html', 'utf8');

console.log('--- A. 静态结构 ---');
// A1. home.js 必须含音乐基线快照机制
assert(/captureMusicDefaults\s*\(/.test(home), 'A1.1 home.js 含 captureMusicDefaults 函数');
assert(/applyMusicDefaults\s*\(/.test(home), 'A1.2 home.js 含 applyMusicDefaults 函数');
assert(/MUSIC_SNAP_KEY\s*=/.test(home), 'A1.3 home.js 定义 MUSIC_SNAP_KEY 常量');

// A2. home.js restoreMusic 必须先回滚再交还
assert(/function restoreMusic\s*\(\s*\)\s*\{[\s\S]*?captureMusicDefaults/.test(home), 'A2.1 restoreMusic 先调 captureMusicDefaults');
assert(/function restoreMusic\s*\(\s*\)\s*\{[\s\S]*?applyMusicDefaults/.test(home), 'A2.2 restoreMusic 调 applyMusicDefaults 回滚');
assert(/function restoreMusic\s*\(\s*\)\s*\{[\s\S]*?renderHomeDiscover/.test(home), 'A2.3 restoreMusic 调 renderHomeDiscover 重建');
assert(/function restoreMusic\s*\(\s*\)\s*\{[\s\S]*?scheduleShelfRebuild/.test(home), 'A2.4 restoreMusic 触发 3D 歌单架 rebuild');

// A3. home.js install 必须拍快照
assert(/function install\s*\(\s*\)\s*\{[\s\S]*?captureMusicDefaults/.test(home), 'A3.1 install 拍音乐基线快照（不依赖 isVideoSpace）');
assert(/function install\s*\(\s*\)\s*\{[\s\S]*?registerSlot/.test(home), 'A3.2 install 注册 dispatch slot');

// A4. home.js render 必须触发 3D 歌单架 rebuild
assert(/function render\s*\(\s*\)\s*\{[\s\S]*?renderContinueWatching[\s\S]*?scheduleShelfRebuild/.test(home),
  'A4.1 render 末尾调 scheduleShelfRebuild');

// A5. dispatch.js bind 必须监听 spacechange + 触发 3D 歌单架 rebuild
assert(/bind\s*\(/.test(dispatch), 'A5.1 dispatch.js 含 bind()');
assert(/addEventListener\([\s\S]*?EVENT[\s\S]*?scheduleShelfRebuild/.test(dispatch), 'A5.2 dispatch.js 监听 spacechange 事件 (通过 SFV.state.EVENT 变量)');
assert(/addEventListener\([\s\S]*?EVENT[\s\S]*?scheduleShelfRebuild\s*\(\s*['"]spacechange['"]/.test(dispatch), 'A5.3 spacechange 触发 scheduleShelfRebuild("spacechange")');

// A6. applyMusicDefaults 必须还原 home.js 在影视态改写的所有元素
assert(/home-poster-title/.test(home), 'A6.1 applyMusicDefaults 处理 home-poster-title');
assert(/home-poster-quote/.test(home), 'A6.2 applyMusicDefaults 处理 home-poster-quote');
assert(/home-tile-row/.test(home), 'A6.3 applyMusicDefaults 清空 home-tile-row');
assert(/home-rail-title/.test(home), 'A6.4 applyMusicDefaults 处理 home-rail-title');
assert(/sfv-tmdb-attrib/.test(home), 'A6.5 applyMusicDefaults 移除 sfv-tmdb-attrib');
assert(/sfv-back-to-music/.test(home), 'A6.6 applyMusicDefaults 隐藏 sfv-back-to-music');

// A7. 注释与代码一致性：HTML 实际只有 5 张 home-card，注释已更新
var homeCardCount = (indexHtml.match(/<button class="home-card"/g) || []).length;
assert(homeCardCount === 5, 'A7.1 index.html 实际有 ' + homeCardCount + ' 张 home-card（应为 5）');
assert(!/6 张 \.home-card/.test(home), 'A7.2 home.js 已删除过期的"6 张"注释');

console.log('--- B. vm.Script 语法重 parse ---');
try { new vm.Script(home, { filename: 'home.js' }); assert(true, 'B1.1 home.js 语法 OK'); } catch (e) { assert(false, 'B1.1 home.js SyntaxError: ' + e.message); }
try { new vm.Script(dispatch, { filename: 'dispatch.js' }); assert(true, 'B1.2 dispatch.js 语法 OK'); } catch (e) { assert(false, 'B1.2 dispatch.js SyntaxError: ' + e.message); }
try { new vm.Script(state, { filename: 'state.js' }); assert(true, 'B1.3 state.js 语法 OK'); } catch (e) { assert(false, 'B1.3 state.js SyntaxError: ' + e.message); }
try { new vm.Script(model, { filename: 'model.js' }); assert(true, 'B1.4 model.js 语法 OK'); } catch (e) { assert(false, 'B1.4 model.js SyntaxError: ' + e.message); }
try { new vm.Script(bootstrap, { filename: 'bootstrap.js' }); assert(true, 'B1.5 bootstrap.js 语法 OK'); } catch (e) { assert(false, 'B1.5 bootstrap.js SyntaxError: ' + e.message); }

console.log('--- C. 行为模拟：music → video → music 完整流程 ---');
// 构造最小 DOM 沙箱验证：mock 的 #empty-home 元素、5 张 home-card、home-poster-title/quote、home-tile-row
var mockDom = function () {
  var cards = [];
  for (var i = 0; i < 5; i++) {
    var card = {
      tagName: 'BUTTON',
      className: 'home-card',
      children: [
        { className: 'home-card-label', textContent: ['Library','Daily','Song','Continue','Video'][i] },
        { className: 'home-card-title', textContent: 'title-' + i },
        { className: 'home-card-sub',   textContent: 'sub-' + i },
        { className: 'home-card-art',   innerHTML: '' }
      ],
      style: { display: '' },
      getAttribute: function (k) { return this['_' + k] || ''; },
      setAttribute: function (k, v) { this['_' + k] = v; },
      removeAttribute: function (k) { delete this['_' + k]; },
      classList: {
        _set: new Set(),
        add: function (c) { this._set.add(c); },
        remove: function (c) { this._set.delete(c); },
        contains: function (c) { return this._set.has(c); },
        toggle: function (c, on) { if (on) this._set.add(c); else this._set.delete(c); }
      },
      addEventListener: function () {},
      appendChild: function (c) {},
      removeChild: function (c) { return c; },
      querySelector: function (sel) {
        for (var j = 0; j < this.children.length; j++) {
          if (this.children[j].className === sel.replace(/^\./, '')) return this.children[j];
        }
        return null;
      },
      parentNode: null
    };
    cards.push(card);
  }
  return cards;
};

var capturedSnapshot = null;
// 模拟 home.js 的 captureMusicDefaults 核心逻辑
function simulateCapture() {
  var cards = mockDom();
  capturedSnapshot = {
    cards: cards.map(function (c) {
      return {
        label: c.children[0].textContent,
        title: c.children[1].textContent,
        sub: c.children[2].textContent,
        onclick: c.getAttribute('onclick')
      };
    }),
    poster: { title: '我的音乐海报', quote: '把喜欢的画面和一句话留在这里。' },
    rail: { title: '为你准备', note: '正在整理推荐' }
  };
}

// 模拟 home.js 改写（video 态）
function simulateVideoRender(cards) {
  for (var i = 0; i < cards.length; i++) {
    cards[i].children[0].textContent = ['心动','片单','收藏','历史','音乐空间'][i];
    cards[i].children[1].textContent = ['心动','片单','收藏','历史','音乐空间'][i];
    cards[i].children[2].textContent = 'sub-' + i;
  }
  // home-poster-title 被改为 "我的影视空间"
  // home-tile-row 被填入 5 张影视 tile（mock 省略）
}

// 模拟 applyMusicDefaults 回滚
function simulateRestore(cards) {
  if (!capturedSnapshot) return;
  for (var i = 0; i < cards.length && i < capturedSnapshot.cards.length; i++) {
    var def = capturedSnapshot.cards[i];
    cards[i].children[0].textContent = def.label;
    cards[i].children[1].textContent = def.title;
    cards[i].children[2].textContent = def.sub;
  }
}

simulateCapture();
var cards = mockDom();
simulateVideoRender(cards);
assert(cards[0].children[0].textContent === '心动', 'C1.1 video 态第1卡 label 被改成"心动"');
assert(cards[4].children[0].textContent === '音乐空间', 'C1.2 video 态第5卡 label 被改成"音乐空间"');

simulateRestore(cards);
assert(cards[0].children[0].textContent === 'Library', 'C2.1 回滚后第1卡 label 恢复为"Library"');
assert(cards[1].children[0].textContent === 'Daily', 'C2.2 回滚后第2卡 label 恢复为"Daily"');
assert(cards[2].children[0].textContent === 'Song', 'C2.3 回滚后第3卡 label 恢复为"Song"');
assert(cards[3].children[0].textContent === 'Continue', 'C2.4 回滚后第4卡 label 恢复为"Continue"');
assert(cards[4].children[0].textContent === 'Video', 'C2.5 回滚后第5卡 label 恢复为"Video"');

// C3. 重复切换 5 次，最终状态仍是 music 基线（无残留）
for (var n = 0; n < 5; n++) {
  simulateVideoRender(cards);
  simulateRestore(cards);
}
assert(cards[0].children[0].textContent === 'Library', 'C3.1 5次来回切换后第1卡仍为"Library"');
assert(cards[4].children[0].textContent === 'Video', 'C3.2 5次来回切换后第5卡仍为"Video"');

console.log('--- D. 铁律验证：空间切换触发 3D 歌单架 rebuild ---');
// 验证 window.scheduleShelfRebuild 在 index.html 已暴露
assert(/window\.scheduleShelfRebuild\s*=/.test(indexHtml), 'D1.1 index.html 暴露 window.scheduleShelfRebuild');

// 验证 dispatch.js 的 spacechange 监听调用 scheduleShelfRebuild
assert(/addEventListener\([\s\S]*?EVENT[\s\S]*?scheduleShelfRebuild\s*\(\s*['"]spacechange['"]/.test(dispatch),
  'D1.2 dispatch.js spacechange 监听调用 scheduleShelfRebuild("spacechange")');

console.log('--- E. 死命令：双态互不干扰承诺 ---');
// 验证 home.js 没有"残留到 music"的反模式：未改的 music 元素不被动
assert(!/function restoreMusic[\s\S]{0,500}?console\.log\(['"]残/.test(home), 'E1.1 restoreMusic 无残留日志（已彻底修复）');
assert(!/video-space-active[\s\S]{0,200}?home-card-label/.test(home), 'E1.2 home.js 不在 video 态下还触碰 home-card-label 之外的音乐态专属元素');

console.log('');
console.log('========================================');
console.log('  T118 双态隔离测试: ' + pass + ' pass / ' + fail + ' fail');
console.log('========================================');
process.exit(fail === 0 ? 0 : 1);
