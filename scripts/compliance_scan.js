/*
 * 合规扫描（发布红线 §0.3：出厂不预置任何影视源）
 *
 * 扫描范围：public/video/ 下全部 .js（含 kazumi/ 子目录）+ desktop/userdata-migrate.js
 * 判定规则：
 *   1) 不得出现 api_site 键名 / 赋值定义；
 *   2) 不得出现硬编码 http(s) 地址。
 * 允许的例外：
 *   A. 元数据/API/海报服务端点（明确列举，非影视源）：TMDB / Bangumi / 弹幕 / 图床。
 *      这些是公共元数据与媒体信息服务，与「出厂零预置视频源」红线无冲突，直接放行；
 *      列举式白名单，新增服务须显式追加，保证可审计。
 *   B. 形状示例 / 保留域名：https://...、example.*、localhost/127.0.0.1，
 *      且须在 UI 占位提示上下文（placeholder）或本机服务上下文。
 * 注释中的 URL 一律忽略（文档说明不是内置源）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS: ' + msg); }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.js$/.test(e.name)) TARGETS.push(p);
  }
})(path.join(ROOT, 'public', 'video'));
TARGETS.push(path.join(ROOT, 'desktop', 'userdata-migrate.js'));

function stripComments(c) {
  return c
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const HOST_WHITELIST = /^(?:\.\.\.|example\.(?:com|org|net)|localhost|127\.0\.0\.1)(?::\d+)?$/i;
// 元数据/API/海报服务端点（明确列举，非影视源）：与「出厂零预置视频源」红线无冲突。
// 列举式白名单——新增公共服务须显式追加于此，保证可审计、避免被误判为内置片源。
const METADATA_API_HOSTS = /^(?:api\.tmdb\.org|image\.tmdb\.org|api\.bgm\.tv|wsrv\.nl|api\.dandanplay\.net)$/i;
// UI 占位提示上下文：placeholder 属性 / placeholder 赋值 / 输入框提示文案
const PLACEHOLDER_CTX = /placeholder/i;

console.log('[合规扫描] 目标文件 ' + TARGETS.length + ' 个');

const violations = [];
const allowed = [];
for (const file of TARGETS) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const raw = fs.readFileSync(file, 'utf8');
  const code = stripComments(raw);

  if (/['"]api_?site['"]/i.test(code) || /\bapi_?site\s*[:=]/i.test(code)) {
    violations.push(rel + ': 出现 api_site 键名/赋值定义');
  }

  const lines = code.split('\n');
  lines.forEach((line, i) => {
    const found = line.match(/https?:\/\/[^\s'"`)]*/g);
    if (!found) return;
    for (const url of found) {
      const hm = /^https?:\/\/([^/?#]*)/i.exec(url);
      const host = hm ? hm[1] : '';
      const whitelisted = HOST_WHITELIST.test(host);
      const isMetadata = METADATA_API_HOSTS.test(host);
      const isPlaceholder = PLACEHOLDER_CTX.test(line);
      if (isMetadata) {
        // 公共元数据/API/海报服务端点（TMDB / Bangumi / 弹幕 / 图床），非影视源，
        // 与「出厂零预置视频源」红线无冲突，放行。
        allowed.push(rel + ':' + (i + 1) + ' ' + url + '（元数据/API 服务端点·非影视源）');
      } else if (whitelisted && isPlaceholder) {
        allowed.push(rel + ':' + (i + 1) + ' ' + url + '（UI 占位提示）');
      } else if (whitelisted && /^(?:localhost|127\.0\.0\.1)/i.test(host)) {
        allowed.push(rel + ':' + (i + 1) + ' ' + url + '（本机服务）');
      } else {
        violations.push(rel + ':' + (i + 1) + ' 硬编码地址 ' + url);
      }
    }
  });
}

if (allowed.length) {
  console.log('\n  白名单放行（非内置片源）：');
  allowed.forEach(a => console.log('    · ' + a));
}

console.log('');
assert(violations.length === 0,
  '零硬编码片源地址 / 零 api_site 定义' + (violations.length ? '\n    ' + violations.join('\n    ') : ''));

// 出厂源列表必须为空
const srcFile = path.join(ROOT, 'public', 'video', 'sources.js');
if (fs.existsSync(srcFile)) {
  const s = stripComments(fs.readFileSync(srcFile, 'utf8'));
  const defaults = s.match(/(?:DEFAULT_SOURCES|BUILTIN_SOURCES|PRESET_SOURCES)\s*=\s*\[([^\]]*)\]/);
  assert(!defaults || !defaults[1].trim(), 'sources.js 无非空的出厂预置源常量' + (defaults ? '（实得: ' + defaults[1].trim() + '）' : ''));
  // getSources 必须从存储读取、且默认回退为空数组（不预置任何站点）
  const getSrc = /function\s+getSources\s*\(\s*\)\s*\{([\s\S]*?)\n  \}/.exec(s);
  assert(!!getSrc && /readJSON\([A-Z_]+,\s*\[\]\)/.test(getSrc[1]),
    'getSources() 从本地存储读取且默认空数组（出厂零预置源）');
}

console.log('\n========================================');
console.log('  合规扫描: ' + pass + ' pass / ' + fail + ' fail');
console.log('========================================');
if (fail) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
