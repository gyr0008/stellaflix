/*
 * Stellaflix 影视模块 — 影视海报网格页面工厂 (T127)
 *
 * 电影 / 动漫 是两个**独立注册**的页面模块，各自调用本工厂生成，传入字面量
 *   mediaType（'movie' / 'anime'），而非运行时用 kind 切换同一函数。
 *
 * 2026-08-06 网格栏方案：网格栏使用 3D 歌单架同款渲染与材质，进入同一套 3D 空间
 * 坐标系统，定位于屏幕中央（歌单架在右侧、进影视态自动隐藏）。页面挂载即调用
 * SFV.browse3d.activate，由共享 WebGL 画布渲染 3D 海报墙（drawCardDirect 画真实海报卡），
 * 取数复用 SFV.tmdb.popular（与 DOM 网格同源）。当前由 page-browse-3d.js 的 TMDB_DISABLED
 * 开关暂停（2026-08-06 用户决定先完善其他功能），置 false 即恢复，并非空缺。挂载时
 * 调用 SFV.browse3d.activate，卸载时 deactivate；宿主留空（渲染在共享画布上）。
 *
 * 双态隔离：本模块只写影视态 DOM，绝不写入音乐态。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  function createMediaGridPage(opts) {
    var id = opts.id;
    var title = opts.title;
    var mediaType = opts.mediaType; // 字面量：'movie' 或 'anime'，非运行时 kind

    var page = {
      id: id,
      title: title,
      mount: function (host, ctx) {
        var ui = SFV.ui;
        ui.setBrowseChrome(true); // 网格页隐藏浏览层自带内联搜索与操作按钮
        host.innerHTML = '';       // 3D 海报墙渲染于共享 WebGL 画布（覆盖层透明透出），宿主留空
        if (SFV.browse3d && SFV.browse3d.activate) {
          SFV.browse3d.activate({ mediaType: mediaType, host: host });
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

    SFV.router.register(page);
    return page;
  }

  SFV.createMediaGridPage = createMediaGridPage;
})(typeof window !== 'undefined' ? window : this);
