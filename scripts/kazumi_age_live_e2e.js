/**
 * Kazumi AGE 规则 · 真实站点解析真机验收（Electron 原生 Chromium + 真实 /api/proxy）
 *
 * 为什么必须走 Electron 而不是 Node CLI：
 *   Kazumi 引擎用浏览器原生 DOMParser + document.evaluate 解析 HTML；真实动漫站多为
 *   SPA / JS 渲染，Node 端 @xmldom 无法忠实重建 DOM（实测 AGE 页 293 节点全在 <head>）。
 *   本脚本在真实 Chromium 里加载 product index.html，导入 AGE 规则，对真实 agedm.io
 *   发起搜索（默认经 server.js /api/proxy 转发，绕开浏览器 CORS），再用原生 XPath 解析，
 *   是验证「规则 XPath 是否真匹配该站当前页面」的唯一忠实环境。
 *
 * 运行：
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe scripts/kazumi_age_live_e2e.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_PORT = Number(process.env.SFV_E2E_APP_PORT || 3999);
const RULE_FILE = path.resolve(ROOT, 'docs/kazumi-rules/AGE.json');

let serverProc = null;
let exitCode = 1;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');

function startAppServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(APP_PORT),
        HOST: '127.0.0.1'
      }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let done = false;
    const finish = (err) => { if (!done) { done = true; err ? reject(err) : resolve(); } };
    serverProc.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    serverProc.on('error', finish);
    const t0 = Date.now();
    (function probe() {
      http.get({ host: '127.0.0.1', port: APP_PORT, path: '/video/kazumi-bridge.js' }, (r) => {
        r.resume();
        if (r.statusCode === 200) return finish();
        if (Date.now() - t0 > 20000) return finish(new Error('server.js 探活失败 HTTP ' + r.statusCode));
        setTimeout(probe, 300);
      }).on('error', () => {
        if (Date.now() - t0 > 20000) return finish(new Error('server.js 20s 内未就绪'));
        setTimeout(probe, 300);
      });
    })();
  });
}

function cleanup() {
  try { if (serverProc && !serverProc.killed) serverProc.kill(); } catch (e) {}
}

async function main() {
  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'sfv-age-'));
  app.setPath('userData', tmpUserData);

  await app.whenReady();
  console.log('[AGE-E2E] 启动真实 server.js @ 127.0.0.1:' + APP_PORT);
  await startAppServer();

  const win = new BrowserWindow({
    show: false, width: 1280, height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  const pageErrors = [];
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) pageErrors.push(String(message).slice(0, 200));
  });

  const target = 'http://127.0.0.1:' + APP_PORT + '/index.html';
  console.log('[AGE-E2E] 载入真实产品页 ' + target);
  await win.loadURL(target);
  await new Promise((r) => setTimeout(r, 3000));

  const ruleText = fs.readFileSync(RULE_FILE, 'utf8');
  const renderer = `(async () => {
    const out = { steps: [], searches: [], errors: [], firstDetail: null };
    const withTimeout = (p, ms, label) => Promise.race([
      p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' timeout ' + ms + 'ms')), ms))
    ]);
    try {
      const SFV = window.StellaflixVideo;
      if (!SFV || !SFV.kazumi) throw new Error('SFV.kazumi 未挂载');
      const added = SFV.kazumi.importRule(${JSON.stringify(ruleText)});
      out.steps.push('imported: ' + JSON.stringify(added));
      out.steps.push('listRules: ' + SFV.kazumi.listRules().length + ' 条');

      const keywords = ['进击的巨人', '鬼灭之刃', 'test'];
      for (const kw of keywords) {
        let res = { items: [], errors: [] };
        try {
          res = await withTimeout(SFV.kazumi.search(kw), 30000, kw);
        } catch (e) {
          out.errors.push('search("' + kw + '") 异常: ' + e.message);
          continue;
        }
        const items = res.items || [];
        out.searches.push({
          kw: kw, count: items.length,
          sample: items.slice(0, 5).map(function (i) { return { title: i.title, src: i.src }; }),
          errors: res.errors || []
        });
        if (items.length && !out.firstDetail) {
          const first = items[0];
          try {
            const chap = await withTimeout(SFV.kazumi.getChapters(first.ruleName, first.src), 30000, 'getChapters');
            const plays = (chap && chap.plays) || [];
            out.firstDetail = {
              title: first.title,
              roads: plays.length,
              sampleRoads: plays.slice(0, 3).map(function (p) {
                return { from: p.from, eps: (p.episodes || []).length,
                  sampleEps: (p.episodes || []).slice(0, 3).map(function (e) { return e.name; }) };
              })
            };
          } catch (e) { out.errors.push('getChapters 异常: ' + e.message); }
        }
      }
    } catch (e) {
      out.errors.push('FATAL: ' + e.message);
    }
    return out;
  })()`;

  let result;
  try {
    result = await win.webContents.executeJavaScript(renderer, true);
  } catch (e) {
    console.error('[AGE-E2E] 渲染进程执行失败:', e && e.message);
    cleanup();
    app.exit(1);
    return;
  }

  console.log('\n========================================');
  console.log('Kazumi AGE 规则 · 真实站点解析真机验收');
  console.log('========================================');
  (result.steps || []).forEach((m) => console.log('  · ' + m));
  console.log('--- 各关键词搜索 ---');
  (result.searches || []).forEach((s) => {
    console.log('  关键词「' + s.kw + '」=> ' + s.count + ' 条结果');
    (s.sample || []).forEach((it, i) => console.log('    ' + (i + 1) + '. ' + it.title + '  ->  ' + it.src));
    if (s.errors && s.errors.length) s.errors.forEach((e) => console.log('    ⚠ ' + e.ruleName + ': ' + e.reason));
  });
  if (result.firstDetail) {
    const d = result.firstDetail;
    console.log('--- 首条详情「' + d.title + '」---');
    console.log('  播放线路: ' + d.roads + ' 条');
    (d.sampleRoads || []).forEach((p) => {
      console.log('    线路「' + p.from + '」: ' + p.eps + ' 集  ' + (p.sampleEps || []).join(' / '));
    });
  }
  if (result.errors && result.errors.length) {
    console.log('--- 错误 ---');
    result.errors.forEach((e) => console.log('  ✗ ' + e));
  }
  if (pageErrors.length) {
    console.log('--- 页面控制台报错（前 8 条，供判断是否由本次改动引入）---');
    pageErrors.slice(0, 8).forEach((m) => console.log('  ! ' + m));
  }
  const anyItems = (result.searches || []).some((s) => s.count > 0);
  const hasChapters = result.firstDetail && result.firstDetail.roads > 0;
  console.log('\n----------------------------------------');
  console.log('结论: ' + (anyItems ? '✅ 真实站点搜索有结果' : '❌ 真实站点搜索 0 结果') +
    (hasChapters ? ' + ✅ 真实章节解析成功' : (anyItems ? ' + ❌ 章节解析失败' : '')));
  exitCode = (anyItems && hasChapters) ? 0 : (anyItems ? 1 : 2);

  cleanup();
  app.exit(exitCode);
}

process.on('uncaughtException', (e) => {
  console.error('[AGE-E2E] 未捕获异常:', e && e.stack || e);
  cleanup();
  app.exit(1);
});

main().catch((e) => {
  console.error('[AGE-E2E] 主流程失败:', e && e.stack || e);
  cleanup();
  app.exit(1);
});
