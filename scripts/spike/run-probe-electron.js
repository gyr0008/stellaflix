// 用本项目 Electron 42 直接打开 S3 编解码探针（权威验证 AC-3 是否真无声）。
// 用法（Windows，在项目根目录）：
//   node_modules\electron\dist\electron.exe scripts\spike\run-probe-electron.js --autoplay-policy=no-user-gesture-required
// 该 flag 允许页面在无用户手势时调用 video.play()，确保 RMS 测量能自动开始。
const { app, BrowserWindow } = require('electron');
const path = require('path');

const htmlPath = path.join(__dirname, 's3-decode-probe.html');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile(htmlPath);
  win.webContents.openDevTools({ mode: 'detach' });
  win.on('closed', () => { /* no-op */ });
});
