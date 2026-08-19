import { defineConfig } from 'vite';

// Stellaflix 影视播放器开发服务器配置
// 仅用于 `npm run dev`（带 --vite 分支的 Electron 开发模式）。
// 生产打包（electron-builder）不走这里，renderer 仍由 server.js 提供。
//
// 关键约束：
//   本项目是原生 vanilla JS 应用（无 ES module / 无框架），
//   且强依赖 server.js 提供的后端 API（/api/kugou/*、/api/qq/*、
//   /api/weather/*、/api/proxy、/api/user/* 等）。
//   Vite 在此仅充当「静态文件服务器 + 热刷新」角色，
//   所有 /api/* 请求必须代理到已启动的 server.js (:3000)。

export default defineConfig({
  root: 'public',
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    hmr: false,          // 禁用 HMR：不注入 /vite/client，避免干扰原生 JS 全局作用域
    proxy: {
      // 把所有后端 API 请求转发给 server.js（它在 :3000 上运行）
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  // 不做任何代码转换——原样提供文件（本项目全部为原生 IIFE/vanilla JS）
  esbuild: false,
});
