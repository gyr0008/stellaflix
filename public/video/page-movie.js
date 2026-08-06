/*
 * Stellaflix 影视模块 — 电影页面 (T134)
 *
 * 方案 D（2026-08-05）：删除 DOM 海报网格 + 三层筛选器外壳，仅保留底部 TMDB 署名。
 * 海报墙由 browse3d 在共享 WebGL 画布（与首页星空同 canvas）渲染，覆盖层透明透出星空。
 * 筛选器 / 加载更多 / 详情连线在 Phase 4 接回。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  // 防止重复注册
  if (SFV.router && SFV.router.listIds && SFV.router.listIds().indexOf('movie') !== -1) return;

  var detailOpen = false;
  var showGridFn = null;

  /* ---- 详情页（与工厂一致）---- */
  function showDetail(it) {
    // Phase 1.5 占位态：所有进详情路径统一走 SFV.online.renderDetail 拦截（toast 提示）
    try {
      if (SFV.online && typeof SFV.online.renderDetail === 'function') {
        SFV.online.renderDetail(it);
      }
    } catch (e) { /* 静默降级 */ }
  }

  // 仅渲染底部 TMDB 署名（外壳已删）。星空由透明覆盖层透出，海报墙由 browse3d 渲染。
  function showShell(host) {
    var ui = SFV.ui;
    detailOpen = false;
    host.innerHTML = '';
    var foot = ui.el('div', 'sfv-browse-foot',
      '影视资料来自 TMDB，仅供展示。This product uses the TMDB API but is not endorsed or certified by TMDB.');
    host.appendChild(foot);
  }

  /* ---- 页面注册 ---- */
  var page = {
    id: 'movie',
    title: '电影',
    mount: function (host, ctx) {
      var ui = SFV.ui;
      ui.setBrowseChrome(true);
      showGridFn = function () { showShell(host); };
      showShell(host);
      // 3D 海报网格栏（方案 D）：复用全局 scene/camera/renderer/orbit
      SFV.ensureBrowse3d(function () {
        if (SFV.browse3d) SFV.browse3d.activate({ mediaType: 'movie', host: host, onCardClick: showDetail });
      });
    },
    back: function () {
      if (detailOpen) { if (showGridFn) showGridFn(); return true; }
      return false;
    },
    // 离开本页（router.go 切换 / 切空间）→ 坍缩回收 3D + 还原 orbit
    unmount: function () {
      if (SFV.browse3d) SFV.browse3d.deactivate();
    }
  };

  if (SFV.router && typeof SFV.router.register === 'function') {
    SFV.router.register(page);
  }
})(typeof window !== 'undefined' ? window : this);
