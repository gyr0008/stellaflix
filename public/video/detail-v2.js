(function () {
  'use strict';
  var SFV = window.SFV;
  if (!SFV) { return; }

  // ============ 追片状态定义（Kazumi 同源 Material Icons，白色） ============
  // key=null 表示「未追」（无状态）
  var STATUSES = [
    { key: null,          label: '未追', icon: 'favorite_border', round: false },
    { key: 'watching',    label: '在看', icon: 'favorite',         round: false },
    { key: 'planToWatch', label: '想看', icon: 'star_rounded',     round: true  },
    { key: 'onHold',      label: '搁置', icon: 'pending_actions',   round: false },
    { key: 'watched',     label: '看过', icon: 'done',             round: false },
    { key: 'abandoned',   label: '抛弃', icon: 'heart_broken',     round: false }
  ];
  function statusByKey(k) {
    for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].key === k) return STATUSES[i];
    return STATUSES[0];
  }
  function iconHtml(name, round) {
    return '<span class="material-icons' + (round ? '-round' : '') + '">' + name + '</span>';
  }

  // ============ DOM 辅助 ============
  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtRuntime(min) {
    min = Number(min) || 0;
    if (!min) return '';
    var hh = Math.floor(min / 60), mm = min % 60;
    return hh ? (hh + ' 小时' + (mm ? ' ' + mm + ' 分' : '')) : (mm + ' 分');
  }
  function toast(msg) {
    if (SFV.ui && SFV.ui.toast) SFV.ui.toast(msg);
    else if (SFV.toast) SFV.toast(msg);
  }
  function viewKey(view) { return view.key || view.id || view.title || ''; }

  // ============ 模块状态 ============
  var current = null;
  var docCloseHandler = null;

  function mount(root) {
    var overlay = document.querySelector('.sfv-browse');
    if (!overlay) { document.body.appendChild(root); current = root; return; }
    var old = overlay.querySelector('.sfv-detail-v2');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    overlay.appendChild(root);
    current = root;
  }
  function teardown() {
    if (docCloseHandler) { document.removeEventListener('click', docCloseHandler); docCloseHandler = null; }
    if (current && current.parentNode) current.parentNode.removeChild(current);
    current = null;
  }

  // ============ 首屏文字区 ============
  function buildText(view, tmdb) {
    var text = h('div', 'sfv-dv-text');
    if (tmdb && tmdb.companies && tmdb.companies.length && tmdb.companies[0].logo) {
      var logo = h('div', 'sfv-dv-logo');
      var limg = h('img');
      limg.src = tmdb.companies[0].logo;
      limg.alt = tmdb.companies[0].name || '';
      limg.addEventListener('error', function () { logo.style.display = 'none'; });
      logo.appendChild(limg);
      text.appendChild(logo);
    }
    text.appendChild(h('div', 'sfv-dv-title', esc(view.title || '未命名')));
    if (tmdb && tmdb.collection && tmdb.collection.name) {
      text.appendChild(h('div', 'sfv-dv-sub', esc(tmdb.collection.name)));
    }
    var metaParts = [];
    if (tmdb && tmdb.rating) metaParts.push('★ ' + (Math.round(tmdb.rating * 10) / 10));
    if (view.year) metaParts.push(String(view.year));
    if (tmdb && tmdb.runtime) metaParts.push(fmtRuntime(tmdb.runtime));
    if (tmdb && tmdb.genres && tmdb.genres.length) metaParts.push(tmdb.genres.slice(0, 3).join(' / '));
    if (metaParts.length) {
      var meta = h('div', 'sfv-dv-meta');
      metaParts.forEach(function (p, i) {
        if (i > 0) meta.appendChild(h('span', 'dot', '·'));
        meta.appendChild(h('span', null, esc(p)));
      });
      text.appendChild(meta);
    }
    var ov = (tmdb && tmdb.overview) || view.overview || '';
    if (ov) text.appendChild(h('div', 'sfv-dv-overview', esc(ov)));
    return text;
  }

  // ============ 首屏海报 ============
  function buildPoster(view, tmdb) {
    var poster = h('div', 'sfv-dv-poster');
    var pic = (tmdb && tmdb.poster) || view.pic || view.poster || '';
    if (pic) poster.style.backgroundImage = 'url("' + pic + '")';
    else poster.style.background = 'linear-gradient(135deg,#1a1d22,#0b0d10)';

    var back = h('button', 'sfv-dv-back', iconHtml('arrow_back', false) + '<span>返回</span>');
    back.type = 'button';
    back.addEventListener('click', function () { teardown(); });
    poster.appendChild(back);

    poster.appendChild(buildText(view, tmdb));
    poster.appendChild(buildCta(view));
    return poster;
  }

  // ============ CTA 行 ============
  function buildCta(view) {
    var cta = h('div', 'sfv-dv-cta');
    var key = viewKey(view);

    // ▶ 播放（accent 填充）
    var play = h('button', 'sfv-dv-play', iconHtml('play_arrow', false) + '<span>播放</span>');
    play.type = 'button';
    play.addEventListener('click', function () {
      if (SFV.online && SFV.online.openDetailFromMeta) SFV.online.openDetailFromMeta(view);
      else toast('播放功能未就绪');
    });
    cta.appendChild(play);

    // ❤ 追片（绿胶囊 + 向下弹窗）
    var heartWrap = h('div');
    heartWrap.style.position = 'relative';
    var heart = h('button', 'sfv-dv-heart');
    heart.type = 'button';
    var pop = buildStatusPop(view);
    function paintHeart() {
      var st = statusByKey(SFV.model ? SFV.model.getTrackStatus(key) : null);
      heart.innerHTML = iconHtml(st.icon, st.round) + '<span>' + st.label + '</span>';
    }
    paintHeart();
    heart.addEventListener('click', function (e) {
      e.stopPropagation();
      pop.classList.toggle('open');
    });
    pop.addEventListener('sfv-track-change', paintHeart);
    heartWrap.appendChild(heart);
    heartWrap.appendChild(pop);
    docCloseHandler = function (ev) {
      if (pop.classList.contains('open') && !pop.contains(ev.target) && ev.target !== heart && !heart.contains(ev.target)) {
        pop.classList.remove('open');
      }
    };
    document.addEventListener('click', docCloseHandler);
    cta.appendChild(heartWrap);

    // ➕ 加片单
    var add = h('button', 'sfv-dv-glass', iconHtml('playlist_add', false) + '<span>加片单</span>');
    add.type = 'button';
    add.addEventListener('click', function () {
      if (SFV.online && SFV.online.showPickFolderDialog) SFV.online.showPickFolderDialog(view);
      else if (SFV.collections) SFV.collections.showPickFolderDialog(view);
      else toast('片单模块未加载');
    });
    cta.appendChild(add);

    // 收藏（liked flag）
    var fav = h('button', 'sfv-dv-glass', iconHtml('bookmark_border', false) + '<span>收藏</span>');
    fav.type = 'button';
    function paintFav() {
      var on = SFV.model ? !!SFV.model.getFlag(key).liked : false;
      fav.innerHTML = iconHtml(on ? 'bookmark' : 'bookmark_border', false) + '<span>收藏</span>';
      fav.style.opacity = on ? '1' : '.82';
    }
    paintFav();
    fav.addEventListener('click', function () {
      if (!SFV.model) return;
      SFV.model.toggleFlag(key, 'liked');
      paintFav();
    });
    cta.appendChild(fav);

    // 分享
    var share = h('button', 'sfv-dv-glass', iconHtml('share', false) + '<span>分享</span>');
    share.type = 'button';
    share.addEventListener('click', function () {
      var txt = view.title || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(
          function () { toast('已复制：' + txt); },
          function () { toast('分享：' + txt); }
        );
      } else toast('分享：' + txt);
    });
    cta.appendChild(share);

    return cta;
  }

  // ============ 状态弹窗（向下，深色玻璃） ============
  function buildStatusPop(view) {
    var pop = h('div', 'sfv-dv-pop');
    var key = viewKey(view);
    function cur() { return SFV.model ? SFV.model.getTrackStatus(key) : null; }
    STATUSES.forEach(function (st) {
      var item = h('div', 'sfv-dv-pop-item', iconHtml(st.icon, st.round) + '<span>' + st.label + '</span>');
      if (cur() === st.key) item.classList.add('cur');
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        if (SFV.model) SFV.model.setTrackStatus(key, st.key);
        pop.classList.remove('open');
        pop.dispatchEvent(new CustomEvent('sfv-track-change'));
      });
      pop.appendChild(item);
    });
    pop.appendChild(h('div', 'sfv-dv-pop-sep'));
    var clear = h('div', 'sfv-dv-pop-item sfv-dv-pop-clear', iconHtml('block', false) + '<span>清除状态</span>');
    clear.addEventListener('click', function (e) {
      e.stopPropagation();
      if (SFV.model) SFV.model.clearTrack(key);
      pop.classList.remove('open');
      pop.dispatchEvent(new CustomEvent('sfv-track-change'));
    });
    pop.appendChild(clear);
    return pop;
  }

  // ============ 下区（默认隐藏） ============
  function buildLower(view) {
    var lower = h('div', 'sfv-dv-lower');
    var more = h('button', 'sfv-dv-more', '查看更多 <span class="material-icons" style="font-size:18px">expand_more</span>');
    more.type = 'button';
    more.addEventListener('click', function () {
      lower.classList.add('open');
      more.style.display = 'none';
      fillTracks(lower, view);
    });
    lower.appendChild(more);
    return lower;
  }

  function fillTracks(lower, view) {
    var tmdb = view._tmdb;
    if (!tmdb) return;
    if (tmdb.cast && tmdb.cast.length) {
      lower.appendChild(buildTrack('演员', tmdb.cast.slice(0, 12).map(function (c) {
        return { poster: c.profile, name: c.name, sub: c.character };
      }), true));
    }
    if (tmdb.similar && tmdb.similar.length) {
      lower.appendChild(buildTrack('相似的', tmdb.similar.slice(0, 18).map(function (s) {
        return { poster: s.poster, name: s.title, sub: s.year };
      }), false));
    }
  }

  function buildTrack(title, items, isActor) {
    var wrap = h('div', 'sfv-dv-track');
    wrap.appendChild(h('div', 'sfv-dv-track-title', title));
    var rail = h('div', 'sfv-dv-rail');
    items.forEach(function (it) {
      var card = h('div', 'sfv-dv-card' + (isActor ? ' sfv-dv-actor' : ''));
      var p = h('img', 'poster');
      p.src = it.poster || '';
      p.alt = it.name || '';
      p.addEventListener('error', function () { p.style.visibility = 'hidden'; });
      card.appendChild(p);
      if (it.name) card.appendChild(h('div', 'name', esc(it.name)));
      if (it.sub) card.appendChild(h('div', 'name', esc(it.sub)));
      rail.appendChild(card);
    });
    wrap.appendChild(rail);
    return wrap;
  }

  // ============ 错峰入场（D5=S1） ============
  function applyStagger(root) {
    var seq = ['.sfv-dv-back', '.sfv-dv-title', '.sfv-dv-sub', '.sfv-dv-meta', '.sfv-dv-overview', '.sfv-dv-cta'];
    var els = [];
    seq.forEach(function (sel) {
      var e = root.querySelector(sel);
      if (e) els.push(e);
    });
    els.forEach(function (e, i) {
      e.classList.add('sfv-dv-fade');
      global.setTimeout(function () { e.classList.add('sfv-dv-in'); }, 60 * (i + 1));
    });
  }

  // ============ 异步补 TMDB 详情 ============
  function enrichAsync(view, root, poster) {
    if (!SFV.tmdb || !SFV.tmdb.hasKey || !SFV.tmdb.hasKey() || !view.title) return;
    SFV.tmdb.bestMatch(view.title).then(function (m) {
      if (!m) return;
      view._tmdb = Object.assign(view._tmdb || {}, m);
      if (m.poster && poster) poster.style.backgroundImage = 'url("' + m.poster + '")';
      if (m.id) {
        SFV.tmdb.getDetailBundle(m.id, m.mediaType).then(function (b) {
          if (!b) return;
          view._tmdb = Object.assign(view._tmdb || {}, b);
          repaintText(poster, view);
        }).catch(function () {});
      }
    }).catch(function () {});
  }
  function repaintText(poster, view) {
    var old = poster.querySelector('.sfv-dv-text');
    if (old) old.parentNode.removeChild(old);
    poster.insertBefore(buildText(view, view._tmdb), poster.querySelector('.sfv-dv-cta'));
  }

  // ============ 主入口 ============
  function build(view) {
    if (!view) return null;
    var key = viewKey(view);
    // === 幂等守卫 ===
    // v2 详情页 ▶ 按钮走 SFV.online.openDetailFromMeta → renderDetail → 本函数，
    // 同一页内重复触发会导致 teardown+rebuild 的视觉闪烁。
    // 同 key 已挂载则直接返回现有根节点；不同 key 则先 teardown 旧节点再重建。
    var existing = (typeof document !== 'undefined' && document.querySelector) ? document.querySelector('.sfv-detail-v2') : null;
    if (existing) {
      if (existing.dataset && existing.dataset.dvKey === key) return existing;
      teardown();
    }
    var root = h('div', 'sfv-detail-v2');
    try { root.dataset.dvKey = key; } catch (e) { /* 测试桩可能无 dataset */ }
    root.appendChild(buildPoster(view, null));
    root.appendChild(buildLower(view));
    mount(root);
    applyStagger(root);
    var poster = root.querySelector('.sfv-dv-poster');
    enrichAsync(view, root, poster);
    return root;
  }

  // ============ 导出 ============
  SFV.detailV2 = {
    build: build,
    teardown: teardown
  };
})();
