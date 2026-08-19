/**
 * 多源面板对齐 Kazumi — 真机端到端验收（Electron 无头 + 真实 index.html）
 *
 * 运行： npx electron scripts/multisource_e2e_electron.js
 *
 * 与 vm 沙箱测试的区别（本文件存在的唯一理由）：
 *   vm 测试把 DOM 用 mock 模拟，无法验证「真实渲染进程里面板/播放器 UI 是否真的长出节点、
 *   状态点 class 是否真的切换、截图长什么样」。
 *   本测试全部用真货：真实 Chromium 渲染进程 → 真实 public/index.html → 真实 server.js 静态托管，
 *   然后用渲染进程探针（multisource_e2e_renderer.js）在真实 DOM 上驱动 UI + 断言，
 *   由主进程在窗口上 capturePage() 抓取每个阶段真实截图。
 *
 * 不依赖真实片源/网络：探针直接用预建 groups / 多线路 fixture 驱动 UI，
 * 仅验证「渲染与状态机」这一层（源搜索网络往返由其它 live 测试覆盖）。
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_PORT = Number(process.env.SFV_E2E_APP_PORT || 3999);
const OUT_DIR = path.join(ROOT, 'outputs', 'multisource-e2e');
let serverProc = null;
let exitCode = 1;

// 无头/受限环境强制软件渲染（实测报 "GPU process isn't usable"）
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');

function cleanup() {
  try { if (serverProc && !serverProc.killed) serverProc.kill(); } catch (e) {}
}

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(APP_PORT) })
    });
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    serverProc.on('error', reject);
    const t0 = Date.now();
    (function probe() {
      http.get({ host: '127.0.0.1', port: APP_PORT, path: '/index.html' }, (r) => {
        if (r.statusCode === 200) return resolve();
        if (Date.now() - t0 > 20000) return reject(new Error('server.js 20s 内未就绪'));
        setTimeout(probe, 300);
      }).on('error', () => {
        if (Date.now() - t0 > 20000) return reject(new Error('server.js 探活失败'));
        setTimeout(probe, 300);
      });
    })();
  });
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function capture(win, name) {
  try {
    const png = await win.webContents.capturePage();
    const file = path.join(OUT_DIR, name + '.png');
    fs.writeFileSync(file, png.toPNG());
    console.log('[E2E] 截图已保存: ' + file);
    return name;
  } catch (e) {
    console.warn('[E2E] 截图失败 ' + name + ': ' + (e && e.message));
    return null;
  }
}

async function main() {
  await startServer();
  try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch (e) {}

  const win = new BrowserWindow({
    show: false, width: 1280, height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  const pageErrors = [];
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) pageErrors.push(String(message) + '   @ ' + String(sourceId || '?').replace(/^https?:\/\/[^/]+/, '') + ':' + line);
  });

  const target = 'http://127.0.0.1:' + APP_PORT + '/index.html';
  console.log('[E2E] 载入真实产品页 ' + target);
  await win.loadURL(target);
  await wait(2500); // 等页面启动逻辑跑完

  const rendererSrc = fs.readFileSync(path.join(__dirname, 'multisource_e2e_renderer.js'), 'utf8');
  try {
    await win.webContents.executeJavaScript(rendererSrc, true);
  } catch (e) {
    console.error('[E2E] 渲染进程探针加载失败:', e && e.message);
    cleanup(); app.exit(1); return;
  }

  // 阶段顺序：开面板 → 流式填充 → 截图面板 → 关面板/开线路选集 → 截图播放器侧 → 断言
  const shots = [];
  try {
    let r = await win.webContents.executeJavaScript('window.__msProbe.openPanel()', true);
    if (!r || !r.ok) { console.error('[E2E] 开面板失败:', JSON.stringify(r)); cleanup(); app.exit(1); return; }
    await wait(250);
    await capture(win, '01-panel-empty'); shots.push('01-panel-empty');

    await win.webContents.executeJavaScript('window.__msProbe.fillPanel()', true);
    await wait(250);
    await capture(win, '02-panel-filled'); shots.push('02-panel-filled');

    await win.webContents.executeJavaScript('window.__msProbe.closePanel()', true);
    await win.webContents.executeJavaScript('window.__msProbe.openRoadEp()', true);
    await wait(250);
    await capture(win, '03-player-road-episode'); shots.push('03-player-road-episode');

    var result = await win.webContents.executeJavaScript('window.__msProbe.assert()', true);
    await win.webContents.executeJavaScript('window.__msProbe.cleanup()', true);

    console.log('\n========================================');
    console.log('多源面板对齐 Kazumi · 真机端到端验收');
    console.log('========================================');
    (result.pass || []).forEach((m) => console.log('  ✓ ' + m));
    (result.fail || []).forEach((m) => console.log('  ✗ ' + m));
    if (result.info && result.info.length) {
      console.log('\n--- 实测观察 ---');
      result.info.forEach((m) => console.log('  · ' + m));
    }
    if (pageErrors.length) {
      console.log('\n--- 页面控制台报错（前 15 条）---');
      pageErrors.slice(0, 15).forEach((m) => console.log('  ! ' + String(m).slice(0, 300)));
      console.log('  （共 ' + pageErrors.length + ' 条）');
    }
    const pass = (result.pass || []).length, fail = (result.fail || []).length;
    console.log('\n----------------------------------------');
    console.log('真机 E2E: ' + pass + ' pass / ' + fail + ' fail');
    console.log(fail === 0 ? '✅ 真机端到端全部通过' : '❌ 存在真机失败项');
    if (shots.length) console.log('📸 截图位于: ' + OUT_DIR);
    exitCode = fail === 0 ? 0 : 1;
  } catch (e) {
    console.error('[E2E] 阶段执行失败:', e && e.message);
    exitCode = 1;
  }

  cleanup();
  app.exit(exitCode);
}

process.on('uncaughtException', (e) => { console.error('[E2E] 未捕获异常:', e && e.stack || e); cleanup(); app.exit(1); });
main().catch((e) => { console.error('[E2E] 主流程失败:', e && e.stack || e); cleanup(); app.exit(1); });
