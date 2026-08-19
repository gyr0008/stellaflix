/**
 * T154 主窗口圆角：OS 级实现（权威方案 = setShape）
 *
 * 关键认知：本窗口是 transparent:true + frame:false（无边框分层透明窗）。
 * Windows 11 的 DWMWA_WINDOW_CORNER_PREFERENCE 只圆「不透明窗口边框」，
 * 对这种无边框透明窗不可靠（边框不存在 → 圆角不生效），故 DWM 仅作可选实验，
 * 默认关闭。真正可靠的 OS 级圆角是 BrowserWindow.setShape()：直接用扫描线
 * 圆角矩形裁剪窗口可见/命中区域，四角外像素被 OS 裁掉 → 透明，与页面画什么都无关。
 * 坐标用逻辑像素（DIP），与既有 desktop-icon-shape-runtime.js 的 setShape 用法一致。
 *
 * - 默认：setShape 圆角矩形（Win10/Win11 通用，transparent 窗已实证可用）。
 * - 可选 opts.dwm:true：额外尝试 DWM ROUND（仅 Windows 11，且仍会以 setShape 兜底）。
 * - 最大化/全屏：setShape([]) 释放，恢复矩形窗口。
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const DEFAULT_RADIUS = 34;
const DWMPREF_DEFAULT = 0;
const DWMPREF_DONOTROUND = 1;
const DWMPREF_ROUND = 2;
const DWMPREF_ROUNDSMALL = 3;

// 协作锁：全桌面模式（FullDesktopModeRuntime）会把同一主窗口重父化到桌面，并用
// setShape() 挖出桌面图标洞。两个 feature 共用同一个 HWND 的 setShape，会互相覆盖，
// 因此桌面模式激活期间本模块必须完全交出 setShape 控制权。由 main.js 在其
// onStatus(iconShapeActive) 回调里调用 setCornerShapeLocked(true/false) 协调。
let shapeLocked = false;
function setCornerShapeLocked(value) {
  shapeLocked = value === true;
  return shapeLocked;
}

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

function runDwmPreferenceScriptSync(win, preference) {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows' };
  }
  const hwnd = hwndToHex(win);
  if (!hwnd) {
    return { ok: false, reason: 'no-hwnd' };
  }
  const scriptPath = path.join(__dirname, 'dwm-corner-preference.ps1');
  try {
    const result = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-HwndHex', hwnd,
      '-Preference', String(preference),
    ], { windowsHide: true, timeout: 10000, encoding: 'utf8' });
    if (result.error) {
      return { ok: false, reason: 'spawn-error', detail: result.error.message };
    }
    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();
    const parsed = safeParseJson(stdout);
    if (result.status !== 0) {
      const detail = parsed || { stdout: stdout.slice(0, 300), stderr: stderr.slice(0, 300), exitCode: result.status };
      return { ok: false, reason: 'dwm-script-failed', detail };
    }
    return { ok: true, detail: parsed };
  } catch (e) {
    return { ok: false, reason: 'exception', detail: e.message };
  }
}

function isWindows11OrNewer() {
  if (process.platform !== 'win32') return false;
  const parts = String(os.release() || '').split('.');
  const major = parseInt(parts[0], 10) || 0;
  const build = parseInt(parts[2], 10) || 0;
  return major > 10 || (major === 10 && build >= 22000);
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function outwardIntegerRect(value) {
  if (!value || typeof value !== 'object') return null;
  const x = finiteNumber(value.x, NaN);
  const y = finiteNumber(value.y, NaN);
  const width = finiteNumber(value.width, NaN);
  const height = finiteNumber(value.height, NaN);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.ceil(x + width);
  const bottom = Math.ceil(y + height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function computeRoundedRectShape(width, height, radius) {
  const W = Math.max(0, Math.round(width));
  const H = Math.max(0, Math.round(height));
  const r = Math.max(0, Math.min(Math.floor(Math.min(W, H) / 2), Math.round(radius)));
  if (W <= 0 || H <= 0) return [];
  if (r <= 0) return [{ x: 0, y: 0, width: W, height: H }];

  const strips = [];
  let current = null;

  function insetAt(y) {
    if (y < r) {
      const t = r - y;
      return r - Math.sqrt(Math.max(0, r * r - t * t));
    }
    if (y > H - r) {
      const t = y - (H - r);
      return r - Math.sqrt(Math.max(0, r * r - t * t));
    }
    return 0;
  }

  for (let y = 0; y < H; y += 1) {
    const inset = insetAt(y + 0.5);
    const left = Math.ceil(inset);
    const right = Math.floor(W - inset);
    const width2 = Math.max(0, right - left);
    if (!current || current.x !== left || current.width !== width2) {
      if (current) strips.push(current);
      current = { x: left, y, width: width2, height: 1 };
    } else {
      current.height += 1;
    }
  }
  if (current) strips.push(current);

  // Coalesce: merge strips that share same x/width and are adjacent vertically
  const merged = [];
  for (const strip of strips) {
    const prev = merged[merged.length - 1];
    if (prev && prev.x === strip.x && prev.width === strip.width && prev.y + prev.height === strip.y) {
      prev.height += strip.height;
    } else {
      merged.push({ ...strip });
    }
  }
  return merged.filter((rect) => rect.width > 0 && rect.height > 0);
}

function applySetShapeRounded(win, radius) {
  if (!win || typeof win.setShape !== 'function') {
    return { ok: false, reason: 'setShape-unavailable' };
  }
  try {
    const bounds = win.getBounds();
    const rects = computeRoundedRectShape(bounds.width, bounds.height, radius);
    const normalized = rects.map(outwardIntegerRect).filter(Boolean);
    win.setShape(normalized);
    return { ok: true, method: 'setShape', rectCount: normalized.length };
  } catch (e) {
    return { ok: false, reason: 'setShape-error', detail: e.message };
  }
}

function clearShape(win) {
  if (!win || typeof win.setShape !== 'function') return { ok: false, reason: 'setShape-unavailable' };
  try {
    win.setShape([]);
    return { ok: true, method: 'setShape', cleared: true };
  } catch (e) {
    return { ok: false, reason: 'setShape-clear-error', detail: e.message };
  }
}

function applyRoundedCorners(win, opts = {}) {
  if (!win || win.isDestroyed()) return { ok: false, reason: 'invalid-window' };
  if (shapeLocked) return { ok: false, reason: 'locked-by-desktop-mode' };
  const radius = finiteNumber(opts.radius, DEFAULT_RADIUS);

  // 可选实验：DWM 窗口圆角偏好（仅 Windows 11）。注意：对 transparent/frameless
  // 窗不可靠，所以默认不启用；即使启用也只是锦上添花，下面 setShape 才是权威裁剪。
  if (opts.dwm === true && isWindows11OrNewer()) {
    const dwmResult = runDwmPreferenceScriptSync(win, DWMPREF_ROUND);
    if (!dwmResult.ok && opts.onLog) {
      opts.onLog('[window-corner-shape] DWM preference failed (ignored, using setShape):', dwmResult.reason);
    }
  }

  // 权威圆角：用 setShape 把 OS 窗口区域裁成圆角矩形。对透明窗通用且已实证可用。
  if (opts.fallback !== false) {
    return applySetShapeRounded(win, radius);
  }
  return { ok: false, reason: 'fallback-disabled' };
}

function releaseRoundedCorners(win, opts = {}) {
  if (!win || win.isDestroyed()) return { ok: false, reason: 'invalid-window' };
  if (shapeLocked) return { ok: false, reason: 'locked-by-desktop-mode' };
  if (opts.dwm === true && isWindows11OrNewer()) {
    // 仅当显式启用 DWM 时才复位其偏好，恢复矩形窗口的默认行为。
    runDwmPreferenceScriptSync(win, DWMPREF_DEFAULT);
  }
  if (typeof win.setShape === 'function') {
    return clearShape(win);
  }
  return { ok: true, method: 'none' };
}

function isWindowRoundedState(win) {
  if (!win || win.isDestroyed()) return { rounded: false };
  return {
    rounded: !(win.isMaximized() || win.isFullScreen()),
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen(),
  };
}

function bindWindowCornerShape(win, opts = {}) {
  if (!win || win.isDestroyed() || process.platform !== 'win32') return null;
  const radius = finiteNumber(opts.radius, DEFAULT_RADIUS);
  let debounceTimer = null;

  function apply() {
    const state = isWindowRoundedState(win);
    if (state.rounded) {
      const result = applyRoundedCorners(win, { radius, dwm: opts.dwm, fallback: opts.fallback });
      if (opts.onLog || (typeof console !== 'undefined' && console.log)) {
        const log = opts.onLog || console.log;
        log('[window-corner-shape] apply:', JSON.stringify(result));
      }
    } else {
      const result = releaseRoundedCorners(win, { dwm: opts.dwm });
      if (opts.onLog || (typeof console !== 'undefined' && console.log)) {
        const log = opts.onLog || console.log;
        log('[window-corner-shape] release:', JSON.stringify(result));
      }
    }
  }

  function debouncedApply() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      apply();
    }, 50);
  }

  // ready-to-show 让形状在页面加载期就生效（避免首帧方角闪现）；
  // show/restore 覆盖窗口延迟显示或恢复场景；maximize/fullscreen/resize 控制释放与重裁。
  const events = ['ready-to-show', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'resize', 'show', 'restore'];
  for (const event of events) {
    win.on(event, debouncedApply);
  }

  // 初始应用：setShape 设定窗口区域，与窗口是否可见无关，故无条件尝试一次；
  // 若此时窗口尚未真正显示，ready-to-show/show 会再次校正。
  setTimeout(apply, 100);

  return {
    apply,
    release: () => releaseRoundedCorners(win, { dwm: opts.dwm }),
    dispose: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const event of events) {
        win.removeListener(event, debouncedApply);
      }
    },
  };
}

module.exports = {
  bindWindowCornerShape,
  applyRoundedCorners,
  releaseRoundedCorners,
  computeRoundedRectShape,
  setCornerShapeLocked,
  DEFAULT_RADIUS,
};
