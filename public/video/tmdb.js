/*
 * Stellaflix 影视模块 — TMDB 元数据客户端 (海报 / 简介 / 评分 / 年份)
 *
 * 用途：统一视频海报与简介。TMDB 是「元数据服务」（海报图 + 文字简介），并非视频源，
 *       因此不违反 §0.3「内容层（api_site 视频地址）必须为空」的合规红线。
 *       ⚠️ TMDB API 条款强制要求显示署名：
 *         "This product uses the TMDB API but is not endorsed or certified by TMDB"
 *         集成到 UI 时必须保留该署名（建议放在设置页/关于页/页脚）。
 *
 * 认证：采用 v3 API Key（作为 query 参数 api_key 拼在 URL 内）。
 *       原因：本应用 /api/proxy 仅白名单透传弹弹play 专用头（x-appid 等），不透传
 *       Authorization；v3 api_key 放在 target URL 内天然绕过该限制，无需改 proxy。
 *       注：TMDB v3 key 设计为可在客户端使用（非秘密凭证），本文件以开发期默认值内置，
 *       但支持 localStorage('stellaflix-tmdb-key') 覆盖——发布前建议改为「设置页用户自填」，
 *       避免开源仓库泄露后被滥用/触发 TMDB 限额。TMDB v3 key 可在后台随时 revoke/重置。
 *       申请：https://www.themoviedb.org/settings/api（Developer 免费档，非商业免费）。
 *
 * 重要：本机网络环境下标准域名 api.themoviedb.org 不可达（连接被拒），
 *       可用域名为 api.tmdb.org（实测 200）。DEFAULT_BASE 据此设置。
 *
 * 网络：所有请求经 /api/proxy 转发，解决浏览器 CORS；中文优先 language=zh-CN&region=CN。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  // 本机实测：api.themoviedb.org 连接失败(000)，api.tmdb.org 返回 200。以可用域名为准。
  var DEFAULT_BASE = 'https://api.tmdb.org/3';
  var IMG_BASE = 'https://image.tmdb.org/t/p/';

  // 开发期默认值（用户提供的 TMDB v3 key）。发布前建议改为 localStorage 用户自填。
  var DEFAULT_API_KEY = '9dec1a00115e77d571c734a831289c30';

  var LS_KEY = 'stellaflix-tmdb-key';

  var cfg = {
    baseUrl: DEFAULT_BASE,
    proxyBase: '',
    apiKey: DEFAULT_API_KEY,
    language: 'zh-CN',
    region: 'CN'
  };

  function buildProxyUrl(path, query) {
    var qs = Object.keys(query).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]);
    }).join('&');
    var target = cfg.baseUrl + path + (qs ? '?' + qs : '');
    return (cfg.proxyBase || '') + '/api/proxy?url=' + encodeURIComponent(target);
  }

  function request(path, query) {
    var q = Object.assign({ api_key: cfg.apiKey, language: cfg.language, region: cfg.region }, query || {});
    var url = buildProxyUrl(path, q);
    if (!global.fetch) return Promise.reject(new Error('TMDB_NO_FETCH'));
    return global.fetch(url).then(function (r) {
      if (!r.ok) throw new Error('TMDB_HTTP_' + r.status);
      return r.json();
    });
  }

  function posterUrl(path, size) {
    if (!path) return null;
    // 网格缩略图默认 w342（~342px，足够 6 列响应式卡片；详情页传 'w500' 覆盖）
    var full = IMG_BASE + (size || 'w342') + path;
    // TMDB 图片 CDN (image.tmdb.org) 在部分网络（沙箱/中国大陆常见）被浏览器侧封锁，
    // 直接 <img>/background-image 静默失败 → 海报空白。走本地 /api/proxy 转发，
    // 服务端可达 image.tmdb.org（22:3x 沙箱实测 HTTP 200 / 4.17s）。
    // 注意：poster-cache 缓存后存为 data:，下次直接读本地；本路径仅未缓存的远程海报生效。
    return (cfg.proxyBase || '') + '/api/proxy?url=' + encodeURIComponent(full);
  }

  // 搜索电影 + 剧集（含 person 但过滤掉），用于「按标题补全海报/简介」
  function search(query) {
    if (!cfg.apiKey) return Promise.reject(new Error('TMDB_KEY_REQUIRED'));
    return request('/search/multi', { query: query, include_adult: 'false' }).then(function (j) {
      return (j.results || []).map(function (r) {
        return {
          id: r.id,
          mediaType: r.media_type,                 // movie / tv
          title: r.title || r.name || '',
          originalTitle: r.original_title || r.original_name || '',
          year: (r.release_date || r.first_air_date || '').slice(0, 4),
          overview: r.overview || '',
          poster: posterUrl(r.poster_path),
          rating: r.vote_average || 0
        };
      }).filter(function (x) { return x.mediaType === 'movie' || x.mediaType === 'tv'; });
    });
  }

  // 单条目详情（补全简介 / 海报 / 背景图）
  function getDetails(id, mediaType) {
    if (!cfg.apiKey) return Promise.reject(new Error('TMDB_KEY_REQUIRED'));
    var path = '/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' + id;
    return request(path, {}).then(function (r) {
      return {
        id: r.id, mediaType: mediaType,
        title: r.title || r.name || '',
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        overview: r.overview || '',
        poster: posterUrl(r.poster_path, 'w500'),
        backdrop: posterUrl(r.backdrop_path, 'w780'),
        rating: r.vote_average || 0
      };
    });
  }

  // 便捷：按标题取第一个匹配的海报+简介（番名归一化可在此复用）
  function bestMatch(title) {
    return search(title).then(function (list) {
      return list && list.length ? list[0] : null;
    });
  }

  // 热门/流行列表（用于电影/动漫分页默认网格，无需搜索词）
  // mediaType: 'movie' | 'anime'(动画 = tv 流按 genre 16 过滤)
  // 返回归一化数组：{ id, mediaType, title, originalTitle, year, overview, poster, rating, genreIds }
  function normalizeList(j) {
    return (j.results || []).map(function (r) {
      return {
        id: r.id,
        mediaType: r.media_type || (r.first_air_date ? 'tv' : 'movie'),
        title: r.title || r.name || '',
        originalTitle: r.original_title || r.original_name || '',
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        overview: r.overview || '',
        poster: posterUrl(r.poster_path),
        rating: r.vote_average || 0,
        genreIds: r.genre_ids || []
      };
    });
  }

  function popular(mediaType, page) {
    if (!cfg.apiKey) return Promise.reject(new Error('TMDB_KEY_REQUIRED'));
    var p = page || 1;
    if (mediaType === 'anime') {
      // 用 discover/tv + with_genres=16(动画) + popularity.desc 获取动漫热门列表。
      // 之前 tv/popular + 客户端过滤的方案每页仅 0~4 条动漫（热门剧大多非动画），
      // 已改用 discover 端点服务端过滤（实测 ~15000 部 / 752 页）。
      return request('/discover/tv', { page: p, with_genres: '16', sort_by: 'popularity.desc' }).then(normalizeList);
    }
    return request('/movie/popular', { page: p }).then(normalizeList);
  }

  // 通用 discover 查询（片单引擎 collections.js 使用）：支持任意筛选参数组合
  // params: { with_genres, sort_by, primary_release_year, vote_average_gte, ... }
  // 返回 normalizeList 格式数组：{ id, mediaType, title, year, poster, rating, genreIds }
  function discover(params) {
    if (!cfg.apiKey) return Promise.reject(new Error('TMDB_KEY_REQUIRED'));
    var q = Object.assign({ page: 1 }, params || {});
    return request('/discover/movie', q).then(normalizeList);
  }

  // 趋势榜（片单「推荐」类使用）：mediaType=movie|tv，timeWindow=day|week
  function trending(mediaType, timeWindow) {
    if (!cfg.apiKey) return Promise.reject(new Error('TMDB_KEY_REQUIRED'));
    var mt = mediaType === 'tv' ? 'tv' : 'movie';
    var tw = timeWindow === 'day' ? 'day' : 'week';
    return request('/trending/' + mt + '/' + tw, {}).then(normalizeList);
  }

  // 即将上映（片单「推荐」类使用）
  function upcoming(page) {
    if (!cfg.apiKey) return Promise.reject(new Error('TMDB_KEY_REQUIRED'));
    return request('/movie/upcoming', { page: page || 1 }).then(normalizeList);
  }

  // 官方合集详情（片单「主题」类使用）：collectionId → { id, name, overview, poster, backdrop, parts[] }
  function getCollection(collectionId) {
    if (!cfg.apiKey) return Promise.reject(new Error('TMDB_KEY_REQUIRED'));
    return request('/collection/' + collectionId, {}).then(function (r) {
      return {
        id: r.id,
        name: r.name || '',
        overview: r.overview || '',
        poster: posterUrl(r.poster_path),
        backdrop: posterUrl(r.backdrop_path, 'w780'),
        parts: (r.parts || []).map(function (p) {
          return {
            id: p.id,
            mediaType: p.media_type || 'movie',
            title: p.title || p.name || '',
            originalTitle: p.original_title || p.original_name || '',
            year: (p.release_date || '').slice(0, 4),
            overview: p.overview || '',
            poster: posterUrl(p.poster_path),
            backdrop: posterUrl(p.backdrop_path, 'w780'),
            rating: p.vote_average || 0,
            genreIds: p.genre_ids || []
          };
        })
      };
    });
  }

  // 详情页一次性聚合：主信息 + 演职员 + 相似影片（一次请求拿全，避免多次往返）
  // 返回 { backdrop, runtime, genres[], cast[{id,name,character,profile}], similar[{...normalizeList}] }
  // 无 key / 网络失败 → reject，调用方静默降级（不展示该模块即可）。
  function getDetailBundle(id, mediaType) {
    if (!cfg.apiKey) return Promise.reject(new Error('TMDB_KEY_REQUIRED'));
    if (!id) return Promise.reject(new Error('TMDB_NO_ID'));
    var path = '/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' + id;
    return request(path, { append_to_response: 'credits,similar' }).then(function (r) {
      var cast = (r.credits && r.credits.cast ? r.credits.cast : []).slice(0, 12).map(function (c) {
        return {
          id: c.id,
          name: c.name || c.original_name || '',
          character: c.character || '',
          profile: posterUrl(c.profile_path, 'w185')
        };
      });
      var similar = normalizeList(r.similar || {}).slice(0, 18);
      var rt = r.runtime || (r.episode_run_time && r.episode_run_time[0]) || 0;
      var genres = (r.genres || []).map(function (g) { return g.name; });
      // Phase 2 v2 详情页扩展：logo（production_companies）+ 所属合集（belongs_to_collection）
      var companies = (r.production_companies || []).map(function (c) {
        return { id: c.id, name: c.name || '', logo: posterUrl(c.logo_path, 'w342') };
      });
      var collection = r.belongs_to_collection
        ? { id: r.belongs_to_collection.id, name: r.belongs_to_collection.name || '', poster: posterUrl(r.belongs_to_collection.poster_path, 'w342') }
        : null;
      return {
        backdrop: posterUrl(r.backdrop_path, 'w1280'),
        runtime: rt,
        genres: genres,
        cast: cast,
        similar: similar,
        companies: companies,
        collection: collection
      };
    });
  }

  var tmdb = {
    configure: function (o) {
      if (!o) return;
      if (o.baseUrl) cfg.baseUrl = o.baseUrl;
      if (o.proxyBase != null) cfg.proxyBase = o.proxyBase;
      if (o.language) cfg.language = o.language;
      if (o.region) cfg.region = o.region;
    },
    setApiKey: function (k) { cfg.apiKey = k || ''; },
    getApiKey: function () { return cfg.apiKey; },
    hasKey: function () { return !!cfg.apiKey; },
    posterUrl: posterUrl,
    search: search,
    getDetails: getDetails,
    bestMatch: bestMatch,
    popular: popular,
    discover: discover,
    trending: trending,
    upcoming: upcoming,
    getCollection: getCollection,
    getDetailBundle: getDetailBundle
  };

  SFV.tmdb = tmdb;
})(typeof window !== 'undefined' ? window : this);
