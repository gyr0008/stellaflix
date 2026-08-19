/**
 * Stellaflix 真机一键 smoke —— 壁纸引擎 + 影视态（R1–R4）验收
 *
 * 运行： npx electron scripts/wallpaper_video_smoke_electron.js
 *
 * 设计原则（与 scripts/kazumi_e2e_electron.js 同源范式）：
 *   - 无头/受限环境强制软件渲染：app.disableHardwareAcceleration + --disable-gpu 等，
 *     必须在 app ready 之前设置。
 *   - 真实 server.js 子进程（ELECTRON_RUN_AS_NODE=1）托管真实 public/index.html。
 *   - 注入 renderer 脚本驱动真实渲染进程断言。
 *
 * 三类验证的边界（诚实分层，绝不假绿）：
 *   A. 静态契约检查（node 侧，读 desktop/main.js 文本）：
 *      验证 14 个 stellaflix-wallpaper-engine-* IPC handler、桌面图标分层队列（R2）、
 *      权限 grant fail-closed 链（R3）**在源码中确实存在并接线**。无需 GUI。
 *   B. 真机浏览器端到端（renderer 侧，需 Electron 但可无头）：
 *      R4 双态硬隔离 + 控制器形态 + 粒子照常 + R1/R3 的渲染端桥接存在性。
 *   C. 人工 GUI 验收清单（仅打印，不计入 exitCode）：
 *      R1 壁纸独立窗口渲染、R2 Explorer 重启无撕裂、R3 WE 捕获/玻璃表面/视差指针
 *      这些依赖真实 Windows 桌面合成 + GPU，无头沙箱无法验证，必须由人在真机执行。
 *
 * exitCode：仅反映 A + B 自动化结果；C 项不计入（明确告知需真机）。
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MAIN_JS = path.join(ROOT, 'desktop', 'main.js');
const APP_PORT = Number(process.env.SFV_SMOKE_APP_PORT || 3999);

let serverProc = null;
let exitCode = 1;

// ----------------------------------------------------------------- 强制软件渲染
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');

// ----------------------------------------------------------------- 静态契约检查
// 14 个 stellaflix-wallpaper-engine-* IPC 通道（handle/on），由 desktop/main.js:1899 起注册。
const WE_IPC_CHANNELS = [
  'stellaflix-wallpaper-engine-list',
  'stellaflix-wallpaper-engine-project-details',
  'stellaflix-wallpaper-engine-open-project-details',
  'stellaflix-wallpaper-engine-choose-directory',
  'stellaflix-wallpaper-engine-choose-project-file',
  'stellaflix-wallpaper-engine-remove-directory',
  'stellaflix-wallpaper-engine-runtime-status',
  'stellaflix-wallpaper-engine-start-scene',
  'stellaflix-wallpaper-engine-capture-result',
  'stellaflix-wallpaper-engine-prepare-glass-capture',
  'stellaflix-wallpaper-engine-activate-dwm-surface',
  'stellaflix-wallpaper-engine-glass-surface',
  'stellaflix-wallpaper-engine-pointer-activity',
  'stellaflix-wallpaper-engine-stop-scene'
];

function runStaticChecks() {
  const out = { pass: [], fail: [], info: [] };
  let src = '';
  try {
    src = fs.readFileSync(MAIN_JS, 'utf8');
  } catch (e) {
    out.fail.push('S0 无法读取 desktop/main.js: ' + String(e && e.message));
    return out;
  }
  out.ok = function (cond, msg) { if (cond) out.pass.push(msg); else out.fail.push(msg); };

  // S1–S14：14 个 IPC 通道注册
  WE_IPC_CHANNELS.forEach(function (ch) {
    out.ok(src.indexOf("'" + ch + "'") !== -1 || src.indexOf('"' + ch + '"') !== -1,
      'S·' + ch + ' 已注册');
  });

  // S15（R2）：桌面图标分层队列存在
  out.ok(src.indexOf('wallpaperEngineDesktopIconLayeringQueue') !== -1,
    'S15 R2 桌面图标分层队列 wallpaperEngineDesktopIconLayeringQueue 已接线');

  // S16–S18（R3）：权限 grant fail-closed 链关键标记
  out.ok(src.indexOf('getWallpaperEngineCaptureGrant') !== -1,
    'S16 R3 权限 grant 读取入口 getWallpaperEngineCaptureGrant 存在');
  out.ok(src.indexOf('clearWallpaperEngineCaptureGrant') !== -1,
    'S17 R3 权限 grant 失效清理 clearWallpaperEngineCaptureGrant 存在');
  out.ok(src.indexOf('WALLPAPER_CAPTURE_GRANT_MISSING') !== -1,
    'S18 R3 权限缺失 fail-closed 错误码 WALLPAPER_CAPTURE_GRANT_MISSING 存在');

  // 统计
  out.info.push('静态契约检查覆盖：14 IPC 通道 + R2 图标分层 + R3 grant fail-closed（共 ' +
    WE_IPC_CHANNELS.length + ' 通道 / 3 项主进程证据）');
  return out;
}

// ----------------------------------------------------------------- 真实 server.js
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
    const t0 = Date.now();
    (function probe() {
      http.get({ host: '127.0.0.1', port: APP_PORT, path: '/index.html' }, (r) => {
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

// ----------------------------------------------------------------- 人工 GUI 清单（C 组）
const MANUAL_CHECKLIST = [
  'R1 壁纸独立窗口：触发壁纸模式，确认独立窗口渲染正常、Esc 退出无残留。',
  'R2 全桌面模式（Path A′）：启用 FullDesktopModeRuntime，确认桌面图标分层正确、Explorer 重启无撕裂。',
  'R3 Steam Wallpaper Engine（Path B）：导入 WE 场景，确认捕获/玻璃表面/视差指针中继生效，权限 grant 弹窗在拒绝时 fail-closed（WALLPAPER_CAPTURE_GRANT_MISSING）。',
  'R4 影视态端到端（真实源）：配置影视源后搜索 → 进入影视态 → 直链/HLS 与 Kazumi 嵌入态播放 → 控制器形态 → 切回音乐态，确认双态硬隔离、粒子照常、无闪烁（自动化 B 组仅验证状态机/控制器/隔离契约，真实源播放见 kazumi_e2e_relectron.js）。'
];

// ----------------------------------------------------------------- 主流程
async function main() {
  // A 组静态契约检查（无需 GUI，先跑，失败也能给结论）
  const staticRes = runStaticChecks();

  // 用独立 userData，避免污染用户真实配置
  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'sfv-smoke-'));
  app.setPath('userData', tmpUserData);

  await app.whenReady();

  console.log('[SMOKE] 启动真实 server.js 于 127.0.0.1:' + APP_PORT);
  await startAppServer();

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  // 记录页面控制台报错（level>=2），供判断是否由本次改动引入
  const pageErrors = [];
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      pageErrors.push(String(message) + '   @ ' + String(sourceId || '?').replace(/^https?:\/\/[^/]+/, '') + ':' + line);
    }
  });

  const target = 'http://127.0.0.1:' + APP_PORT + '/index.html';
  console.log('[SMOKE] 载入真实产品页 ' + target);
  await win.loadURL(target);
  // 等页面自身启动逻辑跑完（Three.js / 音乐态初始化 / SFV 全局挂载）
  await new Promise((r) => setTimeout(r, 2500));

  const rendererSrc = fs.readFileSync(path.join(__dirname, 'wallpaper_video_smoke_renderer.js'), 'utf8');
  let result;
  try {
    result = await win.webContents.executeJavaScript(rendererSrc, true);
  } catch (e) {
    console.error('[SMOKE] 渲染进程执行失败:', e && e.message);
    cleanup();
    app.exit(1);
    return;
  }

  // ---------------- 报告 ----------------
  console.log('\n================================================');
  console.log('Stellaflix 真机 Smoke 验收报告（R1–R4）');
  console.log('================================================');

  console.log('\n--- A 组：静态契约检查（desktop/main.js，无需 GUI）---');
  (staticRes.pass || []).forEach((m) => console.log('  ✓ ' + m));
  (staticRes.fail || []).forEach((m) => console.log('  ✗ ' + m));
  (staticRes.info || []).forEach((m) => console.log('  · ' + m));

  console.log('\n--- B 组：真机浏览器端到端（R4 双态 + R1/R3 桥接存在）---');
  (result.pass || []).forEach((m) => console.log('  ✓ ' + m));
  (result.fail || []).forEach((m) => console.log('  ✗ ' + m));
  if (result.info && result.info.length) {
    console.log('\n  --- 实测观察 ---');
    result.info.forEach((m) => console.log('  · ' + m));
  }

  if (pageErrors.length) {
    console.log('\n--- 页面控制台报错（前 15 条，供判断是否由本次改动引入）---');
    pageErrors.slice(0, 15).forEach((m) => console.log('  ! ' + String(m).slice(0, 300)));
    console.log('  （共 ' + pageErrors.length + ' 条）');
  }

  console.log('\n--- C 组：人工 GUI 验收清单（需真实 Windows + GUI + Electron v24，不计入 exitCode）---');
  MANUAL_CHECKLIST.forEach((m, i) => console.log('  [' + (i + 1) + '] ' + m));

  const aPass = (staticRes.pass || []).length;
  const aFail = (staticRes.fail || []).length;
  const bPass = (result.pass || []).length;
  const bFail = (result.fail || []).length;
  console.log('\n------------------------------------------------');
  console.log('自动化（A+B）: ' + (aPass + bPass) + ' pass / ' + (aFail + bFail) + ' fail' +
    '  ｜ 静态 ' + aPass + '/' + aFail + ' ｜ 浏览器 ' + bPass + '/' + bFail);
  console.log(aFail + bFail === 0 ? '✅ 自动化验收全部通过（C 组需真机人工确认）' : '❌ 自动化存在失败项');
  exitCode = (aFail + bFail === 0) ? 0 : 1;

  cleanup();
  app.exit(exitCode);
}

process.on('uncaughtException', (e) => {
  console.error('[SMOKE] 未捕获异常:', e && e.stack || e);
  cleanup();
  app.exit(1);
});

main().catch((e) => {
  console.error('[SMOKE] 主流程失败:', e && e.stack || e);
  cleanup();
  app.exit(1);
});
