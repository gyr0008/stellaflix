/*
 * Stellaflix 影视模块 — 片源管理与 CMS10 协议层（阶段 1）
 *
 * 【合规红线 · 不可协商】
 *   本文件**不预置、不内置、不硬编码任何站点地址**。出厂 sources 列表为空数组，
 *   全部由用户在「视觉控制台 → 片源」分页手动导入。Stellaflix 不存储、不提供任何
 *   视频资源，仅充当用户自备资源的播放器。测试 step4_logic_test.js 以断言强制此项。
 *
 * 【分层】
 *   - 纯函数层（normalizeSource / parsePlayUrl / dedupe / buildListUrl …）不碰 DOM、不发请求，
 *     可在 vm 沙箱中直接验证。
 *   - IO 层（testSource / search / detail）经 Step1 的 /api/proxy 走服务端，规避渲染进程
 *     的 CORS 与混合内容限制；超时用 AbortController 熔断，单站失败降级不阻断整体。
 *
 * 【CMS10（苹果 CMS V10）接口约定】
 *   列表/搜索：{api}?ac=videolist&wd=<关键词>&pg=<页码>[&t=<分类id>]
 *   详情：    {api}?ac=detail&ids=<vod_id>
 *   注：部分站点仅实现 ac=list（不含播放地址），故搜索结果缺 vod_play_url 时回落到详情请求。
 *   播放地址：vod_play_from 用 $$$ 分隔播放源名；vod_play_url 同样用 $$$ 分隔各源，
 *            源内用 # 分隔集，集内用第一个 $ 分隔「集名」与「地址」。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var NS = 'stellaflix-video-';
  var KEY_SOURCES = NS + 'sources';
  var KEY_DETAIL_CACHE = NS + 'detail-cache';
  var CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 缓存快照 7 天

  var DEFAULT_TIMEOUT = 12000;

  // ---------------------------------------------------------------- 存储

  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, val) {
    try {
      global.localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }

  function genId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * 归一化用户输入的源。返回 {ok, source, reason}。
   * 只接受 http/https；不接受空名或空 api。
   */
  function normalizeSource(input) {
    var out = { ok: false, source: null, reason: null };
    if (!input || typeof input !== 'object') {
      out.reason = 'empty-input';
      return out;
    }
    var name = String(input.name == null ? '' : input.name).trim();
    var api = String(input.api == null ? '' : input.api).trim();
    if (!api) {
      out.reason = 'empty-api';
      return out;
    }
    var u;
    try {
      u = new global.URL(api);
    } catch (e) {
      out.reason = 'invalid-api-url';
      return out;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      out.reason = 'unsupported-scheme:' + u.protocol;
      return out;
    }
    out.ok = true;
    var mirrors = [];
    if (Array.isArray(input.mirrors)) {
      input.mirrors.forEach(function (m) {
        var mapi = String(m == null ? '' : m).trim();
        if (!mapi) return;
        try {
          var mu = new global.URL(mapi);
          if (mu.protocol === 'http:' || mu.protocol === 'https:') mirrors.push(mu.href);
        } catch (e) { /* 忽略非法镜像 */ }
      });
    }
    out.source = {
      id: input.id || genId(),
      name: name || u.hostname,
      api: u.href,
      enabled: input.enabled === false ? false : true,
      addedAt: input.addedAt || Date.now(),
      mirrors: mirrors,
    };
    return out;
  }

  function getSources() {
    var list = readJSON(KEY_SOURCES, []);
    return Array.isArray(list) ? list : [];
  }

  function getEnabledSources() {
    return getSources().filter(function (s) { return s && s.enabled; });
  }

  function addSource(input) {
    var n = normalizeSource(input);
    if (!n.ok) return n;
    var list = getSources();
    // 同 api 视为同源，避免重复导入
    for (var i = 0; i < list.length; i++) {
      if (list[i].api === n.source.api) {
        return { ok: false, source: list[i], reason: 'duplicate-api' };
      }
    }
    list.push(n.source);
    writeJSON(KEY_SOURCES, list);
    return { ok: true, source: n.source, reason: null };
  }

  function updateSource(id, patch) {
    var list = getSources();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        var merged = {};
        for (var k in list[i]) if (Object.prototype.hasOwnProperty.call(list[i], k)) merged[k] = list[i][k];
        for (var k2 in patch) if (Object.prototype.hasOwnProperty.call(patch, k2)) merged[k2] = patch[k2];
        var n = normalizeSource(merged);
        if (!n.ok) return n;
        n.source.id = id;
        list[i] = n.source;
        writeJSON(KEY_SOURCES, list);
        return { ok: true, source: n.source, reason: null };
      }
    }
    return { ok: false, source: null, reason: 'not-found' };
  }

  function removeSource(id) {
    var list = getSources();
    var next = list.filter(function (s) { return s.id !== id; });
    writeJSON(KEY_SOURCES, next);
    return next;
  }

  function setEnabled(id, enabled) {
    return updateSource(id, { enabled: !!enabled });
  }

  // ---------------------------------------------------------------- URL 构造

  function appendQuery(api, params) {
    var qs = [];
    for (var k in params) {
      if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
      var v = params[k];
      if (v === undefined || v === null || v === '') continue;
      qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    if (!qs.length) return api;
    return api + (api.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
  }

  function buildListUrl(source, opts) {
    opts = opts || {};
    return appendQuery(source.api, {
      ac: opts.ac || 'videolist',
      wd: opts.wd,
      pg: opts.pg,
      t: opts.t,
      h: opts.h,
    });
  }

  function buildDetailUrl(source, ids) {
    return buildDetailUrlWithApi(source.api, ids);
  }

  function buildDetailUrlWithApi(api, ids) {
    return appendQuery(api, { ac: 'detail', ids: ids });
  }

  // ---------------------------------------------------------------- 解析

  /**
   * 解析 CMS10 的 vod_play_from / vod_play_url。
   * @returns {Array<{from:string, episodes:Array<{name:string,url:string,index:number}>}>}
   */
  function parsePlayUrl(playFrom, playUrl) {
    if (!playUrl) return [];
    var froms = String(playFrom == null ? '' : playFrom).split('$$$');
    var groups = String(playUrl).split('$$$');
    var result = [];
    for (var g = 0; g < groups.length; g++) {
      var raw = groups[g];
      if (!raw) continue;
      var eps = [];
      var parts = raw.split('#');
      for (var i = 0; i < parts.length; i++) {
        var seg = parts[i];
        if (!seg) continue;
        var at = seg.indexOf('$');
        var name, url;
        if (at < 0) {
          // 没有集名，整段视为地址
          name = '第' + (eps.length + 1) + '集';
          url = seg;
        } else {
          name = seg.slice(0, at);
          url = seg.slice(at + 1);
        }
        url = String(url).trim();
        if (!url) continue;
        if (!/^https?:/i.test(url)) continue; // 丢弃非 http(s)，防 javascript: 等注入
        eps.push({ name: (name || '').trim() || ('第' + (eps.length + 1) + '集'), url: url, index: eps.length });
      }
      if (eps.length) {
        result.push({ from: (froms[g] || ('源' + (g + 1))).trim(), episodes: eps });
      }
    }
    return result;
  }

  /**
   * 统计 playUrl 的最大分源集数（与 parsePlayUrl 同一切分逻辑，但只计数不解析）。
   * 用于「结构识别」过滤：竖屏短剧通常 60–100+ 集，普通剧集 20–50，电影 1。
   * 注意：CMS10 不提供单集时长，故只能用集数近似识别。
   * @param {string} playUrl - vod_play_url（$$$ 分源，# 分集）
   * @returns {number} 最大分源的有效集数（无播放地址返回 0）
   */
  function countEpisodes(playUrl) {
    if (!playUrl) return 0;
    var groups = String(playUrl).split('$$$');
    var max = 0;
    for (var g = 0; g < groups.length; g++) {
      var raw = groups[g];
      if (!raw) continue;
      var parts = raw.split('#');
      var cnt = 0;
      for (var i = 0; i < parts.length; i++) {
        var seg = parts[i];
        if (!seg) continue;
        var at = seg.indexOf('$');
        var url = at < 0 ? seg : seg.slice(at + 1);
        url = String(url).trim();
        if (!url) continue;
        if (!/^https?:/i.test(url)) continue; // 与 parsePlayUrl 一致：丢弃非 http(s)
        cnt++;
      }
      if (cnt > max) max = cnt;
    }
    return max;
  }

  /**
   * 把 CMS10 的一条 vod 记录归一化为内部结构。
   */
  function normalizeVod(raw, source) {
    if (!raw) return null;
    var id = raw.vod_id != null ? String(raw.vod_id) : '';
    if (!id) return null;
    return {
      key: (source && source.id ? source.id : '?') + ':' + id,
      vodId: id,
      sourceId: source ? source.id : '',
      sourceName: source ? source.name : '',
      title: String(raw.vod_name == null ? '' : raw.vod_name).trim(),
      pic: String(raw.vod_pic == null ? '' : raw.vod_pic).trim(),
      remarks: String(raw.vod_remarks == null ? '' : raw.vod_remarks).trim(),
      year: String(raw.vod_year == null ? '' : raw.vod_year).trim(),
      area: String(raw.vod_area == null ? '' : raw.vod_area).trim(),
      typeName: String(raw.type_name == null ? '' : raw.type_name).trim(),
      content: String(raw.vod_content == null ? '' : raw.vod_content).trim(),
      playFrom: String(raw.vod_play_from == null ? '' : raw.vod_play_from),
      playUrl: String(raw.vod_play_url == null ? '' : raw.vod_play_url),
    };
  }

  /**
   * 从 CMS10 响应体中取出 list 数组（兼容不同站点的包装差异）。
   */
  function extractList(json) {
    if (!json || typeof json !== 'object') return [];
    if (Array.isArray(json.list)) return json.list;
    if (json.data && Array.isArray(json.data)) return json.data;
    if (json.data && Array.isArray(json.data.list)) return json.data.list;
    return [];
  }

  /**
   * 跨源结果归并：同「片名 + 年份」视为同一影片，保留多个来源供切换。
   */
  function dedupe(items) {
    var map = {};
    var order = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.title) continue;
      var k = it.title.toLowerCase() + '|' + (it.year || '');
      if (!map[k]) {
        map[k] = { title: it.title, year: it.year, pic: it.pic, remarks: it.remarks,
                   typeName: it.typeName, content: it.content, variants: [] };
        order.push(k);
      }
      if (!map[k].pic && it.pic) map[k].pic = it.pic;
      if (!map[k].content && it.content) map[k].content = it.content;
      map[k].variants.push(it);
    }
    return order.map(function (k) { return map[k]; });
  }

  // ---------------------------------------------------------------- IO

  function proxied(url) {
    if (SFV.source && typeof SFV.source.toProxyUrl === 'function') return SFV.source.toProxyUrl(url);
    return '/api/proxy?url=' + encodeURIComponent(url);
  }

  function fetchJson(url, timeout) {
    var ms = timeout || DEFAULT_TIMEOUT;
    if (typeof global.fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    var ctrl = null, timer = null;
    var opts = {};
    if (typeof global.AbortController === 'function') {
      ctrl = new global.AbortController();
      opts.signal = ctrl.signal;
    }
    var p = global.fetch(proxied(url), opts).then(function (res) {
      if (!res || !res.ok) throw new Error('http-' + (res ? res.status : 'null'));
      return res.text();
    }).then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('invalid-json');
      }
    });
    if (ctrl) {
      timer = global.setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
      p = p.then(function (v) { global.clearTimeout(timer); return v; },
                 function (e) { global.clearTimeout(timer); throw e; });
    }
    return p;
  }

  // ---------------------------------------------------------------- 详情缓存快照
  function readDetailCache(key) {
    var all = readJSON(KEY_DETAIL_CACHE, {});
    return all[key] || null;
  }
  function writeDetailCache(key, data) {
    var all = readJSON(KEY_DETAIL_CACHE, {});
    all[key] = data;
    writeJSON(KEY_DETAIL_CACHE, all);
  }
  function cacheValid(ts) {
    return !!ts && (Date.now() - ts) < CACHE_TTL;
  }

  /**
   * 依次尝试多个 URL，返回首个成功的 JSON。
   */
  function fetchFirstJson(urls, timeout) {
    return new Promise(function (resolve, reject) {
      var i = 0;
      var lastErr = null;
      function tryNext() {
        if (i >= urls.length) {
          reject(lastErr || new Error('all-urls-failed'));
          return;
        }
        fetchJson(urls[i++], timeout).then(resolve).catch(function (e) {
          lastErr = e;
          tryNext();
        });
      }
      tryNext();
    });
  }

  /**
   * 对单个媒体/episode URL 做轻量 HEAD 探测。
   * 部分 CDN 对 HEAD 返回 405，仍视为「可响应」；超时/网络错误视为失效。
   * @returns {Promise<{ok:boolean, status:number, reason:string|null}>}
   */
  function testUrl(url, timeout) {
    var ms = timeout || 5000;
    if (typeof global.fetch !== 'function') return Promise.resolve({ ok: false, status: 0, reason: 'fetch-unavailable' });
    var ctrl = null, timer = null;
    var opts = { method: 'HEAD' };
    if (typeof global.AbortController === 'function') {
      ctrl = new global.AbortController();
      opts.signal = ctrl.signal;
    }
    var p = global.fetch(proxied(url), opts).then(function (res) {
      // 405 Method Not Allowed 说明服务器在线但不支持 HEAD，仍算可达
      return { ok: res.ok || res.status === 405, status: res.status, reason: null };
    }).catch(function (e) {
      return { ok: false, status: 0, reason: (e && e.message) ? e.message : 'error' };
    });
    if (ctrl) {
      timer = global.setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
      p = p.then(function (v) { global.clearTimeout(timer); return v; }, function (e) { global.clearTimeout(timer); throw e; });
    }
    return p;
  }

  /**
   * 连通性测试：请求一页列表，能解析出数组即视为可用。
   * @returns {Promise<{ok:boolean, count:number, reason:string|null, ms:number}>}
   */
  function testSource(source, timeout) {
    var t0 = Date.now();
    var n = normalizeSource(source);
    if (!n.ok) return Promise.resolve({ ok: false, count: 0, reason: n.reason, ms: 0 });
    return fetchJson(buildListUrl(n.source, { ac: 'videolist', pg: 1 }), timeout).then(function (json) {
      var list = extractList(json);
      return { ok: list.length > 0, count: list.length,
               reason: list.length ? null : 'empty-list', ms: Date.now() - t0 };
    }).catch(function (e) {
      return { ok: false, count: 0, reason: (e && e.message) || 'error', ms: Date.now() - t0 };
    });
  }

  /**
   * 聚合搜索：并发请求所有启用源，单站失败/超时降级为空，不阻断整体。
   * @returns {Promise<{items:Array, errors:Array<{sourceId,name,reason}>}>}
   */
  function search(keyword, opts) {
    opts = opts || {};
    var kw = String(keyword == null ? '' : keyword).trim();
    if (!kw) return Promise.resolve({ items: [], errors: [] });
    var list = opts.sources || getEnabledSources();
    if (!list.length) return Promise.resolve({ items: [], errors: [], noSource: true });

    // 纯排除模型：排除维度在 online.js 层客户端过滤，此处不再接收年份服务端过滤。
    // 保留 filters 透传位（未来若片源支持分类/地区服务端排除可在此启用），当前仅作占位。
    var filters = opts.filters || {};
    var errors = [];
    var jobs = list.map(function (src) {
      return fetchJson(buildListUrl(src, {
        ac: 'videolist', wd: kw, pg: opts.pg || 1,
        h: filters.year != null ? filters.year : null
      }), opts.timeout)
        .then(function (json) {
          return extractList(json).map(function (raw) { return normalizeVod(raw, src); })
            .filter(Boolean);
        })
        .catch(function (e) {
          errors.push({ sourceId: src.id, name: src.name, reason: (e && e.message) || 'error' });
          return [];
        });
    });

    return Promise.all(jobs).then(function (chunks) {
      var flat = [];
      for (var i = 0; i < chunks.length; i++) flat = flat.concat(chunks[i]);
      return { items: dedupe(flat), errors: errors, raw: flat };
    });
  }

  /**
   * 取详情（含播放地址）。搜索结果已带 playUrl 时可跳过。
   * 支持镜像回退与缓存快照：主 API 与镜像均失败时，返回未过期的缓存 plays。
   * @returns {Promise<{ok:boolean, vod:Object|null, plays:Array, reason:string|null, fromCache?:boolean}>}
   */
  function detail(source, vodId, timeout) {
    var n = normalizeSource(source);
    if (!n.ok) return Promise.resolve({ ok: false, vod: null, plays: [], reason: n.reason });
    var cacheKey = n.source.id + ':' + vodId;
    var cache = readDetailCache(cacheKey);

    var urls = [buildDetailUrl(n.source, vodId)];
    (n.source.mirrors || []).forEach(function (m) { urls.push(buildDetailUrlWithApi(m, vodId)); });

    return fetchFirstJson(urls, timeout).then(function (json) {
      var list = extractList(json);
      if (!list.length) return { ok: false, vod: null, plays: [], reason: 'not-found' };
      var vod = normalizeVod(list[0], n.source);
      if (!vod) return { ok: false, vod: null, plays: [], reason: 'invalid-record' };
      var plays = parsePlayUrl(vod.playFrom, vod.playUrl);
      writeDetailCache(cacheKey, { plays: plays, sourceId: n.source.id, vodId: vodId, ts: Date.now() });
      return { ok: true, vod: vod, plays: plays, reason: null };
    }).catch(function (e) {
      if (cache && cacheValid(cache.ts)) {
        return { ok: true, vod: null, plays: cache.plays || [], reason: null, fromCache: true };
      }
      return { ok: false, vod: null, plays: [], reason: (e && e.message) || 'error' };
    });
  }

  SFV.sources = {
    KEY: KEY_SOURCES,
    CACHE_KEY: KEY_DETAIL_CACHE,
    // 存储
    getSources: getSources,
    getEnabledSources: getEnabledSources,
    addSource: addSource,
    updateSource: updateSource,
    removeSource: removeSource,
    setEnabled: setEnabled,
    normalizeSource: normalizeSource,
    // 纯函数
    buildListUrl: buildListUrl,
    buildDetailUrl: buildDetailUrl,
    buildDetailUrlWithApi: buildDetailUrlWithApi,
    parsePlayUrl: parsePlayUrl,
    countEpisodes: countEpisodes,
    normalizeVod: normalizeVod,
    extractList: extractList,
    dedupe: dedupe,
    // IO
    testSource: testSource,
    testUrl: testUrl,
    search: search,
    detail: detail,
  };
})(typeof window !== 'undefined' ? window : this);
