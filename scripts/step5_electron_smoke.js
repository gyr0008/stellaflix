/**
 * Step 5 真机冒烟 —— FLV / 字幕 / 连播 在真实 Chromium + 真实 server.js + 真实 index.html 下验证
 *
 * 运行： npx electron scripts/step5_electron_smoke.js
 *        （Windows 需 env -u ELECTRON_RUN_AS_NODE）
 *
 * 与 vm 沙箱测试的区别（本文件存在的唯一理由）：
 *   vm 测试把 DOM、flv.js、fetch 全部 stub 掉了，无法证明：
 *     · public/vendor/flv.min.js 真的能被 server.js 托管并在 Chromium 里 eval 通过；
 *     · flvjs.isSupported() 在真实 MSE 环境返回 true；
 *     · index.html 真的引入了 subtitle.js 且脚本顺序无误；
 *     · 字幕覆盖层 DOM 真的被创建、CSS 类真的存在；
 *     · 真实 <video> 的 ended 事件真的能驱动连播。
 *   本脚本全部用真货跑一遍。
 *
 * 不做的事（诚实边界）：不播放任何真实影视流（出厂无源、合规红线），
 *   因此「FLV 真实解码出画面」「跨域字幕真实拉取」仍需用户用自己的源手动确认。
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_PORT = Number(process.env.SFV_SMOKE_PORT || 3997);

let serverProc = null;
let exitCode = 1;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function startAppServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        ELECTRON_RUN_AS_NODE: '1', PORT: String(APP_PORT), HOST: '127.0.0.1',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let done = false;
    const finish = (err) => { if (!done) { done = true; err ? reject(err) : resolve(); } };
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    serverProc.on('error', finish);
    const t0 = Date.now();
    (function probe() {
      http.get({ host: '127.0.0.1', port: APP_PORT, path: '/video/subtitle.js' }, (r) => {
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

// ---- 在渲染进程里执行的检查脚本（返回 {name, ok, detail}[]）----
const RENDERER = `(async () => {
  const R = [];
  const t = (name, ok, detail) => R.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  try {
    const SFV = window.StellaflixVideo;
    t('StellaflixVideo 命名空间存在', !!SFV);
    t('index.html 已引入 subtitle.js（SFV.subtitle 就绪）', !!(SFV && SFV.subtitle && SFV.subtitle.parseSrt));
    t('SFV.player 导出字幕 API', !!(SFV.player && SFV.player.loadSubtitle && SFV.player.openSubtitleMenu));
    t('SFV.player 导出连播 API', !!(SFV.player && SFV.player.setPlayNext && SFV.player.getPlayMode));
    t('SFV.source 导出 attachFlv/isFlvUrl', !!(SFV.source && SFV.source.attachFlv && SFV.source.isFlvUrl));

    // ---- FLV：真实静态资源 + 真实 Chromium 加载 flv.js ----
    const headResp = await fetch('/vendor/flv.min.js');
    t('server.js 可托管 /vendor/flv.min.js', headResp.ok, 'HTTP ' + headResp.status);
    const flvSrc = await headResp.text();
    t('flv.min.js 体积合理', flvSrc.length > 50000, flvSrc.length + ' bytes');

    await SFV.source.loadFlvLib();
    t('loadFlvLib() 在真实 Chromium 注入成功', typeof window.flvjs === 'object' && !!window.flvjs.createPlayer);
    t('flvjs.isSupported() 真实 MSE 环境返回 true', window.flvjs.isSupported() === true);

    const rFlv = SFV.source.resolve('https://cdn.test/live/a.flv');
    t('resolve 识别 .flv 为 kind=flv', rFlv.kind === 'flv', 'kind=' + rFlv.kind);
    t('跨域 flv 走 /api/proxy', rFlv.playUrl.indexOf('/api/proxy?url=') === 0, rFlv.playUrl.slice(0, 60));
    t('isFlvUrl 边界：mp4 不误判', SFV.source.isFlvUrl('https://c/a.mp4') === false);
    t('isFlvUrl 边界：带 query 的 flv 命中', SFV.source.isFlvUrl('https://c/a.flv?t=1') === true);

    // ---- 字幕：真实 DOM 渲染 ----
    const srt = '1\\n00:00:01,000 --> 00:00:03,000\\n真机字幕第一句\\n\\n2\\n00:00:05,000 --> 00:00:07,000\\n第二句';
    const blob = new Blob([srt], { type: 'text/plain' });
    const file = new File([blob], 'test.srt', { type: 'text/plain' });
    const n = await SFV.player.loadSubtitle(file);
    t('loadSubtitle 从真实 File 解析出 2 条 cue', n === 2, 'cues=' + n);

    const subEl = document.querySelector('#sfv-overlay .sfv-subtitle');
    t('.sfv-subtitle DOM 已挂载到 #sfv-overlay', !!subEl);
    const cs = subEl ? getComputedStyle(subEl) : null;
    t('player.css 中 .sfv-subtitle 样式已生效（position:absolute）', !!cs && cs.position === 'absolute', cs && cs.position);
    t('.sfv-subtitle 不拦截鼠标（pointer-events:none）', !!cs && cs.pointerEvents === 'none', cs && cs.pointerEvents);

    const v = SFV.player.getVideoEl();
    const rend = SFV.player.getSubtitleRenderer();
    rend.update(2);
    t('真实 DOM 中字幕文本渲染正确(t=2)', subEl.textContent === '真机字幕第一句', JSON.stringify(subEl.textContent));
    rend.update(4);
    t('空档期字幕隐藏(t=4)', getComputedStyle(subEl).display === 'none');
    rend.update(6);
    t('切换到第二条 cue(t=6)', subEl.textContent === '第二句');

    // 控制条按钮
    const btnTexts = Array.from(document.querySelectorAll('#sfv-overlay .sfv-btn')).map(b => b.textContent);
    t('控制条含「字幕」按钮', btnTexts.indexOf('字幕') >= 0, btnTexts.join('|'));
    t('控制条含连播模式按钮', ['连播','单集循环','不连播'].some(x => btnTexts.indexOf(x) >= 0), btnTexts.join('|'));

    // ---- 连播：真实 <video> ended 事件 ----
    SFV.player.setPlayMode('sequence');
    let nextFired = 0;
    SFV.player.setPlayNext(() => { nextFired++; });
    v.dispatchEvent(new Event('ended'));
    await sleep(20);
    t('真实 video ended 事件驱动连播回调', nextFired === 1, 'fired=' + nextFired);
    t('ended 后钩子自动摘除', SFV.player.hasPlayNext() === false);

    SFV.player.setPlayMode('repeat-one');
    let next2 = 0;
    SFV.player.setPlayNext(() => { next2++; });
    v.currentTime = 0;
    v.dispatchEvent(new Event('ended'));
    await sleep(20);
    t('repeat-one 模式不触发下一集', next2 === 0);
    SFV.player.setPlayMode('sequence');

    // ---- 换片清理（真实路径）----
    await SFV.player.loadSubtitle(file);
    SFV.player.openUrl('http://127.0.0.1:${APP_PORT}/does-not-exist.mp4', { id: 'url:smoke2' });
    t('换片后字幕被清空（真实 DOM）', SFV.player.getSubtitleRenderer().cues.length === 0);
    t('换片后连播钩子被清空', SFV.player.hasPlayNext() === false);

    SFV.player.close();
    t('close() 后播放器关闭', SFV.player.isOpen() === false);
    t('close() 后回到音乐态', SFV.state.getSpace() === 'music');
  } catch (e) {
    R.push({ name: 'UNCAUGHT', ok: false, detail: (e && e.stack) ? e.stack : String(e) });
  }
  return R;
})()`;

async function main() {
  console.log('[smoke] 启动 server.js @ ' + APP_PORT);
  await startAppServer();
  const win = new BrowserWindow({
    show: false, width: 1280, height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: true },
  });
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) console.log('  [renderer] ' + msg);
  });
  const target = 'http://127.0.0.1:' + APP_PORT + '/';
  console.log('[smoke] 加载 ' + target);
  await win.loadURL(target);
  await new Promise(r => setTimeout(r, 2500)); // 等待 index.html 的大量脚本就绪

  const results = await win.webContents.executeJavaScript(RENDERER, true);
  let pass = 0, fail = 0;
  console.log('');
  for (const r of results) {
    if (r.ok) { pass++; console.log('  PASS: ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); }
    else { fail++; console.log('  FAIL: ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); }
  }
  console.log('\n========================================');
  console.log('  真机冒烟: ' + pass + ' pass / ' + fail + ' fail');
  console.log('========================================');
  exitCode = fail ? 1 : 0;
}

app.whenReady()
  .then(main)
  .catch(e => { console.error('[smoke] 失败:', e && e.stack ? e.stack : e); exitCode = 1; })
  .finally(() => {
    try { if (serverProc) serverProc.kill(); } catch (e) {}
    setTimeout(() => app.exit(exitCode), 300);
  });
