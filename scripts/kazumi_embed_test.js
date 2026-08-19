#!/usr/bin/env node
'use strict';
/**
 * Kazumi 播放页解析器 — 解析器 iframe 嵌入检测测试（端到端，真实 resolvePlayUrl）
 *
 * 验证：当播放页 HTML 含「第三方视频解析器」iframe（如 jx.wuzhoupai.com/?url=age_...）
 * 时，resolvePlayUrl 应返回 { embed: true }，交由播放器整页嵌入而非当作直链去拉。
 *
 * 用 vm 沙箱加载真实源码 + 桩 fetch 返回受控 HTML，不 mock resolvePlayUrl 本身。
 *
 * 运行：node scripts/kazumi_embed_test.js
 */
const path = require('path');
const vm = require('vm');
const fs = require('fs');

const PROJ = path.resolve(__dirname, '..');
const files = [
  'public/video/kazumi/rule-schema.js',
  'public/video/kazumi/url-utils.js',
  'public/video/kazumi/http-client.js',
  'public/video/kazumi/xpath-engine.js',
  'public/video/kazumi/rule-engine.js',
  'public/video/kazumi/index.js',
  'public/video/kazumi-bridge.js'
].map(f => path.join(PROJ, f));

// 受控 HTML：测试时通过 setTestHtml() 切换
var testHtml = '';
var mockLocalStorage = {};
var globalObj = {
  localStorage: {
    getItem: function (k) { return (k in mockLocalStorage) ? mockLocalStorage[k] : null; },
    setItem: function (k, v) { mockLocalStorage[k] = String(v); },
    removeItem: function (k) { delete mockLocalStorage[k]; }
  },
  StellaflixVideo: {},
  DOMParser: class DOMParser { parseFromString(str) { return { documentElement: { nodeName: 'html' }, body: { innerHTML: str } }; } },
  document: { evaluate: function () { return null; }, createElement: function () { return {}; } },
  XPathResult: { FIRST_ORDERED_NODE_TYPE: 9, ORDERED_NODE_SNAPSHOT_TYPE: 7, ANY_TYPE: 0 },
  window: {},
  console: console,
  setTimeout: setTimeout,
  // 桩 fetch：resolvePlayUrl 经 KazumiHttpClient → /api/proxy?url=... → 此处返回受控 HTML
  fetch: async function () { return { ok: true, text: async () => testHtml }; }
};
globalObj.window = globalObj;
globalObj.global = globalObj;

var ctx = vm.createContext(globalObj);
files.forEach(function (f) {
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); }
  catch (e) { console.error('加载失败:', f, e.message); process.exit(1); }
});

var SFV = vm.runInContext('window.StellaflixVideo', ctx);
var resolvePlayUrl = SFV.kazumi && SFV.kazumi.resolvePlayUrl;
if (typeof resolvePlayUrl !== 'function') {
  console.error('resolvePlayUrl 未导出！'); process.exit(1);
}

// ---- 测试用例 ----
var AGEDM_HTML = '<!DOCTYPE html><html><head><title>agedm</title></head><body>' +
  '<div id="player">' +
  '<iframe id="iframeForVideo" src="https://jx.wuzhoupai.com:8443/vip/?url=age_6613bB0vHwNIaheZM0BbGVBba9TSMhWCmpxlMj8SwfVGDB5ah9Cp4c7FakZ8cu2IgnjNSOckkec7c7CnQK38yQo10g" allowfullscreen="allowfullscreen"></iframe>' +
  '</div></body></html>';

var YOUTUBE_HTML = '<html><body><iframe src="https://www.youtube.com/embed/abcd1234" allowfullscreen></iframe></body></html>';

var M3U8_HTML = '<html><body><video><source src="https://cdn.example.com/v/index.m3u8" type="application/x-mpegURL"></video></body></html>';

var PLAIN_HTML = '<html><body><h1>404</h1></body></html>';

var cases = [
  {
    name: 'agedm 解析器 iframe → embed:true',
    html: AGEDM_HTML,
    expectEmbed: true,
    expectUrlContains: 'jx.wuzhoupai.com',
    expectUrlContains2: 'url=age_'
  },
  {
    name: '普通视频 iframe（YouTube，非解析器）→ embed:false',
    html: YOUTUBE_HTML,
    expectEmbed: false,
    expectUrlContains: 'youtube.com/embed/abcd1234'
  },
  {
    name: '直链 m3u8 页面 → embed:false（<video><source> 命中 video-src，优先级高于 m3u8-url）',
    html: M3U8_HTML,
    expectEmbed: false,
    expectMethod: 'video-src'
  },
  {
    name: '无匹配纯文本页 → 返回 null',
    html: PLAIN_HTML,
    expectNull: true
  }
];

(async function () {
  var pass = 0, fail = 0;
  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    testHtml = c.html;
    var r = null, err = null;
    try { r = await resolvePlayUrl('https://www.agedm.io/play/20230172/1/1', 'AGE'); }
    catch (e) { err = e; }
    var ok = true, detail = [];
    if (c.expectNull) {
      if (r !== null) { ok = false; detail.push('期望 null，实得 ' + JSON.stringify(r)); }
    } else {
      if (!r) { ok = false; detail.push('返回 null'); }
      else {
        if (!!r.embed !== c.expectEmbed) { ok = false; detail.push('embed=' + r.embed + ' 期望 ' + c.expectEmbed); }
        if (c.expectUrlContains && (!r.url || r.url.indexOf(c.expectUrlContains) < 0)) { ok = false; detail.push('url 不含 ' + c.expectUrlContains + ' → ' + r.url); }
        if (c.expectUrlContains2 && (!r.url || r.url.indexOf(c.expectUrlContains2) < 0)) { ok = false; detail.push('url 不含 ' + c.expectUrlContains2); }
        if (c.expectMethod && r.method !== c.expectMethod) { ok = false; detail.push('method=' + r.method + ' 期望 ' + c.expectMethod); }
      }
    }
    if (err) { ok = false; detail.push('异常: ' + err.message); }
    if (ok) { pass++; console.log('  ✓ ' + c.name); }
    else { fail++; console.log('  ✗ ' + c.name + '  ' + detail.join('; ')); }
  }
  console.log('\n--------------------------------');
  console.log('解析器 iframe 嵌入检测测试: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
