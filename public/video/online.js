/*
 * Stellaflix 影视模块 — 在线 CMS10 源闭环 UI (Step 4)
 *
 * 职责：把 sources.js（协议层）+ source-adapter.js（播放接入）串成用户可用界面：
 *   - 聚合搜索：跨已启用片源搜索，去重归并后网格展示；
 *   - 详情剧集：点结果进详情，调 sources.detail 拿到分源剧集，点剧集即播放；
 *   - 四类用户列表：心动(liked) / 片单(inList) / 收藏(faved) / 历史(history)；
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
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var CATEGORY_META = {
    liked: { label: '心动', field: 'liked', empty: '还没有心动的影片，在详情页点亮 ♥ 即可收藏到这里。' },
    inList: { label: '片单', field: 'inList', empty: '片单还是空的，在详情页点击「加入片单」即可。' },
    faved: { label: '收藏', field: 'faved', empty: '收藏夹为空，详情页点击「收藏」即可加入。' },
    history: { label: '历史', field: 'history', empty: '还没有观看记录，播放任意影片后会自动出现在这里。' },
  };

  var overlay = null, headEl = null, backBtn = null, titleEl = null,
      actsEl = null, searchInput = null, bodyEl = null, noteEl = null;
  var stack = [];           // 视图栈：{ mode, ... }
  var current = null;       // 当前视图
  var busy = false;

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
    headEl.appendChild(backBtn); headEl.appendChild(titleEl); headEl.appendChild(actsEl);

    var srch = el('div', 'sfv-browse-search');
    searchInput = el('input', 'sfv-browse-search-input');
    searchInput.type = 'text';
    searchInput.placeholder = '搜索影片 / 剧集（聚合已启用片源）';
    var bGo = el('button', 'sfv-browse-search-btn', '搜索');
    bGo.type = 'button';
    var submit = function () { doSearch((searchInput.value || '').trim()); };
    bGo.addEventListener('click', submit);
    searchInput.addEventListener('keydown', function (ev) {
      if (ev && (ev.key === 'Enter' || ev.keyCode === 13)) submit();
    });
    srch.appendChild(searchInput); srch.appendChild(bGo);

    noteEl = el('div', 'sfv-browse-note');
    bodyEl = el('div', 'sfv-browse-body');

    overlay.appendChild(headEl);
    overlay.appendChild(srch);
    overlay.appendChild(noteEl);
    overlay.appendChild(bodyEl);
    (doc.body || doc.documentElement).appendChild(overlay);

    // 切回音乐态自动隐藏，避免残留（spacechange 由 state.js 在 window 上派发）
    if (global.addEventListener) {
      global.addEventListener(SFV.state && SFV.state.EVENT ? SFV.state.EVENT : 'spacechange', function (ev) {
        var mode = ev && ev.detail ? ev.detail.spaceMode : (isVideoSpace() ? 'video' : 'music');
        if (mode !== 'video' && isOpen()) close();
      });
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
    if (!isVideoSpace() && SFV.state && SFV.state.setSpace) SFV.state.setSpace('video');
    stack = [];
    if (opts.mode === 'category' && opts.field) {
      pushView({ mode: 'category', field: opts.field });
    } else {
      pushView({ mode: 'search' });
    }
    overlay.classList.add('sfv-show');
    if (searchInput && searchInput.focus) { try { searchInput.focus(); } catch (e) {} }
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('sfv-show');
    stack = []; current = null;
  }
  function isOpen() { return !!(overlay && overlay.classList.contains('sfv-show')); }

  function openCategory(field) { open({ mode: 'category', field: field }); }
  function openSearch() { open({ mode: 'search' }); }

  // ---------------------------------------------------------------- 视图栈
  function pushView(v) { stack.push(v); render(stack[stack.length - 1]); }
  function goBack() {
    if (stack.length <= 1) { close(); return; }
    stack.pop();
    render(stack[stack.length - 1]);
  }

  function render(v) {
    current = v;
    backBtn.style.visibility = stack.length > 1 ? 'visible' : 'hidden';
    bodyEl.innerHTML = '';
    setNote('');
    if (v.mode === 'search') renderSearch(v);
    else if (v.mode === 'category') renderCategory(v);
    else if (v.mode === 'detail') renderDetail(v);
  }

  function setNote(msg) {
    if (!msg) { noteEl.style.display = 'none'; noteEl.textContent = ''; return; }
    noteEl.style.display = 'block';
    noteEl.textContent = msg;
  }

  // ---------------------------------------------------------------- 搜索
  function renderSearch(v) {
    titleEl.textContent = '在线搜索';
    if (!hasSources()) {
      setNote('尚未添加任何片源。请点击右上角「片源」，在「视觉控制台 → 片源」中导入一个 CMS10 接口（如苹果 CMS V10）。');
    }
    if (v.query) {
      var hint = el('div', 'sfv-browse-sub', '搜索：“' + esc(v.query) + '”');
      bodyEl.appendChild(hint);
    }
    if (v.items) renderGrid(v.items, v);
    else if (v.query && v.items === null) {
      setNote('没有找到相关结果。');
    }
  }

  function doSearch(kw) {
    if (!kw) return;
    if (!hasSources()) { setNote('请先在「片源」中添加并启用一个 CMS10 接口。'); return; }
    busy = true;
    setNote('搜索中…');
    var view = { mode: 'search', query: kw, items: undefined };
    // 用栈顶覆盖，保持返回语义
    stack[stack.length - 1] = view; current = view;
    SFV.sources.search(kw, { timeout: 12000 }).then(function (res) {
      busy = false;
      if (!isOpen() || current !== view) return; // 已被用户切换
      if (res.noSource) { setNote('没有可用片源。'); view.items = []; bodyEl.innerHTML = ''; return; }
      if (res.errors && res.errors.length && (!res.items || !res.items.length)) {
        setNote('搜索失败：' + res.errors.map(function (e) { return e.name + '(' + (e.reason || '错误') + ')'; }).join('、'));
      } else if (res.errors && res.errors.length) {
        setNote('部分片源不可用：' + res.errors.map(function (e) { return e.name; }).join('、'));
      } else {
        setNote('');
      }
      view.items = res.items || [];
      bodyEl.innerHTML = '';
      if (current === view) renderGrid(view.items, view);
    }).catch(function (err) {
      busy = false;
      if (!isOpen() || current !== view) return;
      setNote('搜索出错：' + (err && err.message ? err.message : '未知错误'));
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
        img.addEventListener('error', function () { cover.textContent = '🎬'; });
        cover.appendChild(img);
      } else {
        cover.textContent = '🎬';
      }
      var name = el('div', 'sfv-card-name', it.title || '未命名');
      var sub = el('div', 'sfv-card-sub', (it.year ? it.year + ' · ' : '') + (it.variants && it.variants.length > 1 ? it.variants.length + ' 个来源' : '点击查看'));
      card.appendChild(cover); card.appendChild(name); card.appendChild(sub);
      card.addEventListener('click', function () { openDetail(it); });
      grid.appendChild(card);
    });
    bodyEl.appendChild(grid);
  }

  // ---------------------------------------------------------------- 详情 + 剧集
  function openDetail(item) {
    var firstVar = (item.variants && item.variants[0]) || null;
    if (!firstVar) { toast('该结果缺少来源信息。'); return; }
    var vodKey = firstVar.key || (firstVar.sourceId + ':' + firstVar.vodId);
    var src = sourceById(firstVar.sourceId);
    var vodId = firstVar.vodId;
    if (!src || vodId == null) { toast('片源不可用，可能已被移除。'); return; }
    recordMeta({ key: vodKey, title: item.title, pic: item.pic, year: item.year, sourceId: src.id, vodId: vodId });
    var view = { mode: 'detail', key: vodKey, title: item.title, pic: item.pic, year: item.year, source: src, vodId: vodId };
    pushView(view);
    loadDetail(view);
  }

  // 从四类列表点击元数据进入详情（元数据可能不含完整 variants，需要重新请求）
  function openDetailFromMeta(meta) {
    var src = meta.sourceId ? sourceById(meta.sourceId) : null;
    if (!src || meta.vodId == null) {
      // 本地/直链条目：直接打开
      if (meta.key && meta.key.indexOf('url:') === 0) {
        if (SFV.source) SFV.source.open(meta.key.slice(4));
        else if (SFV.player) SFV.player.openUrl(meta.key.slice(4));
      } else if (meta.key && meta.key.indexOf('file:') === 0) {
        toast('本地文件需重新选择');
        if (SFV.player) SFV.player.openFilePicker();
      } else {
        toast('该条目来源已失效，无法打开。');
      }
      return;
    }
    var item = { key: meta.key, title: meta.title, pic: meta.pic, year: meta.year, vodId: meta.vodId, variants: [{ sourceId: src.id, vodId: meta.vodId }] };
    openDetail(item);
  }

  function loadDetail(view) {
    bodyEl.innerHTML = '';
    setNote('加载详情中…');
    SFV.sources.detail(view.source, view.vodId, 12000).then(function (res) {
      if (!isOpen() || current !== view) return;
      if (!res.ok) { setNote('详情加载失败：' + (res.reason || '未知')); return; }
      view.plays = res.plays || [];
      renderDetail(view);
    }).catch(function (err) {
      if (!isOpen() || current !== view) return;
      setNote('详情加载出错：' + (err && err.message ? err.message : '未知'));
    });
  }

  function renderDetail(view) {
    setNote('');
    titleEl.textContent = view.title || '详情';

    // 头部：封面 + 标题 + 心动/片单/收藏 切换
    var head = el('div', 'sfv-detail-head');
    var cover = el('div', 'sfv-detail-cover');
    if (view.pic) {
      var img = el('img', 'sfv-detail-img'); img.src = view.pic; img.alt = view.title || '';
      img.addEventListener('error', function () { cover.textContent = '🎬'; });
      cover.appendChild(img);
    } else cover.textContent = '🎬';
    var info = el('div', 'sfv-detail-info');
    info.appendChild(el('div', 'sfv-detail-title', view.title || '未命名'));
    if (view.year) info.appendChild(el('div', 'sfv-detail-year', '年份：' + view.year));
    var flagRow = el('div', 'sfv-detail-flags');
    ['liked', 'inList', 'faved'].forEach(function (f) {
      var b = el('button', 'sfv-flag-btn', CATEGORY_META[f].label);
      b.type = 'button';
      b.setAttribute('data-flag', f);
      paintFlag(b, view.key, f);
      b.addEventListener('click', function () {
        if (!SFV.model) return;
        var f2 = b.getAttribute('data-flag');
        SFV.model.toggleFlag(view.key, f2);
        paintFlag(b, view.key, f2);
      });
      flagRow.appendChild(b);
    });
    info.appendChild(flagRow);
    head.appendChild(cover); head.appendChild(info);
    bodyEl.appendChild(head);

    // 剧集
    if (!view.plays || !view.plays.length) {
      bodyEl.appendChild(el('div', 'sfv-browse-sub', '暂无可播放的剧集（源未提供播放地址）。'));
      return;
    }
    view.plays.forEach(function (play, pi) {
      var grp = el('div', 'sfv-ep-group');
      grp.appendChild(el('div', 'sfv-ep-from', play.from || ('线路' + (pi + 1))));
      var list = el('div', 'sfv-ep-list');
      (play.episodes || []).forEach(function (ep) {
        var eb = el('button', 'sfv-ep', ep.name || ('第' + (ep.index + 1) + '集'));
        eb.type = 'button';
        var prog = SFV.model ? SFV.model.getProgress(view.key + ':' + ep.index) : null;
        if (prog && prog.position) {
          eb.classList.add('sfv-ep-done');
          eb.textContent = (ep.name || ('第' + (ep.index + 1) + '集')) + ' ✓';
        }
        eb.addEventListener('click', function () { playEpisode(view, ep); });
        list.appendChild(eb);
      });
      grp.appendChild(list);
      bodyEl.appendChild(grp);
    });
  }

  function paintFlag(btn, key, field) {
    if (!SFV.model) return;
    var on = !!SFV.model.getFlag(key)[field];
    btn.classList.toggle('on', on);
  }

  function playEpisode(view, ep) {
    if (!ep || !ep.url) { toast('该集无播放地址'); return; }
    var id = view.source.id + ':' + view.vodId + ':' + ep.index;
    var title = (view.title || '影片') + ' · ' + (ep.name || ('第' + (ep.index + 1) + '集'));
    recordMeta({ key: view.key, title: view.title, pic: view.pic, year: view.year, sourceId: view.source.id, vodId: view.vodId });
    recordHistory({ key: id, title: title, pic: view.pic, year: view.year, sourceId: view.source.id, vodId: view.vodId });
    // 经 source-adapter：跨域直链自动走 /api/proxy；进度键锚定 站点:vod:集数
    if (SFV.source) SFV.source.open({ url: ep.url, title: title, id: id });
    else if (SFV.player) SFV.player.openUrl(ep.url, { id: id, title: title });
    // 关闭浏览层，露出播放器全屏弹层
    close();
  }

  // ---------------------------------------------------------------- 四类列表
  function renderCategory(v) {
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
        var img = el('img', 'sfv-card-img'); img.src = it.pic; img.alt = it.title || ''; img.loading = 'lazy';
        img.addEventListener('error', function () { cover.textContent = '🎬'; });
        cover.appendChild(img);
      } else cover.textContent = '🎬';
      var name = el('div', 'sfv-card-name', it.title || '未命名');
      var sub = el('div', 'sfv-card-sub', v.field === 'history' ? fmtAgo(it.ts) : (it.year || ''));
      card.appendChild(cover); card.appendChild(name); card.appendChild(sub);
      card.addEventListener('click', function () { openDetailFromMeta(it); });
      grid.appendChild(card);
    });
    bodyEl.appendChild(grid);
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
    if (typeof global.toggleFxPanel === 'function') {
      try { global.toggleFxPanel(true); } catch (e) {}
    }
    if (typeof global.setFxPanelTab === 'function') {
      try { global.setFxPanelTab('sfvsource'); } catch (e) {}
    }
  }

  SFV.online = {
    open: open,
    close: close,
    isOpen: isOpen,
    openCategory: openCategory,
    openSearch: openSearch,
    openLocal: openLocal,
    openUrlPrompt: openUrlPrompt,
    openSources: openSources,
  };
})(typeof window !== 'undefined' ? window : this);
