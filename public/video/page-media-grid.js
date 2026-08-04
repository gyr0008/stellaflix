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

    function showDetail(host, it) {
      var ui = SFV.ui;
      detailOpen = true;
      host.innerHTML = '';
      // 详情页为层级导航：自带返回按钮（关闭详情回到网格），不依赖被隐藏的全局头
      var back = ui.el('button', 'sfv-detail-back', '← 返回');
      back.type = 'button';
      back.addEventListener('click', function () { if (showGridFn) showGridFn(); });
      host.appendChild(back);
      var key = 'tmdb:' + mediaType + ':' + it.id;
      var wrap = ui.el('div', 'sfv-tmdb-detail');
      var head = ui.el('div', 'sfv-detail-head');
      var cover = ui.el('div', 'sfv-detail-cover');
      if (it.poster) {
        var img = ui.el('img', 'sfv-detail-img');
        img.src = it.poster; img.alt = it.title || '';
        img.addEventListener('error', function () { img.style.display = 'none'; cover.classList.add('sfv-detail-cover--broken'); });
        cover.appendChild(img);
      } else {
        cover.textContent = '🎬';
      }
      var info = ui.el('div', 'sfv-detail-info');
      info.appendChild(ui.el('div', 'sfv-detail-title', it.title || '未命名'));
      if (it.year) info.appendChild(ui.el('div', 'sfv-detail-year', '年份：' + it.year));
      if (it.rating) info.appendChild(ui.el('div', 'sfv-detail-rating', '评分：★ ' + it.rating.toFixed(1) + ' / 10'));
      if (it.originalTitle && it.originalTitle !== it.title) {
        info.appendChild(ui.el('div', 'sfv-detail-orig', '原名：' + it.originalTitle));
      }
      // 追片状态选择器（与 online.js 详情页一致：互斥单值 + 清除）
      var flagRow = ui.el('div', 'sfv-detail-flags sfv-track-status');
      flagRow.appendChild(ui.el('div', 'sfv-track-status-label', '追片状态'));
      var opts = ui.el('div', 'sfv-track-status-opts');
      var STATUSES = (SFV.model && SFV.model.TRACK_STATUSES) || [];
      var LABELS = (SFV.model && SFV.model.TRACK_LABELS) || {};
      STATUSES.forEach(function (status) {
        var b = ui.el('button', 'sfv-track-status-opt', LABELS[status] || status);
        b.type = 'button';
        b.setAttribute('data-status', status);
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
      head.appendChild(cover); head.appendChild(info);
      wrap.appendChild(head);
      if (it.overview) wrap.appendChild(ui.el('div', 'sfv-detail-overview', it.overview));
      else wrap.appendChild(ui.el('div', 'sfv-browse-sub', 'TMDB 暂未提供中文简介。'));
      wrap.appendChild(ui.el('div', 'sfv-detail-note', '本条目仅展示 TMDB 资料；播放需先在「片源」中配置可用源，再到搜索中按标题查找。'));
      wrap.appendChild(ui.el('div', 'sfv-tmdb-attrib', 'This product uses the TMDB API but is not endorsed or certified by TMDB.'));
      host.appendChild(wrap);
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
