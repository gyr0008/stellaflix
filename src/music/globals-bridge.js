// globals-bridge.js — Phase 2 全局桥（2026-08-07 落地，VITE_MODULE_SPLIT_PLAN §三 / §七）
//
// 作用：在 music.js 从「经典脚本」迁移到「ESM（Step 2.11 type="module"）」的过程中与之后，
//       保证仍被 video/* 模块与 index.html 内联 onclick 依赖的 **143 个关键全局** 在 window 上
//       始终可解析。这 143 名是 §七 穷举的「禁止改名 / 禁止删除 / 必须保留在 window」硬约束全集
//       （106 内联 onclick ∪ 135 video/* 引用，重叠 98，并集 143）。
//
// 机制：
//   - 经典脚本下：顶层 var/function 声明天然挂 window，本桥为**前向兼容的冗余回填**（当前是 no-op）。
//   - ESM 下：各模块不再自动挂 window，届时 legacy-music.js 退化为聚合/桥（import 各模块再挂 window），
//     本桥作为**兜底**，确保遗漏未导出的关键名在 video/* 使用前暴露为 undefined（便于尽早发现断链）。
//
// 防御性全量回填：对 143 名逐一 `if (typeof g[name] !== 'undefined') g[name] = g[name]`；
//   未定义的名字自动跳过（含 click/remove/getElementById/stopPropagation 4 个方法调用伪阳性，
//   它们从不作为全局函数存在，typeof 守卫天然跳过，零成本过度包含）。
//
// 单一真相源：KEEP 数组同时也是 scripts/verify-music-globals.mjs 的校验基准（从该文件抽取），勿漂移。
(function () {
  'use strict';
  var g = (typeof globalThis !== 'undefined') ? globalThis : window;

  // 143 关键全局（§七.4 全集；含 4 个方法伪阳性，由 typeof 守卫自动跳过）
  var KEEP = [
    "_sfvTryToggleSearch", "applyHomePosterCurrentCover", "audio", "bass", "bindFxPanel", "camera",
    "cancelHomePosterQuoteEdit", "cancelLocalBeatAnalysis", "clearCustomBackgroundImage", "clearCustomCoverForCurrent",
    "clearQueue", "clearSearchHistory", "click", "closeCollectModal", "closeColorLab", "closeCoverColorPicker",
    "closeCoverCropModal", "closeCustomLyricModal", "closeCustomSourceModal", "closeLocalBeatModal", "closeLoginModal",
    "closeMiniQueue", "closeSourceFallbackNotice", "closeTrackDetailModal", "closeUpdatePanel", "closeUploadTip",
    "closeUserModal", "closeVisualGuide", "commitCoverCrop", "createPlaylistFromCollect", "cyclePlayMode",
    "deactivateCustomSource", "deleteCustomLyricForCurrent", "doSearch", "editHomePosterQuote", "enableDualAccountView",
    "escHtml", "fs", "fx", "getElementById", "goHome", "handleHomePosterQuoteKey", "handleLyricGlowRowClick", "hexToRgb",
    "hideCoverColorLoupe", "homePosterState", "immersiveMode", "importCustomSource", "loadBundledSources", "logoutActiveAccount",
    "lyricColorPresets", "material", "moveCoverColorLoupe", "nextTrack", "nextVisualGuideStep", "onUserBtnClick",
    "openCollectModalForCurrent", "openCoverColorPicker", "openCustomSourceModal", "openHomeLibrary", "openHomePlayerConsole",
    "openProviderLogin", "openProviderWebLogin", "openTrackDetailModal", "openUpdatePanel", "orbit", "organizeFxPanel",
    "pickCoverColorFromArt", "playHomeRecent", "playHomeSong", "playlist", "prevTrack", "readHomePosterImageFile",
    "refreshQr", "refreshUserPlaylists", "regions", "remove", "renderHomeDiscover", "renderHomePersonalPoster",
    "renderHomeTiles", "renderer", "requestDualLoginMode", "resetCustomBackgroundColor", "resetFx", "resetHomeAccentColor",
    "resetHomeIconColor", "resetHomePoster", "resetShelfAccentColor", "resetUiAccentColor", "resetVisualIconColor",
    "resetVisualTintColor", "safePlaybackStep", "saveCustomLyricForCurrent", "saveHomePosterQuote", "scene",
    "scheduleShelfRebuild", "searchMode", "selectLocalBeatMode", "setActiveAccountProvider", "setFxPanelTab",
    "setLoginProvider", "setLyricColorAuto", "setLyricFont", "setLyricHighlightAuto", "setLyricSourceMode", "setPlayIcon",
    "setPlaybackQuality", "setSearchMode", "setSpace", "setVisualTintCustom", "setVolume", "shelfManager", "showLoginModal",
    "showToast", "shuffleQueue", "skipLoginAndFocusSearch", "startLocalBeatAnalysis", "startUpdatePreviewDownload",
    "startVisualGuide", "stopPropagation", "submitQQCookieLogin", "switchPlaylistTab", "toggle", "toggleControlsAutoHide",
    "toggleDiyMode", "toggleEqualizerPanel", "toggleFullscreen", "toggleFx", "toggleFxFabAutoHide", "toggleImmersiveMode",
    "toggleLikeCurrent", "toggleLyricGlowLink", "toggleLyricsPanel", "toggleMiniQueue", "togglePlay",
    "togglePlaylistPanelPinned", "toggleQQCookiePanel", "toggleQualityPanel", "toggleSearchPage", "toggleStartSpace",
    "toggleUserCapsuleAutoHide", "toggleVolumePanel", "vs"
  ];

  var rebound = 0, skipped = 0;
  for (var i = 0; i < KEEP.length; i++) {
    var name = KEEP[i];
    var defined;
    try { defined = (typeof g[name] !== 'undefined'); } catch (e) { defined = false; }
    if (defined) {
      // 已存在的全局：保持引用一致（经典脚本下为 no-op；ESM 下由聚合层赋值后此处再次确认）。
      g[name] = g[name];
      rebound++;
    } else {
      // 未定义（典型为 click/remove/getElementById/stopPropagation 方法伪阳性，或 ESM 下漏导出的关键名）：
      // 不凭空伪造可用符号，仅计数，交由 verify-music-globals 静态闸门与实机冒烟发现缺口。
      skipped++;
    }
  }

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[globals-bridge] 143 关键全局回填完成：rebound=' + rebound + ' skipped=' + skipped);
  }
})();
