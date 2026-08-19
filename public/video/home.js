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

  // T-#6-序4：纯工具核心（fmtTime / escHtml / escAttr）已抽到 home-core.js，须先于本文件加载
  var HC = SFV.homeCore;
  if (!HC) { throw new Error('[SFV home] homeCore 未加载，请检查 index.html 加载顺序'); }
  var fmtTime = HC.fmtTime, escHtml = HC.escHtml, escAttr = HC.escAttr;

  var SLOT = 'home';
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
  // T118 音乐态基线快照状态（MUSIC_SNAP_KEY / musicSnap）已迁至 home-snapshot.js

  function d() { return global.document; }
  function $(sel) { var doc = d(); return doc && doc.querySelector ? doc.querySelector(sel) : null; }
  function $all(sel) {
    var doc = d();
    if (!doc || !doc.querySelectorAll) return [];
    return Array.prototype.slice.call(doc.querySelectorAll(sel));
  }
  function isVideoSpace() { return !!(SFV.state && SFV.state.isVideo()); }

  // T-#2：影视海报渲染/动作子系统抽到 home-poster-render.js（存储+posterStore 保留本文件）
  var renderVideoPoster = function () { if (SFV.homePosterRender && SFV.homePosterRender.render) return SFV.homePosterRender.render(); };
  var restructurePosterActionsForVideo = function () { if (SFV.homePosterRender && SFV.homePosterRender.restructure) return SFV.homePosterRender.restructure(); };
  var resetVideoPoster = function () { if (SFV.homePosterRender && SFV.homePosterRender.reset) return SFV.homePosterRender.reset(); };
  var pickLocalVideoPoster = function () { if (SFV.homePosterRender && SFV.homePosterRender.pickLocal) return SFV.homePosterRender.pickLocal(); };
  var pickVideoPoster = function () { if (SFV.homePosterRender && SFV.homePosterRender.pick) return SFV.homePosterRender.pick(); };

  // T-#2：影视卡片子系统抽到 home-cards.js（latestProgress/cardDefs/setCardText/getMusicLeftPoster/setCardArt）
  var latestProgress = function () { if (SFV.homeCards && SFV.homeCards.latestProgress) return SFV.homeCards.latestProgress(); };
  var cardDefs = function () {
    if (SFV.homeCards && typeof SFV.homeCards.cardDefs === 'function') return SFV.homeCards.cardDefs();
    return [];
  };
  var setCardText = function (card, def) { if (SFV.homeCards && SFV.homeCards.setCardText) return SFV.homeCards.setCardText(card, def); };
  var getMusicLeftPoster = function () { if (SFV.homeCards && SFV.homeCards.getMusicLeftPoster) return SFV.homeCards.getMusicLeftPoster(); };
  var setCardArt = function (card, flag) { if (SFV.homeCards && SFV.homeCards.setCardArt) return SFV.homeCards.setCardArt(card, flag); };

  // ---- 捕获阶段拦截：影视态下屏蔽卡片内联 onclick 的音乐逻辑 ----
  // T-#2：「接着看」与恢复播放子系统抽到 home-continue-watching.js（bindGridCapture/bindRailCapture/renderContinueWatching/resumeFromHistory/resumeById/resumeItem/scrollToRail）
  var bindGridCapture = function () { if (SFV.homeContinueWatching && SFV.homeContinueWatching.bindGridCapture) return SFV.homeContinueWatching.bindGridCapture(); };
  var bindRailCapture = function () { if (SFV.homeContinueWatching && SFV.homeContinueWatching.bindRailCapture) return SFV.homeContinueWatching.bindRailCapture(); };
  var renderContinueWatching = function () { if (SFV.homeContinueWatching && SFV.homeContinueWatching.renderContinueWatching) return SFV.homeContinueWatching.renderContinueWatching(); };

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
  // T-#2：音乐态基线快照子系统抽到 home-snapshot.js（captureMusicDefaults/applyMusicDefaults）
  var captureMusicDefaults = function () { if (SFV.homeSnapshot && SFV.homeSnapshot.captureMusicDefaults) return SFV.homeSnapshot.captureMusicDefaults(); };
  var applyMusicDefaults = function () { if (SFV.homeSnapshot && SFV.homeSnapshot.applyMusicDefaults) return SFV.homeSnapshot.applyMusicDefaults(); };

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

  SFV.home = { render: render, restoreMusic: restoreMusic, install: install, toast: toast, getUrlBar: function () { return urlBar; }, setUrlBar: function (v) { urlBar = v; }, cardDefs: cardDefs, renderContinueWatching: renderContinueWatching, captureMusicDefaults: captureMusicDefaults, applyMusicDefaults: applyMusicDefaults, renderVideoPoster: renderVideoPoster, pickVideoPoster: pickVideoPoster, setCardArt: setCardArt, pickLocalVideoPoster: pickLocalVideoPoster, resetVideoPoster: resetVideoPoster, getUserVideoPoster: getUserVideoPoster, setUserVideoPoster: setUserVideoPoster, clearUserVideoPoster: clearUserVideoPoster, editVideoPosterQuote: editVideoPosterQuote, saveVideoPosterQuote: saveVideoPosterQuote };
})(typeof window !== 'undefined' ? window : this);
