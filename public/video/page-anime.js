/*
 * Stellaflix 影视模块 — 动漫页面 (T127)
 * 独立的影视分页（非 kind 参数化视图）。由 page-media-grid.js 工厂生成，
 * 传入字面量 mediaType='anime'（tmdb.popular 内部用 /tv/popular + 客户端
 * genre_ids 过滤 16=Animation）。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  if (typeof SFV.createMediaGridPage === 'function') {
    SFV.createMediaGridPage({ id: 'anime', title: '动漫', mediaType: 'anime' });
  }
})(typeof window !== 'undefined' ? window : this);
