/*
 * Stellaflix 影视模块 — 影视态首页卡片子系统 (Step 3)
 *
 * 从 home.js 抽出（home.js 影视态首页拆债，目标 ≤500 行）。
 *   - latestProgress    ：取 progress 表里 updatedAt 最大的一条
 *   - cardDefs          ：影视态五卡定义（label/title/sub/action）
 *   - setCardText       ：写卡片 label/title/sub
 *   - getMusicLeftPoster：跨态连线读音乐态左侧个人海报
 *   - setCardArt        ：按 flag 类最新一条 pic 设卡片封面
 *
 * 依赖：homeCore（escAttr）、SFV.model / SFV.online / SFV.state（均运行期引用，本文件仅定义、不调用）。
 * 加载顺序：须晚于 home-core.js（取 escAttr）；home.js 经 SFV.homeCards 委托调用。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  var HC = SFV.homeCore;
  if (!HC) { throw new Error('[SFV home-cards] homeCore 未加载，请检查 index.html 加载顺序'); }
  var escAttr = HC.escAttr;

  function d() { return global.document; }

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
    // 片单数量以新的自建片单夹（SFV.collections）为准，与点击后打开的片单页一致
    var listN = 0;
    try {
      if (SFV.collections && SFV.collections.listUserFolders) {
        SFV.collections.listUserFolders().forEach(function (f) { listN += (f.items && f.items.length) || 0; });
      } else if (M.getKeysByFlag) {
        listN = count(M.getKeysByFlag('inList'));
      }
    } catch (e) { listN = M.getKeysByFlag ? count(M.getKeysByFlag('inList')) : 0; }
    var trackN = M.getTrackCount ? count(M.getTrackCount()) : 0;
    var histN = (SFV.watchHistory && SFV.watchHistory.getCount) ? SFV.watchHistory.getCount() : (M.getHistory ? count(M.getHistory()) : 0);

    return [
      {
        label: 'LIKED', title: '心动', sub: likedN ? ('已心动 ' + likedN + ' 部') : '进入浏览厅 · 挑片即看',
        flag: 'liked',
        action: function () { if (SFV.hall) SFV.hall.enter(); },
      },
      {
        label: 'LISTS', title: '片单', sub: listN ? ('片单 ' + listN + ' 部') : '想看的全放进来',
        flag: 'lists',
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
        action: function () { if (SFV.online) SFV.online.openPage('history', '观看历史'); },
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
    // T146：影视态接管卡片封面时，必须先清除音乐态 discover loading 留下的 home-skeleton 类。
    // 原因：.home-skeleton { position:relative } 在源码顺序上晚于 .home-card-art { position:absolute }，
    // 若同时存在会覆盖 absolute 定位，导致封面从右下角飘到左下角并把卡片撑高。
    art.classList.remove('home-skeleton');
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
    } else if (flag === 'lists') {
      // 连线：片单卡右侧展示用户片单夹中最新加入的影片海报
      try {
        if (SFV.collections && SFV.collections.listUserFolders) {
          var folders = SFV.collections.listUserFolders();
          var bestItem = null;
          // 以 addedAt 取最新加入（新数据）；无 addedAt 的旧数据回退到"最后文件夹的最后一个 item"
          folders.forEach(function (f) {
            var items = f.items || [];
            items.forEach(function (it) {
              if (!it || !it.poster) return;
              if (!bestItem || (it.addedAt || 0) > (bestItem.addedAt || 0)) bestItem = it;
            });
          });
          // 无 addedAt 时兜底：取最后一个非空文件夹的最后一张 poster
          if (!bestItem) {
            for (var fi = folders.length - 1; fi >= 0; fi--) {
              var items = folders[fi].items || [];
              for (var ii = items.length - 1; ii >= 0; ii--) {
                if (items[ii] && items[ii].poster) { bestItem = items[ii]; break; }
              }
              if (bestItem) break;
            }
          }
          if (bestItem) pic = bestItem.poster;
        }
      } catch (e) {}
    } else if (SFV.model && flag) {
      try {
        var pool = [];
        if (flag === 'history') {
          var h = (SFV.watchHistory && SFV.watchHistory.getAll) ? SFV.watchHistory.getAll() : ((SFV.model.getHistory && SFV.model.getHistory()) || []);
          for (var i = 0; i < h.length; i++) if (h[i] && (h[i].img || h[i].pic)) pool.push({ ts: h[i].ts || 0, pic: h[i].img || h[i].pic });
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

  SFV.homeCards = {
    latestProgress: latestProgress,
    cardDefs: cardDefs,
    setCardText: setCardText,
    getMusicLeftPoster: getMusicLeftPoster,
    setCardArt: setCardArt,
  };
})(typeof window !== 'undefined' ? window : this);
