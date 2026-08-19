/*
 * gsap-waapi-shim.js — GSAP 兼容微引擎（vanilla classic script，无 ES module）
 *
 * 目的：移除对 gsap.min.js（GreenSock Standard License，专有、非 OSI）的运行时依赖，
 *       解除 GPL-3.0 §7「禁止附加额外限制」的合规冲突。
 *
 * 实现：GSAP 风格的 rAF 补间引擎。对 DOM 元素逐帧写 inline style（与 GSAP CSSPlugin 行为一致，
 *       GSAP 本身也是 rAF 写 inline style，并非 WAAPI），对普通 JS 对象（如 THREE.Object3D
 *       的 position/scale、group.userData）补间数值属性——对 DOM 与对象统一处理，
 *       因此 3D 歌单架转场（legacy-music.js 用 gsap 给 Three.js 对象做补间）也能正常工作。
 *
 * 支持 API：gsap.to / fromTo / set / killTweensOf / timeline / delayedCall
 * 支持 vars（基于实测调用面）：
 *   变换：x y z scale scaleX scaleY rotation(deg)
 *   视觉：autoAlpha opacity color backgroundColor boxShadow filter
 *   布局：width height scrollTop transformOrigin visibility display zIndex 及其他数值 CSS 属性
 *   时序：duration(s) delay(s) stagger ease repeat yoyo overwrite clearProps
 *   回调：onStart onUpdate onComplete
 * 缓动（真实数学公式，高保真，非 cubic-bezier 近似）：
 *   power1..4（in/out/inOut） expo sine circ back.out(n) elastic.out(a,p) linear/none
 *
 * 降级：无 requestAnimationFrame / document（node 测试环境）时，直接套用终态并触发 onComplete，
 *       保证可断言、不崩。
 *
 * 注意：本文件替换 index.html 中的 gsap.min.js 加载，legacy-music.js / cover-flow.js 全部
 *       调用点（window.gsap.*）保持不变。
 */
(function (global) {
  'use strict';

  var HAS_RAF = (typeof global.requestAnimationFrame === 'function') &&
    (typeof global.performance !== 'undefined' && typeof global.performance.now === 'function');
  var HAS_DOM = (typeof global.document !== 'undefined' && typeof global.getComputedStyle === 'function');

  // ---------------------------------------------------------------- 缓动函数
  function makePower(n, dir) {
    return function (t) {
      if (dir === 'in') return Math.pow(t, n);
      if (dir === 'out') return 1 - Math.pow(1 - t, n);
      return t < 0.5 ? Math.pow(t * 2, n) / 2 : 1 - Math.pow(-2 * t + 2, n) / 2;
    };
  }
  function expo(dir) {
    return function (t) {
      if (dir === 'in') return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
      if (dir === 'out') return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    };
  }
  function sine(dir) {
    return function (t) {
      if (dir === 'in') return 1 - Math.cos(t * Math.PI / 2);
      if (dir === 'out') return Math.sin(t * Math.PI / 2);
      return -(Math.cos(Math.PI * t) - 1) / 2;
    };
  }
  function circ(dir) {
    return function (t) {
      if (dir === 'in') return 1 - Math.sqrt(1 - t * t);
      if (dir === 'out') return Math.sqrt(1 - (t - 1) * (t - 1));
      return t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
    };
  }
  function backOut(s) {
    s = (s == null) ? 1.70158 : s;
    return function (t) { return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
  }
  function elasticOut(a, p) {
    if (a == null) a = 1; if (p == null) p = 0.3;
    var s = p / (2 * Math.PI) * Math.asin(1 / a);
    return function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return a * Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1;
    };
  }
  var E = {
    linear: function (t) { return t; },
    none: function (t) { return t; },
    power1out: makePower(1, 'out'),
    power1in: makePower(1, 'in'),
    power1inOut: makePower(1, 'inOut'),
    power2out: makePower(2, 'out'),
    power2in: makePower(2, 'in'),
    power2inOut: makePower(2, 'inOut'),
    power3out: makePower(3, 'out'),
    power3in: makePower(3, 'in'),
    power3inOut: makePower(3, 'inOut'),
    power4out: makePower(4, 'out'),
    power4in: makePower(4, 'in'),
    power4inOut: makePower(4, 'inOut')
  };
  var ALIAS = { quad: 'power1', cubic: 'power2', quart: 'power3', quint: 'power4' };

  function parseEase(e) {
    if (typeof e === 'function') return e;
    if (!e) return E.power1out;
    var s = String(e).trim();
    var args = null, paren = s.indexOf('(');
    var rest = s;
    if (paren >= 0) {
      rest = s.slice(0, paren);
      var close = s.indexOf(')');
      var inner = (close > paren) ? s.slice(paren + 1, close) : '';
      args = inner.split(',').map(function (x) { return parseFloat(x); });
    }
    var parts = rest.split('.');
    var name = parts[0].toLowerCase();
    var dir = parts[1] ? parts[1].toLowerCase() : 'out';
    if (ALIAS[name]) name = ALIAS[name];
    if (name === 'linear' || name === 'none') return E.linear;
    if (name === 'back') return backOut(args && args.length ? args[0] : undefined);
    if (name === 'elastic') return elasticOut(args && args.length ? args[0] : 1, args && args.length > 1 ? args[1] : 0.3);
    if (name === 'expo') return expo(dir);
    if (name === 'sine') return sine(dir);
    if (name === 'circ') return circ(dir);
    if (name.indexOf('power') === 0) {
      var n = parseInt(name.slice(5), 10) || 1;
      return makePower(n, (name.indexOf('inout') >= 0) ? 'inOut' : dir);
    }
    return E.power1out;
  }

  // ---------------------------------------------------------------- 工具
  var RESERVED = {
    duration: 1, delay: 1, ease: 1, repeat: 1, yoyo: 1, stagger: 1, overwrite: 1,
    clearProps: 1, onStart: 1, onUpdate: 1, onComplete: 1, onStartParams: 1,
    onUpdateParams: 1, onCompleteParams: 1, paused: 1, immediateRender: 1,
    lazy: 1, callbackScope: 1, paused: 1, reversed: 1, yoyoEase: 1
  };
  var TRANSFORM_KEYS = {
    x: 'tx', y: 'ty', z: 'tz',
    scale: 's', scaleX: 'sx', scaleY: 'sy',
    rotation: 'rot', rotationX: 'rx', rotationY: 'ry', rotationZ: 'rz',
    skewX: 'skx', skewY: 'sky'
  };
  var PX_PROPS = {
    width: 1, height: 1, top: 1, left: 1, right: 1, bottom: 1,
    marginTop: 1, marginRight: 1, marginBottom: 1, marginLeft: 1,
    paddingTop: 1, paddingRight: 1, paddingBottom: 1, paddingLeft: 1,
    borderRadius: 1, borderWidth: 1, fontSize: 1, letterSpacing: 1,
    minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1,
    translateX: 1, translateY: 1
  };
  var STATIC_PROPS = { transformOrigin: 1, visibility: 1, display: 1, zIndex: 1, pointerEvents: 1, position: 1, overflow: 1 };

  function isDomTarget(t) {
    return t && typeof t === 'object' && !Array.isArray(t) && (typeof t.nodeType === 'number' || (t.style && typeof t.style === 'object'));
  }
  function normalizeTargets(t) {
    if (t == null) return [];
    if (typeof t === 'string') {
      if (!HAS_DOM) return [];
      var list = global.document.querySelectorAll(t);
      return Array.prototype.slice.call(list);
    }
    if (Array.isArray(t)) {
      var out = [];
      for (var i = 0; i < t.length; i++) {
        var sub = normalizeTargets(t[i]);
        for (var j = 0; j < sub.length; j++) out.push(sub[j]);
      }
      return out;
    }
    return [t];
  }
  function getCache(el) {
    if (!el.__sfvShim) el.__sfvShim = { tx: 0, ty: 0, tz: 0, sx: 1, sy: 1, rot: 0, opacity: 1, visibility: 'visible' };
    return el.__sfvShim;
  }
  function readComputed(el, prop) {
    if (!HAS_DOM) return '';
    try { return global.getComputedStyle(el, null)[prop]; } catch (e) { return ''; }
  }
  function seedTransformFromMatrix(el) {
    var c = readComputed(el, 'transform');
    var m = getCache(el);
    if (c && c !== 'none') {
      var nums = c.match(/-?\d*\.?\d+/g);
      if (nums && nums.length >= 6) {
        var a = +nums[0], b = +nums[1], c2 = +nums[2], d = +nums[3], e = +nums[4], f = +nums[5];
        m.sx = Math.sqrt(a * a + b * b) || 1;
        m.sy = Math.sqrt(c2 * c2 + d * d) || 1;
        m.rot = Math.atan2(b, a) * 180 / Math.PI;
        m.tx = e; m.ty = f;
      }
    }
    return m;
  }

  // ---- 颜色解析 / 插值 ----
  function parseColor(css) {
    if (!css) return [0, 0, 0, 0];
    css = String(css).trim();
    if (css === 'transparent') return [0, 0, 0, 0];
    var m;
    if (css.charAt(0) === '#') {
      var h = css.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
      var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      var a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return [r, g, b, a];
    }
    m = css.match(/rgba?\(([^)]+)\)/);
    if (m) {
      var p = m[1].split(',').map(function (x) { return parseFloat(x); });
      return [p[0] || 0, p[1] || 0, p[2] || 0, (p[3] == null) ? 1 : p[3]];
    }
    return [0, 0, 0, 1];
  }
  function lerpColor(a, b, t) {
    return 'rgba(' +
      Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ',' +
      (Math.round((a[3] + (b[3] - a[3]) * t) * 1000) / 1000) + ')';
  }

  // ---- boxShadow：逐阴影解析与插值（支持多阴影；数量不一致则安全 fallback 到 to 值）----
  function splitShadows(css) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < css.length; i++) {
      var ch = css[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
  }
  function parseOneShadow(s) {
    var inset = /\binset\b/i.test(s);
    var s2 = s.replace(/\binset\b/gi, '').trim();
    var colorMatch = s2.match(/rgba?\([^)]*\)/i) || s2.match(/#[0-9a-fA-F]{3,8}\b/);
    var color = null, colorStr = '';
    if (colorMatch) {
      colorStr = colorMatch[0];
      color = parseColor(colorStr);
      s2 = (s2.slice(0, colorMatch.index) + s2.slice(colorMatch.index + colorMatch[0].length)).trim();
    }
    var nums = (s2.match(/-?\d*\.?\d+/g) || []).map(Number);
    return { inset: inset, color: color, nums: nums };
  }
  function parseShadow(css) {
    if (!css) return null;
    var parts = splitShadows(String(css).trim());
    if (!parts.length) return null;
    return { list: parts.map(parseOneShadow) };
  }
  function shadowToCss(shadowObj) {
    if (!shadowObj || !shadowObj.list || !shadowObj.list.length) return '';
    return shadowObj.list.map(function (sh) {
      var nums = (sh.nums && sh.nums.length ? sh.nums : [0, 0, 0, 0]).map(function (n) { return (Math.round(n * 100) / 100) + 'px'; });
      return (sh.inset ? 'inset ' : '') + nums.join(' ') + ' ' + lerpColor(sh.color || [0, 0, 0, 1], sh.color || [0, 0, 0, 1], 1);
    }).join(', ');
  }
  function lerpShadow(a, b, t) {
    if (!a || !b || !a.list || !b.list || a.list.length !== b.list.length) return null;
    var out = [];
    for (var i = 0; i < a.list.length; i++) {
      var sa = a.list[i], sb = b.list[i];
      var maxLen = Math.max(sa.nums.length, sb.nums.length);
      var nums = [];
      for (var k = 0; k < maxLen; k++) {
        var va = sa.nums[k] != null ? sa.nums[k] : 0;
        var vb = sb.nums[k] != null ? sb.nums[k] : 0;
        nums.push(va + (vb - va) * t);
      }
      var col = lerpColor(sa.color || [0, 0, 0, 1], sb.color || [0, 0, 0, 1], t);
      out.push((sa.inset || sb.inset ? 'inset ' : '') + nums.map(function (n) { return (Math.round(n * 100) / 100) + 'px'; }).join(' ') + ' ' + col);
    }
    return out.join(', ');
  }

  // ---- 通用数值字符串插值（filter 等）----
  function lerpNumericString(a, b, t) {
    var ra = (a.match(/-?\d*\.?\d+/g) || []).map(Number);
    var rb = (b.match(/-?\d*\.?\d+/g) || []).map(Number);
    if (ra.length !== rb.length) return null;
    var ri = 0;
    return b.replace(/-?\d*\.?\d+/g, function () {
      var v = ra[ri] + (rb[ri] - ra[ri]) * t; ri++;
      return String(Math.round(v * 1000) / 1000);
    });
  }

  // ---------------------------------------------------------------- 属性分类与读写
  function classify(key) {
    if (TRANSFORM_KEYS[key]) return 'transform';
    if (key === 'autoAlpha') return 'autoAlpha';
    if (key === 'opacity') return 'opacity';
    if (key === 'scrollTop') return 'scrollTop';
    if (key === 'color' || key === 'backgroundColor') return 'color';
    if (key === 'boxShadow') return 'boxShadow';
    if (key === 'filter') return 'filter';
    if (STATIC_PROPS[key]) return 'static';
    return 'cssnum';
  }
  function cssNum(str) {
    if (str == null) return 0;
    var m = String(str).match(/-?\d*\.?\d+/);
    return m ? parseFloat(m[0]) : 0;
  }
  function cssUnit(str) {
    if (str == null) return '';
    var m = String(str).match(/[a-z%]*$/i);
    return m ? m[0] : '';
  }

  function readStart(el, key, type, toVal) {
    if (type === 'transform') {
      var c = seedTransformFromMatrix(el);
      var tk = TRANSFORM_KEYS[key];
      if (tk === 's') return c.sx;
      return c[tk];
    }
    if (type === 'autoAlpha' || type === 'opacity') {
      var cv = parseFloat(readComputed(el, 'opacity'));
      return isNaN(cv) ? 1 : cv;
    }
    if (type === 'scrollTop') return el.scrollTop || 0;
    if (type === 'color') return parseColor(readComputed(el, key));
    if (type === 'boxShadow') return parseShadow(readComputed(el, 'boxShadow'));
    if (type === 'filter') return readComputed(el, 'filter') || '';
    if (type === 'static') return readComputed(el, key) || '';
    // cssnum
    var comp = readComputed(el, key);
    if (comp == null || comp === '') return 0;
    return cssNum(comp);
  }

  function writeValue(el, key, type, value, toVal) {
    var cache = getCache(el);
    if (type === 'transform') {
      var tk = TRANSFORM_KEYS[key];
      if (tk === 's') { cache.sx = value; cache.sy = value; }
      else cache[tk] = value;
      var t = 'translate3d(' + cache.tx + 'px,' + cache.ty + 'px,' + cache.tz + 'px) ' +
        'scale(' + cache.sx + ',' + cache.sy + ') rotate(' + cache.rot + 'deg)';
      el.style.transform = t;
      return;
    }
    if (type === 'autoAlpha') {
      el.style.opacity = String(value);
      el.style.visibility = (value > 0.001) ? 'visible' : 'hidden';
      cache.opacity = value;
      return;
    }
    if (type === 'opacity') {
      el.style.opacity = String(value);
      cache.opacity = value;
      return;
    }
    if (type === 'scrollTop') { el.scrollTop = value; return; }
    if (type === 'color') { el.style[key] = lerpColor([0, 0, 0, 0], value, 1); return; }
    if (type === 'boxShadow') { el.style.boxShadow = (typeof value === 'string') ? value : ''; return; }
    if (type === 'filter') { el.style.filter = (typeof value === 'string') ? value : ''; return; }
    if (type === 'static') { el.style[key] = String(toVal); return; }
    // cssnum
    if (typeof value === 'number') {
      var unit = (PX_PROPS[key]) ? 'px' : (toVal != null && typeof toVal === 'string' && cssUnit(toVal) ? cssUnit(toVal) : '');
      el.style[key] = String(Math.round(value * 1000) / 1000) + unit;
    } else {
      el.style[key] = String(value);
    }
  }

  function applyColorDirect(el, key, fromC, toC) {
    el.style[key] = lerpColor(fromC, toC, 1);
  }
  function applyShadowDirect(el, fromS, toS) {
    el.style.boxShadow = shadowToCss(toS) || shadowToCss(fromS) || '';
  }
  function applyFilterDirect(el, fromS, toS) {
    var r = lerpNumericString(fromS, toS, 1);
    el.style.filter = r || toS;
  }

  // ---------------------------------------------------------------- Tween
  var tweens = [];
  var rafId = null;

  function Tween(target, vars, fromVars) {
    this.target = target;
    this.isDom = isDomTarget(target);
    this.vars = vars;
    this.fromVars = fromVars || null;
    this.isFromTo = !!fromVars;
    this.duration = (vars.duration != null ? vars.duration : 0.5) * 1000;
    this.delay = (vars.delay || 0) * 1000;
    this.ease = parseEase(vars.ease);
    this.repeat = vars.repeat || 0;
    this.yoyo = !!vars.yoyo;
    this.onComplete = vars.onComplete;
    this.onUpdate = vars.onUpdate;
    this.onStart = vars.onStart;
    this.overwrite = vars.overwrite;
    this.clearProps = vars.clearProps;
    this.cycleStart = null;
    this.cycle = 0;
    this.totalCycles = (this.repeat || 0) + 1;
    this.cancelled = false;
    this.started = false;
    this.build();
  }

  Tween.prototype.build = function () {
    this.props = [];
    var endVars = this.vars;
    var startVars = this.isFromTo ? this.fromVars : null;
    var target = this.target;
    for (var key in endVars) {
      if (!endVars.hasOwnProperty(key) || RESERVED[key]) continue;
      if (this.isFromTo && !startVars.hasOwnProperty(key)) continue; // fromTo 仅动显式给出的键
      var type = classify(key);
      var toVal = endVars[key];
      var fromVal, interp;
      if (this.isDom) {
        fromVal = this.isFromTo ? startVars[key] : readStart(target, key, type, toVal);
        if (type === 'transform') {
          interp = { key: key, type: 'transform', from: fromVal, to: toVal };
        } else if (type === 'autoAlpha' || type === 'opacity') {
          interp = { key: key, type: type, from: this.isFromTo ? fromVal : (typeof fromVal === 'number' ? fromVal : 1), to: toVal };
        } else if (type === 'scrollTop') {
          interp = { key: key, type: 'scrollTop', from: this.isFromTo ? fromVal : (target.scrollTop || 0), to: toVal };
        } else if (type === 'color') {
          var fc = this.isFromTo ? parseColor(fromVal) : (Array.isArray(fromVal) ? fromVal : parseColor(readComputed(target, key)));
          interp = { key: key, type: 'color', from: fc, to: parseColor(toVal) };
        } else if (type === 'boxShadow') {
          var fs = this.isFromTo ? parseShadow(fromVal) : parseShadow(readComputed(target, 'boxShadow'));
          interp = { key: key, type: 'boxShadow', from: fs, to: parseShadow(toVal) };
        } else if (type === 'filter') {
          var ff = this.isFromTo ? (fromVal || '') : (typeof fromVal === 'string' ? fromVal : '');
          interp = { key: key, type: 'filter', from: ff, to: (toVal || '') };
        } else {
          // static / cssnum
          interp = { key: key, type: type, from: this.isFromTo ? cssNum(fromVal) : (typeof fromVal === 'number' ? fromVal : cssNum(fromVal)), to: toVal };
        }
      } else {
        // 普通 JS 对象：数值属性补间
        fromVal = this.isFromTo ? startVars[key] : (typeof target[key] === 'number' ? target[key] : 0);
        interp = { key: key, type: 'object', from: fromVal, to: toVal };
      }
      this.props.push(interp);
    }
  };

  Tween.prototype.render = function (p) {
    var eased = this.ease(p);
    var t = this.target;
    for (var i = 0; i < this.props.length; i++) {
      var pr = this.props[i];
      if (pr.type === 'object') {
        t[pr.key] = pr.from + (pr.to - pr.from) * eased;
        continue;
      }
      var v = pr.from + (pr.to - pr.from) * eased;
      if (pr.type === 'color') {
        applyColorDirect(t, pr.key, pr.from, pr.to);
      } else if (pr.type === 'boxShadow') {
        if (p >= 1) applyShadowDirect(t, pr.from, pr.to);
        else {
          var r = lerpShadow(pr.from, pr.to, eased);
          t.style.boxShadow = r || shadowToCss(pr.to) || shadowToCss(pr.from) || '';
        }
      } else if (pr.type === 'filter') {
        var rf = lerpNumericString(pr.from, pr.to, eased);
        t.style.filter = rf || pr.to;
      } else {
        writeValue(t, pr.key, pr.type, v, pr.to);
      }
    }
    if (this.onUpdate) {
      try { this.onUpdate.call(t, eased, this); } catch (e) {}
    }
  };

  Tween.prototype.start = function () {
    if (this.started) return;
    this.started = true;
    if (this.onStart) { try { this.onStart.call(this.target, this); } catch (e) {} }
    // fromTo：立即落 from 态
    if (this.isFromTo) this.render(0);
  };

  Tween.prototype.complete = function () {
    if (this.clearProps) {
      var keys = String(this.clearProps).split(',');
      var c = (this.isDom && this.target.__sfvShim) ? this.target.__sfvShim : null;
      for (var k = 0; k < keys.length; k++) {
        var kk = keys[k].trim();
        if (!kk) continue;
        if (this.isDom) {
          if (this.target.style) this.target.style[kk] = '';
          if (c) { var tk = TRANSFORM_KEYS[kk]; if (tk === 's') { c.sx = 1; c.sy = 1; } else if (tk && c[tk] != null) c[tk] = (tk === 'sx' || tk === 'sy') ? 1 : 0; }
        }
      }
    }
    if (this.onComplete) { try { this.onComplete.call(this.target, this); } catch (e) {} }
  };

  Tween.prototype.tick = function (now) {
    if (this.cycleStart == null) {
      this.cycleStart = now + this.delay;
      this.start();
    }
    var elapsed = now - this.cycleStart;
    if (elapsed < 0) return false;
    var raw = this.duration > 0 ? elapsed / this.duration : 1;
    if (raw > 1) raw = 1;
    var p = raw;
    if (this.yoyo && (this.cycle % 2 === 1)) p = 1 - raw; // 奇数周期反向
    this.render(p);
    if (raw >= 1) {
      if (this.cycle < this.totalCycles - 1) {
        this.cycle++;
        this.cycleStart = now;
        return false;
      }
      return true; // 完成
    }
    return false;
  };

  // ---------------------------------------------------------------- 全局 rAF 循环
  function loop(now) {
    rafId = null;
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      if (tw.cancelled) { tweens.splice(i, 1); continue; }
      var done = tw.tick(now);
      if (done) {
        tweens.splice(i, 1);
        tw.complete();
      }
    }
    if (tweens.length) rafId = global.requestAnimationFrame(loop);
  }
  function ensureLoop() {
    if (HAS_RAF && rafId == null) rafId = global.requestAnimationFrame(loop);
  }

  function killTweensOf(target, props) {
    var norm = normalizeTargets(target);
    var propList = (typeof props === 'string') ? props.split(',').map(function (s) { return s.trim(); }) : null;
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      var hit = false;
      for (var j = 0; j < norm.length; j++) {
        if (tw.target === norm[j]) { hit = true; break; }
      }
      if (!hit) continue;
      if (propList) {
        // 仅移除指定属性
        var kept = [];
        for (var k = 0; k < tw.props.length; k++) {
          if (propList.indexOf(tw.props[k].key) >= 0) { /* drop */ } else kept.push(tw.props[k]);
        }
        tw.props = kept;
        if (!kept.length) { tw.cancelled = true; tweens.splice(i, 1); }
      } else {
        tw.cancelled = true;
        tweens.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- 公开 API
  function spawn(targets, vars, fromVars) {
    if (vars && vars.overwrite) {
      var ns = normalizeTargets(targets);
      for (var i = 0; i < ns.length; i++) killTweensOf(ns[i]);
    }
    var list = normalizeTargets(targets);
    var created = [];
    var stagger = vars && vars.stagger ? vars.stagger : 0;
    for (var k = 0; k < list.length; k++) {
      var tv = vars;
      if (stagger && list.length > 1) {
        tv = {};
        for (var vk in vars) if (vars.hasOwnProperty(vk)) tv[vk] = vars[vk];
        tv.delay = (vars.delay || 0) + stagger * k;
      }
      var tw = new Tween(list[k], tv, fromVars);
      if (!HAS_RAF) {
        // 降级：直接套终态并触发回调
        tw.start();
        tw.render(1);
        tw.complete();
      } else {
        tweens.push(tw);
      }
      created.push(tw);
    }
    ensureLoop();
    return created.length === 1 ? created[0] : created;
  }

  function to(targets, vars) { return spawn(targets, vars, null); }
  function fromTo(targets, fromVars, vars) { return spawn(targets, vars, fromVars); }
  function set(targets, vars) {
    var list = normalizeTargets(targets);
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (isDomTarget(t)) {
        for (var key in vars) {
          if (!vars.hasOwnProperty(key) || RESERVED[key]) continue;
          var type = classify(key);
          if (type === 'transform') {
            var cache = getCache(t); var tk = TRANSFORM_KEYS[key];
            if (tk === 's') { cache.sx = vars[key]; cache.sy = vars[key]; }
            else cache[tk] = vars[key];
            t.style.transform = 'translate3d(' + cache.tx + 'px,' + cache.ty + 'px,' + cache.tz + 'px) scale(' + cache.sx + ',' + cache.sy + ') rotate(' + cache.rot + 'deg)';
          } else if (type === 'autoAlpha') {
            t.style.opacity = String(vars[key]);
            t.style.visibility = (vars[key] > 0.001) ? 'visible' : 'hidden';
          } else if (type === 'color') {
            t.style[key] = lerpColor([0, 0, 0, 0], parseColor(vars[key]), 1);
          } else if (type === 'boxShadow') {
            t.style.boxShadow = String(vars[key]);
          } else if (type === 'filter') {
            t.style.filter = vars[key];
          } else if (type === 'static') {
            t.style[key] = String(vars[key]);
          } else {
            // scrollTop / cssnum
            if (key === 'scrollTop') { t.scrollTop = vars[key]; continue; }
            if (typeof vars[key] === 'number') {
              t.style[key] = String(vars[key]) + (PX_PROPS[key] ? 'px' : '');
            } else t.style[key] = String(vars[key]);
          }
        }
        if (vars.clearProps) {
          var keys = String(vars.clearProps).split(',');
          for (var c = 0; c < keys.length; c++) { var kk = keys[c].trim(); if (kk && t.style) t.style[kk] = ''; }
        }
      } else {
        for (var ok in vars) {
          if (!vars.hasOwnProperty(ok) || RESERVED[ok]) continue;
          if (typeof vars[ok] === 'number') t[ok] = vars[ok];
        }
      }
    }
  }

  // ---- timeline：极简顺序时间线（覆盖本仓库唯一用法 gsap.timeline({defaults}).fromTo().fromTo()）----
  function timeline(opts) {
    opts = opts || {};
    var defaults = opts.defaults || {};
    var cursor = 0; // ms
    var children = [];
    var pending = 0;
    var onComplete = opts.onComplete;
    var api = {
      to: function (target, vars, position) { return add('to', target, null, vars, position); },
      fromTo: function (target, fromVars, vars, position) { return add('fromTo', target, fromVars, vars, position); },
      set: function (target, vars, position) { return add('set', target, null, vars, position); },
      call: function (fn, params, position) { return add('call', fn, null, { params: params }, position); },
      add: function (child, position) { return add('raw', child, null, {}, position); },
      eventCallback: function () { return api; }
    };
    function add(kind, target, fromVars, vars, position) {
      var delay = (position == null ? cursor : (typeof position === 'number' ? position * 1000 : cursor));
      var merged = {};
      for (var dk in defaults) if (defaults.hasOwnProperty(dk)) merged[dk] = defaults[dk];
      for (var vk in vars) if (vars.hasOwnProperty(vk)) merged[vk] = vars[vk];
      var dur = (kind === 'set' || kind === 'call') ? 0 : ((merged.duration != null ? merged.duration : 0.5) * 1000);
      var child = { kind: kind, target: target, fromVars: fromVars, vars: merged, at: delay };
      children.push(child);
      if (kind !== 'set' && kind !== 'call') cursor = Math.max(cursor, delay + dur);
      pending++;
      return api;
    }
    function play() {
      if (!HAS_RAF) {
        // 降级：直接套所有子项终态
        for (var i = 0; i < children.length; i++) runChild(children[i], 1);
        if (onComplete) try { onComplete(); } catch (e) {}
        return;
      }
      var start = global.performance.now();
      function step(now) {
        var allDone = true;
        for (var i = 0; i < children.length; i++) {
          var ch = children[i];
          if (ch.done) continue;
          var local = now - start - ch.at;
          if (local < 0) { allDone = false; continue; }
          if (ch.kind === 'set' || ch.kind === 'call') {
            runChild(ch, 1);
            ch.done = true;
          } else {
            var raw = ch.vars.duration != null ? (local / (ch.vars.duration * 1000)) : 1;
            if (raw >= 1) { runChild(ch, 1); ch.done = true; }
            else { runChild(ch, raw); allDone = false; }
          }
        }
        if (allDone) { if (onComplete) try { onComplete(); } catch (e) {} }
        else global.requestAnimationFrame(step);
      }
      global.requestAnimationFrame(step);
    }
    function runChild(ch, p) {
      if (ch.kind === 'call') { if (ch.target) try { ch.target.apply(null, (ch.vars.params) || []); } catch (e) {} return; }
      if (ch.kind === 'set') { set(ch.target, ch.vars); return; }
      if (ch.kind === 'fromTo') { var tw = new Tween(ch.target, ch.vars, ch.fromVars); tw.start(); tw.render(p); if (p >= 1) tw.complete(); }
      else { var tw2 = new Tween(ch.target, ch.vars, null); tw2.start(); tw2.render(p); if (p >= 1) tw2.complete(); }
    }
    // 延迟到下一 tick 播放，使链式 add 全部入队（rAF 走下一帧；无 rAF 环境用 setTimeout 保证链完成）
    if (HAS_RAF) global.requestAnimationFrame(play);
    else global.setTimeout(play, 0);
    return api;
  }

  function delayedCall(delay, fn, params) {
    var timer = null;
    var killed = false;
    var api = {
      kill: function () { killed = true; if (timer != null) { clearTimeout(timer); timer = null; } }
    };
    timer = setTimeout(function () {
      if (killed) return;
      try { fn.apply(null, params || []); } catch (e) {}
    }, (delay || 0) * 1000);
    return api;
  }

  // ---------------------------------------------------------------- 导出
  global.gsap = {
    to: to,
    fromTo: fromTo,
    set: set,
    killTweensOf: killTweensOf,
    timeline: timeline,
    delayedCall: delayedCall,
    // 兼容探针
    version: 'shim-1.0.0'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.gsap;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
