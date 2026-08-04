/*
 * Stellaflix 影视模块 — 电影页面 (T134)
 *
 * 独立的影视分页，集成三层筛选器组件（MovieFilter）：
 *   L1 分类 tab（电影 / 纪录片）
 *   L2 排序胶囊 + 筛选按钮
 *   L3 年份 / 类型 / 地区 多选面板
 *
 * 数据源：有筛选条件时用 tmdb.discover(params)，无筛选时回退 tmdb.popular('movie')。
 * 纪录片 tab 用 tmdb.discover({ with_genres: '99' })。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  // 防止重复注册
  if (SFV.router && SFV.router.listIds && SFV.router.listIds().indexOf('movie') !== -1) return;

  var detailOpen = false;
  var showGridFn = null;
  var filterApi = null;       // MovieFilter 实例引用
  var currentMediaBase = 'movie'; // 'movie' | 'documentary' — 决定 TMDB 查询基础类型
  var cardIdx = 0;

  /* ---- 卡片构建（与 page-media-grid.js 工厂一致）---- */
  function buildCard(ui, it) {
    cardIdx++;
    var card = ui.el('button', 'sfv-card');
    card.type = 'button';
    var cover = ui.el('div', 'sfv-card-cover');
    if (it.poster) {
      var img = ui.el('img', 'sfv-card-img');
      img.src = it.poster; img.alt = it.title || '';
      if (cardIdx > 12) img.loading = 'lazy';
      img.addEventListener('load', function () { img.classList.add('loaded'); });
      img.addEventListener('error', function () {
        img.style.display = 'none';
        cover.classList.add('sfv-cover--broken');
      });
      cover.appendChild(img);
    } else {
      cover.textContent = '\uD83C\uDFA5';
    }
    if (it.rating) {
      cover.appendChild(ui.el('div', 'sfv-card-rating', '\u2605 ' + it.rating.toFixed(1)));
    }
    card.appendChild(cover);
    card.appendChild(ui.el('div', 'sfv-card-name', it.title || '\u672A\u547D\u540D'));
    card.appendChild(ui.el('div', 'sfv-card-sub', it.year || ''));
    card.addEventListener('click', function () { showDetail(it); });
    return card;
  }

  /* ---- 网格渲染 + 无限滚动（支持 discover 参数动态切换）---- */
  var gridEl = null, statusEl = null, footEl = null;
  var pageNo = 0, loading = false, done = false;
  var observer = null;   // IntersectionObserver 引用
  var currentParams = {}; // 当前 TMDB 查询参数缓存（用于 detect param 变化触发重载）

  function resetLoadState() {
    pageNo = 0;
    loading = false;
    done = false;
    if (observer) { try { observer.disconnect(); } catch (_) {} observer = null; }
    cardIdx = 0;
  }

  function appendItems(items) {
    if (!gridEl) return;
    items.forEach(function (it) { gridEl.appendChild(buildCard(SFV.ui, it)); });
  }

  function getDiscoverParams() {
    if (!filterApi) return {};
    return filterApi.getParams();
  }

  function hasActiveFilters() {
    return filterApi ? filterApi.hasActiveFilters() : false;
  }

  function loadMore() {
    if (loading || done) return;
    if (!SFV.tmdb || !SFV.tmdb.popular) { done = true; if (statusEl) statusEl.textContent = 'TMDB \u672A\u5C31\u7EEA'; return; }
    loading = true;
    if (statusEl) statusEl.textContent = '\u52A0\u8F7D\u4E2D\u2026';

    var p = pageNo + 1;
    var params = getDiscoverParams();
    params.page = p;

    // 根据是否有筛选条件选择 API 路径
    var promise;
    var isDoc = filterApi && filterApi.getCategory() === 'documentary';

    if (isDoc) {
      // 纪录片：始终用 discover/movie + genre=99
      params.with_genres = '99';
      promise = SFV.tmdb.discover(params);
    } else if (hasActiveFilters()) {
      // 有筛选：用 discover
      promise = SFV.tmdb.discover(params);
    } else {
      // 无筛选：用 popular（更快更准）
      promise = SFV.tmdb.popular('movie', p);
    }

    promise.then(function (items) {
      pageNo = p;
      loading = false;
      if (!items || !items.length) {
        if (pageNo >= 6) { done = true; if (statusEl) statusEl.textContent = '\u6CA1\u6709\u66F4\u591A\u4E86'; }
        else { if (statusEl) statusEl.textContent = ''; loadMore(); }
        return;
      }
      appendItems(items);
      if (statusEl) statusEl.textContent = '';
    }).catch(function (e) {
      loading = false; done = true;
      if (statusEl) statusEl.textContent = '\u52A0\u8F7D\u5931\u8D25\uFF1A' + ((e && e.message) ? e.message : e);
    });
  }

  function showGrid(host) {
    var ui = SFV.ui;
    detailOpen = false;
    resetLoadState();
    host.innerHTML = '';

    // ---- 插入筛选器 ----
    if (SFV.MovieFilter && typeof SFV.MovieFilter.create === 'function') {
      filterApi = SFV.MovieFilter.create({
        onChange: function () {
          // 筛选变化 → 重载网格
          handleFilterChange(host);
        },
        onCategoryChange: function () {
          // 分类切换 → 重载网格
          handleFilterChange(host);
        }
      });
      if (filterApi && filterApi.el) host.appendChild(filterApi.el);
    }

    // ---- 网格容器 ----
    gridEl = ui.el('div', 'sfv-grid');
    host.appendChild(gridEl);

    statusEl = ui.el('div', 'sfv-browse-status', '\u52A0\u8F7D\u4E2D\u2026');
    host.appendChild(statusEl);

    footEl = ui.el('div', 'sfv-browse-foot',
      '\u5F71\u89C6\u8D44\u6599\u6765\u81EA TMDB\uFF0C\u4EC5\u4F9B\u5C55\u793A\u3002This product uses the TMDB API but is not endorsed or certified by TMDB.');
    host.appendChild(footEl);

    loadMore();

    // 无限滚动
    if (global.IntersectionObserver) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) loadMore(); });
      }, { root: null, rootMargin: '400px' });
      observer.observe(statusEl);
    } else {
      if (statusEl) {
        statusEl.classList.add('sfv-browse-status--click');
        statusEl.textContent = '\u70B9\u51FB\u52A0\u8F7D\u66F4\u591A';
        statusEl.addEventListener('click', loadMore);
      }
    }
  }

  // 筛选条件变化 → 清空网格重新加载
  function handleFilterChange(host) {
    if (!host) return;
    // 保留筛选器 DOM，只重建网格及以下
    var filterRoot = host.querySelector('.sfv-mfilter');
    host.innerHTML = '';
    if (filterRoot) host.appendChild(filterRoot);

    gridEl = null; statusEl = null; footEl = null;
    resetLoadState();

    var ui = SFV.ui;
    gridEl = ui.el('div', 'sfv-grid');
    host.appendChild(gridEl);
    statusEl = ui.el('div', 'sfv-browse-status', '\u52A0\u8F7D\u4E2D\u2026');
    host.appendChild(statusEl);
    footEl = ui.el('div', 'sfv-browse-foot',
      '\u5F71\u89C6\u8D44\u6599\u6765\u81EA TMDB\uFF0C\u4EC5\u4F9B\u5C55\u793A\u3002This product uses the TMDB API but is not endorsed or certified by TMDB.');
    host.appendChild(footEl);

    loadMore();
    if (global.IntersectionObserver && statusEl) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) loadMore(); });
      }, { root: null, rootMargin: '400px' });
      observer.observe(statusEl);
    }
  }

  /* ---- 详情页（与工厂一致）---- */
  function paintTrackOpt(btn, key, status) {
    var cur = SFV.model ? SFV.model.getTrackStatus(key) : null;
    btn.classList.toggle('on', cur === status);
  }

  function showDetail(it) {
    var host = gridEl ? gridEl.parentNode : null;
    if (!host) return;
    var ui = SFV.ui;
    detailOpen = true;
    host.innerHTML = '';

    var back = ui.el('button', 'sfv-detail-back', '\u2190 \u8FD4\u56DE');
    back.type = 'button';
    back.addEventListener('click', function () { if (showGridFn) showGridFn(); });
    host.appendChild(back);

    var wrap = ui.el('div', 'sfv-tmdb-detail');
    var head = ui.el('div', 'sfv-detail-head');
    var cover = ui.el('div', 'sfv-detail-cover');
    if (it.poster) {
      var img = ui.el('img', 'sfv-detail-img');
      img.src = it.poster; img.alt = it.title || '';
      img.addEventListener('error', function () { img.style.display = 'none'; cover.classList.add('sfv-detail-cover--broken'); });
      cover.appendChild(img);
    } else {
      cover.textContent = '\uD83C\uDFA5';
    }
    var info = ui.el('div', 'sfv-detail-info');
    info.appendChild(ui.el('div', 'sfv-detail-title', it.title || '\u672A\u547D\u540D'));
    if (it.year) info.appendChild(ui.el('div', 'sfv-detail-year', '\u5E74\u4EFD\uFF1A' + it.year));
    if (it.rating) info.appendChild(ui.el('div', 'sfv-detail-rating', '\u8BC4\u5206\uFF1A\u2605 ' + it.rating.toFixed(1) + ' / 10'));
    if (it.originalTitle && it.originalTitle !== it.title) {
      info.appendChild(ui.el('div', 'sfv-detail-orig', '\u539F\u540D\uFF1A' + it.originalTitle));
    }
    // 追片状态选择器
    var flagRow = ui.el('div', 'sfv-detail-flags sfv-track-status');
    flagRow.appendChild(ui.el('div', 'sfv-track-status-label', '\u8FFD\u7247\u72B6\u6001'));
    var opts = ui.el('div', 'sfv-track-status-opts');
    var STATUSES = (SFV.model && SFV.model.TRACK_STATUSES) || [];
    var LABELS = (SFV.model && SFV.model.TRACK_LABELS) || {};
    STATUSES.forEach(function (status) {
      var b = ui.el('button', 'sfv-track-status-opt', LABELS[status] || status);
      b.type = 'button';
      b.setAttribute('data-status', status);
      var key = 'tmdb:' + (currentMediaBase === 'documentary' ? 'tv' : 'movie') + ':' + it.id;
      paintTrackOpt(b, key, status);
      b.addEventListener('click', function () {
        if (!SFV.model) return;
        var cur = SFV.model.getTrackStatus(key);
        SFV.model.setTrackStatus(key, (cur === status) ? null : status);
        var all = opts.querySelectorAll('.sfv-track-status-opt');
        for (var i = 0; i < all.length; i++) paintTrackOpt(all[i], key, all[i].getAttribute('data-status'));
      });
      opts.appendChild(b);
    });
    flagRow.appendChild(opts);
    info.appendChild(flagRow);
    head.appendChild(cover);
    head.appendChild(info);
    wrap.appendChild(head);
    if (it.overview) wrap.appendChild(ui.el('div', 'sfv-detail-overview', it.overview));
    else wrap.appendChild(ui.el('div', 'sfv-browse-sub', 'TMDB \u6682\u672A\u63D0\u4F9B\u4E2D\u6587\u7B80\u4ECB\u3002'));
    wrap.appendChild(ui.el('div', 'sfv-detail-note', '\u672C\u6761\u76EE\u4EC5\u5C55\u793A TMDB \u8D44\u6599\uFF1B\u64AD\u653E\u9700\u5148\u5728\u300C\u7247\u6E90\u300D\u4E2D\u914D\u7F6E\u53EF\u7528\u6E90\uFF0C\u518D\u5230\u641C\u7D22\u4E2D\u6309\u6807\u9898\u67E5\u627E\u3002'));
    wrap.appendChild(ui.el('div', 'sfv-tmdb-attrib', 'This product uses the TMDB API but is not endorsed or certified by TMDB.'));
    host.appendChild(wrap);
  }

  /* ---- 页面注册 ---- */
  var page = {
    id: 'movie',
    title: '电影',
    mount: function (host, ctx) {
      var ui = SFV.ui;
      ui.setBrowseChrome(true);
      currentMediaBase = 'movie';
      showGridFn = function () { showGrid(host); };
      showGrid(host);
    },
    back: function () {
      if (detailOpen) { if (showGridFn) showGridFn(); return true; }
      return false;
    }
  };

  if (SFV.router && typeof SFV.router.register === 'function') {
    SFV.router.register(page);
  }
})(typeof window !== 'undefined' ? window : this);
