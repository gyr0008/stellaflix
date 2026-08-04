/*
 * Stellaflix 影视模块 — 世界页面 (T127)
 * 独立页面模块。当前为「板块建设中」占位页，结构已独立，后续可单独设计
 * 而不影响其它页面（满足「五个不同新页面」铁律）。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  SFV.router.register({
    id: 'world',
    title: '世界',
    mount: function (host) {
      var ui = SFV.ui;
      ui.setBrowseChrome(true);
      host.innerHTML = '';
      var wrap = ui.el('div', 'sfv-placeholder');
      wrap.appendChild(ui.el('div', 'sfv-placeholder-icon', '🌍'));
      wrap.appendChild(ui.el('div', 'sfv-placeholder-title', '世界板块建设中'));
      wrap.appendChild(ui.el('div', 'sfv-placeholder-sub', '该板块正在打磨，敬请期待。'));
      host.appendChild(wrap);
    },
    back: function () { return false; }
  });
})(typeof window !== 'undefined' ? window : this);
