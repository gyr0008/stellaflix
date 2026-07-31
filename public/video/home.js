/*
 * Stellaflix 影视模块 — 影视态首页 (Step 3)
 *
 * 双态同构：复用音乐态既有 DOM（#empty-home 内的 6 张 .home-card 与 #home-tile-row 海报轨），
 *   影视态下改写其文案/封面并接管点击；切回音乐态时交还给 renderHomeDiscover() 权威重渲。
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

  // ---- 恢复用户既定四卡（按 VIDEO_MODULE_PLAN.md §七）：心动 / 片单 / 收藏 / 历史 ----
  // 顺序对应 DOM 中前 4 张 .home-card；卡片 5/6 在影视态隐藏（见 render）。
  // 本地影片 / 网络地址 / 片源管理 入口迁移至 SFV.online 浏览层，首页不再承载（#19）。
  function cardDefs() {
    var M = SFV.model || {};
    var count = function (arr) { return (arr && arr.length) || 0; };
    var likedN = M.getKeysByFlag ? count(M.getKeysByFlag('liked')) : 0;
    var listN = M.getKeysByFlag ? count(M.getKeysByFlag('inList')) : 0;
    var favN = M.getKeysByFlag ? count(M.getKeysByFlag('faved')) : 0;
    var histN = M.getHistory ? count(M.getHistory()) : 0;

    return [
      {
        label: '心动', title: '心动', sub: likedN ? ('已心动 ' + likedN + ' 部') : '在详情页点亮 ♥ 加入',
        action: function () { if (SFV.online) SFV.online.openCategory('liked'); },
      },
      {
        label: '片单', title: '片单', sub: listN ? ('片单 ' + listN + ' 部') : '想看的全放进来',
        action: function () { if (SFV.online) SFV.online.openCategory('inList'); },
      },
      {
        label: '收藏', title: '收藏', sub: favN ? ('已收藏 ' + favN + ' 部') : '好片收藏以备回看',
        action: function () { if (SFV.online) SFV.online.openCategory('faved'); },
      },
      {
        label: '历史', title: '历史', sub: histN ? ('最近观看 ' + histN + ' 部') : '看过的会记在这里',
        action: function () { if (SFV.online) SFV.online.openCategory('history'); },
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
        if (node.getAttribute && node.getAttribute('data-sfv-id')) {
          resumeById(node.getAttribute('data-sfv-id'));
          return;
        }
        node = node.parentNode;
      }
    }, true);
    railBound = true;
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

  // ---- 海报墙 ----
  function renderRail() {
    var doc = d();
    var row = doc && doc.getElementById ? doc.getElementById('home-tile-row') : null;
    var title = doc && doc.getElementById ? doc.getElementById('home-rail-title') : null;
    var note = doc && doc.getElementById ? doc.getElementById('home-rail-note') : null;
    if (title) title.textContent = '我的片库';
    var lib = (SFV.model && SFV.model.getLibrary()) || [];
    if (note) note.textContent = lib.length ? (lib.length + ' 个条目 · 点击继续观看') : '还没有影片，先从「打开本地影片」开始';
    if (!row) return;

    if (!lib.length) {
      row.innerHTML = '<div class="sfv-rail-empty">片库为空 —— Stellaflix 不预置任何片源，' +
        '请使用「打开本地影片」或「打开网络地址」。</div>';
      return;
    }

    var html = '';
    for (var i = lib.length - 1, n = 0; i >= 0 && n < 10; i--, n++) {
      var it = lib[i];
      var p = SFV.model.getProgress(it.id);
      var pct = (p && p.duration) ? Math.min(100, Math.round((p.position / p.duration) * 100)) : 0;
      var sub = p ? ('看到 ' + fmtTime(p.position) + (pct ? ' · ' + pct + '%' : '')) : '未开始';
      html += '<button class="home-tile sfv-tile" type="button" data-sfv-id="' + escAttr(it.id) + '">' +
        '<div class="home-tile-cover sfv-tile-cover"><span class="sfv-tile-mark">' +
        (it.source === 'url' ? '链接' : '本地') + '</span>' +
        '<i class="sfv-tile-bar" style="width:' + pct + '%"></i></div>' +
        '<div class="home-tile-title">' + escHtml(it.title || '未命名') + '</div>' +
        '<div class="home-tile-sub">' + escHtml(sub) + '</div>' +
        '</button>';
    }
    row.innerHTML = html;
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
        cards[i].style.display = '';
      } else {
        // 影视态仅保留前四卡（心动/片单/收藏/历史），多余卡位隐藏，避免露出空语义
        cards[i].style.display = 'none';
      }
    }
    var hero = $('#empty-home .home-poster-title');
    if (hero) hero.textContent = '我的影视空间';
    var quote = d() && d().getElementById ? d().getElementById('home-poster-quote') : null;
    if (quote) quote.textContent = '导入你自己的片源，搜索 / 播放 / 收藏都在这里完成 —— Stellaflix 不存储任何视频资源。';
    renderRail();
  }

  // 切回音乐态：交还给音乐侧权威渲染函数，避免我们残留文案。
  function restoreMusic() {
    if (urlBar && urlBar.parentNode) { urlBar.parentNode.removeChild(urlBar); urlBar = null; }
    // 还原被影视态隐藏的卡片 5/6，交还音乐态六卡布局
    var cards = $all('#empty-home .home-grid .home-card');
    for (var i = 0; i < cards.length; i++) cards[i].style.display = '';
    if (typeof global.renderHomeDiscover === 'function') {
      try { global.renderHomeDiscover(); } catch (e) {}
    }
  }

  function install() {
    if (!SFV.dispatch) return;
    SFV.dispatch.registerSlot(SLOT, { el: null, music: restoreMusic, video: render });
    if (isVideoSpace()) render();
  }

  function boot() {
    var doc = d();
    if (doc && doc.readyState === 'loading' && doc.addEventListener) {
      doc.addEventListener('DOMContentLoaded', install);
    } else {
      install();
    }
  }
  boot();

  SFV.home = { render: render, restoreMusic: restoreMusic, install: install, cardDefs: cardDefs };
})(typeof window !== 'undefined' ? window : this);
