/*
 * Stellaflix 影视模块 — 影视态首页 (Step 3)
 *
 * 双态同构：复用音乐态既有 DOM（#empty-home 内的 5 张 .home-card 与 #home-tile-row 海报轨），
 *   影视态下改写其文案/封面并接管点击；切回音乐态时交还给 renderHomeDiscover() 权威重渲。
 *   严格铁律：T118 修复后切回音乐态必须 100% 还原所有 home.js 在影视态改写过的元素。
 *
 * 关键设计（均针对真实代码约束）：
 *   1) 卡片按钮带内联 onclick="playHomeSong(0)" 等音乐逻辑 —— 影视态在 .home-grid 上用
 *      **捕获阶段** stopPropagation 拦截，事件到不了 target，内联处理器不会执行。
 *      这样无需增删 onclick 属性，切回音乐态零残留。
 *   2) index.html 的 renderHomeDiscover() 有 13 处调用点，影视态需在其入口早退（守卫已加），
 *      否则任一音乐事件都会把影视文案覆写回去。
 *   3) Electron 下 window.prompt 不可用，故自建极简 URL 输入条，不依赖 prompt。
 *
 * 合规：不预置任何在线片源，仅提供「用户自行选择本地文件 / 自行粘贴地址」两条入口。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var SLOT = 'home';
  var gridBound = false, railBound = false;
  var urlBar = null;

  // T118 修复（P0）：音乐态基线快照
  // 背景：之前 restoreMusic() 只调用 renderHomeDiscover() 试图还原，
  //   但 home.js 在影视态改写过的 home-poster-title / quote、5 个匿名 .home-card-label、
  //   #home-tile-row 整体、#home-rail-title/note、#sfv-tmdb-attrib、#sfv-back-to-music、
  //   #sfv-urlbar 等元素，renderHomeDiscover() 都没有还原代码 —— 切回音乐态时残留影视态文案。
  //   30 分钟后再切换会再次复现，让用户感觉"两个空间混在一起"。
  // 修复：install() 阶段拍一次音乐态基线（textContent / onclick / display），
  //   restoreMusic() 整体回滚基线后，再交给 renderHomeDiscover() 重建动态数据（封面/标题等）。
  // 严格铁律：双态独立 —— 任一态的 DOM 改写必须能在切回时 100% 还原，不允许残留。
  var MUSIC_SNAP_KEY = '__sfv_music_home_snapshot__';
  var musicSnap = null;

  function d() { return global.document; }
  function $(sel) { var doc = d(); return doc && doc.querySelector ? doc.querySelector(sel) : null; }
  function $all(sel) {
    var doc = d();
    if (!doc || !doc.querySelectorAll) return [];
    return Array.prototype.slice.call(doc.querySelectorAll(sel));
  }
  function isVideoSpace() { return !!(SFV.state && SFV.state.isVideo()); }

  function fmtTime(sec) {
    sec = Math.max(0, sec | 0);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h) return h + '小时' + (m ? m + '分' : '');
    return m ? m + '分钟' : (sec + '秒');
  }

  // ---- 最近观看：取 progress 表里 updatedAt 最大的一条 ----
  function latestProgress() {
    if (!SFV.model) return null;
    var lib = SFV.model.getLibrary() || [];
    var best = null;
    for (var i = 0; i < lib.length; i++) {
      var p = SFV.model.getProgress(lib[i].id);
      if (!p) continue;
      if (!best || (p.updatedAt || 0) > (best.progress.updatedAt || 0)) {
        best = { item: lib[i], progress: p };
      }
    }
    return best;
  }

  // ---- 影视态五卡（对齐音乐态 LIBRARY/DAILY/SONG/CONTINUE/VIDEO 布局）：
  //   label 英文（LIKED / LISTS / TRACKING / HISTORY / MUSIC），title 保留中文（心动/片单/追片/历史/音乐空间）
  //   顺序对应 DOM 中前 5 张 .home-card（index.html L2301~2330）。
  //   本地影片 / 网络地址 / 片源管理 入口迁移至 SFV.online 浏览层，首页不再承载（#19）。
  //   T112/T118：第 5 张固定为"音乐空间/返回音乐空间"入口（label=MUSIC），不与第 5 张 home-card 数据耦合。
  function cardDefs() {
    var M = SFV.model || {};
    var count = function (arr) { return (arr && arr.length) || 0; };
    var likedN = M.getKeysByFlag ? count(M.getKeysByFlag('liked')) : 0;
    var listN = M.getKeysByFlag ? count(M.getKeysByFlag('inList')) : 0;
    var trackN = M.getTrackCount ? count(M.getTrackCount()) : 0;
    var histN = M.getHistory ? count(M.getHistory()) : 0;

    return [
      {
        label: 'LIKED', title: '心动', sub: likedN ? ('已心动 ' + likedN + ' 部') : '进入浏览厅 · 挑片即看',
        flag: 'liked',
        action: function () { if (SFV.hall) SFV.hall.enter(); },
      },
      {
        label: 'LISTS', title: '片单', sub: listN ? ('片单 ' + listN + ' 部') : '想看的全放进来',
        flag: null,
        action: function () { if (SFV.online && SFV.online.openCollections) SFV.online.openCollections(); },
      },
      {
        label: 'TRACKING', title: '追片', sub: trackN ? ('在追 ' + trackN + ' 部') : '标记想看的片子',
        flag: 'track',
        action: function () { if (SFV.online) SFV.online.openCategory('track'); },
      },
      {
        label: 'HISTORY', title: '历史', sub: histN ? ('最近观看 ' + histN + ' 部') : '看过的会记在这里',
        flag: 'history',
        action: function () { if (SFV.online) SFV.online.openCategory('history'); },
      },
      {
        label: 'MUSIC', title: '音乐空间', sub: '返回音乐空间 · 听歌',
        flag: 'music-space',
        action: function () { if (SFV.state && SFV.state.setSpace) SFV.state.setSpace('music'); },
      },
    ];
  }

  function setCardText(card, def) {
    var l = card.querySelector('.home-card-label');
    var t = card.querySelector('.home-card-title');
    var s = card.querySelector('.home-card-sub');
    if (l) l.textContent = def.label;
    if (t) t.textContent = def.title;
    if (s) s.textContent = def.sub;
  }

  // T119-ext：读取音乐态左侧个人海报（跨态连线：影视态「音乐空间」卡展示音乐态海报）
  //   来源：① index.html 全局 homePosterState.image（运行时）② localStorage 持久化（兜底）
  //   与影视态 posterStore 完全独立，互不影响。
  function getMusicLeftPoster() {
    try {
      if (typeof global.homePosterState === 'object' && global.homePosterState && global.homePosterState.image) {
        return global.homePosterState.image;
      }
      if (global.localStorage) {
        var raw = global.localStorage.getItem('stellaflix-home-personal-poster-v1');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.image) return parsed.image;
        }
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  // T119：设置 home-card 的 .home-card-art 背景图（按各自 flag 类最新一条的 pic）
  function setCardArt(card, flag) {
    if (!card) return;
    var art = card.querySelector('.home-card-art');
    if (!art) return;
    var pic = '';
    if (flag === 'music-space') {
      // 跨态连线：音乐空间卡展示音乐态左侧个人海报
      pic = getMusicLeftPoster();
    } else if (flag === 'liked') {
      // 连线：心动卡右侧展示浏览厅退出时的中心海报（localStorage 覆写=自动销毁旧图）
      try {
        var raw = global.localStorage.getItem('stellaflix:hall:lastPoster');
        if (raw) { var parsed = JSON.parse(raw); if (parsed && parsed.poster) pic = parsed.poster; }
      } catch (e) {}
      // 无浏览厅海报时 fallback 到 model liked 数据
      if (!pic && SFV.model) {
        try {
          var keys = (SFV.model.getKeysByFlag && SFV.model.getKeysByFlag('liked')) || [];
          var lpool = [];
          keys.forEach(function (k) {
            var m = SFV.model.getMeta && SFV.model.getMeta(k);
            if (m && m.pic) lpool.push(m.pic);
          });
          if (lpool.length) pic = lpool[lpool.length - 1];
        } catch (e2) {}
      }
    } else if (SFV.model && flag) {
      try {
        var pool = [];
        if (flag === 'history') {
          var h = (SFV.model.getHistory && SFV.model.getHistory()) || [];
          for (var i = 0; i < h.length; i++) if (h[i] && h[i].pic) pool.push({ ts: h[i].ts || 0, pic: h[i].pic });
        } else if (flag === 'track') {
          var tk = (SFV.model.getTrackKeys && SFV.model.getTrackKeys()) || [];
          var thist = (SFV.model.getHistory && SFV.model.getHistory()) || [];
          tk.forEach(function (k) {
            var m = SFV.model.getMeta && SFV.model.getMeta(k);
            if (m && m.pic) {
              var ts = 0;
              for (var j = 0; j < thist.length; j++) if (thist[j].key === k) { ts = thist[j].ts || 0; break; }
              pool.push({ ts: ts, pic: m.pic });
            }
          });
        } else {
          var keys = (SFV.model.getKeysByFlag && SFV.model.getKeysByFlag(flag)) || [];
          keys.forEach(function (k) {
            var m = SFV.model.getMeta && SFV.model.getMeta(k);
            if (m && m.pic) {
              // 用 history 里的 ts 兜底
              var h = (SFV.model.getHistory && SFV.model.getHistory()) || [];
              var ts = 0;
              for (var j = 0; j < h.length; j++) if (h[j].key === k) { ts = h[j].ts || 0; break; }
              pool.push({ ts: ts, pic: m.pic });
            }
          });
        }
        pool.sort(function (a, b) { return b.ts - a.ts; });
        if (pool.length) pic = pool[0].pic;
      } catch (e) { /* ignore */ }
    }
    if (pic) {
      art.style.backgroundImage = 'url("' + escAttr(pic) + '")';
      art.classList.add('has-cover');
    } else {
      art.style.backgroundImage = '';
      art.classList.remove('has-cover');
    }
  }

  // ---- 捕获阶段拦截：影视态下屏蔽卡片内联 onclick 的音乐逻辑 ----
  function bindGridCapture() {
    if (gridBound) return;
    var grid = $('#empty-home .home-grid');
    if (!grid || !grid.addEventListener) return;
    grid.addEventListener('click', function (ev) {
      if (!isVideoSpace()) return; // 音乐态完全不干预
      if (ev.stopPropagation) ev.stopPropagation();
      if (ev.preventDefault) ev.preventDefault();
      var cards = $all('#empty-home .home-grid .home-card');
      var node = ev.target, hit = -1;
      while (node && node !== grid) {
        var idx = cards.indexOf(node);
        if (idx >= 0) { hit = idx; break; }
        node = node.parentNode;
      }
      if (hit < 0) return;
      var defs = cardDefs();
      if (defs[hit] && defs[hit].action) defs[hit].action();
    }, true); // capture
    gridBound = true;
  }

  function bindRailCapture() {
    if (railBound) return;
    var row = d() && d().getElementById ? d().getElementById('home-tile-row') : null;
    if (!row || !row.addEventListener) return;
    row.addEventListener('click', function (ev) {
      if (!isVideoSpace()) return;
      if (ev.stopPropagation) ev.stopPropagation();
      if (ev.preventDefault) ev.preventDefault();
      var node = ev.target;
      while (node && node !== row) {
        // 接着看卡片：data-sfv-key → 从 history 取条目 → openDetailFromMeta 恢复播放
        var key = node.getAttribute && node.getAttribute('data-sfv-key');
        if (key) {
          resumeFromHistory(key);
          return;
        }
        // 兼容旧 data-sfv-id（片库条目）
        var id = node.getAttribute && node.getAttribute('data-sfv-id');
        if (id) {
          resumeById(id);
          return;
        }
        node = node.parentNode;
      }
    }, true);
    railBound = true;
  }

  // 从观看历史恢复播放（接着看卡片点击）
  function resumeFromHistory(key) {
    if (!key || !SFV.model) return;
    var history = SFV.model.getHistory() || [];
    var entry = null;
    for (var i = 0; i < history.length; i++) {
      if (history[i].key === key) { entry = history[i]; break; }
    }
    if (!entry) { toast('该记录已不存在'); return; }
    // 用 meta 信息打开详情/播放（openDetailFromMeta 支持 CMS/Kazumi/本地/URL 全类型）
    if (SFV.online && SFV.online.openDetailFromMeta) {
      SFV.online.openDetailFromMeta(entry);
    } else {
      toast('浏览模块未就绪');
    }
  }

  function resumeById(id) {
    var lib = (SFV.model && SFV.model.getLibrary()) || [];
    for (var i = 0; i < lib.length; i++) if (lib[i].id === id) return resumeItem(lib[i]);
    toast('该条目已不在片库中');
  }

  // 本地文件的 blob URL 会失效，无法静默续播 —— 如实提示重新选择，不假装能播。
  function resumeItem(item) {
    if (!item) return;
    if (item.source === 'url' && item.id.indexOf('url:') === 0) {
      var raw = item.id.slice(4);
      if (SFV.source) SFV.source.open(raw);
      else if (SFV.player) SFV.player.openUrl(raw);
      return;
    }
    toast('本地文件需重新选择：' + (item.title || ''));
    if (SFV.player) SFV.player.openFilePicker();
  }

  function scrollToRail() {
    var rail = $('#empty-home .home-rail');
    if (rail && rail.scrollIntoView) {
      try { rail.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { rail.scrollIntoView(); }
    }
  }

  // ---- 接着看：从观看历史取最近 5 条（按 ts 降序，天然去重），渲染为 5 卡横排 ----
  //   对齐音乐态 renderHomeTiles() 的 #home-tile-row 布局（grid-template-columns: repeat(5, ...)）。
  //   点击卡片 → 通过 SFV.online.openDetailFromMeta() 恢复播放。
  function renderContinueWatching() {
    var doc = d();
    var row = doc && doc.getElementById ? doc.getElementById('home-tile-row') : null;
    var title = doc && doc.getElementById ? doc.getElementById('home-rail-title') : null;
    var note = doc && doc.getElementById ? doc.getElementById('home-rail-note') : null;
    if (title) title.textContent = '接着看';
    if (!row) return;

    var history = (SFV.model && SFV.model.getHistory) ? SFV.model.getHistory() : [];
    var items = history.slice(0, 5); // 最近 5 条，天然去重（history 本身按 key 去重）

    if (note) {
      note.textContent = items.length
        ? (items.length + ' 个记录 · 点击继续播放')
        : '';
    }

    if (!items.length) {
      row.innerHTML = '';
      return;
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var p = SFV.model.getProgress(it.key);
      var pct = (p && p.duration) ? Math.min(100, Math.round((p.position / p.duration) * 100)) : 0;
      var sub = p ? ('看到 ' + fmtTime(p.position) + (pct ? ' · ' + pct + '%' : '')) : (it.year || '');
      // 不复用 .home-tile-cover（其 background: 简写含 var(--tone-a) 在接着看 card 上
      // 未定义 → 简写会重置所有 background-* 子属性，inline 简写无法可靠胜出）；
      // 改用单一 .sfv-tile-cover（已显式声明 background-size/position/repeat:cover/center/no-repeat），
      // inline 设 background-image:url(...) 覆盖其渐变 + height:92px 替代原 .home-tile-cover 的高度。
      // 22:3x 迁移：历史 pic 若为 TMDB CDN 直链（修复 posterUrl 之前保存），浏览器侧被墙；
      // 渲染时包一层 /api/proxy 走服务端。仅影响显示，不改 history 存储。
      var renderPic = it.pic;
      if (renderPic && renderPic.indexOf('https://image.tmdb.org/') === 0) {
        renderPic = '/api/proxy?url=' + encodeURIComponent(renderPic);
      }
      var coverParts = ['height:92px', 'border-radius:15px'];
      var coverStyle = coverParts.join(';');
      var coverClass = 'sfv-tile-cover' + (it.pic ? ' has-cover' : '');
      // 22:4x：改用 <img> 显示海报（标准做法，object-fit:cover 自适应容器，
      // 且 onerror 可在代理/网络失败时隐藏并回退到 .sfv-tile-cover 的暗色渐变）。
      // 不再用 background-image 内联简写，避免任何特异性/简写重置的隐性问题。
      var coverImg = it.pic
        ? '<img class="sfv-tile-img" src="' + escAttr(renderPic) + '" alt="" loading="lazy" ' +
          'onerror="this.style.display=\'none\'">'
        : '';

      html += '<button class="home-tile sfv-continue-tile" type="button" data-sfv-key="' + escAttr(it.key) + '">' +
        '<div class="' + coverClass + '" style="' + coverStyle + '">' +
        coverImg +
        '<i class="sfv-tile-bar" style="width:' + pct + '%"></i></div>' +
        '<div class="home-tile-title">' + escHtml(it.title || '未命名') + '</div>' +
        '<div class="home-tile-sub">' + escHtml(sub) + '</div>' +
        '</button>';
    }
    row.innerHTML = html;

    // T147 后向补图：历史 pic 为空（搜索时 CMS10/Kazumi 没返图，TMDB 又没及时写回 it.pic）
    // → 渲染后异步尝试 TMDB 补图，成功回写 history.pic 并刷新对应 tile。
    // 会话级去重（_picBackfillTried in online.js）+ history.pic 已更新则下次不再触发。
    if (SFV.online && typeof SFV.online.tryPicBackfill === 'function') {
      for (var k = 0; k < items.length; k++) {
        try { SFV.online.tryPicBackfill(items[k], doc); } catch (e) {}
      }
    }

    // 缺位补空：保持 5 列网格对齐
    if (items.length < 5) {
      for (var j = items.length; j < 5; j++) {
        var empty = doc.createElement('div');
        empty.className = 'home-tile sfv-continue-empty';
        empty.setAttribute('aria-hidden', 'true');
        row.appendChild(empty);
      }
    }
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return escHtml(s); }

  // ---- URL 输入条（替代 Electron 不可用的 window.prompt）----
  function toggleUrlBar() {
    var doc = d();
    if (urlBar && urlBar.parentNode) {
      urlBar.parentNode.removeChild(urlBar);
      urlBar = null;
      return;
    }
    urlBar = doc.createElement('div');
    urlBar.className = 'sfv-urlbar';
    var input = doc.createElement('input');
    input.type = 'text';
    input.className = 'sfv-urlbar-input';
    input.placeholder = '粘贴视频直链（mp4 / m3u8 …），回车打开';
    var ok = doc.createElement('button');
    ok.type = 'button';
    ok.className = 'sfv-urlbar-btn';
    ok.textContent = '打开';
    var cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'sfv-urlbar-btn';
    cancel.textContent = '取消';

    var submit = function () {
      var v = (input.value || '').trim();
      if (!v) return;
      var r = SFV.source ? SFV.source.resolve(v) : null;
      if (r && !r.ok) { toast('无法识别的地址：' + r.reason); return; }
      if (r && r.kind === 'hls' && r.requiresHlsLib) toast('该环境不原生支持 HLS，可能无法播放');
      if (SFV.source) SFV.source.open(v);
      toggleUrlBar();
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', function () { toggleUrlBar(); });
    input.addEventListener('keydown', function (ev) {
      if (ev && (ev.key === 'Enter' || ev.keyCode === 13)) submit();
      if (ev && (ev.key === 'Escape' || ev.keyCode === 27)) toggleUrlBar();
    });

    urlBar.appendChild(input);
    urlBar.appendChild(ok);
    urlBar.appendChild(cancel);
    (doc.body || doc.documentElement).appendChild(urlBar);
    if (input.focus) { try { input.focus(); } catch (e) {} }
  }

  function toast(msg) {
    var doc = d();
    if (!doc || !doc.createElement) return;
    var t = doc.createElement('div');
    t.className = 'sfv-toast';
    t.textContent = msg;
    (doc.body || doc.documentElement).appendChild(t);
    global.setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 2600);
  }

  // ---- slot providers ----
  function render() {
    if (!isVideoSpace()) return;
    bindGridCapture();
    bindRailCapture();
    var cards = $all('#empty-home .home-grid .home-card');
    var defs = cardDefs();
    for (var i = 0; i < cards.length; i++) {
      if (i < defs.length) {
        setCardText(cards[i], defs[i]);
        // T119：每张分类卡的封面 = 各自 flag 类最新一条的 pic
        setCardArt(cards[i], defs[i].flag || null);
        cards[i].style.display = '';
      } else {
        // 多余卡位隐藏（DOM 有 6 卡时保护）
        cards[i].style.display = 'none';
      }
    }
    var hero = $('#empty-home .home-poster-title');
    if (hero) hero.textContent = '我的影视空间';
    // T134-f：影视态文案回读视频独立 store（posterStore.quote），有则用、无则默认；不再写死
    var quote = d() && d().getElementById ? d().getElementById('home-poster-quote') : null;
    if (quote) {
      var vq = posterStore && posterStore.quote;
      console.log('[SFV-HOME] render() setting quote, posterStore.quote:', JSON.stringify(vq), 'posterStore:', !!posterStore);
      quote.textContent = vq ? vq : '导入你自己的片源，搜索 / 播放 / 收藏都在这里完成 —— Stellaflix 不存储任何视频资源。';
    }
    // 影视态最近播放（覆盖音乐态残留文案）
    var nowEl = d() && d().getElementById ? d().getElementById('home-poster-now') : null;
    if (nowEl) {
      var history = (SFV.model && SFV.model.getHistory) ? SFV.model.getHistory() : [];
      if (history.length && history[0] && history[0].title) {
        nowEl.textContent = '最近播放 · ' + history[0].title;
      } else {
        nowEl.textContent = '播放任意影片后，这里会显示最近观看。';
      }
    }
    // 用户要求移除红笔圈出的 TMDB 署名；清理可能残留的 DOM
    var doc = d();
    if (doc && doc.getElementById) {
      var oldAttrib = doc.getElementById('sfv-tmdb-attrib');
      if (oldAttrib && oldAttrib.parentNode) oldAttrib.parentNode.removeChild(oldAttrib);
    }
    // 接着看：5 卡横排（对齐音乐态 renderHomeTiles 的 #home-tile-row）
    renderContinueWatching();
    // T119：渲染影视态左侧海报（独立于音乐态）
    console.log('[SFV-HOME] render() calling renderVideoPoster, posterStore:', !!posterStore, 'url:', !!(posterStore && posterStore.url));
    renderVideoPoster();
    // T119：改造 home-poster-actions 5 个 chip（隐藏"用当前封面"；海报只允许本地自定义图，故移除 TMDB 选图入口）
    restructurePosterActionsForVideo();
    // T118：进入影视态时也触发 3D 歌单架 rebuild，让 currentItems() 走 video 分支
    if (typeof global.scheduleShelfRebuild === 'function') {
      try { global.scheduleShelfRebuild('sfv-render-video', true); } catch (e) {}
    }

    // T134-f Layer4：requestAnimationFrame 自愈——拦截 render() 之后任何异步路径对海报/文案的覆盖
    // 原因：safePlaybackStep('home-poster', ...) 在播放状态变化时同步调用 renderHomePersonalPoster，
    //   它可能在 render() 之后同一微任务或下一帧执行（如切歌事件恰好在 spacechange 后触发）。
    //   即使前面三层守卫（回调包装 / 函数入口 / renderHomeDiscover）全部生效，此层作为最后保险。
    // T134-f Layer4：raf 自愈（修正 10:52 — 实时读 posterStore，编辑中跳过）
    var doc = d();
    (function heal() {
      var raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : function(fn) { return setTimeout(fn, 16); };
      raf(function () {
        try {
          if (!doc || !doc.body || !doc.body.classList.contains('video-space-active')) return;
          var copyEl = doc.querySelector('.home-poster-copy');
          if (copyEl && copyEl.classList.contains('editing')) return;
          var liveQuote = (posterStore && posterStore.quote) || '';
          var liveUrl = (posterStore && posterStore.url) || '';
          if (liveQuote) {
            var q = doc.getElementById('home-poster-quote');
            if (q && q.textContent !== liveQuote) q.textContent = liveQuote;
          }
          if (liveUrl) {
            var m = doc.getElementById('home-poster-media');
            if (m) {
              var current = m.style.getPropertyValue('--home-poster-image') || '';
              if (current.indexOf(liveUrl.slice(0, 40)) === -1) {
                m.style.setProperty('--home-poster-image', 'url("' + escAttr(liveUrl) + '")');
                m.classList.add('sfv-poster-movie', 'has-image');
                m.classList.remove('sfv-poster-default');
              }
            }
          }
        } catch (e) { /* 自愈失败静默 */ }
      });
    })();
  }

  function ensureBackBtn() {
    var doc = d();
    if (!doc || !doc.getElementById) return;
    var btn = doc.getElementById('sfv-back-to-music');
    if (!btn) {
      btn = doc.createElement('button');
      btn.id = 'sfv-back-to-music';
      btn.className = 'sfv-back-to-music';
      btn.type = 'button';
      btn.textContent = '← 返回音乐';
      btn.addEventListener('click', function () {
        if (SFV.state && SFV.state.setSpace) SFV.state.setSpace('music');
      });
      // 插入到海报区域底部（home-poster 内）
      var poster = doc.getElementById('home-poster');
      if (poster) poster.appendChild(btn);
      else { /* fallback: 不强挂 */ }
    }
    btn.style.display = '';
  }

  function hideBackBtn() {
    var btn = d() && d().getElementById ? d().getElementById('sfv-back-to-music') : null;
    if (btn) btn.style.display = 'none';
  }

  // ---- T119：影视海报独立化 ----
  // 用户死命令：影视态的海报 ≠ 音乐态的海报；用电影海报；用户未看影视用默认封面
  // 海报来源策略（A4 + 用户后续答案）：
  //   1) localStorage['stellaflix-video-poster'] 用户手动设置过 → 用设置
  //   2) 否则：liked + 追片(track) + inList + history 所有 vod meta，按 ts 倒序取最新一条的 pic
  //   3) 否则（C1 兜底）：默认封面 = B3 暗色玻璃 + 🎬 emoji
  var VIDEO_POSTER_LS_KEY = 'stellaflix-video-poster';

  // 内存缓存：undefined=未加载（用 localStorage 兼容路径）, null=已加载但无数据, {}有数据
  var posterStore = undefined;

  // 异步加载持久化海报（文件存储）到内存缓存。
  // 文件不存在时回退读取 localStorage 旧数据并迁移到文件，保证升级平滑。
  function loadPosterStore() {
    return new Promise(function (resolve) {
      try {
        if (global.desktopWindow && typeof global.desktopWindow.videoPoster === 'function') {
          global.desktopWindow.videoPoster('get').then(function (r) {
            if (r && r.ok && r.data) {
              posterStore = r.data;
            } else {
              var legacy = migrateLocalStoragePoster();
              if (legacy) {
                posterStore = legacy;
                global.desktopWindow.videoPoster('set', legacy); // 迁移写入文件
              } else {
                posterStore = null;
              }
            }
            resolve();
          }).catch(function () { posterStore = null; resolve(); });
          return;
        }
      } catch (e) { /* ignore */ }
      posterStore = null;
      resolve();
    });
  }

  // 从 localStorage 旧键迁移自定义海报数据（一次性）
  function migrateLocalStoragePoster() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(VIDEO_POSTER_LS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && (parsed.url || parsed.poster)) {
        return { url: parsed.url || parsed.poster, source: parsed.source || 'custom', title: parsed.title || '', ts: parsed.ts || Date.now() };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // 读取用户手动设置的海报（优先内存缓存；未加载时走 localStorage 兼容旧数据）
  function getUserVideoPoster() {
    try {
      if (posterStore !== undefined) {
        if (posterStore && (posterStore.url || posterStore.poster)) {
          return { url: posterStore.url || posterStore.poster, source: posterStore.source || 'custom', title: posterStore.title || '' };
        }
        return null;
      }
      // 兼容：缓存尚未加载，直接读 localStorage（迁移期）
      var raw = global.localStorage && global.localStorage.getItem(VIDEO_POSTER_LS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && (parsed.url || parsed.poster)) {
        return { url: parsed.url || parsed.poster, source: parsed.source || 'custom', title: parsed.title || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // 用户手动保存海报：更新内存缓存 + 异步写文件（持久真相）+ 同步写 localStorage（兜底兼容）
  function setUserVideoPoster(rec) {
    try {
      // T134-f：换海报图时保留已设置的影视态文案（quote），避免被清空
      var prevQuote = (posterStore && posterStore.quote) || '';
      var data = { url: rec.url, source: rec.source || 'custom', title: rec.title || '', quote: prevQuote, ts: Date.now() };
      posterStore = data;
      if (global.desktopWindow && typeof global.desktopWindow.videoPoster === 'function') {
        global.desktopWindow.videoPoster('set', data); // fire-and-forget，文件持久化
      }
      try { if (global.localStorage) global.localStorage.setItem(VIDEO_POSTER_LS_KEY, JSON.stringify(data)); } catch (e2) { /* 配额超限不影响文件存储 */ }
      return true;
    } catch (e) { return false; }
  }

  // 清掉用户手动设置的海报（缓存 + 文件 + localStorage 三处同步）
  function clearUserVideoPoster() {
    try {
      posterStore = null;
      if (global.desktopWindow && typeof global.desktopWindow.videoPoster === 'function') {
        global.desktopWindow.videoPoster('clear');
      }
      try { if (global.localStorage) global.localStorage.removeItem(VIDEO_POSTER_LS_KEY); } catch (e2) { /* ignore */ }
      return true;
    } catch (e) { return false; }
  }

  // 海报来源策略（用户死命令：仅允许用户上传，不自动回退任何历史/TMDB/收藏数据）
  //   1) 用户手动设置过 → 用 posterStore
  //   2) 否则 → 默认封面（暗色玻璃 + 🎬 emoji）
  function pickVideoPoster() {
    var user = getUserVideoPoster();
    if (user && user.url) return { kind: 'user', url: user.url, title: user.title || '' };
    return { kind: 'default', url: '', title: '' };
  }

  // 渲染影视态左侧海报（默认封面 = B2 暗色玻璃 + 🎬 emoji 96px + 文字 20px）
  // T120 改进：不清空 innerHTML，保留音乐态 .home-poster-frame / .home-poster-reflection 装饰（E1），
  //   仅移除之前注入的影视态子元素（.sfv-poster-default-inner）。
  //   装饰可见性由 CSS class（.sfv-poster-default / .sfv-poster-movie）控制。
  function renderVideoPoster() {
    var doc = d();
    if (!doc) return;
    var media = doc.getElementById('home-poster-media');
    if (!media) return;

    // 先清掉上一次注入的影视态子元素（但不删 frame / frame reflection）
    var oldDefault = media.querySelector('.sfv-poster-default-inner');
    if (oldDefault && oldDefault.parentNode) oldDefault.parentNode.removeChild(oldDefault);

    var picked = pickVideoPoster();
    if (picked.kind === 'default') {
      // 默认封面：暗色玻璃 + 🎬 emoji + "影视空间" 文字（B2 96px + 20px）
      media.classList.add('sfv-poster-default');
      media.classList.remove('sfv-poster-movie', 'has-image');
      media.style.removeProperty('--home-poster-image');

      var inner = doc.createElement('div');
      inner.className = 'sfv-poster-default-inner';
      inner.setAttribute('aria-hidden', 'true');
      var emoji = doc.createElement('div');
      emoji.className = 'sfv-poster-default-emoji';
      emoji.textContent = '\uD83C\uDFAC'; // 🎬
      var text = doc.createElement('div');
      text.className = 'sfv-poster-default-text';
      text.textContent = '影视空间';
      inner.appendChild(emoji);
      inner.appendChild(text);
      media.appendChild(inner);
    } else {
      // 真实海报：背景图 + sfv-poster-movie 类（玻璃质感由 .home-poster-frame 提供，与音乐态同源；
      //   不注入底部遮罩，避免影视态海报底部被系统性压暗，与音乐态亮度对齐）
      media.classList.add('sfv-poster-movie', 'has-image');
      media.classList.remove('sfv-poster-default');
      var safe = escAttr(picked.url);
      media.style.setProperty('--home-poster-image', 'url("' + safe + '")');
    }
  }

  // ---- T119/T120：影视态 home-poster-actions 改造 ----
  // 影视态下（C2 顺序：换图片 → 改文案 → 重置 → 工具箱）：
  //   ① 隐藏 "用当前封面"（避免把音乐封面误用为影视海报）
  //   ② "换图片" 重定向到 pickLocalVideoPoster()（只允许本地自定义图，写 video-poster.json）
  //   ③ "重置" 重定向到 resetVideoPoster()（清 video-poster.json + 回默认封面）
  //   （已移除 "从 TMDB 选" —— 海报仅支持用户本地图片，不再抓取 TMDB）
  //   ⑤ "改文案" / "工具箱" 沿用音乐态
  // T120：每次 render 强制重写（D1，移除 dataset 守卫），用 data-sfv-action 属性去重。
  function restructurePosterActionsForVideo() {
    var doc = d();
    if (!doc) return;
    // 主选器匹配 #home-poster（影视态 hero 容器）；若 index.html 重构丢失该 id，回退到全局唯一的 .home-poster-actions
    var actions = doc.querySelector('#home-poster .home-poster-actions') || doc.querySelector('.home-poster-actions');
    if (!actions) { console.warn('[SFV-HOME] restructurePosterActionsForVideo: .home-poster-actions not found'); return; }

    // 每次 render 强制重写（D1）：不用 dataset 守卫，直接遍历按钮 + 按需修改
    var btns = actions.querySelectorAll('.home-poster-chip');
    console.log('[SFV-HOME] restructurePosterActionsForVideo: found', btns.length, 'chips');
    btns.forEach(function (b) {
      var txt = (b.textContent || '').trim();
      // ① "用当前封面" → display:none（保留 DOM 以便 restoreMusic 还原）
      if (txt === '用当前封面') {
        if (b.style.display !== 'none') b.style.display = 'none';
      }
      // ② "换图片" 重定向到视频态版本
      if (txt === '换图片') {
        b.onclick = function () { console.log('[SFV-HOME] 换图片 clicked'); pickLocalVideoPoster(); };
      }
      // ③ "重置" 重定向到视频态版本
      if (txt === '重置') {
        b.onclick = function () { resetVideoPoster(); };
      }
      // ④ "改文案" 重定向到视频态独立文案存储（不再写入音乐 store stellaflix-home-personal-poster-v1）
      if (txt === '改文案') {
        b.onclick = function () { console.log('[SFV-HOME] 改文案 clicked'); editVideoPosterQuote(); };
      }
    });
  }

  // 重置：清掉 stellaflix-video-poster + 回到默认封面
  function resetVideoPoster() {
    clearUserVideoPoster();
    renderVideoPoster();
    if (typeof global.showToast === 'function') {
      try { global.showToast('影视海报已重置'); } catch (e) {}
    }
  }

  // 本地图片上传 —— 使用 Electron 原生对话框（dialog.showOpenDialog），
  //   替代 <input type="file"> .click() 方案（后者在 Electron 中即使用户手势同步调用也不可靠，
  //   Chromium 安全模型可能因 input 非用户直接交互创建而静默忽略 click()）。
  function pickLocalVideoPoster() {
    console.log('[SFV-HOME] pickLocalVideoPoster: calling native dialog via IPC');
    if (global.desktopWindow && typeof global.desktopWindow.pickImage === 'function') {
      global.desktopWindow.pickImage().then(function (result) {
        console.log('[SFV-HOME] native dialog result:', JSON.stringify(result));
        if (!result || !result.ok) {
          if (result && !result.canceled) {
            if (typeof global.showToast === 'function') global.showToast('图片选择失败: ' + (result.error || '未知错误'));
          }
          return;
        }
        var dataUrl = result.dataUrl || '';
        if (!dataUrl || !/^data:image\//i.test(dataUrl)) {
          if (typeof global.showToast === 'function') global.showToast('图片数据无效');
          return;
        }
        console.log('[SFV-HOME] image selected, dataURL length:', dataUrl.length, 'fileName:', result.fileName);
        // 压缩到 1400px 上限，保持 base64 体积可控
        var doc = d();
        if (!doc) return;
        var img = new Image();
        img.onload = function () {
          var maxSide = 1400;
          var iw = img.naturalWidth || img.width || 1;
          var ih = img.naturalHeight || img.height || 1;
          var scale = Math.min(1, maxSide / Math.max(iw, ih));
          var w = Math.max(1, Math.round(iw * scale));
          var h = Math.max(1, Math.round(ih * scale));
          var cv = doc.createElement('canvas');
          cv.width = w; cv.height = h;
          var cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0, w, h);
          var out = '';
          try { out = cv.toDataURL('image/webp', 0.82); } catch (e1) { console.warn('[SFV-HOME] canvas webp failed:', e1.message); }
          if (!/^data:image\/webp/i.test(out)) {
            try { out = cv.toDataURL('image/jpeg', 0.84); } catch (e2) { out = dataUrl; }
          }
          setUserVideoPoster({ url: out, source: 'local', title: '自定义海报' });
          renderVideoPoster();
          if (typeof global.showToast === 'function') global.showToast('影视海报已替换为本地图片');
        };
        img.onerror = function () { if (typeof global.showToast === 'function') global.showToast('图片读取失败'); };
        img.src = dataUrl;
      }).catch(function (err) {
        console.warn('[SFV-HOME] pickImage IPC error:', err ? err.message : '');
        if (typeof global.showToast === 'function') global.showToast('图片选择失败');
      });
    } else {
      console.warn('[SFV-HOME] desktopWindow.pickImage not available');
      if (typeof global.showToast === 'function') global.showToast('图片选择功能不可用');
    }
  }

  // ---- T134-f：影视态独立文案（不写入音乐 store，且保存时不污染 #home-poster-media 海报图）----
  var _videoQuoteInput = null, _videoQuoteSaveBtn = null, _videoQuoteCancelBtn = null, _videoQuoteKeyHandler = null;

  function saveVideoPosterQuote(raw) {
    var next = String(raw || '').trim().slice(0, 80);
    console.log('[SFV-HOME] saveVideoPosterQuote called, raw:', JSON.stringify(next));
    if (!next) { if (typeof global.showToast === 'function') global.showToast('文案不能为空'); return; }
    try {
      if (!posterStore || typeof posterStore !== 'object') posterStore = {};
      posterStore.quote = next;
      var data = { url: posterStore.url || '', source: posterStore.source || 'custom', title: posterStore.title || '', quote: next, ts: Date.now() };
      console.log('[SFV-HOME] writing to IPC + localStorage, quote:', next);
      if (global.desktopWindow && typeof global.desktopWindow.videoPoster === 'function') {
        global.desktopWindow.videoPoster('set', data);
      }
      try { if (global.localStorage) global.localStorage.setItem(VIDEO_POSTER_LS_KEY, JSON.stringify(data)); } catch (e2) {}
    } catch (e) { console.warn('[SFV-HOME] saveVideoPosterQuote error:', e.message); }
    // 仅更新文案 DOM；绝不改写 #home-poster-media 的 --home-poster-image（海报图保持视频态）
    var quote = d() && d().getElementById ? d().getElementById('home-poster-quote') : null;
    if (quote) { quote.textContent = next; console.log('[SFV-HOME] DOM quote updated to:', next); }
    var wrap = d() && d().querySelector ? d().querySelector('.home-poster-copy') : null;
    if (wrap) wrap.classList.remove('editing');
    if (typeof global.showToast === 'function') global.showToast('影视海报文案已保存');
  }

  function restoreVideoQuoteButtons() {
    try {
      if (_videoQuoteSaveBtn) _videoQuoteSaveBtn.onclick = (typeof saveHomePosterQuote === 'function') ? saveHomePosterQuote : null;
      if (_videoQuoteCancelBtn) _videoQuoteCancelBtn.onclick = (typeof cancelHomePosterQuoteEdit === 'function') ? cancelHomePosterQuoteEdit : null;
      if (_videoQuoteInput && _videoQuoteKeyHandler) _videoQuoteInput.removeEventListener('keydown', _videoQuoteKeyHandler, true);
    } catch (e) {}
    _videoQuoteInput = _videoQuoteSaveBtn = _videoQuoteCancelBtn = _videoQuoteKeyHandler = null;
  }

  function videoSaveHandler() {
    var v = _videoQuoteInput ? _videoQuoteInput.value : '';
    saveVideoPosterQuote(v);
    restoreVideoQuoteButtons();
  }
  function videoCancelHandler() {
    if (typeof cancelHomePosterQuoteEdit === 'function') cancelHomePosterQuoteEdit();
    restoreVideoQuoteButtons();
  }

  // 复用音乐态内联编辑 UI（#home-poster-editor），但保存写入视频独立 store
  function editVideoPosterQuote() {
    var doc = d();
    if (!doc) return;
    var input = doc.getElementById('home-poster-quote-input');
    var wrap = doc.querySelector('.home-poster-copy');
    console.log('[SFV-HOME] editVideoPosterQuote called, input:', !!input, 'wrap:', !!wrap);
    if (!input || !wrap) { console.warn('[SFV-HOME] editVideoPosterQuote: missing input or wrap'); return; }
    var current = (posterStore && posterStore.quote) || '';
    input.value = current;
    wrap.classList.add('editing');
    _videoQuoteInput = input;

    // 用多种策略查找保存/取消按钮，确保绑定成功
    var actionsEl = wrap.querySelector('.home-poster-editor-actions');
    _videoQuoteSaveBtn = null;
    _videoQuoteCancelBtn = null;

    if (actionsEl) {
      // 策略1：通过 .primary class 找保存按钮
      _videoQuoteSaveBtn = actionsEl.querySelector('.primary');
      // 策略2：通过文本内容匹配（兜底）
      if (!_videoQuoteSaveBtn) {
        var btns = actionsEl.querySelectorAll('button, .home-poster-chip');
        for (var i = 0; i < btns.length; i++) {
          if ((btns[i].textContent || '').trim() === '保存') { _videoQuoteSaveBtn = btns[i]; break; }
        }
      }

      // 取消按钮：非 .primary 的按钮
      var allBtns = actionsEl.querySelectorAll('button, .home-poster-chip');
      for (var j = 0; j < allBtns.length; j++) {
        if (allBtns[j] !== _videoQuoteSaveBtn) { _videoQuoteCancelBtn = allBtns[j]; break; }
      }
    }

    console.log('[SFV-HOME] saveBtn:', !!_videoQuoteSaveBtn, 'cancelBtn:', !!_videoQuoteCancelBtn);

    if (_videoQuoteSaveBtn) {
      _videoQuoteSaveBtn.onclick = videoSaveHandler;
      // 移除可能的内联 onclick 属性（防止双触发）
      _videoQuoteSaveBtn.setAttribute('data-sfv-bound', '1');
    } else {
      console.warn('[SFV-HOME] save button NOT FOUND in editor actions!');
    }
    if (_videoQuoteCancelBtn) {
      _videoQuoteCancelBtn.onclick = videoCancelHandler;
      _videoQuoteCancelBtn.setAttribute('data-sfv-bound', '1');
    }
    _videoQuoteKeyHandler = function (e) {
      if (!e) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); videoCancelHandler(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopImmediatePropagation(); videoSaveHandler(); }
    };
    input.addEventListener('keydown', _videoQuoteKeyHandler, true);
    setTimeout(function () { try { input.focus(); input.select(); } catch (e2) {} }, 0);
  }

  // ---- T118/T119：拍音乐态基线快照（仅一次）----
  // 严格只快照"home.js 在影视态会改写"的元素，避免覆盖音乐态的动态封面（renderHomeDiscover 会自己重设）。
  // T119 扩展：必须把 .home-poster-media 的 --home-poster-image CSS 变量 / className / 内嵌默认封面 emoji 都拍下，
  //   否则影视态改了海报图后切回音乐态会残留影视海报。
  function captureMusicDefaults() {
    if (musicSnap) return;
    var doc = d();
    if (!doc || !doc.querySelector) return;
    try {
      var snap = { cards: [], poster: null, posterMedia: null, rail: null };
      var cards = $all('#empty-home .home-grid .home-card');
      for (var i = 0; i < cards.length; i++) {
        var l = cards[i].querySelector('.home-card-label');
        var t = cards[i].querySelector('.home-card-title');
        var s = cards[i].querySelector('.home-card-sub');
        snap.cards.push({
          label: l ? l.textContent : '',
          title: t ? t.textContent : '',
          sub: s ? s.textContent : '',
          onclick: cards[i].getAttribute('onclick') || '',
        });
      }
      var posterTitle = doc.querySelector('#empty-home .home-poster-title');
      var posterQuote = doc.getElementById('home-poster-quote');
      snap.poster = {
        title: posterTitle ? posterTitle.textContent : '',
        quote: posterQuote ? posterQuote.textContent : '',
      };
      // T119：拍 .home-poster-media 的完整状态
      var media = doc.getElementById('home-poster-media');
      if (media) {
        snap.posterMedia = {
          className: media.className || '',
          cssVar: media.style.getPropertyValue('--home-poster-image') || '',
          inlineBg: media.style.backgroundImage || '',
          inlineStyle: media.getAttribute('style') || '',
          innerHTML: media.innerHTML,
          // 拍下影视态注入的 default-cover 类，便于回滚时识别
        };
      }
      var railTitle = doc.getElementById('home-rail-title');
      var railNote = doc.getElementById('home-rail-note');
      snap.rail = {
        title: railTitle ? railTitle.textContent : '',
        note: railNote ? railNote.textContent : '',
      };
      musicSnap = snap;
      // 暴露给测试 / DevTools 排查
      try { global[MUSIC_SNAP_KEY] = snap; } catch (e) {}
    } catch (e) {
      console.warn('[SFV-HOME] captureMusicDefaults failed:', e);
    }
  }

  // ---- T118：回滚音乐态基线（DOM 层级 100% 还原影视态改写）----
  function applyMusicDefaults() {
    var doc = d();
    if (!doc) return;
    var snap = musicSnap || global[MUSIC_SNAP_KEY];
    if (!snap) return;
    try {
      // 1) 还原 5 张 home-card 的 label/title/sub/onclick
      var cards = $all('#empty-home .home-grid .home-card');
      for (var i = 0; i < cards.length && i < snap.cards.length; i++) {
        var def = snap.cards[i];
        var l = cards[i].querySelector('.home-card-label');
        var t = cards[i].querySelector('.home-card-title');
        var s = cards[i].querySelector('.home-card-sub');
        if (l) l.textContent = def.label;
        if (t) t.textContent = def.title;
        if (s) s.textContent = def.sub;
        if (def.onclick) cards[i].setAttribute('onclick', def.onclick);
        else cards[i].removeAttribute('onclick');
        cards[i].style.display = '';
        // 清掉影视态可能写入的 data-sfv-key（home-tile-row 才用，home-card 上不会有，但保险起见）
        cards[i].removeAttribute('data-sfv-key');
        cards[i].removeAttribute('data-sfv-id');
        // 清掉影视态 setCardText 之外的 class 影响
        cards[i].classList.remove('sfv-tile-cover', 'sfv-continue-tile', 'sfv-continue-empty');
      }
      // 2) 还原 home-poster-title / home-poster-quote
      if (snap.poster) {
        var posterTitle = doc.querySelector('#empty-home .home-poster-title');
        var posterQuote = doc.getElementById('home-poster-quote');
        if (posterTitle) posterTitle.textContent = snap.poster.title;
        if (posterQuote) posterQuote.textContent = snap.poster.quote;
      }
      // 2.5) T119：还原 .home-poster-media（海报图/CSS变量/默认封面class）
      var mediaNode = doc.getElementById('home-poster-media');
      if (mediaNode && snap.posterMedia) {
        // 完全恢复快照，包括 className / 内嵌 style / innerHTML
        // 但用最稳的方式：先清掉所有可能加上的类，再恢复内联 style
        mediaNode.className = snap.posterMedia.className;
        if (snap.posterMedia.inlineStyle) {
          mediaNode.setAttribute('style', snap.posterMedia.inlineStyle);
        } else {
          mediaNode.removeAttribute('style');
        }
        mediaNode.innerHTML = snap.posterMedia.innerHTML;
        // 保险：再 setProperty 一遍 --home-poster-image（setAttribute('style') 应已覆盖）
        if (snap.posterMedia.cssVar) {
          mediaNode.style.setProperty('--home-poster-image', snap.posterMedia.cssVar);
        } else {
          mediaNode.style.removeProperty('--home-poster-image');
        }
        // 兜底：清掉影视态可能注入的 default-cover 类（即便 className 已恢复）
        mediaNode.classList.remove('sfv-poster-default', 'sfv-poster-movie');
      }
      // 3) 还原 home-rail-title / home-rail-note 文案（内容由 renderHomeTiles 重建）
      if (snap.rail) {
        var railTitle = doc.getElementById('home-rail-title');
        var railNote = doc.getElementById('home-rail-note');
        if (railTitle) railTitle.textContent = snap.rail.title;
        if (railNote) railNote.textContent = snap.rail.note;
      }
      // 4) 清空 home.js renderContinueWatching 注入的 5 张"接着看"tile
      var row = doc.getElementById('home-tile-row');
      if (row) {
        row.innerHTML = '';
        try { delete row._homeTiles; } catch (e) { row._homeTiles = null; }
      }
      // 5) 移除 TMDB 署名（影视态添加）
      var attrib = doc.getElementById('sfv-tmdb-attrib');
      if (attrib && attrib.parentNode) attrib.parentNode.removeChild(attrib);
      // 6) 隐藏"返回音乐"按钮（影视态添加）
      var back = doc.getElementById('sfv-back-to-music');
      if (back) back.style.display = 'none';
      // 7) 移除 urlBar（影视态添加）
      if (urlBar && urlBar.parentNode) { urlBar.parentNode.removeChild(urlBar); urlBar = null; }
    } catch (e) {
      console.warn('[SFV-HOME] applyMusicDefaults failed:', e);
    }
  }

  // 切回音乐态：先整体回滚影视态改写 → 再交还给 renderHomeDiscover 重建动态数据。
  function restoreMusic() {
    captureMusicDefaults();   // 首次进入前无快照则补拍
    applyMusicDefaults();     // 整体回滚基线
    if (typeof global.renderHomeDiscover === 'function') {
      try { global.renderHomeDiscover(); } catch (e) {}
    }
    // 3D 歌单架：影视/音乐态切换时必须 rebuild，否则 currentItems 走错分支但 DOM 残留
    if (typeof global.scheduleShelfRebuild === 'function') {
      try { global.scheduleShelfRebuild('sfv-restore-music', true); } catch (e) {}
    }
  }

  function install() {
    if (!SFV.dispatch) return;
    // T118：在 dispatch 监听 spacechange 之前先拍基线（install 阶段默认 music 态）
    captureMusicDefaults();
    SFV.dispatch.registerSlot(SLOT, { el: null, music: restoreMusic, video: render });
    if (isVideoSpace()) render();
  }

  function boot() {
    // 先异步加载持久化海报（文件存储）到内存缓存，再 install/render，
    // 确保首次渲染时自定义海报已就绪；加载失败也不阻塞安装。
    loadPosterStore().then(function () {
      var doc = d();
      if (doc && doc.readyState === 'loading' && doc.addEventListener) {
        doc.addEventListener('DOMContentLoaded', install);
      } else {
        install();
      }
    }, function () {
      var doc = d();
      if (doc && doc.readyState === 'loading' && doc.addEventListener) {
        doc.addEventListener('DOMContentLoaded', install);
      } else {
        install();
      }
    });
  }
  boot();

  SFV.home = { render: render, restoreMusic: restoreMusic, install: install, cardDefs: cardDefs, renderContinueWatching: renderContinueWatching, captureMusicDefaults: captureMusicDefaults, applyMusicDefaults: applyMusicDefaults, renderVideoPoster: renderVideoPoster, pickVideoPoster: pickVideoPoster, setCardArt: setCardArt, pickLocalVideoPoster: pickLocalVideoPoster, resetVideoPoster: resetVideoPoster, getUserVideoPoster: getUserVideoPoster, setUserVideoPoster: setUserVideoPoster, clearUserVideoPoster: clearUserVideoPoster, editVideoPosterQuote: editVideoPosterQuote, saveVideoPosterQuote: saveVideoPosterQuote };
})(typeof window !== 'undefined' ? window : this);
