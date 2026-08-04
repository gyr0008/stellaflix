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

  function bindCapsuleSearchBtn() {
    if (_searchBound) return;
    _searchBound = true;

    // (1) 胶囊按钮点击 -> 打开/关闭全页搜索
    doc.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('#sfv-capsule-search-btn') : null;
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      toggleSearchPage();
    }, true);

    // (2) 返回/关闭按钮 -> 关闭搜索页
    doc.addEventListener('click', function (ev) {
      if (!isSearchPageOpen()) return;
      var backBtn = ev.target.closest ? ev.target.closest('.sfv-search-back') : null;
      var closeBtn = ev.target.closest ? ev.target.closest('.sfv-search-close') : null;
      if (backBtn || closeBtn) { closeSearchPage(); }
    }, true);

    // (3) 搜索栏聚焦/失焦 -> 显示/隐藏历史下拉
    doc.addEventListener('focus', function (ev) {
      if (!isSearchPageOpen() || !searchInput) return;
      if (ev.target === searchInput) showHistoryDrop();
    }, true);
    doc.addEventListener('blur', function (ev) {
      if (!isSearchPageOpen()) return;
      if (ev.target === searchInput) { setTimeout(function () { hideHistoryDrop(); }, 150); }
    }, true);

    // (4) 历史下拉返回按钮 -> 收起
    doc.addEventListener('click', function (ev) {
      if (!isSearchPageOpen()) return;
      var back = ev.target.closest ? ev.target.closest('.sfv-history-drop-back') : null;
      if (back) { hideHistoryDrop(); if (searchInput) searchInput.focus(); }
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

    // (7) 回车搜索 / Escape 关闭
    doc.addEventListener('keydown', function (ev) {
      if (!isSearchPageOpen() || !searchInput) return;
      if ((ev.key === 'Enter' || ev.keyCode === 13) && ev.target === searchInput) {
        ev.preventDefault();
        var kw = (searchInput.value || '').trim();
        if (kw) { hideHistoryDrop(); doInlineSearch(kw); }
      }
      if (ev.key === 'Escape' || ev.keyCode === 27) {
        if (historyDrop && historyDrop.classList.contains('sfv-history-visible')) {
          hideHistoryDrop();
          ev.preventDefault();
          ev.stopPropagation();
        } else {
          closeSearchPage();
        }
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
    if (isSearchPageOpen()) closeSearchPage();
    else openSearchPage();
  }

  function openSearchPage() {
    var el = getSearchPage();
    if (!el) return;
    ensure(); // 确保浏览层已初始化（doSearch 依赖 SFV.sources 等）
    el.classList.add('sfv-search-open');
    renderHistoryDrop();
    clearResultArea();
    _currentSearchView = null;
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
  function showHistoryDrop() { if (historyDrop) historyDrop.classList.add('sfv-history-visible'); }
  function hideHistoryDrop() { if (historyDrop) historyDrop.classList.remove('sfv-history-visible'); }

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
      historyListEl.innerHTML = '<div class="sfv-history-empty">暂无搜索记录</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<div class="sfv-history-item-row">';
      html += '<button class="sfv-history-item" type="button" data-sfv-kw="' + esc(list[i]) + '">';
      html += esc(list[i]) + '</button>';
      html += '<button class="sfv-history-item-del" type="button" data-sfv-kw="' + esc(list[i]) + '" title="\u5220\u9664">\u00D7</button></div>';
    }
    historyListEl.innerHTML = html;
  }

  // ---- 核心搜索：结果直接渲染在全页内（不跳转浏览层）----
  function doInlineSearch(kw) {
    if (!kw) return;
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

    var cmsP = canCms ? SFV.sources.search(kw, { timeout: 12000 })
                      : Promise.resolve({ items: [], errors: [], noSource: true });
    var kzP  = canKz  ? SFV.kazumi.search(kw)
                      : Promise.resolve({ items: [], errors: [] });

    Promise.all([cmsP, kzP]).then(function (arr) {
      if (_currentSearchView !== viewToken) return; // 已过时丢弃
      var merged = (arr[0].items || []).concat(arr[1].items || []);
      if (merged.length) {
        renderInlineResults(merged, kw);
      } else {
        showSearchStatus('\u6CA1\u6709\u627E\u5230\u300C' + esc(kw) + '\u300D\u7684\u76F8\u5173\u7ED3\u679C\u3002');
      }
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
      var st = '';
      if (it.year) st += it.year;
      if (it.variants && it.variants.length > 1) {
        if (st) st += ' \u00B7 ';
        st += it.variants.length + ' \u4E2A\u6765\u6E90';
      }
      if (!st) st = '\u70B9\u51FB\u67E5\u770B';
      sub.textContent = st;

      card.appendChild(cover);
      card.appendChild(name);
      card.appendChild(sub);
      if (it.isKazumi) card.classList.add('sfv-card--kazumi');

      // 点击 -> 关闭搜索页 -> 打开浏览层详情
      (function (cap) {
        card.addEventListener('click', function () {
          closeSearchPage();
          ensure();
          open();
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
