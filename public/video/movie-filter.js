/*
 * Stellaflix 影视模块 — 电影页面筛选器组件 (T134)
 *
 * 三层结构：
 *   L1 分类 tab（电影 / 纪录片）— 下划线式，切换数据集
 *   L2 排序 + 筛选入口（折叠态）— 胶囊排序 + 角标筛选按钮
 *   L3 筛选面板（展开态）— 年份 / 类型 / 地区 多选行
 *
 * 交互规则：
 *   - 排序单选，年份/类型/地区各自多选，可跨类别组合
 *   - 切换分类 tab 清空筛选条件（保留排序），收起面板不清空
 *   - 年份常驻最近5年 + "更早" 二级菜单；类型常驻6个 + "+更多" 弹层
 *   - 移动端标签行横向可滑动
 *
 * 输出：SFV.MovieFilter.create(opts) → { el, getParams, onChange, destroy }
 *   getParams() 返回 TMDB discover 兼容参数对象
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  if (SFV.MovieFilter) return; // 幂等

  var d = function () { return global.document; };

  /* ------------------------------------------------------------------
   * 常量定义
   * ------------------------------------------------------------------ */

  // 排序选项 → TMDB sort_by 值
  var SORT_OPTIONS = [
    { key: 'popularity', label: '热门', sortBy: 'popularity.desc' },
    { key: 'rating',     label: '高评分', sortBy: 'vote_average.desc' },
    { key: 'newest',     label: '最新', sortBy: 'primary_release_date.desc' }
  ];

  // 年份：动态生成最近5年 + 更早分段
  function buildYearOptions() {
    var now = new Date().getFullYear();
    var years = [];
    for (var i = 0; i < 5; i++) years.push(now - i);
    return {
      recent: years,
      earlier: [
        { label: '2021-2019', min: 2019, max: 2021 },
        { label: '2010s',     min: 2010, max: 2019 },
        { label: '2000s',     min: 2000, max: 2009 },
        { label: '经典',      min: 0,   max: 1999 }
      ]
    };
  }

  // 电影类型标签 → TMDB genre_id
  var MOVIE_GENRES = [
    { id: 28,       label: '动作' },
    { id: 35,       label: '喜剧' },
    { id: 878,      label: '科幻' },
    { id: 10749,    label: '爱情' },
    { id: 53,       label: '惊悚' },
    { id: 16,       label: '动画' },
    // 前6个常驻，以下通过"+更多"展示
    { id: 18,       label: '剧情' },
    { id: 27,       label: '恐怖' },
    { id: 9648,     label: '悬疑' },
    { id: 10752,    label: '战争' },
    { id: 14,       label: '奇幻' },
    { id: 99,       label: '纪录片' },   // 电影中的纪录片类别
    { id: 36,       label: '历史' },
    { id: 10402,    label: '音乐' },
    { id: 10751,    label: '家庭' },
    { id: 9801,     label: '运动' },
    { id: 80,       label: '犯罪' }
  ];
  var MOVIE_GENRE_VISIBLE = 6; // 常驻显示数量

  // 纪录片子类标签（TMDB 无细分子类，全部映射 genre=99 + 可选 keyword）
  // 此处用虚拟分类供用户筛选体验，数据层统一用 with_genres=99
  var DOC_GENRES = [
    { id: 'doc_nature',   label: '自然',     keyword: 'nature' },
    { id: 'doc_history',  label: '历史',     keyword: 'history documentary' },
    { id: 'doc_bio',      label: '传记',     keyword: 'biography' },
    { id: 'doc_crime',    label: '真实罪案',  keyword: 'true crime' },
    { id: 'doc_social',   label: '社会',     keyword: 'society' },
    { id: 'doc_science',  label: '科学',     keyword: 'science' },
    // 前6个常驻
    { id: 'doc_space',    label: '太空/宇宙', keyword: 'space universe' },
    { id: 'doc_music',    label: '音乐与艺术', keyword: 'music art' },
    { id: 'doc_food',     label: '美食',     keyword: 'food' },
    { id: 'doc_travel',   label: '旅行',     keyword: 'travel' },
    { id: 'doc_sport',    label: '体育',     keyword: 'sports' },
    { id: 'doc_politics', label: '政治',     keyword: 'politics' },
    { id: 'doc_people',   label: '人物',     keyword: 'people profile' },
    { id: 'doc_war',      label: '战争',     keyword: 'war' }
  ];
  var DOC_GENRE_VISIBLE = 6;

  // 地区选项 → TMDB with_origin_country / with_original_language
  var REGION_OPTIONS = [
    { key: 'cn',   label: '华语', language: 'zh' },
    { key: 'en',   label: '欧美', language: 'en' },
    { key: 'kr',   label: '韩国', language: 'ko' },
    { key: 'jp',   label: '日本', language: 'ja' },
    { key: 'other', label: '其他', language: null }  // 不限语言
  ];

  /* ------------------------------------------------------------------
   * 状态管理
   * ------------------------------------------------------------------ */
  function createState() {
    return {
      category: 'movie',          // 'movie' | 'documentary'
      sort: 'popularity',         // SORT_OPTIONS key
      years: {},                   // Set semantics: { "2026": true, ... }
      genres: {},                  // Set semantics: { "28": true, ... }
      regions: {},                 // Set semantics: { "cn": true, ... }
      panelOpen: false,
      moreGenresOpen: false,
      earlierOpen: false          // "更早"年份下拉
    };
  }

  // 浅拷贝状态中的 Set 对象
  function cloneSets(st) {
    return {
      years: Object.assign({}, st.years),
      genres: Object.assign({}, st.genres),
      regions: Object.assign({}, st.regions)
    };
  }

  /* ------------------------------------------------------------------
   * DOM 构建
   * ------------------------------------------------------------------ */
  function el(tag, cls, text) {
    var n = d().createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildRoot() {
    var root = el('div', 'sfv-mfilter');
    root.setAttribute('role', 'toolbar');
    root.setAttribute('aria-label', '电影筛选');
    return root;
  }

  // ---- L1 分类 tab ----
  function buildTabs(st, onSwitch) {
    var wrap = el('div', 'sfv-mfilter-tabs');
    var tabs = [
      { key: 'movie', label: '电影' },
      { key: 'documentary', label: '纪录片' }
    ];
    tabs.forEach(function (t) {
      var b = el('button', 'sfv-mfilter-tab', t.label);
      b.type = 'button';
      b.setAttribute('data-mf-cat', t.key);
      b.setAttribute('aria-pressed', t.key === st.category ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (st.category === t.key) return;
        st.category = t.key;
        // 切换 tab 清空筛选（保留排序）
        st.years = {};
        st.genres = {};
        st.regions = {};
        st.panelOpen = false;
        st.moreGenresOpen = false;
        st.earlierOpen = false;
        paintTabs(wrap, st);
        paintPanel(panelEl, st);
        paintBar(barEl, st);
        if (onSwitch) onSwitch(st);
      });
      wrap.appendChild(b);
    });
    paintTabs(wrap, st);
    return wrap;
  }

  function paintTabs(wrap, st) {
    var btns = wrap.querySelectorAll('.sfv-mfilter-tab');
    for (var i = 0; i < btns.length; i++) {
      var k = btns[i].getAttribute('data-mf-cat');
      var active = k === st.category;
      btns[i].setAttribute('aria-pressed', active ? 'true' : 'false');
      btns[i].classList.toggle('active', active);
    }
  }

  // ---- L2 排序 + 筛选按钮 ----
  function buildBar(st, onToggle, onChange) {
    var bar = el('div', 'sfv-mfilter-bar');

    // 排序胶囊组
    var sortsWrap = el('div', 'sfv-mfilter-sorts');
    SORT_OPTIONS.forEach(function (opt) {
      var b = el('button', 'sfv-mfilter-sort-pill', opt.label);
      b.type = 'button';
      b.setAttribute('data-mf-sort', opt.key);
      b.addEventListener('click', function () {
        if (st.sort === opt.key) return;
        st.sort = opt.key;
        paintSorts(sortsWrap, st);
        if (onChange) onChange(st);
      });
      sortsWrap.appendChild(b);
    });

    // 筛选按钮（带角标）
    var toggleBtn = el('button', 'sfv-mfilter-toggle');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-controls', 'mf-panel');
    toggleBtn.id = 'mf-toggle-btn';
    toggleBtn.addEventListener('click', function () {
      st.panelOpen = !st.panelOpen;
      st.panelOpen ? openPanel() : closePanel();
    });

    bar.appendChild(sortsWrap);
    bar.appendChild(toggleBtn);

    paintSorts(sortsWrap, st);

    function openPanel() {
      st.panelOpen = true;
      toggleBtn.setAttribute('aria-expanded', 'true');
      if (panelEl) panelEl.classList.add('sfv-mfilter-panel--open');
      paintToggleLabel(toggleBtn, st);
    }
    function closePanel() {
      st.panelOpen = false;
      toggleBtn.setAttribute('aria-expanded', 'false');
      if (panelEl) panelEl.classList.remove('sfv-mfilter-panel--open');
      st.moreGenresOpen = false;
      st.earlierOpen = false;
      paintToggleLabel(toggleBtn, st);
    }

    // 暴露给外部
    bar._openPanel = openPanel;
    bar._closePanel = closePanel;

    return bar;
  }

  function paintSorts(wrap, st) {
    var btns = wrap.querySelectorAll('.sfv-mfilter-sort-pill');
    for (var i = 0; i < btns.length; i++) {
      var k = btns[i].getAttribute('data-mf-sort');
      btns[i].classList.toggle('active', k === st.sort);
    }
  }

  function paintToggleLabel(btn, st) {
    var total = countActiveFilters(st);
    btn.innerHTML = '筛选' + (total > 0 ? ' &middot; ' + total : '') + ' \u25BE';
  }

  // ---- L3 筛选面板 ----
  var panelEl = null; // 引用，供 bar 的 toggle 操作

  function buildPanel(st, onChange) {
    panelEl = el('div', 'sfv-mfilter-panel');
    panelEl.id = 'mf-panel';
    panelEl.setAttribute('role', 'region');
    panelEl.setAttribute('aria-label', '筛选选项');

    var yearOpts = buildYearOptions();
    var genres = st.category === 'movie' ? MOVIE_GENRES : DOC_GENRES;
    var visibleCount = st.category === 'movie' ? MOVIE_GENRE_VISIBLE : DOC_GENRE_VISIBLE;

    // --- 年分行 ---
    var yearRow = buildFilterRow('年份', function (rowBody) {
      // "全部" + 最近5年
      var allBtn = makeTag('全部', true, function () {
        st.years = {};
        repaintYearTags(rowBody, st, yearOpts);
        syncFooterAndBar(st, onChange);
      });
      rowBody.appendChild(allBtn);
      yearOpts.recent.forEach(function (y) {
        var b = makeTag(String(y), !!st.years[y], function () {
          toggleSet(st.years, String(y));
          repaintYearTags(rowBody, st, yearOpts);
          syncFooterAndBar(st, onChange);
        });
        b.setAttribute('data-mf-year', y);
        rowBody.appendChild(b);
      });
      // "更早" 按钮 + 下拉
      var earlierBtn = makeTag('更早 \u25BE', false, function (e) {
        e.stopPropagation();
        st.earlierOpen = !st.earlierOpen;
        if (earlierDrop) earlierDrop.style.display = st.earlierOpen ? '' : 'none';
      });
      earlierBtn.classList.add('sfv-mfilter-tag--has-drop');
      rowBody.appendChild(earlierBtn);

      // 更早下拉浮层
      var earlierDrop = el('div', 'sfv-mfilter-dropdown');
      earlierDrop.style.display = 'none';
      yearOpts.earlier.forEach(function (seg) {
        var db = el('button', 'sfv-mfilter-drop-item', seg.label);
        db.type = 'button';
        db.addEventListener('click', function () {
          // 选中该段：用最小年份作为键（简化处理）
          toggleSet(st.years, 'earlier_' + seg.label);
          repaintYearTags(rowBody, st, yearOpts);
          if (earlierDrop) earlierDrop.style.display = 'none';
          st.earlierOpen = false;
          syncFooterAndBar(st, onChange);
        });
        earlierDrop.appendChild(db);
      });
      rowBody.parentNode.appendChild(earlierDrop); // 加到 row 外但 panel 内

      return { repaint: function () { repaintYearTags(rowBody, st, yearOpts); } };
    });
    panelEl.appendChild(yearRow);

    // --- 类型行 ---
    var genreRow = buildFilterRow('类型', function (rowBody) {
      var allBtn = makeTag('全部', true, function () {
        st.genres = {};
        repaintGenreTags(rowBody, st, genres, visibleCount);
        syncFooterAndBar(st, onChange);
      });
      rowBody.appendChild(allBtn);

      var normalGenres = genres.slice(0, visibleCount);
      var moreGenres = genres.slice(visibleCount);

      normalGenres.forEach(function (g) {
        var b = makeTag(g.label, !!st.genres[g.id], function () {
          toggleSet(st.genres, g.id);
          repaintGenreTags(rowBody, st, genres, visibleCount);
          syncFooterAndBar(st, onChange);
        });
        b.setAttribute('data-mf-genre', g.id);
        rowBody.appendChild(b);
      });

      if (moreGenres.length > 0) {
        var moreBtn = makeTag('+更多', false, function (e) {
          e.stopPropagation();
          st.moreGenresOpen = !st.moreGenresOpen;
          if (moreDrop) moreDrop.style.display = st.moreGenresOpen ? '' : 'none';
        });
        moreBtn.classList.add('sfv-mfilter-tag--more');
        rowBody.appendChild(moreBtn);

        // 更多类型弹层
        var moreDrop = el('div', 'sfv-mfilter-more-popup');
        moreDrop.style.display = 'none';
        moreGenres.forEach(function (g) {
          var mb = makeTag(g.label, !!st.genres[g.id], function () {
            toggleSet(st.genres, g.id);
            repaintGenreTags(rowBody, st, genres, visibleCount);
            // 同步弹层内按钮状态
            var innerBtn = moreDrop.querySelector('[data-mf-genre="' + g.id + '"]');
            if (innerBtn) innerBtn.classList.toggle('active', !!st.genres[g.id]);
            syncFooterAndBar(st, onChange);
          });
          mb.setAttribute('data-mf-genre', g.id);
          moreDrop.appendChild(mb);
        });
        rowBody.parentNode.appendChild(moreDrop);
      }

      return { repaint: function () { repaintGenreTags(rowBody, st, genres, visibleCount); } };
    });
    panelEl.appendChild(genreRow);

    // --- 地区行 ---
    var regionRow = buildFilterRow('地区', function (rowBody) {
      var allBtn = makeTag('全部', true, function () {
        st.regions = {};
        repaintRegionTags(rowBody, st);
        syncFooterAndBar(st, onChange);
      });
      rowBody.appendChild(allBtn);
      REGION_OPTIONS.forEach(function (r) {
        var b = makeTag(r.label, !!st.regions[r.key], function () {
          toggleSet(st.regions, r.key);
          repaintRegionTags(rowBody, st);
          syncFooterAndBar(st, onChange);
        });
        b.setAttribute('data-mf-region', r.key);
        rowBody.appendChild(b);
      });
      return { repaint: function () { repaintRegionTags(rowBody, st); } };
    });
    panelEl.appendChild(regionRow);

    // --- 分割线 ---
    var hr = el('div', 'sfv-mfilter-hr');
    panelEl.appendChild(hr);

    // --- 底部操作栏 ---
    var footer = el('div', 'sfv-mfilter-footer');
    var countLabel = el('span', 'sfv-mfilter-footer-count', '已选 0 项');
    var clearAllBtn = el('button', 'sfv-mfilter-footer-clear', '清除全部');
    clearAllBtn.type = 'button';
    clearAllBtn.addEventListener('click', function () {
      st.years = {};
      st.genres = {};
      st.regions = {};
      refreshPanelPaint(st);
      syncFooterAndBar(st, onChange);
    });
    var collapseBtn = el('button', 'sfv-mfilter-footer-collapse', '收起 \u25B4');
    collapseBtn.type = 'button';
    collapseBtn.addEventListener('click', function () {
      if (barEl && barEl._closePanel) barEl._closePanel();
    });
    footer.appendChild(countLabel);
    footer.appendChild(clearAllBtn);
    footer.appendChild(collapseBtn);
    panelEl.appendChild(footer);

    // 初始绘制
    refreshPanelPaint(st);

    function refreshPanelPaint(s) {
      paintFooterCount(countLabel, s);
      repaintYearTags(yearRow.querySelector('.sfv-mfilter-tags'), s, yearOpts);
      repaintGenreTags(genreRow.querySelector('.sfv-mfilter-tags'), s, genres, visibleCount);
      repaintRegionTags(regionRow.querySelector('.sfv-mfilter-tags'), s);
    }

    return panelEl;
  }

  // 构建一个筛选项行：label + 标签容器
  function buildFilterRow(labelText, initFn) {
    var row = el('div', 'sfv-mfilter-row');
    var label = el('span', 'sfv-mfilter-label', labelText);
    var tagsWrap = el('div', 'sfv-mfilter-tags'); // 横滑容器
    row.appendChild(label);
    row.appendChild(tagsWrap);
    var helper = initFn(tagsWrap); // 让回调往 tagsWrap 里填充按钮
    return row;
  }

  function makeTag(text, isActive, onClick) {
    var b = el('button', 'sfv-mfilter-tag', text);
    b.type = 'button';
    b.classList.toggle('active', isActive);
    b.addEventListener('click', onClick);
    return b;
  }

  function toggleSet(setObj, key) {
    if (setObj[key]) delete setObj[key];
    else setObj[key] = true;
  }

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

  function paintFooterCount(countEl, st) {
    var n = countActiveFilters(st);
    countEl.textContent = '已选 ' + n + ' 项';
  }

  function countActiveFilters(st) {
    return Object.keys(st.years).length + Object.keys(st.genres).length + Object.keys(st.regions).length;
  }

  function syncFooterAndBar(st, onChange) {
    if (panelEl) {
      var fc = panelEl.querySelector('.sfv-mfilter-footer-count');
      if (fc) paintFooterCount(fc, st);
    }
    if (barEl) paintToggleLabel(barEl.querySelector('.sfv-mfilter-toggle'), st);
    if (onChange) onChange(st);
  }

  function paintBar(bar, st) {
    if (!bar) return;
    paintSorts(bar.querySelector('.sfv-mfilter-sorts'), st);
    paintToggleLabel(bar.querySelector('.sfv-mfilter-toggle'), st);
  }

  function paintPanel(panel, st) {
    if (!panel) return;
    // 重建面板内容（切换tab时类型标签完全不同）
    var oldPanel = panel;
    var parent = oldPanel.parentNode;
    var newPanel = buildPanel(st, null); // onChange 稍后由外部统一绑定
    parent.replaceChild(newPanel, oldPanel);
    panelEl = newPanel;
  }

  /* ------------------------------------------------------------------
   * 参数输出：将当前状态转为 TMDB discover 兼容查询参数
   * ------------------------------------------------------------------ */
  function buildParams(st) {
    var params = {};

    // 排序
    var sortOpt = null;
    for (var i = 0; i < SORT_OPTIONS.length; i++) {
      if (SORT_OPTIONS[i].key === st.sort) { sortOpt = SORT_OPTIONS[i]; break; }
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
      for (var r = 0; r < REGION_OPTIONS.length; r++) {
        if (st.regions[REGION_OPTIONS[r].key] && REGION_OPTIONS[r].language) {
          params.with_original_language = REGION_OPTIONS[r].language;
          break;
        }
      }
    }

    return params;
  }

  /* ------------------------------------------------------------------
   * 公共 API：create(opts)
   *   opts.onChange(st) — 筛选变化回调（排序切换/筛选项变化均触发）
   *   opts.onCategoryChange(st) — 分类 tab 切换回调
   * ------------------------------------------------------------------ */
  var barEl = null; // module-level 引用

  function create(opts) {
    opts = opts || {};
    var st = createState();
    var onChange = opts.onChange || null;
    var onCatChange = opts.onCategoryChange || null;

    var root = buildRoot();

    // L1 分类 tab
    var tabsEl = buildTabs(st, function (s) {
      if (onCatChange) onCatChange(s);
      if (onChange) onChange(s);
    });
    root.appendChild(tabsEl);

    // L2 排序栏
    barEl = buildBar(st, null, function (s) { if (onChange) onChange(s); });
    root.appendChild(barEl);

    // L3 筛选面板
    var panel = buildPanel(st, function (s) { if (onChange) onChange(s); });
    root.appendChild(panel);

    // 点击外部关闭下拉/弹层
    d().addEventListener('mousedown', function (ev) {
      var target = ev.target;
      // 关闭"更早"下拉
      if (st.earlierOpen && target.closest) {
        var drop = root.querySelector('.sfv-mfilter-dropdown');
        if (drop && drop.style.display !== 'none' && !target.closest('.sfv-mfilter-dropdown') && !target.closest('.sfv-mfilter-tag--has-drop')) {
          st.earlierOpen = false;
          if (drop) drop.style.display = 'none';
        }
      }
      // 关闭"+更多"弹层
      if (st.moreGenresOpen && target.closest) {
        var pop = root.querySelector('.sfv-mfilter-more-popup');
        if (pop && pop.style.display !== 'none' && !target.closest('.sfv-mfilter-more-popup') && !target.closest('.sfv-mfilter-tag--more')) {
          st.moreGenresOpen = false;
          if (pop) pop.style.display = 'none';
        }
      }
    });

    var api = {
      el: root,
      // 获取当前 TMDB discover 参数（不含 page，由调用方追加）
      getParams: function () { return buildParams(st); },
      // 获取当前分类
      getCategory: function () { return st.category; },
      // 获取当前排序 key
      getSort: function () { return st.sort; },
      // 是否有激活的筛选条件（排除排序）
      hasActiveFilters: function () { return countActiveFilters(st) > 0; },
      // 重置所有筛选（保留排序和当前分类）
      resetFilters: function () {
        st.years = {};
        st.genres = {};
        st.regions = {};
        st.panelOpen = false;
        st.moreGenresOpen = false;
        st.earlierOpen = false;
        refreshPanelPaint(st);
        paintBar(barEl, st);
        if (panelEl) panelEl.classList.remove('sfv-mfilter-panel--open');
      },
      // 销毁
      destroy: function () {
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null; barEl = null; panelEl = null;
      }
    };

    return api;
  }

  SFV.MovieFilter = { create: create };
})(typeof window !== 'undefined' ? window : this);
