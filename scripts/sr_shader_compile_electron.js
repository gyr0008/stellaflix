/*
 * 影视 SR — GLSL 真实编译 smoke（无头 Electron + SwiftShader WebGL2）。
 * 目的：在不依赖真机 GUI 的前提下，验证 sr-hook-adapter 生成的全部 fragment shader
 *       能通过 WebGL2 编译/链接（覆盖 9 个 vendor 文件的全部 pass + 引擎内建 4 个 shader）。
 * 运行：npx electron scripts/sr_shader_compile_electron.js  （exit 0 = 全部通过）
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const ROOT = path.join(__dirname, '..');
const SR_DIR = path.join(ROOT, 'public', 'video', 'sr');
const GLSL_DIR = path.join(ROOT, 'public', 'vendor', 'sr', 'glsl');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: false, contextIsolation: false, nodeIntegration: false }
  });
  await win.loadURL('about:blank');

  for (const f of ['sr-hook-adapter.js', 'sr-engine-core.js', 'sr-engine.js', 'sr-presets.js']) {
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(SR_DIR, f), 'utf8'), true);
  }
  const glsl = {};
  fs.readdirSync(GLSL_DIR).forEach((n) => { glsl[n] = fs.readFileSync(path.join(GLSL_DIR, n), 'utf8'); });
  await win.webContents.executeJavaScript('window.__SR_FILES = ' + JSON.stringify(glsl), true);

  const report = await win.webContents.executeJavaScript(`(async () => {
    const SFV = window.StellaflixVideo;
    const out = { webgl2: false, float16: false, compiled: 0, compileFail: [], internalFail: [], ok: false };
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return out;
    out.webgl2 = true;
    out.float16 = !!gl.getExtension('EXT_color_buffer_float');
    const core = SFV.srCore.createCore(canvas);
    if (!core) return out;
    for (const name of Object.keys(window.__SR_FILES)) {
      const passes = SFV.srHook.parseShader(window.__SR_FILES[name]);
      for (let i = 0; i < passes.length; i++) {
        const ps = passes[i];
        const hookReal = (ps.hook === 'PREKERNEL' || ps.hook === 'MAIN') ? 'MAIN' : ps.hook;
        const realNames = hookReal === 'LUMA' ? ['MAIN', 'NATIVE', 'LUMA'] : ['MAIN', 'NATIVE'];
        const src = SFV.srHook.buildFragment(ps, realNames, { HOOKED: hookReal });
        try { core.getProgram(src); out.compiled++; }
        catch (e) { out.compileFail.push(name + '#pass' + i + ' [' + (ps.desc || ps.hook) + ']: ' + String(e && e.message).slice(0, 260)); }
      }
    }
    for (const k of ['LUMA_FS', 'RECOMBINE_FS', 'REFINE_FS', 'BLIT_FS']) {
      try { core.getProgram(SFV.srEngine[k]); out.compiled++; }
      catch (e) { out.internalFail.push(k + ': ' + String(e && e.message).slice(0, 260)); }
    }
    out.ok = out.compileFail.length === 0 && out.internalFail.length === 0;
    return out;
  })()`, true);

  console.log(JSON.stringify(report, null, 2));
  const ok = report && report.ok;
  console.log(ok ? '[SR-COMPILE-SMOKE] 全部通过' : '[SR-COMPILE-SMOKE] 存在编译失败');
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
