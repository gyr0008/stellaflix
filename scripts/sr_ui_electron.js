/*
 * 影视 SR — UI 冒烟实测（无头 Electron DOM 级）。
 * 验证 sr-ui.js 真实行为：菜单开合、档位行数、点击应用、localStorage 持久化、
 * toast 提示、自动降档回调链路（engine.onDegrade → apply 降档）。
 * shader 文本经 stub fetch 从磁盘注入（真实文件内容，产品代码不改）。
 * 运行：npx electron scripts/sr_ui_electron.js （exit 0 = 全部通过）
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');

const ROOT = path.join(__dirname, '..');
const SR_DIR = path.join(ROOT, 'public', 'video', 'sr');
const GLSL_DIR = path.join(ROOT, 'public', 'vendor', 'sr', 'glsl');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: false, contextIsolation: false, nodeIntegration: false }
  });
  // about:blank 拒绝 localStorage，改用临时 file:// 页面
  const tmpPage = path.join(require('os').tmpdir(), 'sr_ui_smoke_page.html');
  fs.writeFileSync(tmpPage, '<!doctype html><html><body></body></html>');
  await win.loadURL('file:///' + tmpPage.replace(/\\/g, '/'));

  // stub fetch：拦截 vendor/sr/glsl/* 返回磁盘真实内容（about:blank 无源，相对 fetch 不可用）
  const glslJson = {};
  fs.readdirSync(GLSL_DIR).forEach((n) => { glslJson[n] = fs.readFileSync(path.join(GLSL_DIR, n), 'utf8'); });
  await win.webContents.executeJavaScript(
    'window.fetch = (url) => Promise.resolve({ ok: true, text: () => Promise.resolve(window.__GLSL[url.split("/").pop()] || "") });' +
    'window.__GLSL = ' + JSON.stringify(glslJson) + ';', true);

  // stub player（engine 取 videoEl 用）；尾加 null 避免返回含函数对象（IPC 不可克隆）
  await win.webContents.executeJavaScript(
    'window.StellaflixVideo = { player: { getVideoEl: () => null } }; null;', true);

  for (const f of ['sr-hook-adapter.js', 'sr-engine-core.js', 'sr-engine.js', 'sr-presets.js', 'sr-ui.js']) {
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(SR_DIR, f), 'utf8'), true);
  }

  const report = await win.webContents.executeJavaScript(`(async () => {
    const out = { steps: [], ok: false };
    try {
    const SFV = window.StellaflixVideo;
    const step = (name, pass, detail) => { out.steps.push({ name, pass: !!pass, detail: detail || '' }); };

    // 造锚点按钮与 overlay 容器
    const overlay = document.createElement('div'); overlay.id = 'sfv-overlay'; document.body.appendChild(overlay);
    const btn = document.createElement('button'); btn.id = 'sfv-ctrl-quality'; document.body.appendChild(btn);
    await new Promise(r => setTimeout(r, 0));

    localStorage.removeItem('stellaflix-video-sr');

    // 1. 打开菜单
    SFV.srUi.toggleMenu();
    const pop = document.getElementById('sfv-sr-popover');
    step('菜单打开', !!pop);
    const items = pop ? pop.querySelectorAll('.sfv-sr-item:not(.sfv-sr-toggle)') : [];
    step('6 个档位行', items.length === 6, 'count=' + items.length);
    step('含自动降档开关', !!pop.querySelector('.sfv-sr-toggle'));
    step('含统计行', !!pop.querySelector('.sfv-sr-stats'));

    // 2. 点击「通用 · FSRCNNX」→ 应用 + 持久化
    const target = Array.from(items).find(i => i.textContent.includes('通用'));
    target.click();
    await new Promise(r => setTimeout(r, 50));
    const saved = JSON.parse(localStorage.getItem('stellaflix-video-sr') || '{}');
    step('localStorage 持久化 fsrcnnx', saved.preset === 'fsrcnnx');
    step('引擎装载 preset', SFV.srEngine._state.presetId === 'fsrcnnx', 'presetId=' + SFV.srEngine._state.presetId);
    step('引擎链已编译', !!(SFV.srEngine._state.parsed && SFV.srEngine._state.parsed.passes.length === 14),
      'passes=' + (SFV.srEngine._state.parsed ? SFV.srEngine._state.parsed.passes.length : -1));
    step('toast 出现', !!document.getElementById('sfv-sr-toast'));
    step('菜单已关闭', !document.getElementById('sfv-sr-popover'));
    step('按钮 sr-on 指示', btn.classList.contains('sr-on'));

    // 3. 自动降档链路：触发 degradeCb（渲染 50ms/帧，从 fsrcnnx 降 → off）
    SFV.srEngine._state.degradeCb(50, 'fsrcnnx');
    await new Promise(r => setTimeout(r, 50));
    const saved2 = JSON.parse(localStorage.getItem('stellaflix-video-sr') || '{}');
    step('自动降档 fsrcnnx→off', saved2.preset === 'off', 'saved=' + saved2.preset);
    const toastText = (document.getElementById('sfv-sr-toast') || {}).textContent || '';
    step('降档文案含来源档', toastText.includes('FSRCNNX'), toastText.slice(0, 40));

    // 4. 关闭档位按钮指示复位
    step('按钮指示复位', !btn.classList.contains('sr-on'));

    out.ok = out.steps.every(s => s.pass);
    } catch (e) { out.fatal = String((e && e.stack) || e); }
    return out;
  })()`, true);

  console.log(JSON.stringify(report, null, 2));
  console.log(report && report.ok ? '[SR-UI-SMOKE] 全部通过' : '[SR-UI-SMOKE] 存在失败');
  app.exit(report && report.ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
