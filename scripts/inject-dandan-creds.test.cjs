'use strict';
/*
 * 注入脚本单测：覆盖「无 env 跳过 / 有 env 替换 / 非占位符不误改 / 特殊字符转义」。
 * 直接对真实 client.js 源码运行 injectIntoSource（纯函数、零文件副作用）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { injectIntoSource } = require('./inject-dandan-creds.cjs');

const CLIENT = path.join(__dirname, '..', 'public', 'video', 'danmaku', 'client.js');
const SOURCE = fs.readFileSync(CLIENT, 'utf8');

test('无凭证传入时源码完全不变（零污染）', () => {
  const { out, replaced } = injectIntoSource(SOURCE, undefined, undefined);
  assert.equal(out, SOURCE);
  assert.deepEqual(replaced, { appId: false, appSecret: false });
});

test('传入凭证时 DEFAULT 占位符被替换', () => {
  const { out, replaced } = injectIntoSource(SOURCE, 'APPID123', 'SECRET456');
  assert.equal(replaced.appId, true);
  assert.equal(replaced.appSecret, true);
  assert.match(out, /var DEFAULT_APP_ID = "APPID123";/);
  assert.match(out, /var DEFAULT_APP_SECRET = "SECRET456";/);
  assert.doesNotMatch(out, /var DEFAULT_APP_ID = '';/);
  assert.doesNotMatch(out, /var DEFAULT_APP_SECRET = '';/);
});

test('仅传入 appId 时 appSecret 占位符保留', () => {
  const { out, replaced } = injectIntoSource(SOURCE, 'APPID123', undefined);
  assert.equal(replaced.appId, true);
  assert.equal(replaced.appSecret, false);
  assert.match(out, /var DEFAULT_APP_ID = "APPID123";/);
  assert.match(out, /var DEFAULT_APP_SECRET = '';/);
});

test('非占位符的空字符串不被误改（如 proxyBase）', () => {
  const { out } = injectIntoSource(SOURCE, 'APPID123', 'SECRET456');
  // proxyBase: '' 不在 DEFAULT_* 行，应保持原样
  assert.match(out, /proxyBase: ''/);
  // 业务逻辑文本完整保留
  assert.match(out, /function makeAuthHeaders/);
  assert.match(out, /X-Signature = base64/);
});

test('凭证含特殊字符时 JSON 转义安全', () => {
  const tricky = 'id"with\'quote\\and\nnewline';
  const { out } = injectIntoSource(SOURCE, tricky, 'x');
  const m = out.match(/var DEFAULT_APP_ID = (.*);/);
  assert.ok(m, '应存在 DEFAULT_APP_ID 赋值行');
  const parsed = eval(m[1]); // 仅测试内验证转义合法性
  assert.equal(parsed, tricky);
});
