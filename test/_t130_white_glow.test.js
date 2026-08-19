// T130 验证：白色 glow 高亮 + DOM 驱动 mode 名称（纯 CSS 显隐，JS 不改 textContent）
//
// 注意（模块重定位后）：updateStartSpaceUI / toggleStartSpace / get|setStartSpacePreference
// 已从 public/index.html 内联脚本迁至音乐模块源码 src/music/legacy-music.js（构建产物
// public/assets/music.js）。本测试改为从该源码抽取函数体（括号配平，避免嵌套 {} 截断），
// CSS/DOM 断言仍针对 public/index.html（白光与 data-mode 规则仍在该文件）。
const fs = require('fs');
const vm = require('vm');

const store = {};
const fakeLocalStorage = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

function makeCtx() {
  const ctx = {
    window: null,
    document: {
      body: { classList: { toggle: () => {}, _cls: new Set(), contains: () => false } },
      addEventListener: () => {},
      createElement: () => ({ classList: { toggle: () => {} } })
    },
    localStorage: fakeLocalStorage,
    CustomEvent: function () {},
    dispatchEvent: () => {},
    console: console
  };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  return ctx;
}

const stateCode = fs.readFileSync('public/video/state.js', 'utf8');

let pass = 0, fail = 0;
function expect(name, got, want) {
  const ok = got === want;
  if (ok) { pass++; console.log('  PASS:', name); }
  else    { fail++; console.log('  FAIL:', name, '| got=' + JSON.stringify(got), 'want=' + JSON.stringify(want)); }
}

function makeEl(tag) {
  const el = {
    tag,
    classList: {
      _cls: new Set(),
      add: function (c) { this._cls.add(c); },
      remove: function (c) { this._cls.delete(c); },
      toggle: function (c, force) {
        if (force === true) this._cls.add(c);
        else if (force === false) this._cls.delete(c);
        else if (this._cls.has(c)) this._cls.delete(c);
        else this._cls.add(c);
        return this._cls.has(c);
      },
      contains: function (c) { return this._cls.has(c); }
    },
    attrs: {},
    setAttribute: function (k, v) { this.attrs[k] = v; },
    getAttribute: function (k) { return this.attrs[k]; },
    _text: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; },
    children: [],
    appendChild: function (c) { this.children.push(c); c.parent = this; return c; },
    addEventListener: function () {}
  };
  return el;
}

// 从真实 index.html 提取 DOM 模板 + CSS 规则
const html = fs.readFileSync('public/index.html', 'utf8');
// 函数体（updateStartSpaceUI 等）已从 index.html 内联脚本迁至音乐模块源码
const srcCode = fs.readFileSync('src/music/legacy-music.js', 'utf8');

// 从源码（legacy-music.js）抽取函数体，使用括号配平以避免嵌套 {} 截断
function extractFunc(name, code) {
  const src = code || srcCode;
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  if (start === -1) return null;
  const open = src.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0, end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  return src.slice(start, end);
}
const updateStartSpaceUISrc = extractFunc('updateStartSpaceUI');
const toggleStartSpaceSrc = extractFunc('toggleStartSpace');
const getStartSpacePrefSrc = extractFunc('getStartSpacePreference');
const setStartSpacePrefSrc = extractFunc('setStartSpacePreference');
console.log('  (extracted updateStartSpaceUI:', updateStartSpaceUISrc ? updateStartSpaceUISrc.length + ' chars' : 'NOT FOUND', ')');

if (!updateStartSpaceUISrc) { fail++; console.log('  FAIL: cannot find updateStartSpaceUI source'); process.exit(1); }

// === Test 1: 关键设计：updateStartSpaceUI 永远不改 textContent ===
console.log('--- Test 1: updateStartSpaceUI source contains NO textContent write ---');
expect('No curEl.textContent = in updateStartSpaceUI',
  /curEl\.textContent\s*=/.test(updateStartSpaceUISrc), false);
expect('No othEl.textContent = in updateStartSpaceUI',
  /othEl\.textContent\s*=/.test(updateStartSpaceUISrc), false);
expect('No "影视空间" literal in updateStartSpaceUI',
  updateStartSpaceUISrc.includes('影视空间'), false);
expect('No "音乐空间" literal in updateStartSpaceUI',
  updateStartSpaceUISrc.includes('音乐空间'), false);
expect('classList.toggle start-space-video present',
  /classList\.toggle\(['"]start-space-video['"]/.test(updateStartSpaceUISrc), true);

// === Test 2: DOM 包含 data-mode 属性 + 两个 ss-text 文字 ===
console.log('--- Test 2: DOM has data-mode with text content ---');
const domMatch = html.match(/<div class="fx-toggle" id="t-startSpace"[\s\S]*?<\/div>/);
if (domMatch) {
  const dom = domMatch[0];
  expect('DOM contains data-mode="music" text 音乐空间',
    /data-mode="music"[^>]*>音乐空间</.test(dom) || /data-mode="music"[\s\S]{0,30}>音乐空间</.test(dom), true);
  expect('DOM contains data-mode="video" text 影视空间',
    /data-mode="video"[^>]*>影视空间</.test(dom) || /data-mode="video"[\s\S]{0,30}>影视空间</.test(dom), true);
  expect('DOM contains class ss-text',
    /class="ss-text[^"]*"/.test(dom), true);
} else {
  fail++; console.log('  FAIL: t-startSpace DOM not found');
}

// === Test 3: CSS 用 data-mode 选择器，不依赖 ss-current / ss-other ===
console.log('--- Test 3: CSS uses data-mode selector ---');
expect('CSS selector for ss-text[data-mode="music"]',
  /\.ss-text\[data-mode="music"\]/.test(html), true);
expect('CSS selector for ss-text[data-mode="video"]',
  /\.ss-text\[data-mode="video"\]/.test(html), true);
expect('CSS no longer uses .ss-current (cleanup) or .ss-other',
  // 允许 ss-current/other 仍然作为冗余 class 存在，但不能再控制显隐
  // 关键：显隐规则必须用 data-mode
  /(\.fx-toggle\.start-space-video|\.fx-toggle)\s+\.start-space-label\s+\.ss-current\s*\{/.test(html), false);

// === Test 4: 白色 glow 视觉规则 ===
console.log('--- Test 4: white glow rules ---');
expect('CSS: .fx-toggle#t-startSpace has color:#fff',
  /\.fx-toggle#t-startSpace\s*\{[^}]*color:\s*#fff/s.test(html), true);
expect('CSS: .fx-toggle#t-startSpace has white border',
  /\.fx-toggle#t-startSpace\s*\{[^}]*border-color:\s*rgba\(255,255,255/s.test(html), true);
expect('CSS: .fx-toggle#t-startSpace has white box-shadow glow',
  /\.fx-toggle#t-startSpace\s*\{[^}]*box-shadow:[^}]*rgba\(255,255,255/s.test(html), true);
expect('CSS: .fx-toggle#t-startSpace .dot has white box-shadow',
  /\.fx-toggle#t-startSpace\s+\.dot\s*\{[^}]*box-shadow:[^}]*rgba\(255,255,255/s.test(html), true);
expect('CSS: .fx-toggle#t-startSpace.start-space-video overrides with cyan',
  /\.fx-toggle#t-startSpace\.start-space-video\s*\{[^}]*rgba\(0,245,212/s.test(html), true);

// === Test 5: 行为验证 — 真实执行 updateStartSpaceUI，DOM 文字永不变 ===
console.log('--- Test 5: behavior — text never mutated by updateStartSpaceUI ---');
const ctx = makeCtx();
vm.runInContext(stateCode, ctx);
const inlineCode = `
${getStartSpacePrefSrc}
${setStartSpacePrefSrc}
${updateStartSpaceUISrc}
${toggleStartSpaceSrc}
document.getElementById = function (id) {
  if (id === 't-startSpace') return window.__mockCard;
  return null;
};
window.showToast = function () { window.__toasted = (window.__toasted || 0) + 1; };
`;
vm.runInContext(inlineCode, ctx);

// 构造真实 DOM 节点（与 index.html 一致）
const card = makeEl('div');
card.id = 't-startSpace';
const label = makeEl('span');
label.classList.add('start-space-label');
const musicEl = makeEl('em');
musicEl.classList.add('ss-text');
musicEl.setAttribute('data-mode', 'music');
musicEl._text = '音乐空间';
const videoEl = makeEl('em');
videoEl.classList.add('ss-text');
videoEl.setAttribute('data-mode', 'video');
videoEl._text = '影视空间';
label.appendChild(musicEl);
label.appendChild(videoEl);
card.appendChild(label);
const dot = makeEl('span');
dot.classList.add('dot');
card.appendChild(dot);
ctx.__mockCard = card;

vm.runInContext('updateStartSpaceUI()', ctx);
expect('after init: music text intact', musicEl._text, '音乐空间');
expect('after init: video text intact', videoEl._text, '影视空间');
expect('after init: card NOT start-space-video', card.classList.contains('start-space-video'), false);
expect('after init: data-start-space=music', card.attrs['data-start-space'], 'music');

vm.runInContext('toggleStartSpace()', ctx);
expect('after 1st toggle: music text STILL intact (not mutated by JS)', musicEl._text, '音乐空间');
expect('after 1st toggle: video text STILL intact', videoEl._text, '影视空间');
expect('after 1st toggle: card HAS start-space-video', card.classList.contains('start-space-video'), true);
expect('after 1st toggle: data-start-space=video', card.attrs['data-start-space'], 'video');

vm.runInContext('toggleStartSpace()', ctx);
expect('after 2nd toggle: music text STILL intact', musicEl._text, '音乐空间');
expect('after 2nd toggle: video text STILL intact', videoEl._text, '影视空间');
expect('after 2nd toggle: card NOT start-space-video', card.classList.contains('start-space-video'), false);
expect('after 2nd toggle: data-start-space=music', card.attrs['data-start-space'], 'music');

vm.runInContext('toggleStartSpace()', ctx);
vm.runInContext('toggleStartSpace()', ctx);
vm.runInContext('toggleStartSpace()', ctx);
vm.runInContext('toggleStartSpace()', ctx);
// 4 toggles: music → video → music → video → music  (回到 music)
expect('after 4 toggles: music text STILL intact', musicEl._text, '音乐空间');
expect('after 4 toggles: video text STILL intact', videoEl._text, '影视空间');
expect('after 4 toggles: card NOT start-space-video (back to music)', card.classList.contains('start-space-video'), false);
expect('after 4 toggles: data-start-space=music', card.attrs['data-start-space'], 'music');

// === Test 6: 重命名 mode 文字（模拟用户改 DOM）→ CSS 仍按 data-mode 工作 ===
console.log('--- Test 6: rename mode name in DOM works without code change ---');
musicEl._text = '标准空间';   // 用户改名为"标准空间"
videoEl._text = '影院空间';   // 用户改名为"影院空间"
// 切到 video，验证 CSS class 正确，且文字仍是 DOM 改过的版本
vm.runInContext('toggleStartSpace()', ctx);
expect('renamed music still intact', musicEl._text, '标准空间');
expect('renamed video still intact', videoEl._text, '影院空间');
expect('renamed + toggled to video: card class on', card.classList.contains('start-space-video'), true);

// 切回 music
vm.runInContext('toggleStartSpace()', ctx);
expect('renamed + toggled back to music: card class off', card.classList.contains('start-space-video'), false);
expect('renamed + music: music text = 标准空间', musicEl._text, '标准空间');
expect('renamed + music: video text = 影院空间', videoEl._text, '影院空间');

console.log('---');
console.log('Total: pass=' + pass + ', fail=' + fail);
process.exit(fail ? 1 : 0);
