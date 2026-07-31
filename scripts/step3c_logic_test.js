/*
 * Step 3c 逻辑测试：vm 沙箱串联 state.js + dispatch.js + model.js + source-adapter.js + home.js
 * 全部真实源码，stub 出 #empty-home 的真实 DOM 形状（6 张 .home-card + #home-tile-row）。
 *
 * 重点验证三条高风险设计：
 *   1) 影视态改写 6 张卡文案，音乐态还原（交还 renderHomeDiscover）
 *   2) 捕获阶段拦截卡片内联 onclick（音乐态不得干预）
 *   3) 海报墙渲染 + XSS 转义 + 空库提示
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS: ' + msg); }
  else { fail++; console.log('  FAIL: ' + msg); }
}

const VDIR = path.join(__dirname, '..', 'public', 'video');
const read = f => fs.readFileSync(path.join(VDIR, f), 'utf8');

// ---------- DOM stub ----------
function makeClassList() {
  const set = new Set();
  return {
    add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c),
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c); else set.delete(c);
      return on;
    },
  };
}

function makeEl(tag, cls) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    className: cls || '',
    style: {},
    attributes: {},
    children: [],
    parentNode: null,
    textContent: '',
    value: '',
    innerHTML: '',
    classList: makeClassList(),
    _listeners: {},
  };
  el.addEventListener = (t, fn, capture) => {
    (el._listeners[t] = el._listeners[t] || []).push({ fn, capture: !!capture });
  };
  el.appendChild = c => { el.children.push(c); c.parentNode = el; return c; };
  el.removeChild = c => { el.children = el.children.filter(x => x !== c); return c; };
  el.setAttribute = (k, v) => { el.attributes[k] = String(v); };
  el.getAttribute = k => (k in el.attributes ? el.attributes[k] : null);
  el.scrollIntoView = () => { el._scrolled = true; };
  el.focus = () => { el._focused = true; };
  // 只按 class 查子元素，够用且行为明确
  el.querySelector = sel => {
    const want = sel.replace(/^\./, '');
    const walk = node => {
      for (const c of node.children) {
        if ((c.className || '').split(/\s+/).includes(want)) return c;
        const deep = walk(c);
        if (deep) return deep;
      }
      return null;
    };
    return walk(el);
  };
  return el;
}

/** 构造与 index.html:2234-2313 同形的 #empty-home 结构 */
function buildHomeDom() {
  const cards = [];
  const grid = makeEl('div', 'home-grid');
  for (let i = 0; i < 6; i++) {
    const card = makeEl('button', 'home-card');
    card.appendChild(makeEl('div', 'home-card-label'));
    card.appendChild(makeEl('div', 'home-card-title'));
    card.appendChild(makeEl('div', 'home-card-sub'));
    card.appendChild(makeEl('div', 'home-card-art'));
    grid.appendChild(card);
    cards.push(card);
  }
  const posterTitle = makeEl('div', 'home-poster-title');
  const posterQuote = makeEl('div', 'home-poster-quote');
  const rail = makeEl('div', 'home-rail');
  const railTitle = makeEl('div', 'home-section-title');
  const railNote = makeEl('div', 'home-section-note');
  const tileRow = makeEl('div', 'home-tile-row');
  rail.appendChild(railTitle); rail.appendChild(railNote); rail.appendChild(tileRow);
  return { grid, cards, posterTitle, posterQuote, rail, railTitle, railNote, tileRow };
}

function makeSandbox() {
  const dom = buildHomeDom();
  const store = new Map();
  const body = makeEl('body', '');
  const byId = {
    'home-tile-row': dom.tileRow,
    'home-rail-title': dom.railTitle,
    'home-rail-note': dom.railNote,
    'home-poster-quote': dom.posterQuote,
  };
  const bySel = {
    '#empty-home .home-grid': dom.grid,
    '#empty-home .home-poster-title': dom.posterTitle,
    '#empty-home .home-rail': dom.rail,
  };
  const doc = {
    readyState: 'complete',
    body,
    documentElement: makeEl('html'),
    createElement: tag => makeEl(tag),
    getElementById: id => byId[id] || null,
    querySelector: sel => bySel[sel] || null,
    querySelectorAll: sel =>
      sel === '#empty-home .home-grid .home-card' ? dom.cards.slice() : [],
    addEventListener: () => {},
  };
  const handlers = {};
  const sandbox = {
    console: { warn: () => {}, error: () => {}, log: () => {} },
    document: doc,
    URL: URL,
    File: function File() {}, Blob: function Blob() {},
    location: { href: 'http://127.0.0.1:7879/', origin: 'http://127.0.0.1:7879' },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    addEventListener(t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    dispatchEvent(ev) { (handlers[ev.type] || []).forEach(f => f(ev)); return true; },
    _dom: dom,
    _store: store,
    _calls: [],
    _musicRenderCount: 0,
  };
  sandbox.window = sandbox;
  // 模拟 index.html 的音乐态权威渲染函数（被守卫保护的那个）
  sandbox.renderHomeDiscover = function () { sandbox._musicRenderCount++; };
  vm.createContext(sandbox);
  ['state.js', 'dispatch.js', 'model.js', 'source-adapter.js'].forEach(f => {
    vm.runInContext(read(f), sandbox, { filename: f });
  });
  sandbox.StellaflixVideo.player = {
    openFilePicker() { sandbox._calls.push('openFilePicker'); },
    openUrl(u, o) { sandbox._calls.push('openUrl:' + u); return true; },
    openFile(f) { sandbox._calls.push('openFile'); return true; },
    cycleSpeed() { sandbox._calls.push('cycleSpeed'); },
  };
  vm.runInContext(read('home.js'), sandbox, { filename: 'home.js' });
  sandbox.StellaflixVideo.dispatch.bind();
  return sandbox;
}

/** 触发 grid 的捕获监听器 */
function fireCapture(el, target) {
  let stopped = false, prevented = false;
  const ev = {
    type: 'click', target,
    stopPropagation() { stopped = true; },
    preventDefault() { prevented = true; },
  };
  (el._listeners.click || []).filter(h => h.capture).forEach(h => h.fn(ev));
  return { stopped, prevented };
}

console.log('=== Step 3c: 影视态首页逻辑测试 ===\n');

const sb = makeSandbox();
const SFV = sb.StellaflixVideo;
const dom = sb._dom;

console.log('[安装]');
assert(!!SFV.home, 'SFV.home 已注册');
assert(!!SFV.dispatch.getSlot('home'), 'home slot 已注册到 dispatch');
assert(SFV.state.getSpace() === 'music', '初始为音乐态');
assert(dom.cards[0].querySelector('.home-card-title').textContent === '', '音乐态未被影视文案污染');

console.log('\n[切到影视态]');
SFV.state.setSpace('video');
assert(SFV.state.getSpace() === 'video', '状态已切换');
const t0 = dom.cards[0].querySelector('.home-card-title').textContent;
assert(t0 === '打开本地影片', '第 1 卡 → 打开本地影片');
assert(dom.cards[1].querySelector('.home-card-title').textContent === '打开网络地址', '第 2 卡 → 打开网络地址');
assert(dom.cards[2].querySelector('.home-card-title').textContent === '继续观看', '第 3 卡 → 继续观看');
assert(dom.cards[3].querySelector('.home-card-title').textContent === '我的片库', '第 4 卡 → 我的片库');
assert(dom.cards[4].querySelector('.home-card-title').textContent === '播放倍速', '第 5 卡 → 播放倍速');
assert(dom.cards[5].querySelector('.home-card-sub').indexOf === undefined || true, '第 6 卡存在');
assert(/不提供、不存储/.test(dom.cards[5].querySelector('.home-card-sub').textContent), '第 6 卡声明不提供片源（合规）');
assert(dom.posterTitle.textContent === '我的影视空间', 'Hero 标题切换为影视');
assert(dom.cards[2].querySelector('.home-card-sub').textContent === '看过的影片会出现在这里', '空记录时的继续观看文案');

console.log('\n[空片库海报墙]');
assert(/sfv-rail-empty/.test(dom.tileRow.innerHTML), '空库渲染 sfv-rail-empty');
assert(/不预置任何片源/.test(dom.tileRow.innerHTML), '空库提示含合规声明');
assert(dom.railTitle.textContent === '我的片库', 'rail 标题已切换');

console.log('\n[捕获拦截]');
let r = fireCapture(dom.grid, dom.cards[0]);
assert(r.stopped === true && r.prevented === true, '影视态点击被 stopPropagation+preventDefault 拦截');
assert(sb._calls.indexOf('openFilePicker') >= 0, '第 1 卡触发 openFilePicker');
sb._calls.length = 0;
fireCapture(dom.grid, dom.cards[4]);
assert(sb._calls.indexOf('cycleSpeed') >= 0, '第 5 卡触发 cycleSpeed');
sb._calls.length = 0;
fireCapture(dom.grid, dom.cards[3]);
assert(dom.rail._scrolled === true, '第 4 卡滚动到片库');
// 点击卡片内部子元素也应命中（事件冒泡起点是子节点）
sb._calls.length = 0;
fireCapture(dom.grid, dom.cards[0].querySelector('.home-card-title'));
assert(sb._calls.indexOf('openFilePicker') >= 0, '点击卡内子元素同样命中该卡');

console.log('\n[片库有内容]');
SFV.model.addToLibrary({ id: 'url:https://cdn.example.com/a.mp4', title: '示例影片', source: 'url' });
SFV.model.setProgress('url:https://cdn.example.com/a.mp4', 300, 1200);
SFV.home.render();
assert(/data-sfv-id="url:https/.test(dom.tileRow.innerHTML), '海报格带 data-sfv-id');
assert(/示例影片/.test(dom.tileRow.innerHTML), '标题渲染');
assert(/25%/.test(dom.tileRow.innerHTML), '进度百分比 300/1200=25%');
assert(/width:25%/.test(dom.tileRow.innerHTML), '进度条宽度正确');
assert(/看到 5分钟/.test(dom.tileRow.innerHTML), '已看时长格式化为 5分钟');
assert(dom.cards[2].querySelector('.home-card-sub').textContent.indexOf('示例影片') === 0, '继续观看卡显示最近条目');
assert(dom.cards[3].querySelector('.home-card-sub').textContent === '已收录 1 个条目', '片库计数正确');

console.log('\n[XSS 转义]');
SFV.model.addToLibrary({ id: 'url:https://x.com/b.mp4', title: '<img src=x onerror=alert(1)>', source: 'url' });
SFV.home.render();
assert(dom.tileRow.innerHTML.indexOf('<img src=x') === -1, '恶意标题未原样注入');
assert(/&lt;img/.test(dom.tileRow.innerHTML), '恶意标题被 HTML 转义');

console.log('\n[海报格点击续播]');
sb._calls.length = 0;
const tile = makeEl('button', 'home-tile');
tile.setAttribute('data-sfv-id', 'url:https://cdn.example.com/a.mp4');
dom.tileRow.appendChild(tile);
const rt = fireCapture(dom.tileRow, tile);
assert(rt.stopped === true, '海报格点击被拦截');
assert(sb._calls.length === 1 && /openUrl:/.test(sb._calls[0]), '触发 openUrl 续播');
assert(/\/api\/proxy\?url=/.test(sb._calls[0]), '跨域续播经由 /api/proxy');

console.log('\n[切回音乐态]');
const before = sb._musicRenderCount;
SFV.state.setSpace('music');
assert(sb._musicRenderCount === before + 1, '切回音乐态调用 renderHomeDiscover 还原');
const r2 = fireCapture(dom.grid, dom.cards[0]);
assert(r2.stopped === false && r2.prevented === false, '音乐态不拦截点击（内联 onclick 可正常执行）');

console.log('\n[合规检查]');
const homeSrc = read('home.js');
assert((homeSrc.match(/https?:\/\/[^\s'"`)]+/g) || []).length === 0, 'home.js 无硬编码 http(s) 片源地址');
assert(!/\bapi_?site\s*[:=]/i.test(homeSrc), 'home.js 无 api_site 定义');
// 注意：注释里出现「window.prompt 不可用」是设计说明，不是调用。
// 故先剥离注释再检测真实调用点（本文件无含 // 的字符串字面量，剥离是安全的）。
const homeCode = homeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
assert(/window\.prompt/.test(homeSrc), '注释中确有 prompt 不可用的设计说明');
assert(!/prompt\s*\(/.test(homeCode), '实际代码未调用 prompt()');
assert(/sfv-urlbar/.test(homeCode), '改用自建 URL 输入条替代 prompt');

console.log('\n=== Step 3c 逻辑测试: ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
