const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopWindow', {
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
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-window-state', listener);
    return () => ipcRenderer.removeListener('desktop-window-state', listener);
  },
  // 影视态 home 自定义海报持久化（userData 文件存储，绕开 localStorage 配额/端口 origin 问题）
  videoPoster: (action, payload) => ipcRenderer.invoke('stellaflix-video-poster', action, payload || null),
  // 影视模块追片/片单/历史海报本地缓存（TMDB 海报持久化，避免网络不可达白图）
  posterCache: (action, payload) => ipcRenderer.invoke('stellaflix-poster-cache', action, payload || null),
  // 原生图片选择对话框（替代 <input type="file"> .click()，Electron 下更可靠）
  pickImage: () => ipcRenderer.invoke('stellaflix-pick-image'),
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-shell-root');
  document.body.classList.add('desktop-shell');
});
