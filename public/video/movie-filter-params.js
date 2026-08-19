/*
 * Stellaflix 影视模块 — 电影筛选器 参数输出纯层 (T134)
 *
 * 从 movie-filter.js 抽出的「筛选状态 → TMDB discover 兼容查询参数」纯函数层
 * （VIDEO_MODULE_PLAN §六.6 单文件 ≤500 行约束）。
 * 零 DOM 依赖：仅依赖 SFV.movieFilterConfig（常量+状态层）与入参 st，可在 vm 沙箱无桩运行。
 *
 * 契约：本文件须在 movie-filter.js 之前加载（紧跟 movie-filter-config.js）；
 * movie-filter.js 顶部经 SFV.movieFilterParams 别名绑定复用，调用点零改动。
 * 幂等守卫保证重复加载跳过。
 */
(function (global) {
  'use strict';
  if (!global.StellaflixVideo) global.StellaflixVideo = {};
  var SFV = global.StellaflixVideo;
  if (SFV.movieFilterParams) return; // 幂等守卫

  var CFG = SFV.movieFilterConfig; // 常量+状态层见 movie-filter-config.js

  // 将当前筛选状态转为 TMDB discover 兼容查询参数（不含 page）
  function buildParams(st) {
    var params = {};

    // 排序
    var sortOpt = null;
    for (var i = 0; i < CFG.SORT_OPTIONS.length; i++) {
      if (CFG.SORT_OPTIONS[i].key === st.sort) { sortOpt = CFG.SORT_OPTIONS[i]; break; }
    }
    if (sortOpt) params.sort_by = sortOpt.sortBy;

    // 分类基础
    if (st.category === 'documentary') {
      params.with_genres = '99'; // TMDB documentary genre
    }

    // 年份（取最新选中值；TMDB primary_release_year 只支持单值）
    var yearKeys = Object.keys(st.years);
    if (yearKeys.length > 0) {
      // 取最近的具体年份或更早段的最小值
      var concreteYears = yearKeys.filter(function (k) { return !/^earlier_/.test(k); }).map(Number);
      if (concreteYears.length > 0) {
        params.primary_release_year = String(Math.min.apply(null, concreteYears));
      } else {
        // 更早段：取 max 作为上限（TMDB 不支持范围时用最宽松的）
        params['release_date.lte'] = '1999-12-31';
      }
    }

    // 类型（电影用 genre_id 逗号分隔；纪录片忽略子类，已有 with_genres=99）
    if (st.category === 'movie') {
      var genreIds = Object.keys(st.genres).filter(function (k) { return !isNaN(Number(k)); });
      if (genreIds.length > 0) params.with_genres = genreIds.join(',');
    }

    // 地区（用 with_original_language，多选取第一个）
    var regionKeys = Object.keys(st.regions);
    if (regionKeys.length > 0) {
      for (var r = 0; r < CFG.REGION_OPTIONS.length; r++) {
        if (st.regions[CFG.REGION_OPTIONS[r].key] && CFG.REGION_OPTIONS[r].language) {
          params.with_original_language = CFG.REGION_OPTIONS[r].language;
          break;
        }
      }
    }

    return params;
  }

  SFV.movieFilterParams = { buildParams: buildParams };
})(typeof window !== 'undefined' ? window : this);
