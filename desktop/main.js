const { app, BrowserWindow, ipcMain, shell, screen, session, globalShortcut, dialog, protocol, desktopCapturer } = require('electron');
const os = require('os');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { DesktopWallpaperRuntime } = require('./wallpaper-mode-runtime');
const { FullDesktopModeRuntime } = require('./full-desktop-mode-runtime');
// T144 adaptive-corners（禁用 DWM 圆角 + CSS 兜底）已弃用；T154 改用 OS 级强制圆角。
const { bindWindowCornerShape, setCornerShapeLocked } = require('./window-corner-shape');
// T154：主窗口圆角绑定句柄（全桌面模式 onStatus 退出后需重新 apply 圆角）。
let mainWindowCornerShape = null;

const { WallpaperEngineLibrary, registerWallpaperEngineScheme } = require('./wallpaper-engine-library');
// 2026-08-16: Wallpaper Engine 默认完全禁用，避免某些壁纸触发 GPU/解码崩溃导致 Stellaflix 闪屏/卡顿。
// 只有显式设置 STELLAFLIX_ENABLE_WALLPAPER=1 且未设置 STELLAFLIX_DISABLE_WALLPAPER=1 时才启用。
const WALLPAPER_ENGINE_ENABLED = process.env.STELLAFLIX_ENABLE_WALLPAPER === '1'
  && process.env.STELLAFLIX_DISABLE_WALLPAPER !== '1';
const WallpaperEngineRuntime = WALLPAPER_ENGINE_ENABLED
  ? require('./wallpaper-engine-runtime').WallpaperEngineRuntime
  : null;
// 预注册 Wallpaper Engine 媒体 scheme（必须在 app ready 之前完成；禁用时跳过）。
if (WALLPAPER_ENGINE_ENABLED) registerWallpaperEngineScheme(protocol);

const { CustomSourceManager } = require('./custom-source/manager');
const { CustomSourceAudioProxy } = require('./custom-source/audio-proxy');
const { MAX_SCRIPT_BYTES } = require('./custom-source/store');
const localMusic = require('./local-music');
const { sniffBestMediaUrl } = require('./embed-sniffer');

let mainWindow = null;
let localServer = null;
let mainServerPort = 0;
let customSourceManager = null;
let customSourceAudioProxy = null;
let desktopLyricsWindow = null;
let desktopLyricsState = {};
let desktopLyricsUserBounds = null;
let desktopLyricsProgrammaticMove = false;
let desktopLyricsPointerCapture = false;
let desktopLyricsMouseIgnored = null;
let desktopLyricsMousePoller = null;
let desktopLyricsMousePollerBuffer = '';
let desktopLyricsHotBounds = null;
let desktopLyricsLastMiddleAt = 0;
let wallpaperRuntime = null;
let fullDesktopModeRuntime = null;
let fullDesktopEscapeRegistered = false;
let fullDesktopEscapeExitPending = false;
let fullDesktopNativeTemp = '';
let htmlFullscreenActive = false;
let windowFullscreenActive = false;
let mainWindowStateTimer = null;
const registeredGlobalHotkeys = new Map();

const WINDOWED_ASPECT = 16 / 9;
const WINDOWED_SCALE = 3 / 4;
const WINDOWED_MARGIN = 32;
const MIN_WINDOWED_WIDTH = 960;
const MIN_WINDOWED_HEIGHT = 540;
const APP_NAME = 'Stellaflix';
const APP_USER_MODEL_ID = 'com.stellaflix.desktop';
const APP_ICON_ICO = path.join(__dirname, '..', 'build', 'icon.ico');
const NETEASE_LOGIN_PARTITION = 'persist:stellaflix-netease-login';
const NETEASE_LOGIN_URL = 'https://music.163.com/#/login';
const QQ_LOGIN_PARTITION = 'persist:stellaflix-qqmusic-login';
const QQ_LOGIN_URL = 'https://y.qq.com/portal/pop_login.html';

const CHROMIUM_PERFORMANCE_SWITCHES = [
  ['autoplay-policy', 'no-user-gesture-required'],
  // 2026-08-16 修复：恢复仓库出厂 GPU 调优开关。最初因损坏的 electron 二进制
  // (V8 snapshot 缺失, 表现为启动崩溃) 被误判为开关所致而注释；实测崩溃 100% 源于
  // 二进制损坏，与开关无关。本机默认硬件合成路径对 transparent 窗口 + 透明 WebGL
  // 画布渲染异常（home 页 3D 墙闪烁/黑屏、满铺画布逃逸 html 圆角裁剪导致窗口变矩形），
  // 需锁定正确硬件后端。use-angle=d3d11 稳定 Windows WebGL 透明合成。
  // T151：圆角矩形窗口根因复盘——方角非 GPU 开关所致，而是 index.html 的
  // #desktop-window-shell 缺少 transform:translateZ(0)+will-change（失去对 fixed 满铺层
  // 的包含块地位），导致 shell 的 clip-path 裁不到 GPU 合成的 #canvas-container/#custom-bg。
  // 现还原 enable-zero-copy + enable-oop-rasterization 以对齐 2.1.0（其在本机验证可正常圆角，
  // 故 flicker/瓦片内存 concern 实为损坏二进制残留，非开关本身）。force_high_performance_gpu
  // 保持 opt-in（env 门控），避免部分驱动崩溃。
  ['ignore-gpu-blocklist'],
  ['enable-gpu-rasterization'],
  ['enable-oop-rasterization'],
  ['enable-zero-copy'],
  ['enable-accelerated-2d-canvas'],
  ['disable-background-timer-throttling'],
  ['disable-renderer-backgrounding'],
  ['disable-backgrounding-occluded-windows'],
  ['use-angle', 'd3d11'],
  // T142：提升/限制 Chromium 瓦片内存预算，缓解透明窗口 + 多层全屏合成层下的
  // tile memory limits exceeded 刷屏与部分区域不绘制。
  ['force-gpu-mem-available-mb', '4096'],
  ['max-tiles-for-interest-area', '512'],
  ['disable-gpu-memory-buffer-video-frames'],
  ['enable-begin-frame-scheduling'],
  // T142（续·闪屏/黑屏专项）：透明窗口在 Windows 下的合成不稳定是「闪屏/黑屏/卡顿」
  // 的另一根因（与 tile memory 相互独立，音乐态也存在）。两开关均为 Windows 透明窗口
  // 已知缓解项，低风险、无破坏性：
  // --wm-window-animations-disabled：禁用 DWM 窗口动画，避免透明窗口合成层与系统动画争抢
  //   导致的闪烁（CSDN/ewbang 多例确认 transparent:true 窗口隐藏再显示即闪）。
  // --disable-features=CalculateNativeWinOcclusion：关闭原生窗口遮挡检测，防止窗口被其他
  //   窗口覆盖或切态时被 Chromium 判为 occluded 而停止渲染 → 黑屏（markaicode 实测）。
  ['wm-window-animations-disabled'],
  ['disable-features', 'CalculateNativeWinOcclusion'],
];
for (const [name, value] of CHROMIUM_PERFORMANCE_SWITCHES) {
  if (value == null) app.commandLine.appendSwitch(name);
  else app.commandLine.appendSwitch(name, value);
}
const gotSingleInstanceLock = app.requestSingleInstanceLock();

const QQ_LOGIN_COOKIE_PRIORITY = [
  'uin',
  'qqmusic_uin',
  'wxuin',
  'login_type',
  'qm_keyst',
  'qqmusic_key',
  'p_skey',
  'skey',
  'psrf_qqopenid',
  'psrf_qqunionid',
  'psrf_qqaccess_token',
  'psrf_qqrefresh_token',
  'wxopenid',
  'wxunionid',
  'wxrefresh_token',
  'wxskey',
  'p_uin',
  'ptcz',
  'RK',
];
const NETEASE_LOGIN_COOKIE_PRIORITY = [
  'MUSIC_U',
  '__csrf',
  'NMTID',
  'MUSIC_A',
  '__remember_me',
  '_ntes_nuid',
  '_ntes_nnid',
  'WEVNSM',
  'WNMCID',
  'JSESSIONID-WYYY',
];

function findOpenPort(startPort) {
  return new Promise((resolve, reject) => {
    function tryPort(port) {
      const tester = net.createServer();

      tester.once('error', (err) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          tryPort(port + 1);
          return;
        }
        reject(err);
      });

      tester.once('listening', () => {
        tester.close(() => resolve(port));
      });

      tester.listen(port, '127.0.0.1');
    }

    tryPort(startPort);
  });
}

function waitForServer(server) {
  if (!server || server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

function waitForViteServer() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    // 最多等 120 秒（200 × 600ms），Vite 首次冷启动编译依赖可能需要较长时间
    const MAX_ATTEMPTS = 200;
    const INTERVAL_MS = 600;
    const attemptConnect = (n) => {
      if (n > MAX_ATTEMPTS) return reject(new Error('Vite dev server did not become ready in time'));
      const req = http.get('http://127.0.0.1:5173', (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => setTimeout(() => attemptConnect(n + 1), INTERVAL_MS));
    };
    attemptConnect(0);
  });
}

function sendWindowState(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('desktop-window-state', getWindowState(win));
}

function sendGlobalHotkeyAction(action) {
  if (!mainWindow || mainWindow.isDestroyed() || !action) return;
  mainWindow.webContents.send('stellaflix-global-hotkey', { action });
}

function unregisterMineradioGlobalHotkeys() {
  for (const accelerator of registeredGlobalHotkeys.keys()) {
    try { globalShortcut.unregister(accelerator); } catch (e) {}
  }
  registeredGlobalHotkeys.clear();
}

function configureMineradioGlobalHotkeys(bindings = []) {
  unregisterMineradioGlobalHotkeys();
  const results = [];
  const seen = new Set();
  for (const item of Array.isArray(bindings) ? bindings : []) {
    const action = item && String(item.action || '').trim();
    const accelerator = item && String(item.accelerator || '').trim();
    if (!action || !accelerator || seen.has(accelerator)) continue;
    seen.add(accelerator);
    let registered = false;
    try {
      registered = globalShortcut.register(accelerator, () => sendGlobalHotkeyAction(action));
    } catch (error) {
      registered = false;
    }
    if (registered) {
      registeredGlobalHotkeys.set(accelerator, action);
      results.push({ action, accelerator, ok: true });
    } else {
      results.push({
        action,
        accelerator,
        ok: false,
        conflict: {
          sourceName: '系统 / 其他软件',
          sourceIcon: 'warning',
          reason: '该组合键已被占用或被系统保留',
        },
      });
    }
  }
  return { ok: true, results };
}

function scheduleWindowStateSend(win, delay = 80) {
  if (!win || win.isDestroyed()) return;
  if (mainWindowStateTimer) clearTimeout(mainWindowStateTimer);
  mainWindowStateTimer = setTimeout(() => {
    mainWindowStateTimer = null;
    sendWindowState(win);
  }, delay);
}

function rectsOverlapOnY(a, b) {
  if (!a || !b) return false;
  const aTop = Number(a.y) || 0;
  const bTop = Number(b.y) || 0;
  const aBottom = aTop + (Number(a.height) || 0);
  const bBottom = bTop + (Number(b.height) || 0);
  return aBottom > bTop && bBottom > aTop;
}

function getDisplayState(win) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const display = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : primary;
  const bounds = display && display.bounds ? display.bounds : primary.bounds;
  const displayId = display && display.id;
  const primaryId = primary && primary.id;
  const edgeTolerance = 2;
  const hasDisplayOnLeft = displays.some((candidate) => {
    if (!candidate || candidate.id === displayId || !candidate.bounds) return false;
    return rectsOverlapOnY(bounds, candidate.bounds)
      && Math.abs((candidate.bounds.x + candidate.bounds.width) - bounds.x) <= edgeTolerance;
  });
  const hasDisplayOnRight = displays.some((candidate) => {
    if (!candidate || candidate.id === displayId || !candidate.bounds) return false;
    return rectsOverlapOnY(bounds, candidate.bounds)
      && Math.abs((bounds.x + bounds.width) - candidate.bounds.x) <= edgeTolerance;
  });
  return {
    displayId,
    primaryDisplayId: primaryId,
    isPrimaryDisplay: !!(display && primary && display.id === primary.id),
    hasDisplayOnLeft,
    hasDisplayOnRight,
    displayBounds: bounds ? {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    } : null,
  };
}

function getWindowState(win) {
  if (!win || win.isDestroyed()) return {
    isMaximized: false,
    isNativeFullScreen: false,
    isHtmlFullScreen: false,
    isWindowFullScreen: false,
    isFullScreen: false,
    isMinimized: false,
    isVisible: false,
    isFocused: false,
    isPrimaryDisplay: true,
    hasDisplayOnLeft: false,
    hasDisplayOnRight: false,
    displayBounds: null,
  };
  return {
    isMaximized: win.isMaximized(),
    isNativeFullScreen: win.isFullScreen(),
    isHtmlFullScreen: htmlFullscreenActive,
    isWindowFullScreen: windowFullscreenActive,
    isFullScreen: win.isFullScreen() || htmlFullscreenActive || windowFullscreenActive,
    isMinimized: win.isMinimized(),
    isVisible: win.isVisible(),
    isFocused: win.isFocused(),
    ...getDisplayState(win),
  };
}

function getSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  sendWindowState(mainWindow);
  return true;
}

function getUpdateDownloadDir() {
  return path.join(app.getPath('userData'), 'updates');
}

function shouldEnsureDesktopShortcut() {
  if (process.platform !== 'win32') return false;
  if (process.env.STELLAFLIX_NO_DESKTOP_SHORTCUT === '1') return false;
  return app.isPackaged || process.env.STELLAFLIX_CREATE_DESKTOP_SHORTCUT === '1';
}

function ensureDesktopShortcut() {
  if (!shouldEnsureDesktopShortcut()) return { ok: false, skipped: true };
  try {
    const shortcutPath = path.join(app.getPath('desktop'), `${APP_NAME}.lnk`);
    const target = process.execPath;
    const shortcut = {
      target,
      cwd: path.dirname(target),
      args: '',
      description: 'Stellaflix desktop music player',
      icon: fs.existsSync(APP_ICON_ICO) ? APP_ICON_ICO : target,
      iconIndex: 0,
      appUserModelId: APP_USER_MODEL_ID,
    };

    if (fs.existsSync(shortcutPath) && shell.readShortcutLink) {
      try {
        const existing = shell.readShortcutLink(shortcutPath);
        if (existing && path.resolve(existing.target || '') === path.resolve(target) && String(existing.args || '') === '') {
          return { ok: true, path: shortcutPath, existing: true };
        }
      } catch (_) {}
      shell.writeShortcutLink(shortcutPath, 'replace', shortcut);
    } else {
      shell.writeShortcutLink(shortcutPath, 'create', shortcut);
    }
    return { ok: true, path: shortcutPath, created: true };
  } catch (e) {
    console.warn('Desktop shortcut creation skipped:', e.message);
    return { ok: false, error: e.message || 'DESKTOP_SHORTCUT_FAILED' };
  }
}

function parseCookieHeader(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach((part) => {
    const raw = String(part || '').trim();
    if (!raw) return;
    const idx = raw.indexOf('=');
    if (idx <= 0) return;
    out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  });
  return out;
}

function qqCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const rawUin = Number(obj.login_type) === 2
    ? (obj.wxuin || obj.uin || obj.p_uin || '')
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || '');
  const uin = String(rawUin).replace(/\D/g, '');
  const musicKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || '';
  return !!(uin && musicKey);
}

function qqCookieHasPlaybackLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const rawUin = Number(obj.login_type) === 2
    ? (obj.wxuin || obj.uin || obj.p_uin || '')
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || '');
  const uin = String(rawUin).replace(/\D/g, '');
  const playbackKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || '';
  return !!(uin && playbackKey);
}

function neteaseCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  return !!obj.MUSIC_U;
}

function isQQCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === 'qq.com' || normalized.endsWith('.qq.com') || normalized.endsWith('qqmusic.qq.com');
}

function isNeteaseCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === '163.com' || normalized.endsWith('.163.com') ||
    normalized === 'music.163.com' || normalized.endsWith('.music.163.com') ||
    normalized === 'netease.com' || normalized.endsWith('.netease.com');
}

function buildCookieHeaderFor(cookies, isAllowedDomain, priority) {
  const picked = new Map();
  (cookies || []).forEach((cookie) => {
    if (!cookie || !cookie.name || !isAllowedDomain(cookie.domain)) return;
    picked.set(cookie.name, cookie.value || '');
  });

  const ordered = [];
  (priority || []).forEach((name) => {
    if (picked.has(name)) {
      ordered.push([name, picked.get(name)]);
      picked.delete(name);
    }
  });
  picked.forEach((value, name) => ordered.push([name, value]));

  return ordered
    .filter(([name, value]) => name && value != null && String(value) !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function buildCookieHeader(cookies) {
  return buildCookieHeaderFor(cookies, isQQCookieDomain, QQ_LOGIN_COOKIE_PRIORITY);
}

async function readQQLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeader(cookies);
}

async function readNeteaseLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeaderFor(cookies, isNeteaseCookieDomain, NETEASE_LOGIN_COOKIE_PRIORITY);
}

async function openNeteaseMusicLoginWindow(owner) {
  const cookieSession = session.fromPartition(NETEASE_LOGIN_PARTITION);
  const initialCookie = await readNeteaseLoginCookieHeader(cookieSession);
  if (neteaseCookieHasLogin(initialCookie)) return { ok: true, cookie: initialCookie, reused: true };

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;

    const loginWindow = new BrowserWindow({
      width: 940,
      height: 760,
      minWidth: 780,
      minHeight: 580,
      parent: owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: '网易云音乐登录',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: NETEASE_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readNeteaseLoginCookieHeader(cookieSession);
        if (neteaseCookieHasLogin(cookie)) {
          finish({ ok: true, cookie });
        }
      } catch (e) {
        console.warn('Netease login cookie check failed:', e.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\/([^/]+\.)?(163|music\.163|netease)\.com/i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('Netease login popup navigation failed:', e.message));
      } else if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const docs = [document];
          document.querySelectorAll('iframe').forEach((frame) => {
            try { if (frame.contentDocument) docs.push(frame.contentDocument); } catch (_) {}
          });
          for (const doc of docs) {
            const nodes = Array.from(doc.querySelectorAll('a, button, span, div'));
            const loginNode = nodes.find((node) => {
              const text = (node.textContent || '').trim();
              if (!/登录|立即登录/.test(text)) return false;
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            if (loginNode) { loginNode.click(); return true; }
          }
          return false;
        }, 900);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', async () => {
      if (settled) return;
      if (pollTimer) clearInterval(pollTimer);
      try {
        const cookie = await readNeteaseLoginCookieHeader(cookieSession);
        resolve(neteaseCookieHasLogin(cookie)
          ? { ok: true, cookie, partial: !qqCookieHasPlaybackLogin(cookie) }
          : { ok: false, cancelled: true, message: '网易云登录窗口已关闭' });
      } catch (e) {
        resolve({ ok: false, error: e.message || '网易云登录窗口已关闭' });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(NETEASE_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function openQQMusicLoginWindow(owner) {
  const cookieSession = session.fromPartition(QQ_LOGIN_PARTITION);
  const initialCookie = await readQQLoginCookieHeader(cookieSession);
  if (qqCookieHasPlaybackLogin(initialCookie)) return { ok: true, cookie: initialCookie, reused: true };

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let warmupStarted = false;

    const loginWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      parent: owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: 'QQ 音乐登录',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: QQ_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readQQLoginCookieHeader(cookieSession);
        if (qqCookieHasPlaybackLogin(cookie)) {
          finish({ ok: true, cookie });
        } else if (qqCookieHasLogin(cookie) && !warmupStarted) {
          warmupStarted = true;
          setTimeout(() => {
            if (!settled && loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.loadURL('https://y.qq.com/n/ryqq/player').catch((e) => console.warn('QQ login warmup navigation failed:', e.message));
            }
          }, 900);
        }
      } catch (e) {
        console.warn('QQ login cookie check failed:', e.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('QQ login popup navigation failed:', e.message));
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
          const loginNode = nodes.find((node) => {
            const text = (node.textContent || '').trim();
            if (!/登录|登陆/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (loginNode) loginNode.click();
        }, 700);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', async () => {
      if (settled) return;
      if (pollTimer) clearInterval(pollTimer);
      try {
        const cookie = await readQQLoginCookieHeader(cookieSession);
        resolve(qqCookieHasLogin(cookie)
          ? { ok: true, cookie }
          : { ok: false, cancelled: true, message: 'QQ 登录窗口已关闭' });
      } catch (e) {
        resolve({ ok: false, error: e.message || 'QQ 登录窗口已关闭' });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(QQ_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function clearQQMusicLoginSession() {
  const cookieSession = session.fromPartition(QQ_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  return { ok: true };
}

async function clearNeteaseMusicLoginSession() {
  const cookieSession = session.fromPartition(NETEASE_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  return { ok: true };
}

function getWindowedBounds(win) {
  const display = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : screen.getPrimaryDisplay();
  const area = display.workArea;
  const basis = display.bounds || area;
  const maxWidth = Math.max(640, area.width - WINDOWED_MARGIN);
  const maxHeight = Math.max(360, area.height - WINDOWED_MARGIN);

  let width = Math.round(basis.width * WINDOWED_SCALE);
  let height = Math.round(width / WINDOWED_ASPECT);
  const scaledHeight = Math.round(basis.height * WINDOWED_SCALE);

  if (height > scaledHeight) {
    height = scaledHeight;
    width = Math.round(height * WINDOWED_ASPECT);
  }

  if (width < MIN_WINDOWED_WIDTH && maxWidth >= MIN_WINDOWED_WIDTH && maxHeight >= MIN_WINDOWED_HEIGHT) {
    width = MIN_WINDOWED_WIDTH;
    height = MIN_WINDOWED_HEIGHT;
  }

  if (width > maxWidth) {
    width = maxWidth;
    height = Math.round(width / WINDOWED_ASPECT);
  }
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * WINDOWED_ASPECT);
  }

  width = Math.round(width);
  height = Math.round(height);

  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

function applyWindowedBounds(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) win.unmaximize();
  win.setMinimumSize(MIN_WINDOWED_WIDTH, MIN_WINDOWED_HEIGHT);
  win.setBounds(getWindowedBounds(win), false);
  sendWindowState(win);
}

function exitFullscreenToWindow(win) {
  if (!win || win.isDestroyed()) return;
  windowFullscreenActive = false;

  if (!win.isFullScreen()) {
    applyWindowedBounds(win);
    return;
  }

  let applied = false;
  const applyOnce = () => {
    if (applied || !win || win.isDestroyed() || win.isFullScreen()) return;
    applied = true;
    applyWindowedBounds(win);
  };

  win.once('leave-full-screen', () => setTimeout(applyOnce, 50));
  win.setFullScreen(false);
  setTimeout(applyOnce, 500);
}

function toggleFullscreen(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isFullScreen() || windowFullscreenActive) {
    exitFullscreenToWindow(win);
    return;
  }
  windowFullscreenActive = true;
  win.setFullScreen(true);
  sendWindowState(win);
}

function overlayUrl(page) {
  const port = mainServerPort || process.env.PORT || 3000;
  return `http://127.0.0.1:${port}/${page}`;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function desktopLyricsDefaultBounds(payload = desktopLyricsState) {
  const display = desktopLyricsUserBounds
    ? screen.getDisplayMatching(desktopLyricsUserBounds)
    : screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const yRatio = clampNumber(payload.y, 0.08, 0.92, 0.76);
  const width = Math.round(Math.min(Math.max(880, bounds.width * 0.72), bounds.width - 96));
  const height = Math.round(Math.min(Math.max(340, bounds.height * 0.38), 560, bounds.height - 96));
  return {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + bounds.height * yRatio - height / 2),
    width,
    height,
  };
}

function constrainDesktopLyricsBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.bounds;
  const next = {
    ...bounds,
    width: Math.round(Math.min(Math.max(320, bounds.width), area.width)),
    height: Math.round(Math.min(Math.max(180, bounds.height), area.height)),
  };
  const maxX = area.x + Math.max(0, area.width - next.width);
  const maxY = area.y + Math.max(0, area.height - next.height);
  next.x = Math.round(clampNumber(next.x, area.x, maxX, area.x));
  next.y = Math.round(clampNumber(next.y, area.y, maxY, area.y));
  return next;
}

function setDesktopLyricsBounds(bounds) {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const nextBounds = constrainDesktopLyricsBounds(bounds);
  const currentBounds = desktopLyricsWindow.getBounds();
  if (
    currentBounds.x === nextBounds.x
    && currentBounds.y === nextBounds.y
    && currentBounds.width === nextBounds.width
    && currentBounds.height === nextBounds.height
  ) {
    return;
  }
  desktopLyricsProgrammaticMove = true;
  desktopLyricsWindow.setBounds(nextBounds, false);
  setTimeout(() => {
    desktopLyricsProgrammaticMove = false;
  }, 120);
}

function rememberDesktopLyricsBounds() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed() || desktopLyricsProgrammaticMove) return;
  desktopLyricsUserBounds = desktopLyricsWindow.getBounds();
}

function applyDesktopLyricsMouseBehavior() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const locked = desktopLyricsState.clickThrough !== false;
  const shouldIgnore = locked || !desktopLyricsPointerCapture;
  if (desktopLyricsMouseIgnored === shouldIgnore) return;
  desktopLyricsMouseIgnored = shouldIgnore;
  desktopLyricsWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true });
}

function desktopLyricsHotBoundsOnScreen() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return null;
  const winBounds = desktopLyricsWindow.getBounds();
  const rel = desktopLyricsHotBounds;
  if (!rel) return winBounds;
  return {
    x: winBounds.x + rel.left,
    y: winBounds.y + rel.top,
    width: Math.max(1, rel.right - rel.left),
    height: Math.max(1, rel.bottom - rel.top),
  };
}

function pointInBounds(point, bounds) {
  if (!point || !bounds) return false;
  return point.x >= bounds.x
    && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y
    && point.y <= bounds.y + bounds.height;
}

function handleDesktopLyricsGlobalMiddleClick() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  if (!desktopLyricsState.enabled) return;
  const now = Date.now();
  if (now - desktopLyricsLastMiddleAt < 260) return;
  const point = screen.getCursorScreenPoint();
  if (!pointInBounds(point, desktopLyricsHotBoundsOnScreen())) return;
  desktopLyricsLastMiddleAt = now;
  const nextLocked = desktopLyricsState.clickThrough === false;
  desktopLyricsState = { ...desktopLyricsState, clickThrough: nextLocked };
  desktopLyricsPointerCapture = !nextLocked;
  applyDesktopLyricsMouseBehavior();
  broadcastDesktopLyricsLockState();
}

function startDesktopLyricsMousePoller() {
  if (process.platform !== 'win32' || desktopLyricsMousePoller) return;
  const script = `
$ErrorActionPreference = "SilentlyContinue"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MineradioMousePoll {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
"@
$prev = $false
while ($true) {
  $down = (([MineradioMousePoll]::GetAsyncKeyState(4) -band 0x8000) -ne 0)
  if ($down -and -not $prev) {
    [Console]::Out.WriteLine("MMB")
    [Console]::Out.Flush()
  }
  $prev = $down
  Start-Sleep -Milliseconds 24
}
`;
  try {
    desktopLyricsMousePoller = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    desktopLyricsMousePoller.stdout.on('data', (chunk) => {
      desktopLyricsMousePollerBuffer += chunk.toString('utf8');
      const lines = desktopLyricsMousePollerBuffer.split(/\r?\n/);
      desktopLyricsMousePollerBuffer = lines.pop() || '';
      lines.forEach((line) => {
        if (line.trim() === 'MMB') handleDesktopLyricsGlobalMiddleClick();
      });
    });
    desktopLyricsMousePoller.on('exit', () => {
      desktopLyricsMousePoller = null;
      desktopLyricsMousePollerBuffer = '';
    });
    desktopLyricsMousePoller.on('error', () => {
      desktopLyricsMousePoller = null;
      desktopLyricsMousePollerBuffer = '';
    });
  } catch (e) {
    desktopLyricsMousePoller = null;
    desktopLyricsMousePollerBuffer = '';
  }
}

function stopDesktopLyricsMousePoller() {
  if (!desktopLyricsMousePoller) return;
  try {
    desktopLyricsMousePoller.kill();
  } catch (e) {}
  desktopLyricsMousePoller = null;
  desktopLyricsMousePollerBuffer = '';
}

function broadcastDesktopLyricsLockState() {
  const locked = desktopLyricsState.clickThrough !== false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stellaflix-desktop-lyrics-lock-state', { locked });
  }
  sendDesktopLyricsState();
}

function broadcastDesktopLyricsEnabledState(enabled) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stellaflix-desktop-lyrics-enabled-state', { enabled: !!enabled });
  }
}

function positionDesktopLyricsWindow(payload = desktopLyricsState, options = {}) {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const shouldUseManualBounds = desktopLyricsUserBounds && !options.force;
  setDesktopLyricsBounds(shouldUseManualBounds ? desktopLyricsUserBounds : desktopLyricsDefaultBounds(payload));
  if (typeof desktopLyricsWindow.setOpacity === 'function') {
    desktopLyricsWindow.setOpacity(clampNumber(payload.opacity, 0.28, 1, 0.92));
  }
}

function sendDesktopLyricsState() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  desktopLyricsWindow.webContents.send('stellaflix-desktop-lyrics-state', desktopLyricsState);
}

function createDesktopLyricsWindow(payload = {}) {
  const previousY = desktopLyricsState.y;
  const previousOpacity = desktopLyricsState.opacity;
  desktopLyricsState = { ...desktopLyricsState, ...payload, enabled: true };
  const hasY = Object.prototype.hasOwnProperty.call(payload || {}, 'y');
  const nextY = clampNumber(desktopLyricsState.y, 0.08, 0.92, 0.76);
  const yChanged = hasY && Number.isFinite(Number(previousY)) && Math.abs(nextY - clampNumber(previousY, 0.08, 0.92, 0.76)) > 0.001;
  const opacityChanged = Object.prototype.hasOwnProperty.call(payload || {}, 'opacity')
    && Math.abs(clampNumber(desktopLyricsState.opacity, 0.28, 1, 0.92) - clampNumber(previousOpacity, 0.28, 1, 0.92)) > 0.001;
  if (yChanged) desktopLyricsUserBounds = null;
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    if (yChanged) {
      positionDesktopLyricsWindow(desktopLyricsState, { force: yChanged });
    } else if (opacityChanged && typeof desktopLyricsWindow.setOpacity === 'function') {
      desktopLyricsWindow.setOpacity(clampNumber(desktopLyricsState.opacity, 0.28, 1, 0.92));
    }
    applyDesktopLyricsMouseBehavior();
    sendDesktopLyricsState();
    return desktopLyricsWindow;
  }

  desktopLyricsWindow = new BrowserWindow({
    width: 920,
    height: 190,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    focusable: false,
    skipTaskbar: true,
    show: false,
    title: 'Stellaflix Desktop Lyrics',
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  try {
    desktopLyricsWindow.setAlwaysOnTop(true, 'screen-saver');
    desktopLyricsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (e) {
    console.warn('Desktop lyrics topmost setup skipped:', e.message);
  }
  startDesktopLyricsMousePoller();
  applyDesktopLyricsMouseBehavior();
  positionDesktopLyricsWindow(desktopLyricsState, { force: yChanged || !desktopLyricsUserBounds });
  desktopLyricsWindow.once('ready-to-show', () => {
    if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
    desktopLyricsWindow.showInactive();
    sendDesktopLyricsState();
  });
  desktopLyricsWindow.webContents.once('did-finish-load', sendDesktopLyricsState);
  desktopLyricsWindow.on('closed', () => {
    desktopLyricsWindow = null;
    desktopLyricsMouseIgnored = null;
  });
  desktopLyricsWindow.on('moved', rememberDesktopLyricsBounds);
  desktopLyricsWindow.loadURL(overlayUrl('desktop-lyrics.html')).catch((e) => console.warn('Desktop lyrics load failed:', e.message));
  return desktopLyricsWindow;
}

function closeDesktopLyricsWindow() {
  desktopLyricsState = { ...desktopLyricsState, enabled: false };
  desktopLyricsPointerCapture = false;
  desktopLyricsMouseIgnored = null;
  desktopLyricsHotBounds = null;
  stopDesktopLyricsMousePoller();
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    sendDesktopLyricsState();
    desktopLyricsWindow.close();
  }
  desktopLyricsWindow = null;
  broadcastDesktopLyricsEnabledState(false);
}


// =====================================================================
// Path B：Steam Wallpaper Engine 集成（来自 Mineradio 2.1.0，Tier1 改名）
// 定义块：状态/常量/信任链/辅助函数/14 个 stellaflix-wallpaper-engine-* handler。
// 实例化与生命周期接线见后续提交（Phase 3 移植 B）。
// =====================================================================

// ===== Stellaflix Wallpaper Engine (Path B) — migrated from Mineradio 2.1.0 =====
// Tier1 rename applied: mineradio-wallpaper-engine-* -> stellaflix-wallpaper-engine-*
// Tier2 preserved: MINERADIO_* env, Mineradio* C# classes, "Mineradio WE DWM Surface".

// --- Module state ---
let wallpaperEngineCaptureGrant = null;
let wallpaperEngineCaptureOperation = 0;
let wallpaperEngineCapturePreparationOperation = 0;
let wallpaperEngineGlassCaptureOperation = 0;
let wallpaperEngineHostBoundsRestartTimer = null;
let wallpaperEngineHostBoundsRestartPending = false;
let wallpaperEngineHostBoundsStopPromise = null;
let wallpaperEngineHostBoundsOperation = 0;
let wallpaperEngineHostBoundsFollowupReason = '';
let wallpaperEngineHostVisibilitySuspended = false;
let wallpaperEngineHostVisibilityResumePending = false;
let wallpaperEngineHostVisibilityResumeTimer = null;
let wallpaperEngineHostVisibilityOperation = 0;
let wallpaperEngineHostVisibilityStopPromise = null;
let wallpaperEngineDesktopIconLayeringQueue = Promise.resolve(true);
let wallpaperEngineLibrary = null;
let wallpaperEngineRuntime = null;
let appQuitting = false;

// --- Constants ---
const LOCAL_APP_PERMISSION_ALLOWLIST = new Set(['speaker-selection', 'pointerLock', 'pointer-lock']);
const WALLPAPER_ENGINE_CAPTURE_GRANT_MS = 12000;
const WALLPAPER_ENGINE_CAPTURE_PREPARE_TIMEOUT_MS = 9000;
const WALLPAPER_ENGINE_CAPTURE_RETRY_DELAY_MS = 720;
const WALLPAPER_ENGINE_MAX_CAPTURE_FPS = 240;
const WALLPAPER_ENGINE_HOST_RESUME_TIMEOUT_MS = 30000;
const MAIN_WINDOW_BACKGROUND_THROTTLING = process.env.MINERADIO_KEEP_BACKGROUND_RENDERING === '1' ? false : true;

function startupDelay(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
}

function nativeWindowHandleDecimal(win) {
  const handle = win.getNativeWindowHandle();
  if (process.arch === 'x64') return handle.readBigUInt64LE(0).toString();
  return String(handle.readUInt32LE(0));
}

function wallpaperEngineTargetFps(display, requestedFps) {
  const displayFrequency = Math.max(24, Math.min(
    WALLPAPER_ENGINE_MAX_CAPTURE_FPS,
    Math.round(Number(display && display.displayFrequency) || 60)
  ));
  const requested = Number(requestedFps);
  if (!Number.isFinite(requested) || requested <= 0) return displayFrequency;
  return Math.max(24, Math.min(displayFrequency, WALLPAPER_ENGINE_MAX_CAPTURE_FPS, Math.round(requested)));
}

function wallpaperEngineHostCornerRadius(win) {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()
    || windowFullscreenActive || htmlFullscreenActive) return 0;
  const bounds = win.getContentBounds();
  const display = screen.getDisplayMatching(bounds);
  const scaleFactor = Math.max(1, Number(display && display.scaleFactor) || 1);
  return Math.max(0, Math.round(34 * scaleFactor));
}

function wallpaperEnginePhysicalContentBounds(win, fallback = {}) {
  const bounds = win && !win.isDestroyed()
    ? win.getContentBounds()
    : {
      x: Number(fallback.x) || 0,
      y: Number(fallback.y) || 0,
      width: Number(fallback.width) || 1280,
      height: Number(fallback.height) || 720,
    };
  const display = screen.getDisplayMatching(bounds);
  const scaleFactor = Math.max(1, Number(display && display.scaleFactor) || 1);
  if (win && !win.isDestroyed() && typeof screen.dipToScreenRect === 'function') {
    try {
      const physicalRect = screen.dipToScreenRect(win, bounds);
      if (physicalRect && Number(physicalRect.width) > 0 && Number(physicalRect.height) > 0) {
        return {
          bounds,
          display,
          scaleFactor,
          x: Math.round(Number(physicalRect.x) || 0),
          y: Math.round(Number(physicalRect.y) || 0),
          width: Math.max(1, Math.round(Number(physicalRect.width) || 1)),
          height: Math.max(1, Math.round(Number(physicalRect.height) || 1)),
        };
      }
    } catch (_) { }
  }
  const dipOrigin = { x: Number(bounds.x) || 0, y: Number(bounds.y) || 0 };
  const dipEnd = {
    x: dipOrigin.x + Math.max(1, Number(bounds.width) || Number(fallback.width) || 1280),
    y: dipOrigin.y + Math.max(1, Number(bounds.height) || Number(fallback.height) || 720),
  };
  const physicalOrigin = typeof screen.dipToScreenPoint === 'function'
    ? screen.dipToScreenPoint(dipOrigin)
    : { x: Math.round(dipOrigin.x * scaleFactor), y: Math.round(dipOrigin.y * scaleFactor) };
  const physicalEnd = typeof screen.dipToScreenPoint === 'function'
    ? screen.dipToScreenPoint(dipEnd)
    : { x: Math.round(dipEnd.x * scaleFactor), y: Math.round(dipEnd.y * scaleFactor) };
  return {
    bounds,
    display,
    scaleFactor,
    x: Number.isFinite(Number(physicalOrigin.x)) ? Number(physicalOrigin.x) : 0,
    y: Number.isFinite(Number(physicalOrigin.y)) ? Number(physicalOrigin.y) : 0,
    width: Math.max(1, Math.abs(Math.round(Number(physicalEnd.x) - Number(physicalOrigin.x))) || Math.round((Number(bounds.width) || 1280) * scaleFactor)),
    height: Math.max(1, Math.abs(Math.round(Number(physicalEnd.y) - Number(physicalOrigin.y))) || Math.round((Number(bounds.height) || 720) * scaleFactor)),
  };
}

function isLocalAppUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && Number(u.port || 0) === Number(mainServerPort || 0);
  } catch (e) {
    return false;
  }
}

function isTrustedMainDocumentUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (!isLocalAppUrl(u.href)) return false;
    const pathname = path.posix.normalize(u.pathname || '/');
    return pathname === '/' || pathname === '/index.html';
  } catch (_) {
    return false;
  }
}

function isTrustedMainWindowIpc(event) {
  try {
    if (!event || !event.sender || !mainWindow || mainWindow.isDestroyed()) return false;
    if (event.sender !== mainWindow.webContents || event.sender.isDestroyed()) return false;
    if (event.senderFrame && event.senderFrame.parent) return false;
    const sourceUrl = event.senderFrame && event.senderFrame.url || event.sender.getURL();
    return isTrustedMainDocumentUrl(sourceUrl);
  } catch (_) {
    return false;
  }
}

function isTrustedWallpaperEngineIpc(event) {
  return isTrustedMainWindowIpc(event);
}

function wallpaperEngineProvidesDesktopBackdrop() {
  const status = wallpaperEngineRuntime.getStatus();
  return !!(status && status.active === true
    && status.captureMode === 'dwm-thumbnail'
    && status.dwmSurfaceReady === true
    && status.dwmSurfaceActive === true
    && Number(status.dwmSurfaceWindowId) > 0);
}

function clearWallpaperEngineCaptureGrant(sessionId = '') {
  const expectedSessionId = String(sessionId || '');
  if (expectedSessionId && !wallpaperEngineCaptureGrant) return false;
  if (expectedSessionId && wallpaperEngineCaptureGrant.sessionId !== expectedSessionId) return false;
  if (!wallpaperEngineCaptureGrant) return false;
  if (wallpaperEngineCaptureGrant && wallpaperEngineCapturePreparationOperation === wallpaperEngineCaptureGrant.operation) {
    wallpaperEngineCapturePreparationOperation = 0;
  }
  wallpaperEngineCaptureGrant = null;
  wallpaperEngineCaptureSourceId = '';
  return true;
}

function createWallpaperEngineCaptureGrant(result, operation, options = {}) {
  const sessionId = String(result && result.sessionId || '');
  const sourceId = String(result && result.sourceId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId) || !sourceId) {
    clearWallpaperEngineCaptureGrant();
    return null;
  }
  wallpaperEngineCaptureSourceId = sourceId;
  wallpaperEngineCaptureGrant = {
    sessionId,
    sourceId,
    operation: Number(operation) || 0,
    kind: options.kind === 'dwm-glass' ? 'dwm-glass' : 'scene',
    captureSource: options.captureSource || null,
    expiresAt: Date.now() + WALLPAPER_ENGINE_CAPTURE_GRANT_MS,
    requestStarted: false,
  };
  return wallpaperEngineCaptureGrant;
}

function getWallpaperEngineCaptureGrant() {
  const grant = wallpaperEngineCaptureGrant;
  if (!grant) return null;
  const active = wallpaperEngineRuntime.getStatus();
  if (Date.now() > grant.expiresAt || !active || !active.active || active.sessionId !== grant.sessionId) {
    clearWallpaperEngineCaptureGrant(grant.sessionId);
    return null;
  }
  return grant;
}

function isTransientWallpaperEngineCaptureError(value) {
  return /NotReadableError|WALLPAPER_ENGINE_REFRESH_SUPERSEDED|WALLPAPER_CAPTURE_FAILED|WALLPAPER_CAPTURE_PREPARED_STREAM_MISSING/i
    .test(String(value || ''));
}

function resetWallpaperEngineCaptureGrantForRetry(grant) {
  if (!grant || wallpaperEngineCaptureGrant !== grant) return false;
  const active = wallpaperEngineRuntime.getStatus();
  if (!active || !active.active || active.sessionId !== grant.sessionId) return false;
  grant.requestStarted = false;
  grant.expiresAt = Date.now() + WALLPAPER_ENGINE_CAPTURE_GRANT_MS;
  return true;
}

function isTrustedWallpaperEngineDisplayCapturePermission(webContents, origin, details) {
  try {
    if (!webContents || !mainWindow || mainWindow.isDestroyed() || webContents !== mainWindow.webContents || webContents.isDestroyed()) return false;
    if (!isLocalAppUrl(origin)) return false;
    if (details && details.isMainFrame === false) return false;
    const grant = getWallpaperEngineCaptureGrant();
    return !!grant && wallpaperEngineCaptureSourceId === grant.sourceId;
  } catch (_) {
    return false;
  }
}

function isTrustedWallpaperEnginePreparationMediaPermission(webContents, origin, details) {
  const grant = getWallpaperEngineCaptureGrant();
  if (!grant || wallpaperEngineCapturePreparationOperation !== grant.operation) return false;
  const mediaType = String(details && details.mediaType || '').toLowerCase();
  const mediaTypes = details && Array.isArray(details.mediaTypes)
    ? details.mediaTypes.map((value) => String(value || '').toLowerCase()).filter(Boolean)
    : [];
  if (mediaType.includes('audio') || mediaTypes.some((value) => value.includes('audio'))) return false;
  if (mediaType && !mediaType.includes('video')) return false;
  if (mediaTypes.length && !mediaTypes.every((value) => value.includes('video'))) return false;
  return isTrustedWallpaperEngineDisplayCapturePermission(webContents, origin, details);
}

async function prepareWallpaperEngineRendererCapture(sessionId, fps) {
  if (!mainWindow || mainWindow.isDestroyed() || !/^[a-f0-9]{24}$/i.test(String(sessionId || ''))) {
    return { ok: false, error: 'WALLPAPER_CAPTURE_RENDERER_UNAVAILABLE' };
  }
  const safeSessionId = String(sessionId);
  const safeFps = Math.max(24, Math.min(WALLPAPER_ENGINE_MAX_CAPTURE_FPS, Number(fps) || 60));
  const grant = getWallpaperEngineCaptureGrant();
  if (!grant || grant.sessionId !== safeSessionId) return { ok: false, error: 'WALLPAPER_CAPTURE_GRANT_MISSING' };
  const safeSourceId = /^window:\d+:\d+$/.test(String(grant.sourceId || '')) ? String(grant.sourceId) : '';
  if (!safeSourceId) return { ok: false, error: 'WALLPAPER_CAPTURE_SOURCE_INVALID' };
  const script = `(() => {
    const prepare = window.__stellaflixPrepareWallpaperEngineCapture;
    if (typeof prepare !== 'function') return { ok: false, error: 'WALLPAPER_CAPTURE_PREPARE_HANDLER_MISSING' };
    return Promise.resolve(prepare(${JSON.stringify(safeSessionId)}, ${safeFps}, ${JSON.stringify(safeSourceId)}))
      .then((value) => value && typeof value === 'object' ? value : { ok: false, error: 'WALLPAPER_CAPTURE_PREPARE_RESULT_INVALID' })
      .catch((error) => ({ ok: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_CAPTURE_PREPARE_FAILED').slice(0, 500) }));
  })()`;
  let timeout;
  try {
    wallpaperEngineCapturePreparationOperation = grant.operation;
    const result = await Promise.race([
      mainWindow.webContents.executeJavaScript(script, true),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve({ ok: false, error: 'WALLPAPER_CAPTURE_PREPARE_TIMEOUT' }), WALLPAPER_ENGINE_CAPTURE_PREPARE_TIMEOUT_MS);
      }),
    ]);
    return result && typeof result === 'object'
      ? { ok: result.ok === true, error: String(result.error || '').slice(0, 500) }
      : { ok: false, error: 'WALLPAPER_CAPTURE_PREPARE_RESULT_INVALID' };
  } catch (error) {
    return { ok: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_CAPTURE_PREPARE_FAILED').slice(0, 500) };
  } finally {
    if (wallpaperEngineCapturePreparationOperation === grant.operation) wallpaperEngineCapturePreparationOperation = 0;
    if (timeout) clearTimeout(timeout);
  }
}

async function prepareWallpaperEngineRendererGlassCapture(sessionId, fps, sourceId) {
  if (!mainWindow || mainWindow.isDestroyed() || !/^[a-f0-9]{24}$/i.test(String(sessionId || ''))) {
    return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_RENDERER_UNAVAILABLE' };
  }
  const safeSessionId = String(sessionId);
  const safeFps = Math.max(24, Math.min(60, Number(fps) || 60));
  const safeSourceId = /^window:\d+:\d+$/.test(String(sourceId || '')) ? String(sourceId) : '';
  const grant = getWallpaperEngineCaptureGrant();
  if (!grant || grant.kind !== 'dwm-glass' || grant.sessionId !== safeSessionId
    || grant.sourceId !== safeSourceId) {
    return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_GRANT_MISSING' };
  }
  const script = `(() => {
    const prepare = window.__stellaflixPrepareWallpaperEngineGlassCapture;
    if (typeof prepare !== 'function') return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_PREPARE_HANDLER_MISSING' };
    return Promise.resolve(prepare(${JSON.stringify(safeSessionId)}, ${safeFps}, ${JSON.stringify(safeSourceId)}))
      .then((value) => value && typeof value === 'object' ? value : { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_PREPARE_RESULT_INVALID' })
      .catch((error) => ({ ok: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_GLASS_CAPTURE_PREPARE_FAILED').slice(0, 500) }));
  })()`;
  let timeout;
  try {
    wallpaperEngineCapturePreparationOperation = grant.operation;
    const result = await Promise.race([
      mainWindow.webContents.executeJavaScript(script, true),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve({ ok: false, error: 'WALLPAPER_GLASS_CAPTURE_PREPARE_TIMEOUT' }), WALLPAPER_ENGINE_CAPTURE_PREPARE_TIMEOUT_MS);
      }),
    ]);
    return result && typeof result === 'object'
      ? { ok: result.ok === true, error: String(result.error || '').slice(0, 500) }
      : { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_PREPARE_RESULT_INVALID' };
  } catch (error) {
    return { ok: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_GLASS_CAPTURE_PREPARE_FAILED').slice(0, 500) };
  } finally {
    if (wallpaperEngineCapturePreparationOperation === grant.operation) wallpaperEngineCapturePreparationOperation = 0;
    if (timeout) clearTimeout(timeout);
  }
}

async function prepareWallpaperEngineRendererHostBoundsFrame(sessionId, reason = 'bounds-changed') {
  if (!mainWindow || mainWindow.isDestroyed() || !/^[a-f0-9]{24}$/i.test(String(sessionId || ''))) {
    return { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_RENDERER_UNAVAILABLE' };
  }
  const safeSessionId = String(sessionId);
  const safeReason = String(reason || 'bounds-changed').slice(0, 80);
  const script = `(() => {
    const prepare = window.__stellaflixPrepareWallpaperEngineHostBoundsChange;
    if (typeof prepare !== 'function') return { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_HANDLER_MISSING' };
    try {
      const value = prepare(${JSON.stringify(safeSessionId)}, ${JSON.stringify(safeReason)});
      return value && typeof value === 'object'
        ? value
        : { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_RESULT_INVALID' };
    } catch (error) {
      return { ok: false, frozen: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_BOUNDS_FREEZE_FAILED').slice(0, 500) };
    }
  })()`;
  try {
    // Do not race executeJavaScript with a timeout. A timed-out renderer script
    // cannot be cancelled and may run later, freeze the new frame, and clear the
    // live capture after main has already abandoned the restart. This promise is
    // asynchronous and does not block Electron's main loop; renderer teardown
    // rejects it during crash/navigation cleanup.
    const result = await mainWindow.webContents.executeJavaScript(script, true);
    return result && typeof result === 'object'
      ? { ok: result.ok === true, frozen: result.frozen === true, error: String(result.error || '').slice(0, 500) }
      : { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_RESULT_INVALID' };
  } catch (error) {
    return { ok: false, frozen: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_BOUNDS_FREEZE_FAILED').slice(0, 500) };
  }
}

function cancelWallpaperEngineHostBoundsRestart() {
  if (wallpaperEngineHostBoundsRestartTimer) {
    clearTimeout(wallpaperEngineHostBoundsRestartTimer);
    wallpaperEngineHostBoundsRestartTimer = null;
  }
  wallpaperEngineHostBoundsRestartPending = false;
  wallpaperEngineHostBoundsStopPromise = null;
  wallpaperEngineHostBoundsFollowupReason = '';
  wallpaperEngineHostBoundsOperation += 1;
}

function stopWallpaperEngineRuntimeForRenderer(reason = '') {
  wallpaperEngineCaptureOperation += 1;
  cancelWallpaperEngineHostBoundsRestart();
  clearWallpaperEngineCaptureGrant();
  return wallpaperEngineRuntime.stop().catch((error) => {
    console.warn('[Wallpaper Engine] renderer cleanup failed:', reason || 'renderer-reset', error && error.message || error);
    return { ok: false, stopped: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_ENGINE_STOP_FAILED') };
  });
}

// ===== Wallpaper Engine 桌面嵌入预览流程（来自 2.1.0 #10-12，Tier1 改名） =====
// 渲染端钩子 window.__stellaflixPrepareWallpaperEngineDesktopPreview 由 #22 移植的
// public/video/wallpaper-engine/ 渲染层提供（bridge.js 定义、bootstrap.js DOM-ready 初始化）。
// 以下为后端实现，通过 executeJavaScript 注入渲染端执行该钩子。
async function prepareWallpaperEngineRendererDesktopPreview(sessionId, reason = 'full-desktop-passive') {
  const safeSessionId = String(sessionId || '');
  const safeReason = String(reason || 'full-desktop-passive').slice(0, 80);
  if (!mainWindow || mainWindow.isDestroyed()
    || (safeSessionId && !/^[a-f0-9]{24}$/i.test(safeSessionId))) {
    return { ok: false, preview: false, error: 'WALLPAPER_DESKTOP_PREVIEW_RENDERER_UNAVAILABLE' };
  }
  const script = `(() => {
    const prepare = window.__stellaflixPrepareWallpaperEngineDesktopPreview;
    if (typeof prepare !== 'function') {
      return { ok: false, preview: false, error: 'WALLPAPER_DESKTOP_PREVIEW_HANDLER_MISSING' };
    }
    return Promise.resolve(prepare(${JSON.stringify(safeSessionId)}, ${JSON.stringify(safeReason)}))
      .then((value) => value && typeof value === 'object'
        ? value
        : { ok: false, preview: false, error: 'WALLPAPER_DESKTOP_PREVIEW_RESULT_INVALID' })
      .catch((error) => ({
        ok: false,
        preview: false,
        error: String(error && (error.message || error.name) || error || 'WALLPAPER_DESKTOP_PREVIEW_FAILED').slice(0, 500)
      }));
  })()`;
  try {
    const result = await mainWindow.webContents.executeJavaScript(script, true);
    return result && typeof result === 'object'
      ? {
        ok: result.ok === true,
        preview: result.preview === true,
        selectedEngine: result.selectedEngine === true,
        skipped: result.skipped === true,
        error: String(result.error || '').slice(0, 500),
      }
      : { ok: false, preview: false, error: 'WALLPAPER_DESKTOP_PREVIEW_RESULT_INVALID' };
  } catch (error) {
    return {
      ok: false,
      preview: false,
      error: String(error && (error.message || error.name) || error || 'WALLPAPER_DESKTOP_PREVIEW_FAILED').slice(0, 500),
    };
  }
}

function waitForWallpaperEngineHelperExit(child, timeoutMs = 2200) {
  if (!child || child.exitCode !== null || child.signalCode != null) return Promise.resolve(true);
  if (typeof child.once !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (typeof child.removeListener === 'function') {
        child.removeListener('exit', onExit);
        child.removeListener('close', onExit);
      }
      resolve(exited === true);
    };
    const onExit = () => finish(true);
    child.once('exit', onExit);
    child.once('close', onExit);
    timer = setTimeout(() => finish(false), Math.max(600, Number(timeoutMs) || 2200));
  });
}

async function prepareWallpaperEngineProjectPreviewBeforeDesktopEmbedding(win, reason = 'full-desktop-passive') {
  if (!win || win.isDestroyed() || appQuitting) {
    return { ok: false, error: 'FULL_DESKTOP_WALLPAPER_ENGINE_HOST_UNAVAILABLE' };
  }
  if (!ensureFullDesktopModeRecoveryTray()) {
    return { ok: false, error: 'FULL_DESKTOP_RECOVERY_TRAY_UNAVAILABLE' };
  }
  if (wallpaperEngineRuntime.pending) {
    return { ok: false, error: 'WALLPAPER_ENGINE_DESKTOP_TRANSITION_BUSY' };
  }

  const activeSession = wallpaperEngineRuntime.active || null;
  const sessionId = String(activeSession && activeSession.sessionId || '');
  if (activeSession && !/^[a-f0-9]{24}$/i.test(sessionId)) {
    return { ok: false, error: 'WALLPAPER_ENGINE_DESKTOP_SESSION_INVALID' };
  }

  wallpaperEngineHostVisibilitySuspended = true;
  wallpaperEngineHostVisibilityOperation += 1;
  finishWallpaperEngineVisibleHostResume(win);
  cancelWallpaperEngineHostBoundsRestart();
  wallpaperEngineCaptureOperation += 1;
  clearWallpaperEngineCaptureGrant();

  const prepared = await prepareWallpaperEngineRendererDesktopPreview(sessionId, reason);
  if (!prepared || prepared.ok !== true) {
    return {
      ok: false,
      error: String(prepared && prepared.error || 'WALLPAPER_DESKTOP_PREVIEW_UNAVAILABLE'),
    };
  }

  if (wallpaperEngineRuntime.pending
    || (activeSession && wallpaperEngineRuntime.active !== activeSession)
    || (!activeSession && wallpaperEngineRuntime.active)) {
    return { ok: false, error: 'WALLPAPER_ENGINE_DESKTOP_TRANSITION_BUSY' };
  }
  if (!activeSession) {
    return {
      ok: true,
      stopped: false,
      preview: prepared.preview === true,
      selectedEngine: prepared.selectedEngine === true,
    };
  }

  const helperProcess = activeSession.dwmSurfaceProcess || null;
  const helperExit = waitForWallpaperEngineHelperExit(helperProcess);
  const stopPromise = wallpaperEngineRuntime.stop(sessionId);
  wallpaperEngineHostVisibilityStopPromise = stopPromise;
  let stopped;
  try {
    stopped = await stopPromise;
  } catch (error) {
    return {
      ok: false,
      error: String(error && (error.message || error.name) || error || 'FULL_DESKTOP_WALLPAPER_ENGINE_SUSPEND_FAILED'),
    };
  }
  const helperExited = await helperExit;
  if (!stopped || stopped.stopped !== true
    || wallpaperEngineRuntime.active != null
    || wallpaperEngineRuntime.pending != null) {
    return {
      ok: false,
      error: String(stopped && stopped.reason || 'FULL_DESKTOP_WALLPAPER_ENGINE_SUSPEND_FAILED'),
    };
  }
  if (helperProcess && helperExited !== true) {
    return { ok: false, error: 'FULL_DESKTOP_WALLPAPER_ENGINE_HELPER_EXIT_TIMEOUT' };
  }
  return {
    ok: true,
    stopped: true,
    preview: prepared.preview === true,
    selectedEngine: prepared.selectedEngine === true,
  };
}

// recovery tray：主支无系统托盘（D2 待决），改为无托盘时放行（return true）的适配版；
// 若后续补回托盘基础设施，可在此恢复 2.1.0 的 createOrUpdateTray 逻辑。
function ensureFullDesktopModeRecoveryTray() {
  return true;
}

function releaseFullDesktopModeRecoveryTray() {
  return true;
}

function setMainWindowBackgroundThrottling(win, enabled) {
  if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return;
  try {
    win.webContents.setBackgroundThrottling(enabled === true);
  } catch (_) { }
}

function finishWallpaperEngineVisibleHostResume(win) {
  wallpaperEngineHostVisibilityResumePending = false;
  if (wallpaperEngineHostVisibilityResumeTimer) {
    clearTimeout(wallpaperEngineHostVisibilityResumeTimer);
    wallpaperEngineHostVisibilityResumeTimer = null;
  }
  const desktopMode = fullDesktopModeRuntime.getStatus('wallpaper-engine-resume-finished');
  setMainWindowBackgroundThrottling(win, desktopMode.enabled === true ? false : MAIN_WINDOW_BACKGROUND_THROTTLING);
}

function suspendWallpaperEngineForHiddenHost(win, reason = 'hidden') {
  if (!win || win.isDestroyed()) return Promise.resolve({ ok: true, stopped: false });
  if (wallpaperEngineHostVisibilitySuspended) {
    return wallpaperEngineHostVisibilityStopPromise || Promise.resolve({ ok: true, stopped: true });
  }
  wallpaperEngineHostVisibilitySuspended = true;
  wallpaperEngineHostVisibilityOperation += 1;
  finishWallpaperEngineVisibleHostResume(win);
  cancelWallpaperEngineHostBoundsRestart();
  try {
    win.webContents.send('stellaflix-wallpaper-engine-host-bounds-changed', {
      phase: 'prepare',
      reason: String(reason || 'hidden'),
    });
  } catch (_) { }
  wallpaperEngineHostVisibilityStopPromise = stopWallpaperEngineRuntimeForRenderer(`host-${reason || 'hidden'}`);
  return wallpaperEngineHostVisibilityStopPromise;
}

function resumeWallpaperEngineForVisibleHost(win, reason = 'visible') {
  const desktopMode = fullDesktopModeRuntime.getStatus('wallpaper-engine-visible-host');
  if (appQuitting || (desktopMode.enabled === true
    && (desktopMode.interactive !== true || desktopMode.phase !== 'interactive'))) return;
  if (!wallpaperEngineHostVisibilitySuspended) return;
  wallpaperEngineHostVisibilitySuspended = false;
  wallpaperEngineHostVisibilityResumePending = true;
  const visibilityOperation = ++wallpaperEngineHostVisibilityOperation;
  const forceVisibleHost = /^full-desktop-/i.test(String(reason || ''));
  // Electron's background-throttling switch also controls Page Visibility.
  // Temporarily disabling it makes a newly shown tray/minimized window visible
  // to Chromium before we ask the renderer to create the WE capture stream.
  setMainWindowBackgroundThrottling(win, false);
  if (wallpaperEngineHostVisibilityResumeTimer) clearTimeout(wallpaperEngineHostVisibilityResumeTimer);
  wallpaperEngineHostVisibilityResumeTimer = setTimeout(() => {
    finishWallpaperEngineVisibleHostResume(win);
  }, WALLPAPER_ENGINE_HOST_RESUME_TIMEOUT_MS);
  const notifyRestart = () => {
    if (wallpaperEngineHostVisibilityOperation !== visibilityOperation
      || wallpaperEngineHostVisibilitySuspended
      || !win
      || win.isDestroyed()
      || !win.isVisible()
      || win.isMinimized()) return;
    try {
      win.webContents.send('stellaflix-wallpaper-engine-host-bounds-changed', {
        phase: 'restart',
        reason: String(reason || 'visible'),
        forceVisibleHost,
      });
    } catch (_) { }
  };
  const stopped = wallpaperEngineHostVisibilityStopPromise;
  Promise.resolve(stopped).catch(() => null).finally(() => {
    if (wallpaperEngineHostVisibilityStopPromise === stopped) wallpaperEngineHostVisibilityStopPromise = null;
    if (wallpaperEngineHostVisibilityOperation !== visibilityOperation || wallpaperEngineHostVisibilitySuspended) return;
    setTimeout(notifyRestart, 80);
    setTimeout(notifyRestart, 420);
    setTimeout(notifyRestart, 1100);
  });
}

function fullDesktopIconLayeringDesired(reason = '') {
  const status = fullDesktopModeRuntime.getStatus(reason || 'dwm-icon-layering');
  return status.enabled === true
    && status.interactive === true
    && status.coexisting === true
    && status.iconShapeActive === true;
}

function syncWallpaperEngineDesktopIconLayering(reason = 'desktop-state', desiredOverride) {
  const operation = async () => {
    const desired = typeof desiredOverride === 'boolean'
      ? desiredOverride
      : fullDesktopIconLayeringDesired(`${reason}-queued`);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const active = wallpaperEngineRuntime.getStatus();
      if (!active || active.active !== true || !active.sessionId
        || active.captureMode !== 'dwm-thumbnail') return true;
      try {
        const updated = await wallpaperEngineRuntime.updateDwmDesktopIconLayering(active.sessionId, desired);
        if (updated === true) return true;
      } catch (error) {
        console.warn('[FullDesktopMode] DWM desktop-icon layering sync failed:', reason, error && error.message || error);
      }
      if (attempt < 3) await startupDelay(70 + attempt * 55);
    }
    console.warn('[FullDesktopMode] DWM desktop-icon layering was not acknowledged:', reason, desired);
    return false;
  };
  wallpaperEngineDesktopIconLayeringQueue = wallpaperEngineDesktopIconLayeringQueue.then(operation, operation);
  return wallpaperEngineDesktopIconLayeringQueue;
}

function scheduleWallpaperEngineHostBoundsRestart(win, reason = 'bounds-changed') {
  if (!win || win.isDestroyed()) return;
  const status = wallpaperEngineRuntime.getStatus();
  // The DWM surface helper follows the authoritative host HWND and resizes the
  // source in place. Restarting the Scene here would discard native parallax
  // state and reintroduce the old capture-only lifecycle on every drag.
  if (status && status.active === true && status.captureMode === 'dwm-thumbnail') return;
  if (!wallpaperEngineHostBoundsRestartPending && (!status || status.active !== true)) return;
  let job = wallpaperEngineHostBoundsStopPromise;
  if (job && job.started === true) {
    // A second movement after the settled restart began is handled once the new
    // capture ACK arrives. Continuous native dragging never reaches this branch
    // because the real debounce below is reset on every move/resize event.
    wallpaperEngineHostBoundsFollowupReason = String(reason || 'bounds-changed').slice(0, 80);
    return;
  }
  if (!job) {
    wallpaperEngineHostBoundsRestartPending = true;
    job = {
      boundsOperation: ++wallpaperEngineHostBoundsOperation,
      captureOperation: 0,
      sessionId: String(status && status.sessionId || ''),
      reason: String(reason || 'bounds-changed').slice(0, 80),
      started: false,
      promise: null,
    };
    wallpaperEngineHostBoundsStopPromise = job;
  } else {
    job.reason = String(reason || job.reason || 'bounds-changed').slice(0, 80);
  }
  if (wallpaperEngineHostBoundsRestartTimer) clearTimeout(wallpaperEngineHostBoundsRestartTimer);
  wallpaperEngineHostBoundsRestartTimer = setTimeout(() => {
    wallpaperEngineHostBoundsRestartTimer = null;
    if (wallpaperEngineHostBoundsStopPromise !== job || job.started === true) return;
    const currentBeforePrepare = wallpaperEngineRuntime.getStatus();
    if (!currentBeforePrepare || currentBeforePrepare.active !== true
      || String(currentBeforePrepare.sessionId || '') !== job.sessionId) {
      wallpaperEngineHostBoundsStopPromise = null;
      wallpaperEngineHostBoundsRestartPending = false;
      return;
    }
    job.started = true;
    job.captureOperation = ++wallpaperEngineCaptureOperation;
    clearWallpaperEngineCaptureGrant();
    job.promise = prepareWallpaperEngineRendererHostBoundsFrame(job.sessionId, job.reason)
      .then(async (prepared) => {
        const current = wallpaperEngineRuntime.getStatus();
        const stale = wallpaperEngineHostBoundsStopPromise !== job
          || wallpaperEngineHostBoundsOperation !== job.boundsOperation
          || wallpaperEngineCaptureOperation !== job.captureOperation
          || wallpaperEngineHostVisibilitySuspended
          || win.isDestroyed()
          || !current
          || current.active !== true
          || String(current.sessionId || '') !== job.sessionId;
        if (stale) {
          return {
            ok: false,
            stale: true,
            frozen: !!(prepared && prepared.frozen === true),
            stopped: false,
          };
        }
        // Never tear down the live source unless the renderer preserved a real
        // frame. Once frozen, however, always release the renderer by starting a
        // fresh session even if the old native HWND refuses its first close.
        if (!prepared || prepared.ok !== true || prepared.frozen !== true) {
          return {
            ok: false,
            frozen: false,
            stopped: false,
            error: String(prepared && prepared.error || 'WALLPAPER_BOUNDS_FREEZE_UNAVAILABLE'),
          };
        }
        try {
          const stopped = await wallpaperEngineRuntime.stop(job.sessionId);
          return { ok: true, frozen: true, stopped: !!(stopped && stopped.stopped), result: stopped };
        } catch (error) {
          return {
            ok: false,
            frozen: true,
            stopped: false,
            error: String(error && (error.message || error.name) || error || 'WALLPAPER_BOUNDS_RUNTIME_STOP_FAILED'),
          };
        }
    });
    Promise.resolve(job.promise).then((result) => {
      const ownsCurrentJob = wallpaperEngineHostBoundsStopPromise === job;
      const operationCurrent = wallpaperEngineHostBoundsOperation === job.boundsOperation
        && wallpaperEngineCaptureOperation === job.captureOperation;
      if (ownsCurrentJob) {
        wallpaperEngineHostBoundsStopPromise = null;
        wallpaperEngineHostBoundsRestartPending = false;
      }
      if (!result || result.frozen !== true) return;
      // A renderer freeze can complete after another operation cancelled and
      // detached this job. The freeze itself is not cancellable, so its late
      // completion must still receive a visible-host recovery signal; otherwise
      // the renderer can remain permanently stuck on the preserved frame.
      const recoveryOnly = !ownsCurrentJob || !operationCurrent || result.stale === true;
      setTimeout(() => {
        if (wallpaperEngineHostVisibilitySuspended
          || win.isDestroyed()
          || !win.isVisible()
          || win.isMinimized()) return;
        if (!recoveryOnly && (wallpaperEngineHostBoundsOperation !== job.boundsOperation
          || wallpaperEngineCaptureOperation !== job.captureOperation)) return;
        try {
          win.webContents.send('stellaflix-wallpaper-engine-host-bounds-changed', {
            phase: 'restart',
            reason: recoveryOnly ? 'bounds-stale-recovery' : job.reason,
            forceVisibleHost: true,
          });
        } catch (_) { }
      }, 90);
    }).catch(() => {
      if (wallpaperEngineHostBoundsStopPromise === job) {
        wallpaperEngineHostBoundsStopPromise = null;
        wallpaperEngineHostBoundsRestartPending = false;
      }
    });
  }, 260);
}

function configureLocalAppPermissions() {
  const ses = session.defaultSession;
  if (!ses || ses._stellaflixPermissionsConfigured) return;
  ses._stellaflixPermissionsConfigured = true;
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const origin = requestingOrigin || (details && details.requestingUrl) || (webContents && webContents.getURL && webContents.getURL()) || '';
    if (permission === 'display-capture') return isTrustedWallpaperEngineDisplayCapturePermission(webContents, origin, details);
    if (permission === 'media') return isTrustedWallpaperEnginePreparationMediaPermission(webContents, origin, details);
    return LOCAL_APP_PERMISSION_ALLOWLIST.has(permission) && isLocalAppUrl(origin);
  });
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = (details && (details.requestingUrl || details.securityOrigin)) || (webContents && webContents.getURL && webContents.getURL()) || '';
    if (permission === 'display-capture') {
      callback(isTrustedWallpaperEngineDisplayCapturePermission(webContents, origin, details));
      return;
    }
    if (permission === 'media') {
      callback(isTrustedWallpaperEnginePreparationMediaPermission(webContents, origin, details));
      return;
    }
    callback(LOCAL_APP_PERMISSION_ALLOWLIST.has(permission) && isLocalAppUrl(origin));
  });
  ses.setDisplayMediaRequestHandler((request, callback) => {
    let replied = false;
    const reply = (value) => {
      if (replied) return;
      replied = true;
      callback(value || {});
    };
    Promise.resolve().then(async () => {
      const frame = request && request.frame;
      const trustedFrame = !!(frame
        && mainWindow
        && !mainWindow.isDestroyed()
        && frame === mainWindow.webContents.mainFrame
        && !frame.parent
        && isLocalAppUrl(request.securityOrigin));
      const grant = getWallpaperEngineCaptureGrant();
      if (!trustedFrame || !request.videoRequested || request.audioRequested || !grant || grant.requestStarted) {
        reply({});
        return;
      }
      grant.requestStarted = true;
      if (grant.kind === 'dwm-glass') {
        const current = wallpaperEngineRuntime.getStatus();
        const source = grant.captureSource;
        const sourceMatch = /^window:(\d+):\d+$/.exec(String(source && source.id || ''));
        if (wallpaperEngineCaptureGrant !== grant
          || !current
          || current.active !== true
          || current.sessionId !== grant.sessionId
          || current.dwmGlassSurfaceReady !== true
          || current.dwmGlassSurfaceActive !== true
          || !sourceMatch
          || Number(sourceMatch[1]) !== Number(current.dwmGlassSurfaceWindowId)
          || String(source && source.name || '') !== 'Mineradio WE DWM Surface') {
          reply({});
          return;
        }
        reply({ video: source });
        return;
      }
      let refreshed = typeof wallpaperEngineRuntime.refreshActiveSource === 'function'
        ? await wallpaperEngineRuntime.refreshActiveSource(grant.sessionId, {
          timeoutMs: 1600,
          pollIntervalMs: 80,
          includeSource: true,
        })
        : wallpaperEngineRuntime.getStatus();
      let source = refreshed && refreshed.captureSource;
      if (wallpaperEngineCaptureGrant !== grant
        || !refreshed
        || refreshed.sessionId !== grant.sessionId
        || !refreshed.sourceId
        || !source
        || String(source.id || '') !== String(refreshed.sourceId)) {
        reply({});
        return;
      }
      if (refreshed.sourceWindowAligned !== true || String(refreshed.sourceId) !== String(grant.sourceId || '')) {
        await wallpaperEngineRuntime.embedActiveWindow(grant.sessionId, {
          hostWindowId: nativeWindowHandleDecimal(mainWindow),
          hostExecutable: process.execPath,
          cornerRadius: wallpaperEngineHostCornerRadius(mainWindow),
          desktopIconLayering: fullDesktopIconLayeringDesired('wallpaper-engine-source-refresh'),
        });
        refreshed = await wallpaperEngineRuntime.refreshActiveSource(grant.sessionId, {
          timeoutMs: 1600,
          pollIntervalMs: 80,
          includeSource: true,
        });
        source = refreshed && refreshed.captureSource;
      }
      if (wallpaperEngineCaptureGrant !== grant
        || !refreshed
        || refreshed.sessionId !== grant.sessionId
        || refreshed.sourceWindowAligned !== true
        || !source
        || String(source.id || '') !== String(refreshed.sourceId || '')) {
        reply({});
        return;
      }
      grant.sourceId = String(refreshed.sourceId);
      wallpaperEngineCaptureSourceId = grant.sourceId;
      reply({ video: source });
    }).catch(() => reply({}));
  }, { useSystemPicker: false });
}

function broadcastDesktopWallpaperStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('stellaflix-wallpaper-engine-runtime-state', {
    ...(status || (wallpaperEngineRuntime && wallpaperEngineRuntime.getStatus && wallpaperEngineRuntime.getStatus()) || {}),
  });
}

ipcMain.handle('stellaflix-wallpaper-engine-list', async (event, payload = {}) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, projects: [], count: 0, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const snapshot = await wallpaperEngineLibrary.list({ force: payload && payload.force === true });
    const runtime = await wallpaperEngineRuntime.probe(payload && payload.force === true);
    return { ...snapshot, runtime };
  } catch (error) {
    return { ok: false, projects: [], count: 0, error: error.message || 'WALLPAPER_ENGINE_SCAN_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-project-details', async (event, id) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    return await wallpaperEngineLibrary.getProjectDetails(String(id || ''));
  } catch (error) {
    return { ok: false, error: error.message || 'WALLPAPER_ENGINE_PROJECT_DETAILS_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-open-project-details', async (event, payload = {}) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const details = await wallpaperEngineLibrary.getProjectDetails(String(payload && payload.id || ''));
    const workshopId = String(details && details.workshopId || '');
    if (!/^\d{5,32}$/.test(workshopId)) {
      return { ok: false, error: 'WALLPAPER_ENGINE_WORKSHOP_DETAILS_UNAVAILABLE' };
    }
    const target = payload && payload.target === 'workshop' ? 'workshop' : 'we';
    let revealError = '';
    if (target === 'we') {
      try {
        await wallpaperEngineRuntime.revealWorkshop(workshopId);
        return { ok: true, opened: 'wallpaper-engine', workshopId };
      } catch (error) {
        revealError = error && (error.code || error.message) || 'WALLPAPER_ENGINE_REVEAL_FAILED';
      }
    }
    const steamUri = 'steam://url/CommunityFilePage/' + workshopId;
    try {
      await shell.openExternal(steamUri);
      return { ok: true, opened: 'steam-workshop', workshopId, fallback: target === 'we', revealError };
    } catch (_) {
      const webUrl = 'https://steamcommunity.com/sharedfiles/filedetails/?id=' + workshopId;
      await shell.openExternal(webUrl);
      return { ok: true, opened: 'web-workshop', workshopId, fallback: target === 'we', revealError };
    }
  } catch (error) {
    return { ok: false, error: error.message || 'WALLPAPER_ENGINE_OPEN_PROJECT_DETAILS_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-choose-directory', async (event) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, canceled: false, projects: [], count: 0, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const options = {
      title: '识别并导入 Wallpaper Engine 项目',
      buttonLabel: '识别此目录',
      properties: ['openDirectory'],
    };
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: true, canceled: true };
    const snapshot = await wallpaperEngineLibrary.addManualRoot(result.filePaths[0]);
    const runtime = await wallpaperEngineRuntime.probe(false);
    return { ...snapshot, runtime, canceled: false };
  } catch (error) {
    return { ok: false, canceled: false, projects: [], count: 0, error: error.message || 'WALLPAPER_ENGINE_IMPORT_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-choose-project-file', async (event) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, canceled: false, projects: [], count: 0, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const options = {
      title: '选择 Wallpaper Engine 的 project.json 或场景包（.pkg/.pak）',
      buttonLabel: '导入此项目',
      properties: ['openFile'],
      filters: [
        { name: 'Wallpaper Engine 项目', extensions: ['pkg', 'pak', 'json'] },
      ],
    };
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: true, canceled: true };
    const selected = path.resolve(result.filePaths[0]);
    const snapshot = await wallpaperEngineLibrary.addManualProjectFile(selected);
    const runtime = await wallpaperEngineRuntime.probe(false);
    return { ...snapshot, runtime, canceled: false };
  } catch (error) {
    return { ok: false, canceled: false, projects: [], count: 0, error: error.message || 'WALLPAPER_ENGINE_IMPORT_PROJECT_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-remove-directory', async (event, rootId) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, projects: [], count: 0, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const snapshot = await wallpaperEngineLibrary.removeManualRoot(rootId);
    const runtime = await wallpaperEngineRuntime.probe(false);
    return { ...snapshot, runtime };
  } catch (error) {
    return { ok: false, projects: [], count: 0, error: error.message || 'WALLPAPER_ENGINE_REMOVE_ROOT_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-runtime-status', async (event, payload = {}) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, available: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const probe = await wallpaperEngineRuntime.probe(payload && payload.force === true);
    return { ...probe, ...wallpaperEngineRuntime.getStatus(), pending: wallpaperEngineRuntime.pending != null };
  } catch (error) {
    return { ok: false, available: false, error: error.message || 'WALLPAPER_ENGINE_RUNTIME_PROBE_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-start-scene', async (event, payload = {}) => {
  let operation = 0;
  let startedSessionId = '';
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    operation = ++wallpaperEngineCaptureOperation;
    const desktopMode = fullDesktopModeRuntime.getStatus('wallpaper-engine-start-scene');
    if (wallpaperEngineHostVisibilitySuspended
      || (desktopMode.enabled === true
        && (desktopMode.interactive !== true || desktopMode.phase !== 'interactive'))) {
      return { ok: false, error: 'WALLPAPER_ENGINE_HOST_SUSPENDED' };
    }
    const physicalBounds = wallpaperEnginePhysicalContentBounds(mainWindow, payload);
    const display = physicalBounds.display;
    const targetFps = wallpaperEngineTargetFps(display, payload.fps);
    const hostCornerRadius = wallpaperEngineHostCornerRadius(mainWindow);
    const result = await wallpaperEngineRuntime.start(String(payload.id || ''), {
      // The native scene follows the authoritative BrowserWindow content rect;
      // renderer innerWidth/innerHeight can be stale during a DPI transition.
      width: Math.max(640, Math.min(7680, physicalBounds.width)),
      height: Math.max(360, Math.min(4320, physicalBounds.height)),
      fps: targetFps,
      x: physicalBounds.x,
      y: physicalBounds.y,
    });
    startedSessionId = String(result && result.sessionId || '');
    if (operation !== wallpaperEngineCaptureOperation) {
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED', sessionId: startedSessionId };
    }
    let embedded;
    try {
      embedded = await wallpaperEngineRuntime.embedActiveWindow(startedSessionId, {
        hostWindowId: nativeWindowHandleDecimal(mainWindow),
        hostExecutable: process.execPath,
        cornerRadius: hostCornerRadius,
        desktopIconLayering: fullDesktopIconLayeringDesired('wallpaper-engine-embed'),
      });
    } catch (embeddingError) {
      clearWallpaperEngineCaptureGrant(startedSessionId);
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
      return {
        ok: false,
        error: embeddingError && (embeddingError.code || embeddingError.message) || 'WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED',
        capturePrepared: false,
        sessionId: startedSessionId,
      };
    }
    if (operation !== wallpaperEngineCaptureOperation) {
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED', sessionId: startedSessionId };
    }
    // Adaptive pixel calibration can relaunch the WE pop-out and replace its
    // HWND/sourceId. Build the one-shot grant only after embedding has settled
    // so the renderer never captures the stale pre-calibration window.
    const grant = createWallpaperEngineCaptureGrant({ ...result, ...embedded }, operation);
    if (!grant) {
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
      return { ok: false, error: 'WALLPAPER_ENGINE_CAPTURE_UNAVAILABLE', sessionId: startedSessionId };
    }
    const embeddedDesktop = fullDesktopModeRuntime.getStatus('wallpaper-engine-embed-finished');
    if (mainWindow && !mainWindow.isDestroyed() && embeddedDesktop.enabled !== true) {
      try { mainWindow.moveTop(); } catch (_) { }
      try { mainWindow.focus(); } catch (_) { }
    } else if (embeddedDesktop.enabled === true && embeddedDesktop.interactive === true) {
      fullDesktopModeRuntime.ensureIconLayerOrder().catch((error) => {
        console.warn('[FullDesktopMode] WE coexistence z-order refresh failed:', error && error.message || error);
      });
    }
    if (operation !== wallpaperEngineCaptureOperation) {
      clearWallpaperEngineCaptureGrant(grant.sessionId);
      await wallpaperEngineRuntime.stop(grant.sessionId).catch(() => {});
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED', sessionId: grant.sessionId };
    }
    // Native Scene mode is composed by DWM, not captured as a Chromium video.
    // The renderer keeps this one-shot grant only for the readiness ACK; the
    // runtime starts a click-through live surface underneath the transparent
    // BrowserWindow and leaves the exact WE source aligned behind it.
    return { ...result, ...embedded, capturePrepared: true, captureMode: 'dwm-thumbnail' };
  } catch (error) {
    if (startedSessionId) {
      clearWallpaperEngineCaptureGrant(startedSessionId);
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
    } else if (wallpaperEngineCaptureGrant && wallpaperEngineCaptureGrant.operation === operation) {
      clearWallpaperEngineCaptureGrant();
    }
    return { ok: false, error: error.code || error.message || 'WALLPAPER_ENGINE_SCENE_START_FAILED', sessionId: startedSessionId };
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-capture-result', async (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_INVALID' };
  const matched = clearWallpaperEngineCaptureGrant(sessionId);
  let confirmed = false;
  if (matched && payload && payload.ok === true && typeof wallpaperEngineRuntime.confirmCaptureReady === 'function') {
    confirmed = await wallpaperEngineRuntime.confirmCaptureReady(sessionId).catch(() => false);
  }
  if (matched && !confirmed) {
    wallpaperEngineHostBoundsFollowupReason = '';
    await wallpaperEngineRuntime.stop(sessionId).catch(() => {});
  }
  if (matched && confirmed && wallpaperEngineHostVisibilityResumePending) {
    finishWallpaperEngineVisibleHostResume(mainWindow);
  }
  if (matched && confirmed && wallpaperEngineHostBoundsFollowupReason) {
    const followupReason = wallpaperEngineHostBoundsFollowupReason;
    wallpaperEngineHostBoundsFollowupReason = '';
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized()) return;
      scheduleWallpaperEngineHostBoundsRestart(mainWindow, followupReason);
    }, 90);
  }
  if (matched && confirmed) {
    syncWallpaperEngineDesktopIconLayering('wallpaper-engine-capture-ready').catch(() => {});
  }
  return {
    ok: matched && confirmed,
    accepted: matched,
    captureReady: confirmed,
    error: matched && !confirmed ? 'WALLPAPER_ENGINE_DWM_SURFACE_FAILED' : '',
  };
});

ipcMain.handle('stellaflix-wallpaper-engine-prepare-glass-capture', async (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_INVALID' };
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized()
    || wallpaperEngineHostVisibilitySuspended) {
    return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_HOST_HIDDEN' };
  }
  const captureOperation = wallpaperEngineCaptureOperation;
  const glassOperation = ++wallpaperEngineGlassCaptureOperation;
  try {
    const status = wallpaperEngineRuntime.getStatus();
    if (!status || status.active !== true || status.sessionId !== sessionId
      || status.captureMode !== 'dwm-thumbnail'
      || status.dwmGlassSurfaceReady !== true || status.dwmGlassSurfaceActive !== true) {
      return { ok: false, error: 'WALLPAPER_ENGINE_DWM_GLASS_SURFACE_UNAVAILABLE' };
    }
    const source = await wallpaperEngineRuntime.getDwmGlassCaptureSource(sessionId, {
      timeoutMs: 1800,
      pollIntervalMs: 60,
    });
    if (captureOperation !== wallpaperEngineCaptureOperation
      || glassOperation !== wallpaperEngineGlassCaptureOperation) {
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED' };
    }
    if (wallpaperEngineCaptureGrant && wallpaperEngineCaptureGrant.kind !== 'dwm-glass') {
      return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_GRANT_BUSY' };
    }
    clearWallpaperEngineCaptureGrant();
    const grant = createWallpaperEngineCaptureGrant({ sessionId, sourceId: source.id }, glassOperation, {
      kind: 'dwm-glass',
      captureSource: source,
    });
    if (!grant) return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_SOURCE_INVALID' };
    const prepared = await prepareWallpaperEngineRendererGlassCapture(sessionId, payload && payload.fps, source.id);
    const current = wallpaperEngineRuntime.getStatus();
    if (captureOperation !== wallpaperEngineCaptureOperation
      || glassOperation !== wallpaperEngineGlassCaptureOperation
      || !current || current.active !== true || current.sessionId !== sessionId) {
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED' };
    }
    return {
      ok: !!(prepared && prepared.ok === true),
      capturePrepared: !!(prepared && prepared.ok === true),
      captureMode: 'dwm-glass-svg-sampler',
      error: String(prepared && prepared.error || ''),
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error && (error.code || error.message || error.name) || error || 'WALLPAPER_GLASS_CAPTURE_PREPARE_FAILED').slice(0, 500),
    };
  } finally {
    if (wallpaperEngineCaptureGrant
      && wallpaperEngineCaptureGrant.kind === 'dwm-glass'
      && wallpaperEngineCaptureGrant.operation === glassOperation) {
      clearWallpaperEngineCaptureGrant(sessionId);
    }
  }
});

ipcMain.handle('stellaflix-wallpaper-engine-activate-dwm-surface', async (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_INVALID' };
  try {
    const result = await wallpaperEngineRuntime.activateDwmSurface(sessionId);
    return {
      ok: !!(result && result.dwmSurfaceActive === true),
      active: !!(result && result.dwmSurfaceActive === true),
      captureMode: 'dwm-thumbnail',
      error: result && result.dwmSurfaceActive === true ? '' : 'WALLPAPER_ENGINE_DWM_SURFACE_FAILED',
    };
  } catch (error) {
    return { ok: false, active: false, error: String(error && (error.code || error.message) || error || 'WALLPAPER_ENGINE_DWM_SURFACE_FAILED') };
  }
});

ipcMain.on('stellaflix-wallpaper-engine-glass-surface', (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event) || typeof wallpaperEngineRuntime.updateGlassSurface !== 'function') return;
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return;
  if (payload.active === true && (!mainWindow
    || mainWindow.isDestroyed()
    || !mainWindow.isVisible()
    || mainWindow.isMinimized()
    || wallpaperEngineHostVisibilitySuspended)) return;
  try { wallpaperEngineRuntime.updateGlassSurface(sessionId, payload); } catch (_) { }
});

ipcMain.on('stellaflix-wallpaper-engine-pointer-activity', (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event)
    || !mainWindow
    || mainWindow.isDestroyed()
    || !mainWindow.isVisible()
    || mainWindow.isMinimized()
    || wallpaperEngineHostVisibilitySuspended) return;
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return;
  const rawXUnit = payload && payload.xUnit;
  const rawYUnit = payload && payload.yUnit;
  const xUnit = Math.round(rawXUnit);
  const yUnit = Math.round(rawYUnit);
  if (typeof rawXUnit !== 'number' || typeof rawYUnit !== 'number'
    || !Number.isFinite(xUnit) || !Number.isFinite(yUnit)
    || xUnit < 0 || xUnit > 65535 || yUnit < 0 || yUnit > 65535) return;
  const status = wallpaperEngineRuntime.getStatus();
  if (!status
    || status.active !== true
    || status.sourceWindowParked !== true
    || String(status.sessionId || '') !== sessionId
    || typeof wallpaperEngineRuntime.noteHostPointerActivity !== 'function') return;
  try {
    wallpaperEngineRuntime.noteHostPointerActivity({ sessionId, xUnit, yUnit });
  } catch (_) { }
});

ipcMain.handle('stellaflix-wallpaper-engine-stop-scene', async (event, payload = {}) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const sessionId = String(payload.sessionId || '');
    const stopAll = payload && payload.all === true || !sessionId;
    // Invalidate pending preparation before awaiting the old source shutdown.
    // Otherwise a new start can begin during the close wait and then be
    // incorrectly superseded when this stop handler resumes.
    if (stopAll) {
      wallpaperEngineCaptureOperation += 1;
      cancelWallpaperEngineHostBoundsRestart();
      clearWallpaperEngineCaptureGrant();
    }
    const result = await wallpaperEngineRuntime.stop(stopAll ? '' : sessionId);
    const current = wallpaperEngineRuntime.getStatus();
    if (!stopAll && (!current.active || (wallpaperEngineCaptureGrant && wallpaperEngineCaptureGrant.sessionId === sessionId))) {
      clearWallpaperEngineCaptureGrant(sessionId);
    }
    return result;
  } catch (error) {
    return { ok: false, error: error.code || error.message || 'WALLPAPER_ENGINE_SCENE_STOP_FAILED' };
  }
});

// ===== 升级：用 2.1.0 DesktopWallpaperRuntime 替换内联壁纸窗口实现 =====
// 获得 DPI 感知、WS_CHILD/WS_POPUP 样式改写、JSON ack 校验、abort、代际锁、显示变更重连。
// 保留 stellaflix-wallpaper-* IPC 与现有 wallpaper.html（独立壁纸窗口机制）。
wallpaperRuntime = new DesktopWallpaperRuntime({
  BrowserWindow,
  screen,
  execFileImpl: execFile,
  overlayUrl: () => overlayUrl('wallpaper.html'),
  preloadPath: path.join(__dirname, 'overlay-preload.js'),
  logger: console,
  onStatus: (status) => {
    try {
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('stellaflix-wallpaper-status', status);
      }
    } catch (_) { /* noop */ }
  },
});

// ===== 全桌面模式运行时（FullDesktopModeRuntime，来自 2.1.0） =====
// 把主窗口重父化到 WorkerW 桌面层 + 桌面图标分层；依赖 wallpaper-mode-runtime(attach)
// + desktop-icon-shape-runtime + desktop-native-icon-layer-runtime（均已复制）。
// 独立命名空间 stellaflix-full-desktop-mode-*，与 stellaflix-wallpaper-*（独立壁纸窗口）并存。
fullDesktopNativeTemp = path.join(os.tmpdir(), 'stellaflix-native-helpers');
fullDesktopModeRuntime = new FullDesktopModeRuntime({
  screen,
  platform: process.platform,
  execFileImpl: execFile,
  nativeTempPath: fullDesktopNativeTemp,
  // beforePassive：进入 full-desktop passive 模式前，停止原生 WE 会话并由渲染层画静态预览
  // （来自 2.1.0 #11 prepareWallpaperEngineProjectPreviewBeforeDesktopEmbedding，Tier1 改名）。
  beforePassive: ({ win, reason }) => prepareWallpaperEngineProjectPreviewBeforeDesktopEmbedding(win, reason),
  onStatus: (status) => {
    // T154 协作：全桌面模式激活（iconShapeActive）时，它用 setShape 挖桌面图标洞，
    // 本模块必须交出 setShape 控制权；退出后解除锁定并重新应用窗口圆角。
    try {
      if (mainWindowCornerShape) {
        const desktopOwnsShape = !!(status && status.iconShapeActive === true);
        setCornerShapeLocked(desktopOwnsShape);
        if (!desktopOwnsShape && mainWindow && !mainWindow.isDestroyed()
          && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
          mainWindowCornerShape.apply();
        }
      }
    } catch (_) { /* noop */ }
    try {
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('stellaflix-full-desktop-mode-status', status);
      }
    } catch (_) { /* noop */ }
  },
});

// ===== Path B：Steam Wallpaper Engine 集成（来自 2.1.0） =====
// 实例化库与运行时；hostElevationProbe 在 v24 运行时无对应实现，省略（runtime 有默认值）。
function createDisabledWallpaperEngineRuntime() {
  const emptyStatus = Object.freeze({ active: null, pending: null, sessionId: '', running: false, visible: false });
  return {
    active: null,
    pending: null,
    getStatus: () => emptyStatus,
    probe: async () => ({ ok: false, running: false }),
    start: async () => ({ ok: false, error: 'Wallpaper Engine disabled by STELLAFLIX_DISABLE_WALLPAPER' }),
    stop: async () => {},
    dispose: async () => {},
    updateDwmDesktopIconLayering: async () => ({ ok: true }),
    refreshActiveSource: async () => ({ ok: false }),
    embedActiveWindow: async () => ({ ok: false }),
    revealWorkshop: async () => {},
    confirmCaptureReady: async () => false,
    getDwmGlassCaptureSource: async () => null,
    activateDwmSurface: async () => ({ ok: false }),
    updateGlassSurface: () => {},
    noteHostPointerActivity: () => {},
  };
}
wallpaperEngineLibrary = new WallpaperEngineLibrary({ userDataPath: app.getPath('userData') });
wallpaperEngineRuntime = WallpaperEngineRuntime
  ? new WallpaperEngineRuntime({
      library: wallpaperEngineLibrary,
      desktopCapturer,
      nativeTempPath: fullDesktopNativeTemp,
      onStatus: (status) => broadcastDesktopWallpaperStatus(status),
    })
  : createDisabledWallpaperEngineRuntime();

function closeOverlayWindows() {
  closeDesktopLyricsWindow();
  if (wallpaperRuntime) wallpaperRuntime.stop('app-exit').catch(() => {});
}

ipcMain.handle('desktop-window-minimize', (event) => {
  getSenderWindow(event)?.minimize();
});

ipcMain.handle('desktop-window-toggle-maximize', (event) => {
  toggleFullscreen(getSenderWindow(event));
});

ipcMain.handle('desktop-window-toggle-fullscreen', (event) => {
  toggleFullscreen(getSenderWindow(event));
});

ipcMain.handle('desktop-window-exit-fullscreen-windowed', (event) => {
  exitFullscreenToWindow(getSenderWindow(event));
});

ipcMain.handle('desktop-window-get-state', (event) => {
  return getWindowState(getSenderWindow(event));
});

ipcMain.handle('desktop-window-close', (event) => {
  getSenderWindow(event)?.close();
});

ipcMain.handle('stellaflix-hotkeys-configure-global', (_event, bindings) => {
  return configureMineradioGlobalHotkeys(bindings);
});

ipcMain.handle('stellaflix-export-json-file', async (event, payload = {}) => {
  try {
    const owner = getSenderWindow(event);
    const defaultName = String(payload.defaultName || 'stellaflix-export.json').replace(/[\\/:*?"<>|]+/g, '-');
    const result = await dialog.showSaveDialog(owner, {
      title: '导出 Stellaflix 存档',
      defaultPath: defaultName.toLowerCase().endsWith('.json') ? defaultName : `${defaultName}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const text = typeof payload.text === 'string' ? payload.text : JSON.stringify(payload.data || {}, null, 2);
    fs.writeFileSync(result.filePath, text, 'utf8');
    return { ok: true, filePath: result.filePath };
  } catch (e) {
    return { ok: false, error: e.message || 'EXPORT_FAILED' };
  }
});

ipcMain.handle('stellaflix-import-json-file', async (event) => {
  try {
    const owner = getSenderWindow(event);
    const result = await dialog.showOpenDialog(owner, {
      title: '导入 Stellaflix 存档',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    const text = fs.readFileSync(filePath, 'utf8');
    return { ok: true, filePath, text };
  } catch (e) {
    return { ok: false, error: e.message || 'IMPORT_FAILED' };
  }
});

// 影视态 home 海报：原生图片选择对话框（替代 <input type="file"> .click()，Electron 下更可靠）
ipcMain.handle('stellaflix-pick-image', async (event) => {
  try {
    const owner = getSenderWindow(event);
    const result = await dialog.showOpenDialog(owner, {
      title: '选择海报图片',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    // 读取文件并转为 base64 data URL（与现有 posterStore 格式一致）
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
    const mime = mimeMap[ext] || 'image/jpeg';
    const b64 = buf.toString('base64');
    return { ok: true, dataUrl: 'data:' + mime + ';base64,' + b64, fileName: path.basename(filePath) };
  } catch (e) {
    return { ok: false, error: e.message || 'PICK_IMAGE_FAILED' };
  }
});

// 影视态 home 自定义海报持久化：改用 userData 文件存储，
// 彻底绕开 localStorage 配额上限（base64 本地大图易超限导致跨启动丢失）
// 与端口/origin 不一致（findOpenPort 在端口冲突时跳变导致 localStorage 不跨启动）的不确定性。
const VIDEO_POSTER_FILE = path.join(app.getPath('userData'), 'video-poster.json');
ipcMain.handle('stellaflix-video-poster', async (event, action, payload) => {
  try {
    if (action === 'get') {
      try {
        const text = await fs.promises.readFile(VIDEO_POSTER_FILE, 'utf8');
        return { ok: true, data: JSON.parse(text) };
      } catch (e) {
        // 文件不存在/损坏 → 视为无自定义海报
        return { ok: true, data: null };
      }
    } else if (action === 'set') {
      await fs.promises.writeFile(VIDEO_POSTER_FILE, JSON.stringify(payload || {}), 'utf8');
      return { ok: true };
    } else if (action === 'clear') {
      try { await fs.promises.unlink(VIDEO_POSTER_FILE); } catch (e) { /* 不存在即无需删 */ }
      return { ok: true };
    }
    return { ok: false, error: 'UNKNOWN_ACTION' };
  } catch (e) {
    return { ok: false, error: e.message || 'VIDEO_POSTER_FAILED' };
  }
});

// 影视模块追片/片单/历史海报本地缓存：存 base64 data URL 到 userData/poster-cache.json，
// 避免 image.tmdb.org 在国内网络环境下偶发不可达导致海报白图。
const POSTER_CACHE_FILE = path.join(app.getPath('userData'), 'poster-cache.json');
ipcMain.handle('stellaflix-poster-cache', async (event, action, payload) => {
  try {
    if (action === 'get') {
      const key = payload;
      try {
        const text = await fs.promises.readFile(POSTER_CACHE_FILE, 'utf8');
        const all = JSON.parse(text);
        return { ok: true, data: (key && all && typeof all[key] === 'string') ? all[key] : null };
      } catch (e) {
        return { ok: true, data: null };
      }
    } else if (action === 'set') {
      const key = payload && payload.key;
      const dataUrl = payload && payload.dataUrl;
      if (!key || !dataUrl) return { ok: false, error: 'INVALID_PAYLOAD' };
      let all = {};
      try {
        const text = await fs.promises.readFile(POSTER_CACHE_FILE, 'utf8');
        all = JSON.parse(text);
      } catch (e) { /* 文件不存在或损坏 → 空对象 */ }
      all[key] = dataUrl;
      await fs.promises.writeFile(POSTER_CACHE_FILE, JSON.stringify(all), 'utf8');
      return { ok: true };
    } else if (action === 'clear') {
      try { await fs.promises.unlink(POSTER_CACHE_FILE); } catch (e) { /* 不存在即无需删 */ }
      return { ok: true };
    } else if (action === 'remove') {
      // 取消追片 / 移除片单时按 key 删除单条海报缓存，避免本地缓存无限膨胀
      const key = payload;
      if (!key) return { ok: false, error: 'INVALID_KEY' };
      let all = {};
      try {
        const text = await fs.promises.readFile(POSTER_CACHE_FILE, 'utf8');
        all = JSON.parse(text);
      } catch (e) { return { ok: true }; } // 文件不存在 → 无需删
      if (all[key]) {
        delete all[key];
        await fs.promises.writeFile(POSTER_CACHE_FILE, JSON.stringify(all), 'utf8');
      }
      return { ok: true };
    }
    return { ok: false, error: 'UNKNOWN_ACTION' };
  } catch (e) {
    return { ok: false, error: e.message || 'POSTER_CACHE_FAILED' };
  }
});

// 影视态解析页真实媒体直链嗅探（生产路径）：主进程隐藏窗口加载解析器/剧集页，
// 从网络层捕获评分最高的媒体 URL 并返回给渲染进程，用于替代渲染进程 <webview> getWebContents() 不可用场景。
ipcMain.handle('stellaflix-resolve-media-sniff', async (_event, payload = {}) => {
  try {
    const url = payload && payload.url;
    if (!url) return { ok: false, error: 'NO_URL' };
    console.log('[EMBED-SNIFF] resolve start: ' + url);
    const best = await sniffBestMediaUrl({ BrowserWindow: BrowserWindow }, {
      url: url,
      partition: 'persist:stellaflix-embed-sniff',
      timeoutMs: (payload && payload.timeoutMs) || 12000,
      maxCandidates: (payload && payload.maxCandidates) || 30
    });
    console.log('[EMBED-SNIFF] resolve end: ' + (best ? best.url + ' (score=' + best.score + ')' : 'null'));
    return { ok: !!best, best: best };
  } catch (e) {
    console.warn('[EMBED-SNIFF] resolve error:', e && e.message);
    return { ok: false, error: e.message || 'SNIFF_FAILED' };
  }
});

// 影视态验证码闭环：从 webview 专用分区(persist:stellaflix-captcha)读回验证码 cookie，
// 供重查请求注入 Cookie 头（对齐 Kazumi 验证码流程）。该分区仅用于验证码解出，
// 故返回其全部 cookie（searchURL 仅作日志/透传，主进程不按 URL 过滤）。
ipcMain.handle('stellaflix-get-captcha-cookies', async (_event, payload = {}) => {
  try {
    const searchURL = (payload && payload.searchURL) || null;
    const part = session.fromPartition('persist:stellaflix-captcha');
    const cookies = await part.cookies.get({});
    console.log('[CAPTCHA-COOKIE] 读取分区 cookie 数: ' + (cookies ? cookies.length : 0) +
      (searchURL ? ' (searchURL=' + String(searchURL).slice(0, 80) + ')' : ''));
    return {
      ok: true,
      cookies: (cookies || []).map(function (c) {
        return { name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly };
      })
    };
  } catch (e) {
    console.warn('[CAPTCHA-COOKIE] 读取失败:', e && e.message);
    return { ok: false, error: e.message || 'COOKIE_READ_FAILED', cookies: [] };
  }
});

function customSourceSnapshot(extra = {}) {
  if (!customSourceManager) return { items: [], active: false, activeId: '', sources: {}, ...extra };
  return { items: customSourceManager.list(), ...customSourceManager.getStatus(), ...extra };
}

function requireCustomSourceManager(event) {
  if (!customSourceManager) throw new Error('CUSTOM_SOURCE_UNAVAILABLE');
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('CUSTOM_SOURCE_UNAUTHORIZED');
  }
  return customSourceManager;
}

function sendCustomSourceStatus(extra = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('stellaflix-custom-source-status', customSourceSnapshot(extra));
}

async function chooseCustomSourceScript(event, title) {
  const result = await dialog.showOpenDialog(getSenderWindow(event), {
    title,
    properties: ['openFile'],
    filters: [{ name: '落雪自定义音源脚本', extensions: ['js'] }],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const filePath = result.filePaths[0];
  if (path.extname(filePath).toLowerCase() !== '.js') throw new Error('IMPORT_INVALID: 请选择 .js 音源脚本');
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('IMPORT_INVALID: 请选择有效的音源脚本文件');
  if (stat.size > MAX_SCRIPT_BYTES) throw new Error('IMPORT_INVALID: 音源脚本不能超过 1 MB');
  return { sourceFileName: path.basename(filePath), script: fs.readFileSync(filePath, 'utf8') };
}

ipcMain.handle('stellaflix-custom-source-list', event => {
  requireCustomSourceManager(event);
  return customSourceSnapshot();
});

ipcMain.handle('stellaflix-custom-source-import', async event => {
  const manager = requireCustomSourceManager(event);
  const selected = await chooseCustomSourceScript(event, '导入落雪自定义音源');
  if (!selected) return customSourceSnapshot({ canceled: true });
  await manager.importScript(selected.script, selected.sourceFileName);
  return customSourceSnapshot();
});

ipcMain.handle('stellaflix-custom-source-replace', async (event, id) => {
  const manager = requireCustomSourceManager(event);
  const selected = await chooseCustomSourceScript(event, '替换落雪自定义音源');
  if (!selected) return customSourceSnapshot({ canceled: true });
  await manager.replaceScript(String(id || ''), selected.script, selected.sourceFileName);
  return customSourceSnapshot();
});

ipcMain.handle('stellaflix-custom-source-activate', async (event, id) => {
  await requireCustomSourceManager(event).activate(String(id || ''));
  return customSourceSnapshot();
});

ipcMain.handle('stellaflix-custom-source-deactivate', async event => {
  await requireCustomSourceManager(event).deactivate();
  return customSourceSnapshot();
});

ipcMain.handle('stellaflix-custom-source-remove', async (event, id) => {
  await requireCustomSourceManager(event).remove(String(id || ''));
  return customSourceSnapshot();
});

ipcMain.handle('stellaflix-custom-source-set-update-alert', (event, id, enabled) => {
  requireCustomSourceManager(event).setAllowUpdateAlert(String(id || ''), !!enabled);
  return customSourceSnapshot();
});

const { parseScriptInfo } = require('./custom-source/protocol');
const BUNDLED_SOURCES_DIR = path.join(__dirname, 'custom-source', 'bundled');

ipcMain.handle('stellaflix-custom-source-bundled-list', () => {
  let entries = [];
  try {
    entries = fs.readdirSync(BUNDLED_SOURCES_DIR).filter(name => /\.js$/i.test(name));
  } catch {
    return [];
  }
  const result = [];
  for (const fileName of entries) {
    const filePath = path.join(BUNDLED_SOURCES_DIR, fileName);
    let raw;
    try { raw = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    let info;
    try { info = parseScriptInfo(raw); } catch { continue; }
    result.push({ fileName, name: info.name || fileName, version: info.version || '', author: info.author || '' });
  }
  return result;
});

ipcMain.handle('stellaflix-custom-source-bundled-import', async (event, fileName) => {
  const manager = requireCustomSourceManager(event);
  if (typeof fileName !== 'string' || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
    throw new Error('IMPORT_INVALID: 无效的内置音源文件名');
  }
  const filePath = path.join(BUNDLED_SOURCES_DIR, fileName);
  let script;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SCRIPT_BYTES) throw new Error('file invalid');
    script = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error('IMPORT_INVALID: 找不到内置音源文件');
  }
  await manager.importScript(script, fileName);
  return customSourceSnapshot();
});

// ---------- 内置音源跟随上游更新(manifest 声明仓库坐标,多线路拉取+校验+原子落盘) ----------
const bundledSourceUpdater = require('./custom-source/bundled-updater');

// 走 Electron net.fetch 遵循系统代理;不可用时退回全局 fetch。
function bundledUpdateFetch() {
  try {
    const electronNet = require('electron').net;
    if (electronNet && typeof electronNet.fetch === 'function') return electronNet.fetch;
  } catch {}
  return typeof fetch === 'function' ? fetch : null;
}

ipcMain.handle('stellaflix-custom-source-bundled-check-updates', async event => {
  try {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error('CUSTOM_SOURCE_UNAUTHORIZED');
    }
    const fetchImpl = bundledUpdateFetch();
    if (!fetchImpl) throw new Error('UPDATE_FETCH_UNAVAILABLE');
    const results = await bundledSourceUpdater.checkBundledUpdates(BUNDLED_SOURCES_DIR, { fetchImpl });
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message || 'BUNDLED_UPDATE_CHECK_FAILED', results: [] };
  }
});

ipcMain.handle('stellaflix-custom-source-bundled-apply-update', async (event, fileName) => {
  try {
    const manager = requireCustomSourceManager(event);
    const result = await bundledSourceUpdater.checkAndUpdateBundledSource(BUNDLED_SOURCES_DIR, fileName, { fetchImpl: bundledUpdateFetch() });
    // 已启用的导入副本来自同一内置文件时,热替换脚本(校验通过后原子换 runtime)
    if (result.updated && result.script && customSourceManager) {
      const activeId = customSourceManager.getStatus().activeId;
      const activeItem = customSourceManager.list().find(item => item.id === activeId);
      if (activeItem && activeItem.sourceFileName === result.sourceFileName) {
        await manager.replaceScript(activeId, result.script, result.sourceFileName);
        result.hotReplaced = true;
      }
    }
    return result;
  } catch (e) {
    return { ok: false, error: e.message || 'BUNDLED_UPDATE_FAILED' };
  }
});

// ---------- 本地音乐库 IPC(移植自 1.5.7,授权根目录与 /api/local-file 同一契约) ----------
function requireLocalMusicSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('LOCAL_MUSIC_UNAUTHORIZED');
  }
}

ipcMain.handle('stellaflix-local-music-choose-folder', async (event) => {
  try {
    requireLocalMusicSender(event);
    const owner = getSenderWindow(event) || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: '选择本地音乐文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, canceled: true };
    return await localMusic.scanLocalMusicFolder(result.filePaths[0]);
  } catch (e) {
    return { ok: false, error: e.message || 'LOCAL_LIBRARY_CHOOSE_FAILED' };
  }
});

ipcMain.handle('stellaflix-local-music-scan-folder', async (_event, folderPath, options) => {
  try {
    if (!folderPath) return { ok: false, error: 'LOCAL_LIBRARY_PATH_EMPTY' };
    return await localMusic.scanLocalMusicFolder(folderPath, options || {});
  } catch (e) {
    return { ok: false, error: e.message || 'LOCAL_LIBRARY_SCAN_FAILED' };
  }
});

ipcMain.handle('stellaflix-local-music-refresh-entries', async (_event, folderPath, files) => {
  try {
    if (!folderPath) return { ok: false, error: 'LOCAL_LIBRARY_PATH_EMPTY' };
    return await localMusic.refreshLocalMusicFileEntries(folderPath, files);
  } catch (e) {
    return { ok: false, error: e.message || 'LOCAL_LIBRARY_REFRESH_FAILED' };
  }
});

ipcMain.handle('stellaflix-local-file-read-range', async (_event, filePath, start, end) => {
  try {
    return await localMusic.readAuthorizedLocalFileRange(filePath, start, end);
  } catch (e) {
    return { ok: false, error: e.message || 'LOCAL_FILE_READ_FAILED' };
  }
});

ipcMain.handle('stellaflix-local-file-read-data-url', async (_event, filePath) => {
  try {
    return await localMusic.readAuthorizedLocalFileDataUrl(filePath);
  } catch (e) {
    return { ok: false, error: e.message || 'LOCAL_FILE_READ_FAILED' };
  }
});

ipcMain.handle('netease-music-open-login', async (event) => {
  return openNeteaseMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('netease-music-clear-login', async () => {
  return clearNeteaseMusicLoginSession();
});

ipcMain.handle('qq-music-open-login', async (event) => {
  return openQQMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('qq-music-clear-login', async () => {
  return clearQQMusicLoginSession();
});

ipcMain.handle('stellaflix-open-update-installer', async (_event, filePath) => {
  try {
    const target = path.resolve(String(filePath || ''));
    const updateDir = path.resolve(getUpdateDownloadDir());
    if (!target || !target.startsWith(updateDir + path.sep)) {
      return { ok: false, error: 'INVALID_UPDATE_PATH' };
    }
    if (!fs.existsSync(target)) return { ok: false, error: 'UPDATE_FILE_MISSING' };
    const error = await shell.openPath(target);
    return error ? { ok: false, error } : { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'OPEN_UPDATE_FAILED' };
  }
});

ipcMain.handle('stellaflix-restart-app', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'RESTART_FAILED' };
  }
});

ipcMain.handle('stellaflix-desktop-lyrics-set-enabled', async (_event, enabled, payload) => {
  try {
    if (enabled) {
      createDesktopLyricsWindow(payload || {});
      broadcastDesktopLyricsEnabledState(true);
    } else {
      closeDesktopLyricsWindow();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_FAILED' };
  }
});

ipcMain.handle('stellaflix-desktop-lyrics-update', async (_event, payload) => {
  try {
    const nextState = { ...desktopLyricsState, ...(payload || {}) };
    if (nextState.enabled) {
      createDesktopLyricsWindow(payload || {});
    } else if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
      desktopLyricsState = nextState;
      sendDesktopLyricsState();
    } else {
      desktopLyricsState = nextState;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_UPDATE_FAILED' };
  }
});

ipcMain.handle('stellaflix-desktop-lyrics-set-dragging', async () => {
  return { ok: true };
});

ipcMain.handle('stellaflix-desktop-lyrics-set-pointer-capture', async (_event, active) => {
  try {
    desktopLyricsPointerCapture = !!active;
    applyDesktopLyricsMouseBehavior();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_POINTER_FAILED' };
  }
});

ipcMain.handle('stellaflix-desktop-lyrics-set-hot-bounds', async (_event, bounds) => {
  try {
    const left = clampNumber(bounds && bounds.left, -2000, 4000, 0);
    const top = clampNumber(bounds && bounds.top, -2000, 4000, 0);
    const right = clampNumber(bounds && bounds.right, left + 1, 6000, left + 1);
    const bottom = clampNumber(bounds && bounds.bottom, top + 1, 6000, top + 1);
    desktopLyricsHotBounds = { left, top, right, bottom };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_HOT_BOUNDS_FAILED' };
  }
});

ipcMain.handle('stellaflix-desktop-lyrics-set-lock-state', async (_event, locked) => {
  try {
    desktopLyricsState = { ...desktopLyricsState, clickThrough: !!locked };
    if (desktopLyricsState.clickThrough !== false) desktopLyricsPointerCapture = false;
    applyDesktopLyricsMouseBehavior();
    broadcastDesktopLyricsLockState();
    return { ok: true, locked: desktopLyricsState.clickThrough !== false };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_LOCK_FAILED' };
  }
});

ipcMain.handle('stellaflix-desktop-lyrics-move-by', async (_event, dx, dy) => {
  try {
    if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return { ok: false, error: 'NO_DESKTOP_LYRICS_WINDOW' };
    if (desktopLyricsState.clickThrough !== false) return { ok: false, error: 'DESKTOP_LYRICS_LOCKED' };
    const bounds = desktopLyricsWindow.getBounds();
    const next = {
      ...bounds,
      x: Math.round(bounds.x + clampNumber(dx, -160, 160, 0)),
      y: Math.round(bounds.y + clampNumber(dy, -160, 160, 0)),
    };
    desktopLyricsWindow.setBounds(next, false);
    desktopLyricsUserBounds = desktopLyricsWindow.getBounds();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_MOVE_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-set-enabled', async (_event, enabled, payload) => {
  try {
    if (enabled) await wallpaperRuntime.start({ ...(payload || {}), enabled: true });
    else await wallpaperRuntime.stop('disabled');
    return { ok: true, status: wallpaperRuntime.getStatus('ipc-set-enabled') };
  } catch (e) {
    return { ok: false, error: e.message || 'WALLPAPER_FAILED' };
  }
});

ipcMain.handle('stellaflix-wallpaper-update', async (_event, payload) => {
  try {
    const result = await wallpaperRuntime.update(payload || {});
    return { ok: result && result.ok !== false, status: wallpaperRuntime.getStatus('ipc-update') };
  } catch (e) {
    return { ok: false, error: e.message || 'WALLPAPER_UPDATE_FAILED' };
  }
});

// ===== 全桌面模式 IPC（stellaflix-full-desktop-mode-*，独立于 stellaflix-wallpaper-*） =====
function registerFullDesktopEscapeShortcut() {
  if (fullDesktopEscapeRegistered) return true;
  try {
    fullDesktopEscapeRegistered = globalShortcut.register('Escape', () => {
      if (!fullDesktopModeRuntime) return;
      if (fullDesktopEscapeExitPending) return;
      const status = fullDesktopModeRuntime.getStatus();
      const enabling = status.phase === 'enabling' || status.phase === 'attaching';
      if (!fullDesktopModeRuntime.isEnabled() && !enabling) return;
      fullDesktopEscapeExitPending = true;
      Promise.resolve(fullDesktopModeRuntime.disable('escape-key'))
        .catch(() => {})
        .finally(() => {
          fullDesktopEscapeExitPending = false;
          syncFullDesktopEscapeShortcut();
        });
    });
  } catch (_) { fullDesktopEscapeRegistered = false; }
  return fullDesktopEscapeRegistered === true;
}

function unregisterFullDesktopEscapeShortcut() {
  if (fullDesktopEscapeRegistered) {
    try { globalShortcut.unregister('Escape'); } catch (_) { /* noop */ }
  }
  fullDesktopEscapeRegistered = false;
}

function syncFullDesktopEscapeShortcut() {
  if (fullDesktopModeRuntime && fullDesktopModeRuntime.isEnabled()) registerFullDesktopEscapeShortcut();
  else unregisterFullDesktopEscapeShortcut();
}

function hookExplorerRestartForFullDesktop(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed() || typeof win.hookWindowMessage !== 'function') return;
  if (win.__stellaflixTaskbarCreatedHookPending || win.__stellaflixTaskbarCreatedMessageId) return;
  win.__stellaflixTaskbarCreatedHookPending = true;
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class StellaflixShellMessage {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern uint RegisterWindowMessage(string messageName);
}
"@
[StellaflixShellMessage]::RegisterWindowMessage("TaskbarCreated")
`;
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    timeout: 5000,
    env: { ...process.env, TEMP: fullDesktopNativeTemp, TMP: fullDesktopNativeTemp },
  }, (error, stdout) => {
    win.__stellaflixTaskbarCreatedHookPending = false;
    if (error || win.isDestroyed()) return;
    const messageId = Number.parseInt(String(stdout || '').trim(), 10);
    if (!Number.isInteger(messageId) || messageId <= 0) return;
    win.__stellaflixTaskbarCreatedMessageId = messageId;
    try {
      win.hookWindowMessage(messageId, () => {
        if (fullDesktopModeRuntime && fullDesktopModeRuntime.isEnabled()) {
          fullDesktopModeRuntime.reconcile('explorer-restart').catch(() => {});
        }
      });
    } catch (_) { /* noop */ }
  });
}

ipcMain.handle('stellaflix-full-desktop-mode-get-status', async () => {
  try {
    const status = fullDesktopModeRuntime.getStatus('ipc-query');
    return { ok: true, enabled: status.enabled === true, interactive: status.interactive === true, status };
  } catch (e) { return { ok: false, error: e.message || 'FULL_DESKTOP_STATUS_FAILED' }; }
});

ipcMain.handle('stellaflix-full-desktop-mode-enable', async (_event, payload) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: 'MAIN_WINDOW_UNAVAILABLE' };
    const result = await fullDesktopModeRuntime.enable(mainWindow, {
      interactive: !(payload && payload.interactive === false),
      reason: 'ipc-enable',
    });
    syncFullDesktopEscapeShortcut();
    return { ok: result && result.ok !== false, enabled: result && result.enabled === true, interactive: result && result.interactive === true, status: fullDesktopModeRuntime.getStatus('ipc-enable-result') };
  } catch (e) { return { ok: false, error: e.message || 'FULL_DESKTOP_ENABLE_FAILED' }; }
});

ipcMain.handle('stellaflix-full-desktop-mode-disable', async () => {
  try {
    const result = await fullDesktopModeRuntime.disable('ipc-disable');
    syncFullDesktopEscapeShortcut();
    return { ok: result && result.ok !== false, enabled: false, status: fullDesktopModeRuntime.getStatus('ipc-disable-result') };
  } catch (e) { return { ok: false, error: e.message || 'FULL_DESKTOP_DISABLE_FAILED' }; }
});

ipcMain.handle('stellaflix-full-desktop-mode-set-interactive', async (_event, payload) => {
  try {
    const result = await fullDesktopModeRuntime.setInteractive(!!(payload && payload.interactive), 'ipc-set-interactive');
    syncFullDesktopEscapeShortcut();
    return { ok: result && result.ok !== false, interactive: fullDesktopModeRuntime.isInteractive(), status: fullDesktopModeRuntime.getStatus('ipc-set-interactive-result') };
  } catch (e) { return { ok: false, error: e.message || 'FULL_DESKTOP_INTERACTIVE_FAILED' }; }
});

ipcMain.handle('stellaflix-full-desktop-mode-toggle-interactive', async () => {
  try {
    const result = await fullDesktopModeRuntime.toggleInteractive('ipc-toggle');
    syncFullDesktopEscapeShortcut();
    return { ok: result && result.ok !== false, interactive: fullDesktopModeRuntime.isInteractive(), status: fullDesktopModeRuntime.getStatus('ipc-toggle-result') };
  } catch (e) { return { ok: false, error: e.message || 'FULL_DESKTOP_TOGGLE_FAILED' }; }
});


async function createWindow() {
  htmlFullscreenActive = false;
  windowFullscreenActive = false;
  const port = await findOpenPort(3000);
  mainServerPort = port;

  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(port);
  process.env.COOKIE_FILE = path.join(app.getPath('userData'), '.cookie');
  process.env.QQ_COOKIE_FILE = path.join(app.getPath('userData'), '.qq-cookie');
  process.env.STELLAFLIX_UPDATE_DIR = getUpdateDownloadDir();
  // 本地音乐库:令牌必须在 require server.js 之前写入环境(模块加载时即读取),端口供播放代理 URL 使用。
  localMusic.setLocalMusicProxyPort(port);
  process.env.STELLAFLIX_LOCAL_FILE_TOKEN = localMusic.getLocalFileToken();
  try {
    const legacyQQCookie = path.join(__dirname, '..', '.qq-cookie');
    if (fs.existsSync(legacyQQCookie)) {
      if (!fs.existsSync(process.env.QQ_COOKIE_FILE)) {
        fs.copyFileSync(legacyQQCookie, process.env.QQ_COOKIE_FILE);
      }
      fs.unlinkSync(legacyQQCookie);
    }
  } catch (e) {
    console.warn('QQ cookie migration skipped:', e.message);
  }

  localServer = require(path.join(__dirname, '..', 'server.js'));
  // 注入授权校验:让 HTTP 本地文件代理复用与 IPC 相同的授权根目录约束,堵住越权读取任意文件。
  localServer.setLocalFileAuthorizer(localMusic.resolveAuthorizedLocalFile);
  if (!customSourceManager) {
    customSourceAudioProxy = new CustomSourceAudioProxy();
    customSourceManager = new CustomSourceManager({
      userDataPath: app.getPath('userData'),
      app,
      BrowserWindow,
      ipcMain,
    });
    customSourceManager.on('status', status => sendCustomSourceStatus(status));
    customSourceManager.on('updateAlert', updateAlert => sendCustomSourceStatus({ updateAlert }));
    customSourceManager.on('runtimeError', error => sendCustomSourceStatus({ error: error.message || 'RUNTIME_STOP_FAILED' }));
    await customSourceManager.startActive();
  }
  localServer.setCustomSourceBridge({
    resolve: payload => customSourceManager.resolveFallback(payload),
    issue: remoteUrl => customSourceAudioProxy.issue(remoteUrl),
    pipe: (ticket, req, res) => customSourceAudioProxy.pipe(ticket, req, res),
  });
  await waitForServer(localServer);

  const initialBounds = getWindowedBounds();

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 960,
    minHeight: 540,
    show: false,
    frame: false,
    fullscreen: false,
    // 圆角方案（T154）：OS 级强制圆角 + 透明窗口兜底。
    // Windows 11 通过 DWM API 设置 DWMWCP_ROUND；旧版 Windows 通过 setShape 近似圆角矩形。
    // 前端仍保留 border-radius/overflow 作为视觉兜底，但不再依赖 buggy CSS 裁剪决定窗口形状。
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    autoHideMenuBar: true,
    title: APP_NAME,
    icon: APP_ICON_ICO,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  // 窗口透明，无需设置背景材料（对齐 2.1.0；透明窗口下 setBackgroundMaterial 无意义）。

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    sendWindowState(mainWindow);
    // D8 修复：应用加载完成后再注册导航守卫，避免拦截初始 loadURL。
    // 拦截主窗口离开应用同源的导航（Electron 后退手势 / 外部链接），防 about:blank 白屏。
    mainWindow.webContents.on('will-navigate', (event, url) => {
      try {
        const cur = mainWindow.webContents.getURL();
        if (!cur) return; // 无法判定则放行
        let curOrigin, targetOrigin = null;
        try { curOrigin = new URL(cur).origin; } catch (_) { return; }
        try { targetOrigin = new URL(url).origin; } catch (_) { targetOrigin = null; }
        if (targetOrigin && targetOrigin !== curOrigin) {
          event.preventDefault();
        }
      } catch (_) {}
    });
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'Escape' || input.code === 'Escape') && mainWindow.isFullScreen()) {
      event.preventDefault();
      exitFullscreenToWindow(mainWindow);
    }
  });

  mainWindow.once('ready-to-show', () => {
    // 圆角方案（T152）：透明窗口自身四角透明（border-radius + overflow:hidden 裁圆角，弃用 clip-path）。
    mainWindow.show();
    sendWindowState(mainWindow);
  });

  // 默认不再自动打开 DevTools；如需调试，启动前设置环境变量 STELLAFLIX_OPEN_DEVTOOLS=1
  if (process.env.STELLAFLIX_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
  }

  mainWindow.on('maximize', () => sendWindowState(mainWindow));
  mainWindow.on('unmaximize', () => sendWindowState(mainWindow));
  mainWindow.on('minimize', () => sendWindowState(mainWindow));
  mainWindow.on('restore', () => sendWindowState(mainWindow));
  mainWindow.on('show', () => sendWindowState(mainWindow));
  mainWindow.on('hide', () => sendWindowState(mainWindow));
  mainWindow.on('focus', () => sendWindowState(mainWindow));
  mainWindow.on('blur', () => sendWindowState(mainWindow));
  mainWindow.on('move', () => { scheduleWindowStateSend(mainWindow); if (wallpaperEngineRuntime) scheduleWallpaperEngineHostBoundsRestart(mainWindow, 'bounds-changed'); });
  mainWindow.on('resize', () => { scheduleWindowStateSend(mainWindow); if (wallpaperEngineRuntime) scheduleWallpaperEngineHostBoundsRestart(mainWindow, 'bounds-changed'); });
  mainWindow.on('closed', () => {
    if (mainWindowStateTimer) {
      clearTimeout(mainWindowStateTimer);
      mainWindowStateTimer = null;
    }
    closeOverlayWindows();
    mainWindow = null;
  });
  mainWindow.on('enter-full-screen', () => {
    windowFullscreenActive = true;
    sendWindowState(mainWindow);
    if (wallpaperEngineRuntime) suspendWallpaperEngineForHiddenHost(mainWindow, 'fullscreen');
  });
  mainWindow.on('leave-full-screen', () => {
    windowFullscreenActive = false;
    setTimeout(() => applyWindowedBounds(mainWindow), 50);
    if (wallpaperEngineRuntime) resumeWallpaperEngineForVisibleHost(mainWindow, 'fullscreen');
  });
  mainWindow.on('enter-html-full-screen', () => {
    htmlFullscreenActive = true;
    sendWindowState(mainWindow);
    if (wallpaperEngineRuntime) suspendWallpaperEngineForHiddenHost(mainWindow, 'fullscreen');
  });
  mainWindow.on('leave-html-full-screen', () => {
    htmlFullscreenActive = false;
    setTimeout(() => applyWindowedBounds(mainWindow), 50);
    if (wallpaperEngineRuntime) resumeWallpaperEngineForVisibleHost(mainWindow, 'fullscreen');
  });

  // T154：OS 级窗口圆角（权威方案 = setShape 扫描线近似圆角矩形；DWM 仅可选实验）。
  // 捕获句柄供全桌面模式的 onStatus 在退出桌面模式后重新应用圆角。
  // 可通过 STELLAFLIX_DISABLE_CORNER_SHAPE=1 临时禁用，用于排查 setShape 相关副作用。
  if (process.env.STELLAFLIX_DISABLE_CORNER_SHAPE !== '1') {
    mainWindowCornerShape = bindWindowCornerShape(mainWindow, { radius: 34 });
  }

  if (process.argv.includes('--vite')) {
    await waitForViteServer();
    await mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }
}

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);

// ④ 用户数据迁移：必须紧跟 setName（此时 userData 才指向新产品名目录），
// 且早于任何 getPath('userData') 落盘操作。只拷不删、幂等、失败不致命。
try {
  const { migrateUserData } = require('./userdata-migrate');
  const r = migrateUserData({
    userDataPath: app.getPath('userData'),
    appDataRoot: app.getPath('appData'),
    legacyNames: ['Mineradio', 'mineradio'],
    log: (m) => console.log(m),
  });
  if (r.migrated) console.log(`[userdata-migrate] 已迁移 ${r.files} 个文件（来源 ${r.from}）`);
  else if (r.reason !== 'already-migrated') console.log(`[userdata-migrate] 跳过：${r.reason}`);
} catch (e) {
  console.warn('[userdata-migrate] 迁移层异常（已忽略，不影响启动）:', e && e.message);
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!focusMainWindow()) {
      app.whenReady().then(() => createWindow()).catch((e) => console.error('Second instance window restore failed:', e));
    }
  });

  app.whenReady().then(async () => {
    screen.on('display-metrics-changed', () => {
      positionDesktopLyricsWindow();
      if (wallpaperRuntime) wallpaperRuntime.reconcileDisplay('display-metrics-changed').catch(() => {});
      if (fullDesktopModeRuntime) fullDesktopModeRuntime.reconcile('display-change').catch(() => {});
      if (wallpaperEngineRuntime) scheduleWallpaperEngineHostBoundsRestart(mainWindow, 'display-change');
      scheduleWindowStateSend(mainWindow);
    });
    screen.on('display-added', () => scheduleWindowStateSend(mainWindow));
    screen.on('display-removed', () => scheduleWindowStateSend(mainWindow));
    hookExplorerRestartForFullDesktop(mainWindow);
    if (WALLPAPER_ENGINE_ENABLED && wallpaperEngineLibrary) wallpaperEngineLibrary.installProtocol(protocol);
    configureLocalAppPermissions();
    await createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else focusMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    unregisterMineradioGlobalHotkeys();
    closeOverlayWindows();
    clearWallpaperEngineCaptureGrant();
    if (wallpaperEngineLibrary) wallpaperEngineLibrary.dispose();
    if (wallpaperEngineRuntime) wallpaperEngineRuntime.dispose();
    appQuitting = true;
    if (localServer?.setCustomSourceBridge) localServer.setCustomSourceBridge(null);
    customSourceAudioProxy?.clear();
    if (customSourceManager) void customSourceManager.dispose();
    if (localServer && localServer.close) localServer.close();
  });
}
