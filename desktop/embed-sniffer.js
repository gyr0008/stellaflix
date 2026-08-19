/*
 * Stellaflix 影视模块 — 嵌入态直链嗅探（C-prime 阶段1 · POC）
 *
 * 职责（单文件，逻辑全在此，不写在 main.js 大块里）：
 *  - 纯函数 isMediaUrl / scoreCandidate：判定与评分第三方解析器发出的真实媒体 URL，
 *    无任何 electron 依赖，可 node --test 直接单测。
 *  - createSniffer(session)：在「给定 partition session」注册唯一的 webRequest.onResponseStarted
 *    （观察型事件，无需 callback；超时不取消会泄漏，故 stop() 显式置 null 解注册）。
 *  - startHiddenSniff({ BrowserWindow }, opts)：用隔离 partition 的隐藏 BrowserWindow 加载解析器 URL，
 *    把命中的媒体候选回传 onCandidate。隔离 partition: persist:stellaflix-embed-sniff，
 *    零覆盖 defaultSession / custom-source 既有 webRequest 监听器（Electron 同名事件「最后注册覆盖前者」坑）。
 *
 * 不在此文件引入 require('electron')（避免单测在 plain node 下 Cannot find module）。
 * 调用方把 { BrowserWindow } 作为首个参数传入。
 */

'use strict';

// ---------- 纯函数（无 electron 依赖） ----------
var MEDIA_EXT = /\.(m3u8|m3u|mp4|mp3|flv|ts|m4s|webm|mov|mkv|avi|wmv|m4a|aac|ogg|ogv|mpd)(\?|#|$)/i;
var MEDIA_KEYWORDS = /(\/manifest\.|\.m3u8|playlist|segment|init\.mp4|\/frag|index\d+\.ts|video\/mp4|video\/webm|audio\/mp4|application\/vnd\.appletv|application\/dash\+xml)/i;
// 这些扩展名一律判为非媒体，避免把页面骨架/脚本当候选
var NON_MEDIA_EXT = /\.(html?|js|css|json|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|map)(\?|#|$)/i;

function isMediaUrl(url, resourceType) {
  if (!url || typeof url !== 'string') return false;
  if (resourceType === 'media') return true; // Chromium 已分类为媒体资源
  if (NON_MEDIA_EXT.test(url)) return false;
  if (MEDIA_EXT.test(url)) return true;
  if (MEDIA_KEYWORDS.test(url)) return true;
  return false;
}

// 候选评分：真实媒体直链 > 分片/MSE 分片 > 页面/脚本/广告（负分）
function scoreCandidate(details) {
  var url = (details && details.url) || '';
  var rt = (details && details.resourceType) || '';
  var score = 0;
  if (rt === 'media') score += 100;
  if (/\.mp4(\?|#|$)/i.test(url)) score += 95;
  if (/\.flv(\?|#|$)/i.test(url)) score += 95;
  if (/\.m3u8(\?|#|$)/i.test(url)) score += 90;
  if (/\.ts(\?|#|$)/i.test(url)) score += 60;
  if (/\.m4s(\?|#|$)/i.test(url)) score += 50;
  if (/blob:/i.test(url)) score -= 40; // 网络层抓不到真实地址，低分（需 Tier-2 preload 嗅探）
  if (NON_MEDIA_EXT.test(url)) score -= 200;
  if (/(ads|analytics|tracker|beacon|telemetry|doubleclick|googleadservices)/i.test(url)) score -= 100;
  return score;
}

// ---------- 嗅探器工厂（持有 session，无 electron 依赖） ----------
function createSniffer(session) {
  var active = false;
  var timer = null;

  function start(opts) {
    opts = opts || {};
    var onCandidate = opts.onCandidate || function () {};
    var timeoutMs = opts.timeoutMs || 12000;
    var maxCandidates = opts.maxCandidates || 30;
    var filter = opts.filter || { urls: ['*://*/*'] };

    if (!session || !session.webRequest) {
      return { stop: function () {}, started: false };
    }
    active = true;
    var count = 0;

    function stop() {
      if (!active) return;
      active = false;
      if (timer) { clearTimeout(timer); timer = null; }
      // Electron 同名 webRequest 事件「最后注册覆盖前者」——listener 置 null 即解注册，避免泄漏/覆盖
      try { session.webRequest.onResponseStarted(null, null); } catch (e) {}
    }

    // onResponseStarted 为观察型事件（无 callback 需求），命中媒体即回传候选
    session.webRequest.onResponseStarted(filter, function (details) {
      if (!active || !details) return;
      if (isMediaUrl(details.url, details.resourceType)) {
        var c = {
          url: details.url,
          resourceType: details.resourceType || '',
          statusCode: details.statusCode || 0,
          score: scoreCandidate(details)
        };
        onCandidate(c);
        count++;
        if (count >= maxCandidates) stop();
      }
    });

    timer = setTimeout(stop, timeoutMs);
    return { stop: stop, started: true };
  }

  return { start: start };
}

// ---------- 隐藏窗口加载解析器页（隔离 partition） ----------
function startHiddenSniff(electronObj, opts) {
  opts = opts || {};
  var BrowserWindow = electronObj && electronObj.BrowserWindow;
  var url = opts.url;
  var partition = opts.partition || 'persist:stellaflix-embed-sniff';
  var onCandidate = opts.onCandidate || function () {};

  if (!BrowserWindow || !url) {
    return { stop: function () {}, started: false };
  }

  var win = new BrowserWindow({
    show: false,
    width: 16, height: 16,
    webPreferences: {
      partition: partition,
      webviewTag: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  var sniffer = createSniffer(win.webContents.session);
  var handle = sniffer.start({
    onCandidate: onCandidate,
    timeoutMs: opts.timeoutMs || 12000,
    maxCandidates: opts.maxCandidates || 30
  });

  Promise.resolve(win.loadURL(url)).catch(function () {
    // 加载失败（网络/区域）：POC 仅观察，不影响主流程
  });

  function wrappedStop() {
    try { handle.stop(); } catch (e) {}
    try { if (!win.isDestroyed()) win.close(); } catch (e) {}
  }
  return { stop: wrappedStop, started: handle.started !== false, window: win };
}

/**
 * 高阶 API：创建隐藏窗口加载 url，收集候选并在超时后返回评分最高的一条媒体直链。
 * @returns {Promise<{url:string, score:number, resourceType:string}|null>}
 */
function sniffBestMediaUrl(electronObj, opts) {
  opts = opts || {};
  var url = opts.url;
  var timeoutMs = opts.timeoutMs || 12000;
  if (!url) return Promise.resolve(null);
  return new Promise(function (resolve) {
    var best = null;
    var handle = startHiddenSniff(electronObj, {
      url: url,
      partition: opts.partition,
      timeoutMs: timeoutMs,
      maxCandidates: opts.maxCandidates || 30,
      onCandidate: function (c) {
        if (!best || c.score > best.score) best = c;
      }
    });
    if (!handle.started) {
      resolve(null);
      return;
    }
    setTimeout(function () {
      try { handle.stop(); } catch (e) {}
      resolve(best ? { url: best.url, score: best.score, resourceType: best.resourceType } : null);
    }, timeoutMs);
  });
}

module.exports = {
  MEDIA_EXT: MEDIA_EXT,
  MEDIA_KEYWORDS: MEDIA_KEYWORDS,
  NON_MEDIA_EXT: NON_MEDIA_EXT,
  isMediaUrl: isMediaUrl,
  scoreCandidate: scoreCandidate,
  createSniffer: createSniffer,
  startHiddenSniff: startHiddenSniff,
  sniffBestMediaUrl: sniffBestMediaUrl
};
