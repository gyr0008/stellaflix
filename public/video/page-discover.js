/*
 * Stellaflix 影视模块 — 汇联页面 (T127)
 * 独立页面模块。当前为「板块建设中」占位页，结构已独立，后续可单独设计
 * 而不影响其它页面（满足「五个不同新页面」铁律）。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  SFV.router.register({
    id: 'discover',
    title: '汇联',
    mount: function (host) {
      var ui = SFV.ui;
      ui.setBrowseChrome(true);
      host.innerHTML = '';
      var wrap = ui.el('div', 'sfv-placeholder');
      wrap.appendChild(ui.el('div', 'sfv-placeholder-icon', '🛰️'));
      wrap.appendChild(ui.el('div', 'sfv-placeholder-title', '汇联板块建设中'));
      wrap.appendChild(ui.el('div', 'sfv-placeholder-sub', '该板块正在打磨，敬请期待。'));
      host.appendChild(wrap);
    },
    back: function () { return false; }
  });
})(typeof window !== 'undefined' ? window : this);
