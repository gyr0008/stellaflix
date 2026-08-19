#!/usr/bin/env node
// verify-music-globals.mjs
// Step 2.0 构建产物验收闸门：
//   ① 产物不得被 IIFE / 函数包裹（否则顶层全局泄漏被破坏，video/* 与内联处理器全部失效）
//   ② 原始 music.js 的顶层标识符（var/let/const/function/class）必须在产物中全部保留（零重命名、零丢失）
//
// 判定方法（可靠，不依赖解析压缩语法）：
//   从原始文件提取列 0 的顶层声明名集合 A；对每个名（正则转义后）检查其在产物中是否仍以词边界出现。
//   若 esbuild 重命名某顶层名 → 其声明与全部引用同步改名 → 原名在产物中出现 0 次 → 判失败。
//
// 用法： node scripts/verify-music-globals.mjs <原始文件> <构建产物>
//   原始文件用真实文件传入（Windows 下 <(...) 进程替换不被 node fs 支持）
//
// 退出码： 0 = 通过； 1 = 破坏； 2 = 参数错误
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// 抽取原始文件顶层声明标识符（未压缩：顶层声明在列 0）
function extractTopLevelNames(src) {
  const names = new Set();
  for (const line of src.split('\n')) {
    const m = /^(?:var|let|const|function|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

// 保守的 IIFE/函数包裹判定：以 ( 开头且以 )(); 结尾
function isWrapped(src) {
  const t = src.trim();
  return t.startsWith('(') && /\)\s*\(\s*\)\s*;?\s*$/.test(t);
}

// 正则特殊字符转义（顶层名可能含 $ 等）
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const [origPath, builtPath] = process.argv.slice(2);
if (!origPath || !builtPath) {
  console.error('usage: node scripts/verify-music-globals.mjs <原始文件> <构建产物>');
  process.exit(2);
}

const orig = readFileSync(resolve(origPath), 'utf8');
const built = readFileSync(resolve(builtPath), 'utf8');

if (isWrapped(built)) {
  console.error('❌ 构建产物被 IIFE/函数包裹，顶层全局泄漏被破坏（video/* 与内联处理器将失效）');
  process.exit(1);
}

const A = extractTopLevelNames(orig);

const missing = [];
// 标识符边界：前后均非标识符字符（含 $），正确处理 $-前缀名且避免子串误匹配
for (const name of A) {
  const re = new RegExp('(?<![A-Za-z0-9_$])' + escapeRegex(name) + '(?![A-Za-z0-9_$])');
  if (!re.test(built)) missing.push(name);
}

if (missing.length) {
  console.error(`❌ 顶层标识符被重命名或丢失（${missing.length} 个），全局符号面被破坏：`);
  console.error('   ' + missing.slice(0, 50).join(', '));
  process.exit(1);
}

// ---- 扩展闸门（2.3）：143 关键全局必须存在顶层定义 ----
// 单一真相源：从 globals-bridge.js 抽取 KEEP 数组，避免与桥漂移。
const bridgePath = resolve(__dirname, '../src/music/globals-bridge.js');
let keepNames = [];
try {
  const bridgeSrc = readFileSync(bridgePath, 'utf8');
  const km = bridgeSrc.match(/var\s+KEEP\s*=\s*\[([\s\S]*?)\];/);
  if (!km) throw new Error('未在 globals-bridge.js 找到 KEEP 数组');
  keepNames = JSON.parse('[' + km[1] + ']');
} catch (e) {
  console.error('❌ 无法从 globals-bridge.js 抽取 143 关键名列表：' + e.message);
  process.exit(2);
}

// 合并所有经典脚本源：music + index.html 内联 + video/*。
// 143 集混入 video/* 侧符号（如 _sfvTryToggleSearch / toggleSearchPage，定义在 video/*.js）
// 与内联 onclick 方法伪阳性（click/getElementById/remove/stopPropagation/toggle/setSpace，
// 从不作为全局函数存在）。本闸门只校验“确为全局”的名字。
const idxPath = resolve(__dirname, '../public/index.html');
let idx = '';
try { idx = readFileSync(idxPath, 'utf8'); } catch (e) { /* index.html 缺失不致命 */ }

const videoDir = resolve(__dirname, '../public/video');
let combined = orig + '\n' + idx + '\n';
try {
  for (const f of readdirSync(videoDir)) {
    if (f.endsWith('.js')) {
      try { combined += '\n' + readFileSync(resolve(videoDir, f), 'utf8'); } catch (e) { /* 单个文件读取失败不致命 */ }
    }
  }
} catch (e) { /* video 目录缺失不致命 */ }

// 2.4：模块真抽取后，各 src/music/*.js 经典脚本同样贡献全局符号面
// （如 02-equalizer-glue.js 的 toggleEqualizerPanel，已迁出 legacy-music.js）。
// 必须并入 143 网关扫描，否则抽取后闸门会误报“找不到顶层定义”。
const musicSrcDir = resolve(__dirname, '../src/music');
try {
  for (const f of readdirSync(musicSrcDir)) {
    if (f.endsWith('.js')) {
      try { combined += '\n' + readFileSync(resolve(musicSrcDir, f), 'utf8'); } catch (e) { /* 单个文件读取失败不致命 */ }
    }
  }
} catch (e) { /* src/music 目录缺失不致命 */ }

// 文档明确的“方法调用伪阳性”：从不作为全局函数存在，桥接 typeof 守卫自动跳过，本闸门不要求其为全局。
const PSEUDO = new Set(['click', 'getElementById', 'remove', 'stopPropagation', 'toggle', 'setSpace']);

function isDefinedTopLevel(name, src) {
  const esc = escapeRegex(name);
  // 顶层声明：var/let/const/function/class/async function NAME
  if (new RegExp('^(?:var|let|const|function|class|async function)\\s+' + esc + '\\b', 'm').test(src)) return true;
  // 显式 window.NAME = / global.NAME = 赋值（浏览器中 global===window）
  if (new RegExp('(?:^|[^\\w.$])(?:window|global)\\.' + esc + '\\s*=', 'm').test(src)) return true;
  // 顶层隐式全局赋值：NAME =（列 0）
  if (new RegExp('^' + esc + '\\s*=', 'm').test(src)) return true;
  // 对象属性/方法键：NAME:（覆盖对象字面量内的定义）
  if (new RegExp('(?:^|[^\\w.$])' + esc + '\\s*:', 'm').test(src)) return true;
  return false;
}

const undef = [];
const skipped = [];
for (const name of keepNames) {
  if (PSEUDO.has(name)) { skipped.push(name); continue; }
  if (!isDefinedTopLevel(name, combined)) undef.push(name);
}

if (undef.length) {
  console.error(
    `❌ 143 关键全局中有 ${undef.length} 个在 music/index/video 源码找不到顶层定义` +
    `（疑似被误删/改名，video/* 与内联处理器将断链）：`
  );
  console.error('   ' + undef.join(', '));
  process.exit(1);
}

console.log(
  `✅ 顶层标识符零破坏：原始 ${A.size} 个顶层声明，构建产物全部保留（词边界命中），且无 IIFE 包裹`
);
console.log(`   原始集合示例：${[...A].slice(0, 12).join(', ')} …`);
console.log(
  `✅ 143 关键全局校验通过：KEEP=${keepNames.length}，` +
  `跳过方法伪阳性 ${skipped.length}（${skipped.join(',')}），其余均在源码存在顶层定义`
);
process.exit(0);
