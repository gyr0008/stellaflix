/*
 * Stellaflix 影视模块 — 在线 CMS10 源闭环 UI (Step 4)
 *
 * 职责：把 sources.js（协议层）+ source-adapter.js（播放接入）串成用户可用界面：
 *   - 聚合搜索：跨已启用片源搜索，去重归并后网格展示；
 *   - 详情剧集：点结果进详情，调 sources.detail 拿到分源剧集，点剧集即播放；
 *   - 用户列表：心动(liked) / 片单(inList) / 历史(history)（占位）；追片(track) 为 5 状态互斥分区页；
 *   - 入口：本地影片 / 网络地址 / 片源管理（视觉控制台新分页）。
 *
 * 进度键锚定：在线剧集用 `站点id:vod_id:集序` 作为进度键（而非会变动的签名 URL），
 *   由 source-adapter 透传给 player.openUrl({ id })。本地/直链仍走 file:/url:。
 *
 * 合规红线（与全模块一致）：不预置、不内置任何站点；所有 api_site 由用户手动导入；
 *   本文件零硬编码站点地址；产品内任何位置均声明「不提供、不存储」。
 *
 * 双态同构：本覆盖层为影视态专属子面板，仅显式 open() 后显示；切回音乐态时自动隐藏，
 *   绝不污染音乐模块 DOM 或逻辑。
 */
(function (global) {
  'use strict';
  console.log('[SFV-DIAG] online.js IIFE 开始执行, global=', !!global, ' document=', !!global.document);
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var CATEGORY_META = {
    liked: { label: '心动', field: 'liked', empty: '还没有心动的影片，在详情页点亮 ♥ 即可收藏到这里。' },
    inList: { label: '片单', field: 'inList', empty: '片单还是空的，在详情页点击「加入片单」即可。' },
    history: { label: '历史', field: 'history', empty: '还没有观看记录，播放任意影片后会自动出现在这里。' },
  };
  // 追片 5 状态分区（与 Kazumi 一致，互斥单值）。none=未收藏，由缺键表示。
  var TRACK_META = [
    { status: 'watching', label: '在看' },
    { status: 'planToWatch', label: '想看' },
    { status: 'onHold', label: '搁置' },
    { status: 'watched', label: '看过' },
    { status: 'abandoned', label: '抛弃' },
  ];

  var overlay = null, headEl = null, backBtn = null, titleEl = null,
      actsEl = null, closeBtn = null, searchInput = null, searchBtn = null,
      bodyEl = null, noteEl = null;
  var stack = [];           // 视图栈（legacy 视图：search/category/rules/detail）
  var current = null;       // 当前视图
  var uiMode = 'view';      // 'page' = 五个导航独立页面；'view' = legacy 搜索/分类/规则/详情
  var activePageId = null;  // 当前激活的导航页面 id（供影视分页背景同步）
  var busy = false;
  var trackMetaInflight = {}; // 追片页缺失 TMDB 元数据时的去重 in-flight 请求表
  var repairTried = {};       // 来源自动修复去重表：meta.key → { sourceId: true }，防跨源死循环
  var doc = d();            // document 引用（IIFE 级别，供 bindNavItems / bindCapsuleSearchBtn 等函数共用）

  function d() { return global.document; }
  function isVideoSpace() { return !!(SFV.state && SFV.state.isVideo()); }
  function hasSources() {
    return !!(SFV.sources && SFV.sources.getEnabledSources && SFV.sources.getEnabledSources().length);
  }
  function sourceById(id) {
    if (!SFV.sources || !SFV.sources.getSources) return null;
    var all = SFV.sources.getSources();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function el(tag, cls, text) {
    var n = d().createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toast(msg) {
    if (SFV.home && SFV.home.toast) { SFV.home.toast(msg); return; }
    var t = el('div', 'sfv-toast', msg);
    (d().body || d().documentElement).appendChild(t);
    global.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }

  // ---------------------------------------------------------------- 构建
  function ensure() {
    if (overlay) return;
    var doc = d();
    overlay = el('div', 'sfv-browse');
    overlay.id = 'sfv-browse';

    headEl = el('div', 'sfv-browse-head');
    backBtn = el('button', 'sfv-browse-back', '←');
    backBtn.type = 'button';
    backBtn.addEventListener('click', goBack);
    titleEl = el('div', 'sfv-browse-title', '在线影视');
    actsEl = el('div', 'sfv-browse-acts');
    var bLocal = mkAct('本地', openLocal);
    var bUrl = mkAct('地址', openUrlPrompt);
    var bSrc = mkAct('片源', openSources);
    actsEl.appendChild(bLocal); actsEl.appendChild(bUrl); actsEl.appendChild(bSrc);
    closeBtn = el('button', 'sfv-browse-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.innerHTML = '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    closeBtn.addEventListener('click', close);
    headEl.appendChild(backBtn); headEl.appendChild(titleEl); headEl.appendChild(actsEl); headEl.appendChild(closeBtn);

    // [清理] legacy 覆盖层 inline 搜索栏已移除：搜索统一走 #sfv-search-page（openSearchPage）。
    // 覆盖层 search 视图（mode:'search' / renderSearch / online.js doSearch）已废弃，避免头部残留“在线搜索”。

    noteEl = el('div', 'sfv-browse-note');
    bodyEl = el('div', 'sfv-browse-body');

    overlay.appendChild(headEl);
    overlay.appendChild(noteEl);
    overlay.appendChild(bodyEl);
    (doc.body || doc.documentElement).appendChild(overlay);

    // 注入页面路由渲染宿主（T127）：五个导航独立页面渲染进 bodyEl
    if (SFV.router && typeof SFV.router.setHost === 'function') SFV.router.setHost(bodyEl);

    // T135：回到顶部悬浮按钮（仅电影 / 动漫分页），绑定 .sfv-browse-body 滚动
    if (SFV.backToTop && typeof SFV.backToTop.init === 'function') {
      try { SFV.backToTop.init(bodyEl); } catch (_) {}
    }

    // Escape 键关闭浏览层（栈底=关闭整个浏览页，非栈底=返回上一级）
    if (global.addEventListener) {
      global.addEventListener('keydown', function (ev) {
        if (!isOpen()) return;
        if (ev && (ev.key === 'Escape' || ev.keyCode === 27)) {
          if (SFV.SearchFilter && SFV.SearchFilter.isOpen && SFV.SearchFilter.isOpen()) return;
          ev.preventDefault();
          ev.stopPropagation();
          goBack();
        }
      }, true); // 捕获阶段优先
    }

    // 视口尺寸变化时，若处于平级 tab 页，保持 flush 铺满（top:0）。
    // 注意：T132 路径①后 .sfv-browse 走 inset:0 flush 铺满，顶部留白由
    // .sfv-browse--page .sfv-browse-body 的 padding-top 承担，禁止再写 getContentTop()
    // 偏移（会重新把覆盖层推下 58px、露出左右星空 = 窗口感回归）。
    if (global.addEventListener) {
      global.addEventListener('resize', function () {
        if (isOpen() && uiMode === 'page' && overlay) {
          overlay.style.top = '0';
        }
      });
    }

  } // <-- ensure() / 搜索页事件绑定闭合

  // ==== T109f 关键修复：spacechange 监听器必须在 ensure() 外部 ====
  // ensure() 是懒初始化（首次打开浏览层才执行），用户可能先切换空间再开浏览层。
  // 如果监听器在 ensure() 内部，第一次 spacechange 事件会丢失 → 第5卡文案不更新。
  {
    if (global.addEventListener) {
      global.addEventListener(SFV.state && SFV.state.EVENT ? SFV.state.EVENT : 'spacechange', function (ev) {
        var mode = ev && ev.detail ? ev.detail.spaceMode : (isVideoSpace() ? 'video' : 'music');
        if (mode !== 'video' && isOpen()) close();
        // 通知 3D 歌单架立即重建（音乐态下重建；影视态下 setMode('off') 已使 group=null，rebuild 自动 no-op）
        if (typeof global.scheduleShelfRebuild === 'function') {
          try { global.scheduleShelfRebuild('video-space-change', true); } catch (e) {}
        }
        // Phase 3 · 选项 A：影视态自动隐藏 3D 歌单架，回音乐态复原到用户偏好 fx.shelf。
        // 直接调 shelfManager.setMode（不碰 fx.shelf / UI 按钮 / 存档），零侵入 shelf 核心逻辑。
        // 原理：setMode('off') 将 group 置 null 并从 scene 移除；animate() 仍无条件调 update 但 update 在 group=null 时早退，
        // 故影视态下歌单架零渲染、零冲突（与方案 D 海报墙共用同一相机/场景也不再重叠）。
        try {
          if (global.shelfManager && typeof global.shelfManager.setMode === 'function') {
            if (mode === 'video') {
              global.shelfManager.setMode('off');
            } else {
              var _prevShelf = (global.fx && /^(off|side|stage)$/.test(String(global.fx.shelf || ''))) ? global.fx.shelf : 'side';
              global.shelfManager.setMode(_prevShelf);
            }
          }
        } catch (e) { console.warn('[SFV] 歌单架空间切换处理失败', e); }
        // 空间切换时立即更新第5卡文案
        try {
          var vt = doc.getElementById('home-video-title');
          var vs = doc.getElementById('home-video-sub');
          if (vt) vt.textContent = mode === 'video' ? '音乐空间' : '影视空间';
          if (vs) vs.textContent = mode === 'video' ? '返回音乐空间' : '搜索 / 播放影片';
          console.log('[SFV-Search] 第5卡文案已更新: title=' + (vt ? vt.textContent : 'NULL') + ' sub=' + (vs ? vs.textContent : 'NULL'));
        } catch (_) { console.warn('[SFV-Search] 第5卡文案更新失败', _); }
        // 进入/离开影视态时同步影视分页背景（死命令：双态互不影响由 applyVideoPageBg 内部守卫）
        try { applyVideoPageBg(); } catch (e) {}
      });
      console.log('[SFV-DIAG] spacechange 监听器已在 IIFE 顶层注册（ensure 外部）');
    }
  }

  // ---------------------------------------------------------------- T96 导航栏（T132-P2 重构：委托 SFV.nav 共享组件）
  var currentNav = 'home'; // 当前选中导航项（默认首页）

  // 导航 click 组合 handler：先维护激活高亮（→ SFV.nav.paintActive），再分发到具体路由。
  // 由 SFV.nav.bindClick 统一绑定 document 捕获阶段 delegation（确保浮层 click 不误触）。
  function onNavItemClick(key) {
    currentNav = key;
    if (SFV.nav && typeof SFV.nav.paintActive === 'function') SFV.nav.paintActive(key);
    handleNavAction(key);
  }

    // ---------------------------------------------------------------- T108 全页搜索（Kazumi 风格）
  // 全屏覆盖层：顶部导航 + 居中搜索栏 + 历史下拉 + 内联结果网格
  var SEARCH_HISTORY_KEY = 'stellaflix-search-history';
  var MAX_SEARCH_HISTORY = 12;
  var pageEl = null;       // #sfv-search-page 容器
  var searchInput = null;  // #sfv-search-input
  var historyDrop = null;  // #sfv-history-drop
  var historyListEl = null;// #sfv-history-drop-list
  var resultArea = null;   // #sfv-search-result-area
  var _searchBound = false;
  var _currentSearchView = null;

  // ---- 搜索筛选状态（对齐 Kazumi SearchFilterState + 隐藏已看/已弃 开关）----
  var _filterState = null;       // SFV.SearchFilterCore.SearchFilterState 实例
  var _hideWatched = false;      // 隐藏已看
  var _hideAbandoned = false;    // 隐藏已弃
  var _filterFab = null;         // 筛选 FAB（动态创建）
  var _chipsBar = null;          // 已应用筛选条容器

  function getFilterState() {
    if (!_filterState) {
      var seeded = (SFV.SearchFilterCore && SFV.SearchFilterCore.buildJunkDefaults)
        ? SFV.SearchFilterCore.buildJunkDefaults() : null;
      _filterState = (SFV.SearchFilterCore && SFV.SearchFilterCore.SearchFilterState)
        ? new SFV.SearchFilterCore.SearchFilterState(seeded || {})
        : null;
    }
    return _filterState;
  }

  // ---- 纯排除模型：客户端结果过滤 ----
  // 排除维度无法表达为 CMS/Bangumi 查询语法，统一在结果合并后剔除。
  // 说明：当前 CMS/Kazumi 归一化结果仅含 title/year/area/typeName/remarks/content，
  // 因此「类型 / 地区 / 年份」可可靠排除；「评分 / 标签 / 星期 / 排名」依赖片源元数据，
  // 当前结果无这些字段时该排除不生效（待后续维度讨论补全元数据来源）。

  function _containsEither(a, b) {
    return (a && a.indexOf(b) >= 0) || (b && b.indexOf(a) >= 0);
  }
  function _typeMatches(excl, t) {
    if (!t) return false;
    if (t.indexOf(excl) >= 0) return true;                       // 动漫 / 纪录片 / 综艺 等直接包含
    if (excl === '电影' && /片$/.test(t) && t !== '纪录片') return true; // 动作片/喜剧片…（纪录片单列）
    if (excl === '剧集' && /剧$/.test(t)) return true;            // 国产剧/日韩剧/电视剧…
    return false;
  }
  function _itemTypeExcluded(it, arr) {
    var t = it.typeName || it.vodType || '';
    for (var i = 0; i < arr.length; i++) { if (_typeMatches(arr[i], t)) return true; }
    return false;
  }
  function _itemRegionExcluded(it, arr) {
    var a = it.area || '';
    for (var i = 0; i < arr.length; i++) { if (_containsEither(a, arr[i])) return true; }
    return false;
  }
  function _itemYearExcluded(it, year) {
    var y = parseInt(it.year, 10);
    if (isNaN(y)) return false; // 无年份不剔除
    return y < year;
  }
  function _itemScoreExcluded(it, min) {
    var s = parseFloat(it.score != null ? it.score : (it.vodScore != null ? it.vodScore : ''));
    if (isNaN(s)) return false;
    return s < min;
  }
  function _itemKeywordExcluded(it, arr) {
    // 简介 + 标题 + 备注 任一含关键词子串即隐藏（大小写不敏感）
    var hay = ((it.content || '') + ' ' + (it.title || '') + ' ' + (it.remarks || '')).toLowerCase();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && hay.indexOf(String(arr[i]).toLowerCase()) >= 0) return true;
    }
    return false;
  }
  function _itemEpisodeExcluded(it, n) {
    // 结构识别：playUrl 集数超过阈值即隐藏（竖屏短剧多为 60–100+ 集）。
    // 电影 playUrl 仅 1 集天然安全；无 playUrl（如 Kazumi 搜索结果）不判定。
    if (n == null || !it || !it.playUrl) return false;
    var cnt = (SFV.sources && typeof SFV.sources.countEpisodes === 'function')
      ? SFV.sources.countEpisodes(it.playUrl) : 0;
    if (!cnt) return false;
    return cnt > n;
  }

  // 懒加载 TMDB 评分补全：仅当设置了 minScore 才调用。
  // 按 title|year 内存缓存；约 4 路并发；失败项 score 保持 undefined（不被 minScore 误杀）。
  var _scoreCache = {};
  function _scoreKey(it) { return (it.title || '').toLowerCase() + '|' + (it.year || ''); }
  function enrichScores(items) {
    if (!items || !items.length) return Promise.resolve(items);
    var tmdb = SFV.tmdb;
    if (!tmdb || !tmdb.search) return Promise.resolve(items);
    var pending = items.filter(function (it) {
      if (it.tmdbRating != null) { it.score = it.tmdbRating; return false; } // 聚合已补评分，复用
      return _scoreCache[_scoreKey(it)] === undefined;
    });
    if (!pending.length) {
      items.forEach(function (it) { var s = _scoreCache[_scoreKey(it)]; if (s != null) it.score = s; });
      return Promise.resolve(items);
    }
    var CONC = 4;
    var idx = 0;
    function worker() {
      if (idx >= pending.length) return Promise.resolve();
      var it = pending[idx++];
      var key = _scoreKey(it);
      if (_scoreCache[key] !== undefined) return worker(); // 已被并发 worker 认领/查询，跳过
      _scoreCache[key] = null; // 认领哨兵，防止同标题并发重复请求
      return Promise.resolve(tmdb.search(it.title)).then(function (res) {
        var top = (res && res.length) ? res[0] : null;
        var rating = top && typeof top.rating === 'number' ? top.rating : null;
        _scoreCache[key] = rating;
        if (rating != null) it.score = rating;
      }).catch(function () {
        _scoreCache[key] = null; // 标记已查无果，避免重复请求
      }).then(worker);
    }
    var workers = [];
    for (var w = 0; w < Math.min(CONC, pending.length); w++) workers.push(worker());
    return Promise.all(workers).then(function () {
      items.forEach(function (it) { var s = _scoreCache[_scoreKey(it)]; if (s != null) it.score = s; });
      return items;
    });
  }

  // 应用「排除筛选 + 隐藏已看/已弃」前端过滤
  function applyResultFilters(items) {
    var fs = getFilterState();
    if (!fs || !items) return items;
    var exclTypes = fs.excludeTypes || [];
    var exclRegions = fs.excludeRegions || [];
    var exclKeywords = fs.excludeKeywords || [];
    var exclYear = fs.excludeBeforeYear != null ? fs.excludeBeforeYear : null;
    var minScore = fs.minScore != null ? fs.minScore : null;
    var exclEpi = fs.excludeEpisodeAbove != null ? fs.excludeEpisodeAbove : null;
    var hasExcl = exclTypes.length || exclRegions.length || exclKeywords.length ||
      exclYear != null || minScore != null || exclEpi != null;
    if (!hasExcl && !_hideWatched && !_hideAbandoned) return items;
    return items.filter(function (it) {
      if (_hideWatched && SFV.collections && SFV.collections.isWatched(it)) return false;
      if (_hideAbandoned && SFV.collections && SFV.collections.isAbandoned(it)) return false;
      if (exclTypes.length && _itemTypeExcluded(it, exclTypes)) return false;
      if (exclRegions.length && _itemRegionExcluded(it, exclRegions)) return false;
      if (exclYear != null && _itemYearExcluded(it, exclYear)) return false;
      if (exclKeywords.length && _itemKeywordExcluded(it, exclKeywords)) return false;
      if (minScore != null && _itemScoreExcluded(it, minScore)) return false;
      if (exclEpi != null && _itemEpisodeExcluded(it, exclEpi)) return false;
      return true;
    });
  }

  // 确保筛选 FAB 与 chips 容器存在并可见
  function ensureFilterUi() {
    var page = getSearchPage();
    if (!page) return;
    if (!SFV.SearchFilter || !SFV.SearchFilter.createFab) return;

    if (!_chipsBar) {
      _chipsBar = doc.getElementById('sfv-search-filter-chips');
    }
    if (!_filterFab) {
      _filterFab = SFV.SearchFilter.createFab('筛选', function () { openFilterPanel(); });
      // T-移植：FAB 内嵌到搜索页（随页面显隐），避免遮挡音乐态 fx-fab
      page.appendChild(_filterFab);
    }
    // chips 内容/可见性交由 renderFilterChips 处理
    renderFilterChips();
  }

  function renderFilterChips() {
    if (!_chipsBar || !SFV.SearchFilter || !SFV.SearchFilter.renderChips) return;
    var fs = getFilterState();
    var hasAny = (fs && fs.hasAdvancedFilters && fs.hasAdvancedFilters()) || _hideWatched || _hideAbandoned;
    _chipsBar.style.display = hasAny ? '' : 'none';
    SFV.SearchFilter.renderChips(_chipsBar, fs || {}, { notShowWatched: _hideWatched, notShowAbandoned: _hideAbandoned }, {
      onRemoveType: function (t) { var fs2 = getFilterState(); var i = fs2.excludeTypes.indexOf(t); if (i >= 0) { fs2.excludeTypes.splice(i, 1); reSearch(); } },
      onRemoveRegion: function (r) { var fs2 = getFilterState(); var i = fs2.excludeRegions.indexOf(r); if (i >= 0) { fs2.excludeRegions.splice(i, 1); reSearch(); } },
      onRemoveKeyword: function (t) { var fs2 = getFilterState(); var i = fs2.excludeKeywords.indexOf(t); if (i >= 0) { fs2.excludeKeywords.splice(i, 1); reSearch(); } },
      onRemoveYear: function () { getFilterState().excludeBeforeYear = null; reSearch(); },
      onRemoveScore: function () { getFilterState().minScore = null; reSearch(); },
      onRemoveEpisode: function () { getFilterState().excludeEpisodeAbove = null; reSearch(); },
      onRemoveSort: function () { getFilterState().sort = 'heat'; reSearch(); },
      onToggleWatched: function () { _hideWatched = false; reSearch(); },
      onToggleAbandoned: function () { _hideAbandoned = false; reSearch(); }
    });
  }

  function reSearch() {
    renderFilterChips();
    var kw = (searchInput && searchInput.value) ? searchInput.value.trim() : '';
    if (kw) doInlineSearch(kw);
  }

  function openFilterPanel() {
    if (!SFV.SearchFilter || !SFV.SearchFilter.open) {
      console.warn('[SFV-Search] 筛选模块未加载');
      return;
    }
    var fs = getFilterState();
    SFV.SearchFilter.open({
      initialFilterState: fs ? fs.copyWith() : null,
      initialNotShowWatched: _hideWatched,
      initialNotShowAbandoned: _hideAbandoned,
      onApply: function (res) {
        if (res.filterState) _filterState = res.filterState.copyWith();
        _hideWatched = !!res.notShowWatched;
        _hideAbandoned = !!res.notShowAbandoned;
        // 应用后重新搜索（带 filters）
        var kw = (searchInput && searchInput.value) ? searchInput.value.trim() : '';
        if (kw) doInlineSearch(kw);
        else renderFilterChips();
      }
    });
  }

  // ==== T120 关键修复：把 helper 函数定义在 IIFE 顶层，避免 bindCapsuleSearchBtn() 内
  // handler 引用 _getSearchInput 时报 ReferenceError（之前 helper 定义在 `{ ... }` 块内，
  // 但 (2) 段 handler 在 bindCapsuleSearchBtn 函数体内，跨函数/块作用域导致 undefined）
  function _getSearchInput() { return doc.getElementById ? doc.getElementById('sfv-search-input') : null; }
  function _getHistoryDrop() { return doc.getElementById ? doc.getElementById('sfv-history-drop') : null; }

  function bindCapsuleSearchBtn() {
    if (_searchBound) return;
    _searchBound = true;

    // (1) 胶囊按钮点击 -> 打开/关闭全页搜索
    doc.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('#sfv-capsule-search-btn') : null;
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      console.log('[SFV-Search] 胶囊搜索按钮被点击');
      toggleSearchPage();
    }, true);

    // (1b) 直接绑定 fallback（防止 capture 阶段被拦截）
    var capsuleBtn = doc.getElementById ? doc.getElementById('sfv-capsule-search-btn') : null;
    if (capsuleBtn) {
      capsuleBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        console.log('[SFV-Search] 胶囊按钮直接 click 触发');
        toggleSearchPage();
      });
    }

    // T118 直接绑定 fallback：AppBar ← 返回 + × 关闭按钮 在元素自身绑 click
    // （绕过 document 级 capture 阶段可能被其他监听器异常阻断，确保用户点击必触发）
    var appbarBack = doc.querySelector ? doc.querySelector('.sfv-search-appbar-back') : null;
    if (appbarBack) {
      appbarBack.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        console.log('[SFV-Search] AppBar ← 返回按钮直接 click 触发');
        closeSearchPage();
      });
    }
    var appbarClose = doc.querySelector ? doc.querySelector('.sfv-search-appbar-close') : null;
    if (appbarClose) {
      appbarClose.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        console.log('[SFV-Search] AppBar × 关闭按钮直接 click 触发');
        if (global.window && global.window.desktopWindow && typeof global.window.desktopWindow.close === 'function') {
          global.window.desktopWindow.close();
        } else if (typeof global.window.close === 'function') {
          global.window.close();
        }
      });
    }
    var sfvInput = doc.getElementById ? doc.getElementById('sfv-search-input') : null;
    if (sfvInput) {
      // T118 直接绑定：input 直接 click 强制 focus（兜底）
      sfvInput.addEventListener('click', function (ev) {
        try { sfvInput.focus(); } catch (e) {}
      });
    }

    // (2) 关闭/返回按钮 -> 关闭搜索页
    // T109h：移除独立 header 后，关闭按钮在 search-bar-trailing 内（.sfv-search-close）
    //        ← 返回图标在 search-bar-leading 内，data-sfv-mode='back' 时点击也关闭
    // T113：图片搜索按钮（.sfv-search-image-search / data-sfv-image-search）后端未接入
    //        仅 toast 提示「图片搜索功能即将上线，敬请期待」
    // T115：AppBar 重组 — ← 顶部 AppBar back 推出搜索页；× 关闭软件（IPC desktopWindow.close）
    doc.addEventListener('click', function (ev) {
      if (!isSearchPageOpen()) return;
      // T115：AppBar 顶部 × 关闭按钮 → 关闭软件（走 Electron IPC）
      var quitBtn = ev.target.closest ? ev.target.closest('[data-sfv-search-quit]') : null;
      if (quitBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          if (typeof global.closeWindow === 'function') {
            global.closeWindow();
          } else if (global.window && global.window.desktopWindow && typeof global.window.desktopWindow.close === 'function') {
            global.window.desktopWindow.close();
          } else {
            // 浏览器 fallback（仅用于非 Electron 调试）
            global.window && global.window.close && global.window.close();
          }
        } catch (e) { /* swallow: 用户已发出关闭意图 */ }
        return;
      }
      // T115：AppBar 顶部 ← 返回按钮 → 关闭搜索页（回到主页，不退出软件）
      var backBtn = ev.target.closest ? ev.target.closest('[data-sfv-search-back]') : null;
      if (backBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        console.log('[SFV-Search] ← 返回按钮点击触发, 调用 closeSearchPage()');
        closeSearchPage();
        console.log('[SFV-Search] closeSearchPage 执行后, 当前状态=' + (isSearchPageOpen() ? '已打开' : '已关闭'));
        return;
      }
      var imgBtn = ev.target.closest ? ev.target.closest('.sfv-search-image-search, [data-sfv-image-search]') : null;
      if (imgBtn) {
        // T116：图片搜索按钮已从 DOM 移除（用户要求删除），保留 handler 兼容历史 fallback
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof toast === 'function') toast('图片搜索功能即将上线，敬请期待');
        else if (SFV.home && SFV.home.toast) SFV.home.toast('图片搜索功能即将上线，敬请期待');
        return;
      }
      var closeBtn = ev.target.closest ? ev.target.closest('.sfv-search-close') : null;
      var leading = ev.target.closest ? ev.target.closest('.sfv-search-bar-leading') : null;
      if (closeBtn) { closeSearchPage(); return; }
      // leading 图标在"back"模式(←)时点击 = 关闭搜索页
      if (leading) {
        var icon = leading.querySelector ? leading.querySelector('.sfv-search-bar-icon') : null;
        if (icon && icon.getAttribute('data-sfv-mode') === 'back') {
          closeSearchPage();
        } else {
          // 在 search 模式下点击 leading → 聚焦搜索框
          var si = _getSearchInput ? _getSearchInput() : doc.getElementById('sfv-search-input');
          if (si) si.focus();
        }
      }
    }, true);

  } // <-- ensure() 闭合（注意：搜索栏 focus/click 事件已移到外部）

  // ==== T109f 关键修复：搜索栏交互事件必须在 ensure() 外部 ====
  // ensure() 是懒初始化（首次打开浏览层才执行）。
  // 如果 focus/click 事件在 ensure() 内部，用户打开搜索页后：
  //   - ensure() 执行 → 注册事件 → 添加 sfv-search-open → setTimeout focus
  //   - 这个链路理论上应该工作，但实际上可能因时序/缓存/执行顺序问题失败
  // 解决方案：将所有搜索栏交互事件移到 IIFE 顶层，确保页面加载即生效。
  {
    // (3) 搜索栏聚焦 -> 显示历史下拉
    doc.addEventListener('focus', function (ev) {
      var si = _getSearchInput();
      if (!isSearchPageOpen() || !si) return;
      console.log('[SFV-Search] focus 事件: target=', ev.target.tagName, '#', ev.target.id,
        ' isSearchInput=', ev.target === si);
      if (ev.target === si) showHistoryDrop();
    }, true);

    doc.addEventListener('blur', function (ev) {
      var si = _getSearchInput();
      if (!isSearchPageOpen() || !si) return;
      if (ev.target === si) { setTimeout(function () { hideHistoryDrop(); }, 150); }
    }, true);

    // (3b) 搜索栏点击 → 强制 focus input（T115 增强：双保险，确保点击 bar 任何空白均能聚焦）
    // 之前 setTimeout(0) 方案在某些 Chromium 渲染场景下哑火。
    // 新方案：捕获阶段直接调用 si.focus() + activeElement 复核。
    doc.addEventListener('click', function (ev) {
      if (!isSearchPageOpen()) return;
      var si = _getSearchInput();
      if (!si) return;
      // 1. 如果点击的是 input 本身，让浏览器默认处理
      if (ev.target === si) return;
      // 2. 如果点击的是 leading / trailing / 任何 .sfv-search-bar-act 按钮，handler 已经处理
      var lead = ev.target.closest ? ev.target.closest('.sfv-search-bar-leading, .sfv-search-bar-trailing, .sfv-search-bar-act, .sfv-search-appbar') : null;
      if (lead) return;
      // 3. 点击的是 .sfv-search-bar 其它区域 → 强制 focus
      var bar = ev.target.closest ? ev.target.closest('.sfv-search-bar') : null;
      if (bar) {
        ev.preventDefault();
        try { si.focus(); } catch (e) {}
        // 双保险：若 focus 失败（极少见），下一帧再触发一次
        if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(function () {
            if (document.activeElement !== si && typeof si.focus === 'function') {
              try { si.focus(); } catch (e) {}
            }
          });
        }
      }
    }, true);

    // (3c) 返回模式图标点击（←）-> 收起历史面板
    doc.addEventListener('click', function (ev) {
      if (!isSearchPageOpen()) return;
      var icon = ev.target.closest ? ev.target.closest('.sfv-search-bar-icon') : null;
      if (icon && icon.getAttribute && icon.getAttribute('data-sfv-mode') === 'back') {
        ev.preventDefault();
        ev.stopPropagation();
        console.log('[SFV-Search] ← 返回图标 click -> hideHistoryDrop');
        hideHistoryDrop();
        var si = _getSearchInput();
        if (si) si.blur();
      }
    }, true);

    console.log('[SFV-DIAG] 搜索栏 focus/click 事件已在 IIFE 顶层注册（ensure 外部）');
  }

    // ==== T109f 关键修复：搜索栏其余交互事件也必须在 IIFE 顶层注册（ensure 外部） ====
    {
    // (4) 历史下拉：点击 leading ← 图标（back模式）-> 收起面板
    // T109h：移除 .sfv-history-drop-back 后，由 search-bar-leading 的 ← 图标承担此功能
    doc.addEventListener('click', function (ev) {
      if (!isSearchPageOpen()) return;
      var leading = ev.target.closest ? ev.target.closest('.sfv-search-bar-leading') : null;
      if (!leading) return;
      var icon = leading.querySelector ? leading.querySelector('.sfv-search-bar-icon') : null;
      if (icon && icon.getAttribute('data-sfv-mode') === 'back') {
        hideHistoryDrop();
        var si = _getSearchInput ? _getSearchInput() : doc.getElementById('sfv-search-input');
        if (si) si.focus();
      }
    }, true);

    // (5) 历史条目点击 -> 执行搜索
    doc.addEventListener('click', function (ev) {
      if (!isSearchPageOpen()) return;
      var item = ev.target.closest ? ev.target.closest('.sfv-history-item') : null;
      if (!item || !searchInput) return;
      var kw = item.getAttribute('data-sfv-kw');
      if (kw) { searchInput.value = kw; hideHistoryDrop(); doInlineSearch(kw); }
    }, true);

    // (6) 历史条目删除按钮 -> 删除单条
    doc.addEventListener('click', function (ev) {
      if (!isSearchPageOpen()) return;
      var delBtn = ev.target.closest ? ev.target.closest('.sfv-history-item-del') : null;
      if (!delBtn) return;
      ev.stopPropagation();
      var item = delBtn.closest ? delBtn.closest('.sfv-history-item') : null;
      if (!item) return;
      var kw = item.getAttribute('data-sfv-kw');
      if (kw) { removeSearchHistoryItem(kw); renderHistoryDrop(); }
    }, true);

    // (7) 回车搜索 / Escape 关闭 —— T122：用 _getSearchInput() 实时查 DOM（避免闭包变量过期）
    doc.addEventListener('keydown', function (ev) {
      if (!isSearchPageOpen()) return;
      var si = _getSearchInput();
      if (!si) return;
      if ((ev.key === 'Enter' || ev.keyCode === 13) && ev.target === si) {
        ev.preventDefault();
        ev.stopPropagation();
        var kw = (si.value || '').trim();
        console.log('[SFV-Search] Enter 触发, kw="' + kw + '"');
        if (kw) { doInlineSearch(kw); }
        return;
      }
      if (ev.key === 'Escape' || ev.keyCode === 27) {
        if (SFV.SearchFilter && SFV.SearchFilter.isOpen && SFV.SearchFilter.isOpen()) return;
        // T123：分级 Esc —— 先关历史面板（如果显示），再关闭搜索页
        var hd = _getHistoryDrop();
        if (hd && hd.classList.contains('sfv-history-visible')) {
          hideHistoryDrop();
          ev.preventDefault();
          ev.stopPropagation();
        } else {
          closeSearchPage();
          ev.preventDefault();
          ev.stopPropagation();
        }
        return;
      }
    }, true);

    // (8) 输入时实时过滤历史
    doc.addEventListener('input', function (ev) {
      if (!isSearchPageOpen() || !searchInput || ev.target !== searchInput) return;
      if (historyDrop && historyDrop.classList.contains('sfv-history-visible')) {
        renderHistoryDrop((searchInput.value || '').trim());
      }
    }, true);
  }

  // ---- DOM 引用 ----
  function getSearchPage() {
    if (!pageEl) {
      pageEl = doc.getElementById('sfv-search-page');
      searchInput = doc.getElementById('sfv-search-input');
      historyDrop = doc.getElementById('sfv-history-drop');
      historyListEl = doc.getElementById('sfv-history-drop-list');
      resultArea = doc.getElementById('sfv-search-result-area');
    }
    return pageEl;
  }

  function isSearchPageOpen() {
    var el = getSearchPage();
    return !!(el && el.classList.contains('sfv-search-open'));
  }

  // ---- 开关 ----
  function toggleSearchPage() {
    console.log('[SFV-Search] toggleSearchPage called, 当前状态=' + (isSearchPageOpen() ? '已打开' : '已关闭'));
    if (isSearchPageOpen()) closeSearchPage();
    else openSearchPage();
  }

  function openSearchPage() {
    var el = getSearchPage();
    if (!el) {
      console.error('[SFV-Search] openSearchPage 失败：#sfv-search-page 未找到');
      return;
    }
    console.log('[SFV-Search] openSearchPage: 元素找到, 当前class=' + el.className +
      ', body.video-space-active=' + doc.body.classList.contains('video-space-active'));
    ensure(); // 确保浏览层已初始化（doSearch 依赖 SFV.sources 等）
    el.classList.add('sfv-search-open');
    console.log('[SFV-Search] openSearchPage: 添加 sfv-search-open 后 class=' + el.className);
    renderHistoryDrop();
    clearResultArea();
    _currentSearchView = null;
    ensureFilterUi(); // 挂载筛选 FAB + 渲染已应用筛选条
    if (searchInput) {
      searchInput.value = '';
      setTimeout(function () { if (searchInput) searchInput.focus(); }, 350);
    }
  }

  function closeSearchPage() {
    var el = getSearchPage();
    if (!el) return;
    el.classList.remove('sfv-search-open');
    hideHistoryDrop();
    _currentSearchView = null;
  }

  // ---- 历史下拉 ----
  // T109f：Kazumi 风格图标切换——历史面板显示时搜索图标变为 ← 返回箭头
  var _searchBarIconEl = null; // 缓存搜索栏图标 DOM
  function _getSearchBarIcon() {
    if (!_searchBarIconEl) _searchBarIconEl = (doc.querySelector ? doc.querySelector('.sfv-search-bar-icon') : null);
    return _searchBarIconEl;
  }
  function showHistoryDrop() {
    // T123：历史面板**默认隐藏**，点击搜索栏时通过添加 .sfv-history-visible 类触发 slide-down 动画
    if (!historyDrop) return;
    if (historyDrop.classList.contains('sfv-history-visible')) return;  // 已显示就不重触发动画
    historyDrop.classList.add('sfv-history-visible');
    // T125：focus 时给搜索栏加 .sfv-search-bar-focus class，border-radius 改为 26px 26px 0 0（与历史面板顶部平接形成连续胶囊）
    var bar = doc.querySelector ? doc.querySelector('.sfv-search-bar') : null;
    if (bar) bar.classList.add('sfv-search-bar-focus');
    // 🔍 搜索图标 → ← 返回图标
    var icon = _getSearchBarIcon();
    if (icon) {
      icon.setAttribute('data-sfv-mode', 'back');
      icon.innerHTML = '<path d="M15 18l-6-6 6-6"/>';
    }
  }
  function hideHistoryDrop() {
    // T123：历史面板隐藏（移除 .sfv-history-visible）
    if (historyDrop) historyDrop.classList.remove('sfv-history-visible');
    // T125：blur 时移除搜索栏 .sfv-search-bar-focus class，border-radius 恢复 4 角圆 pill
    var bar = doc.querySelector ? doc.querySelector('.sfv-search-bar') : null;
    if (bar) bar.classList.remove('sfv-search-bar-focus');
    // ← 返回图标 → 🔍 搜索图标
    var icon = _getSearchBarIcon();
    if (icon) {
      icon.setAttribute('data-sfv-mode', 'search');
      icon.innerHTML = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>';
    }
  }

  // ---- 历史管理（localStorage） ----
  function getSearchHistory() {
    try { var raw = localStorage.getItem(SEARCH_HISTORY_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }

  function saveSearchHistory(kw) {
    if (!kw) return;
    try {
      var list = getSearchHistory();
      list = list.filter(function (i) { return i !== kw; });
      list.unshift(kw);
      if (list.length > MAX_SEARCH_HISTORY) list.length = MAX_SEARCH_HISTORY;
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function removeSearchHistoryItem(kw) {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY,
        JSON.stringify(getSearchHistory().filter(function (i) { return i !== kw; })));
    } catch (e) {}
  }

  function clearSearchHistory() {
    try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch (e) {}
    renderHistoryDrop();
  }

  // 渲染历史下拉列表（支持输入过滤）
  function renderHistoryDrop(filterText) {
    if (!historyListEl) return;
    var list = getSearchHistory();
    if (filterText) {
      var ft = filterText.toLowerCase();
      list = list.filter(function (i) { return i.toLowerCase().indexOf(ft) !== -1; });
    }
    if (!list.length) {
      // T120：历史面板始终可见 —— 空状态不再收起，而是显示「暂无搜索记录」提示
      // T109g：对齐 Kazumi：有过滤文字但无匹配结果时，显示「暂无匹配记录，按回车检索」
      if (filterText) {
        historyListEl.innerHTML = '<div class="sfv-search-empty-hint">暂无匹配记录，按回车检索</div>';
      } else {
        historyListEl.innerHTML = '<div class="sfv-search-empty-hint">暂无搜索记录</div>';
      }
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      // T109h：对齐 Kazumi ListTile —— 单层 button，无包装 div
      html += '<button class="sfv-history-item" type="button" data-sfv-kw="' + esc(list[i]) + '">';
      html += '<span>' + esc(list[i]) + '</span>';
      html += '<span class="sfv-history-item-del" data-sfv-kw="' + esc(list[i]) + '" title="\u5220\u9664">\u00D7</span></button>';
    }
    historyListEl.innerHTML = html;
  }

  // ---- 核心搜索：结果直接渲染在全页内（不跳转浏览层）----
  function doInlineSearch(kw) {
    if (!kw) return;
    // T123：搜索时关闭历史面板（不挤压结果区域）
    hideHistoryDrop();
    saveSearchHistory(kw);
    ensure();

    showSearchStatus('\u6B63\u5728\u641C\u7D22\u300C' + esc(kw) + '\u300D\u2026');

    var canCms = hasSources();
    var canKz = !!(SFV.kazumi && SFV.kazumi.hasRules && SFV.kazumi.hasRules());
    if (!canCms && !canKz) {
      showSearchStatus('\u8BF7\u5148\u6DFB\u52A0\u7247\u6E90\u6216\u5BFC\u5165\u89C4\u5219\u540D\u518D\u641C\u7D22\u3002', 'warn');
      return;
    }

    var viewToken = { mode: 'inline-search', query: kw, _ts: Date.now() };
    _currentSearchView = viewToken;

    // 纯排除模型：排除维度统一在结果合并后客户端过滤，数据源只接收正向 keyword。
    // Kazumi 桥接层会调用 fromFilterState 仅透传 keyword + 排序 hint。
    var kzFilters = getFilterState() || {}; // SearchFilterState 实例，fromFilterState 仅序列化正向意图

    var cmsP = canCms ? SFV.sources.search(kw, { timeout: 12000 })
                      : Promise.resolve({ items: [], errors: [], noSource: true });
    var kzP  = canKz  ? SFV.kazumi.search(kw, { filters: kzFilters })
                      : Promise.resolve({ items: [], errors: [] });

    Promise.all([cmsP, kzP]).then(function (arr) {
      if (_currentSearchView !== viewToken) return; // 已过时丢弃
      var merged = (arr[0].items || []).concat(arr[1].items || []);
      if (!merged.length) {
        showSearchStatus('\u6CA1\u6709\u627E\u5230\u300C' + esc(kw) + '\u300D\u7684\u76F8\u5173\u7ED3\u679C\u3002');
        return;
      }
      // 方案 B：本地清洗标题归并（同步，零 TMDB 请求）—— 先合掉同名不同源的重复卡
      var aggregated = (SFV.SearchFilterCore && SFV.SearchFilterCore.aggregateByLocalKey)
        ? SFV.SearchFilterCore.aggregateByLocalKey(merged)
        : merged;
      var tmdbEnabled = !!(SFV.tmdb && typeof SFV.tmdb.hasKey === 'function' && SFV.tmdb.hasKey() &&
                           typeof SFV.tmdb.bestMatch === 'function');
      showSearchStatus('\u6B63\u5728\u805A\u5408\u7ED3\u679C\u2026');
      // 方案 A：TMDB 身份归一（异步，带超时/并发），不可用时仅用方案 B 本地分组
      var pId = tmdbEnabled ? enrichIdentity(aggregated) : Promise.resolve(aggregated);
      pId.then(function (afterId) {
        if (_currentSearchView !== viewToken) return;
        // 评分排除需 TMDB 补全：仅当用户设置了 minScore 才懒加载
        var fsNow = getFilterState();
        var needScore = fsNow && fsNow.minScore != null && tmdbEnabled;
        if (needScore) showSearchStatus('\u6B63\u5728\u8865\u5168\u8BC4\u5206\u2026');
        var chain = needScore
          ? enrichScores(afterId).then(function (enriched) {
              if (_currentSearchView !== viewToken) return null;
              return applyResultFilters(enriched);
            })
          : Promise.resolve(applyResultFilters(afterId));
        chain.then(function (filtered) {
          if (_currentSearchView !== viewToken || filtered == null) return;
          if (filtered.length) {
            renderInlineResults(filtered, kw);
          } else {
            showSearchStatus('\u6CA1\u6709\u627E\u5230\u300C' + esc(kw) + '\u300D\u7684\u76F8\u5173\u7ED3\u679C\u3002');
          }
        });
      }).catch(function (err) {
        if (_currentSearchView !== viewToken) return;
        showSearchStatus('\u641C\u7D22\u51FA\u9519\uFF1A' + (err && err.message ? err.message : '\u672A\u77E5\u9519\u8BEF'), 'error');
      });
    }).catch(function (err) {
      if (_currentSearchView !== viewToken) return;
      showSearchStatus('\u641C\u7D22\u51FA\u9519\uFF1A' + (err && err.message ? err.message : '\u672A\u77E5\u9519\u8BEF'), 'error');
    });
  }

  // ---- 结果区域操作 ----
  function clearResultArea() { if (resultArea) resultArea.innerHTML = ''; }

  function showSearchStatus(msg, type) {
    if (!resultArea) return;
    var icons = { info: '\uD83D\uDD0D', warn: '\u26A0\uFE0F', error: '\u274C' };
    resultArea.innerHTML = '<div class="sfv-search-status"><div class="sfv-status-icon">' +
      (icons[type] || icons.info) + '</div><div>' + msg + '</div></div>';
  }

  // 在全页搜索结果区渲染海报卡片网格
  function renderInlineResults(items, query) {
    if (!resultArea) return;
    resultArea.innerHTML = '';

    var grid = doc.createElement('div');
    grid.className = 'sfv-grid';

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var card = doc.createElement('button');
      card.type = 'button';
      card.className = 'sfv-card';

      // 封面
      var cover = doc.createElement('div');
      cover.className = 'sfv-card-cover';
      if (it.pic) {
        var img = doc.createElement('img');
        img.src = it.pic;
        img.alt = esc(it.title || '');
        img.loading = 'lazy';
        img.addEventListener('load', function () { img.classList.add('loaded'); });
        cover.appendChild(img);
      } else {
        cover.textContent = '\uD83C\uDFA5';
      }

      // 标题
      var name = doc.createElement('div');
      name.className = 'sfv-card-name';
      name.textContent = it.title || '\u672A\u547D\u540D';

      // 副标题
      var sub = doc.createElement('div');
      sub.className = 'sfv-card-sub';
      if (it.tmdbRating != null) {
        var vote = doc.createElement('span');
        vote.className = 'sfv-tmdb-vote';
        vote.textContent = '\u2605 ' + Number(it.tmdbRating).toFixed(1);
        sub.appendChild(vote);
      }
      var st = '';
      if (it.year) st += it.year;
      if (it.variants && it.variants.length > 1) {
        if (st) st += ' \u00B7 ';
        st += it.variants.length + ' \u4E2A\u6765\u6E90';
      }
      if (!st) st = '\u70B9\u51FB\u67E5\u770B';
      sub.appendChild(doc.createTextNode(st));

      card.appendChild(cover);
      card.appendChild(name);
      card.appendChild(sub);
      if (it.isKazumi) card.classList.add('sfv-card--kazumi');

      // 点击 -> 关闭搜索页 -> 直接打开浏览层详情
      // 不走 open() 的 search 模式（否则 renderSearch 会把头部标题写成"在线搜索"并残留到详情页）。
      // 这里手动把覆盖层复位成 legacy 视图（清掉可能残留的 page/category 态），再由 openDetail/openKazumiDetail 渲染详情。
      (function (cap) {
        card.addEventListener('click', function () {
          closeSearchPage();
          ensure();
          overlay.classList.remove('sfv-browse--page');
          overlay.style.top = '';
          uiMode = 'view';
          activePageId = null;
          stack.length = 0;
          if (cap.isKazumi) openKazumiDetail(cap);
          else openDetail(cap);
        });
      })(it);

      grid.appendChild(card);

      // TMDB 海报补全
      if (typeof enrichTmdb === 'function') {
        try { enrichTmdb(card, it); } catch (e) {}
      }
    }

    resultArea.appendChild(grid);
  }
  // 激活高亮统一交由 SFV.nav 共享组件维护（单一 .active 切换源），
  // 不在 online.js 内重复 querySelector + classList 逻辑。
  function setActiveNav(key) {
    currentNav = key;
    if (SFV.nav && typeof SFV.nav.paintActive === 'function') SFV.nav.paintActive(key);
  }

  function handleNavAction(key) {
    switch (key) {
      case 'discover':
        goToNav('discover'); // 汇联：独立页面（板块建设中）
        break;
      case 'world':
        goToNav('world');    // 世界：独立页面（板块建设中）
        break;
      case 'home':
        goHome();            // 首页 = 影视空间既有首页（home.js 渲染的主 DOM），不是覆盖层里的独立分页
        break;
      case 'movie':
        goToNav('movie');    // 电影：独立页面（TMDB 热门网格）
        break;
      case 'anime':
        goToNav('anime');    // 动漫：独立页面（TMDB 热门动画网格）
        break;
      default:
        break;
    }
  }

  // 五个导航项 = 同一布局下的内容区平级切换（SPA），而非多页面跳转：
  //   - 覆盖层不再盖住固定 tab 栏，内容区定位到 tab 栏下方；
  //   - 隐藏覆盖层自带「返回+标题」头（导航由固定 #sfv-nav 承担，tab 之间无返回语义）。
  // ---- body 滚动锁定（全屏覆盖层模式）----
  var _savedBodyOverflow = '';
  var _savedBodyPos = '';
  function lockBodyScroll() {
    var b = document.body;
    if (!b) return;
    _savedBodyOverflow = b.style.overflow || '';
    _savedBodyPos = b.style.position || '';
    b.style.overflow = 'hidden';
    // 移动端：锁定滚动位置，防止地址栏收缩导致页面跳动
    b.style.position = 'fixed';
    b.style.top = '-' + (window.scrollY || window.pageYOffset || 0) + 'px';
    b.style.left = '0';
    b.style.right = '0';
    b.style.width = '100%';
  }
  function unlockBodyScroll() {
    var b = document.body;
    if (!b) return;
    b.style.overflow = _savedBodyOverflow;
    b.style.position = _savedBodyPos;
    // 恢复滚动位置
    var sy = parseInt(b.style.top || '0', 10) || 0;
    b.style.top = ''; b.style.left = ''; b.style.right = ''; b.style.width = '';
    window.scrollTo(0, -sy);
    _savedBodyOverflow = '';
    _savedBodyPos = '';
  }

  function goToNav(key) {
    ensure();
    uiMode = 'page';

    // T132-P2：无论入口（导航 click 或程序化调用）都维护激活高亮（交给共享组件）
    if (SFV.nav && typeof SFV.nav.paintActive === 'function') SFV.nav.paintActive(key);

    // ---- 全屏覆盖层模式（片单页专用） ----
    // 对标心动页效果：overlay 占满整个视口(100vw×100vh)，自带顶部返回栏，
    // 内容区内部独立滚动，底层 body 滚动被锁定。
    if (key === 'collections') {
      overlay.classList.add('sfv-show');
      overlay.classList.remove('sfv-browse--page');   // 不隐藏 head（全屏需要自带顶栏）
      overlay.classList.add('sfv-browse--fullscreen');  // 全屏模式
      overlay.classList.remove('sfv-browse--category');
      overlay.style.top = '';                           // inset:0 由 CSS 控制
      overlay.style.left = '';
      titleEl.textContent = '片单';                     // 顶部栏标题
      backBtn.textContent = '←';                       // 返回按钮文字
      backBtn.setAttribute('aria-label', '返回');
      closeBtn.style.display = 'flex';                  // 显示关闭 × 按钮
      lockBodyScroll();                                 // 锁定底层滚动
    } else {
      // 其他平级 tab 页（电影/动漫/汇联/世界）：保持原有 page 模式（nav 下方嵌入）
      overlay.classList.add('sfv-show');
      overlay.classList.add('sfv-browse--page');
      overlay.classList.remove('sfv-browse--fullscreen');
      overlay.classList.remove('sfv-browse--collections');
      // T132(路径①)：page 模式 .sfv-browse 由 CSS inset:0 flush 铺满视口，
      // 不再写内联 top（原 getContentTop() 会把覆盖层推到 ~58px，使顶部 0-58px
      // 仅剩 #search-box 悬浮；当 #search-box 宽度 < 100vw 时左右露星空 = 窗口感）。
      // 内容区顶部留白由 .sfv-browse--page .sfv-browse-body 的 padding-top:102px 承担
      // （T134g：24px 距顶 + 58px 栏高 + 20px 间隙，与音乐态搜索栏对齐）。
      overlay.style.top = '0';
    }

    if (SFV.router) SFV.router.go(key);
    activePageId = key;
    applyVideoPageBg();
  }

  // 首页 = 影视空间既有首页（home.js 渲染的主 DOM：大海报 + 心动/片单/追片/历史/音乐空间卡片 + 继续看），
  // 不是 #sfv-browse 覆盖层里的独立分页。点击首页 tab 时关闭覆盖层，回到并刷新真正的影视首页。
  function goHome() {
    ensure();
    // 离开电影/动漫分页时回收 3D 海报网格（goHome 不走 router → browse3d.deactivate 必须显式触发）
    if (SFV.browse3d && SFV.browse3d.isActive && SFV.browse3d.isActive()) {
      try { SFV.browse3d.deactivate(); } catch (e) { /* 静默：避免首页渲染被 3D 清理阻塞 */ }
    }
    close();                 // 关闭浏览覆盖层，露出下方 home.js 渲染的影视首页
    activePageId = 'home';   // 用于背景同步：首页不参与 movie/anime 自定义背景
    // T132-P2：回到影视首页时同步高亮「首页」tab
    if (SFV.nav && typeof SFV.nav.paintActive === 'function') SFV.nav.paintActive('home');
    applyVideoPageBg();
    // 刷新影视首页数据（追片计数/海报/历史可能已变），保留在 video 空间
    if (SFV.home && typeof SFV.home.render === 'function') {
      try { SFV.home.render(); } catch (e) { console.warn('[SFV-Online] goHome render failed', e); }
    }
  }

  function mkAct(label, fn) {
    var b = el('button', 'sfv-browse-act', label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  // ---------------------------------------------------------------- 公开控制
  function open(opts) {
    opts = opts || {};
    ensure();
    uiMode = 'view';      // 进入 legacy 视图（搜索/分类/规则/详情），离开页面模式
    activePageId = null;  // 背景回到默认（非电影/动漫分页）
    overlay.classList.remove('sfv-browse--page');
    overlay.style.top = ''; // legacy 视图恢复全屏覆盖
    if (!isVideoSpace() && SFV.state && SFV.state.setSpace) SFV.state.setSpace('video');
    stack = [];
    if (opts.mode === 'category' && opts.field) {
      pushView({ mode: 'category', field: opts.field });
    } else {
      // 搜索通道已废弃：open() 仅支持 category 模式，不再进入 search 视图
      console.warn('[SFV] open() 仅支持 category 模式（搜索通道已移除）');
    }
    overlay.classList.add('sfv-show');
    if (searchInput && searchInput.focus) { try { searchInput.focus(); } catch (e) {} }
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('sfv-show');
    overlay.classList.remove('sfv-browse--page');
    overlay.classList.remove('sfv-browse--fullscreen'); // 复位全屏覆盖层
    overlay.classList.remove('sfv-browse--collections'); // 复位片单页独立布局类
    overlay.classList.remove('sfv-browse--category'); // Phase B：复位分类浅色排版
    overlay.style.top = ''; // 复位全屏，供下次 legacy 视图复用
    unlockBodyScroll();     // 解锁底层滚动
    stack = []; current = null;
    uiMode = 'view'; activePageId = null;
  }
  function isOpen() { return !!(overlay && overlay.classList.contains('sfv-show')); }

  function openCategory(field) { open({ mode: 'category', field: field }); }
  // [清理] openSearch 已移除：搜索统一走 #sfv-search-page（openSearchPage）

  // ---------------------------------------------------------------- 视图栈
  function pushView(v) { stack.push(v); render(stack[stack.length - 1]); }

  // T145 修复（P0）：确保浏览层已创建且可见。
  // 问题：openDetail / openKazumiDetail 直接 pushView，但 pushView 不调 ensure() 也不加
  //   sfv-show class。从影视态首页直接点"接着看"（浏览层从未打开过）时，overlay 尚未创建，
  //   pushView→render 访问 bodyEl 等 DOM 静默失败；即便 overlay 已存在，pushView 也不会把
  //   已关闭的 overlay 重新显示 —— 用户看到"点了没反应"。
  // 修复：在详情/规则入口统一先 ensureOverlayShown()，确保 overlay 已创建并加 sfv-show，
  //   且不冲掉 stack（pushView 仍 push 到栈顶），不影响搜索/分类等 open() 路径。
  function ensureOverlayShown() {
    ensure();
    if (!overlay) return;
    if (!isVideoSpace() && SFV.state && SFV.state.setSpace) {
      try { SFV.state.setSpace('video'); } catch (e) {}
    }
    if (!overlay.classList.contains('sfv-show')) overlay.classList.add('sfv-show');
    uiMode = 'view';
    overlay.classList.remove('sfv-browse--page');
    try { if (typeof unlockBodyScroll === 'function') unlockBodyScroll(); } catch (e) {}
  }

  function goBack() {
    // 全屏覆盖层（片单页）：先询问当前 router 页的 back()，
    // 若页内二级视图已消费返回（如 具体片单 → 片单列表），则停在页内；
    // 否则关闭全屏回到影视首页。
    if (overlay && overlay.classList.contains('sfv-browse--fullscreen')) {
      var p = SFV.router ? SFV.router.current() : null;
      if (p && typeof p.back === 'function' && p.back() === true) return;
      close();
      // 回到首页
      activePageId = 'home';
      applyVideoPageBg();
      if (SFV.home && typeof SFV.home.render === 'function') {
        try { SFV.home.render(); } catch (e) { console.warn('[SFV-Online] goHome render failed', e); }
      }
      return;
    }
    // 页面模式（五个导航 tab）：平级导航，无「返回上一级」语义。
    //   - 仅当某页面内部打开了详情（如电影→详情）时，back 关闭详情回到该页网格；
    //   - 顶层 tab 页本身不切换 tab、不关闭浏览层（用户铁律：tab 之间平级）。
    if (uiMode === 'page') {
      var p = SFV.router ? SFV.router.current() : null;
      if (p && typeof p.back === 'function' && p.back() === true) return;
      return; // 顶层 tab 页：无返回操作
    }
    // legacy 视图模式：栈底=关闭整个浏览层
    if (stack.length <= 1) { close(); return; }
    stack.pop();
    render(stack[stack.length - 1]);
  }

  function render(v) {
    current = v;
    applyGridDiyToBody();
    // 栈底也显示返回按钮（点击=关闭浏览层回到影视首页）
    backBtn.style.visibility = 'visible';
    if (v.mode === 'category') {
      // 四卡分类页：左上角为搜索页同款「←」SVG，右上角显示搜索页同款「×」SVG
      backBtn.innerHTML = '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
      backBtn.setAttribute('aria-label', '返回');
    } else {
      backBtn.textContent = stack.length > 1 ? '←' : '✕';
      backBtn.setAttribute('aria-label', stack.length > 1 ? '返回' : '关闭');
    }
    // Phase B：分类页（心动/追片/片单/历史）切换为「搜索页」同款浅色透明 AppBar 排版；
    //   仅作用于 legacy 分类视图，搜索/详情/规则仍为暗金玻璃。搜索页代码零改动。
    //   通过 .sfv-browse--category 触发 player.css 的浅底 + 透明头部 + 底部上滑。
    overlay.classList.toggle('sfv-browse--category', v.mode === 'category');
    bodyEl.innerHTML = '';
    setNote('');
    if (v.mode === 'category') { setBrowseChrome(true); renderCategory(v); }
    else if (v.mode === 'detail') { setBrowseChrome(true); renderDetail(v); }
    else if (v.mode === 'rules') { setBrowseChrome(true); renderRules(v); }
    else if (v.mode === 'collection-items') { setBrowseChrome(true); renderCollectionItems(v); }
    applyVideoPageBg(); // 影视分页背景：复用「视觉主色/封面取色」控件（死命令：双态互不影响）
  }

  // ===== 网格 DIY：从 localStorage 读取偏好并写入 .sfv-browse-body 的 CSS 变量 =====
  // 由 grid-diy.js 写入 localStorage('stellaflix-grid-diy-prefs')；此处每次 render 时应用，
  // 保证即使浏览层关闭期间改过偏好，再次打开也能反映最新值。
  // 注意：页面背景（--sfv-page-bg）不再由此处控制 —— 改由 applyVideoPageBg() 复用「视觉主色」控件。
  function applyGridDiyToBody() {
    if (!bodyEl) return;
    var prefs = null;
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('stellaflix-grid-diy-prefs') : null;
      prefs = raw ? JSON.parse(raw) : null;
    } catch (e) { prefs = null; }
    if (!prefs) return;
    var s = prefs.shell || {};
    var g = prefs.grid || {};
    if (s.bg != null) bodyEl.style.setProperty('--sfv-card-bg', s.bg);
    if (s.border != null) bodyEl.style.setProperty('--sfv-card-border', s.border);
    if (s.radius != null) bodyEl.style.setProperty('--sfv-card-radius', s.radius + 'px');
    if (s.shadowColor != null) bodyEl.style.setProperty('--sfv-card-shadow-color', s.shadowColor);
    if (s.hoverBorder != null) bodyEl.style.setProperty('--sfv-card-hover-border', s.hoverBorder);
    if (s.padding != null) bodyEl.style.setProperty('--sfv-card-padding', s.padding + 'px');
    if (s.title != null) bodyEl.style.setProperty('--sfv-card-title', s.title);
    if (s.sub != null) bodyEl.style.setProperty('--sfv-card-sub', s.sub);
    if (g.gap != null) bodyEl.style.setProperty('--sfv-gap', g.gap + 'px');
    bodyEl.style.setProperty('--sfv-poster-ratio', '2 / 3');
  }

  // ===== 影视分页背景：复用歌词 tab「视觉主色 / 封面取色」控件（T119）=====
  // 死命令（用户铁律）：音乐态与影视态互不影响 —— 本函数【仅】作用于影视态内部的
  //   .sfv-browse-body（body.video-space-active 内的浏览层），绝不写入 documentElement /
  //   任何音乐态节点 / fx 控制台自身；音乐态下 bodyEl 不可用或 video-space-active 缺失 → 直接跳过。
  // 规则：
  //   ① 仅「电影 / 动漫」两个占位分页跟随视觉主色；
  //   ② 仅当视觉主色处于【自定义(custom)】模式才生效；Auto 模式在影视态不生效（回到 KVideo 默认浅色背景）；
  //   ③ 不改变现有视觉主色语义 —— 这里只是单向读取 fx.visualTintColor 用于背景，不反向写回。
  var VIDEO_PAGE_BG_DEFAULT = '#f2f4f7';
  function applyVideoPageBg() {
    if (!bodyEl) return;
    var inVideo = document.body && document.body.classList.contains('video-space-active');
    if (!inVideo) { bodyEl.style.removeProperty('--sfv-page-bg'); return; } // 死命令：音乐态不残留影视背景
    var isMovieAnime = (activePageId === 'movie' || activePageId === 'anime');
    var fx = (typeof window !== 'undefined') ? window.fx : null;
    var custom = !!(fx && fx.visualTintMode === 'custom' && typeof fx.visualTintColor === 'string'
                    && /^#[0-9a-fA-F]{6}$/.test(fx.visualTintColor));
    if (isMovieAnime && custom) {
      bodyEl.style.setProperty('--sfv-page-bg', fx.visualTintColor); // 复用视觉主色（custom）
      if (overlay) overlay.style.setProperty('--sfv-page-bg', fx.visualTintColor); // T129：覆盖层实色铺底同步
    } else {
      // 影视态 Auto / 非电影动漫分页 → 回到 KVideo 默认浅色背景
      bodyEl.style.removeProperty('--sfv-page-bg');
      if (overlay) overlay.style.removeProperty('--sfv-page-bg'); // T129：回到 --sfv-page-bg 默认(#f2f4f7)
    }
  }

  // 监听「视觉主色」控件变化（不修改 index.html，仅观察 --visual-tint 写入）：
  // setVisualTintCustom / Auto / Reset 均经 refreshFxVisualTintAndAccent 写入 --visual-tint。
  function bindVideoPageBgFromTint() {
    if (typeof document === 'undefined') return;
    var docEl = document.documentElement;
    var lastKey = '__init__';
    function check() {
      var fx = (typeof window !== 'undefined') ? window.fx : null;
      var key = fx ? (fx.visualTintMode + '|' + (fx.visualTintColor || '')) : '';
      if (key === lastKey) return;
      lastKey = key;
      applyVideoPageBg();
    }
    if (typeof MutationObserver !== 'undefined') {
      try {
        var mo = new MutationObserver(check);
        mo.observe(docEl, { attributes: true, attributeFilter: ['style'] });
      } catch (e) {}
    }
    check();
  }

  function setNote(msg, type) {
    noteEl.className = 'sfv-browse-note';
    if (!msg) { noteEl.style.display = 'none'; noteEl.textContent = ''; return; }
    noteEl.style.display = 'block';
    noteEl.textContent = msg;
    if (type) noteEl.classList.add('sfv-browse-note--' + type);
  }

  // 控制浏览层自带内联搜索栏与「本地/地址/片源」操作按钮的显隐。
  // 五个导航独立页面（含首页/汇联/世界占位页）与 legacy 详情/分类/规则视图均隐藏内联搜索；
  // 仅 legacy 搜索视图显示内联搜索。对应 CSS：.sfv-browse--browse 隐藏 .sfv-browse-search/.sfv-browse-acts。
  function setBrowseChrome(on) {
    if (overlay) overlay.classList.toggle('sfv-browse--browse', !!on);
  }

  // 居中 spinner 加载块（详情加载时用，优于纯文本）
  function renderLoading(text) {
    bodyEl.innerHTML = '';
    var box = el('div', 'sfv-loading');
    box.appendChild(el('div', 'sfv-spinner'));
    box.appendChild(el('div', 'sfv-loading-text', text || '加载中…'));
    bodyEl.appendChild(box);
  }

  // ---- TMDB 元数据统一层：海报 + 简介（元数据服务，非视频源，不触碰合规红线）----
  // 架构决策：CMS10/规则仅提供播放 URL 与剧集列表；所有视觉元数据（海报/简介/评分）
  // 统一由 TMDB 供给。TMDB 海报优先于 CMS10 自带 pic，失败时降级保留原片源图片。

  // T147：取一个条目的可用 pic —— 优先显式 pic，回落到 _tmdb.poster。
  // enrichTmdb 只写 _tmdb 不写 it.pic（见 #T147 根因），导致 openDetail → view.pic 为空 →
  // recordHistory/recordMeta 都记空 → 「接着看」读 history.pic 空 → 无图。
  // 统一走 resolvePic 后，所有下游读取（view.pic、recordMeta、recordHistory、setMeta cover、embed cover）
  // 都能拿到 TMDB 海报，搜索结果点击后即正确记录。
  function resolvePic(it) {
    if (!it) return '';
    if (it.pic) return it.pic;
    if (it._tmdb && it._tmdb.poster) return it._tmdb.poster;
    return '';
  }

  // T147：把历史条目里的 "show title · 第N集" 还原成 "show title"，给 TMDB 匹配用。
  // 历史 title 是 playEpisode 里拼的「view.title + ' · ' + ep.name」，TMDB 不该拿到剧集号。
  function showTitleOf(item) {
    if (!item || !item.title) return '';
    var idx = item.title.indexOf(' · ');
    return idx > 0 ? item.title.slice(0, idx) : item.title;
  }

  // T147：会话级 backfill 去重 —— 单次启动内同一 key 只尝试一次 TMDB 补图。
  // 历史.pic 仍空时下次 home render 会再尝试（接受偶发重试，避免网络抖动一直失败却永不重试）。
  var _picBackfillTried = {};
  // T147 后向补图：home.js「接着看」渲染后异步用 TMDB 补空 pic，成功回写 history.pic 并刷新对应 tile。
  function tryPicBackfill(item, doc) {
    if (!item || !item.key || !item.title) return;
    if (item.pic) return; // 已有 pic 不补
    if (_picBackfillTried[item.key]) return;
    if (!SFV.tmdb || typeof SFV.tmdb.hasKey !== 'function' || !SFV.tmdb.hasKey()) return;
    if (typeof SFV.tmdb.bestMatch !== 'function') return;
    if (!SFV.model || typeof SFV.model.updateHistoryPic !== 'function') return;
    var title = showTitleOf(item);
    if (!title) return;
    _picBackfillTried[item.key] = true;
    var key = item.key;
    SFV.tmdb.bestMatch(title).then(function (m) {
      if (!m || !m.poster) return;
      // updateHistoryPic 内部会校验 key+pic 非 data: 才写
      if (!SFV.model.updateHistoryPic(key, m.poster)) return;
      // 找到对应 DOM tile，刷新背景图（DOM 已渲染，无需整页重渲）
      if (!doc || !doc.querySelector) return;
      var sel = '.sfv-continue-tile[data-sfv-key="' + esc(key) + '"] .sfv-tile-cover';
      var tile = doc.querySelector(sel);
      if (tile) {
        tile.style.backgroundImage = 'url("' + esc(m.poster) + '")';
        tile.classList.add('has-cover');
      }
    }).catch(function () { /* 静默降级：下次 home render 会重试 */ });
  }

  function enrichTmdb(card, it) {
    if (!it || !it.title) return;
    if (it._tmdbResolved) return; // 聚合层已补过 TMDB（方案 A），避免重复请求
    if (!SFV.tmdb || !SFV.tmdb.hasKey()) return;
    // 已有本地缓存海报时，不再二次远程替换，避免网络抖动导致图片消失。
    if (it.pic && it.pic.indexOf('data:') === 0) return;
    SFV.tmdb.bestMatch(it.title).then(function (m) {
      if (!m || !card.isConnected) return;
      var cover = card.querySelector('.sfv-card-cover');
      // TMDB 始终优先：有海报就替换/填充（无论 CMS10 是否已给图），
      // 但优先使用本地缓存的 URL（若已缓存），避免远程加载失败。
      if (cover && m.poster) {
        var prevHtml = cover.innerHTML; // 备份 CMS10 原图，TMDB 加载失败时回退
        var img = el('img', 'sfv-card-img');
        var picUrl = (SFV.posterCache && typeof SFV.posterCache.resolvePic === 'function' && it.key)
          ? SFV.posterCache.resolvePic(it.key, m.poster)
          : m.poster;
        img.src = picUrl; img.alt = it.title || ''; img.loading = 'lazy';
        img.addEventListener('load', function () { img.classList.add('loaded'); });
        img.addEventListener('error', function () {
          img.remove();
          if (!prevHtml || prevHtml === '') cover.textContent = '🎬';
          else {
            cover.innerHTML = prevHtml; // 回退到 CMS10 原图
            var fallbackImg = cover.querySelector('img');
            if (fallbackImg && !fallbackImg.classList.contains('loaded')) {
              if (fallbackImg.complete) fallbackImg.classList.add('loaded');
              else fallbackImg.addEventListener('load', function () { fallbackImg.classList.add('loaded'); });
            }
          }
        });
        cover.textContent = ''; cover.appendChild(img);
      }
      // 卡片副标题补全评分
      if (m.vote) {
        var sub = card.querySelector('.sfv-card-sub');
        if (sub && !sub.querySelector('.sfv-tmdb-vote')) {
          sub.insertAdjacentElement('afterbegin',
            el('span', 'sfv-tmdb-vote', '★ ' + m.vote.toFixed(1))
          );
        }
      }
      // T147：写回 it.pic，让 openDetail/view/recordHistory 都能拿到 TMDB 海报。
      // 之前只写 _tmdb 不写 pic，导致点击播放后历史/接着看里都是空 pic。
      if (m.poster) it.pic = m.poster;
      it._tmdb = m;
    }).catch(function () { /* 静默降级：保留 CMS10 原有展示 */ });
  }


  // ---- 方案 A：TMDB 身份归一（多源聚合为一张卡的精确身份键）----
  // 输入：aggregateByLocalKey 的聚合结果（已按清洗标题+年份合并）。
  // 对每个候选并发 bestMatch（4 路 + 4s 超时），拿到 tmdbId|mediaType 作为
  // 二次身份键再合并；相同身份键的多个源合并为一张卡，海报只补一次。
  // TMDB 不可用/被禁用时直接返回方案 B 结果（enrichTmdb 也会因 hasKey 跳过）。
  function enrichIdentity(aggs) {
    if (!aggs || !aggs.length) return Promise.resolve(aggs);
    if (!SFV.tmdb || typeof SFV.tmdb.hasKey !== 'function' || !SFV.tmdb.hasKey() ||
        typeof SFV.tmdb.bestMatch !== 'function') {
      return Promise.resolve(aggs);
    }
    var queue = aggs.slice();
    var CONC = 4;
    function worker() {
      if (!queue.length) return Promise.resolve();
      var item = queue.shift();
      var p = Promise.race([
        SFV.tmdb.bestMatch(item.title),
        new Promise(function (res) { setTimeout(function () { res(null); }, 4000); })
      ]).catch(function () { return null; });
      return p.then(function (m) {
        // 无论命中与否都标记已尝试，避免 renderInlineResults 的 enrichTmdb 重复请求
        item._tmdbResolved = true;
        if (m && m.id != null) {
          item._tmdb = m;
          item.tmdbId = m.id;
          item.tmdbMediaType = m.mediaType;
          if (m.rating != null) item.tmdbRating = m.rating;
          if (m.poster) item.pic = m.poster; // TMDB 海报优先
        }
        return worker();
      });
    }
    var ps = [];
    for (var i = 0; i < CONC; i++) ps.push(worker());
    return Promise.all(ps).then(function () {
      // 二次合并：按 tmdbId|mediaType（精确身份键）
      var tmap = {}; var torder = [];
      aggs.forEach(function (a) {
        var tk = (a._tmdb && a._tmdb.id != null)
          ? (a._tmdb.id + '|' + a._tmdb.mediaType)
          : ('local:' + a._localKey);
        if (!tmap[tk]) { tmap[tk] = a; torder.push(tk); return; }
        var prev = tmap[tk];
        prev.cmsVars = (prev.cmsVars || []).concat(a.cmsVars || []);
        prev.kzVars = (prev.kzVars || []).concat(a.kzVars || []);
        prev.variants = (prev.variants || []).concat(a.variants || []);
        if (!prev.pic && a.pic) prev.pic = a.pic;
        if (!prev.playUrl && a.playUrl) prev.playUrl = a.playUrl;
        if (!prev.year && a.year) prev.year = a.year;
        if (!prev.typeName && a.typeName) prev.typeName = a.typeName;
        if (!prev.content && a.content) prev.content = a.content;
        if (prev.tmdbRating == null && a.tmdbRating != null) prev.tmdbRating = a.tmdbRating;
      });
      return torder.map(function (tk) {
        var a = tmap[tk];
        a.isKazumi = (a.variants || []).length > 0 &&
          a.variants.every(function (v) { return v && v.isKazumi; });
        delete a._localKey; // 清理内部字段
        return a;
      });
    });
  }

  function renderGrid(items, view) {
    bodyEl.innerHTML = '';
    if (!items || !items.length) {
      setNote(view && view.query ? '没有找到相关结果。' : '输入关键词开始搜索。');
      return;
    }
    var grid = el('div', 'sfv-grid');
    items.forEach(function (it) {
      var card = el('button', 'sfv-card');
      card.type = 'button';
      var cover = el('div', 'sfv-card-cover');
      if (it.pic) {
        var img = el('img', 'sfv-card-img');
        img.src = it.pic; img.alt = it.title || ''; img.loading = 'lazy';
        img.addEventListener('error', function () { img.style.display = 'none'; cover.classList.add('sfv-cover--broken'); });
        cover.appendChild(img);
      } else {
        cover.textContent = '🎬';
      }
      var name = el('div', 'sfv-card-name', it.title || '未命名');
      var sub = el('div', 'sfv-card-sub', (it.year ? it.year + ' · ' : '') + (it.variants && it.variants.length > 1 ? it.variants.length + ' 个来源' : '点击查看'));
      card.appendChild(cover); card.appendChild(name); card.appendChild(sub);
      if (it.isKazumi) card.classList.add('sfv-card--kazumi');
      card.addEventListener('click', function () {
        if (it.isKazumi) openKazumiDetail(it);
        else openDetail(it);
      });
      grid.appendChild(card);
      enrichTmdb(card, it);
    });
    bodyEl.appendChild(grid);
  }

  // ---------------------------------------------------------------- 详情 + 剧集
  function openDetail(item, meta) {
    ensureOverlayShown(); // T145：确保浏览层已创建并可见（首页直接点接着看场景）
    var firstVar = (item.variants && item.variants[0]) || null;
    if (!firstVar) { toast('该结果缺少来源信息。'); return; }
    var vodKey = firstVar.key || (firstVar.sourceId + ':' + firstVar.vodId);
    var src = sourceById(firstVar.sourceId);
    var vodId = firstVar.vodId;
    if (!src || vodId == null) { toast('片源不可用，可能已被移除。'); return; }
    recordMeta({ key: vodKey, title: item.title, pic: resolvePic(item), year: item.year, sourceId: src.id, vodId: vodId });
    var view = { mode: 'detail', key: vodKey, title: item.title, pic: resolvePic(item), year: item.year, source: src, vodId: vodId, meta: meta || null, _tmdb: item._tmdb || null };
    pushView(view);
    loadDetail(view);
  }

  // Kazumi 结果详情：直接走规则引擎的章节解析（无需 CMS 详情接口）
  function openKazumiDetail(item) {
    ensureOverlayShown(); // T145：确保浏览层已创建并可见
    var v = (item.variants && item.variants[0]) || null;
    if (!v || !v.src || !v.ruleName) { toast('该规则结果缺少详情链接。'); return; }
    var view = {
      mode: 'detail',
      key: item.key,
      title: item.title,
      pic: resolvePic(item),
      year: item.year,
      ruleName: v.ruleName,
      src: v.src,
      // 复用 playEpisode 的进度键拼装（view.source.id + ':' + view.vodId + ':' + ep.index）
      source: { id: 'kazumi:' + v.ruleName },
      vodId: item.key,
      _tmdb: item._tmdb || null,
      isKazumi: true
    };
    recordMeta({ key: item.key, title: item.title, pic: item.pic, year: item.year, sourceId: view.source.id, vodId: item.key });
    pushView(view);
    renderDetail(view);
  }

  // 从四类列表点击元数据进入详情（元数据可能不含完整 variants，需要重新请求）
  function openDetailFromMeta(meta) {
    var src = meta.sourceId ? sourceById(meta.sourceId) : null;
    // 本地/直链条目：直接打开（保留原行为，绕开米白详情）
    if (meta.key && meta.key.indexOf('url:') === 0) {
      if (SFV.source) SFV.source.open(meta.key.slice(4));
      else if (SFV.player) SFV.player.openUrl(meta.key.slice(4));
      return;
    }
    if (meta.key && meta.key.indexOf('file:') === 0) {
      toast('本地文件需重新选择');
      if (SFV.player) SFV.player.openFilePicker();
      return;
    }
    // === Phase 1.5 占位态（2026-08-05 撤回 v2）===
    // 详情页 v2（detail-v2.js，暗色全屏）已撤回。url/file 走播放器保留；
    // 其余入口（搜索结果 / 「接着看」续播 / 跨源修复回退）一律走 renderDetail
    // 的 toast 占位（不再渲染米白页，不再调 detailV2.build）。
    renderDetail(meta);
    return;
  }

  // —— 来源失效自动修复与标记 ——

  function repairKeyOf(meta) {
    return meta.key || ('__title__' + String(meta.title || ''));
  }

  // 从跨源搜索结果中挑选最佳候选：精确片名 > 同片名+同年份 > 模糊包含。
  // 仅保留「未尝试过」的源变体；若某候选全部变体都已尝试过则跳过，避免跨源死循环。
  function pickRepairCandidate(items, meta, tried) {
    var title = String(meta.title || '').trim().toLowerCase();
    var year = String(meta.year || '').trim();
    if (!title) return null;
    var yearMatch = null, exact = null, fuzzy = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.title) continue;
      // 仅保留未尝试过的来源变体
      var usable = (it.variants || []).filter(function (v) { return !(tried && tried[v.sourceId]); });
      if (!usable.length) continue;
      var t = it.title.trim().toLowerCase();
      if (t === title) {
        if (year && String(it.year || '').trim() === year) { if (!yearMatch) yearMatch = { it: it, usable: usable }; }
        else if (!exact) exact = { it: it, usable: usable };
      } else if (!fuzzy && (t.indexOf(title) >= 0 || title.indexOf(t) >= 0)) {
        fuzzy = { it: it, usable: usable };
      }
    }
    var best = yearMatch || exact || fuzzy;
    if (!best) return null;
    // 用未尝试的变体替换原 variants，保证 variants[0] 可用且不会再选中失效源
    best.it.variants = best.usable;
    return best.it;
  }

  // 按标题跨源搜索替代片源；命中则直接打开（并修复 meta 缓存），未命中则标记失效。
  // opts.excludeSourceId：当前已失败源，记入 tried 表，后续重试不再重复选中。
  function repairFromSearch(meta, opts) {
    opts = opts || {};
    var title = meta.title ? String(meta.title).trim() : '';
    if (!title) { renderExpiredPanel(meta, 'missing-title'); return; }
    var key = repairKeyOf(meta);
    var tried = repairTried[key] || (repairTried[key] = {});
    if (opts.excludeSourceId) tried[opts.excludeSourceId] = true;
    var enabled = SFV.sources.getEnabledSources();
    if (!enabled.length) { renderExpiredPanel(meta, 'no-enabled-source'); return; }
    renderLoading('正在尝试为你查找替代片源…');
    SFV.sources.search(title, { sources: enabled, pg: 1, timeout: 12000 }).then(function (res) {
      if (!isOpen()) return;
      if (res.noSource || !res.items || !res.items.length) {
        renderExpiredPanel(meta, 'search-empty'); return;
      }
      var cand = pickRepairCandidate(res.items, meta, tried);
      if (!cand) { renderExpiredPanel(meta, 'no-match'); return; }
      var variant = (cand.variants && cand.variants[0]) || null;
      if (!variant || variant.vodId == null) { renderExpiredPanel(meta, 'no-variant'); return; }
      tried[variant.sourceId] = true; // 记录本次选用，下次失败则跳过
      // 修复 meta 缓存（用原 key 绑定到新片源），下次直接命中
      toast('已为你找到替代片源：' + (cand.title || title));
      var repaired = {
        key: meta.key,
        title: cand.title,
        pic: cand.pic || meta.pic,
        year: cand.year || meta.year,
        vodId: variant.vodId,
        variants: [{ key: meta.key, sourceId: variant.sourceId, vodId: variant.vodId }],
      };
      openDetail(repaired, meta);
    }).catch(function () {
      if (!isOpen()) return;
      renderExpiredPanel(meta, 'search-error');
    });
  }

  function expiredReasonText(r) {
    var map = {
      'missing-title': '条目缺少标题，无法检索',
      'no-enabled-source': '未启用任何片源',
      'search-empty': '跨源检索无结果',
      'no-match': '跨源检索无匹配片名',
      'no-variant': '匹配条目缺少可播放剧集',
      'search-error': '跨源检索异常',
    };
    return map[r] || r || '未知';
  }

  // 标记「来源已失效」：保留原始信息 + 提供手动打开/重试，并记录失效日志
  function renderExpiredPanel(meta, reason) {
    if (!isOpen()) return;
    setNote('');
    titleEl.textContent = meta.title || '来源已失效';
    bodyEl.innerHTML = '';
    var panel = el('div', 'sfv-expired-panel');
    panel.appendChild(el('div', 'sfv-expired-title', '来源已失效'));
    var sub = el('div', 'sfv-expired-sub');
    sub.textContent = '该条目原有来源不可访问，已为你保留原始信息，可手动查看或重试查找。';
    panel.appendChild(sub);

    var info = el('div', 'sfv-expired-info');
    var rows = [
      ['标题', meta.title || '—'],
      ['原片源ID', meta.sourceId || '—'],
      ['原剧集ID', meta.vodId != null ? String(meta.vodId) : '—'],
      ['原始键', meta.key || '—'],
      ['失效原因', expiredReasonText(reason)],
    ];
    rows.forEach(function (r) {
      var row = el('div', 'sfv-expired-row');
      row.appendChild(el('span', 'sfv-expired-k', r[0]));
      row.appendChild(el('span', 'sfv-expired-v', r[1]));
      info.appendChild(row);
    });
    panel.appendChild(info);

    var actions = el('div', 'sfv-expired-actions');
    if (meta.key && meta.key.indexOf('url:') === 0) {
      var openBtn = el('button', 'sfv-expired-btn sfv-expired-btn--primary', '手动打开原始链接');
      openBtn.type = 'button';
      openBtn.addEventListener('click', function () {
        var u = meta.key.slice(4);
        if (SFV.source) SFV.source.open(u); else if (SFV.player) SFV.player.openUrl(u);
      });
      actions.appendChild(openBtn);
    }
    var retryBtn = el('button', 'sfv-expired-btn', '重试查找');
    retryBtn.type = 'button';
    retryBtn.addEventListener('click', function () { repairFromSearch(meta, {}); });
    actions.appendChild(retryBtn);
    panel.appendChild(actions);

    bodyEl.appendChild(panel);

    if (SFV.model && SFV.model.logFailure) {
      SFV.model.logFailure({
        title: meta.title || '',
        key: meta.key || '',
        sourceId: meta.sourceId || '',
        vodId: meta.vodId != null ? String(meta.vodId) : '',
        reason: reason,
        action: 'open',
      });
    }
  }

  function loadDetail(view) {
    // Phase 1.5 占位态：跳过数据拉取，直接进入 renderDetail（toast 拦截）
    renderDetail(view);
  }

  function renderDetail(view) {
    // 详情页（Plex 风）接回：统一经 SFV.detail.build 渲染，失败静默降级为占位 toast，
    // 避免黑屏/卡屏。2600ms 自动消失由 SFV.ui.toast 内置保证。
    setNote('');
    try {
      if (SFV.detail && typeof SFV.detail.build === 'function') {
        SFV.detail.build(bodyEl, view, { back: goBack });
      } else if (SFV.ui && typeof SFV.ui.toast === 'function') {
        SFV.ui.toast('详情页开发中，敬请期待');
      }
    } catch (detailErr) {
      // 兜底：任何同步异常都不要黑屏，回退占位 toast
      if (SFV.ui && typeof SFV.ui.toast === 'function') {
        SFV.ui.toast('详情页加载失败，敬请期待');
      }
    }
  }

  // ===== 片单浏览：打开 collections 页（router page）=====
  function openCollections() {
    goToNav('collections');
  }
  // 打开某片单的影片列表（collection-items 视图）
  function openCollectionItems(def) {
    pushView({ mode: 'collection-items', collId: def.id, collTitle: def.title, collDef: def });
    // 通知片单页：已进入二级视图（具体片单），供其 back() 消费返回
    if (SFV.pageCollections && typeof SFV.pageCollections.setItemsOpen === 'function') {
      SFV.pageCollections.setItemsOpen(true);
    }
  }

  // 退出具体片单后，重渲染片单列表（router page），复位页内二级视图状态。
  // 由 page-collections.js 的 back() 在消费返回时调用。
  function reopenCollections() {
    if (SFV.router) SFV.router.go('collections');
  }

  // 渲染 collection-items：复用现有网格 + 点击进详情
  function renderCollectionItems(v) {
    setBrowseChrome(true);
    overlay.classList.add('sfv-browse--category');
    titleEl.textContent = v.collTitle || '片单';
    bodyEl.innerHTML = '';
    if (!SFV.collections) { toast('片单模块未加载'); return; }

    var loader = el('div', 'sfv-loading');
    loader.textContent = '加载中…';
    bodyEl.appendChild(loader);

    SFV.collections.getItems(v.collDef).then(function (items) {
      if (!items || !items.length) {
        bodyEl.innerHTML = '';
        var ph = el('div', 'sfv-placeholder');
        ph.appendChild(el('div', 'sfv-placeholder-icon', '🎬'));
        ph.appendChild(el('div', 'sfv-placeholder-title', '暂无影片'));
        ph.appendChild(el('div', 'sfv-placeholder-sub', '该合集暂无可用内容'));
        bodyEl.appendChild(ph);
        return;
      }
      bodyEl.innerHTML = '';
      setNote(items.length + ' 部影片');
      var grid = el('div', 'sfv-grid');
      items.forEach(function (it) {
        var card = el('button', 'sfv-card');
        card.type = 'button';
        var cover = el('div', 'sfv-card-cover');
        if (it.poster) {
          var img = el('img', 'sfv-card-img'); img.src = it.poster; img.alt = it.title || ''; img.loading = 'lazy';
          img.addEventListener('error', function () { img.style.display = 'none'; cover.classList.add('sfv-cover--broken'); });
          cover.appendChild(img);
        } else cover.textContent = '🎬';
        var name = el('div', 'sfv-card-name', it.title || '未命名');
        var sub = el('div', 'sfv-card-sub', it.year || '');
        card.appendChild(cover); card.appendChild(name); card.appendChild(sub);
        card.addEventListener('click', function () { openDetailFromMeta(it); });
        grid.appendChild(card);
        enrichTmdb(card, it);
      });
      bodyEl.appendChild(grid);
    }).catch(function (err) {
      bodyEl.innerHTML = '';
      toast('加载失败：' + (err && err.message ? err.message : err));
    });
  }

  // 加入我的片单：选择片单夹弹窗
  function showPickFolderDialog(view) {
    if (!SFV.collections) return;
    var doc = d();
    var mask = el('div', 'sfv-pick-dialog-mask');
    var dialog = el('div', 'sfv-pick-dialog');
    dialog.appendChild(el('h3', null, '加入我的片单'));
    var folders = SFV.collections.listUserFolders();

    if (!folders.length) {
      dialog.appendChild(el('div', 'sfv-pick-item-count', '还没有片单夹，先新建一个吧'));
    }
    folders.forEach(function (f) {
      var item = el('div', 'sfv-pick-item');
      item.appendChild(el('div', 'sfv-pick-item-name', f.name));
      item.appendChild(el('div', 'sfv-pick-item-count', (f.items ? f.items.length : 0) + ' 部'));
      item.addEventListener('click', function () {
        SFV.collections.addUserItem(f.id, {
          id: view.id || view.key, mediaType: view.mediaType || 'movie',
          title: view.title, year: view.year, poster: view.pic || view.poster,
          rating: view.rating || 0, overview: view.overview || ''
        });
        closePick();
        toast('已加入「' + f.name + '」');
      });
      dialog.appendChild(item);
    });

    // 新建片单夹入口
    var addNew = el('div', 'sfv-pick-item add-new', '＋ 新建片单夹');
    addNew.addEventListener('click', function () {
      closePick();
      if (SFV.pageCollections && SFV.pageCollections.showFolderDialog) {
        SFV.pageCollections.showFolderDialog(null);
        // 新建后自动加入（延时等待 folder 创建）
        global.setTimeout(function () {
          var fs = SFV.collections.listUserFolders();
          if (fs.length) {
            var last = fs[fs.length - 1];
            SFV.collections.addUserItem(last.id, {
              id: view.id || view.key, mediaType: view.mediaType || 'movie',
              title: view.title, year: view.year, poster: view.pic || view.poster,
              rating: view.rating || 0, overview: view.overview || ''
            });
            toast('已新建并加入「' + last.name + '」');
          }
        }, 350);
      }
    });
    dialog.appendChild(addNew);

    var closePick = function () { if (mask.parentNode) mask.parentNode.removeChild(mask); };
    mask.addEventListener('click', function (ev) { if (ev.target === mask) closePick(); });
    mask.appendChild(dialog);
    (doc.body || doc.documentElement).appendChild(mask);
  }

  function paintTrackStatus(btn, key, status) {
    if (!SFV.model) return;
    var cur = SFV.model.getTrackStatus(key);
    btn.classList.toggle('on', cur === status);
  }

  function repaintTrackStatus(opts, key) {
    if (!opts || !opts.querySelectorAll) return;
    var btns = opts.querySelectorAll('.sfv-track-status-opt');
    for (var i = 0; i < btns.length; i++) {
      paintTrackStatus(btns[i], key, btns[i].getAttribute('data-status'));
    }
  }

  /**
   * 在同线路剧集列表中定位当前集，并把「下一集」注册给播放器（③ 自动连播）。
   * 必须在 SFV.source.open / SFV.player.openUrl 之后调用：那些入口会主动清空
   * playNext 钩子，先注册会被清掉。
   * 边界：无 play/空列表/找不到当前集/已是最后一集 → 注销钩子（播完即停）。
   */
  function registerNextEpisode(view, ep, play) {
    if (!SFV.player || typeof SFV.player.setPlayNext !== 'function') return;
    var list = (play && play.episodes) ? play.episodes : null;
    if (!list || !list.length) { SFV.player.setPlayNext(null); return; }
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (list[k] === ep || (list[k] && ep && list[k].index === ep.index)) { i = k; break; }
    }
    if (i < 0 || i >= list.length - 1) { SFV.player.setPlayNext(null); return; } // 末集/未找到
    var nextEp = list[i + 1];
    if (!nextEp || !nextEp.url) { SFV.player.setPlayNext(null); return; }        // 下一集无地址
    SFV.player.setPlayNext(function () {
      toast('自动播放：' + (nextEp.name || ('第' + (nextEp.index + 1) + '集')));
      playEpisode(view, nextEp, play);
    });
  }

  function playEpisode(view, ep, play) {
    if (!ep || !ep.url) { toast('该集无播放地址'); return; }
    var id = view.source.id + ':' + view.vodId + ':' + ep.index;
    var title = (view.title || '影片') + ' · ' + (ep.name || ('第' + (ep.index + 1) + '集'));
    recordMeta({ key: view.key, title: view.title, pic: resolvePic(view), year: view.year, sourceId: view.source.id, vodId: view.vodId });
    recordHistory({ key: id, title: title, pic: resolvePic(view), year: view.year, sourceId: view.source.id, vodId: view.vodId });

    // ---- Kazumi 播放页解析（chapterResult 提取的是 HTML 页面 URL，需先提取真实视频地址）----
    var doPlay = function (playUrl) {
      // 经 source-adapter：跨域直链自动走 /api/proxy；进度键锚定 站点:vod:集数
      var sourceName = (view.source && view.source.name) ? view.source.name : ((view.source && view.source.id) ? view.source.id : '');
      var coverUrl = resolvePic(view);
      var meta = { url: playUrl, title: title, id: id };
      if (SFV.source) SFV.source.open(meta);
      else if (SFV.player) SFV.player.openUrl(playUrl, meta);
      // 封面/站点名晚到：open 已同步 setCurrentMeta，这里合并（emit sfv:player-meta → 底部控制器刷新）
      if (SFV.player && SFV.player.setMeta) SFV.player.setMeta({ key: id, cover: coverUrl, subtitle: sourceName });
      // 剧集导航：供底部控制器 prev/next 键使用（无剧集则清空）
      if (SFV.player && SFV.player.setPlaylist) {
        if (play && play.episodes) {
          SFV.player.setPlaylist(play.episodes, ep.index);
          if (SFV.player.setPlayEpisodeAt) SFV.player.setPlayEpisodeAt(function (i, e) { playEpisode(view, e, play); });
        } else {
          SFV.player.setPlaylist(null, -1);
          if (SFV.player.setPlayEpisodeAt) SFV.player.setPlayEpisodeAt(null);
        }
      }
      registerNextEpisode(view, ep, play); // 必须在 open 之后：open 会清空 playNext 钩子
      // 关闭浏览层，露出播放器全屏弹层
      close();
    };

    // 嵌入第三方解析器页面播放：解析器自渲染播放器、客户端解密真实流地址，
    // 我们无需（也无法）提取直链，直接把整个解析器页嵌入播放器 iframe 即可。
    var openEmbed = function (embedUrl, embedTitle, embedId) {
      var sourceName = (view.source && view.source.name) ? view.source.name : ((view.source && view.source.id) ? view.source.id : '');
      if (SFV.player && typeof SFV.player.openEmbed === 'function') {
        SFV.player.openEmbed(embedUrl, { id: embedId, title: embedTitle, cover: resolvePic(view), subtitle: sourceName });
        close(); // 关闭浏览层，露出带 iframe 的播放器弹层
      } else {
        // 无嵌入能力时降级为原始地址直连
        doPlay(embedUrl);
      }
    };

    // 判断是否为 Kazumi 来源（view.source.id 以 'kazumi:' 开头 或 view 含 ruleName 标记）
    var isKazumi = view && (
      (view.source && view.source.id && String(view.source.id).indexOf('kazumi:') === 0) ||
      view.isKazumi || view.ruleName
    );

    if (isKazumi && SFV.kazumi && typeof SFV.kazumi.resolvePlayUrl === 'function') {
      toast('正在解析播放地址…');
      SFV.kazumi.resolvePlayUrl(ep.url, view.ruleName || '').then(function (resolved) {
        if (resolved && resolved.url) {
          if (resolved.embed) {
            // 第三方解析器页面：无法提取直链，整体嵌入 iframe 交由它自渲染播放器
            openEmbed(resolved.url, title, id);
          } else {
            doPlay(resolved.url);
          }
        } else {
          // 解析失败：降级直接用原始 URL（可能是直链或 iframe 类型）
          console.warn('[Kazumi] 播放页解析未命中，降级使用原始 URL:', ep.url);
          toast('播放页解析未命中，尝试原始地址');
          doPlay(ep.url);
        }
      }).catch(function (e) {
        console.warn('[Kazumi] 播放页解析异常:', e.message);
        toast('解析异常，尝试原始地址');
        doPlay(ep.url);
      });
    } else {
      // CMS10 / 非 Kazumi：直接播放
      doPlay(ep.url);
    }
  }

  // ---------------------------------------------------------------- 四类列表
  function renderCategory(v) {
    // 追片：5 状态互斥分区页（与 Kazumi 一致），独立渲染，不经过下方占位/通用网格分支。
    if (v.field === 'track') { renderTrackPage(); return; }
    // 心动 / 片单 / 历史 暂为「板块建设中」占位（居中、无搜索栏/操作按钮）。
    // 注意：此处是 legacy 分类视图（非五个导航独立页面），保持既有占位行为。
    if (v.field === 'liked' || v.field === 'inList' || v.field === 'history') {
      var cmeta = CATEGORY_META[v.field] || CATEGORY_META.history;
      titleEl.textContent = cmeta.label;
      bodyEl.innerHTML = '';
      var cwrap = el('div', 'sfv-placeholder');
      cwrap.appendChild(el('div', 'sfv-placeholder-icon', '📂'));
      cwrap.appendChild(el('div', 'sfv-placeholder-title', cmeta.label + '板块建设中'));
      cwrap.appendChild(el('div', 'sfv-placeholder-sub', '该板块正在打磨，敬请期待。'));
      bodyEl.appendChild(cwrap);
      return;
    }
    var meta = CATEGORY_META[v.field] || CATEGORY_META.history;
    titleEl.textContent = meta.label;
    var list;
    if (v.field === 'history') {
      list = (SFV.model ? SFV.model.getHistory() : []).slice(0, 100);
    } else {
      var keys = SFV.model ? SFV.model.getKeysByFlag(meta.field) : [];
      list = SFV.model ? SFV.model.resolveList(keys) : [];
    }
    bodyEl.innerHTML = '';
    if (!list.length) { setNote(meta.empty); return; }
    setNote('');
    var grid = el('div', 'sfv-grid');
    list.forEach(function (it) {
      var card = el('button', 'sfv-card');
      card.type = 'button';
      var cover = el('div', 'sfv-card-cover');
      if (it.pic) {
        var img = el('img', 'sfv-card-img');         img.src = it.pic; img.alt = it.title || ''; img.loading = 'lazy';
        img.addEventListener('error', function () { img.style.display = 'none'; cover.classList.add('sfv-cover--broken'); });
        cover.appendChild(img);
      } else cover.textContent = '🎬';
      var name = el('div', 'sfv-card-name', it.title || '未命名');
      var sub = el('div', 'sfv-card-sub', v.field === 'history' ? fmtAgo(it.ts) : (it.year || ''));
      card.appendChild(cover); card.appendChild(name); card.appendChild(sub);
      card.addEventListener('click', function () { openDetailFromMeta(it); });
      grid.appendChild(card);
      enrichTmdb(card, it); // 首页四卡也走 TMDB 统一海报
    });
    bodyEl.appendChild(grid);
  }

  // 追片页：5 状态互斥分区（与 Kazumi 一致，none=未收藏）
  var trackActiveStatus = 'watching'; // 当前激活分区

  function trackLabel(s) {
    for (var i = 0; i < TRACK_META.length; i++) if (TRACK_META[i].status === s) return TRACK_META[i].label;
    return '';
  }

  function positionTrackIndicator(indicator, status) {
    if (!indicator) return;
    var tabs = indicator.parentElement;
    if (!tabs) return;
    var tab = tabs.querySelector('.sfv-track-tab[data-status="' + status + '"]') || tabs.querySelector('.sfv-track-tab--active');
    var label = tab && tab.querySelector('.sfv-track-label');
    if (!label) { indicator.style.display = 'none'; return; }
    indicator.style.display = '';
    var tRect = tabs.getBoundingClientRect();
    var lRect = label.getBoundingClientRect();
    indicator.style.left = (lRect.left - tRect.left) + 'px';
    indicator.style.width = lRect.width + 'px';
  }

  function renderTrackPage() {
    titleEl.textContent = '追片';
    bodyEl.innerHTML = '';
    setNote('');
    var renderId = Date.now();
    bodyEl._sfvTrackRenderId = renderId;

    // 顶部 tab 栏：5 状态 + 各分区计数
    var tabs = el('div', 'sfv-track-tabs');
    TRACK_META.forEach(function (t) {
      var n = SFV.model ? SFV.model.getKeysByTrack(t.status).length : 0;
      var tab = el('button', 'sfv-track-tab');
      tab.type = 'button';
      tab.setAttribute('data-status', t.status);
      var label = el('span', 'sfv-track-label', t.label);
      tab.appendChild(label);
      if (t.status === trackActiveStatus) tab.classList.add('sfv-track-tab--active');
      if (n) tab.appendChild(el('span', 'sfv-track-count', String(n)));
      tab.addEventListener('click', function () {
        if (t.status === trackActiveStatus) return;
        var oldTabs = bodyEl.querySelector('.sfv-track-tabs');
        var srcLabel = oldTabs && oldTabs.querySelector('.sfv-track-tab--active .sfv-track-label');
        var srcRect = srcLabel ? srcLabel.getBoundingClientRect() : null;
        var oldTabsRect = oldTabs ? oldTabs.getBoundingClientRect() : null;
        trackActiveStatus = t.status;
        renderTrackPage();
        var newTabs = bodyEl.querySelector('.sfv-track-tabs');
        var indicator = newTabs && newTabs.querySelector('.sfv-track-indicator');
        var destLabel = newTabs && newTabs.querySelector('.sfv-track-tab[data-status="' + t.status + '"] .sfv-track-label');
        if (srcRect && oldTabsRect && indicator && destLabel) {
          var destRect = destLabel.getBoundingClientRect();
          var newTabsRect = newTabs.getBoundingClientRect();
          var sL = srcRect.left - oldTabsRect.left;
          var sW = srcRect.width;
          var dL = destRect.left - newTabsRect.left;
          var dW = destRect.width;
          var sC = sL + sW / 2;
          var dC = dL + dW / 2;
          var midC = (sC + dC) / 2;
          var dist = Math.abs(dC - sC);
          indicator.style.left = sL + 'px';
          indicator.style.width = sW + 'px';
          indicator.style.transition = 'none';
          indicator.getBoundingClientRect();
          indicator.animate([
            { left: sL + 'px', width: sW + 'px', easing: 'cubic-bezier(.25,.1,.25,1)' },
            { left: (midC - dist / 2) + 'px', width: dist + 'px', easing: 'cubic-bezier(.25,.1,.25,1)' },
            { left: dL + 'px', width: dW + 'px' }
          ], { duration: 300, fill: 'forwards' });
        } else if (indicator) {
          positionTrackIndicator(indicator, t.status);
        }
      });
      tabs.appendChild(tab);
    });
    bodyEl.appendChild(tabs);
    var indicator = el('div', 'sfv-track-indicator');
    tabs.appendChild(indicator);
    positionTrackIndicator(indicator, trackActiveStatus);

    // 当前分区网格
    var keys = SFV.model ? SFV.model.getKeysByTrack(trackActiveStatus) : [];
    var list = SFV.model ? SFV.model.resolveList(keys) : [];

    // 兼容修复：TMDB 分页（电影/动漫）早期只写 track 状态未写 meta，导致 key 存在但 resolveList 为空。
    // 对缺失的 tmdb:* key 用详情接口补全元数据，让既有标记也能显示海报。
    var present = {};
    list.forEach(function (it) { if (it && it.key) present[it.key] = true; });
    var missing = keys.filter(function (k) {
      return !present[k] && /^tmdb:/.test(k) && !trackMetaInflight[k];
    });
    var canFetch = !!(SFV.tmdb && SFV.tmdb.getDetails);

    if (!list.length && (!missing.length || !canFetch)) {
      // 空分区保持简洁干净，不显示任何文字与图案提示
      return;
    }

    var grid = el('div', 'sfv-grid');
    bodyEl.appendChild(grid);

    function appendTrackCard(it) {
      var card = el('button', 'sfv-card');
      card.type = 'button';
      var cover = el('div', 'sfv-card-cover');
      if (it.pic) {
        var img = el('img', 'sfv-card-img'); img.src = it.pic; img.alt = it.title || ''; img.loading = 'lazy';
        img.addEventListener('load', function () { img.classList.add('loaded'); });
        img.addEventListener('error', function () {
          // 远程海报加载失败：尝试本地缓存；命中则替换 src 重载，未命中再显示裂图占位。
          if (it.key && it.pic && it.pic.indexOf('data:') !== 0 && SFV.posterCache && typeof SFV.posterCache.cache === 'function') {
            SFV.posterCache.cache(it.key, it.pic).then(function (dataUrl) {
              if (dataUrl && img.parentNode) {
                img.src = dataUrl;
                img.style.display = '';
                cover.classList.remove('sfv-cover--broken');
              } else {
                img.style.display = 'none';
                cover.classList.add('sfv-cover--broken');
              }
            });
          } else {
            img.style.display = 'none';
            cover.classList.add('sfv-cover--broken');
          }
        });
        cover.appendChild(img);
      } else cover.textContent = '🎬';
      var name = el('div', 'sfv-card-name', it.title || '未命名');
      var sub = el('div', 'sfv-card-sub', it.year || '');
      card.appendChild(cover); card.appendChild(name); card.appendChild(sub);

      // 状态切换按钮（Kazumi 列表内改状态）：点击弹出 5 状态小菜单，叠在海报右下角
      var fav = el('button', 'sfv-card-fav');
      fav.type = 'button';
      fav.setAttribute('data-key', it.key);
      paintTrackCardBtn(fav, it.key);
      fav.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openTrackMenu(fav, it.key);
      });
      cover.appendChild(fav);

      card.addEventListener('click', function () { openDetailFromMeta(it); });
      grid.appendChild(card);
      // 追片页 meta 已携带 TMDB 海报 + 本地缓存机制，无需 enrichTmdb 二次替换，
      // 避免二次请求远程 URL 导致刚显示又消失。
    }

    list.forEach(appendTrackCard);

    if (missing.length && canFetch) {
      var status = el('div', 'sfv-browse-status', '补全 ' + missing.length + ' 条元数据…');
      bodyEl.appendChild(status);
      var pending = missing.length;
      function tryRemoveStatus() {
        pending--;
        if (pending <= 0 && status.parentNode) status.parentNode.removeChild(status);
      }
      missing.forEach(function (k) {
        var parts = k.split(':');
        var mediaType = parts[1] === 'anime' ? 'tv' : (parts[1] || 'movie');
        var id = parts[2];
        if (!id) { tryRemoveStatus(); return; }
        trackMetaInflight[k] = true;
        SFV.tmdb.getDetails(id, mediaType).then(function (d) {
          delete trackMetaInflight[k];
          if (!d || bodyEl._sfvTrackRenderId !== renderId) { tryRemoveStatus(); return; }
          SFV.model.setMeta({ key: k, title: d.title, pic: d.poster, year: d.year, sourceId: '', vodId: '' });
          appendTrackCard({ key: k, title: d.title, pic: d.poster, year: d.year, sourceId: '', vodId: '' });
          tryRemoveStatus();
        }).catch(function () {
          delete trackMetaInflight[k];
          tryRemoveStatus();
        });
      });
    }
  }

  function paintTrackCardBtn(btn, key) {
    var s = SFV.model ? SFV.model.getTrackStatus(key) : null;
    btn.classList.toggle('on', !!s);
    btn.textContent = s ? (trackLabel(s) || '●') : '＋';
    btn.setAttribute('data-status', s || '');
  }

  // 卡片状态小菜单（与 Kazumi 一致：在列表内直接改状态）
  function openTrackMenu(anchor, key) {
    closeTrackMenu();
    var menu = el('div', 'sfv-track-menu');
    menu.setAttribute('data-menu-for', key);
    TRACK_META.forEach(function (t) {
      var opt = el('button', 'sfv-track-menu-opt', t.label);
      opt.type = 'button';
      opt.setAttribute('data-status', t.status);
      var cur = SFV.model ? SFV.model.getTrackStatus(key) : null;
      if (cur === t.status) opt.classList.add('on');
      opt.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (SFV.model) SFV.model.setTrackStatus(key, t.status);
        closeTrackMenu();
        renderTrackPage();
      });
      menu.appendChild(opt);
    });
    var clear = el('button', 'sfv-track-menu-opt sfv-track-menu-clear', '清除');
    clear.type = 'button';
    clear.setAttribute('data-status', 'none');
    clear.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (SFV.model) SFV.model.clearTrack(key);
      closeTrackMenu();
      renderTrackPage();
    });
    menu.appendChild(clear);
    anchor.appendChild(menu);
    menu.classList.add('show');
    setTimeout(function () {
      var docHandler = function (e) {
        if (menu && menu.parentNode && !menu.contains(e.target) && e.target !== anchor) closeTrackMenu();
      };
      if (global.addEventListener) global.addEventListener('click', docHandler, true);
      menu._docHandler = docHandler;
    }, 0);
  }

  function closeTrackMenu() {
    var existing = bodyEl ? bodyEl.querySelector('.sfv-track-menu') : null;
    if (existing) {
      if (existing._docHandler && global.removeEventListener) global.removeEventListener('click', existing._docHandler, true);
      if (existing.parentNode) existing.parentNode.removeChild(existing);
    }
  }

  function fmtAgo(ts) {
    if (!ts) return '';
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }

  // ---------------------------------------------------------------- 记录
  function recordMeta(rec) { if (SFV.model && SFV.model.setMeta) SFV.model.setMeta(rec); }
  function recordHistory(rec) { if (SFV.model && SFV.model.addHistory) SFV.model.addHistory(rec); }

  // ---------------------------------------------------------------- 入口动作
  function openLocal() { if (SFV.player) SFV.player.openFilePicker(); }
  function openUrlPrompt() {
    if (overlay.urlBar && overlay.urlBar.parentNode) {
      overlay.urlBar.parentNode.removeChild(overlay.urlBar);
      overlay.urlBar = null;
      return;
    }
    var bar = el('div', 'sfv-urlbar sfv-browse-urlbar');
    var input = el('input', 'sfv-urlbar-input');
    input.type = 'text';
    input.placeholder = '粘贴视频直链（mp4 / m3u8 …），回车打开';
    var ok = el('button', 'sfv-urlbar-btn', '打开');
    var cancel = el('button', 'sfv-urlbar-btn', '取消');
    var submit = function () {
      var v = (input.value || '').trim();
      if (!v) return;
      var r = SFV.source ? SFV.source.resolve(v) : null;
      if (r && !r.ok) { toast('无法识别的地址：' + r.reason); return; }
      if (r && r.kind === 'hls' && r.requiresHlsLib) toast('该环境不原生支持 HLS，可能无法播放');
      if (SFV.source) SFV.source.open(v);
      closeUrlBar();
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', closeUrlBar);
    input.addEventListener('keydown', function (ev) {
      if (ev && (ev.key === 'Enter' || ev.keyCode === 13)) submit();
      if (ev && (ev.key === 'Escape' || ev.keyCode === 27)) closeUrlBar();
    });
    bar.appendChild(input); bar.appendChild(ok); bar.appendChild(cancel);
    overlay.appendChild(bar);
    overlay.urlBar = bar;
    if (input.focus) { try { input.focus(); } catch (e) {} }
    function closeUrlBar() { if (bar.parentNode) bar.parentNode.removeChild(bar); overlay.urlBar = null; }
  }
  function openSources() {
    // 视觉控制台「片源」分页（fx-sources.js 已包装 setFxPanelTab 拦截 'sfvsource'）
    var opened = false;
    if (typeof global.toggleFxPanel === 'function') {
      try { global.toggleFxPanel(true); opened = true; } catch (e) {}
    }
    if (typeof global.setFxPanelTab === 'function') {
      try { global.setFxPanelTab('sfvsource'); opened = true; } catch (e) {}
    }
    if (!opened) toast('未找到「视觉控制台 · 片源」入口，请在设置中添加 CMS10 片源。');
  }

  // ---------------------------------------------------------------- 规则管理面板（Kazumi）
  function openRules() {
    ensure();
    pushView({ mode: 'rules' });
  }

  function renderRules(v) {
    titleEl.textContent = '规则管理 · Kazumi';
    bodyEl.innerHTML = '';
    setNote('');
    if (!SFV.kazumi) {
      bodyEl.appendChild(el('div', 'sfv-browse-sub', 'Kazumi 引擎未就绪（video/kazumi/*.js 未引入）。'));
      return;
    }

    // ---- 导入区 ----
    var box = el('div', 'sfv-rules-import');
    box.appendChild(el('div', 'sfv-rules-import-title', '导入规则（粘贴 Kazumi 规则 JSON，支持单条或数组）'));
    var ta = el('textarea', 'sfv-rules-textarea');
    ta.placeholder = '{\n  "name": "示例",\n  "baseURL": "https://example.com",\n  "searchURL": "/search?wd=@keyword",\n  "searchList": "//div[@class=\'item\']",\n  "searchName": ".//a/text()",\n  "searchResult": ".//a",\n  "chapterRoads": "//div[@class=\'list\']",\n  "chapterResult": ".//a"\n}';
    box.appendChild(ta);
    var row = el('div', 'sfv-rules-import-row');
    var bImport = el('button', 'sfv-rules-btn', '导入');
    bImport.type = 'button';
    bImport.addEventListener('click', function () {
      var txt = (ta.value || '').trim();
      if (!txt) { toast('请先粘贴规则 JSON'); return; }
      try {
        var added = SFV.kazumi.importRule(txt);
        toast('已导入 ' + (added && added.length ? added.length : 0) + ' 条规则');
        renderRules(v);
      } catch (e) {
        toast('导入失败：' + (e && e.message ? e.message : '格式错误'));
      }
    });
    var bFile = el('button', 'sfv-rules-btn', '从文件导入');
    bFile.type = 'button';
    var fileInput = el('input', 'sfv-rules-file');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    bFile.addEventListener('click', function () { try { fileInput.click(); } catch (e) {} });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var added = SFV.kazumi.importRule(String(reader.result));
          toast('已导入 ' + (added && added.length ? added.length : 0) + ' 条');
          renderRules(v);
        } catch (e) { toast('导入失败：' + (e && e.message ? e.message : '格式错误')); }
      };
      reader.readAsText(f);
    });
    row.appendChild(bImport); row.appendChild(bFile); row.appendChild(fileInput);
    box.appendChild(row);
    bodyEl.appendChild(box);

    // ---- 列表 ----
    var rules = SFV.kazumi.listRules();
    if (!rules.length) {
      bodyEl.appendChild(el('div', 'sfv-browse-sub', '尚未导入任何规则。导入后，搜索会并行查询这些站点（与 CMS10 片源互补）。'));
      return;
    }
    var list = el('div', 'sfv-rules-list');
    rules.forEach(function (r) {
      var item = el('div', 'sfv-rules-item');
      var info = el('div', 'sfv-rules-item-info');
      info.appendChild(el('div', 'sfv-rules-item-name', r.name));
      info.appendChild(el('div', 'sfv-rules-item-meta', r.searchMode + ' · ' + (r.baseUrl || '') + (r.valid ? '' : ' · 不完整')));
      item.appendChild(info);
      var acts = el('div', 'sfv-rules-item-acts');
      var bToggle = el('button', 'sfv-rules-btn' + (r.enabled ? ' on' : ''), r.enabled ? '已启用' : '已禁用');
      bToggle.type = 'button';
      bToggle.addEventListener('click', function () {
        SFV.kazumi.setEnabled(r.name, !r.enabled);
        renderRules(v);
      });
      var bDel = el('button', 'sfv-rules-btn sfv-rules-btn--danger', '删除');
      bDel.type = 'button';
      bDel.addEventListener('click', function () {
        SFV.kazumi.removeRule(r.name);
        renderRules(v);
      });
      acts.appendChild(bToggle); acts.appendChild(bDel);
      item.appendChild(acts);
      list.appendChild(item);
    });
    bodyEl.appendChild(list);
  }

  // 暴露给页面模块（page-*.js）复用的共享辅助，避免页面模块直接依赖 online.js 内部 IIFE 作用域。
  // 页面模块仅通过这些接口与外壳交互，保持模块独立性。
  SFV.ui = {
    el: el,
    toast: toast,
    setNote: setNote,
    CATEGORY_META: CATEGORY_META,
    setBrowseChrome: setBrowseChrome,
    setTitle: function (t) { if (titleEl) titleEl.textContent = t; }
  };

  SFV.online = {
    open: open,
    close: close,
    isOpen: isOpen,
    goHome: goHome,           // 首页导航：关闭覆盖层并刷新影视首页
    openCategory: openCategory,
    openSearchPage: openSearchPage, // 全页搜索开关（供搜索页胶囊按钮 / 测试驱动）
    doInlineSearch: doInlineSearch, // 全页搜索执行（取代旧 doSearch，供搜索页 / 测试驱动）
    // [清理] openSearch 导出已移除
    openRules: openRules,
    openLocal: openLocal,
    openUrlPrompt: openUrlPrompt,
    openSources: openSources,
    openBrowse: openCategory, // 3D 歌单架调用别名
    playEpisode: playEpisode, // 供连播/续播复用与测试
    openDetailFromMeta: openDetailFromMeta, // 接着看卡片续播入口（home.js resumeFromMeta 调用）
    applyGridDiyToBody: applyGridDiyToBody, // 供 grid-diy.js 实时刷新浏览网格
    openCollections: openCollections,   // Step 5：片单浏览页入口
    reopenCollections: reopenCollections, // 退出具体片单：重渲染片单列表（协同 page-collections.back）
    openCollectionItems: openCollectionItems, // Step 5：片单影片列表
    tryPicBackfill: tryPicBackfill, // T147：home.js 接着看空 pic 后向补图
    showPickFolderDialog: showPickFolderDialog, // 「加片单」入口（详情页占位态下未直接调用）
    renderDetail: renderDetail, // 所有进详情路径的单一汇聚点（Phase 1.5 toast 占位）
  };

  // ---------------------------------------------------------------- T102修复：初始化时立即绑定（不依赖 ensure()）
  // 导航栏由 SFV.nav 共享组件（nav.js）在 DOMContentLoaded 创建并挂载到 #search-box；
  // 此处仅把 click 委托绑定到该组件（SFV.nav.bindClick(onNavItemClick)）。
  // 其余 bindCapsuleSearchBtn 等只查询 index.html 静态 DOM 元素，不依赖 overlay 构建。
  // 若延迟到 ensure() 首次执行才绑定，用户首次点击时事件监听器尚未注册 → 点击无反应（鸡生蛋）。
  var _navBound = false;
  function initEarlyBindings() {
    if (_navBound) return;
    _navBound = true;
    console.log('[SFV-DIAG] initEarlyBindings() called, doc=' + !!doc + ', d()=' + typeof d);
    try { if (SFV.nav && typeof SFV.nav.bindClick === 'function') { SFV.nav.bindClick(onNavItemClick); console.log('[SFV-DIAG] SFV.nav.bindClick() OK'); } else { console.warn('[SFV-DIAG] SFV.nav 未就绪，导航 click 未绑定'); } } catch (e) { console.error('[SFV-Online] SFV.nav.bindClick 失败:', e); }
    try { bindCapsuleSearchBtn(); console.log('[SFV-DIAG] bindCapsuleSearchBtn() OK'); } catch (e) { console.error('[SFV-Online] bindCapsuleSearchBtn 失败:', e); }
    try { bindVideoPageBgFromTint(); console.log('[SFV-DIAG] bindVideoPageBgFromTint() OK'); } catch (e) { console.error('[SFV-Online] bindVideoPageBgFromTint 失败:', e); }
  }
  // DOM 就绪后立即绑定；若已就绪则同步执行
  if (d && d.readyState === 'loading' && d.addEventListener) {
    d.addEventListener('DOMContentLoaded', initEarlyBindings);
  } else {
    // DOMContentLoaded 已过或环境不支持（如 vm 沙箱）→ 立即执行
    initEarlyBindings();
  }

  // ---------------------------------------------------------------- 动态加载 grid-diy.js（满足 index.html 零改动铁律）
  // 网格外观 DIY 面板挂载于 fx 控制台 lyrics tab，由 grid-diy.js 自行轮询注入。
  (function loadGridDiy() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('sfv-grid-diy-script')) return;
    var s = document.createElement('script');
    s.id = 'sfv-grid-diy-script';
    s.src = 'video/grid-diy.js';
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
  })();
})(typeof window !== 'undefined' ? window : this);
