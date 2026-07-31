/*
 * Stellaflix 影视模块 — 视觉控制台「片源」分页（阶段 1）
 *
 * 【为什么要包装原函数】（均已在 index.html 亲验）
 *   1. 分页不是静态 HTML，由 organizeFxPanel()(25788) 运行时生成，tabMeta(25796) 硬编码 5 项；
 *      bindFxPanel() 在 31182 执行 —— 故本模块必须**等待 #fx-panel-tabs 出现后再注入**。
 *   2. setFxPanelTab(25753) 的 allowed 白名单(25754)硬编码 5 个 key，传入新 key 会被静默
 *      回落到 presets —— 故必须包装该全局函数，自行处理本页激活。
 *   3. .fx-panel-tabs(2052) 写死 grid-template-columns:repeat(5,...) —— 影视态需 CSS 覆盖为 6 列；
 *      音乐态本页按钮 display:none，grid 仅剩 5 项，原布局零影响。
 *
 * 【合规】本分页是「用户手动导入片源」的唯一入口，也是红线的落地方式：
 *   出厂零预置，全部自填。页首常驻风险提示，不可关闭。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var PAGE_KEY = 'sfvsource';
  var TAB_CLASS = 'sfv-fx-tab';
  var PAGE_CLASS = 'sfv-fx-page';
  var injected = false;
  var wrapped = false;
  var pageEl = null;
  var listEl = null;
  var pollTimer = null;
  var pollCount = 0;

  function d() { return global.document; }
  function byId(id) { var doc = d(); return doc && doc.getElementById ? doc.getElementById(id) : null; }
  function isVideoSpace() { return !!(SFV.state && SFV.state.isVideo()); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------------- 注入

  function injectTabAndPage() {
    if (injected) return true;
    var tabs = byId('fx-panel-tabs');
    var panel = byId('fx-panel');
    if (!tabs || !panel) return false;

    var btn = d().createElement('button');
    btn.type = 'button';
    btn.className = TAB_CLASS;
    btn.setAttribute('data-fx-tab', PAGE_KEY);
    btn.textContent = '片源';
    tabs.appendChild(btn);

    pageEl = d().createElement('div');
    pageEl.className = 'fx-tab-page ' + PAGE_CLASS;
    pageEl.setAttribute('data-fx-page', PAGE_KEY);
    pageEl.innerHTML = buildPageHtml();
    panel.appendChild(pageEl);

    listEl = pageEl.querySelector('.sfv-src-list');
    bindPageEvents();
    renderList();
    injected = true;
    return true;
  }

  function buildPageHtml() {
    return '' +
      '<div class="fx-section-label">片源管理</div>' +
      '<div class="sfv-src-notice">' +
        'Stellaflix <strong>不提供、不存储</strong>任何影视资源，出厂不预置任何片源。' +
        '此处的站点由你自行添加，请自行确认其合法性与安全性，并遵守当地法律法规。' +
      '</div>' +
      '<div class="sfv-src-form">' +
        '<input class="sfv-src-name" type="text" placeholder="名称（可留空，默认取域名）">' +
        '<input class="sfv-src-api" type="text" placeholder="CMS10 接口地址，如 https://.../api.php/provide/vod">' +
        '<div class="sfv-src-form-row">' +
          '<button type="button" class="fx-mini-btn sfv-src-add">添加片源</button>' +
          '<span class="sfv-src-hint"></span>' +
        '</div>' +
      '</div>' +
      '<div class="fx-section-label">已添加</div>' +
      '<div class="sfv-src-list"></div>';
  }

  function renderList() {
    if (!listEl) return;
    var list = (SFV.sources && SFV.sources.getSources()) || [];
    if (!list.length) {
      listEl.innerHTML = '<div class="sfv-src-empty">还没有片源。添加后即可在影视空间中搜索与播放。</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      html += '<div class="sfv-src-item" data-sid="' + esc(s.id) + '">' +
        '<div class="sfv-src-item-main">' +
          '<div class="sfv-src-item-name">' + esc(s.name) + '</div>' +
          '<div class="sfv-src-item-api">' + esc(s.api) + '</div>' +
          '<div class="sfv-src-item-state"></div>' +
        '</div>' +
        '<div class="sfv-src-item-ops">' +
          '<button type="button" class="fx-mini-btn sfv-src-toggle">' + (s.enabled ? '已启用' : '已停用') + '</button>' +
          '<button type="button" class="fx-mini-btn ghost sfv-src-test">测试</button>' +
          '<button type="button" class="fx-mini-btn ghost sfv-src-del">删除</button>' +
        '</div>' +
      '</div>';
    }
    listEl.innerHTML = html;
  }

  function hint(msg, bad) {
    var el = pageEl && pageEl.querySelector('.sfv-src-hint');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'sfv-src-hint' + (bad ? ' bad' : '');
  }

  var REASON_TEXT = {
    'empty-api': '接口地址不能为空',
    'invalid-api-url': '接口地址格式不正确',
    'duplicate-api': '该接口已存在',
    'empty-list': '接口可达，但没有返回数据',
    'invalid-json': '返回内容不是合法 JSON',
    'fetch-unavailable': '当前环境不支持网络请求',
  };
  function reasonText(r) {
    if (!r) return '未知原因';
    if (REASON_TEXT[r]) return REASON_TEXT[r];
    if (r.indexOf('unsupported-scheme') === 0) return '仅支持 http / https';
    if (r.indexOf('http-') === 0) return '服务端返回 ' + r.slice(5);
    if (r === 'AbortError' || /abort/i.test(r)) return '请求超时';
    return r;
  }

  function bindPageEvents() {
    if (!pageEl) return;

    pageEl.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.classList) return;

      if (t.classList.contains('sfv-src-add')) {
        var nameEl = pageEl.querySelector('.sfv-src-name');
        var apiEl = pageEl.querySelector('.sfv-src-api');
        var res = SFV.sources.addSource({ name: nameEl.value, api: apiEl.value });
        if (!res.ok) { hint(reasonText(res.reason), true); return; }
        nameEl.value = ''; apiEl.value = '';
        hint('已添加：' + res.source.name, false);
        renderList();
        return;
      }

      var item = t.closest ? t.closest('.sfv-src-item') : null;
      if (!item) return;
      var sid = item.getAttribute('data-sid');
      var stateEl = item.querySelector('.sfv-src-item-state');

      if (t.classList.contains('sfv-src-del')) {
        SFV.sources.removeSource(sid);
        renderList();
        return;
      }

      if (t.classList.contains('sfv-src-toggle')) {
        var all = SFV.sources.getSources();
        var cur = null;
        for (var i = 0; i < all.length; i++) if (all[i].id === sid) cur = all[i];
        if (!cur) return;
        SFV.sources.setEnabled(sid, !cur.enabled);
        renderList();
        return;
      }

      if (t.classList.contains('sfv-src-test')) {
        var all2 = SFV.sources.getSources();
        var src = null;
        for (var j = 0; j < all2.length; j++) if (all2[j].id === sid) src = all2[j];
        if (!src) return;
        t.disabled = true;
        if (stateEl) { stateEl.textContent = '测试中…'; stateEl.className = 'sfv-src-item-state'; }
        SFV.sources.testSource(src).then(function (r) {
          t.disabled = false;
          if (!stateEl) return;
          if (r.ok) {
            stateEl.textContent = '可用 · 返回 ' + r.count + ' 条 · ' + r.ms + 'ms';
            stateEl.className = 'sfv-src-item-state ok';
          } else {
            stateEl.textContent = '不可用：' + reasonText(r.reason);
            stateEl.className = 'sfv-src-item-state bad';
          }
        });
      }
    });

    pageEl.addEventListener('keydown', function (ev) {
      if (ev && (ev.key === 'Enter' || ev.keyCode === 13)) {
        var t = ev.target;
        if (t && t.classList && (t.classList.contains('sfv-src-api') || t.classList.contains('sfv-src-name'))) {
          var btn = pageEl.querySelector('.sfv-src-add');
          if (btn) btn.click();
        }
      }
    });
  }

  // ---------------------------------------------------------------- 分页切换

  function activateOwnPage() {
    var panel = byId('fx-panel');
    if (panel) panel.setAttribute('data-active-tab', PAGE_KEY);
    try { global.fxPanelTab = PAGE_KEY; } catch (e) {}
    var doc = d();
    var btns = doc.querySelectorAll('#fx-panel-tabs [data-fx-tab]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-fx-tab') === PAGE_KEY);
    }
    var pages = doc.querySelectorAll('#fx-panel .fx-tab-page');
    for (var j = 0; j < pages.length; j++) {
      pages[j].classList.toggle('active', pages[j].getAttribute('data-fx-page') === PAGE_KEY);
    }
    if (typeof global.repositionFxFloatingPanels === 'function') {
      try { global.repositionFxFloatingPanels(); } catch (e) {}
    }
    renderList();
  }

  // 包装全局 setFxPanelTab：原函数白名单不含本页 key，会静默回落到 presets。
  function wrapSetter() {
    if (wrapped) return;
    var orig = global.setFxPanelTab;
    if (typeof orig !== 'function') return;
    global.setFxPanelTab = function (tab) {
      if (tab === PAGE_KEY) { activateOwnPage(); return; }
      return orig.apply(this, arguments);
    };
    global.setFxPanelTab.__sfvOriginal = orig;
    wrapped = true;
  }

  function isOwnPageActive() {
    var panel = byId('fx-panel');
    return !!(panel && panel.getAttribute('data-active-tab') === PAGE_KEY);
  }

  // 切回音乐态时本页按钮被隐藏，若仍停留在本页需回落，否则控制台会显示空白。
  function onSpaceChange() {
    if (!isVideoSpace() && isOwnPageActive()) {
      var fn = (global.setFxPanelTab && global.setFxPanelTab.__sfvOriginal) || global.setFxPanelTab;
      if (typeof fn === 'function') { try { fn('presets'); } catch (e) {} }
    }
  }

  // ---------------------------------------------------------------- 启动

  function tryInstall() {
    if (injectTabAndPage()) {
      wrapSetter();
      if (pollTimer) { global.clearInterval(pollTimer); pollTimer = null; }
      return true;
    }
    return false;
  }

  function boot() {
    if (tryInstall()) return;
    // #fx-panel-tabs 由 bindFxPanel() 在主脚本尾部创建，时机晚于本文件加载，故轮询等待。
    pollTimer = global.setInterval(function () {
      pollCount++;
      if (tryInstall() || pollCount > 120) {
        if (pollTimer) { global.clearInterval(pollTimer); pollTimer = null; }
      }
    }, 250);
  }

  function start() {
    var doc = d();
    // 注意：spacechange 由 state.js:38 在 **window** 上派发（global.dispatchEvent），
    // 不是 document —— 监听错目标会静默收不到事件。
    if (global.addEventListener) global.addEventListener('spacechange', onSpaceChange);
    if (doc && doc.readyState === 'loading' && doc.addEventListener) {
      doc.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
  start();

  SFV.fxSources = {
    PAGE_KEY: PAGE_KEY,
    renderList: renderList,
    activate: activateOwnPage,
    isInjected: function () { return injected; },
    isWrapped: function () { return wrapped; },
    reasonText: reasonText,
  };
})(typeof window !== 'undefined' ? window : this);
