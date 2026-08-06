/*
 * Stellaflix 影视详情页（Plex 风）—— detail.js
 * ----------------------------------------------------------------
 * 设计契约见 player.css .sfv-detail-plex 注释 + 2026-08-06 协同设计决议：
 *   整页海报 fixed 铺满 + 仅底部 50% 暗渐变；左上圆形返回 + 右上 Plex 胶囊(-□×)；
 *   白色标题(甲:优先海报扣取,回退 TMDB 文字)；药丸操作组(播放/追片6态/加入片单/音轨/下载)；
 *   HEADER 元数据只读 4 字段(字段间 | 分隔,多类型间 / 分隔)；演员⌀70 + 相似/剧照卡(默认无独立标题文字)；
 *   8px TMDB 署名(G4-A)。剧集/选源冻结(等 Kazumi 讨论)。仅影视态可见(双态隔离)。
 *
 * 挂载：SFV.detail.build(rootEl, view, hooks)
 *   hooks.back   —— 返回回调(由 online.js 传入 goBack)，返回钮 / ESC 触发
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  var doc = (typeof document !== 'undefined') ? document : null;

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function svg(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var ICON = {
    play:     '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    heart:    svg('<path d="M12 20.5C12 20.5 4.5 15.6 4.5 9.8 4.5 7.2 6.4 5.4 8.9 5.4c1.7 0 3.1 1 3.6 2.3.5-1.3 1.9-2.3 3.6-2.3 2.5 0 4.4 1.8 4.4 4.4 0 5.8-7.5 10.7-7.5 10.7z"/>'),
    edit:     svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
    audio:    svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    download: svg('<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/>'),
    min:      svg('<path d="M5 12h14"/>'),
    max:      svg('<path d="M5 5h14v14H5z"/>'),
    close:    svg('<path d="M6 6l12 12M18 6L6 18"/>')
  };

  // 追片 6 态（未追=null + model.js 的 5 态枚举）
  var TRACK_MENU = [
    { key: null, label: '未追' },
    { key: 'watching', label: '在看' },
    { key: 'planToWatch', label: '想看' },
    { key: 'onHold', label: '搁置' },
    { key: 'watched', label: '看过' },
    { key: 'abandoned', label: '抛弃' }
  ];

  function toast(msg) {
    if (SFV.ui && typeof SFV.ui.toast === 'function') SFV.ui.toast(msg);
    else if (SFV.home && typeof SFV.home.toast === 'function') SFV.home.toast(msg);
  }

  // 解析 TMDB id：优先 view._tmdb，否则按标题 bestMatch（G8 兜底）
  function resolveTmdbId(view) {
    if (view && view._tmdb && view._tmdb.id) {
      return Promise.resolve({ id: view._tmdb.id, mediaType: view._tmdb.mediaType === 'tv' ? 'tv' : 'movie' });
    }
    if (!SFV.tmdb || !SFV.tmdb.hasKey || !SFV.tmdb.hasKey()) return Promise.resolve(null);
    var title = (view && view.title) || '';
    if (!title) return Promise.resolve(null);
    return SFV.tmdb.bestMatch(title).then(function (m) {
      if (!m || !m.id) return null;
      return { id: m.id, mediaType: m.mediaType === 'tv' ? 'tv' : 'movie' };
    }).catch(function () { return null; });
  }

  function mkPill(extraCls, iconHtml, label) {
    var b = el('button', 'sfv-plex-pill' + (extraCls ? ' ' + extraCls : ''));
    b.type = 'button';
    b.innerHTML = iconHtml + (label ? '<span>' + esc(label) + '</span>' : '');
    return b;
  }
  function sep() { return el('span', 'sfv-plex-sep'); }

  function renderTrackMenu(menu, view) {
    menu.innerHTML = '';
    var cur = (SFV.model && typeof SFV.model.getTrackStatus === 'function') ? SFV.model.getTrackStatus(view.key) : null;
    TRACK_MENU.forEach(function (it) {
      var item = el('button', 'sfv-plex-track-item');
      item.type = 'button';
      if (it.key === cur) item.classList.add('active');
      item.innerHTML = '<span class="dot"></span>' + esc(it.label);
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        if (SFV.model) {
          if (it.key === null) { if (SFV.model.clearTrack) SFV.model.clearTrack(view.key); }
          else { SFV.model.setTrackStatus(view.key, it.key); }
        }
        menu.classList.remove('open');
        renderTrackMenu(menu, view); // 刷新 active 态
        toast('已设为：' + it.label);
      });
      menu.appendChild(item);
    });
  }

  function openCollectionMenu(anchorBtn, view) {
    if (!SFV.collections) { toast('片单模块未加载'); return; }
    var menu = anchorBtn.querySelector('.sfv-plex-track-menu');
    if (!menu) { menu = el('div', 'sfv-plex-track-menu'); anchorBtn.appendChild(menu); }
    var folders = (SFV.collections.listUserFolders && SFV.collections.listUserFolders()) || [];
    menu.innerHTML = '';
    if (!folders.length) {
      var create = el('button', 'sfv-plex-track-item'); create.type = 'button';
      create.innerHTML = '<span class="dot"></span>新建片单并加入';
      create.addEventListener('click', function (e) {
        e.stopPropagation();
        var f = SFV.collections.createUserFolder ? SFV.collections.createUserFolder('我的片单') : null;
        addToFolder(f && f.id, view); menu.classList.remove('open');
      });
      menu.appendChild(create);
    } else {
      folders.forEach(function (f) {
        var item = el('button', 'sfv-plex-track-item'); item.type = 'button';
        item.innerHTML = '<span class="dot"></span>' + esc(f.name || '片单');
        item.addEventListener('click', function (e) {
          e.stopPropagation(); addToFolder(f.id, view); menu.classList.remove('open');
        });
        menu.appendChild(item);
      });
    }
    menu.classList.toggle('open');
  }
  function addToFolder(folderId, view) {
    if (!folderId || !SFV.collections) return;
    SFV.collections.addUserItem(folderId, {
      title: view.title, poster: view.pic, key: view.key, year: view.year
    });
    toast('已加入片单');
  }

  function renderRail(sections, title, items, mapFn, isActor) {
    if (!items || !items.length) return;
    var sec = el('div');
    sec.appendChild(el('div', 'sfv-plex-section', title));
    var rail = el('div', 'sfv-plex-rail');
    items.forEach(function (it) {
      var m = mapFn(it);
      var card = el('div', isActor ? 'sfv-plex-actor' : 'sfv-plex-card' + (m.poster ? ' sfv-plex-card--poster' : ''));
      if (isActor) {
        var img = el('img', 'sfv-plex-actor-img');
        if (m.img) { img.src = m.img; img.alt = m.name || ''; img.loading = 'lazy'; }
        card.appendChild(img);
        if (m.name) card.appendChild(el('div', 'sfv-plex-actor-name', m.name));
      } else {
        var cimg = el('img', 'sfv-plex-card-img');
        if (m.img) { cimg.src = m.img; cimg.alt = m.name || ''; cimg.loading = 'lazy'; }
        card.appendChild(cimg);
        // 相似/剧照：默认无独立标题文字(甲,G9)；hover 放大由 CSS 处理
      }
      rail.appendChild(card);
    });
    sec.appendChild(rail);
    sections.appendChild(sec);
  }

  function enrich(bg, titleWrap, subtitle, meta, overview, expand, sections, view) {
    resolveTmdbId(view)
      .then(function (tm) {
        if (!tm || !SFV.tmdb || typeof SFV.tmdb.getDetailBundle !== 'function') return null;
        return SFV.tmdb.getDetailBundle(tm.id, tm.mediaType);
      })
      .then(function (b) {
        if (!b) return; // 基础渲染已显示 view.title/pic，静默保留
        // 背景替换为 TMDB backdrop
        if (b.backdrop) bg.style.backgroundImage = 'url("' + esc(b.backdrop) + '")';
        // 主标题：甲模式优先 poster 扣取；无 poster 回退文字
        titleWrap.innerHTML = '';
        if (b.poster) {
          var pt = el('div', 'sfv-plex-poster-title');
          var pimg = el('img'); pimg.src = b.poster; pimg.alt = ''; pimg.loading = 'lazy';
          pt.appendChild(pimg); titleWrap.appendChild(pt);
        } else {
          titleWrap.appendChild(el('h1', 'sfv-plex-title-text', view.title || ''));
        }
        // 副标题：original_title（与标题不同才显示）
        var ot = b.originalTitle || '';
        if (ot && ot !== (view.title || '')) subtitle.textContent = ot;
        // 元数据行：TMDB logo + 评分 + 年份 + 片长 + 类型（字段间 |，类型间 /）
        meta.innerHTML = '';
        var logo = el('img', 'sfv-plex-tmdb-logo');
        logo.src = 'video/tmdb_logo.svg'; logo.alt = 'The Movie Database';
        meta.appendChild(logo);
        meta.appendChild(sep());
        meta.appendChild(el('span', 'sfv-plex-rating', (b.voteAverage || 0).toFixed(1)));
        meta.appendChild(sep());
        meta.appendChild(el('span', null, (b.releaseDate || '').slice(0, 4) || '—'));
        meta.appendChild(sep());
        meta.appendChild(el('span', null, b.runtime ? b.runtime + ' 分钟' : '--'));
        if (b.genres && b.genres.length) {
          meta.appendChild(sep());
          meta.appendChild(el('span', 'sfv-plex-genres', b.genres.join(' / ')));
        }
        // 简介 + 展开（>120 字显示展开按钮）
        if (b.overview) {
          overview.textContent = b.overview;
          expand.style.display = b.overview.length > 120 ? 'inline-block' : 'none';
        }
        // 演员（⌀70 圆头像）
        if (b.cast && b.cast.length) {
          renderRail(sections, '主演', b.cast.slice(0, 8), function (c) {
            return { img: c.profile, name: c.name, sub: c.character };
          }, true);
        }
        // 相似作品（默认无独立标题文字）
        if (b.similar && b.similar.length) {
          renderRail(sections, '相似作品', b.similar.slice(0, 8), function (m) {
            return { img: m.poster, name: m.title, poster: true };
          }, false);
        }
        // 幕后剧照（默认无独立标题文字）
        if (b.images && b.images.backdrops && b.images.backdrops.length) {
          renderRail(sections, '幕后剧照', b.images.backdrops.slice(0, 8), function (bd) {
            return { img: SFV.tmdb.posterUrl(bd.file_path, 'w780'), name: '' };
          }, false);
        }
      })
      .catch(function () { /* 静默降级：基础渲染已显示 */ });
  }

  function build(rootEl, view, hooks) {
    hooks = hooks || {};
    var onBack = typeof hooks.back === 'function' ? hooks.back : function () {};
    if (!doc) return null;
    view = view || {};

    // 进入沉浸态：隐藏全局顶栏（含原 -□× 与搜索/DIY/logo）
    doc.body.classList.add('sfv-plex-immersive');

    // 同步清空并建根
    rootEl.innerHTML = '';
    var root = el('div', 'sfv-detail-plex');
    rootEl.appendChild(root);

    // 海报背景层（基础：view.pic；enrich 后替换为 TMDB backdrop）
    var bg = el('div', 'sfv-plex-bg');
    if (view.pic) bg.style.backgroundImage = 'url("' + esc(view.pic) + '")';
    root.appendChild(bg);

    var content = el('div', 'sfv-plex-content');
    root.appendChild(content);

    // 左上圆形返回大钮
    var back = el('button', 'sfv-plex-back', '←');
    back.type = 'button'; back.setAttribute('aria-label', '返回');
    back.addEventListener('click', function () { destroy(); onBack(); });
    root.appendChild(back);

    // 右上 Plex 风格窗口控制胶囊(-□×) —— 接真实 Electron 控制
    var win = el('div', 'sfv-plex-win');
    var bMin = el('button'); bMin.type = 'button'; bMin.innerHTML = ICON.min; bMin.title = '最小化';
    var bMax = el('button'); bMax.type = 'button'; bMax.innerHTML = ICON.max; bMax.title = '最大化';
    var bClose = el('button'); bClose.type = 'button'; bClose.innerHTML = ICON.close; bClose.title = '关闭';
    bMin.addEventListener('click', function () { if (global.desktopWindow && global.desktopWindow.minimize) global.desktopWindow.minimize(); });
    bMax.addEventListener('click', function () { if (global.desktopWindow && global.desktopWindow.toggleMaximize) global.desktopWindow.toggleMaximize(); });
    bClose.addEventListener('click', function () { if (global.desktopWindow && global.desktopWindow.close) global.desktopWindow.close(); });
    win.appendChild(bMin); win.appendChild(bMax); win.appendChild(bClose);
    root.appendChild(win);

    // HEADER 区
    var header = el('div', 'sfv-plex-header');
    content.appendChild(header);

    var titleWrap = el('div', 'sfv-plex-title');
    titleWrap.appendChild(el('h1', 'sfv-plex-title-text', view.title || ''));
    header.appendChild(titleWrap);

    var subtitle = el('div', 'sfv-plex-subtitle', '');
    header.appendChild(subtitle);

    var meta = el('div', 'sfv-plex-meta');
    header.appendChild(meta);

    var actions = el('div', 'sfv-plex-actions');
    header.appendChild(actions);

    var overview = el('div', 'sfv-plex-overview', '');
    header.appendChild(overview);
    var expand = el('button', 'sfv-plex-expand', '展开简介');
    expand.type = 'button'; expand.style.display = 'none';
    expand.addEventListener('click', function () {
      var ex = overview.classList.toggle('expanded');
      expand.textContent = ex ? '收起简介' : '展开简介';
    });
    header.appendChild(expand);

    // 操作按钮组（药丸）
    var btnPlay = mkPill('sfv-plex-pill--play', ICON.play, '播放');
    btnPlay.addEventListener('click', function () { toast('片源开发中，敬请期待'); });
    actions.appendChild(btnPlay);

    var btnTrack = mkPill('', ICON.heart, '追片');
    var trackMenu = el('div', 'sfv-plex-track-menu');
    btnTrack.appendChild(trackMenu);
    actions.appendChild(btnTrack);

    var btnColl = mkPill('', ICON.edit, '加入片单');
    actions.appendChild(btnColl);

    var btnAudio = mkPill('', ICON.audio, '音轨');
    btnAudio.addEventListener('click', function () { toast('音轨功能开发中'); });
    actions.appendChild(btnAudio);

    var btnDl = mkPill('', ICON.download, '下载');
    btnDl.addEventListener('click', function () { toast('下载功能开发中'); });
    actions.appendChild(btnDl);

    // 章节容器（演员/相似/剧照）
    var sections = el('div');
    sections.style.padding = '0 50px';
    content.appendChild(sections);

    // TMDB 署名（G4-A: 8px rgba(255,255,255,.25)）
    var attrib = el('div', 'sfv-plex-attrib', 'Data provided by The Movie Database');
    content.appendChild(attrib);

    // 追片下拉
    renderTrackMenu(trackMenu, view);
    btnTrack.addEventListener('click', function (e) {
      e.stopPropagation();
      trackMenu.classList.toggle('open');
    });
    doc.addEventListener('click', closeTrackMenu);
    function closeTrackMenu() { if (trackMenu.classList.contains('open')) trackMenu.classList.remove('open'); }

    // 加入片单
    btnColl.addEventListener('click', function (e) {
      e.stopPropagation();
      openCollectionMenu(btnColl, view);
    });

    // ESC 返回（G6：不误触播放器全屏 ESC，详情页无播放器）
    function escHandler(e) {
      if (e && (e.key === 'Escape' || e.keyCode === 27)) {
        e.stopPropagation();
        destroy(); onBack();
      }
    }
    doc.addEventListener('keydown', escHandler);

    function destroy() {
      doc.body.classList.remove('sfv-plex-immersive');
      doc.removeEventListener('keydown', escHandler);
      doc.removeEventListener('click', closeTrackMenu);
    }

    // 异步 enrich（TMDB 富信息；失败静默保留基础渲染）
    enrich(bg, titleWrap, subtitle, meta, overview, expand, sections, view);

    return { destroy: destroy };
  }

  SFV.detail = { build: build };
})(typeof window !== 'undefined' ? window : this);
