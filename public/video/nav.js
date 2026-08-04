/*
 * Stellaflix 影视模块 — 共享顶部导航栏组件 (T134 → T134c)
 *
 * 设计要点：
 *  - 5 tab 单一数据源 NAV_ITEMS（key 对齐 router id；home 走 goHome，不进 router）。
 *  - **直接挂到 document.body**（与 #search-area/#search-box 完全解耦），自带原生玻璃样式
 *    （与音乐态 #search-box 一致：var(--glass-bg) / var(--glass-border) / var(--glass-shadow)）。
 *  - **静态常驻**：T134c 起删除图钉按钮与自动隐藏/固定两态——顶栏始终可见；
 *    顶栏与页面内容之间的视觉间隙由 .sfv-browse--page .sfv-browse-body 的 padding-top 承担。
 *  - paintActive(key)：切 .active（DOM 是文字/显隐单一数据源，JS 不写 textContent）。
 *  - bindClick(handler)：document 捕获阶段 delegation。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  if (SFV.nav) return; // 幂等：避免重复加载

  var NAV_ITEMS = [
    { key: 'discover', label: '汇联' },
    { key: 'world',    label: '世界' },
    { key: 'home',     label: '首页' },
    { key: 'movie',    label: '电影' },
    { key: 'anime',    label: '动漫' }
  ];

  var mounted = null;        // <nav id="sfv-nav">
  var clickBound = false;
  var DEFAULT_KEY = 'home';

  function buildNav() {
    var nav = document.createElement('nav');
    nav.id = 'sfv-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', '影视导航');
    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var it = NAV_ITEMS[i];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sfv-nav-item';
      b.setAttribute('data-sfv-nav', it.key);
      b.textContent = it.label;
      nav.appendChild(b);
    }
    return nav;
  }

  // mount(parent)：挂到 body（默认）或指定父容器。幂等：旧节点先移除。
  function mount(parent) {
    parent = parent || document.body;
    if (!parent) return null;
    if (mounted && mounted.parentNode) {
      try { mounted.parentNode.removeChild(mounted); } catch (_) {}
    }
    var nav = buildNav();
    parent.appendChild(nav);
    mounted = nav;
    paintActive(DEFAULT_KEY);
    return nav;
  }

  // 维护当前激活 tab 高亮（仅切 .active；不写 textContent）
  function paintActive(key) {
    if (!mounted) return;
    var btns = mounted.querySelectorAll('.sfv-nav-item');
    for (var i = 0; i < btns.length; i++) {
      var k = btns[i].getAttribute('data-sfv-nav');
      btns[i].classList.toggle('active', k === key);
    }
  }

  // document 捕获阶段 click delegation
  function bindClick(handler) {
    if (clickBound) return;
    document.addEventListener('click', function (ev) {
      var item = ev.target && ev.target.closest ? ev.target.closest('.sfv-nav-item') : null;
      if (!item) return;
      ev.preventDefault();
      ev.stopPropagation();
      var key = item.getAttribute('data-sfv-nav');
      if (key && typeof handler === 'function') handler(key);
    }, true);
    clickBound = true;
  }

  function autoMount() {
    // 始终挂到 body（与 #search-area / #search-box 完全解耦）
    mount(document.body);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }

  SFV.nav = {
    NAV_ITEMS: NAV_ITEMS,
    mount: mount,
    paintActive: paintActive,
    bindClick: bindClick,
    get mounted() { return mounted; }
  };
})(typeof window !== 'undefined' ? window : this);