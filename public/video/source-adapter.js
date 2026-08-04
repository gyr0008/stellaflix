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
 *
 * HLS(.m3u8)：Chromium 系浏览器不原生支持，需 hls.js。本文件负责：
 *   1) 动态加载 hls.js（仅首次，HLS_LIB_URL 为 JS 库 CDN，非片源，不触碰合规红线）；
 *   2) 用自定义 proxy loader 把 playlist 与每个分片请求统一走 /api/proxy（否则分片相对
 *      地址会解析到错误基址）；
 *   3) Safari 等原生支持环境也统一走 hls.js，避免原生播放器无法 hook 代理 loader 导致
 *      跨域分片断流。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var PROXY_PATH = '/api/proxy';
  var HLS_EXT = /\.m3u8(\?|#|$)/i;
  var FLV_EXT = /\.flv(\?|#|$)/i;

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

    // ---- 4.5) FLV 识别 ----
    if (FLV_EXT.test(u.pathname) || FLV_EXT.test(u.href)) {
      out.ok = true;
      out.kind = 'flv';
      out.reason = null;
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

  // ------------------------------------------------------------------
  // Sprint A: URL 预清洗 + 诊断 + 错误改进 + 回退策略
  // 目标：解决 xlyun 等"非标准 m3u8 URL"导致 hls.js 构造 URL 失败的黑屏问题。
  // 根因：hls.min.js 内部 new URL() 对某些 CMS 返回的 URL 格式抛 Invalid URL。
  // ------------------------------------------------------------------

  /**
   * 分析并截断 URL 用于日志/展示（隐藏敏感参数但保留结构信息）。
   * @param {string} url
   * @returns {string} 可安全打印的 URL 摘要
   */
  function urlSummary(url) {
    if (!url || typeof url !== 'string') return '(empty)';
    try {
      var u = parseUrl(url);
      if (!u) return url.substring(0, 120);
      var summary = u.protocol + '//' + u.hostname;
      if (u.port) summary += ':' + u.port;
      var path = u.pathname;
      if (path.length > 60) path = path.substring(0, 57) + '...';
      summary += path;
      if (u.search) summary += '?...';
      return summary;
    } catch (e) {
      return url.substring(0, 120);
    }
  }

  /**
   * URL 预清洗 — 在传入 hls.loadSource() 前修复常见问题格式。
   *
   * 修复清单（按 xlyun 等 CMS 线路实际返回的坏 URL 统计）：
   *   1. 协议相对路径  //cdn.example.com/...  →  https://cdn.example.com/...
   *   2. 缺 host 的伪绝对路径  https:///path  →  原样返回（让 hls.js 自己报错，便于诊断）
   *   3. pathname 含未编码的非 ASCII 字符（中文等）→ encodeURIComponent 逐段编码
   *   4. HTML 实体 &amp; / &#xXX;  →  解码还原
   *   5. 首尾空白 / 控制字符 → 去除
   *
   * @param {string} raw - 原始 URL
   * @returns {{url: string, cleaned: boolean, reason: string|null}}
   */
  function sanitizeHlsUrl(raw) {
    if (!raw || typeof raw !== 'string') return { url: raw || '', cleaned: false, reason: 'empty' };

    var url = raw;
    var cleaned = false;
    var reasons = [];

    // 5) 去除首尾空白和控制字符
    var trimmed = url.replace(/^[\s\x00-\x1f]+|[\s\x00-\x1f]+$/g, '');
    if (trimmed !== url) { url = trimmed; cleaned = true; reasons.push('whitespace'); }

    // 4) 解码 HTML 实体（部分 CMS 会返回 &amp; 代替 &）
    if (/&amp;|&lt;|&gt;|&#x?[0-9a-fA-F]+;/i.test(url)) {
      try {
        var div = global.document ? global.document.createElement('div') : null;
        if (div) {
          div.innerHTML = url;
          var decoded = div.textContent || div.innerText || url;
          if (decoded && decoded !== url) { url = decoded; cleaned = true; reasons.push('html-entity'); }
        }
      } catch (e) { /* 解码失败则保留原值 */ }
    }

    // 1) 协议相对路径 → 补全 https:
    if (/^\/\/[^\/]/.test(url)) {
      url = 'https:' + url;
      cleaned = true;
      reasons.push('protocol-relative');
    }

    // 2/3) 结构校验 + pathname 编码
    try {
      var parsed = parseUrl(url);
      if (parsed) {
        // 2) 缺 host 检测
        if (!parsed.hostname || parsed.hostname.length === 0) {
          // 无法自动修复，返回原值让 hls.js 报明确错误
          return { url: url, cleaned: cleaned, reason: reasons.length > 0 ? reasons.join(',') : 'no-host' };
        }

        // 3) pathname 含非 ASCII → 逐段编码（保留 / 分隔符）
        if (/[^\x20-\x7E]/.test(parsed.pathname)) {
          var segments = parsed.pathname.split('/');
          var encodedSegments = [];
          for (var i = 0; i < segments.length; i++) {
            if (segments[i] && /[^\x20-\x7E]/.test(segments[i])) {
              encodedSegments.push(encodeURIComponent(segments[i]));
            } else {
              encodedSegments.push(segments[i]);
            }
          }
          var newPathname = encodedSegments.join('/');
          // 用 URL 构造器重建以保持正确格式
          url = parsed.protocol + '//' + parsed.hostname;
          if (parsed.port) url += ':' + parsed.port;
          url += newPathname;
          if (parsed.search) url += parsed.search;
          if (parsed.hash) url += parsed.hash;
          cleaned = true;
          reasons.push('non-ascii-encoded');
        }
      }
    } catch (e) {
      // parseUrl 失败说明 URL 本身有结构性问题，返回原值让调用方处理
      return { url: url, cleaned: cleaned, reason: 'parse-error:' + (e.message || '?') };
    }

    return {
      url: url,
      cleaned: cleaned,
      reason: reasons.length > 0 ? reasons.join(',') : null
    };
  }

  /**
   * 判断一个 URL 是否"看起来像"标准 m3u8/HLS 地址。
   * 用于决定 hls.js 失败后是否值得回退到原生 <video>。
   * @param {string} url
   * @returns {boolean}
   */
  function looksLikeRealM3u8(url) {
    if (!url || typeof url !== 'string') return false;
    var lower = url.toLowerCase();
    // 标准 m3u8 扩展名或明确的 m3u8 路径特征
    if (/\.m3u8(\?|#|$)/i.test(url)) return true;
    // HLS 分片 URL (.ts)
    if (/\.ts(\?|#|$)/i.test(lower) && !lower.includes('.flv')) return true;
    // 明确的 playlist 关键字
    if (/playlist/i.test(url) || /manifest/i.test(url) || /m3u8/i.test(url)) return true;
    // 包含典型 CDN m3u8 路径模式
    if (/(\/video\/|\/stream\/|\/live\/|\/hls\/)/i.test(url)) return true;
    return false;
  }

  // ---------------------------------------------------------------- HLS (hls.js)

  // hls.js 已本地化 vendor 到 public/vendor/hls.min.js（同源静态服务，规避 jsdelivr 国内不可达）。
  // 这是 JS 库而非片源，不触碰合规红线；许可证为 MIT，可自由内置分发。
  var HLS_LIB_URL = '/vendor/hls.min.js';
  var hlsLibPromise = null;   // 加载中的 Promise，保证只注入一次
  var activeHls = null;       // 当前存活的 Hls 实例，close 时销毁

  // FLV(.flv)：flv.js 本地化 vendor 到 public/vendor/flv.min.js（同源静态服务）。
  // 许可证 Apache-2.0（与 GPL-3.0 兼容，可自由内置分发；区别于 GSAP 专有许可冲突）。
  var FLV_LIB_URL = '/vendor/flv.min.js';
  var flvLibPromise = null;   // 加载中的 Promise，保证只注入一次
  var activeFlv = null;       // 当前存活的 flv.js 播放器实例，close 时销毁

  function loadHlsLib() {
    if (global.Hls) return Promise.resolve(global.Hls);
    if (hlsLibPromise) return hlsLibPromise;
    hlsLibPromise = new Promise(function (resolve, reject) {
      var d = global.document;
      if (!d || !d.createElement) { reject(new Error('no-document')); return; }
      var s = d.createElement('script');
      s.src = HLS_LIB_URL;
      s.async = true;
      s.onload = function () { resolve(global.Hls); };
      s.onerror = function () { hlsLibPromise = null; reject(new Error('hls-lib-load-failed')); };
      (d.head || d.documentElement || d.body).appendChild(s);
    });
    return hlsLibPromise;
  }

  // makeProxyLoader 保留供特殊场景使用（如服务端需审计/记录媒体流量的部署），
  // 但默认播放路径不再使用——浏览器 <video> 元素对媒体请求 CORS 豁免，
  // hls.js 可直接向 CDN 拉取 m3u8 清单与分片，无需经 /api/proxy 中转。
  // 参考：KVideo (KuekHaoYang/KVideo, MIT) 的 useHlsPlayer.ts 采用同样的直连策略。
  function makeProxyLoader(Hls) {
    var Base = (Hls.DefaultConfig && Hls.DefaultConfig.loader) || global.XMLHttpRequest;
    function ProxyLoader(config) {
      Base.call(this, config);
      this._sfvBase = Base;
    }
    if (Base.prototype) {
      ProxyLoader.prototype = Object.create(Base.prototype);
      ProxyLoader.prototype.constructor = ProxyLoader;
    }
    ProxyLoader.prototype.load = function (context, config, callbacks) {
      if (context && typeof context.url === 'string') {
        context.url = toProxyUrl(context.url);
      }
      this._sfvBase.prototype.load.call(this, context, config, callbacks);
    };
    return ProxyLoader;
  }

  // ---------------------------------------------------------------- FLV (flv.js)
  // flv.js 通过 MSE 把 FLV 容器解封装后喂给 <video>。与 hls.js 不同，flv.js 的 IO 走
  // XHR/fetch（受 CORS 约束），因此跨域 FLV 必须经由 /api/proxy 同源中转（resolve()
  // 已对跨域 URL 预置 playUrl=代理地址，此处直接消费 r.playUrl）。
  function loadFlvLib() {
    if (global.flvjs) return Promise.resolve(global.flvjs);
    if (flvLibPromise) return flvLibPromise;
    flvLibPromise = new Promise(function (resolve, reject) {
      var d = global.document;
      if (!d || !d.createElement) { reject(new Error('no-document')); return; }
      var s = d.createElement('script');
      s.src = FLV_LIB_URL;
      s.async = true;
      s.onload = function () { resolve(global.flvjs); };
      s.onerror = function () { flvLibPromise = null; reject(new Error('flv-lib-load-failed')); };
      (d.head || d.documentElement || d.body).appendChild(s);
    });
    return flvLibPromise;
  }

  /**
   * 用 flv.js 把一个 .flv 地址挂载到 video 元素。
   *
   * @param {HTMLVideoElement} videoEl
   * @param {string} flvUrl 已根据跨域/同源确定好的地址（跨域时为 /api/proxy?url=...）
   * @param {object} opts { id, title, onError, onReady }
   * @returns {Promise<boolean>}
   */
  function attachFlv(videoEl, flvUrl, opts) {
    opts = opts || {};
    if (!videoEl) { if (opts.onError) opts.onError('no-video-el'); return Promise.resolve(false); }
    if (global.console) {
      global.console.log('[SFV FLV] === attachFlv called ===');
      global.console.log('[SFV FLV] url:', urlSummary(flvUrl));
    }
    return loadFlvLib().then(function (flvjs) {
      if (!flvjs || !flvjs.isSupported || !flvjs.isSupported()) {
        if (global.console) global.console.warn('[SFV FLV] flv.js not supported, trying native fallback');
        if (opts.onError) opts.onError('flv-unsupported');
        return tryNativeFallback(videoEl, flvUrl, opts);
      }
      if (activeFlv) { try { activeFlv.destroy(); } catch (e) {} activeFlv = null; }

      var player = flvjs.createPlayer({
        type: 'flv',
        url: flvUrl,
        isLive: false,
        cors: true,
        withCredentials: false
      }, {
        enableStashBuffer: true,
        stashInitialSize: 128,
        // 关闭 Worker：避免打包 Electron 中 worker 脚本路径/同源策略导致硬失败；
        // 主线程解码对常规影视 FLV 足够，且我们此处无法对 Worker 路径做真实验证。
        enableWorker: false,
        lazyLoad: true,
        lazyLoadMaxDuration: 60 * 3,
        lazyLoadRecoverDuration: 30,
        seekType: 'range',
        deferLoadAfterSourceOpen: true
      });
      activeFlv = player;

      player.on(flvjs.Events.ERROR, function (e) {
        if (global.console) global.console.error('[SFV FLV] player error:', e && (e.msg || e.type || e.code) ? (e.msg || e.type || e.code) : e);
        if (opts.onError) opts.onError('FLV 播放失败: ' + (e && (e.msg || e.type) ? (e.msg || e.type) : 'unknown'));
      });

      // 元数据到达即尝试播放（autoplay 触发点）
      player.on(flvjs.Events.METADATA_ARRIVED, function () {
        var p = videoEl.play();
        if (p && p.catch) p.catch(function () {});
      });

      player.attachMediaElement(videoEl);
      player.load();
      var pp = videoEl.play();
      if (pp && pp.catch) pp.catch(function () {});

      if (opts.onReady) opts.onReady();
      return true;
    }).catch(function (err) {
      if (global.console) global.console.error('[SFV FLV] flv.js library load failed:', err && err.message ? err.message : err);
      if (opts.onError) opts.onError('flv-lib-load-failed');
      return tryNativeFallback(videoEl, flvUrl, opts);
    });
  }

  /**
   * 用 hls.js 把一个 .m3u8 原始地址挂载到 video 元素。
   *
   * Sprint A 增强（4 项修复）：
   *   1) URL 诊断日志 — loadSource 前打印完整 URL 和结构分析
   *   2) URL 预清洗 — sanitizeHlsUrl() 修复协议相对/非 ASCII/HTML 实体等
   *   3) 错误 UX 改进 — fatal 时 toast 显示具体类型 + URL 摘要
   *   4) 回退策略 — hls.js 失败且 URL 不像 m3u8 时尝试原生 <video>
   *
   * 策略：hls.js 直连 CDN（不走代理），与 KVideo 成熟方案一致。
   * 浏览器对 <video> 媒体请求 CORS 豁免，无需中转。
   * @param {HTMLVideoElement} videoEl
   * @param {string} rawUrl 原始 m3u8 地址（未代理）
   * @param {object} opts { id, title, onError, onFallback }
   * @returns {Promise<boolean>}
   */
  function attachHls(videoEl, rawUrl, opts) {
    opts = opts || {};
    if (!videoEl) { if (opts.onError) opts.onError('no-video-el'); return Promise.resolve(false); }

    // ---- Sprint A Fix #1: URL 诊断日志 ----
    if (global.console) {
      global.console.log('[SFV HLS] === attachHls called ===');
      global.console.log('[SFV HLS] rawUrl:', rawUrl);
      global.console.log('[SFV HLS] urlSummary:', urlSummary(rawUrl));
      global.console.log('[SFV HLS] looksLikeRealM3u8:', looksLikeRealM3u8(rawUrl));
    }

    // ---- Sprint A Fix #2: URL 预清洗 ----
    var sanitized = sanitizeHlsUrl(rawUrl);
    var playUrl = sanitized.url;

    if (sanitized.cleaned && global.console) {
      global.console.info('[SFV HLS] URL cleaned (' + sanitized.reason + '):');
      global.console.info('[SFV HLS]   before:', urlSummary(rawUrl));
      global.console.info('[SFV HLS]  after :', urlSummary(playUrl));
    }

    // 如果清洗后 URL 为空或明显无效，提前失败
    if (!playUrl || playUrl.length < 5) {
      var emptyErr = 'URL 预清洗后为空（原始: ' + urlSummary(rawUrl) + '）';
      if (global.console) global.console.error('[SFV HLS]', emptyErr);
      if (opts.onError) opts.onError(emptyErr);

      // ---- Sprint A Fix #4: 回退到原生播放 ----
      return tryNativeFallback(videoEl, rawUrl, opts);
    }

    return loadHlsLib().then(function (Hls) {
      if (!Hls || !Hls.isSupported || !Hls.isSupported()) {
        if (global.console) global.console.warn('[SFV HLS] hls.js not supported, trying native fallback');
        if (opts.onError) opts.onError('hls-unsupported');
        // 回退：浏览器可能原生支持 HLS（Safari）
        return tryNativeFallback(videoEl, playUrl, opts);
      }
      if (activeHls) { try { activeHls.destroy(); } catch (e) {} activeHls = null; }

      // 对标 KVideo useHlsPlayer.ts 的成熟配置（缓冲/重试/超时/ABR）
      var hls = new Hls({
        capLevelToPlayerSize: true,
        enableWorker: true,
        maxBufferLength: 120,
        maxMaxBufferLength: 240,
        maxBufferSize: 120 * 1000 * 1000,
        startFragPrefetch: true,
        abrEwmaDefaultEstimate: 500000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 64000,
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 1000,
        manifestLoadingMaxRetryTimeout: 64000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        levelLoadingMaxRetryTimeout: 64000,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
        backBufferLength: 90,
      });
      activeHls = hls;

      var networkErrorRetries = 0;
      var mediaErrorRetries = 0;
      var MAX_RETRIES = 3;
      var hlsFailed = false;   // 标记 hls 是否已彻底失败（触发回退）

      hls.on(Hls.Events.MEDIA_ATTACHED, function () {
        // ---- Sprint A Fix #1+: loadSource 时也打日志 ----
        if (global.console) {
          global.console.log('[SFV HLS] loadSource() called with:', urlSummary(playUrl));
        }
        try {
          hls.loadSource(playUrl);
        } catch (e) {
          // 这就是 xlyun 触发的 "Failed to construct 'URL': Invalid URL"
          if (global.console) {
            global.console.error('[SFV HLS] !!! loadSource THREW !!!');
            global.console.error('[SFV HLS] error:', e && (e.message || e.constructor && e.constructor.name) || e);
            global.console.error('[SFV HLS] url was:', playUrl);
            // 超显眼输出：用分隔线包围完整 URL，方便在控制台快速定位
            global.console.error('========== SFV FAILED URL START ==========');
            global.console.error(rawUrl);  // 原始 URL（未清洗）
            global.console.error('playUrl (sanitized):', playUrl);  // 清洗后
            global.console.error('=========== SFV FAILED URL END ===========');
          }
          // 终极兜底：写入全局变量，DevTools Console 输入 __sfv_failed_url 即可查看
          try { global.__sfv_failed_url = rawUrl; global.__sfv_failed_playUrl = playUrl; } catch (ex) {}

          hlsFailed = true;

          // ---- Sprint A Fix #3: 具体化错误信息 ----
          var loadErr = 'HLS URL 无效: ' + (e && e.message ? e.message : 'Unknown error') +
                        ' (URL: ' + urlSummary(playUrl) + ')';
          if (opts.onError) opts.onError(loadErr);

          // ---- Sprint A Fix #5: 立即显示诊断浮层（不等 native fallback）----
          showDiagnosticOverlay(videoEl, rawUrl, loadErr);

          // ---- Sprint A Fix #4: 立即回退原生播放 ----
          tryNativeFallback(videoEl, rawUrl, opts);
        }
      });

      // 首片加载后尝试 play（更可靠的 autoplay 触发点，对标 KVideo FRAG_LOADED）
      hls.on(Hls.Events.FRAG_LOADED, function (ev, data) {
        if (videoEl && data && data.frag && data.frag.start === 0 && videoEl.paused) {
          var p = videoEl.play();
          if (p && p.catch) p.catch(function () {});
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        // HEVC 兼容性处理：优先 H.264 level（对标 KVideo）
        if (hls && hls.levels && hls.levels.length > 0) {
          var h264Indices = [];
          var hasHEVC = false;
          for (var i = 0; i < hls.levels.length; i++) {
            var codec = (hls.levels[i].videoCodec || '').toLowerCase();
            if (codec.indexOf('hev') >= 0 || codec.indexOf('h265') >= 0 || codec.indexOf('hvc') >= 0) {
              hasHEVC = true;
            } else {
              h264Indices.push(i);
            }
          }
          if (hasHEVC && h264Indices.length > 0) {
            if (global.console) global.console.info('[SFV source] HEVC detected, locking to H.264 level for compatibility');
            hls.currentLevel = h264Indices[0];
          }
        }
        var p = videoEl.play();
        if (p && p.catch) p.catch(function () {});
      });

      // ---- Sprint A Fix #3: 改进错误 UX ----
      hls.on(Hls.Events.ERROR, function (ev, data) {
        // 记录所有错误（含非致命），便于诊断黑屏/卡顿等播放问题
        if (global.console) {
          var msg = '[SFV source] HLS ' + (data && data.fatal ? 'FATAL' : 'soft') + ': ';
          if (data) msg += (data.type || '?') + '/' + (data.details || '?');
          else msg += 'unknown';
          if (data && data.response) msg += ' status=' + (data.response.code || '?');
          if (data && data.error) msg += ' err=' + (data.error.message || data.error.code || data.error || '');
          if (data.fatal) global.console.error(msg); else global.console.warn(msg);
        }
        if (!data || !data.fatal) return;  // ���致命错误仅记录，不中断

        hlsFailed = true;

        // 构建用户可见的错误消息（具体化，不再笼统）
        var userMsg = '';
        var shouldFallback = false;

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            networkErrorRetries++;
            if (networkErrorRetries <= MAX_RETRIES) {
              if (global.console) global.console.info('[SFV HLS] Retrying load (' + networkErrorRetries + '/' + MAX_RETRIES + ')...');
              hls.startLoad();
              return; // 重试中，暂不报错给用户
            }
            userMsg = '\u7f51\u7edc\u9519\u8bef\uff1a\u65e0\u6cd5\u52a0\u8f7d\u89c6\u9891\u6d41' +
                      '\uff08\u5df2\u91cd\u8bd5' + MAX_RETRIES + '\u6b21\uff09' +
                      '\n\u7ad9\u70b9\uff1a' + _extractDomain(playUrl) +
                      '\n\u8be6\u60c5\uff1a' + (data.details || 'NETWORK_ERROR');
            shouldFallback = true;
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            mediaErrorRetries++;
            if (mediaErrorRetries <= MAX_RETRIES) {
              if (global.console) global.console.info('[SFV HLS] Recovering media error (' + mediaErrorRetries + '/' + MAX_RETRIES + ')...');
              hls.recoverMediaError();
              return; // 恢复中
            }
            userMsg = '\u5a92\u4f53\u9519\u8bef\uff1a\u89c6\u9891\u683c\u5f0f\u4e0d\u652f\u6301\u6216\u5df2\u635f\u574f' +
                      '\uff08\u5df2\u91cd\u8bd5' + MAX_RETRIES + '\u6b21\uff09' +
                      '\n\u8be6\u60c5\uff1a' + (data.details || 'MEDIA_ERROR');
            shouldFallback = !looksLikeRealM3u8(playUrl); // 非 m3u8 格式才值得回退
            break;
          default:
            // 其他 fatal 错误（包括 URL 构造失败等）
            var detailStr = data.details || (data.error && data.error.message) || String(data);
            userMsg = 'HLS \u64ad\u653e\u5931\u8d25: ' + detailStr +
                      '\nURL: ' + urlSummary(playUrl);
            shouldFallback = true;
            break;
        }

        // 清理 hls 实例
        try { hls.destroy(); } catch (e) {}
        activeHls = null;

        // 通知调用方
        if (opts.onError) opts.onError(userMsg);

        // ---- Sprint A Fix #4: 条件性回退原生播放 ----
        if (shouldFallback) {
          if (global.console) global.console.info('[SFV HLS] Attempting native fallback for:', urlSummary(rawUrl));
          tryNativeFallback(videoEl, rawUrl, opts);
        } else if (SFV.online && SFV.online.toast) {
          // 不回退但给用户明确提示
          SFV.online.toast(userMsg);
        }
      });

      hls.attachMedia(videoEl);
      if (opts.onReady) opts.onReady();
      return true;
    }).catch(function (err) {
      // hls.js 加载本身失败（库未下载/执行错误）
      if (global.console) {
        global.console.error('[SFV HLS] hls.js library load failed:', err && err.message ? err.message : err);
      }
      if (opts.onError) opts.onError('hls-lib-load-failed');

      // 库加载失败也尝试原生（Safari 可能原生支持 HLS）
      return tryNativeFallback(videoEl, rawUrl, opts);
    });
  }

  /**
   * Sprint A Fix #4: HLS 失败后的原生 <video> 回退。
   *
   * 当 hls.js 无法播放某个 URL（非标准 m3u8、flv、mp4 伪装成 m3u8 等），
   * 尝试用 <video>.src= 直接播放。Chromium 原生支持 mp4/webm/ogg，
   * Safari 还额外支持 HLS。这不是万能的，但比纯黑屏好得多。
   *
   * @param {HTMLVideoElement} videoEl
   * @param {string} url 原始 URL（用原始值而非清洗后的，避免过度修改）
   * @param {object} opts { id, title, onError, onFallback }
   * @returns {Promise<boolean>}
   */
  function tryNativeFallback(videoEl, url, opts) {
    opts = opts || {};
    if (!videoEl) return Promise.resolve(false);

    if (global.console) {
      global.console.log('[SFV HLS] === Native Fallback ===');
      global.console.log('[SFV HLS] fallback URL:', urlSummary(url));
    }

    try {
      // 先确保没有残留的 hls 实例占用 video 元素
      if (activeHls) {
        try { activeHls.detachMedia(); activeHls.destroy(); } catch (e) {}
        activeHls = null;
      }

      // 用原始 URL 直接赋值（不经过代理——浏览器对 media CORS 豁免）
      // 但如果是跨域 URL 且看起来需要代理，则走代理
      var parsed = parseUrl(url);
      var finalUrl = url;
      if (parsed && !sameOrigin(parsed)) {
        finalUrl = toProxyUrl(url);
      }

      videoEl.src = finalUrl;
      videoEl.load();

      // ---- 关键修复：监听异步 video error ----
      // videoEl.src = badUrl 不会同步抛错，浏览器是异步触发 'error' 事件的。
      // 如果不监听这个事件，showDiagnosticOverlay 永远不会被调用。
      var fallbackTriggered = false;
      function onNativeError() {
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        // 移除监听器（一次性）
        try { videoEl.removeEventListener('error', onNativeError); } catch (e) {}
        if (global.console) {
          global.console.error('[SFV HLS] === NATIVE FALLBACK ASYNC ERROR ===');
          global.console.error('[SFV HLS] URL that failed:', url);
        }
        showDiagnosticOverlay(videoEl, url, 'Native <video> async error: URL cannot be played');
        if (SFV.online && SFV.online.toast) {
          SFV.online.toast('\u64ad\u653e\u5931\u8d25\uff1a\u6b64\u683c\u5f0f\u6682\u4e0d\u652f\u6301\nURL: ' + urlSummary(url));
        }
      }
      videoEl.addEventListener('error', onNativeError);

      // 同时也监听 loadeddata 作为"成功"信号（用于清理 listener）
      function onNativeLoaded() {
        if (fallbackTriggered) return;
        try { videoEl.removeEventListener('error', onNativeError); } catch (e) {}
        try { videoEl.removeEventListener('loadeddata', onNativeLoaded); } catch (e) {}
      }
      videoEl.addEventListener('loadeddata', onNativeLoaded);

      // 通知调用方已回退
      if (opts.onFallback) {
        opts.onFallback({ method: 'native', url: finalUrl, originalUrl: url });
      }

      // 尝试自动播放
      var playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function (e) {
          // Autoplay 被阻止是正常的（浏览器策略），不视为失败
          if (global.console) {
            global.console.warn('[SFV HLS] Native fallback autoplay blocked (normal):', e && e.message);
          }
        });
      }

      if (global.console) {
        global.console.info('[SFV HLS] Native fallback applied, src set to:', urlSummary(finalUrl));
      }

      return true;
    } catch (e) {
      if (global.console) {
        global.console.error('[SFV HLS] Native fallback also failed:', e && e.message ? e.message : e);
      }
      // Sprint A Fix #5: 显示诊断浮层（包含完整 URL + 一键复制）
      var natErrMsg = e && e.message ? e.message : (typeof e === 'string' ? e : 'Unknown error');
      showDiagnosticOverlay(videoEl, url, 'Native <video> failed: ' + natErrMsg);
      // toast 作为辅助提示
      if (SFV.online && SFV.online.toast) {
        SFV.online.toast('\u64ad\u653e\u5931\u8d25\uff1a\u6b64\u683c\u5f0f\u6682\u4e0d\u652f\u6301\nURL: ' + urlSummary(url));
      }
      return false;
    }
  }

  /**
   * Sprint A Fix #5: 播放器内诊断浮层。
   *
   * 当所有播放方式（hls.js + 原生 <video>）都失败时，
   * 在 video 元素上方显示一个诊断面板，包含：
   *   - 完整原始 URL（可一键复制）
   *   - URL 类型检测（iframe 包装页 / 非 m3u8 / 可能的格式）
   *   - 错误摘要
   *   - 关闭按钮
   *
   * 用户无需打开 DevTools 就能看到并分享诊断信息。
   *
   * @param {HTMLVideoElement} videoEl
   * @param {string} rawUrl 失败的 URL
   * @param {string} errorMsg 错误描述
   */
  function showDiagnosticOverlay(videoEl, rawUrl, errorMsg) {
    if (!global.document) return;
    try {
      // 移除已有的诊断浮层（避免重复）
      var old = global.document.getElementById('sfv-diag-overlay');
      if (old && old.parentNode) old.parentNode.removeChild(old);

      // ---- 关键修复：挂载到 document.body + position:fixed ----
      // #sfv-overlay 设了 overflow:hidden，子元素绝对定位会被裁剪。
      // 用 fixed + body 可以覆盖整个视口，不受任何父容器限制。
      var body = global.document.body;
      if (!body) return;

      // ---- URL 类型检测 ----
      var lower = (rawUrl || '').toLowerCase();
      var urlType = 'unknown';
      var typeHint = '';
      var typeColor = '#ff6b6b'; // red = unsupported

      // 常见的"解析线路"特征：返回的是播放器页面而非视频文件
      if (/player|play\.php|play\.asp|embed|jx|jiexi|parse|api.*\?url=/i.test(lower) ||
          /\?url=https?/.test(lower) || /\?v=.+&/.test(lower)) {
        urlType = 'iframe-wrapper';
        typeHint = '\u89e3\u6790\u5668\u5305\u88c5\u9875\uff08\u975e\u76f4\u63a5\u89c6\u9891\uff09';
        typeColor = '#ffa94d'; // orange = needs special handling
      } else if (/\.flv(\?|#|$)/i.test(rawUrl)) {
        urlType = 'flv';
        typeHint = 'FLV \u683c\u5f0f\uff08flv.js \u64ad\u653e\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6e90\u662f\u5426\u53ef\u8fbe\uff09';
        typeColor = '#ffa94d';
      } else if (/\.mp4(\?|#|$)/i.test(rawUrl)) {
        urlType = 'mp4';
        typeHint = 'MP4 \u683c\u5f0f\uff08\u5e94\u80fd\u64ad\uff09';
        typeColor = '#69db7c'; // green = should work
      } else if (/\.m3u8(\?|#|$)/i.test(rawUrl)) {
        urlType = 'm3u8';
        typeHint = 'M3U8/HLS \u683c\u5f0f\uff08hls.js \u5931\u8d25\uff09';
        typeColor = '#ffa94d';
      } else if (/^https?:\/\//.test(rawUrl)) {
        // 有协议但无法识别格式
        urlType = 'unrecognized';
        typeHint = '\u65e0\u6cd5\u8bc6\u522b\u7684\u683c\u5f0f';
        typeColor = '#ff6b6b';
      } else {
        urlType = 'invalid';
        typeHint = '\u65e0\u6548 URL';
        typeColor = '#ff6b6b';
      }

      // ---- 构建 DOM ----
      var overlay = global.document.createElement('div');
      overlay.id = 'sfv-diag-overlay';
      overlay.setAttribute('data-sfv-diag', 'true');
      // 样式：半透明深色背景 + 白字 + 居中 + 可滚动长 URL
      overlay.style.cssText =
        'position:fixed;top:0;left:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.93);color:#e0e0e0;font-family:monospace,' +
        '"Courier New",Consolas,"Segoe UI",sans-serif;font-size:12px;' +
        'z-index:2147483647;display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;padding:20px;box-sizing:border-box;overflow:auto;';

      // 内容器（限制最大宽度）
      var inner = global.document.createElement('div');
      inner.style.cssText =
        'max-width:600px;width:100%;background:#1a1a2e;border-radius:8px;' +
        'padding:16px;box-shadow:0 4px 24px rgba(0,0,0,0.5);';

      // 标题行
      var title = global.document.createElement('div');
      title.style.cssText =
        'font-size:14px;font-weight:bold;color:#fff;margin-bottom:12px;' +
        'text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;';
      title.textContent = '\u26a0 \u64ad\u653e\u8bca\u65ad';

      // 类型标签
      var badge = global.document.createElement('span');
      badge.style.cssText =
        'font-size:10px;padding:2px 8px;border-radius:10px;background:' + typeColor + ';color:#fff;';
      badge.textContent = urlType.toUpperCase();
      title.appendChild(badge);
      inner.appendChild(title);

      // 类型提示
      var hint = global.document.createElement('div');
      hint.style.cssText =
        'text-align:center;color:' + typeColor + ';font-size:13px;margin-bottom:12px;font-weight:bold;';
      hint.textContent = typeHint;
      inner.appendChild(hint);

      // 错误信息
      if (errorMsg) {
        var errDiv = global.document.createElement('div');
        errDiv.style.cssText =
          'color:#ff6b6b;font-size:11px;margin-bottom:12px;padding:8px;' +
          'background:rgba(255,107,107,0.15);border-radius:4px;word-break:break-all;';
        errDiv.textContent = '\u9519\u8bef: ' + errorMsg;
        inner.appendChild(errDiv);
      }

      // URL 显示区
      var urlLabel = global.document.createElement('div');
      urlLabel.style.cssText = 'color:#888;font-size:10px;margin-bottom:4px;text-transform:uppercase;';
      urlLabel.textContent = 'Raw URL (click to copy):';
      inner.appendChild(urlLabel);

      var urlBox = global.document.createElement('div');
      urlBox.style.cssText =
        'background:#0d1117;border:1px solid #30363d;border-radius:4px;' +
        'padding:10px;word-break:break-all;max-height:120px;overflow-y:auto;' +
        'cursor:pointer;position:relative;transition:background 0.2s;';
      urlBox.textContent = rawUrl || '(empty)';
      // 点击复制
      urlBox.addEventListener('click', function () {
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(rawUrl || '').then(function () {
            urlBox.style.background = '#1a472a';
            urlBox.setAttribute('data-copied', '1');
            setTimeout(function () {
              urlBox.style.background = '#0d1117';
              urlBox.removeAttribute('data-copied');
            }, 1500);
          }).catch(function () { /* clipboard API failed */ });
        }
      });
      // hover 效果
      urlBox.addEventListener('mouseenter', function () {
        if (!urlBox.getAttribute('data-copied')) urlBox.style.background = '#161b22';
      });
      urlBox.addEventListener('mouseleave', function () {
        if (!urlBox.getAttribute('data-copied')) urlBox.style.background = '#0d1117';
      });
      inner.appendChild(urlBox);

      // 复制提示
      var copyHint = global.document.createElement('div');
      copyHint.style.cssText = 'text-align:center;color:#555;font-size:10px;margin-top:4px;';
      copyHint.textContent = '\u70b9\u51fb\u4e0a\u65b9 URL \u590d\u5236';
      inner.appendChild(copyHint);

      // 操作按钮行
      var btnRow = global.document.createElement('div');
      btnRow.style.cssText =
        'display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap;';

      // 关闭按钮
      var closeBtn = global.document.createElement('button');
      closeBtn.textContent = '\u5173\u95ed';
      closeBtn.style.cssText =
        'padding:6px 16px;border:none;border-radius:4px;background:#333;color:#ccc;' +
        'cursor:pointer;font-size:12px;font-family:inherit;';
      closeBtn.addEventListener('click', function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      });
      btnRow.appendChild(closeBtn);

      // 如果是 iframe-wrapper 类型，提供"在浏览器中打开"按钮
      if (urlType === 'iframe-wrapper') {
        var openBtn = global.document.createElement('button');
        openBtn.textContent = '\u5728\u6d4f\u89c8\u5668\u4e2d\u6253\u5f00';
        openBtn.style.cssText =
          'padding:6px 16px;border:none;border-radius:4px;background:#0969da;color:#fff;' +
          'cursor:pointer;font-size:12px;font-family:inherit;';
        openBtn.addEventListener('click', function () {
          if (global.window && global.window.open) {
            global.window.open(rawUrl, '_blank', 'noopener,noreferrer');
          }
        });
        btnRow.appendChild(openBtn);
      }

      inner.appendChild(btnRow);

      // 底部提示
      var footer = global.document.createElement('div');
      footer.style.cssText =
        'text-align:center;color:#444;font-size:9px;margin-top:12px;';
      footer.textContent = 'Stellaflix Diagnostics v1.0 | \u5c06\u6b64\u4fe1\u606f\u5206\u4eab\u7ed9\u5f00\u53d1\u8005\u53ef\u52a9\u6392\u67e5\u95ee\u9898';
      inner.appendChild(footer);

      overlay.appendChild(inner);
      // fixed 定位不需要父元素设 relative
      body.appendChild(overlay);

      // 控制台也打一份完整 URL（方便开发者）
      if (global.console) {
        global.console.error('[SFV DIAG] ===== PLAYBACK FAILURE DIAGNOSTICS =====');
        global.console.error('[SFV DIAG] URL Type:', urlType, '-', typeHint);
        global.console.error('[SFV DIAG] Raw URL:', rawUrl);
        global.console.error('[SFV DIAG] Error:', errorMsg);
        global.console.error('[SFV DIAG] ==========================================');
      }
    } catch (e) {
      // 浮层创建失败不阻塞主流程
      if (global.console) global.console.warn('[SFV] Diagnostic overlay failed:', e && e.message);
    }
  }

  /**
   * 从 URL 提取域名用于展示（不含敏感路径和参数）。
   */
  function _extractDomain(url) {
    try {
      var u = parseUrl(url);
      return u ? u.hostname : '(invalid)';
    } catch (e) {
      return '(unknown)';
    }
  }

  function onPlayerClose() {
    if (activeHls) {
      try { activeHls.destroy(); } catch (e) {}
      activeHls = null;
    }
    if (activeFlv) {
      try { activeFlv.destroy(); } catch (e) {}
      activeFlv = null;
    }
  }

  function isHlsUrl(url) {
    if (typeof url !== 'string') return false;
    return HLS_EXT.test(url);
  }

  function isFlvUrl(url) {
    if (typeof url !== 'string') return false;
    return FLV_EXT.test(url);
  }

  /**
   * 解析并驱动播放器打开。真正的播放/进度/音轨仍由 player.js 负责。
   * HLS(.m3u8)：统一走 hls.js 动态加载 + 自定义代理 loader 挂载。
   * @returns {boolean|Promise<boolean>} 本地/直链同步返回布尔；HLS 返回 Promise。
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
    if (r.kind === 'local' && r.file) {
      return SFV.player.openFile(r.file);
    }
    var pid = r.id || ('url:' + r.rawUrl);
    if (r.kind === 'hls') {
      // 用 hls.js 接管（无论浏览器是否原生支持，统一代理 loader 处理跨域分片）
      var videoEl = SFV.player.getVideoEl();
      if (SFV.player.setCurrentUrl) SFV.player.setCurrentUrl(r.rawUrl);
      SFV.player.prepareForPlay(pid, r.title);
      return attachHls(videoEl, r.rawUrl, {
        id: pid, title: r.title,
        onError: function (e) {
          var errMsg = e && e.message ? e.message : (typeof e === 'string' ? e : 'HLS load failed');
          if (global.console) global.console.warn('[SFV source] HLS play error:', errMsg, r.rawUrl);
          // Sprint A Fix #3: toast 只在未回退时显示（attachHls 内部已处理回退场景的 toast）
          // 这里仅作为安全网——如果 attachHls 没触发回退但调了 onError
          if (SFV.online && SFV.online.toast) {
            var displayMsg = errMsg;
            if (displayMsg.length > 200) displayMsg = displayMsg.substring(0, 200) + '...';
            SFV.online.toast('HLS: ' + displayMsg);
          }
        },
        // Sprint A Fix #4: 回退回调 —— 记录回退事件用于统计/诊断
        onFallback: function (info) {
          if (global.console) {
            global.console.info('[SFV source] Used native fallback:', info.method, urlSummary(info.originalUrl));
          }
          // 可选：给用户一个轻量提示（不阻塞播放）
          if (SFV.online && SFV.online.toast) {
            SFV.online.toast('\u5df2\u5207\u6362\u5230\u539f\u751f\u64ad\u653e\u6a21\u5f0f');
          }
        },
      });
    }
    if (r.kind === 'flv') {
      // 跨域 FLV 必须走 /api/proxy（flv.js IO 受 CORS 约束）；resolve() 已把 r.playUrl
      // 对跨域预置为代理地址，同源则等于原始地址，故直接消费 r.playUrl。
      var flvVideoEl = SFV.player.getVideoEl();
      if (SFV.player.setCurrentUrl) SFV.player.setCurrentUrl(r.rawUrl);
      SFV.player.prepareForPlay(pid, r.title);
      return attachFlv(flvVideoEl, r.playUrl, {
        id: pid, title: r.title,
        onError: function (e) {
          var errMsg = e && e.message ? e.message : (typeof e === 'string' ? e : 'FLV load failed');
          if (global.console) global.console.warn('[SFV source] FLV play error:', errMsg, r.rawUrl);
          if (SFV.online && SFV.online.toast) {
            var displayMsg = errMsg;
            if (displayMsg.length > 200) displayMsg = displayMsg.substring(0, 200) + '...';
            SFV.online.toast('FLV: ' + displayMsg);
          }
        }
      });
    }
    // 直链（含原生可播 HLS）：直接交给 player
    return SFV.player.openUrl(r.playUrl, { id: pid, title: r.title });
  }

  SFV.source = {
    resolve: resolve,
    open: open,
    toProxyUrl: toProxyUrl,
    isHlsUrl: isHlsUrl,
    attachHls: attachHls,
    attachFlv: attachFlv,
    loadFlvLib: loadFlvLib,
    makeProxyLoader: makeProxyLoader,
    onPlayerClose: onPlayerClose,
    nativeHlsSupported: nativeHlsSupported,
    isFlvUrl: isFlvUrl,
    PROXY_PATH: PROXY_PATH,
    HLS_LIB_URL: HLS_LIB_URL,
    FLV_LIB_URL: FLV_LIB_URL,
    // Sprint A 工具函数（供诊断和测试使用）
    sanitizeHlsUrl: sanitizeHlsUrl,
    looksLikeRealM3u8: looksLikeRealM3u8,
    urlSummary: urlSummary,
    tryNativeFallback: tryNativeFallback,
    showDiagnosticOverlay: showDiagnosticOverlay,
  };
})(typeof window !== 'undefined' ? window : this);
