/*
 * Stellaflix 影视模块 — 弹幕系统入口（聚合 SFV.danmaku 各子模块）
 *
 * 子模块（均独立 <script> 引入，顺序：entry → episode → engine → source-* → index）：
 *   entry.js    DanmakuEntry / DANMAKU_TYPE / 颜色工具（移植自 Kazumi DanDanPlay 数据层）
 *   episode.js  DanmakuEpisode / DanmakuEpisodeResponse（移植自 Kazumi match 接口）
 *   engine.js   弹幕渲染引擎（纯新 JS，Flutter widget 无法移植）
 *   source-*.js 弹幕源客户端（DanDanPlay 等，经 /api/proxy）
 *
 * 合规：弹幕为运行时由用户主动拉取，出厂不内置任何源/规则。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  var danmaku = (SFV.danmaku = SFV.danmaku || {});
  // 协议层就绪标记（供后续 engine/source 断言依赖）
  danmaku.PROTOCOL_READY = !!(danmaku.DanmakuEntry && danmaku.DanmakuEpisodeResponse);
})(typeof window !== 'undefined' ? window : this);
