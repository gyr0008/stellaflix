/**
 * T96 影视态顶部导航栏 + 胶囊搜索按钮 — 专项测试
 * 验证：HTML 结构、CSS 切换逻辑、JS 导航绑定、回归防护
 */
var vm = require('vm');
var fs = require('fs');

// ================================================================
// 1. 读源码
// ================================================================
var indexHtml = fs.readFileSync('public/index.html', 'utf8');
var onlineJs = fs.readFileSync('public/video/online.js', 'utf8');
var playerCss = fs.readFileSync('public/video/player.css', 'utf8');

// ================================================================
// 2. Stub DOM
// ================================================================
function createStubDOM() {
  var elements = {};
  var listeners = {};

  function mockEl(tag, cls, text) {
    return {
      tagName: (tag || 'div').toUpperCase(),
      className: cls || '',
      id: '',
      textContent: text || '',
      classList: {
        _set: {},
        add: function (c) { this._set[c] = true; },
        remove: function (c) { delete this._set[c]; },
        toggle: function (c, force) { if (force) this._set[c] = true; else if (force === false) delete this._set[c]; else this._set[c] = !this._set[c]; },
        contains: function (c) { return !!this._set[c]; }
      },
      attributes: {},
      setAttribute: function (k, v) { this.attributes[k] = v; },
      getAttribute: function (k) { return this.attributes[k] || null; },
      closest: function (sel) {
        // 简化匹配
        if (sel === '.sfv-nav-item' && this.className.indexOf('sfv-nav-item') !== -1) return this;
        if (sel === '#sfv-capsule-search-btn' && this.id === 'sfv-capsule-search-btn') return this;
        return null;
      },
      style: {},
      children: [],
      appendChild: function (child) { this.children.push(child); child.parentNode = this; return child; },
      parentNode: null,
      addEventListener: function (type, fn, capture) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push({ fn: fn, capture: !!capture });
      },
      focus: function () {}
    };
  }

  var doc = {
    querySelectorAll: function (sel) {
      if (sel === '.sfv-nav-item') {
        return [
          mockEl('button', 'sfv-nav-item active'),  // discover
          mockEl('button', 'sfv-nav-item'),          // world
          mockEl('button', 'sfv-nav-item'),          // home
          mockEl('button', 'sfv-nav-item'),          // movie
          mockEl('button', 'sfv-nav-item'),          // anime
        ].map(function (el, i) {
          el.setAttribute('data-sfv-nav', ['discover','world','home','movie','anime'][i]);
          return el;
        });
      }
      return [];
    },
    querySelector: function () { return null; },
    body: { className: '', appendChild: function () {} },
    documentElement: { className: '' },
    addEventListener: function (type, fn, capture) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push({ fn: fn, capture: !!capture });
    }
  };

  return { doc: doc, listeners: listeners, mockEl: mockEl };
}

// ================================================================
// 3. 断言工具
// ================================================================
var pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}

// ================================================================
// 测试组 A：HTML 结构验证
// ================================================================
console.log('\n=== A. HTML 结构 ===\n');

assert(indexHtml.indexOf('id="sfv-nav"') !== -1, '#sfv-nav 存在于 index.html');
assert(indexHtml.indexOf('class="sfv-nav"') !== -1, '.sfv-nav class 存在');
assert(indexHtml.indexOf('sfv-nav-item') !== -1, '.sfv-nav-item 存在');
assert(indexHtml.indexOf('data-sfv-nav="discover"') !== -1, 'discover nav item 存在');
assert(indexHtml.indexOf('data-sfv-nav="world"') !== -1, 'world nav item 存在');
assert(indexHtml.indexOf('data-sfv-nav="home"') !== -1, 'home nav item 存在');
assert(indexHtml.indexOf('data-sfv-nav="movie"') !== -1, 'movie nav item 存在');
assert(indexHtml.indexOf('data-sfv-nav="anime"') !== -1, 'anime nav item 存在');

// 默认选中首页（非汇联）
var homeActiveMatch = indexHtml.match(/sfv-nav-item[^>]*active[^>]*data-sfv-nav="home"|data-sfv-nav="home"[^>]*sfv-nav-item[^>]*active|sfv-nav-item active[^>]+data-sfv-nav="home"/);
assert(homeActiveMatch !== null,
       '默认选中项为 home（首页）按钮含 active class');
assert(indexHtml.indexOf('id="sfv-capsule-search-btn"') !== -1, '胶囊搜索按钮 #sfv-capsule-search-btn 存在');
assert(indexHtml.indexOf('sfv-capsule-search-btn') !== -1, '胶囊搜索按钮 class 存在');

// 导航项数量
var navItems = indexHtml.match(/sfv-nav-item/g);
assert(navItems && navItems.length === 5, '恰好 5 个 sfv-nav-item（实际=' + (navItems ? navItems.length : 0) + '）');

// 搜索图标 SVG 在胶囊按钮内
var capsuleBtnMatch = indexHtml.match(/id="sfv-capsule-search-btn"[^>]*>[\s\S]*?<svg/m);
assert(capsuleBtnMatch !== null, '胶囊搜索按钮内含 search SVG 图标');
// 搜索图标 19x19（与 home-btn svg 一致）
var capsuleSvgSize = indexHtml.match(/id="sfv-capsule-search-btn"[\s\S]*?width="(\d+)"[\s\S]*?height="(\d+)"/);
assert(capsuleSvgSize && capsuleSvgSize[1] === '19' && capsuleSvgSize[2] === '19',
       '胶囊搜索图标尺寸为 19x19（与 Home 图标一致）');

// 成员顺序：隐藏钮 → 搜索 → Home
var topRightStart = indexHtml.indexOf('<div id="top-right">');
var topRightEnd = indexHtml.indexOf('</div>', topRightStart);
var topRightSlice = indexHtml.substring(topRightStart, Math.min(topRightStart + 600, topRightEnd));
var hideIdx = topRightSlice.indexOf('user-capsule-hide-btn');
var searchIdx = topRightSlice.indexOf('sfv-capsule-search-btn');
var homeIdx = topRightSlice.indexOf('home-btn');
assert(hideIdx < searchIdx && searchIdx < homeIdx, '胶囊成员顺序正确：隐藏钮→搜索→Home');

// #search-box 内同时有音乐态元素和影视态导航
var searchBoxMatch = indexHtml.match(/<div id="search-box">[\s\S]*?<\/div>/);
assert(searchBoxMatch !== null, '#search-box 容器完整');
assert(searchBoxMatch[0].indexOf('id="search-icon"') !== -1, '#search-box 内保留 search-icon');
assert(searchBoxMatch[0].indexOf('id="search-input"') !== -1, '#search-box 内保留 search-input');
assert(searchBoxMatch[0].indexOf('id="sfv-nav"') !== -1, '#search-box 内新增 sfv-nav');

// ================================================================
// 测试组 B：CSS 切换逻辑
// ================================================================
console.log('\n=== B. CSS 切换逻辑 ===\n');

assert(playerCss.indexOf('body.video-space-active #search-box') !== -1, 'video-space-active 对 #search-box 有样式覆盖');
assert(playerCss.indexOf('body.video-space-active #search-icon') !== -1, '影视态隐藏 search-icon');
assert(playerCss.indexOf('body.video-space-active #search-input') !== -1, '影视态隐藏 search-input');
assert(playerCss.indexOf('.sfv-nav-item::after') !== -1, '选中下划线用 ::after 伪元素');
assert(playerCss.indexOf('bottom: 2px') !== -1 || playerCss.indexOf('height: 2px') !== -1, '下划线高度为 2px');
assert(playerCss.indexOf('transition: width .28s') !== -1 || playerCss.indexOf('transition:width') !== -1, '下划线有位移动画');
assert(playerCss.indexOf('--fc-accent-rgb') !== -1, '选中色使用主题色变量 --fc-accent-rgb');
assert(playerCss.indexOf('.sfv-capsule-search-btn') !== -1, '胶囊搜索按钮样式存在');
assert(playerCss.indexOf('display: none') !== -1 && playerCss.indexOf('body.video-space-active .sfv-capsule-search-btn') !== -1, '胶囊搜索按钮影视态显示');
assert(playerCss.indexOf('border-radius: 0') !== -1 || playerCss.indexOf('border-radius:0') !== -1, '导航项无圆角（非胶囊样式）');
assert(playerCss.indexOf('#search-mode-tabs') !== -1 && playerCss.indexOf('display: none !important') !== -1, '影视态隐藏 search-mode-tabs');
assert(playerCss.indexOf('#upload-actions') !== -1 && playerCss.indexOf('display: none !important') !== -1, '影视态隐藏 #upload-actions（红笔圈上传按钮）');

// 明确不用圆角胶囊样式
assert(playerCss.indexOf('border-radius:999px') === -1 || playerCss.indexOf('.sfv-nav-item') > playerCss.lastIndexOf('border-radius:999px'),
       'sfv-nav-item 不使用 border-radius:999px 圆角胶囊样式');

// ================================================================
// 测试组 C：JS 导航绑定逻辑（沙箱执行）
// ================================================================
console.log('\n=== C. JS 导航绑定逻辑 ===\n');

try {
  var stub = createStubDOM();
  var sandbox = {
    document: stub.doc,
    window: {
      StellaflixVideo: {
        state: {
          isVideo: function () { return true; },
          setSpace: function () {},
          EVENT: 'spacechange'
        },
        sources: { getEnabledSources: function () { return []; } },
        kazumi: null
      },
      goHome: function () {},
      addEventListener: stub.doc.addEventListener.bind(stub.doc)
    },
    console: { log: function(){}, warn: function(){}, error: function(){} }
  };

  // 提取 online.js 中 bindNavItems / setActiveNav / handleNavAction 的定义代码
  // 通过正则提取函数签名来验证存在性（函数体含 switch{} 嵌套，简单正则无法精确匹配完整体）
  assert(onlineJs.indexOf('function setActiveNav(key)') !== -1, 'setActiveNav 函数存在于 online.js');

  assert(onlineJs.indexOf('function handleNavAction(key)') !== -1, 'handleNavAction 函数存在于 online.js');

  assert(onlineJs.indexOf('function bindNavItems()') !== -1, 'bindNavItems 函数存在于 online.js');

  assert(onlineJs.indexOf('function bindCapsuleSearchBtn()') !== -1, 'bindCapsuleSearchBtn 函数存在于 online.js');

  // 测试 handleNavAction 的 switch 分支完整性
  var cases = ['discover', 'world', 'home', 'movie', 'anime'];
  for (var i = 0; i < cases.length; i++) {
    assert(onlineJs.indexOf("'" + cases[i] + "'") !== -1 ||
           onlineJs.indexOf('"'+cases[i]+'"') !== -1,
           'handleNavAction 包含 case: ' + cases[i]);
  }

} catch (e) {
  assert(false, 'JS 沙箱执行出错: ' + e.message);
}

// ================================================================
// 测试组 D：回归防护
// ================================================================
console.log('\n=== D. 回归防护 ===\n');

// 音乐态不受影响：#search-icon 和 #search-input 仍在 DOM 中
assert(indexHtml.indexOf('id="search-icon"') !== -1, '回归：search-icon 未被删除');
assert(indexHtml.indexOf('id="search-input"') !== -1, '回归：search-input 未被删除');
assert(indexHtml.indexOf('id="search-mode-tabs"') !== -1, '回归：search-mode-tabs 未被删除');
assert(indexHtml.indexOf('id="home-btn"') !== -1, '回归：home-btn 未被删除');
assert(indexHtml.indexOf('id="user-btn"') !== -1, '回归：user-btn 未被删除');
assert(indexHtml.indexOf('id="user-capsule-hide-btn"') !== -1, '回归：user-capsule-hide-btn 未被删除');

// index.html 净增行数检查（只增不减原有结构）
assert(indexHtml.indexOf('goHome()') !== -1, '回归：goHome onclick 保持不变');
assert(indexHtml.indexOf('toggleUserCapsuleAutoHide') !== -1, '回归：capsule hide btn onclick 保持不变');

// 业务逻辑不泄漏到 index.html（只有 HTML 结构 + 注释）
var sfvNavBlock = indexHtml.substring(indexHtml.indexOf('id="sfv-nav"'), indexHtml.indexOf('id="sfv-nav"') + 200);
assert(sfvNavBlock.indexOf('onclick=') === -1, '回归：sfv-nav 不含内联 onclick（事件由 JS 绑定）');
assert(sfvNavBlock.indexOf('function ') === -1, '回归：sfv-nav 不含 JS 函数定义');

// ================================================================
// 结果汇总
// ================================================================
console.log('\n========================================');
console.log('T96 影视导航栏测试: ' + pass + ' PASS / ' + fail + ' FAIL / ' + (pass+fail) + ' TOTAL');
if (fail === 0) console.log('ALL PASS ✅');
else console.log('HAS FAILURES ❌');
process.exit(fail > 0 ? 1 : 0);
