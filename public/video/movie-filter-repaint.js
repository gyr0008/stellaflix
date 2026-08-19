/*
 * Stellaflix 影视模块 — 电影筛选器 标签重绘纯层 (T134)
 *
 * 从 movie-filter.js 抽出的三个「标签激活态重绘」纯函数（年份 / 类型 / 地区行）。
 * （VIDEO_MODULE_PLAN §六.6 单文件 ≤500 行约束）。
 * 仅依赖入参 container(DOM) 与 st(筛选状态)，无反向依赖 movie-filter.js，属叶子模块。
 *
 * 契约：本文件须在 movie-filter.js 之前加载；movie-filter.js 顶部经
 * SFV.movieFilterRepaint 别名绑定复用，调用点零改动。幂等守卫保证重复加载跳过。
 */
(function (global) {
  'use strict';
  if (!global.StellaflixVideo) global.StellaflixVideo = {};
  var SFV = global.StellaflixVideo;
  if (SFV.movieFilterRepaint) return; // 幂等守卫

  function repaintYearTags(container, st, yearOpts) {
    if (!container) return;
    var btns = container.querySelectorAll('.sfv-mfilter-tag[data-mf-year]');
    for (var i = 0; i < btns.length; i++) {
      var y = btns[i].getAttribute('data-mf-year');
      btns[i].classList.toggle('active', !!st.years[y]);
    }
    // "全部"按钮
    var allBtn = container.querySelector('.sfv-mfilter-tag:first-child');
    if (allBtn && allBtn.textContent === '全部') {
      allBtn.classList.toggle('active', Object.keys(st.years).length === 0);
    }
  }

  function repaintGenreTags(container, st, genres, visibleCount) {
    if (!container) return;
    var btns = container.querySelectorAll('.sfv-mfilter-tag[data-mf-genre]');
    for (var i = 0; i < btns.length; i++) {
      var gid = btns[i].getAttribute('data-mf-genre');
      btns[i].classList.toggle('active', !!st.genres[gid]);
    }
    var allBtn = container.querySelector('.sfv-mfilter-tag:first-child');
    if (allBtn && allBtn.textContent === '全部') {
      allBtn.classList.toggle('active', Object.keys(st.genres).length === 0);
    }
  }

  function repaintRegionTags(container, st) {
    if (!container) return;
    var btns = container.querySelectorAll('.sfv-mfilter-tag[data-mf-region]');
    for (var i = 0; i < btns.length; i++) {
      var rk = btns[i].getAttribute('data-mf-region');
      btns[i].classList.toggle('active', !!st.regions[rk]);
    }
    var allBtn = container.querySelector('.sfv-mfilter-tag:first-child');
    if (allBtn && allBtn.textContent === '全部') {
      allBtn.classList.toggle('active', Object.keys(st.regions).length === 0);
    }
  }

  SFV.movieFilterRepaint = {
    repaintYearTags: repaintYearTags,
    repaintGenreTags: repaintGenreTags,
    repaintRegionTags: repaintRegionTags
  };
})(typeof window !== 'undefined' ? window : this);
