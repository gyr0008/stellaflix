/*
 * Stellaflix 影视模块 — 电影页面 (T134)
 *
 * 2026-08-06 网格栏方案：电影/动漫分页的网格栏使用 3D 歌单架同款渲染与材质，
 * 进入同一套 3D 空间坐标系统，定位于屏幕中央（歌单架在右侧、进影视态自动隐藏）。
 * 页面挂载即调用 SFV.browse3d.activate，由共享 WebGL 画布渲染 3D 海报墙（drawCardDirect
 * 画真实海报卡）。取数复用 SFV.tmdb.popular（与 DOM 网格同源），当前由 page-browse-3d.js
 * 的 TMDB_DISABLED 开关暂停（2026-08-06 用户决定先完善其他功能），置 false 即恢复，并非空缺。
 *
 * 实现：挂载时调用 SFV.browse3d.activate（3D 海报墙渲染于共享 WebGL 画布，
 * 覆盖层永久透明透出首页星空）；卸载时 deactivate。宿主 host 留空、不写 DOM 卡片。
 * 双态隔离：本模块只存在于影视态，绝不写入音乐态。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  // 防止重复注册
  if (SFV.router && SFV.router.listIds && SFV.router.listIds().indexOf('movie') !== -1) return;

  var page = {
    id: 'movie',
    title: '电影',
    mount: function (host, ctx) {
      var ui = SFV.ui;
      ui.setBrowseChrome(true); // 网格页隐藏浏览层自带内联搜索与操作按钮
      host.innerHTML = '';       // 3D 海报墙渲染于共享 WebGL 画布（覆盖层透明透出），宿主留空
      if (SFV.browse3d && SFV.browse3d.activate) {
        SFV.browse3d.activate({ mediaType: 'movie', host: host });
      }
    },
    back: function () {
      // 网格海报页本身无独立详情态，返回语义交由外壳 no-op
      return false;
    },
    // 离开本页（router.go 切换 / 切空间）：回收 3D 海报墙
    unmount: function () {
      if (SFV.browse3d && SFV.browse3d.deactivate) {
        try { SFV.browse3d.deactivate(); } catch (deactivateErr) {}
      }
    }
  };

  if (SFV.router && typeof SFV.router.register === 'function') {
    SFV.router.register(page);
  }
})(typeof window !== 'undefined' ? window : this);
