/*
 * Stellaflix 影视模块 — 字幕系统 (Step 5, ② 字幕)
 *
 * 职责：
 *   1) 解析 .srt / .vtt 字幕为统一 cue 结构 [{ start, end, text }]（秒）；
 *   2) 在播放器内渲染字幕（自定义 DOM 覆盖层，避免 <track> 跨域加载与样式限制）；
 *   3) 跨域字幕经 /api/proxy 拉取；本地字幕用 FileReader 读取。
 *
 * 设计：纯函数解析（易测）+ SubtitleRenderer（DOM 渲染）+ fetchText（IO）。
 *   不依赖任何第三方库；SRT→VTT 自行转换。
 *
 * 合规：字幕是用户显式提供的本地/远程文件，非内置内容；不存储、不分发。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  function stripBom(s) { return String(s == null ? '' : s).replace(/^\uFEFF/, ''); }
  function normalizeNewlines(s) { return stripBom(s).replace(/\r\n?/g, '\n'); }

  /**
   * 解析时间轴行：
   *   "00:00:01,000 --> 00:00:04,000"（SRT，逗号）
   *   "00:00:01.000 --> 00:00:04.000"（VTT，点）
   * @returns {{start:number, end:number}|null}
   */
  function parseTimeLine(line) {
    var m = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(line || '');
    if (!m) return null;
    // 毫秒字段按位数归一：3 位 /1000、2 位 /100（厘秒）、1 位 /10（分秒）。
    function toSec(h, mi, s, ms) {
      var digits = String(ms).length;
      var frac = (+ms) / Math.pow(10, digits);
      return (+h) * 3600 + (+mi) * 60 + (+s) + frac;
    }
    return {
      start: toSec(m[1], m[2], m[3], m[4]),
      end: toSec(m[5], m[6], m[7], m[8])
    };
  }

  /**
   * 解析 SRT 文本 → cue 数组。
   * 容错：跳过无时间轴的块、缺结束时间的行、空文本；去除基础 HTML 标签（<i>/<b>/<font>）。
   */
  function parseSrt(text) {
    text = normalizeNewlines(text);
    var blocks = text.split(/\n\s*\n/);
    var cues = [];
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i].trim();
      if (!block) continue;
      var lines = block.split('\n');
      var timeLineIdx = -1;
      for (var j = 0; j < lines.length; j++) {
        if (/-->/i.test(lines[j])) { timeLineIdx = j; break; }
      }
      if (timeLineIdx < 0) continue; // 无时间轴，跳过
      var times = parseTimeLine(lines[timeLineIdx]);
      if (!times) continue;
      var body = lines.slice(timeLineIdx + 1).join('\n').trim();
      body = body.replace(/<[^>]+>/g, ''); // 去 HTML 标签
      if (!body) continue;
      cues.push({ start: times.start, end: times.end, text: body });
    }
    cues.sort(function (a, b) { return a.start - b.start; });
    return cues;
  }

  /**
   * 解析 VTT 文本 → cue 数组（简化：忽略样式/定位/voice 等高级特性，仅取时间与文本）。
   */
  function parseVtt(text) {
    text = normalizeNewlines(text);
    var lines = text.split('\n');
    var cues = [];
    var i = 0;
    if (/^WEBVTT/i.test(lines[0] || '')) i = 1; // 跳过 WEBVTT 头
    while (i < lines.length) {
      var timeLineIdx = -1;
      if (/-->/i.test(lines[i] || '')) timeLineIdx = i;
      else if (i + 1 < lines.length && /-->/i.test(lines[i + 1] || '')) timeLineIdx = i + 1;
      if (timeLineIdx < 0) { i++; continue; }
      var times = parseTimeLine(lines[timeLineIdx]);
      if (!times) { i++; continue; }
      var bodyLines = [];
      var k = timeLineIdx + 1;
      while (k < lines.length && lines[k].trim() !== '' && !/-->/i.test(lines[k])) {
        bodyLines.push(lines[k]);
        k++;
      }
      var body = bodyLines.join('\n').trim();
      body = body.replace(/<[^>]+>/g, ''); // 去 <c.class>/<i> 等内联标签
      if (body) cues.push({ start: times.start, end: times.end, text: body });
      i = k + 1;
    }
    return cues;
  }

  function detectFormat(text) {
    var t = normalizeNewlines(text).trim();
    if (/^WEBVTT/i.test(t)) return 'vtt';
    if (/-->/i.test(t)) return 'srt';
    return 'unknown';
  }

  // ---------------------------------------------------------------- 渲染
  function SubtitleRenderer(overlayEl) {
    this.overlayEl = overlayEl;
    this.el = null;
    this.cues = [];
    this.active = false;
    this.lastText = null;
  }
  SubtitleRenderer.prototype._ensure = function () {
    if (this.el || !this.overlayEl || !global.document) return;
    this.el = global.document.createElement('div');
    this.el.className = 'sfv-subtitle';
    this.el.style.display = 'none';
    this.overlayEl.appendChild(this.el);
  };
  SubtitleRenderer.prototype.setCues = function (cues) {
    this.cues = Array.isArray(cues) ? cues : [];
    if (this.cues.length) this._ensure();
  };
  SubtitleRenderer.prototype.setActive = function (on) {
    this.active = !!on;
    if (on) this._ensure();
    if (!on && this.el) { this.el.style.display = 'none'; this.el.textContent = ''; this.lastText = null; }
  };
  SubtitleRenderer.prototype.update = function (currentTime) {
    if (this.active && !this.el) this._ensure();
    if (!this.active || !this.el || !this.cues.length) {
      if (this.el) this.el.style.display = 'none';
      return;
    }
    var text = null;
    for (var i = 0; i < this.cues.length; i++) {
      if (currentTime >= this.cues[i].start && currentTime <= this.cues[i].end) {
        text = this.cues[i].text; break;
      }
    }
    if (text !== this.lastText) {
      this.el.textContent = text || '';
      this.lastText = text;
    }
    this.el.style.display = text ? '' : 'none';
  };
  SubtitleRenderer.prototype.clear = function () {
    this.cues = [];
    this.lastText = null;
    this.active = false;
    if (this.el) { this.el.textContent = ''; this.el.style.display = 'none'; }
  };

  // ---------------------------------------------------------------- IO
  /**
   * 读取字幕文本。File/Blob 走 FileReader；URL 跨域经 /api/proxy 透传。
   * @returns {Promise<string>}
   */
  function fetchText(urlOrFile) {
    var isFile = (urlOrFile && (
      (typeof global.File !== 'undefined' && urlOrFile instanceof global.File) ||
      (typeof global.Blob !== 'undefined' && urlOrFile instanceof global.Blob)
    ));
    if (isFile) {
      return new Promise(function (resolve, reject) {
        if (!global.FileReader) { reject(new Error('no-filereader')); return; }
        var fr = new global.FileReader();
        fr.onload = function () { resolve(String(fr.result)); };
        fr.onerror = function () { reject(new Error('read-file-failed')); };
        fr.readAsText(urlOrFile);
      });
    }
    var url = String(urlOrFile);
    var finalUrl = url;
    try {
      var u = new global.URL(url, global.location ? global.location.href : undefined);
      if (global.location && u.origin !== global.location.origin) {
        finalUrl = '/api/proxy?url=' + encodeURIComponent(url);
      }
    } catch (e) { /* 非法 URL 原样尝试 */ }
    if (!global.fetch) return Promise.reject(new Error('no-fetch'));
    return global.fetch(finalUrl).then(function (r) {
      if (!r || !r.ok) throw new Error('fetch-failed:' + (r && r.status ? r.status : '?'));
      return r.text();
    });
  }

  SFV.subtitle = {
    parseSrt: parseSrt,
    parseVtt: parseVtt,
    detectFormat: detectFormat,
    parseTimeLine: parseTimeLine,
    SubtitleRenderer: SubtitleRenderer,
    fetchText: fetchText,
  };
})(typeof window !== 'undefined' ? window : this);
