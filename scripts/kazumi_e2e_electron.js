/**
 * Kazumi Phase 2 — 真机端到端验收（Electron + 真实 server.js + 真实 /api/proxy）
 *
 * 运行： npx electron scripts/kazumi_e2e_electron.js
 *
 * 与既有 vm 沙箱测试的区别（这也是本文件存在的唯一理由）：
 *   vm 测试把 KazumiXPathEngine.parseSearch/parseChapters 与 fetch 都 mock 掉了，
 *   因此「XPath 解析」「HTTP 往返」「产品页脚本加载」从未被真正执行过。
 *   本测试全部用真货：
 *     真实 Chromium 渲染进程 → 真实 public/index.html
 *       → 真实 server.js 静态托管 → 真实 /api/proxy 转发
 *       → 本地夹具站（localtest.me:4001，DNS 解析到 127.0.0.1）
 *
 * 为什么夹具站用 localtest.me 而不是 127.0.0.1：
 *   server.js 的 isPrivateHost() 会以 403 拦截私网 IP（SSRF 防护，正确行为，不应为测试放宽）。
 *   而它对域名一律放行（server.js:297）。localtest.me 是公共 DNS 中指向 127.0.0.1 的域名，
 *   因此可以在「不修改任何产品代码、不削弱安全防护」的前提下打通完整链路。
 *
 * 不联网也能跑的前提：localtest.me 的解析结果通常已被系统 DNS 缓存；若解析失败会明确报错。
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_PORT = Number(process.env.SFV_E2E_APP_PORT || 3998);
const FIXTURE_PORT = Number(process.env.SFV_E2E_FIXTURE_PORT || 4001);
const FIXTURE_HOST = process.env.SFV_E2E_FIXTURE_HOST || 'localtest.me';

let serverProc = null;
let fixtureServer = null;
let exitCode = 1;

// 无头/受限环境下 GPU 进程不可用（实测报 "GPU process isn't usable. Goodbye."），
// 这里强制走软件渲染。必须在 app ready 之前设置。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');

// ------------------------------------------------------------------ 夹具站点
const SEARCH_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>fixture-search</title></head>
<body>
  <div class="wrap">
    <div class="item"><a href="/detail/1"><span class="title">测试剧集甲</span></a></div>
    <div class="item"><a href="/detail/2"><span class="title">测试剧集乙</span></a></div>
  </div>
</body></html>`;

const DETAIL_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>fixture-detail</title></head>
<body>
  <div class="content-list">
    <div class="road">
      <a href="/play/1-1">第1集</a>
      <a href="/play/1-2">第2集</a>
      <a href="/play/1-3">第3集</a>
    </div>
    <div class="road">
      <a href="/play/2-1">第1集</a>
      <a href="/play/2-2">第2集</a>
    </div>
  </div>
</body></html>`;

function startFixture() {
  return new Promise((resolve, reject) => {
    fixtureServer = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      let body = null;
      if (u.pathname === '/search') body = SEARCH_HTML;
      else if (u.pathname.startsWith('/detail/')) body = DETAIL_HTML;
      if (body === null) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    });
    fixtureServer.on('error', reject);
    fixtureServer.listen(FIXTURE_PORT, '0.0.0.0', () => resolve());
  });
}

// ------------------------------------------------------------------ 真实 server.js
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
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    serverProc.on('error', finish);
    // 轮询探活，比等日志字符串稳
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
  try { if (fixtureServer) fixtureServer.close(); } catch (e) {}
  try { if (serverProc && !serverProc.killed) serverProc.kill(); } catch (e) {}
}

// ------------------------------------------------------------------ 主流程
async function main() {
  // 用独立 userData，避免污染用户真实配置
  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'sfv-e2e-'));
  app.setPath('userData', tmpUserData);

  await app.whenReady();

  console.log('[E2E] 启动本地夹具站 ' + FIXTURE_HOST + ':' + FIXTURE_PORT);
  await startFixture();
  console.log('[E2E] 启动真实 server.js 于 127.0.0.1:' + APP_PORT);
  await startAppServer();

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  // 记录报错来源文件/行号，便于判断是否由影视模块引入（而不是笼统归因为"页面自身问题"）
  const pageErrors = [];
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      pageErrors.push(String(message) + '   @ ' + String(sourceId || '?').replace(/^https?:\/\/[^/]+/, '') + ':' + line);
    }
  });

  const target = 'http://127.0.0.1:' + APP_PORT + '/index.html';
  console.log('[E2E] 载入真实产品页 ' + target);
  await win.loadURL(target);
  // 等页面自身启动逻辑跑完（Three.js / 音乐态初始化）
  await new Promise((r) => setTimeout(r, 2500));

  const rendererSrc = fs.readFileSync(path.join(__dirname, 'kazumi_e2e_renderer.js'), 'utf8');
  let result;
  try {
    result = await win.webContents.executeJavaScript(rendererSrc, true);
  } catch (e) {
    console.error('[E2E] 渲染进程执行失败:', e && e.message);
    cleanup();
    app.exit(1);
    return;
  }

  // ---------------- 报告 ----------------
  console.log('\n========================================');
  console.log('Kazumi Phase 2 真机端到端验收');
  console.log('========================================');
  (result.pass || []).forEach((m) => console.log('  ✓ ' + m));
  (result.fail || []).forEach((m) => console.log('  ✗ ' + m));
  if (result.info && result.info.length) {
    console.log('\n--- 实测观察 ---');
    result.info.forEach((m) => console.log('  · ' + m));
  }
  if (pageErrors.length) {
    console.log('\n--- 页面控制台报错（前 15 条，供判断是否由本次改动引入）---');
    pageErrors.slice(0, 15).forEach((m) => console.log('  ! ' + String(m).slice(0, 300)));
    console.log('  （共 ' + pageErrors.length + ' 条）');
  }
  const pass = (result.pass || []).length;
  const fail = (result.fail || []).length;
  console.log('\n----------------------------------------');
  console.log('真机 E2E: ' + pass + ' pass / ' + fail + ' fail');
  console.log(fail === 0 ? '✅ 真机端到端全部通过' : '❌ 存在真机失败项');
  exitCode = fail === 0 ? 0 : 1;

  cleanup();
  app.exit(exitCode);
}

process.on('uncaughtException', (e) => {
  console.error('[E2E] 未捕获异常:', e && e.stack || e);
  cleanup();
  app.exit(1);
});

main().catch((e) => {
  console.error('[E2E] 主流程失败:', e && e.stack || e);
  cleanup();
  app.exit(1);
});
