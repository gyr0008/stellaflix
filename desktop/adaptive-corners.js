const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const CORNER_RADIUS = 22;

function hwndToHex(win) {
  const handle = win.getNativeWindowHandle();
  if (!Buffer.isBuffer(handle) || handle.length < 1) return null;
  if (handle.length >= 8) {
    const big = handle.readBigUInt64LE(0);
    return '0x' + big.toString(16).padStart(16, '0').toUpperCase();
  }
  return '0x' + handle.readUInt32LE(0).toString(16).padStart(8, '0').toUpperCase();
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}

function runDwmCornerScriptSync(win) {
  if (process.platform !== 'win32') {
    console.warn('adaptive-corners: skipped, platform is', process.platform);
    return { ok: false, reason: 'not-windows' };
  }
  const hwnd = hwndToHex(win);
  if (!hwnd) {
    console.warn('adaptive-corners: failed to read native window handle');
    return { ok: false, reason: 'no-hwnd' };
  }
  const scriptPath = path.join(__dirname, 'disable-dwm-rounding.ps1');
  try {
    const result = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-HwndHex', hwnd,
    ], { windowsHide: true, timeout: 10000, encoding: 'utf8' });
    if (result.error) {
      console.warn('adaptive-corners: DWM PowerShell spawn error:', result.error.message);
      return { ok: false, reason: 'spawn-error', detail: result.error.message };
    }
    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();
    const parsed = safeParseJson(stdout);
    if (result.status !== 0) {
      const detail = parsed || { stdout: stdout.slice(0, 300), stderr: stderr.slice(0, 300), exitCode: result.status };
      console.warn('adaptive-corners: DWM PowerShell failed:', JSON.stringify(detail));
      return { ok: false, reason: 'dwm-script-failed', detail };
    }
    console.log('adaptive-corners: DWM PowerShell success:', JSON.stringify(parsed || stdout));
    return { ok: true, detail: parsed };
  } catch (e) {
    console.warn('adaptive-corners: DWM PowerShell exception:', e.message);
    return { ok: false, reason: 'exception', detail: e.message };
  }
}

function sendState(win, extra = {}) {
  if (!win || win.isDestroyed() || !win.webContents) return;
  const maximized = win.isMaximized();
  const fullscreen = win.isFullScreen();
  win.webContents.send('adaptive-corners:state', {
    maximized,
    fullscreen,
    rounded: !(maximized || fullscreen),
    radius: CORNER_RADIUS,
    ...extra,
  });
}

function sendFallback(win, dwmResult) {
  if (!win || win.isDestroyed() || !win.webContents) return;
  win.webContents.send('adaptive-corners:fallback', {
    enabled: true,
    reason: dwmResult.reason || 'unknown',
    detail: dwmResult.detail,
    platform: process.platform,
    osRelease: os.release(),
  });
}

function applyAdaptiveCorners(win, opts = {}) {
  if (!win || win.isDestroyed()) return;

  // 1) Windows 11：同步调用 DWM API 禁用系统强制圆角。
  //    在窗口显示前调用一次（最佳努力），显示后再调用一次确保生效。
  const dwmResult = runDwmCornerScriptSync(win);
  if (!dwmResult.ok) {
    console.warn('adaptive-corners: DWM pre-show call failed, will retry after show');
  }

  // 2) 同步窗口状态给渲染进程，用于 CSS 圆角/释放/遮罩。
  const update = (extra = {}) => sendState(win, { dwmOk: dwmResult.ok, ...extra });
  win.on('maximize', () => update());
  win.on('unmaximize', () => update());
  win.on('enter-full-screen', () => update());
  win.on('leave-full-screen', () => update());
  win.on('resize', () => update());

  function publishResult() {
    if (!win || win.isDestroyed() || !win.webContents) return;
    if (dwmResult.ok) {
      update();
    } else {
      sendFallback(win, dwmResult);
      update();
    }
  }

  if (opts.publish !== false) {
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', publishResult);
    } else {
      publishResult();
    }
  }

  return dwmResult;
}

function reapplyAfterShow(win) {
  if (!win || win.isDestroyed()) return;
  // 窗口显示后 DWM 已分配好实际几何，再次调用成功率更高。
  const dwmResult = runDwmCornerScriptSync(win);
  if (!dwmResult.ok) {
    console.warn('adaptive-corners: DWM post-show retry failed:', JSON.stringify(dwmResult));
    sendFallback(win, dwmResult);
  } else {
    console.log('adaptive-corners: DWM post-show retry success');
  }
  sendState(win, { dwmOk: dwmResult.ok, postShowRetry: true });
  return dwmResult;
}

module.exports = { applyAdaptiveCorners, reapplyAfterShow, CORNER_RADIUS };
