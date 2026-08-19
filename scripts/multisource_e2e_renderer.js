/**
 * 多源面板对齐 Kazumi — 渲染进程侧分段探针
 *
 * 由 multisource_e2e_electron.js 在真实 Chromium 渲染进程（真实 public/index.html）
 * 中加载；本文件只「定义」 window.__msProbe 的各阶段方法，不自动运行。
 * 主机按阶段调用并在窗口上 capturePage() 抓真实 DOM 截图，最后调用 assert() 拿结果。
 *
 * 覆盖 vm 沙箱测不到的真实渲染：
 *   - 真实 DOM 是否真的长出 .sfv-picker-* / .sfv-road-ep-* 节点
 *   - 状态点 class 是否真的随 setStatus/appendSource 切换（灰→绿/蓝）
 *   - 线路下拉 / 选集网格 / is-current 高亮是否真的渲染
 *
 * 不依赖真实片源/网络：用预建 groups / 多线路 fixture 直接驱动 UI。
 */
(function () {
  'use strict';
  var SFV = window.StellaflixVideo || {};
  var createdOverlay = false;

  // 预建 groups（两源，初始无候选 → 灰等待点）
  var GROUPS = [
    { sourceKey: 'cms:验收源A', sourceName: '验收源A', items: [] },
    { sourceKey: 'cms:验收源B', sourceName: '验收源B', items: [] }
  ];

  // 多线路 fixture（阶段3：线路切换下沉到播放器）
  var PLAYS = [
    { from: '线路一', episodes: [
      { name: '第1集', url: 'http://example.com/a1', index: 0 },
      { name: '第2集', url: 'http://example.com/a2', index: 1 },
      { name: '第3集', url: 'http://example.com/a3', index: 2 }
    ] },
    { from: '线路二', episodes: [
      { name: '第1集', url: 'http://example.com/b1', index: 0 },
      { name: '第2集', url: 'http://example.com/b2', index: 1 }
    ] }
  ];

  function ensureOverlay() {
    var ov = document.getElementById('sfv-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'sfv-overlay';
      ov.className = 'sfv-overlay';
      document.body.appendChild(ov);
      createdOverlay = true;
    }
    return ov;
  }

  // ---- 阶段1：开面板（预建 groups → 两源 Tab + 灰等待点）----
  function openPanel() {
    if (!SFV.sourcePicker) return { ok: false, reason: 'SFV.sourcePicker 未挂载' };
    SFV.sourcePicker.open({ groups: GROUPS, title: '验收剧集', poster: '' });
    return { ok: SFV.sourcePicker.isOpen() };
  }

  // ---- 阶段2：流式填充（A 源命中2条→绿点；B 源验证→蓝点）----
  function fillPanel() {
    if (!SFV.sourcePicker) return { ok: false, reason: 'SFV.sourcePicker 未挂载' };
    SFV.sourcePicker.appendSource('cms:验收源A', [
      { i: 0, c: { label: 'A-线路1', sub: '1080P', kind: 'cms' } },
      { i: 1, c: { label: 'A-线路2', sub: '720P', kind: 'cms' } }
    ]);
    SFV.sourcePicker.setStatus('cms:验收源B', 'captcha');
    return { ok: true };
  }

  // ---- 阶段3：关面板，开播放器侧线路/选集 UI ----
  function closePanel() {
    if (SFV.sourcePicker && SFV.sourcePicker.close) SFV.sourcePicker.close();
  }
  function openRoadEp() {
    if (!SFV.playerRoadEpisode) return { ok: false, reason: 'SFV.playerRoadEpisode 未挂载' };
    ensureOverlay();
    SFV.playerRoadEpisode.open({
      view: { key: 'k', title: '验收剧集', source: { id: 'cms:验收源A', name: '验收源A' }, vodId: '1' },
      plays: PLAYS, fromIndex: 0, currentEpisodeIndex: 1,
      onSwitchRoad: function () {}, onPickEpisode: function () {}
    });
    // 仅为本阶段截图强制可见（不改生产 CSS）：overlay 默认可能隐藏
    var ov = document.getElementById('sfv-overlay');
    if (ov) {
      ov.style.display = 'block'; ov.style.position = 'fixed'; ov.style.inset = '0';
      ov.style.zIndex = '2147482000'; ov.style.background = 'rgba(0,0,0,0.65)';
    }
    var re = document.querySelector('.sfv-road-ep');
    if (re) { re.style.display = 'block'; re.style.position = 'relative'; re.style.zIndex = '1'; re.style.padding = '24px'; }
    return { ok: true };
  }

  // ---- 阶段4：断言（读真实 DOM）----
  function assert() {
    var out = { pass: [], fail: [], info: [] };
    function ok(cond, msg, detail) {
      if (cond) out.pass.push(msg);
      else out.fail.push(msg + (detail !== undefined ? ' | 实得: ' + JSON.stringify(detail) : ''));
    }

    // 模块挂载（编排层 + 面板 + 播放器侧线路选集）
    ok(!!window.StellaflixVideo, 'M0 window.StellaflixVideo 存在');
    ok(!!SFV.sourcePicker, 'M1 SFV.sourcePicker 已挂载');
    ok(!!SFV.playerRoadEpisode, 'M2 SFV.playerRoadEpisode 已挂载');
    ok(!!SFV.detailSource, 'M3 SFV.detailSource 已挂载');
    ok(!!SFV.playOrchestrator, 'M4 SFV.playOrchestrator 已挂载');

    // 面板：Tab 数 = 源数
    var pills = document.querySelectorAll('.sfv-picker-pill');
    ok(pills.length === 2, 'P1 面板渲染出 2 个源 Tab', pills.length);
    var tabs = document.querySelector('.sfv-picker-tabs');
    ok(!!tabs, 'P2 源 Tab 条已渲染');

    // 面板：A 源绿点 + 2 条命中；B 源蓝点（验证）
    var secA = document.querySelector('.sfv-picker-source[data-key="cms:验收源A"]');
    var rowsA = secA ? secA.querySelectorAll('.sfv-picker-row').length : -1;
    ok(rowsA === 2, 'P3 A 源 appendSource 渲染 2 条候选', rowsA);
    var pillA = document.querySelector('.sfv-picker-pill[data-key="cms:验收源A"] .sfv-picker-dot');
    ok(pillA && /\-\-ok\b/.test(pillA.className), 'P4 A 源状态点为绿(--ok)', pillA && pillA.className);
    var pillB = document.querySelector('.sfv-picker-pill[data-key="cms:验收源B"] .sfv-picker-dot');
    ok(pillB && /\-\-captcha\b/.test(pillB.className), 'P5 B 源状态点为蓝(--captcha 验证)', pillB && pillB.className);

    // 面板：命中计数副标题更新
    var sub = document.querySelector('.sfv-picker-subtitle');
    ok(sub && /2 个命中条目/.test(sub.textContent), 'P6 副标题计数更新', sub && sub.textContent);

    // 播放器侧：线路下拉 2 选项 + 选集网格 3 集 + is-current 落在第2集
    var sel = document.querySelector('.sfv-road-ep-select');
    ok(!!sel, 'R1 线路下拉已渲染');
    if (sel) ok(sel.options.length === 2, 'R2 线路下拉含 2 条线路', sel.options.length);
    var chips = document.querySelectorAll('.sfv-road-ep-chip');
    ok(chips.length === 3, 'R3 当前线路渲染 3 个选集', chips.length);
    var cur = document.querySelectorAll('.sfv-road-ep-chip.is-current');
    ok(cur.length === 1, 'R4 恰有 1 个 is-current 高亮', cur.length);
    if (cur.length === 1) ok(/第2集/.test(cur[0].textContent), 'R5 is-current 落在第2集（跨源对齐基准）', cur[0].textContent);

    return out;
  }

  function cleanup() {
    try { if (SFV.sourcePicker && SFV.sourcePicker.close) SFV.sourcePicker.close(); } catch (e) {}
    try { if (SFV.playerRoadEpisode && SFV.playerRoadEpisode.close) SFV.playerRoadEpisode.close(); } catch (e) {}
    if (createdOverlay) { var ov = document.getElementById('sfv-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); createdOverlay = false; }
  }

  window.__msProbe = {
    openPanel: openPanel, fillPanel: fillPanel, closePanel: closePanel,
    openRoadEp: openRoadEp, assert: assert, cleanup: cleanup
  };
})();
