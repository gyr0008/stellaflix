/**
 * Stellaflix — Kazumi 引擎桥接层（Phase 2 接入层）
 *
 * 职责：把已移植的 Kazumi 规则引擎（public/video/kazumi/，严格对齐 Predidit/Kazumi）
 * 接入 Stellaflix 影视态产品。本文件是「胶水层」，刻意放在 kazumi/ 目录之外，
 * **不修改 kazumi/ 内部任何一行**（用户要求：Kazumi 技术成熟，禁止删减/乱改）。
 *
 * 它负责：
 *   1. 懒加载并缓存 Kazumi.createRuleManager()（规则存 localStorage: kazumi-rules）
 *   2. 规则管理：列表 / 导入 / 移除 / 启用禁用
 *      —— 启用状态用独立的 enabledMap 持久化（key: stellaflix-video-kazumi-enabled），
 *         不污染 Kazumi 的 Plugin 序列化结构（schema 的 toJson 不认识 enabled 字段，
 *         直接塞进 rule 对象会在序列化时丢失，故单独存）。
 *   3. 搜索归一化：Kazumi 返回的 {name, src} 转成 Stellaflix 网格 item 形状
 *   4. 章节归一化：Kazumi 的 roads[{name,data:[urls],identifier:[names]}]
 *      转成 Stellaflix 详情页的 plays[{from, episodes:[{name,url,index}]}]
 *   5. 播放页解析：从剧集入口页面（chapterResult 提取的 href）提取真实视频流地址
 *      （m3u8/mp4），对齐 Kazumi 原版的「播放页解析」层。
 *
 * 合规红线：本文件不预置/不内置任何规则。规则 100% 由用户在「规则」面板手动导入。
 *
 * @license GPL-3.0（与 Kazumi 上游一致；本胶水层同样 GPL-3.0）
 */
(function (global) {
  'use strict';
  if (!global.StellaflixVideo) global.StellaflixVideo = {};
  var SFV = global.StellaflixVideo;

  var ENABLED_KEY = 'stellaflix-video-kazumi-enabled';
  var NS = 'kazumi-bridge';
  var _manager = null;

  // ---- 工具 ----
  function readJSON(key, fallback) {
    try { var raw = global.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { global.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function hash(s) {
    var h = 5381, i = 0;
    s = String(s || '');
    for (; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return ('k' + (h >>> 0).toString(36));
  }

  // ---- 启用状态（独立持久化，不碰 Kazumi 序列化）----
  function readEnabled() { return readJSON(ENABLED_KEY, {}) || {}; }
  function writeEnabled(map) { writeJSON(ENABLED_KEY, map); }
  function isEnabled(ruleName) {
    var map = readEnabled();
    // 默认启用；仅当显式置 false 才禁用
    return map[ruleName] !== false;
  }
  function setEnabled(ruleName, on) {
    var map = readEnabled();
    if (on) delete map[ruleName]; else map[ruleName] = false;
    writeEnabled(map);
  }

  // ---- 管理器（懒加载）----
  function getManager() {
    if (_manager) return _manager;
    if (!global.Kazumi || !global.Kazumi.createRuleManager) {
      throw new Error('[KazumiBridge] Kazumi 引擎未加载（请确认 index.html 已引入 video/kazumi/*.js）');
    }
    _manager = global.Kazumi.createRuleManager();
    _manager.load();
    return _manager;
  }

  // ---- 规则管理 API ----
  function listRules() {
    var mgr = getManager();
    return mgr.list().map(function (r) {
      return {
        name: r.name,
        type: r.type,
        baseUrl: r.baseUrl,
        searchMode: r.searchMode,
        chapterMode: r.chapterMode,
        enabled: isEnabled(r.name),
        valid: !!global.KazumiRuleSchema && global.KazumiRuleSchema.validate(r).valid
      };
    });
  }

  function hasRules() {
    try { return getManager().list().length > 0; } catch (e) { return false; }
  }

  function importRule(input) {
    var mgr = getManager();
    var added = mgr.importRules(input); // 支持单条对象/字符串、数组
    return added;
  }

  function removeRule(name) {
    var mgr = getManager();
    mgr.remove(name);
    // 同步清理启用状态
    var map = readEnabled();
    if (name in map) { delete map[name]; writeEnabled(map); }
  }

  // 返回当前参与搜索的规则（有效 + 已启用 + xpath 模式）
  function getEnabledSearchRules() {
    var mgr = getManager();
    var all = mgr.getEnabledXpathRules(); // 已由 Kazumi 过滤：xpath 模式 + validate 通过
    return all.filter(function (r) { return isEnabled(r.name); });
  }

  /**
   * 跨所有启用规则搜索，归一化为 Stellaflix 网格 item 形状。
   * @returns {Promise<{items:Array, errors:Array<{ruleName:string,reason:string}>}>}
   */
  async function search(keyword, opts) {
    opts = opts || {};
    var kw = String(keyword == null ? '' : keyword).trim();
    // 透传 Kazumi 查询 DSL（tag/season/score/rank/weekday）：
    // 规则引擎支持的生效，不支持则整串作为关键词搜索（best-effort，符合分层生效方案）。
    if (opts.filters && SFV.SearchFilterCore) {
      var dsl = SFV.SearchFilterCore.SearchParser.fromFilterState(opts.filters);
      if (dsl) kw = (kw ? (kw + ' ') : '') + dsl;
    }
    if (!kw) return { items: [], errors: [] };
    var rules = getEnabledSearchRules();
    if (!rules.length) return { items: [], errors: [] };

    var mgr = getManager();
    var settled = await Promise.allSettled(rules.map(function (rule) {
      return mgr.search(rule, kw).then(function (trace) {
        return { ruleName: rule.name, items: trace.items || [] };
      });
    }));

    var items = [];
    var errors = [];
    settled.forEach(function (r) {
      if (r.status === 'rejected') {
        // 单规则失败不影响整体（与 CMS 源失败降级一致）
        errors.push({ ruleName: (r.reason && r.reason.pluginName) || 'unknown', reason: (r.reason && r.reason.message) || 'search-failed' });
        return;
      }
      var grp = r.value;
      (grp.items || []).forEach(function (it) {
        var name = it.name || '';
        var src = it.src || '';
        if (!name || !src) return;
        var key = 'kazumi:' + grp.ruleName + ':' + hash(grp.ruleName + '|' + name + '|' + src);
        items.push({
          isKazumi: true,
          key: key,
          title: name,
          pic: '',            // Kazumi XPath 搜索默认不返回封面（searchResult 是链接），留空走占位图
          year: '',
          sourceName: grp.ruleName,
          ruleName: grp.ruleName,
          src: src,           // 详情页链接（章节解析用）
          variants: [{
            key: key,
            sourceId: 'kazumi:' + grp.ruleName,
            vodId: key,
            isKazumi: true,
            ruleName: grp.ruleName,
            src: src
          }]
        });
      });
    });
    return { items: items, errors: errors };
  }

  /**
   * 取某规则的章节列表，归一化为 Stellaflix 详情页 plays 形状。
   * @returns {Promise<{plays:Array<{from:string, episodes:Array<{name,url,index}>}>}>}
   */
  async function getChapters(ruleName, src) {
    var mgr = getManager();
    var trace = await mgr.getChapters(ruleName, src); // { roads:[{name,data:[urls],identifier:[names]}], ... }
    var roads = trace.roads || [];
    var plays = roads.map(function (road) {
      var urls = road.data || [];
      var names = road.identifier || [];
      var episodes = urls.map(function (url, i) {
        return {
          name: (names[i] && names[i].trim()) || ('第' + (i + 1) + '集'),
          url: url,
          index: i
        };
      });
      return { from: road.name || '播放线路', episodes: episodes };
    });
    return { plays: plays };
  }

  // ---- 播放页解析器（从剧集入口 HTML 页面提取真实视频流地址）----
  // Kazumi 规则的 chapterResult 提取的是剧集入口页面 URL（如 /play/123-1.html），
  // 不是直接的 m3u8/mp4 地址。Kazumi 原版 Flutter 有专门的播放页解析层来提取真实地址。
  // 本解析器对齐该能力，用多种策略从 HTML 中嗅探视频 URL。

  /** 嗅探策略：按优先级依次尝试，第一个命中的即为结果 */
  var PLAY_URL_PATTERNS = [
    // 策略 1: <video src="..."> 或 <source src="...">
    { name: 'video-src', test: function (html) {
      var m = html.match(/<video[^>]+src=["']([^"']+)["']/i);
      if (m) return m[1];
      m = html.match(/<source[^>]+src=["']([^"']+)["']/i);
      return m ? m[1] : null;
    }},
    // 策略 2: .m3u8 URL（最常见）
    { name: 'm3u8-url', test: function (html) {
      var m = html.match(/https?:\/\/[^\s"']+\.(m3u8)(\?[^"'\s]*)?/i);
      return m ? m[0] : null;
    }},
    // 策略 3: .mp4/.flv 直接视频 URL
    { name: 'direct-video', test: function (html) {
      var m = html.match(/https?:\/\/[^\s"']+\.(mp4|flv|webm|mkv)(\?[^"'\s]*)?/i);
      return m ? m[0] : null;
    }},
    // 策略 4: iframe src（常见于聚合播放器）
    { name: 'iframe-src', test: function (html) {
      var m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      return m ? m[1] : null;
    }},
    // 策略 5: JS 变量中的 URL（var url/var player/video_url 等）
    { name: 'js-variable', test: function (html) {
      var patterns = [
        /(?:var|let|const)\s+(?:url|videoUrl|playUrl|source|player.*?url)\s*=\s*["']([^"']+)["']/i,
        /["'](https?:\/\/[^"']*\.(?:m3u8|mp4|flv)[^"']*?)["']/i,
        /\burl\s*[:=]\s*["']([^"']+)["']/i
      ];
      for (var i = 0; i < patterns.length; i++) {
        var m = html.match(patterns[i]);
        if (m) return m[1];
      }
      return null;
    }}
  ];

  /**
   * 第三方视频解析器 URL 识别。
   *
   * 关键事实（已对 agedm.io 实测验证）：
   *   agedm.io 的播放页 /play/{id}/{line}/{ep} 内的 <iframe id="iframeForVideo">
   *   指向 https://jx.wuzhoupai.com:8443/vip/?url=age_<密文> 这类「云播放器」。
   *   这类页面**不在 HTML 中暴露真实 m3u8/mp4**——真实流地址由页面内的 play.min.js
   *   配合 wasm 模块在客户端解密后自渲染播放器。因此对我们而言「提取直链」是不可能的，
   *   只能把整个解析器页面**嵌入 iframe**，交由它自己的播放器去解密并播放。
   *
   * 注意：agedm.io 自身发送 X-Frame-Options: SAMEORIGIN（不可被我们直接 iframe），
   * 但 jx.wuzhoupai.com 解析器页面**没有** X-Frame-Options（本就是被 agedm.io 嵌入的），
   * 故可以安全嵌入解析器 URL。
   */
  var PARSER_URL_PATTERNS = [
    /[?&]url=age_/i,                  // agedm 等编码参数（age_ + Base64 密文）
    /\/vip\/\?url=/i,                 // 通用 /vip/?url= 解析入口
    /\bjx\.[a-z0-9-]+\.[a-z]{2,}/i,   // jx.xxx.com 类解析域名（解析 = jiexi）
    /\/jx\//i,                         // /jx/ 路径解析器
    /player\.php\?url=/i,             // 通用 player.php?url=
    /m3u8\.php\?url=/i,
    /api\.php\?url=/i
  ];
  function isParserUrl(u) {
    if (!u) return false;
    for (var i = 0; i < PARSER_URL_PATTERNS.length; i++) {
      if (PARSER_URL_PATTERNS[i].test(u)) return true;
    }
    return false;
  }

  /**
   * 从剧集入口页面提取真实视频流地址
   *
   * @param {string} episodePageUrl - chapterResult 提取的剧集页面 URL（HTML）
   * @param {string} [ruleName] - 规则名称（用于日志）
   * @returns {Promise<{url:string, method:string}|null>} 解析出的视频 URL 与所用策略，
   *          或 null（无法提取时返回 null，调用方可降级处理）
   */
  async function resolvePlayUrl(episodePageUrl, ruleName) {
    ruleName = ruleName || 'unknown';
    if (!episodePageUrl) return null;

    try {
      // 经 /api/proxy 获取剧集页面 HTML（绕开 CORS + 带 KVideo 式浏览器头）
      var mgr = getManager();
      var httpClient = mgr.httpClient || global.KazumiHttpClient;
      var rawHtml;
      if (httpClient && typeof httpClient.get === 'function') {
        rawHtml = await httpClient.get(episodePageUrl, { useProxy: true });
      } else {
        var resp = await fetch('/api/proxy?url=' + encodeURIComponent(episodePageUrl));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        rawHtml = await resp.text();
      }

      if (!rawHtml || !rawHtml.trim()) return null;

      // 逐策略嗅探
      for (var pi = 0; pi < PLAY_URL_PATTERNS.length; pi++) {
        var strategy = PLAY_URL_PATTERNS[pi];
        var found = strategy.test(rawHtml);
        if (found) {
          // 若为 iframe 且指向第三方视频解析器，则标记为「嵌入播放」而非直链——
          // 解析器页面用 wasm/JS 客户端解密真实流，无法提取直链，只能整体嵌入。
          var embed = (strategy.name === 'iframe-src') && isParserUrl(found);
          console.log('[KazumiBridge] resolvePlayUrl [' + ruleName + '] 策略' + strategy.name +
            '命中: ' + found.slice(0, 120) + (embed ? ' → 解析器iframe(嵌入播放)' : ''));
          return { url: found, method: strategy.name, embed: embed };
        }
      }

      // 兜底：扫描页面所有 iframe，识别第三方解析器（防止策略4未命中但页面仍含解析器iframe）
      var iframeMatches = rawHtml.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
      for (var fi = 0; fi < iframeMatches.length; fi++) {
        var im = iframeMatches[fi].match(/src=["']([^"']+)["']/i);
        if (im && im[1] && isParserUrl(im[1])) {
          console.log('[KazumiBridge] resolvePlayUrl [' + ruleName + '] 兜底命中解析器iframe: ' + im[1].slice(0, 120));
          return { url: im[1], method: 'iframe-src', embed: true };
        }
      }

      console.log('[KazumiBridge] resolvePlayUrl [' + ruleName + '] 所有策略均未命中（页面长度: ' + rawHtml.length + '）');
      return null;
    } catch (e) {
      console.warn('[KazumiBridge] resolvePlayUrl [' + ruleName + '] 异常:', e.message);
      return null;
    }
  }

  SFV.kazumi = {
    NS: NS,
    getManager: getManager,
    listRules: listRules,
    hasRules: hasRules,
    importRule: importRule,
    removeRule: removeRule,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    getEnabledSearchRules: getEnabledSearchRules,
    search: search,
    getChapters: getChapters,
    resolvePlayUrl: resolvePlayUrl
  };

  // 兼容直接调用
  if (typeof module === 'object' && module.exports) {
    module.exports = SFV.kazumi;
  }
})(typeof window !== 'undefined' ? window : this);
