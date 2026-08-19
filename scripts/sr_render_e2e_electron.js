/*
 * 影视 SR — 渲染管线端到端实测（无头 Electron + SwiftShader WebGL2）。
 * 与 sr_shader_compile_electron.js（只验编译）互补，本脚本验证真实执行：
 *   A. Anime4K 质量档全链渲染（含无 VBO 全屏三角、planPasses 规划、FBO 链），
 *      中心像素非黑、无 GL 错误、输出与直出基线存在像素差异（证明滤镜真实生效，非直通空壳）。
 *   B. 输出不足 1.2× 源时（WHEN 全跳过）仍正常出图（边界情况：零开销直出路径）。
 *   C. FSRCNNX luma 链（亮度抽取 → 14 pass → 增量重建）与 live 档（+refine）渲染成功。
 * 运行：npx electron scripts/sr_render_e2e_electron.js （exit 0 = 全部通过）
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
    const out = { scenes: [], ok: false };

    // 伪视频：四象限非对称内容（左上红亮/右上蓝亮/左下红暗/右下蓝暗 + 网格线供卷积响应）
    // 用于回归检测画面方向：上下倒置 / 左右镜像都会被四象限断言抓住
    const VW = 320, VH = 180;
    const vc = document.createElement('canvas');
    vc.width = VW; vc.height = VH;
    const c2 = vc.getContext('2d');
    c2.fillStyle = '#d04040'; c2.fillRect(0, 0, VW / 2, VH / 2);          // 左上：红·亮
    c2.fillStyle = '#4040d0'; c2.fillRect(VW / 2, 0, VW / 2, VH / 2);      // 右上：蓝·亮
    c2.fillStyle = '#301010'; c2.fillRect(0, VH / 2, VW / 2, VH / 2);      // 左下：红·暗
    c2.fillStyle = '#101030'; c2.fillRect(VW / 2, VH / 2, VW / 2, VH / 2); // 右下：蓝·暗
    c2.strokeStyle = 'rgba(255,255,255,.5)'; c2.lineWidth = 1;
    for (let x = 0; x < VW; x += 8) { c2.beginPath(); c2.moveTo(x, 0); c2.lineTo(x, VH); c2.stroke(); }
    Object.defineProperty(vc, 'videoWidth', { value: VW });
    Object.defineProperty(vc, 'videoHeight', { value: VH });

    // 显示画布（挂 DOM 才有 clientWidth/Height）
    const dc = document.createElement('canvas');
    dc.style.position = 'fixed'; dc.style.left = '0'; dc.style.top = '0';
    document.body.appendChild(dc);
    const core = SFV.srCore.createCore(dc);
    if (!core) { out.scenes.push({ name: 'init', fail: 'WebGL2 不可用' }); return out; }
    const gl = core.gl;
    const st = SFV.srEngine._state;
    st.core = core; st.canvas = dc; st.videoEl = vc;

    // NaN 检测：所有 vec2 uniform 必须有限（真机 D3D11 对 NaN 坐标输出渲染垃圾——
    // 2026-08-16 「table.h」typo 事故的教训，SwiftShader 对 NaN 宽容故必须显式检测）
    const nanUniforms = [];
    const origDraw = core.drawPass;
    core.drawPass = function (prog, samplers, vec2s, target, vp) {
      for (const k of Object.keys(vec2s || {})) {
        const v = vec2s[k];
        if (!Array.isArray(v) || !isFinite(v[0]) || !isFinite(v[1])) nanUniforms.push(k);
      }
      return origDraw.call(core, prog, samplers, vec2s, target, vp);
    };

    function files(names) { return names.map(n => ({ name: n, text: window.__SR_FILES[n] })); }
    function readCenterStats() {
      const W = dc.width, H = dc.height;
      const px = new Uint8Array(4 * 64);
      gl.readPixels(Math.floor(W / 2) - 4, Math.floor(H / 2) - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, min = 255, max = 0;
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        sum += l; if (l < min) min = l; if (l > max) max = l;
      }
      return { mean: +(sum / 64).toFixed(2), min: +min.toFixed(1), max: +max.toFixed(1) };
    }
    // 四象限采样（readPixels 行 0 = canvas 底部；屏幕左上 = y=H-S 附近）
    function readQuads() {
      const W = dc.width, H = dc.height, S = 20;
      function px(x, y) {
        const b = new Uint8Array(4 * S * S);
        gl.readPixels(x, y, S, S, gl.RGBA, gl.UNSIGNED_BYTE, b);
        let r = 0, g = 0, bl = 0;
        for (let i = 0; i < b.length; i += 4) { r += b[i]; g += b[i + 1]; bl += b[i + 2]; }
        const n = S * S;
        return { r: +(r / n).toFixed(1), g: +(g / n).toFixed(1), b: +(bl / n).toFixed(1) };
      }
      const m = 8;
      return { TL: px(m, H - S - m), TR: px(W - S - m, H - S - m), BL: px(m, m), BR: px(W - S - m, m) };
    }
    const luma = q => 0.299 * q.r + 0.587 * q.g + 0.114 * q.b;
    // 方向断言：上半亮下半暗（Y 不倒置，倒置时 gap ≈ -60+）；左半偏红右半偏蓝（X 不镜像）。
    // 滤镜会压缩纯色象限对比度（实测 gap 8~26），阈值取 5：正负号判定方向、幅值只求显著。
    function orientationOk(q) {
      const top = (luma(q.TL) + luma(q.TR)) / 2;
      const bottom = (luma(q.BL) + luma(q.BR)) / 2;
      const leftRed = (q.TL.r - q.TL.b) + (q.BL.r - q.BL.b);
      const rightBlue = (q.TR.b - q.TR.r) + (q.BR.b - q.BR.r);
      return { topBottomGap: +(top - bottom).toFixed(1), leftRed: +leftRed.toFixed(1), rightBlue: +rightBlue.toFixed(1),
        pass: (top - bottom) > 5 && leftRed > 60 && rightBlue > 60 };
    }
    function runScene(name, preset, cssW, cssH) {
      dc.style.width = cssW + 'px'; dc.style.height = cssH + 'px';
      st.preset = preset; st.sig = ''; st.activePlan = null;
      SFV.srEngine.compileChain();
      SFV.srEngine.renderFrame();
      const err = gl.getError();
      const plan = st.activePlan ? st.activePlan.length : -1;
      const orient = orientationOk(readQuads());
      return { name, plan, glError: err, center: readCenterStats(), orientation: orient };
    }

    // 基线：空链（blit 直出）
    const base = runScene('baseline-blit', { id: 'baseline', mode: 'rgb', files: [] }, 692, 389);

    // A. Anime4K 质量档（输出 ≈2.16× 源，WHEN 全过）
    const a4kHQ = { id: 'anime-hq', mode: 'rgb', files: files(['Anime4K_Clamp_Highlights.glsl', 'Anime4K_Restore_CNN_M.glsl', 'Anime4K_Upscale_CNN_x2_M.glsl']) };
    const sceneA = runScene('anime-hq-2.16x', a4kHQ, 692, 389);

    // B. 输出 = 源（1.0×，Anime4K WHEN 全跳过；Clamp 三 pass 无 WHEN 仍执行）
    const sceneB = runScene('anime-hq-1.0x-skip', a4kHQ, 320, 180);

    // C. FSRCNNX luma 链 + live 档 refine
    const sceneC = runScene('fsrcnnx-luma', { id: 'fsrcnnx', mode: 'luma', files: files(['FSRCNNX_x2_8-0-4-1.glsl']) }, 692, 389);
    const sceneD = runScene('live-luma-refine', { id: 'live', mode: 'luma', refine: true, files: files(['FSRCNNX_x2_8-0-4-1.glsl']) }, 692, 389);

    out.scenes.push(base, sceneA, sceneB, sceneC, sceneD);
    // 判定：全场景无 GL 错误、出图非黑、方向正确（Y 不倒置 / X 不镜像）；
    // A 与基线像素均值存在差异（滤镜真实生效，非直通空壳）
    const noErr = out.scenes.every(s => s.glError === 0);
    const notBlack = out.scenes.every(s => s.center.mean > 5);
    const oriented = out.scenes.every(s => s.orientation.pass);
    const changed = Math.abs(sceneA.center.mean - base.center.mean) > 0.5 || sceneA.center.max !== base.center.max;
    out.assertions = { noErr, notBlack, orientation: oriented, filterChangedOutput: changed,
      nanFree: nanUniforms.length === 0, nanUniforms: nanUniforms.slice(0, 8) };
    out.ok = noErr && notBlack && oriented && changed && nanUniforms.length === 0;
    return out;
  })()`, true);

  console.log(JSON.stringify(report, null, 2));
  console.log(report && report.ok ? '[SR-RENDER-E2E] 全部通过' : '[SR-RENDER-E2E] 存在失败');
  app.exit(report && report.ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
