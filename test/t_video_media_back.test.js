// T133 回归：movie / anime 页面 back() 方法契约未破坏
//
// 重要（T134 / T127 重设计后）：电影/动漫分页已改为「3D 歌单架同款」空壳——mount 时
// host.innerHTML='' 并调用 SFV.browse3d.activate({ mediaType, host }) 在共享 WebGL 画布
// 渲染 3D 海报墙，**不再渲染 DOM 卡片网格、也不再调用 tmdb.popular**。
// 因此本测试不再断言「DOM 卡片数 >= 1」，改为断言 3D 空壳挂载契约；
// T133 的真正核心契约——back() 在顶层网格态返回 false——仍为本测试首要验证项。
//
// 验证内容：
//   1. 进入 movie/anime 页（mount）后，back() 在顶层网格态返回 false —— 这是
//      goBack 的 page 分支依赖的核心契约，确保从电影/动漫页返回不会误触发关闭。
//   2. 3D 空壳挂载契约：宿主被清空（host.innerHTML===''）且触发
//      SFV.browse3d.activate({ mediaType, host })，证明 mount 未崩溃、3D 海报墙已接管。
const fs = require('fs');
const vm = require('vm');

const store = {};
const fakeLS = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

function makeEl(tag) {
  const el = {
    tag,
    _cls: new Set(), attrs: {}, _text: '', _children: [], _handlers: {}, _html: '',
    classList: {
      add(c) { el._cls.add(c); },
      remove(c) { el._cls.delete(c); },
      toggle(c, f) {
        if (f === true) el._cls.add(c);
        else if (f === false) el._cls.delete(c);
        else el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c);
        return el._cls.has(c);
      },
      contains(c) { return el._cls.has(c); }
    },
    setAttribute(k, v) { el.attrs[k] = v; },
    getAttribute(k) { return el.attrs[k]; },
    set textContent(v) { el._text = v; },
    get textContent() { return el._text; },
    set innerHTML(v) { if (v === '') el._children = []; el._html = v; },
    get innerHTML() { return el._html; },
    appendChild(c) { el._children.push(c); c.parent = el; return c; },
    addEventListener(t, fn) { (el._handlers[t] = el._handlers[t] || []).push(fn); },
    querySelectorAll() { return []; },
    style: { setProperty() {}, removeProperty() {} }
  };
  el.children = el._children;
  return el;
}

// 旧设计（T133 时期）通过 tmdb.popular 渲染 DOM 网格；T134/T127 重设计后 3D 空壳不再调用，
// 此处保留 mock 仅为兼容，不应再被触发。
const tmdbItems = [{ id: 1, title: 'T1', poster: '', rating: 0, year: 2020 }];

// 3D 海报墙挂载探针：记录 activate 调用，用于断言 3D 空壳挂载契约。
const activated = [];

// router 由真实 router.js 注入（见下方 runInContext）。此处刻意不提供 mock router，
// 否则会被 router.js 末尾的 `SFV.router = api` 覆盖。
const SFV = {
  online: {},
  tmdb: { popular: (type, p) => Promise.resolve(tmdbItems) },
  browse3d: {
    activate: (opts) => { activated.push(opts || {}); },
    deactivate: () => {}
  },
  ui: {
    el: (tag, cls, text) => { const e = makeEl(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; },
    setBrowseChrome: () => {}, toast: () => {}, setNote: () => {}, paintFlag: () => {}, setTitle: () => {}, CATEGORY_META: {}
  }
};

const ctx = { console, IntersectionObserver: undefined };
ctx.window = ctx; ctx.global = ctx;
ctx.document = { createElement: makeEl, getElementById: () => null, body: makeEl('body'), addEventListener() {} };
ctx.StellaflixVideo = SFV;
vm.createContext(ctx);

vm.runInContext(fs.readFileSync('public/video/router.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('public/video/page-media-grid.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('public/video/page-movie.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('public/video/page-anime.js', 'utf8'), ctx);

let pass = 0, fail = 0;
function expect(name, got, want) {
  if (got === want) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name, 'got=' + JSON.stringify(got), 'want=' + JSON.stringify(want)); }
}

async function runPage(id) {
  const host = makeEl('div');
  activated.length = 0;
  SFV.router.setHost(host);
  SFV.router.go(id);
  await new Promise((r) => setTimeout(r, 0)); // 等待 mount 异步收尾
  const reg = SFV.router.current();
  expect(id + ' page registered', !!reg, true);
  // T133 核心契约：顶层网格态 back() 必须返回 false（goBack page 分支依赖此契约）
  expect(id + ' back() at grid (top) = false', reg.back(), false);
  expect(id + ' back() again (top) = false', reg.back(), false);
  // T134/T127 3D 空壳挂载契约：宿主被清空 + 触发 browse3d.activate({ mediaType, host })
  expect(id + ' host cleared by shell mount', host.innerHTML === '', true);
  expect(id + ' browse3d.activate called with mediaType', activated.some((o) => o.mediaType === id && o.host === host), true);
}

(async () => {
  await runPage('movie');
  await runPage('anime');
  console.log('---');
  console.log('movie/anime back() 回归测试 (T134/T127 3D 空壳): pass=' + pass + ', fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
