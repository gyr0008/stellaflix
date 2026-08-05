/*
 * Stellaflix 影视模块 — 影视海报网格页面工厂 (T127)
 *
 * 电影 / 动漫 是两个**独立注册**的页面模块，各自调用本工厂生成，传入字面量
 *   mediaType（'movie' / 'anime'），而非运行时用 kind 切换同一函数。
 * 工厂内聚：TMDB 热门网格 + 无限滚动 + 评分徽章 + TMDB 资料详情（点卡片进入，
 *   页面内部 back 关闭详情回到网格），不再依赖 online.js 的全局视图栈。
 *
 * 视觉契约：复用 .sfv-card / .sfv-card-cover / .sfv-card-img / .sfv-card-name /
 *   .sfv-card-sub / .sfv-card-rating / .sfv-grid / .sfv-browse-status /
 *   .sfv-browse-foot / .sfv-tmdb-detail 等既有样式；
 *   浅色卡片变量由 online.js 的 applyGridDiyToBody 写入 bodyEl（本页面渲染进
 *   同一 bodyEl），背景由 applyVideoPageBg 按 activePageId 同步。
 *
 * 双态隔离：本模块只读取 SFV.tmdb / SFV.model / SFV.ui，绝不写入音乐态 DOM。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  // 由 online.js 在 IIFE 导出 SFV.ui（el/toast/setNote/paintFlag/CATEGORY_META/
  // setBrowseChrome/setTitle）。页面模块仅通过这些共享辅助与外壳交互。
  function createMediaGridPage(opts) {
    var id = opts.id;
    var title = opts.title;
    var mediaType = opts.mediaType; // 字面量：'movie' 或 'anime'，非运行时 kind

    var detailOpen = false;
    var showGridFn = null;
    var gridEl = null; // 网格容器，用于详情页定位宿主（grid.parentNode）

    var cardIdx = 0; // 追踪卡片序号，首屏 eager 加载
    function buildCard(ui, it) {
      cardIdx++;
      var card = ui.el('button', 'sfv-card');
      card.type = 'button';
      var cover = ui.el('div', 'sfv-card-cover');
      if (it.poster) {
        var img = ui.el('img', 'sfv-card-img');
        img.src = it.poster; img.alt = it.title || '';
        // 首屏（前 2 行约 10-12 张）eager 加载，其余 lazy
        if (cardIdx > 12) img.loading = 'lazy';
        img.addEventListener('load', function () { img.classList.add('loaded'); });
        img.addEventListener('error', function () {
          img.style.display = 'none';
          cover.classList.add('sfv-cover--broken');
        });
        cover.appendChild(img);
      } else {
        cover.textContent = '🎬';
      }
      if (it.rating) {
        cover.appendChild(ui.el('div', 'sfv-card-rating', '★ ' + it.rating.toFixed(1)));
      }
      card.appendChild(cover);
      card.appendChild(ui.el('div', 'sfv-card-name', it.title || '未命名'));
      card.appendChild(ui.el('div', 'sfv-card-sub', it.year || ''));
      card.addEventListener('click', function () { showDetail(it); });
      return card;
    }

    function showGrid(host) {
      var ui = SFV.ui;
      detailOpen = false;
      cardIdx = 0; // 重置卡片序号（每次 mount 重新计数）
      host.innerHTML = '';
      var grid = ui.el('div', 'sfv-grid');
      host.appendChild(grid);
      gridEl = grid;
      var statusEl = ui.el('div', 'sfv-browse-status', '加载中…');
      host.appendChild(statusEl);
      var foot = ui.el('div', 'sfv-browse-foot',
        '影视资料来自 TMDB，仅供展示。This product uses the TMDB API but is not endorsed or certified by TMDB.');
      host.appendChild(foot);

      var pageNo = 0, loading = false, done = false;

      function appendItems(items) {
        items.forEach(function (it) { grid.appendChild(buildCard(ui, it)); });
      }
      function loadMore() {
        if (loading || done) return;
        if (!SFV.tmdb || !SFV.tmdb.popular) { done = true; statusEl.textContent = 'TMDB 未就绪'; return; }
        loading = true;
        statusEl.textContent = '加载中…';
        var p = pageNo + 1;
        SFV.tmdb.popular(mediaType, p).then(function (items) {
          pageNo = p;
          loading = false;
          if (!items || !items.length) {
            if (pageNo >= 6) { done = true; statusEl.textContent = '没有更多了'; }
            else { statusEl.textContent = ''; loadMore(); } // 该页无结果，继续翻页
            return;
          }
          appendItems(items);
          statusEl.textContent = '';
        }).catch(function (e) {
          loading = false; done = true;
          statusEl.textContent = '加载失败：' + ((e && e.message) ? e.message : e);
        });
      }
      loadMore();
      // 无限滚动：以状态行作为哨兵（root:null=视口，兼容任意滚动容器）
      if (global.IntersectionObserver) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { if (en.isIntersecting) loadMore(); });
        }, { root: null, rootMargin: '400px' });
        io.observe(statusEl);
      } else {
        statusEl.classList.add('sfv-browse-status--click');
        statusEl.textContent = '点击加载更多';
        statusEl.addEventListener('click', loadMore);
      }
    }

    function paintTrackOpt(btn, key, status) {
      var cur = SFV.model ? SFV.model.getTrackStatus(key) : null;
      btn.classList.toggle('on', cur === status);
    }

    function showDetail(it) {
      // Phase 2 v2：海报点击进入暗色全屏详情页（renderDetail 为单一汇聚点，
      // 内部转发 SFV.detailV2.build）。detail-v2 用 view.key||id 作为追片键，
      // popular 项已带 id + mediaType，可直接复用。
      try {
        if (SFV.online && typeof SFV.online.renderDetail === 'function') {
          SFV.online.renderDetail(it);
          return;
        }
      } catch (e) { /* 落到下方兜底，避免崩溃 */ }
      // 兜底：detail-v2 未就绪时给轻提示，避免静默白屏
      try {
        if (SFV.ui && typeof SFV.ui.toast === 'function') {
          SFV.ui.toast('详情页加载中…');
        }
      } catch (e) { /* 静默降级 */ }
    }

    var page = {
      id: id,
      title: title,
      mount: function (host, ctx) {
        var ui = SFV.ui;
        ui.setBrowseChrome(true); // 网格页隐藏浏览层自带内联搜索与操作按钮
        showGridFn = function () { showGrid(host); };
        showGrid(host);
      },
      // 页面内部 back：详情打开时关闭详情回到网格（返回 true 表示已处理）；
      // 否则返回 false（顶层 tab 页平级，无返回语义，交由外壳 no-op）。
      back: function () {
        if (detailOpen) { if (showGridFn) showGridFn(); return true; }
        return false;
      }
    };

    SFV.router.register(page);
    return page;
  }

  SFV.createMediaGridPage = createMediaGridPage;
})(typeof window !== 'undefined' ? window : this);
