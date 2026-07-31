/*
 * Stellaflix 影视模块 — 三源统一适配层 (Step 3)
 *
 * 职责：把「本地文件 / 直链 URL / HLS(m3u8)」三类来源，归一化成播放器可消费的描述对象。
 *   resolve() 是纯函数（不碰 DOM、不发请求），便于沙箱测试；open() 才真正驱动 player。
 *
 * 合规红线：本文件不预置、不内置任何在线片源（api_site）。所有 URL 均由用户显式提供。
 *   Stellaflix 不存储、不分发任何视频资源。
 *
 * 跨域策略：跨源直链交给 Step1 已实现的 /api/proxy?url=<encoded>（含 SSRF 私网拦截、
 *   Range 透传）。同源与 blob:/file: 一律直连，不绕代理。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var PROXY_PATH = '/api/proxy';
  var HLS_EXT = /\.m3u8(\?|#|$)/i;

  // 常见容器扩展名 → 仅用于友好提示，不作为播放前置门槛（真正能力以浏览器解码为准）
  var KNOWN_VIDEO_EXT = /\.(mp4|m4v|webm|ogv|mkv|mov|avi|ts|flv)(\?|#|$)/i;

  function isFileLike(x) {
    if (!x || typeof x !== 'object') return false;
    if (typeof global.File !== 'undefined' && x instanceof global.File) return true;
    if (typeof global.Blob !== 'undefined' && x instanceof global.Blob) return true;
    // Electron 拖拽/选择的对象可能只带 path+name
    return typeof x.name === 'string' && (typeof x.path === 'string' || typeof x.size === 'number');
  }

  function parseUrl(str) {
    try {
      var base = (global.location && global.location.href) ? global.location.href : undefined;
      return base ? new global.URL(str, base) : new global.URL(str);
    } catch (e) {
      return null;
    }
  }

  function sameOrigin(u) {
    if (!global.location || !u) return false;
    return u.origin === global.location.origin;
  }

  function toProxyUrl(rawUrl) {
    return PROXY_PATH + '?url=' + encodeURIComponent(rawUrl);
  }

  function basename(pathname) {
    if (!pathname) return '';
    var parts = String(pathname).split('/');
    var last = parts[parts.length - 1] || '';
    try { return decodeURIComponent(last); } catch (e) { return last; }
  }

  /**
   * 浏览器是否原生支持 HLS（Safari/部分 WebView 支持；Chromium 通常不支持）。
   * 用于决定「直接喂给 <video>」还是「提示需要 hls.js」。
   */
  function nativeHlsSupported() {
    try {
      if (!global.document || !global.document.createElement) return false;
      var v = global.document.createElement('video');
      if (!v || !v.canPlayType) return false;
      return !!(v.canPlayType('application/vnd.apple.mpegurl') ||
                v.canPlayType('application/x-mpegURL'));
    } catch (e) {
      return false;
    }
  }

  /**
   * 归一化任意来源。
   * @param {File|Blob|string|{url:string,title?:string,id?:string}} input
   * @returns {{ok:boolean, kind:string, playUrl:string|null, rawUrl:string|null,
   *            needsProxy:boolean, title:string, file:File|null, id:string|null,
   *            requiresHlsLib:boolean, reason:string|null}}
   */
  function resolve(input) {
    var out = {
      ok: false,
      kind: 'unsupported', // 'local' | 'direct' | 'hls' | 'unsupported'
      playUrl: null,
      rawUrl: null,
      needsProxy: false,
      title: '',
      file: null,
      id: null,
      requiresHlsLib: false,
      reason: null,
    };

    if (!input) {
      out.reason = 'empty-input';
      return out;
    }

    // ---- 1) 本地文件对象 ----
    if (isFileLike(input)) {
      out.ok = true;
      out.kind = 'local';
      out.file = input;
      out.title = input.name || 'local-video';
      out.rawUrl = input.path || null;
      out.id = input.id || null;
      return out;
    }

    // ---- 2) 对象形式 { url, title, id } ----
    var title = '';
    var explicitId = null;
    if (typeof input === 'object') {
      title = input.title || '';
      explicitId = input.id || null;
      input = input.url;
      if (!input) {
        out.reason = 'empty-url';
        return out;
      }
    }

    if (typeof input !== 'string') {
      out.reason = 'unsupported-input-type';
      return out;
    }

    var s = input.trim();
    if (!s) {
      out.reason = 'empty-url';
      return out;
    }

    // ---- 3) blob: / file: 直连，不走代理 ----
    if (/^blob:/i.test(s) || /^file:/i.test(s)) {
      out.ok = true;
      out.kind = 'local';
      out.rawUrl = s;
      out.playUrl = s;
      out.title = title || basename(s.replace(/^blob:/i, '')) || s;
      return out;
    }

    var u = parseUrl(s);
    if (!u) {
      out.reason = 'invalid-url';
      return out;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      out.reason = 'unsupported-scheme:' + u.protocol;
      return out;
    }

    out.rawUrl = u.href;
    out.needsProxy = !sameOrigin(u);
    out.playUrl = out.needsProxy ? toProxyUrl(u.href) : u.href;
    out.title = title || basename(u.pathname) || u.hostname;
    // 在线剧集用显式 id 锚定进度（站点:vod:集数），避免签名 URL 变动导致进度键漂移；
    // 缺省回落 url: 原始地址。
    out.id = explicitId || ('url:' + u.href);

    // ---- 4) HLS 识别 ----
    if (HLS_EXT.test(u.pathname) || HLS_EXT.test(u.href)) {
      out.ok = true;
      out.kind = 'hls';
      out.requiresHlsLib = !nativeHlsSupported();
      if (out.requiresHlsLib) {
        // 仍返回 ok:true —— 是否降级由调用方决定，避免适配层擅自否决用户输入
        out.reason = 'hls-needs-lib';
      }
      return out;
    }

    // ---- 5) 普通直链 ----
    out.ok = true;
    out.kind = 'direct';
    if (!KNOWN_VIDEO_EXT.test(u.pathname)) {
      // 不阻断：很多直链无扩展名（网盘/签名 URL），交给浏览器按 Content-Type 判定
      out.reason = 'unknown-extension';
    }
    return out;
  }

  /**
   * 解析并驱动播放器打开。真正的播放/进度/音轨仍由 player.js 负责。
   * @returns {boolean} 是否已交付播放器
   */
  function open(input) {
    var r = resolve(input);
    if (!r.ok) {
      if (global.console) global.console.warn('[SFV source] 无法解析来源:', r.reason, input);
      return false;
    }
    if (!SFV.player) {
      if (global.console) global.console.warn('[SFV source] player 未就绪');
      return false;
    }
    if (r.kind === 'hls' && r.requiresHlsLib) {
      // 本轮不引入 hls.js：明确告知而非静默失败
      if (global.console) global.console.warn('[SFV source] 当前环境不原生支持 HLS，需后续接入 hls.js:', r.rawUrl);
    }
    if (r.kind === 'local' && r.file) {
      // 本地文件沿用 file: 进度键（若存在），否则由 openFile 内部决定
      return SFV.player.openFile(r.file);
    }
    // 传 id/title 覆盖，保证进度键锚定：在线剧集用显式 id（站点:vod:集数），
    // 直链回落 url: 原始地址（而非代理 URL）。
    var pid = r.id || ('url:' + r.rawUrl);
    return SFV.player.openUrl(r.playUrl, { id: pid, title: r.title });
  }

  SFV.source = {
    resolve: resolve,
    open: open,
    toProxyUrl: toProxyUrl,
    nativeHlsSupported: nativeHlsSupported,
    PROXY_PATH: PROXY_PATH,
  };
})(typeof window !== 'undefined' ? window : this);
