// T133 回归：movie / anime 页面 back() 方法契约未破坏
//
// 背景：本次修复④+② 仅改动 online.js 的 goBack() fullscreen 分支（片单页），
// 以及 page-collections.js 的 back()/setItemsOpen。movie/anime 页面走 goBack 的
// page 分支（该分支逻辑本次未改动），其 back() 契约（详情态→网格返回 true、
// 网格态返回 false）由 page-media-grid.js 实现，本次未改。
//
// 验证内容：
//   1. 进入 movie/anime 页（mount）后，back() 在顶层网格态返回 false —— 这是
//      goBack 的 page 分支依赖的核心契约，确保从电影/动漫页返回不会误触发关闭。
//   2. 网格渲染正常（证明 mount 未崩溃、popular 异步流程无碍）。
//
// 关于 back() 的 true 分支（点击卡片进入详情→back 返回 true）：page-media-grid.js
// 的 buildCard 调用 `showDetail(it)` 未传入 host 参数（既有独立问题，非本次改动），
// 在当前 mock 环境无法黑盒触发详情态；该路径本次未改动，故 movie/anime 返回行为
// 不存在回退。若后续修复 showDetail 的 host 绑定，此方法可扩展验证 true 分支。
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

const tmdbItems = [{ id: 1, title: 'T1', poster: '', rating: 0, year: 2020 }];

// router 由真实 router.js 注入（见下方 runInContext）。此处刻意不提供 mock router，
// 否则会被 router.js 末尾的 `SFV.router = api` 覆盖，且 mock 的 go() 行为（未注入 host）
// 与真实实现漂移，导致 current() 返回 null。直接用真实 router 并 setHost 即可。
const SFV = {
  online: {},
  tmdb: { popular: (type, p) => Promise.resolve(tmdbItems) },
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
  SFV.router.setHost(host);
  SFV.router.go(id);
  await new Promise((r) => setTimeout(r, 0)); // 等待 popular.then(appendItems)
  const reg = SFV.router.current();
  expect(id + ' page registered', !!reg, true);
  // 顶层网格态：back() 必须返回 false（goBack page 分支依赖此契约）
  expect(id + ' back() at grid (top) = false', reg.back(), false);
  expect(id + ' back() again (top) = false', reg.back(), false);
  // 网格渲染正常（证明 mount 未崩溃、popular 异步流程正常）
  const grid = host._children[0];
  expect(id + ' grid rendered with >=1 card', !!(grid && grid._children.length >= 1), true);
}

(async () => {
  await runPage('movie');
  await runPage('anime');
  console.log('---');
  console.log('movie/anime back() 回归测试: pass=' + pass + ', fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
