/*
 * Stellaflix 影视模块 — 数据分发层 (Step 2)
 * 双态同构核心：同一份 DOM，注册式 slot 按当前 spaceMode 选择 music/video provider 渲染。
 * 不持有任何具体 UI 内容，内容由 Step 3+ 的模块注册进来。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var slots = new Map(); // name -> { el, music, video }
  var bound = false;

  function currentSpace() {
    return SFV.state ? SFV.state.getSpace() : 'music';
  }

  function registerSlot(name, opts) {
    if (!name) throw new Error('dispatch.registerSlot: name required');
    opts = opts || {};
    slots.set(name, {
      el: opts.el || null,
      music: typeof opts.music === 'function' ? opts.music : null,
      video: typeof opts.video === 'function' ? opts.video : null,
    });
  }

  function unregisterSlot(name) {
    slots.delete(name);
  }

  function getSlot(name) {
    return slots.get(name) || null;
  }

  function renderSlot(name) {
    var slot = slots.get(name);
    if (!slot) return;
    var space = currentSpace();
    var provider = space === 'video' ? slot.video : slot.music;
    if (typeof provider === 'function') {
      try {
        provider(slot.el, { space: space, name: name });
      } catch (e) {
        if (global.console) global.console.error('[SFV dispatch] slot "' + name + '" render failed:', e);
      }
    }
  }

  function renderAll() {
    slots.forEach(function (_v, name) {
      renderSlot(name);
    });
  }

  function bind() {
    if (bound) return;
    if (SFV.state && SFV.state.EVENT && global.addEventListener) {
      global.addEventListener(SFV.state.EVENT, function () {
        renderAll();
      });
      bound = true;
    }
  }

  SFV.dispatch = {
    registerSlot: registerSlot,
    unregisterSlot: unregisterSlot,
    getSlot: getSlot,
    renderSlot: renderSlot,
    renderAll: renderAll,
    bind: bind,
  };
})(typeof window !== 'undefined' ? window : this);
