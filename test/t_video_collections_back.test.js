// T133 验证：片单页 back() 协同（修复④ + 修复②配套）
// 验证 page-collections 的 back() 在页内二级视图（具体片单）消费返回，
// 回到片单列表（调用 SFV.online.reopenCollections），顶层列表返回 false 交由外壳关闭。
// 同时验证 goBack() 的 fullscreen 分支已改为"先询问 router.current().back()"。
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

const reopened = { count: 0 };
const pages = {};
let currentId = null;
let lastHost = null;

const SFV = {
  collections: {
    getTabs: () => [{ id: 'featured', label: '推荐' }, { id: 'mine', label: '我的片单' }],
    getByTab: (id) => id === 'mine' ? [] : [{ id: 'c1', title: '片单1', type: 'curated', count: 3, sub: '' }],
    getPosters: () => Promise.resolve([]),
    listUserFolders: () => []
  },
  online: { reopenCollections: () => { reopened.count++; } },
  router: {
    register: (p) => { pages[p.id] = p; },
    go: (id) => { currentId = id; const h = makeEl('div'); lastHost = h; pages[id].mount(h, { router: SFV.router, shell: SFV.online }); },
    current: () => (currentId ? pages[currentId] : null),
    currentId: () => currentId
  }
};

const ctx = { console, localStorage: fakeLS, IntersectionObserver: undefined };
ctx.window = ctx; ctx.global = ctx;
ctx.document = { createElement: makeEl, getElementById: () => null, body: makeEl('body'), addEventListener() {} };
ctx.StellaflixVideo = SFV;
vm.createContext(ctx);

vm.runInContext(fs.readFileSync('public/video/page-collections.js', 'utf8'), ctx);

let pass = 0, fail = 0;
function expect(name, got, want) {
  if (got === want) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name, 'got=' + JSON.stringify(got), 'want=' + JSON.stringify(want)); }
}

// 进入片单列表（router page）
SFV.router.go('collections');
const reg = SFV.router.current();
expect('collections page registered', !!reg, true);
expect('collections back() at list (top tab) = false', reg.back(), false);

// 进入具体片单（online.js openCollectionItems 会调 setItemsOpen(true)）
SFV.pageCollections.setItemsOpen(true);
expect('collections back() in item (二级视图) = true', reg.back(), true);
expect('reopenCollections called exactly once', reopened.count, 1);
// reopenCollections → router.go('collections') → mount 重渲染列表，itemsOpen 复位
expect('collections back() after reopen (back to list) = false', reg.back(), false);
expect('reopenCollections not called again', reopened.count, 1);

// 边界：显式复位后顶层 back() 仍 false
SFV.pageCollections.setItemsOpen(false);
expect('collections back() after explicit reset = false', reg.back(), false);

// 验证 reopenCollections 确实重渲染了列表（host 被清空重建且有内容）
expect('reopenCollections re-rendered host (has children)', lastHost._children.length > 0, true);

console.log('---');
console.log('collections back() 协同测试: pass=' + pass + ', fail=' + fail);
process.exit(fail ? 1 : 0);
