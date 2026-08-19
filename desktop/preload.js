const { contextBridge, ipcRenderer } = require('electron');

// 2026-08-16: 把 Wallpaper Engine 启用状态同步给渲染进程，
// 让渲染侧在默认禁用时不自动恢复/播放壁纸，避免 GPU/解码崩溃导致卡顿。
const WALLPAPER_ENGINE_ENABLED = process.env.STELLAFLIX_ENABLE_WALLPAPER === '1'
  && process.env.STELLAFLIX_DISABLE_WALLPAPER !== '1';

contextBridge.exposeInMainWorld('desktopWindow', {
  wallpaperEngineEnabled: WALLPAPER_ENGINE_ENABLED,
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('desktop-window-minimize'),
  toggleMaximize: () => ipcRenderer.invoke('desktop-window-toggle-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop-window-toggle-fullscreen'),
  exitFullscreenWindowed: () => ipcRenderer.invoke('desktop-window-exit-fullscreen-windowed'),
  getState: () => ipcRenderer.invoke('desktop-window-get-state'),
  close: () => ipcRenderer.invoke('desktop-window-close'),
  openNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-open-login'),
  clearNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-clear-login'),
  openQQMusicLogin: () => ipcRenderer.invoke('qq-music-open-login'),
  clearQQMusicLogin: () => ipcRenderer.invoke('qq-music-clear-login'),
  openUpdateInstaller: (filePath) => ipcRenderer.invoke('stellaflix-open-update-installer', filePath),
  restartApp: () => ipcRenderer.invoke('stellaflix-restart-app'),
  configureGlobalHotkeys: (bindings) => ipcRenderer.invoke('stellaflix-hotkeys-configure-global', bindings || []),
  exportJsonFile: (payload) => ipcRenderer.invoke('stellaflix-export-json-file', payload || {}),
  importJsonFile: () => ipcRenderer.invoke('stellaflix-import-json-file'),
  listCustomSources: () => ipcRenderer.invoke('stellaflix-custom-source-list'),
  importCustomSource: () => ipcRenderer.invoke('stellaflix-custom-source-import'),
  replaceCustomSource: (id) => ipcRenderer.invoke('stellaflix-custom-source-replace', String(id || '')),
  activateCustomSource: (id) => ipcRenderer.invoke('stellaflix-custom-source-activate', String(id || '')),
  deactivateCustomSource: () => ipcRenderer.invoke('stellaflix-custom-source-deactivate'),
  removeCustomSource: (id) => ipcRenderer.invoke('stellaflix-custom-source-remove', String(id || '')),
  listBundledCustomSources: () => ipcRenderer.invoke('stellaflix-custom-source-bundled-list'),
  importBundledCustomSource: (fileName) => ipcRenderer.invoke('stellaflix-custom-source-bundled-import', String(fileName || '')),
  checkBundledSourceUpdates: () => ipcRenderer.invoke('stellaflix-custom-source-bundled-check-updates'),
  applyBundledSourceUpdate: (fileName) => ipcRenderer.invoke('stellaflix-custom-source-bundled-apply-update', String(fileName || '')),
  setCustomSourceUpdateAlert: (id, enabled) => ipcRenderer.invoke(
    'stellaflix-custom-source-set-update-alert',
    String(id || ''),
    !!enabled,
  ),
  onCustomSourceStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('stellaflix-custom-source-status', listener);
    return () => ipcRenderer.removeListener('stellaflix-custom-source-status', listener);
  },
  // 本地音乐库(移植自 1.5.7):选文件夹/扫描/快照恢复/授权范围读取
  chooseLocalMusicFolder: () => ipcRenderer.invoke('stellaflix-local-music-choose-folder'),
  scanLocalMusicFolder: (folderPath, options) => ipcRenderer.invoke('stellaflix-local-music-scan-folder', String(folderPath || ''), options || {}),
  refreshLocalMusicFiles: (folderPath, files) => ipcRenderer.invoke('stellaflix-local-music-refresh-entries', String(folderPath || ''), files || []),
  readLocalFileRange: (filePath, start, end) => ipcRenderer.invoke('stellaflix-local-file-read-range', String(filePath || ''), start, end),
  readLocalFileDataUrl: (filePath) => ipcRenderer.invoke('stellaflix-local-file-read-data-url', String(filePath || '')),
  onGlobalHotkey: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('stellaflix-global-hotkey', listener);
    return () => ipcRenderer.removeListener('stellaflix-global-hotkey', listener);
  },
  setDesktopLyricsEnabled: (enabled, payload) => ipcRenderer.invoke('stellaflix-desktop-lyrics-set-enabled', !!enabled, payload || {}),
  updateDesktopLyrics: (payload) => ipcRenderer.invoke('stellaflix-desktop-lyrics-update', payload || {}),
  onDesktopLyricsLockState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('stellaflix-desktop-lyrics-lock-state', listener);
    return () => ipcRenderer.removeListener('stellaflix-desktop-lyrics-lock-state', listener);
  },
  onDesktopLyricsEnabledState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('stellaflix-desktop-lyrics-enabled-state', listener);
    return () => ipcRenderer.removeListener('stellaflix-desktop-lyrics-enabled-state', listener);
  },
  setWallpaperMode: (enabled, payload) => ipcRenderer.invoke('stellaflix-wallpaper-set-enabled', !!enabled, payload || {}),
  updateWallpaperMode: (payload) => ipcRenderer.invoke('stellaflix-wallpaper-update', payload || {}),
  // Wallpaper Engine 原生引擎桥接（#22 Phase 3 Path B）
  listWallpaperEngineProjects: (payload) => ipcRenderer.invoke('stellaflix-wallpaper-engine-list', payload || {}),
  getWallpaperEngineProjectDetails: (id) => ipcRenderer.invoke('stellaflix-wallpaper-engine-project-details', String(id || '')),
  openWallpaperEngineProjectDetails: (id, target) => ipcRenderer.invoke('stellaflix-wallpaper-engine-open-project-details', {
    id: String(id || ''),
    target: target === 'workshop' ? 'workshop' : 'we',
  }),
  chooseWallpaperEngineDirectory: () => ipcRenderer.invoke('stellaflix-wallpaper-engine-choose-directory'),
  chooseWallpaperEngineProjectFile: () => ipcRenderer.invoke('stellaflix-wallpaper-engine-choose-project-file'),
  removeWallpaperEngineDirectory: (rootId) => ipcRenderer.invoke('stellaflix-wallpaper-engine-remove-directory', String(rootId || '')),
  getWallpaperEngineRuntimeStatus: (payload) => ipcRenderer.invoke('stellaflix-wallpaper-engine-runtime-status', payload || {}),
  startWallpaperEngineScene: (payload) => ipcRenderer.invoke('stellaflix-wallpaper-engine-start-scene', payload || {}),
  stopWallpaperEngineScene: (payload) => ipcRenderer.invoke('stellaflix-wallpaper-engine-stop-scene', payload || {}),
  reportWallpaperEngineCaptureResult: (payload) => ipcRenderer.invoke('stellaflix-wallpaper-engine-capture-result', payload || {}),
  prepareWallpaperEngineGlassCapture: (payload) => ipcRenderer.invoke('stellaflix-wallpaper-engine-prepare-glass-capture', payload || {}),
  activateWallpaperEngineDwmSurface: (payload) => ipcRenderer.invoke('stellaflix-wallpaper-engine-activate-dwm-surface', payload || {}),
  updateWallpaperEngineGlassSurface: (payload) => ipcRenderer.send('stellaflix-wallpaper-engine-glass-surface', payload || {}),
  reportWallpaperEnginePointerActivity: (payload) => ipcRenderer.send('stellaflix-wallpaper-engine-pointer-activity', payload || {}),
  onWallpaperEngineHostBoundsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('stellaflix-wallpaper-engine-host-bounds-changed', listener);
    return () => ipcRenderer.removeListener('stellaflix-wallpaper-engine-host-bounds-changed', listener);
  },
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-window-state', listener);
    return () => ipcRenderer.removeListener('desktop-window-state', listener);
  },
  // T144：自适应圆角状态 / DWM API 失败后的 CSS 兜底
  onAdaptiveCornersState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state || {});
    ipcRenderer.on('adaptive-corners:state', listener);
    return () => ipcRenderer.removeListener('adaptive-corners:state', listener);
  },
  onAdaptiveCornersFallback: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('adaptive-corners:fallback', listener);
    return () => ipcRenderer.removeListener('adaptive-corners:fallback', listener);
  },
  // 影视态 home 自定义海报持久化（userData 文件存储，绕开 localStorage 配额/端口 origin 问题）
  videoPoster: (action, payload) => ipcRenderer.invoke('stellaflix-video-poster', action, payload || null),
  // 影视模块追片/片单/历史海报本地缓存（TMDB 海报持久化，避免网络不可达白图）
  posterCache: (action, payload) => ipcRenderer.invoke('stellaflix-poster-cache', action, payload || null),
  // 原生图片选择对话框（替代 <input type="file"> .click()，Electron 下更可靠）
  pickImage: () => ipcRenderer.invoke('stellaflix-pick-image'),
  // 影视态解析页真实媒体直链嗅探（生产路径）：返回评分最高的媒体 URL
  resolveMediaSniff: (url, opts) => ipcRenderer.invoke('stellaflix-resolve-media-sniff', Object.assign({ url: url }, opts || {})),
  // 影视态验证码闭环：从 webview 专用分区(persist:stellaflix-captcha)读回验证码 cookie，
  // 供重查请求注入 Cookie 头（对齐 Kazumi 验证码流程）。searchURL 仅作透传，主进程返回该分区全部 cookie。
  getCaptchaCookies: (searchURL) => ipcRenderer.invoke('stellaflix-get-captcha-cookies', { searchURL: searchURL || null }),
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-shell-root');
  document.body.classList.add('desktop-shell');
});

// T144：主进程 DWM 去圆角失败时，立即启用 html 级 clip-path 兜底。
// 渲染端脚本可能尚未加载，故在 preload 层直接处理，确保开屏第一帧生效。
ipcRenderer.on('adaptive-corners:fallback', () => {
  try {
    document.documentElement.classList.add('fallback-rounded');
  } catch (e) {
    // ignore
  }
});
