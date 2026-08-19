/**
 * T144 自适应圆角渲染端兜底
 * 当主进程无法/不宜通过 DWM API 去掉 Windows 11 强制圆角时，
 * 启用 html 级 clip-path 回退 + 四角遮罩，覆盖 DWM 可能残留的白/灰直角。
 * 最大化/全屏时自动隐藏。
 */
(function () {
  'use strict';

  function setOverlayVisible(visible) {
    var overlay = document.getElementById('adaptive-corner-overlay');
    if (!overlay) return;
    overlay.style.display = visible ? 'block' : 'none';
  }

  function setFallbackRounded(enabled) {
    var html = document.documentElement;
    if (!html) return;
    if (enabled) {
      html.classList.add('fallback-rounded');
    } else {
      html.classList.remove('fallback-rounded');
    }
  }

  function init() {
    if (typeof window === 'undefined' || !document.body) return;

    var overlay = document.getElementById('adaptive-corner-overlay');
    if (overlay) {
      console.log('[adaptive-corners] overlay present in DOM, size =', overlay.offsetWidth, 'x', overlay.offsetHeight);
    } else {
      console.warn('[adaptive-corners] overlay MISSING from DOM');
    }

    var api = window.desktopWindow;
    if (!api) {
      console.warn('[adaptive-corners] window.desktopWindow API not available');
      // 无 IPC 时保守启用 CSS 回退
      setFallbackRounded(true);
      setOverlayVisible(true);
      return;
    }

    if (typeof api.onAdaptiveCornersState === 'function') {
      api.onAdaptiveCornersState(function (state) {
        console.log('[adaptive-corners] state', JSON.stringify(state));
        var shouldMask = !!(state && state.rounded);
        setOverlayVisible(shouldMask);
        // CSS 回退默认保持启用，仅作为 DWM 失效时的双重保险；
        // 不在此处移除，避免圆角外观闪烁。
      });
    }

    if (typeof api.onAdaptiveCornersFallback === 'function') {
      api.onAdaptiveCornersFallback(function (payload) {
        console.warn('[adaptive-corners] fallback triggered', JSON.stringify(payload));
        setFallbackRounded(true);
        setOverlayVisible(true);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
