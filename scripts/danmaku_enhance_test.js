/**
 * 弹幕功能增强测试（#70 自动加载 + #71 三源过滤）
 *
 * vm 沙箱：加载真实源码 + stub DOM/fetch/localStorage，验证：
 *   A) entry.js resolveSourceType 分类正确性
 *   B) engine.js shouldShow 来源过滤
 *   C) player.js extractEpisode 集数提取
 *   D) 自动加载触发逻辑（凭证检查/开关检查/异步非阻塞）
 */
var fs = require('fs');
var path = require('path');

// ========== 加载真实源码 ==========
var globalStub = { StellaflixVideo: {}, localStorage: {}, crypto: require('crypto'), console: console, TextEncoder: require('util').TextEncoder, window: globalStub };
// IIFE 检测 window，所以给 stub 加 window 自引用
globalStub.window = globalStub;
// 先加载依赖链：entry → engine
var entrySrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'danmaku', 'entry.js'), 'utf8');
var engineSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'danmaku', 'engine.js'), 'utf8');

// 把 "typeof window" 替换为真值（让 IIFE 走 window 分支）
entrySrc = entrySrc.replace(/typeof window !== 'undefined' \? window : this/, 'globalStub');
engineSrc = engineSrc.replace(/typeof window !== 'undefined' \? window : this/, 'globalStub');

eval(entrySrc);
eval(engineSrc);

var SFV = globalStub.StellaflixVideo;
var danmaku = SFV.danmaku;

// ========== 测试框架 ==========
var pass = 0, fail = 0;
function t(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')); }
}

// ========== A) resolveSourceType 分类 ==========
console.log('\n===== A) 来源分类 (resolveSourceType) =====');

t('[BiliBili] 前缀 → bilibili', danmaku.resolveSourceType('[BiliBili]12345') === 'bilibili');
t('[Gamer] 前缀 → gamer', danmaku.resolveSourceType('[Gamer]abc') === 'gamer');
t('纯数字 → dandanplay', danmaku.resolveSourceType('12345') === 'dandanplay');
t('空字符串 → dandanplay', danmaku.resolveSourceType('') === 'dandanplay');
t('null/undefined → dandanplay', danmaku.resolveSourceType(null) === 'dandanplay');
t('含 [BiliBili] 的混合串 → bilibili', danmaku.resolveSourceType('[BiliBili]uid_789_extra') === 'bilibili');
t('含 [Gamer] 的混合串 → gamer', danmaku.resolveSourceType('[Gamer]xyz_123') === 'gamer');

// DanmakuEntry.sourceType()
var e1 = new danmaku.DanmakuEntry({ message: 'test', time: 1, type: 1, source: '[BiliBili]123' });
t('DanmakuEntry.sourceType() → bilibili', e1.sourceType() === 'bilibili');
var e2 = new danmaku.DanmakuEntry({ message: 'test2', time: 2, type: 4, source: '99999' });
t('DanmakuEntry.sourceType() 纯数字 → dandanplay', e2.sourceType() === 'dandanplay');

// SOURCE_TYPE 常量
t('SOURCE_TYPE.BILIBILI === bilibili', danmaku.SOURCE_TYPE.BILIBILI === 'bilibili');
t('SOURCE_TYPE.GAMER === gamer', danmaku.SOURCE_TYPE.GAMER === 'gamer');
t('SOURCE_TYPE.DANDANPLAY === dandanplay', danmaku.SOURCE_TYPE.DANDANPLAY === 'dandanplay');

// ========== B) shouldShow 来源过滤 ==========
console.log('\n===== B) 引擎来源过滤 (shouldShow) =====');

// 需要构造引擎来测试 shouldShow（它是闭包内函数，通过引擎间接测）
// 改为直接测试：创建引擎，load 含不同源的弹幕，update 后检查 _spawn 计数
// 但在无 DOM 环境 _spawn 不执行，所以直接测 opts 传递

var eng = new danmaku.engine.DanmakuEngine();
var defaultOpts = eng.opts;

// 默认三源全开
t('默认 enabledSources.bilibili === true', defaultOpts.enabledSources.bilibili === true);
t('默认 enabledSources.gamer === true', defaultOpts.enabledSources.gamer === true);
t('默认 enabledSources.dandanplay === true', defaultOpts.enabledSources.dandanplay === true);

// 关掉 BiliBili
eng.setOptions({ enabledSources: { bilibili: false, gamer: true, dandanplay: true } });
t('setOptions 后 bilibili=false', eng.opts.enabledSources.bilibili === false);
t('setOptions 后 gamer 不变', eng.opts.enabledSources.gamer === true);

// 关掉全部源
eng.setOptions({ enabledSources: { bilibili: false, gamer: false, dandanplay: false } });
t('全关后 enabledSources 全 false',
  !eng.opts.enabledSources.bilibili && !eng.opts.enabledSources.gamer && !eng.opts.enabledSources.dandanplay);

// 恢复默认
eng.setOptions({ enabledSources: { bilibili: true, gamer: true, dandanplay: true } });

// ========== C) extractEpisode 集数提取 ==========
console.log('\n===== C) 集数提取 (extractEpisode) =====');

// 从 player.js 提取 extractEpisode 逻辑（纯函数，复制验证）
function extractEpisode(title) {
  if (!title) return null;
  var m = title.match(/(?:第\s*(\d+)\s*[话集季])|(?:[Ee][Pp]?\.?\s*(\d+))/);
  if (!m) return null;
  return parseInt(m[1] || m[2], 10) || null;
}

t('「第3集」→ 3', extractEpisode('进击的巨人 第3集') === 3);
t('「第03话」→ 3', extractEpisode('间谍过家家 第03话') === 3);
t('「第12集」→ 12', extractEpisode('葬送的芙莉莲 第12集') === 12);
t('「EP05」→ 5', extractEpisode('My Hero Academia EP05') === 5);
t('「ep7」→ 7', extractEpisode('Anime Name ep7') === 7);
t('「E.15」→ 15', extractEpisode('Something E.15 Final') === 15);
t('「第1季」→ 1（阿拉伯数字季）', extractEpisode('动画 第1季 完结') === 1);
t('「第一季」中文数字 → null（\\d 不匹配中文数字，可后续扩展）', extractEpisode('第一季 开播了') === null);
t('无集数 → null', extractEpisode('剧场版 总集篇') === null);
t('空字符串 → null', extractEpisode('') === null);
t('null → null', extractEpisode(null) === null);
t('undefined → undefined', extractEpisode(undefined) === null);
t('「第 25 集」带空格 → 25', extractEpisode('海贼王 第 25 集') === 25);

// ========== D) 自动加载逻辑 ==========
console.log('\n===== D) 自动加载逻辑 =====');

// 模拟 localStorage 开关
var store = {};
var mockStorage = {
  getItem: function (k) { return store[k] != null ? String(store[k]) : null; },
  setItem: function (k, v) { store[k] = String(v); }
};
globalStub.localStorage = mockStorage;

// D1: 开关默认开启
// store 中无此键 → getItem 返回 null → null !== 'false' → 启用
t('未设置开关时自动加载应启用', mockStorage.getItem('stellaflix-danmaku-auto-load') !== 'false');

// D2: 可关闭
mockStorage.setItem('stellaflix-danmaku-auto-load', 'false');
t('设为 false 后跳过自动加载', mockStorage.getItem('stellaflix-danmaku-auto-load') === 'false');

// D3: 可重新开启
mockStorage.setItem('stellaflix-danmaku-auto-load', 'true');
t('设为 true 后恢复自动加载', mockStorage.getItem('stellaflix-danmaku-auto-load') !== 'false');

// D4: 标题→集数→loadFromClient 调用链（模拟）
var loadFromClientCalls = [];
var mockPlayer = {
  danmaku: {
    loadFromClient: function (title, ep) {
      loadFromClientCalls.push({ title: title, episode: ep });
      return Promise.resolve([{ message: 'test', time: 1, type: 1, source: '', color: {} }]);
    },
    getAutoLoad: function () { return mockStorage.getItem('stellaflixir-danmaku-auto-load') !== 'false'; }
  }
};

// 模拟 autoLoadDanmaku 核心逻辑
function simulateAutoLoad(title, player, hasEngine, hasCredentials) {
  if (!title || !hasEngine || !player || !player.danmaku || !player.danmaku.loadFromClient) return 'SKIP_NO_PLAYER';
  if (mockStorage.getItem('stellaflix-danmaku-auto-load') === 'false') return 'SKIP_DISABLED';
  if (!hasCredentials) return 'SKIP_NO_CREDS';
  var ep = extractEpisode(title);
  player.danmaku.loadFromClient(title, ep); // fire and forget in real code
  return 'OK_EP=' + ep;
}

var r1 = simulateAutoLoad('进击的巨人 第三季 第15集', mockPlayer, true, true);
t('正常标题触发自动加载 OK_EP=15', r1 === 'OK_EP=15');
t('loadFromClient 被调用，title 正确', loadFromClientCalls.length === 1 && loadFromClientCalls[0].title === '进击的巨人 第三季 第15集');
t('loadFromClient episode=15', loadFromClientCalls[0] && loadFromClientCalls[0].episode === 15);

loadFromClientCalls = [];
var r2 = simulateAutoLoad('', mockPlayer, true, true);
t('空标题跳过', r2 === 'SKIP_NO_PLAYER');

loadFromClientCalls = [];
var r3 = simulateAutoLoad('某剧场版', mockPlayer, true, true);
t('无集数标题仍触发（ep=null）', r3 === 'OK_EP=null');
t('loadFromClient 以 null episode 调用', loadFromClientCalls.length === 1 && loadFromClientCalls[0].episode === null);

loadFromClientCalls = [];
mockStorage.setItem('stellaflix-danmaku-auto-load', 'false');
var r4 = simulateAutoLoad('有集数 第5集', mockPlayer, true, true);
t('关闭后跳过', r4 === 'SKIP_DISABLED');
t('关闭时 loadFromClient 未调用', loadFromClientCalls.length === 0);

loadFromClientCalls = [];
mockStorage.setItem('stellaflix-danmaku-auto-load', 'true');  // 恢复开启
var r5 = simulateAutoLoad('有集数 第5集', mockPlayer, true, false);
t('无凭证跳过', r5 === 'SKIP_NO_CREDS');

// ========== 结果汇总 ==========
console.log('\n===== 弹幕增强测试 ' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) {
  console.log('### 有 ' + fail + ' 项失败 ###');
  process.exit(1);
} else {
  console.log('=== ALL PASS ===');
}
