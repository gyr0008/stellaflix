/*
 * Stellaflix 影视模块 — 浏览厅 (hall) 编排
 *
 * 入口：影视首页「心动」卡 → SFV.hall.enter()。
 * 渲染：SFV.coverFlow（纯 CSS 3D，移植自 cover-flow-showcase），不依赖 Three.js。
 * 布局：3D 卡片区(stage) + 一句描述(desc) + 底部玻璃胶囊控制栏(dock)。
 * 控制栏 7 控件：◀上一个 / 分类tab / 沉浸切换(空壳) / ▶播放 / 追片状态 / 片单 / ▶下一个。
 * ESC：弹窗开则先关弹窗，否则退厅（还原音乐架）。
 *
 * 铁律：零业务逻辑进 index.html；本模块仅提供 SFV.hall.* 与最小 DOM/事件接线。
 * 单文件 ≤ 500 行。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  // ---- 分类（映射 TMDB 加载器）----
  // TMDB genre IDs: 16=Animation(动画), 99=Documentary(纪录片)
  // "电影"分类排除动画(genre 16)，避免 popular 返回的热门动画混入。
  var CATEGORIES = [
    { key: 'movie',       label: '电影',   icon: '🎬', loader: function (p) { return SFV.tmdb.popular('movie', p).then(function (arr) { return (arr || []).filter(function (it) { return !(it.genreIds && it.genreIds.indexOf(16) >= 0); }); }); } },
    { key: 'documentary', label: '纪录片', icon: '🎞', loader: function (p) { return SFV.tmdb.discover({ with_genres: '99', sort_by: 'popularity.desc', page: p }); } },
    { key: 'animation',   label: '动画',   icon: '✏', loader: function (p) { return SFV.tmdb.discover({ with_genres: '16', sort_by: 'popularity.desc', page: p }); } },
    { key: 'anime',       label: '动漫',   icon: '🌸', loader: function (p) { return SFV.tmdb.popular('anime', p); } }
  ];

  // ---- 追片状态（emoji + 文字标签消歧）----
  var FOLLOW_STATES = [
    { key: '',         emoji: '❤', label: '追片' },
    { key: 'follow',   emoji: '❤', label: '追片' },
    { key: 'watching', emoji: '👁', label: '在看' },
    { key: 'continue', emoji: '⏭', label: '续看' },
    { key: 'skip',     emoji: '⏭', label: '跳过' }
  ];
  function followKey(item) { return 'stellaflix:follow:' + (item && item.id); }
  function getFollow(item) {
    if (!item) return '';
    try {
      var v = global.localStorage.getItem(followKey(item));
      return v || '';
    } catch (e) { return ''; }
  }
  function setFollow(item, key) {
    if (!item) return;
    try {
      if (key) global.localStorage.setItem(followKey(item), key);
      else global.localStorage.removeItem(followKey(item));
    } catch (e) {}
  }
  function nextFollow(key) {
    var idx = 0;
    for (var i = 0; i < FOLLOW_STATES.length; i++) if (FOLLOW_STATES[i].key === key) { idx = i; break; }
    return FOLLOW_STATES[(idx + 1) % FOLLOW_STATES.length].key;
  }
  function followMeta(key) {
    for (var i = 0; i < FOLLOW_STATES.length; i++) if (FOLLOW_STATES[i].key === key) return FOLLOW_STATES[i];
    return FOLLOW_STATES[0];
  }

  // ---- 状态 ----
  var active = false;
  var root = null;          // .sfv-hall 根
  var stageEl = null;       // .sfv-hall-stage（cover-flow 挂载）
  var descEl = null;        // .sfv-hall-desc
  var dockEl = null;        // .sfv-hall-dock
  var followBtn = null;
  var tabEls = {};
  var statusEl = null;
  var prevShelfMode = null;
  var keyHandler = null;
  var curCategory = CATEGORIES[0].key;
  var curItem = null;

  function d() { return global.document; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isVideo() { return !!(SFV.state && SFV.state.isVideo && SFV.state.isVideo()); }

  function toast(msg) {
    var doc = d(); if (!doc) return;
    var t = doc.createElement('div');
    t.className = 'sfv-toast'; t.textContent = msg;
    (doc.body || doc.documentElement).appendChild(t);
    global.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }
  function showStatus(msg) {
    var doc = d(); if (!doc) return;
    if (!statusEl) {
      statusEl = doc.createElement('div');
      statusEl.className = 'sfv-hall-status';
      (doc.body || doc.documentElement).appendChild(statusEl);
    }
    statusEl.textContent = msg; statusEl.classList.add('show');
  }
  function hideStatus() { if (statusEl) statusEl.classList.remove('show'); }

  // ---- 构建 DOM ----
  function build() {
    var doc = d();
    root = doc.createElement('div');
    root.className = 'sfv-hall';
    root.setAttribute('aria-hidden', 'false');

    // 3D 卡片区
    stageEl = doc.createElement('div');
    stageEl.className = 'sfv-hall-stage';
    root.appendChild(stageEl);

    // 一句描述
    descEl = doc.createElement('div');
    descEl.className = 'sfv-hall-desc';
    root.appendChild(descEl);

    // 底部玻璃胶囊控制栏
    dockEl = doc.createElement('div');
    dockEl.className = 'sfv-hall-dock';

    var prev = dockBtn('◀', '上一个', function () { if (SFV.coverFlow) SFV.coverFlow.prev(); });
    dockEl.appendChild(prev);

    // 分类 tab 图标组
    var tabs = doc.createElement('div');
    tabs.className = 'sfv-hall-dock-tabs';
    tabEls = {};
    CATEGORIES.forEach(function (cat) {
      var t = doc.createElement('button');
      t.type = 'button';
      t.className = 'sfv-hall-dock-tab';
      t.setAttribute('data-key', cat.key);
      t.title = cat.label;
      t.textContent = cat.icon;
      t.addEventListener('click', function () { setTab(cat.key); });
      tabs.appendChild(t);
      tabEls[cat.key] = t;
    });
    dockEl.appendChild(tabs);

    // 沉浸切换（空壳：toggle 隐藏 desc+dock）
    var immer = dockBtn('⟲', '沉浸模式', function () {
      if (global.document && global.document.body) {
        global.document.body.classList.toggle('sfv-hall-immersive');
      }
    });
    dockEl.appendChild(immer);

    // ▶ 开始播放
    var play = dockBtn('▶', '播放', function () { if (curItem) openPoster(curItem); });
    dockEl.appendChild(play);

    // ❤ 追片状态
    followBtn = doc.createElement('button');
    followBtn.type = 'button';
    followBtn.className = 'sfv-hall-dock-btn sfv-hall-follow';
    followBtn.addEventListener('click', onFollowClick);
    dockEl.appendChild(followBtn);

    // ☰ 片单
    var list = dockBtn('☰', '片单', function () { addToPlaylist(curItem); });
    dockEl.appendChild(list);

    var next = dockBtn('▶', '下一个', function () { if (SFV.coverFlow) SFV.coverFlow.next(); });
    dockEl.appendChild(next);

    root.appendChild(dockEl);
    (doc.body || doc.documentElement).appendChild(root);
  }

  function dockBtn(icon, label, handler) {
    var doc = d();
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'sfv-hall-dock-btn';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.textContent = icon;
    b.addEventListener('click', handler);
    return b;
  }

  function setActiveTab(key) {
    for (var k in tabEls) {
      if (tabEls.hasOwnProperty(k)) {
        if (k === key) tabEls[k].classList.add('active'); else tabEls[k].classList.remove('active');
      }
    }
  }

  function updateDesc(item) {
    curItem = item;
    if (!descEl) return;
    if (!item) { descEl.innerHTML = ''; return; }
    var title = esc(item.title || '');
    var ov = (item.overview || '').trim();
    if (ov.length > 46) ov = ov.substring(0, 45) + '…';
    descEl.innerHTML = '<span class="sfv-hall-desc-title">《' + title + '》</span>' +
      (ov ? '<span class="sfv-hall-desc-ov">' + esc(ov) + '</span>' : '');
    updateFollowBtn(item);
  }

  function updateFollowBtn(item) {
    if (!followBtn) return;
    var meta = followMeta(getFollow(item));
    followBtn.innerHTML = '<span class="emoji">' + meta.emoji + '</span><span class="lbl">' + meta.label + '</span>';
    followBtn.classList.toggle('on', !!getFollow(item));
  }

  function onFollowClick() {
    if (!curItem) return;
    var nk = nextFollow(getFollow(curItem));
    setFollow(curItem, nk);
    updateFollowBtn(curItem);
    var meta = followMeta(nk);
    toast(meta.key ? ('已标记「' + meta.label + '」') : '已清除追片状态');
  }

  function addToPlaylist(item) {
    if (!item) return;
    var view = {
      id: item.id, key: item.id, mediaType: item.mediaType || curCategory,
      title: item.title, year: item.year, poster: item.poster, pic: item.poster,
      rating: item.rating || 0, overview: item.overview || ''
    };
    if (SFV.online && SFV.online.showPickFolderDialog) SFV.online.showPickFolderDialog(view);
    else toast('片单功能不可用');
  }

  // ---- 进入 / 退出 ----
  function enter() {
    if (active) return;
    if (!isVideo() && SFV.state && SFV.state.setSpace) SFV.state.setSpace('video');
    active = true;

    if (global.shelfManager && global.shelfManager.getMode) {
      try { prevShelfMode = global.shelfManager.getMode(); } catch (e) { prevShelfMode = 'stage'; }
    }
    if (global.setShelfMode) { try { global.setShelfMode('off'); } catch (e) {} }

    build();
    setActiveTab(curCategory);
    if (global.document && global.document.body) global.document.body.classList.add('sfv-hall-active');

    if (SFV.coverFlow && SFV.coverFlow.mount) {
      SFV.coverFlow.mount(stageEl, {
        loadItems: function (p) { return CATEGORIES.filter(function (c) { return c.key === curCategory; })[0].loader(p); },
        onSelect: function (item) { openPoster(item); },
        onActiveChange: function (item) { updateDesc(item); }
      });
    }

    keyHandler = function (e) {
      if (!e) return;
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (SFV.sourcePicker && SFV.sourcePicker.isOpen && SFV.sourcePicker.isOpen()) SFV.sourcePicker.close();
        else exit();
      }
    };
    if (global.addEventListener) global.addEventListener('keydown', keyHandler, true);
  }

  function exit() {
    if (!active) return;
    // 连线：保存当前中心海报到 localStorage → 首页心动卡右侧展示
    if (curItem && curItem.poster) {
      try {
        global.localStorage.setItem('stellaflix:hall:lastPoster', JSON.stringify({
          poster: curItem.poster,
          title: curItem.title || '',
          id: curItem.id || '',
          ts: Date.now()
        }));
      } catch (e) {}
    }
    active = false;
    if (SFV.coverFlow && SFV.coverFlow.destroy) SFV.coverFlow.destroy();
    if (SFV.sourcePicker && SFV.sourcePicker.isOpen && SFV.sourcePicker.isOpen()) SFV.sourcePicker.close();
    if (global.setShelfMode) { try { global.setShelfMode(prevShelfMode || 'stage'); } catch (e) {} }
    if (global.scheduleShelfRebuild) { try { global.scheduleShelfRebuild('sfv-hall-exit', true); } catch (e) {} }
    if (global.document && global.document.body) {
      global.document.body.classList.remove('sfv-hall-active');
      global.document.body.classList.remove('sfv-hall-immersive');
    }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null; stageEl = null; descEl = null; dockEl = null; followBtn = null; tabEls = {};
    if (keyHandler && global.removeEventListener) global.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
  }

  function setTab(key) {
    curCategory = key;
    setActiveTab(key);
    if (SFV.coverFlow && SFV.coverFlow.destroy) SFV.coverFlow.destroy();
    if (stageEl && SFV.coverFlow && SFV.coverFlow.mount) {
      SFV.coverFlow.mount(stageEl, {
        loadItems: function (p) { return CATEGORIES.filter(function (c) { return c.key === key; })[0].loader(p); },
        onSelect: function (item) { openPoster(item); },
        onActiveChange: function (item) { updateDesc(item); }
      });
    }
  }

  // ---- 点海报：并行搜 CMS10 + Kazumi → 单源直播 / 多源弹窗 / 无果 toast ----
  function openPoster(item) {
    if (!item) return;
    var title = (item.title || '').trim();
    if (!title) { toast('该影片缺少标题，无法搜索播放源'); return; }
    showStatus('正在搜索播放源：' + title);
    var cmsP = (SFV.sources && SFV.sources.search) ? SFV.sources.search(title, { timeout: 12000 }) : Promise.resolve({ items: [], errors: [], noSource: true });
    var kzP = (SFV.kazumi && SFV.kazumi.search) ? SFV.kazumi.search(title) : Promise.resolve({ items: [], errors: [] });
    Promise.all([cmsP, kzP]).then(function (arr) {
      var cms = arr[0] || { items: [] };
      var kz = arr[1] || { items: [] };
      var candidates = [];
      (cms.items || []).forEach(function (it) {
        var variants = (it.variants && it.variants.length) ? it.variants : [it];
        variants.forEach(function (v) {
          candidates.push({
            id: 'cms:' + (v.sourceId || '') + ':' + (v.vodId || ''),
            label: (v.sourceName || v.sourceId || 'CMS') + (v.remarks ? ' · ' + v.remarks : ''),
            sub: it.title + (it.year ? ' (' + it.year + ')' : ''),
            kind: 'cms', _ref: v
          });
        });
      });
      (kz.items || []).forEach(function (it) {
        candidates.push({
          id: 'kz:' + (it.ruleName || '') + ':' + (it.src || ''),
          label: (it.ruleName || 'Kazumi'), sub: it.title || title, kind: 'kazumi', _ref: it
        });
      });
      if (!candidates.length) { hideStatus(); toast('未找到「' + title + '」的可用播放源'); return; }
      if (candidates.length === 1) { playCandidate(candidates[0], item); return; }
      hideStatus();
      if (SFV.sourcePicker && SFV.sourcePicker.open) {
        SFV.sourcePicker.open({ title: title, poster: item.poster, candidates: candidates, onPick: function (c) { playCandidate(c, item); } });
      } else { playCandidate(candidates[0], item); }
    }).catch(function (err) {
      hideStatus(); toast('搜索播放源出错：' + (err && err.message ? err.message : '未知错误'));
    });
  }

  // ---- 候选 → 解析剧集 → playEpisode（播放前退厅）----
  function playCandidate(c, item) {
    if (!c) return;
    hideStatus();
    if (c.kind === 'kazumi') {
      var ref = c._ref;
      toast('正在解析 Kazumi 源…');
      if (!SFV.kazumi || !SFV.kazumi.getChapters) { toast('Kazumi 不可用'); return; }
      SFV.kazumi.getChapters(ref.ruleName, ref.src).then(function (res) {
        var plays = (res && res.plays) || [];
        var chosen = plays[0];
        var episodes = (chosen && chosen.episodes) || [];
        if (!episodes.length) { toast('该源无可播放剧集'); return; }
        var view = {
          key: 'kazumi:' + (ref.ruleName || '') + ':' + (ref.src || ''),
          title: (item && item.title) || ref.title || c.label,
          pic: (item && item.poster) || ref.pic || '',
          year: (item && item.year) || '',
          source: { id: 'kazumi:' + (ref.ruleName || ''), name: ref.ruleName || 'Kazumi' },
          vodId: ref.src, isKazumi: true, ruleName: ref.ruleName
        };
        doPlay(view, episodes[0], episodes);
      }).catch(function (e) { toast('Kazumi 解析失败：' + (e && e.message ? e.message : '')); });
    } else {
      var v = c._ref;
      toast('正在获取播放地址…');
      if (!SFV.sources || !SFV.sources.detail) { toast('CMS 不可用'); return; }
      SFV.sources.detail(v.sourceId, v.vodId).then(function (res) {
        if (!res || !res.ok || !res.plays || !res.plays.length) { toast('该源无播放地址'); return; }
        var view = {
          key: (v.sourceId || '?') + ':' + (v.vodId || ''),
          title: (item && item.title) || v.title || c.label,
          pic: (item && item.poster) || v.pic || '',
          year: (item && item.year) || v.year || '',
          source: { id: v.sourceId, name: v.sourceName }, vodId: v.vodId
        };
        doPlay(view, res.plays[0], res.plays);
      }).catch(function (e) { toast('获取播放地址失败：' + (e && e.message ? e.message : '')); });
    }
  }

  function doPlay(view, ep, episodes) {
    exit();
    if (SFV.online && SFV.online.playEpisode) SFV.online.playEpisode(view, ep, { episodes: episodes });
    else if (SFV.player && SFV.player.openUrl) SFV.player.openUrl(ep.url, { title: view.title, id: view.key });
    else toast('播放器不可用');
  }

  SFV.hall = {
    enter: enter, exit: exit,
    isActive: function () { return active; },
    openPoster: openPoster,
    setTab: setTab
  };
})(typeof window !== 'undefined' ? window : this);
