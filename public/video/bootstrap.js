/*
 * Stellaflix 影视模块 — 引导 (Step 2)
 * 桥接钩子：DOM 就绪后初始化状态机并绑定分发层。不含任何影视业务逻辑。
 * 注意：浏览器兼容 global 已在 index.html <head> 顶部统一填充（bootstrap 之前）。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  function boot() {
    if (SFV.state) SFV.state.init();
    if (SFV.dispatch) SFV.dispatch.bind();
    // #22: Wallpaper Engine renderer is a classic global module loaded in <head>.
    // Its original self-invocation was removed (premature in <head>); init is deferred
    // to DOM-ready here so the static #wallpaper-engine-* DOM already exists.
    if (typeof initializeWallpaperEngineLibrary === 'function') initializeWallpaperEngineLibrary();
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
