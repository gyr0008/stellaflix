/*
 * Step 4 在线闭环集成测试：vm 沙箱加载真实源码
 *   model.js（四类数据模型）/ source-adapter.js（进度键透传）/ online.js（搜索→详情→剧集→播放）
 *
 * 覆盖：
 *   A. model：历史去重 / 心动·片单·收藏 flag / meta 缓存 / resolveList
 *   B. source-adapter：open({url,title,id}) 时进度键透传为显式 id（站点:vod:集数）
 *   C. online：打开分类（空态/有数据）→ 点卡片进详情 → 点剧集播放，验证
 *        - 经 source-adapter 打开，进度键 = sourceId:vodId:epIndex
 *        - 历史记录写入该进度键
 *
 * 合规断言：online.js / model.js 代码区零硬编码站点地址。
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
function section(t) { console.log('\n[' + t + ']'); }

const ROOT = path.join(__dirname, '..');
const VDIR = path.join(ROOT, 'public', 'video');
const read = f => fs.readFileSync(path.join(VDIR, f), 'utf8');

// ---------------------------------------------------------------- DOM stub
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _class: '',
    _html: '',
    style: {}, attributes: {}, children: [], parentNode: null,
    textContent: '', value: '', src: '', alt: '', placeholder: '', type: '', id: '',
    loading: '',
    _listeners: {},
  };
  Object.defineProperty(el, 'className', {
    get() { return el._class; },
    set(v) { el._class = (v == null ? '' : String(v)); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children = []; },
  });
  const parse = () => el._class.split(/\s+/).filter(Boolean);
  const write = set => { el._class = [...set].join(' '); };
  el.classList = {
    add: c => { const s = new Set(parse()); s.add(c); write(s); },
    remove: c => { const s = new Set(parse()); s.delete(c); write(s); },
    contains: c => parse().includes(c),
    toggle(c, force) {
      const s = new Set(parse());
      const on = force === undefined ? !s.has(c) : !!force;
      if (on) s.add(c); else s.delete(c);
      write(s);
      return on;
    },
  };
  el.appendChild = c => { el.children.push(c); c.parentNode = el; return c; };
  el.removeChild = c => { el.children = el.children.filter(x => x !== c); return c; };
  el.setAttribute = (k, v) => { el.attributes[k] = String(v); };
  el.getAttribute = k => (k in el.attributes ? el.attributes[k] : null);
  el.addEventListener = (t, fn) => { (el._listeners[t] = el._listeners[t] || []).push(fn); };
  el.focus = () => {};
  el.click = () => { (el._listeners.click || []).forEach(fn => fn({ target: el, stopPropagation() {}, preventDefault() {} })); };
  return el;
}

function findEl(root, cls) {
  if (!root || !root.children) return null;
  for (const c of root.children) {
    if ((c._class || '').split(/\s+/).includes(cls)) return c;
    const deep = findEl(c, cls);
    if (deep) return deep;
  }
  return null;
}
function findAll(root, cls, out) {
  out = out || [];
  if (!root || !root.children) return out;
  for (const c of root.children) {
    if ((c._class || '').split(/\s+/).includes(cls)) out.push(c);
    findAll(c, cls, out);
  }
  return out;
}

function makeSandbox() {
  const store = new Map();
  const body = makeEl('body');
  const doc = {
    readyState: 'complete',
    body,
    documentElement: makeEl('html'),
    createElement: t => makeEl(t),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const winListeners = {};
  const sandbox = {
    console: { warn: () => {}, error: () => {}, log: () => {} },
    document: doc,
    URL, Promise, Date, Math, JSON, Object, Array, String, Error, RegExp,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, doc, body, store, winListeners };
}

const tick = () => new Promise(r => setTimeout(r, 0));

// ================================================================ A. model
section('A. model 四类数据模型');
{
  const { sandbox } = makeSandbox();
  vm.runInContext(read('model.js'), sandbox, { filename: 'model.js' });
  const M = sandbox.StellaflixVideo.model;

  M.setMeta({ key: 's1:7', title: '片A', pic: 'p.jpg', year: '2024', sourceId: 's1', vodId: '7' });
  assert(M.getMeta('s1:7').title === '片A', 'setMeta 写入元数据');

  M.addHistory({ key: 's1:7', title: '片A' });
  M.addHistory({ key: 's1:7', title: '片A' }); // 同 key 去重
  assert(M.getHistory().length === 1, '历史按 key 去重');
  M.addHistory({ key: 's2:9', title: '片B' }); // 后加入的应排在最前（最新在前）
  const h2 = M.getHistory();
  assert(h2.length === 2 && h2[0].key === 's2:9', '最新加入的排在最前');

  M.setFlag('s1:7', 'liked', true);
  assert(M.getFlag('s1:7').liked === true, '心动标记置位');
  assert(M.getKeysByFlag('liked').indexOf('s1:7') >= 0, 'getKeysByFlag 返回心动 key');
  M.setFlag('s1:7', 'faved', true);
  assert(M.getKeysByFlag('faved').length === 1, '收藏标记独立');

  const t = M.toggleFlag('s1:7', 'liked');
  assert(t.liked === false, 'toggleFlag 取反');
  assert(M.getKeysByFlag('liked').length === 0, '取消心动后 key 移除');

  const list = M.resolveList(['s1:7']);
  assert(list.length === 1 && list[0].title === '片A', 'resolveList 经 meta 还原列表项');

  // 全为假时删键，避免脏数据
  M.setFlag('s1:7', 'faved', false);
  assert(M.getKeysByFlag('faved').length === 0, '全假标记被清理');
}

// ================================================================ B. 进度键透传
section('B. source-adapter 进度键透传（直链路径）');
{
  const { sandbox } = makeSandbox();
  vm.runInContext(read('model.js'), sandbox, { filename: 'model.js' });
  vm.runInContext(read('source-adapter.js'), sandbox, { filename: 'source-adapter.js' });
  const SFV = sandbox.StellaflixVideo;
  const opened = [];
  // 用假 player 捕获 openUrl 的 opts.id（直链/原生可播路径）
  SFV.player = {
    openUrl: (url, opts) => { opened.push({ url, opts }); return true; },
    openFile: () => true,
  };
  const r = SFV.source.open({ url: 'https://v.test/2.mp4', title: '片A·第1集', id: 's1:7:0' });
  assert(r === true, '直链 open 返回成功');
  assert(opened.length === 1, '已交付 player.openUrl');
  assert(opened[0].opts.id === 's1:7:0', '进度键透传为显式 id（站点:vod:集数）');
  assert(opened[0].opts.title === '片A·第1集', '标题透传');

  // 无显式 id 时回落 url: 原始地址
  opened.length = 0;
  SFV.source.open('https://v.test/3.mp4');
  assert(opened[0].opts.id === 'url:https://v.test/3.mp4', '无 id 时回落 url:原始地址');
}

// ================================================================ C. online 闭环
(async function onlineTests() {
  section('C. online 搜索→详情→剧集→播放');
  const { sandbox, doc, body } = makeSandbox();
  const SFV = sandbox.StellaflixVideo = sandbox.StellaflixVideo || {};
  vm.runInContext(read('model.js'), sandbox, { filename: 'model.js' });
  vm.runInContext(read('source-adapter.js'), sandbox, { filename: 'source-adapter.js' });

  const SRC = { id: 's1', name: '甲源', api: 'https://a.test/api', enabled: true };
  const opened = [];
  SFV.player = {
    openUrl: (url, opts) => { opened.push({ url, opts }); return true; },
    openFile: () => true,
    openFilePicker: () => { SFV._localPicker = true; },
    setSpace: () => {},
  };
  SFV.state = { isVideo: () => true, setSpace: () => {}, EVENT: 'spacechange' };
  // 用 stub sources 提供搜索/详情数据（真实 sources.js 的 fetch 网络部分不在沙箱内测）
  SFV.sources = {
    getSources: () => [SRC],
    getEnabledSources: () => [SRC],
    search: (kw) => Promise.resolve({
      items: [{
        title: '片A', year: '2024', pic: '',
        variants: [{ sourceId: 's1', sourceName: '甲源', vodId: '7', key: 's1:7' }],
      }], errors: [],
    }),
    detail: (s, vodId) => Promise.resolve({
      ok: true, vod: { vod_name: '片A' },
      plays: [{ from: '线路A', episodes: [{ name: '第1集', url: 'https://v.test/1.mp4', index: 0 }] }],
    }),
  };

  vm.runInContext(read('online.js'), sandbox, { filename: 'online.js' });
  const ON = SFV.online;

  // 空态：心动分类无数据 → 显示空提示
  ON.openCategory('liked');
  assert(ON.isOpen(), '浏览层已打开');
  const note1 = doc.body.children[doc.body.children.length - 1]; // 最后一个 append 的是 overlay
  const overlay = findEl(body, 'sfv-browse');
  assert(!!overlay, 'overlay 已创建');
  assert(overlay.classList.contains('sfv-show'), 'overlay 带 sfv-show');
  let noteEl = findEl(overlay, 'sfv-browse-note');
  assert(/心动/.test(noteEl.textContent), '空态显示心动空提示');

  // 写入数据后再开
  SFV.model.setMeta({ key: 's1:7', title: '片A', pic: '', year: '2024', sourceId: 's1', vodId: '7' });
  SFV.model.setFlag('s1:7', 'liked', true);
  ON.openCategory('liked');
  await tick();
  const bodyEl = findEl(overlay, 'sfv-browse-body');
  const cards = findAll(bodyEl, 'sfv-card');
  assert(cards.length === 1, '心动列表渲染出 1 张卡片');
  const card = cards[0];
  card.click(); // → openDetailFromMeta → detail 异步
  await tick(); await tick();
  const eps = findAll(bodyEl, 'sfv-ep');
  assert(eps.length === 1, '详情页渲染出 1 个剧集按钮');
  eps[0].click(); // → playEpisode
  assert(opened.length === 1, '点剧集触发播放');
  assert(opened[0].opts.id === 's1:7:0', '剧集进度键 = 站点:vod:集数');
  const hist = SFV.model.getHistory();
  assert(hist.some(h => h.key === 's1:7:0'), '历史记录写入该进度键');

  // 详情页心动按钮实时反映标记
  ON.openCategory('liked');
  await tick();
  const bodyEl2 = findEl(overlay, 'sfv-browse-body');
  findAll(bodyEl2, 'sfv-card')[0].click();
  await tick(); await tick();
  const flagBtn = findEl(overlay, 'sfv-flag-btn');
  assert(flagBtn.classList.contains('on'), '详情页心动按钮反映已标记');

  // 搜索流程
  opened.length = 0;
  SFV.model.clearHistory();
  ON.openSearch();
  await tick();
  const srchInput = findEl(overlay, 'sfv-browse-search-input');
  const srchBtn = findEl(overlay, 'sfv-browse-search-btn');
  srchInput.value = '测试';
  srchBtn.click();
  await tick(); await tick();
  const searchCards = findAll(findEl(overlay, 'sfv-browse-body'), 'sfv-card');
  assert(searchCards.length === 1, '搜索结果渲染出卡片');
  searchCards[0].click();
  await tick(); await tick();
  const eps2 = findAll(findEl(overlay, 'sfv-browse-body'), 'sfv-ep');
  assert(eps2.length === 1, '搜索结果进入详情并解析剧集');

  runStaticTests();
})();

// ================================================================ 合规断言
function runStaticTests() {
  section('E. 合规红线');
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const code = strip(read('online.js')) + '\n' + strip(read('model.js'));
  const urls = (code.match(/https?:\/\/[^\s'"`)]+/g) || [])
    .filter(u => !/\.\.\./.test(u) && !/^https?:\/\/(example|test|localhost|127\.0\.0\.1)\b/i.test(u));
  assert(urls.length === 0, 'online/model 代码区零硬编码站点地址（发现 ' + urls.length + ' 处）');
  assert(!/api_site\s*[:=]/.test(code), '不存在 api_site 预置配置项');
  assert(/不存储/.test(read('online.js')), 'online.js 含「不存储」声明');

  console.log('\n========================================');
  console.log('  Step 4 在线闭环测试： ' + pass + ' pass / ' + fail + ' fail');
  console.log('========================================');
  process.exit(fail ? 1 : 0);
}
