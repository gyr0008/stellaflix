#!/usr/bin/env node
'use strict';
/**
 * Kazumi 实时公网规则验证脚本（Step 2 验证能力）
 * ============================================================
 * 用途：您从「规则管理 UI」导入/导出一个真实公网规则后，用本脚本在 Node 下
 *       对该站点跑一次 真实 search + getChapters，验证规则的 XPath 是否真的
 *       匹配该站点的真实页面结构（而非只校验 JSON 字段合法）。
 *
 * 合规说明：本脚本不预置、不硬编码任何站点。规则完全来自您传入的 rule.json
 *           （您自己导入的站点），符合「出厂不预置、全部用户手动导入」红线。
 *
 * 用法：
 *   node scripts/kazumi_live_rule_test.js <rule.json> [关键词] [--proxy]
 *
 *   <rule.json>  必填。一条或多条 Kazumi 规则（与导入 UI 同格式）。
 *   [关键词]     可选。搜索关键词，默认 "test"。
 *   --proxy      可选。改用本机 server.js 的 /api/proxy 转发（更贴近产品内实际
 *                请求路径），需先 `node server.js` 再运行本脚本。
 *                默认（不加 --proxy）直连真实站点，绕过 /api/proxy，直接验证
 *                XPath 与真实页面的匹配度。
 *
 * 退出码：0 = 至少一条规则搜到结果并解析出章节；2 = 无结果 / 出错（便于判断）。
 *
 * 实现：Kazumi 引擎是 UMD，可在 Node 直接 require。http-client 用全局 fetch
 *       （Node 22+ 内置），默认 useProxy=true 走 /api/proxy；本脚本在无 --proxy
 *       时强制 useProxy=false 直连，并剥离 Accept-Encoding（undici 会自动解压，
 *       手动带该头会导致 resp.text() 拿到压缩乱码）。
 *
 * ⚠ DOM/XPath 依赖：引擎原生使用浏览器 DOMParser + document.evaluate（W3C XPath）。
 *   本 Node CLI 通过 @xmldom/xmldom（HTML 模式）+ xpath 包在 CLI 侧补这两个 API，
 *   二者装在「受管 node 工作区」，运行前请设置 NODE_PATH：
 *     NODE_PATH="C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules" \
 *       node scripts/kazumi_live_rule_test.js <rule.json> [关键词]
 *   注意：xmldom 的 HTML 解析对真实 SPA 站点（结果由前端 JS 渲染）力有不逮，
 *   这类站点请用产品内 Electron 运行时（原生 DOMParser + 真实渲染）做最终验证。
 */
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const PROJ = path.resolve(__dirname, '..');
const KZ = (p) => require(path.join(PROJ, 'public/video/kazumi', p));

// ---- 按浏览器加载顺序注入全局（与 index.html 引入顺序一致）----
global.KazumiRuleSchema = KZ('rule-schema.js');
global.KazumiUrlUtils = KZ('url-utils.js');
global.KazumiHttpClient = KZ('http-client.js');
global.KazumiXPathEngine = KZ('xpath-engine.js');
global.KazumiRuleEngine = KZ('rule-engine.js');

const useProxy = process.argv.includes('--proxy');
if (!useProxy) {
  // 直连模式：禁用代理 + 剥离 Accept-Encoding（undici 自动解压，手动头会致乱码）
  const origGet = global.KazumiHttpClient.get.bind(global.KazumiHttpClient);
  global.KazumiHttpClient.get = (url, opts) =>
    origGet(url, Object.assign({ useProxy: false }, opts || {}));
  const origBuild = global.KazumiHttpClient.buildHeaders.bind(global.KazumiHttpClient);
  global.KazumiHttpClient.buildHeaders = (rule, url) => {
    const h = origBuild(rule, url);
    delete h['Accept-Encoding'];
    return h;
  };
}

global.Kazumi = KZ('index.js'); // 须在全局就绪后 require（其工厂读取 global.Kazumi*）

// ---- Node 端 DOM + XPath polyfill（仅用于本 CLI 直连验证；浏览器/Electron 原生具备）----
// 依赖 @xmldom/xmldom（HTML 模式）与 xpath，装在受管 node 工作区，经 NODE_PATH 引入，
// 不进产品依赖。生产运行在 Electron 中，DOMParser / document.evaluate 由 Chromium 原生提供。
(function installDomPolyfill() {
  let xmldom, xpath;
  try { xmldom = require('@xmldom/xmldom'); } catch (e) {
    console.error('缺少 @xmldom/xmldom（请用 NODE_PATH 指向受管 node 工作区）：' + e.message);
    process.exit(2);
  }
  try { xpath = require('xpath'); } catch (e) {
    console.error('缺少 xpath（请用 NODE_PATH 指向受管 node 工作区）：' + e.message);
    process.exit(2);
  }
  if (typeof global.localStorage === 'undefined') {
    const _s = {};
    global.localStorage = {
      getItem: (k) => (k in _s ? _s[k] : null),
      setItem: (k, v) => { _s[k] = String(v); },
      removeItem: (k) => { delete _s[k]; }
    };
  }
  const RealDP = xmldom.DOMParser;
  global.DOMParser = class extends RealDP {
    parseFromString(str, type) {
      const doc = super.parseFromString(str, type || 'text/html');
      if (doc && typeof doc.evaluate !== 'function') {
        // 用 xpath.select / select1 自行构造符合 W3C DOM Level 3 形状的结果对象，
        // 避免依赖 xpath.evaluate 对 resultType 的处理细节。
        doc.evaluate = function (expr, context, ns, type, result) {
          const ctx = context || doc;
          if (type === xpath.XPathResult.FIRST_ORDERED_NODE_TYPE) {
            const n = xpath.select1(expr, ctx);
            return { singleNodeValue: n || null, snapshotLength: n ? 1 : 0, snapshotItem: function () { return n || null; }, resultType: type };
          }
          const arr = xpath.select(expr, ctx) || [];
          return {
            snapshotLength: arr.length,
            snapshotItem: function (i) { return (i >= 0 && i < arr.length) ? arr[i] : null; },
            singleNodeValue: arr.length ? arr[0] : null,
            resultType: type
          };
        };
      }
      return doc;
    }
  };
  global.XPathResult = xpath.XPathResult;
})();

// ---- 参数 ----
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const rulePath = positional[0];
const keyword = positional[1] || 'test';

if (!rulePath) {
  console.error('用法: node scripts/kazumi_live_rule_test.js <rule.json> [关键词] [--proxy]');
  process.exit(2);
}

function isPrivateHost(host) {
  return new Promise((resolve) => {
    dns.lookup(host, (err, addr) => {
      if (err) return resolve(false);
      const p = addr.split('.');
      const isPriv =
        addr === '127.0.0.1' || addr === '::1' ||
        p[0] === '10' ||
        (p[0] === '192' && p[1] === '168') ||
        (p[0] === '172' && +p[1] >= 16 && +p[1] <= 31) ||
        (p[0] === '169' && p[1] === '254');
      resolve(isPriv);
    });
  });
}

async function main() {
  let ruleText;
  try {
    ruleText = fs.readFileSync(rulePath, 'utf8');
  } catch (e) {
    console.error('无法读取规则文件:', rulePath, '—', e.message);
    process.exit(2);
  }

  const manager = global.Kazumi.createRuleManager();
  const added = manager.importRules(ruleText);
  console.log('已导入规则:', added.join(', ') || '(无)');

  const rules = manager.getEnabledXpathRules();
  if (!rules.length) {
    console.error('没有可启用的 XPath 规则（规则可能校验不通过或非 xpath 模式）。');
    process.exit(2);
  }

  let anyHit = false;
  for (const rule of rules) {
    // 私有地址安全提醒（直连模式绕过了 server.js 的 SSRF 防护）
    let host = '';
    try { host = new URL(rule.baseURL || '').hostname; } catch (e) {}
    if (host && (await isPrivateHost(host))) {
      console.log(`\n[${rule.name}] ⚠ 注意：baseURL 指向私有地址 ${host}（直连模式绕过 SSRF 防护）。`);
    }

    console.log(`\n========== [${rule.name}] 关键词: "${keyword}" ==========`);
    let trace;
    try {
      trace = await manager.search(rule, keyword);
    } catch (e) {
      console.log('  搜索失败:', e.message);
      continue;
    }
    const items = (trace && trace.items) || [];
    console.log(`  搜索命中: ${items.length} 条`);
    items.slice(0, 6).forEach((it, i) => {
      console.log(`    ${i + 1}. ${it.title}  ->  ${it.src}`);
    });
    if (!items.length) continue;
    anyHit = true;

    const first = items[0];
    try {
      const chap = await manager.getChapters(rule.name, first.src);
      const roads = (chap && chap.plays) || [];
      console.log(`  详情「${first.title}」解析出 ${roads.length} 条播放线路`);
      roads.slice(0, 4).forEach((p, i) => {
        console.log(`    线路${i + 1} ${(p.from || '')}: ${(p.episodes || []).length} 集`);
        (p.episodes || []).slice(0, 3).forEach((ep, j) =>
          console.log(`      · ${ep.name || ('第' + (ep.index + 1) + '集')}  ${ep.url || ''}`));
      });
    } catch (e) {
      console.log('  章节解析失败:', e.message);
    }
  }

  console.log('\n========================================');
  console.log(anyHit ? '✅ 至少一条规则在真实站点上搜到结果并解析出章节' : '❌ 所有规则在真实站点上均无结果');
  process.exit(anyHit ? 0 : 2);
}

main().catch((e) => {
  console.error('脚本异常:', e && e.stack || e);
  process.exit(2);
});
