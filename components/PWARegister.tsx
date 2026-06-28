/**
 * PWA Service Worker 注册组件
 * 在客户端注册 Service Worker 以启用离线缓存
 */

"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    // 检查浏览器是否支持 Service Worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("✅ Service Worker 注册成功:", registration.scope);
          })
          .catch((error) => {
            console.log("❌ Service Worker 注册失败:", error);
          });
      });
    }
  }, []);

  return null; // 这个组件不渲染任何内容
}
