/*
 * 多源面板 B1/B2 对齐 Kazumi 专项测试
 *   B1：验证码信号 → captcha 蓝点（detail-source 点亮）+ 验证码 webview 弹窗构造
 *   B2：none/error/captcha 三态错误部件（文案+按钮，对齐 source_sheet.dart:314-356）
 *       + 重试/别名/手动检索接线
 * 用 vm 沙箱加载真实实现；DOM 用支持事件监听/click 的最小 mock。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const VIDEO = path.join(ROOT, 'public/video');

// ---------- 最小 DOM mock（支持 class 选择 / 事件 / click）----------
function matchSel(node, sel) {
  sel = (sel || '').trim();
  if (!sel) return false;
  if (sel[0] === '.') return node._classes().indexOf(sel.slice(1)) >= 0;
  if (sel[0] === '[') {
    const m = sel.match(/^\[([^=]+)=(?:"([^"]*)"|'([^']*)')\]$/);
    if (m) return node.getAttribute(m[1]) === (m[2] !== undefined ? m[2] : m[3]);
    const m2 = sel.match(/^\[([^\]]+)\]$/);
    if (m2) return node.getAttribute(m2[1]) != null;
    return false;
  }
  return !!node.tagName && node.tagName.toLowerCase() === sel.toLowerCase();
}
function qFirst(root, sel) {
  for (const c of (root.children || [])) {
    if (matchSel(c, sel)) return c;
    const r = qFirst(c, sel);
    if (r) return r;
  }
  return null;
}
function qAll(root, sel) {
  const out = [];
  const walk = (n) => (n.children || []).forEach((c) => { if (matchSel(c, sel)) out.push(c); walk(c); });
  walk(root);
  return out;
}
function makeEl(tag) {
  const el = {
    tagName: tag, className: '', textContent: '', type: '', value: '', src: '', children: [], style: {},
    attrs: {}, parentNode: null, _listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    dispatch(t, ev) { (this._listeners[t] || []).forEach((fn) => fn(ev || {})); },
    click() { this.dispatch('click', {}); },
    _classes() { return (this.className || '').split(/\s+/).filter(Boolean); },
    querySelector(sel) { return qFirst(this, sel); },
    querySelectorAll(sel) { return qAll(this, sel); }
  };
  el.classList = {
    add(c) { const s = new Set(el._classes()); s.add(c); el.className = Array.from(s).join(' '); },
    remove(c) { const s = new Set(el._classes()); s.delete(c); el.className = Array.from(s).join(' '); },
    toggle(c, on) { const s = new Set(el._classes()); if (on === undefined) on = !s.has(c); if (on) s.add(c); else s.delete(c); el.className = Array.from(s).join(' '); return on; },
    contains(c) { return el._classes().indexOf(c) >= 0; }
  };
  return el;
}
function makeDoc() {
  const body = makeEl('body');
  const doc = {
    body, documentElement: makeEl('html'),
    getElementById: () => null,
    createElement: (t) => makeEl(t)
  };
  return doc;
}
function loadInto(ctx, rel) {
  vm.runInContext(fs.readFileSync(path.join(VIDEO, rel), 'utf8'), ctx);
}
function newCtx(doc) {
  const ctx = { console, document: doc, requestAnimationFrame: (f) => f(), setTimeout, clearTimeout, setInterval, clearInterval, Promise };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  return ctx;
}
function tick() { return new Promise((r) => setTimeout(r, 0)); }

// ============================================================
// B1：验证码信号 → captcha 蓝点（detail-source 点亮）
// ============================================================
test('B1 detail-source：CaptchaRequiredException → 点亮 captcha 态（非 error）', async () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'detail-core.js');         // 注入 SFV.detail
  loadInto(ctx, 'detail-source.js');

  const setStatusCalls = [];
  ctx.StellaflixVideo.sourcePicker = {
    open() {}, close() {},
    setStatus(k, s) { setStatusCalls.push([k, s]); },
    appendSource() {}, setSourceWaiting() {}
  };
  // 桥接层：单 Kazumi 规则，searchRule 返回 captcha 信号（对齐 T1 透传）
  ctx.StellaflixVideo.kazumi = {
    getEnabledSearchRules: () => [{ name: 'r', kind: 'kazumi', key: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }],
    searchRule: () => Promise.resolve({ items: [], errors: [{ ruleName: 'r', reason: 'captcha', code: 'CaptchaRequiredException', captcha: true }] })
  };
  ctx.StellaflixVideo.sources = { getEnabledSources: () => [] };
  ctx.StellaflixVideo.online = { playEpisode() {} };
  const detailSource = ctx.StellaflixVideo.detailSource;

  detailSource.searchAndPick({ title: '测试片' }, null);
  await tick();

  assert.ok(setStatusCalls.some((c) => c[0] === 'kazumi:r' && c[1] === 'captcha'),
    'captcha 信号应点亮 captcha 态，实际: ' + JSON.stringify(setStatusCalls));
  assert.ok(!setStatusCalls.some((c) => c[0] === 'kazumi:r' && c[1] === 'error'),
    'captcha 不应误点 error 态');
});

test('B1 detail-source：普通错误 → 点亮 error 态（不误点 captcha）', async () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'detail-core.js');
  loadInto(ctx, 'detail-source.js');

  const setStatusCalls = [];
  ctx.StellaflixVideo.sourcePicker = {
    open() {}, close() {}, setStatus(k, s) { setStatusCalls.push([k, s]); },
    appendSource() {}, setSourceWaiting() {}
  };
  ctx.StellaflixVideo.kazumi = {
    getEnabledSearchRules: () => [{ name: 'r', kind: 'kazumi', key: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }],
    searchRule: () => Promise.resolve({ items: [], errors: [{ ruleName: 'r', reason: 'net-timeout' }] })
  };
  ctx.StellaflixVideo.sources = { getEnabledSources: () => [] };
  ctx.StellaflixVideo.online = { playEpisode() {} };

  ctx.StellaflixVideo.detailSource.searchAndPick({ title: '测试片' }, null);
  await tick();

  assert.ok(setStatusCalls.some((c) => c[0] === 'kazumi:r' && c[1] === 'error'),
    '普通错误应点亮 error 态');
  assert.ok(!setStatusCalls.some((c) => c[0] === 'kazumi:r' && c[1] === 'captcha'),
    '普通错误不应误点 captcha');
});

test('B1 detail-source：retrySource 复用 sourceKey 重查单源', async () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'detail-core.js');
  loadInto(ctx, 'detail-source.js');

  let searchCalls = 0;
  ctx.StellaflixVideo.sourcePicker = { open() {}, close() {}, setStatus() {}, appendSource() {}, setSourceWaiting() {} };
  ctx.StellaflixVideo.kazumi = {
    getEnabledSearchRules: () => [{ name: 'r', kind: 'kazumi', key: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }],
    searchRule: () => { searchCalls++; return Promise.resolve({ items: [], errors: [] }); }
  };
  ctx.StellaflixVideo.sources = { getEnabledSources: () => [] };
  ctx.StellaflixVideo.online = { playEpisode() {} };

  ctx.StellaflixVideo.detailSource.searchAndPick({ title: '测试片' }, null);
  await tick();
  const before = searchCalls;
  ctx.StellaflixVideo.detailSource.retrySource('kazumi:r');
  await tick();
  assert.equal(searchCalls, before + 1, 'retrySource 应触发一次单源重查');
});

// ============================================================
// B2：none/error/captcha 三态错误部件 + 按钮接线
// ============================================================
test('B2 source-picker：none 态错误部件（无结果 + 别名检索/手动检索）', () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'source-picker.js');
  const SP = ctx.StellaflixVideo.sourcePicker;
  SP.open({ title: '片', candidates: [], groups: [{ sourceKey: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }] });

  SP.setStatus('kazumi:r', 'none');
  const sec = ctx.StellaflixVideo.sourcePicker; // not used
  const section = doc.body.querySelector('.sfv-picker-source');
  const err = section.querySelector('.sfv-picker-error');
  assert.ok(err, 'none 态应渲染错误部件');
  assert.ok(/无结果/.test(err.querySelector('.sfv-picker-error-msg').textContent), '文案应含「无结果」');
  const labels = err.querySelectorAll('.sfv-picker-ebtn').map((b) => b.textContent);
  assert.ok(labels.indexOf('别名检索') >= 0 && labels.indexOf('手动检索') >= 0, '应含 别名检索/手动检索 按钮');
  SP.close();
});

test('B2 source-picker：error 态错误部件（检索失败 + 重试 → retrySource）', () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'source-picker.js');
  const SP = ctx.StellaflixVideo.sourcePicker;
  let retryArg = null;
  ctx.StellaflixVideo.detailSource = { retrySource: (k) => { retryArg = k; } };
  SP.open({ title: '片', candidates: [], groups: [{ sourceKey: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }] });

  SP.setStatus('kazumi:r', 'error');
  const section = doc.body.querySelector('.sfv-picker-source');
  const err = section.querySelector('.sfv-picker-error');
  assert.ok(/检索失败/.test(err.querySelector('.sfv-picker-error-msg').textContent), '文案应含「检索失败」');
  const retryBtn = err.querySelectorAll('.sfv-picker-ebtn').filter((b) => b.textContent === '重试')[0];
  assert.ok(retryBtn, 'error 态应有 重试 按钮');
  retryBtn.click();
  assert.equal(retryArg, 'kazumi:r', '点 重试 应调用 retrySource(kazumi:r)');
  SP.close();
});

test('B2 source-picker：captcha 态错误部件（需要验证码 + 进行验证 → 验证码弹窗）', () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'source-picker.js');
  const SP = ctx.StellaflixVideo.sourcePicker;
  let capArgs = null;
  ctx.StellaflixVideo.sourcePickerCaptcha = { showCaptchaDialog: (k, rn, n) => { capArgs = [k, rn, n]; } };
  SP.open({ title: '片', candidates: [], groups: [{ sourceKey: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }] });

  SP.setStatus('kazumi:r', 'captcha');
  const section = doc.body.querySelector('.sfv-picker-source');
  const err = section.querySelector('.sfv-picker-error');
  assert.ok(/需要验证码验证/.test(err.querySelector('.sfv-picker-error-msg').textContent), '文案应含「需要验证码验证」');
  const verifyBtn = err.querySelectorAll('.sfv-picker-ebtn').filter((b) => b.textContent === '进行验证')[0];
  assert.ok(verifyBtn, 'captcha 态应有 进行验证 按钮');
  verifyBtn.click();
  assert.ok(capArgs && capArgs[0] === 'kazumi:r' && capArgs[1] === 'r', '点 进行验证 应打开验证码弹窗(kazumi:r, r)');
  SP.close();
});

test('B2 source-picker：ok 态清除残留错误部件', () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'source-picker.js');
  const SP = ctx.StellaflixVideo.sourcePicker;
  SP.open({ title: '片', candidates: [], groups: [{ sourceKey: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }] });
  SP.setStatus('kazumi:r', 'error');
  let section = doc.body.querySelector('.sfv-picker-source');
  assert.ok(section.querySelector('.sfv-picker-error'), 'error 后应有错误部件');
  SP.setStatus('kazumi:r', 'ok');
  section = doc.body.querySelector('.sfv-picker-source');
  assert.ok(!section.querySelector('.sfv-picker-error'), 'ok 后应清除错误部件');
  SP.close();
});

test('B2 source-picker：别名检索空列表 → toast 提示（对齐 Kazumi showAliasSearchDialog）', () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'source-picker.js');
  const SP = ctx.StellaflixVideo.sourcePicker;
  SP.open({ title: '片', candidates: [], groups: [{ sourceKey: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }] });
  SP.showAliasDialog('kazumi:r', 'R');
  const toast = doc.body.querySelector('.sfv-picker-toast');
  assert.ok(toast, '空别名应弹 toast');
  assert.ok(/无可用别名/.test(toast.textContent), 'toast 文案应为「无可用别名，试试手动检索」');
  SP.close();
});

test('B2 source-picker：手动检索提交 → searchSourceWithKeyword', () => {
  const doc = makeDoc();
  const ctx = newCtx(doc);
  loadInto(ctx, 'source-picker.js');
  const SP = ctx.StellaflixVideo.sourcePicker;
  let kwArg = null;
  ctx.StellaflixVideo.detailSource = { searchSourceWithKeyword: (k, kw) => { kwArg = [k, kw]; } };
  SP.open({ title: '片', candidates: [], groups: [{ sourceKey: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }] });
  SP.showManualDialog('kazumi:r', 'R');
  const modal = doc.body.querySelector('.sfv-picker-modal');
  assert.ok(modal, '手动检索应开模态');
  const input = modal.querySelector('.sfv-picker-input');
  input.value = '别名A';
  const confirmBtn = modal.querySelectorAll('.sfv-picker-ebtn').filter((b) => b.textContent === '确认')[0];
  confirmBtn.click();
  assert.ok(kwArg && kwArg[0] === 'kazumi:r' && kwArg[1] === '别名A', '确认应调用 searchSourceWithKeyword(kazumi:r, 别名A)');
  SP.close();
});

// ============================================================
// B1：验证码 webview 弹窗构造（URL + 验证→重查接线）
// ============================================================
test('B1 source-picker-captcha：searchURL 构造 + 验证→重查接线', () => {
  const doc = makeDoc();
  // 拦截 webview 创建
  let webviewEl = null;
  doc.createElement = (t) => {
    const el = makeEl(t);
    if (t === 'webview') { webviewEl = el; el.executeJavaScript = () => Promise.resolve(true); }
    return el;
  };
  const ctx = newCtx(doc);
  loadInto(ctx, 'source-picker.js');           // 提供 SFV.sourcePicker._test.getTitle
  loadInto(ctx, 'source-picker-captcha.js');
  const SPC = ctx.StellaflixVideo.sourcePickerCaptcha;

  // 取标题
  ctx.StellaflixVideo.sourcePicker.open({ title: '测试片', candidates: [], groups: [{ sourceKey: 'kazumi:r', sourceName: 'R', ref: { name: 'r' } }] });

  // 规则对象（含 searchURL）
  ctx.StellaflixVideo.kazumi = {
    getManager: () => ({ get: () => ({ searchURL: '/s?wd=@keyword', antiCrawlerConfig: { enabled: true } }) })
  };
  let retryArg = null;
  ctx.StellaflixVideo.detailSource = { retrySource: (k) => { retryArg = k; } };

  assert.equal(SPC._test.buildSearchUrl({ searchURL: '/s?wd=@keyword' }, '测试片'), '/s?wd=%E6%B5%8B%E8%AF%95%E7%89%87', 'searchURL @keyword 应编码替换');

  const ctrl = SPC.showCaptchaDialog('kazumi:r', 'r', 'R');
  assert.ok(ctrl && typeof ctrl.verify === 'function', 'showCaptchaDialog 应返回 {verify}');
  assert.ok(webviewEl && webviewEl.src === '/s?wd=%E6%B5%8B%E8%AF%95%E7%89%87', 'webview 应加载编码后的搜索页 URL');
  ctrl.verify();
  assert.equal(retryArg, 'kazumi:r', 'verify() 应触发 retrySource(kazumi:r)');
  ctx.StellaflixVideo.sourcePicker.close();
});
