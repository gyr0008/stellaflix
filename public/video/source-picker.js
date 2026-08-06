/*
 * Stellaflix 影视模块 — 多源选择弹窗 (对齐 Kazumi source_sheet.dart)
 *
 * 触发：浏览厅点海报后并行搜 CMS10 + Kazumi，候选源 > 1 时弹出。
 * 视觉：Kazumi 风格纯色弹窗（#18181b 暗底，无玻璃/模糊）+ 水平滚动 pill 标签
 *       + 状态圆点（绿=可播）+ 分源条目。选源即播（对齐 Kazumi「选线路即播」）。
 *
 * 铁律：零业务逻辑进 index.html；本模块仅提供 SFV.sourcePicker.open()/close()。
 * 单文件 ≤ 500 行。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var root = null;        // 弹窗根 DOM
  var backdrop = null;
  var onPick = null;
  var current = null;     // 当前 candidates

  function d() { return global.document; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function close() {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    backdrop = null; root = null; onPick = null; current = null;
    if (global.document && global.document.body) {
      global.document.body.classList.remove('sfv-picker-open');
    }
  }

  /*
   * @param {Object} opt
   *   title    {string}  影片名（弹窗标题）
   *   poster   {string}  海报（可选）
   *   candidates {Array} [{ id, label, sub, kind:'cms'|'kazumi', _ref }]
   *   onPick   {Function} 选中候选后回调(candidate)
   */
  function open(opt) {
    opt = opt || {};
    var doc = d();
    if (!doc) return;
    close(); // 先清旧弹窗
    current = opt.candidates || [];
    onPick = opt.onPick || null;

    backdrop = doc.createElement('div');
    backdrop.className = 'sfv-picker-backdrop';
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });

    root = doc.createElement('div');
    root.className = 'sfv-picker';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '选择播放源');

    // ---- 头部：海报 + 标题 + 关闭 ----
    var head = doc.createElement('div');
    head.className = 'sfv-picker-head';
    if (opt.poster) {
      var img = doc.createElement('img');
      img.className = 'sfv-picker-poster';
      img.src = opt.poster; img.alt = ''; img.loading = 'lazy';
      img.addEventListener('error', function () { img.style.display = 'none'; });
      head.appendChild(img);
    }
    var ht = doc.createElement('div');
    ht.className = 'sfv-picker-headtext';
    var htitle = doc.createElement('div');
    htitle.className = 'sfv-picker-title';
    htitle.textContent = opt.title || '选择播放源';
    var hsub = doc.createElement('div');
    hsub.className = 'sfv-picker-subtitle';
    hsub.textContent = (current.length ? current.length + ' 个可用播放源' : '未找到播放源');
    ht.appendChild(htitle); ht.appendChild(hsub);
    head.appendChild(ht);

    var x = doc.createElement('button');
    x.type = 'button'; x.className = 'sfv-picker-close';
    x.setAttribute('aria-label', '关闭');
    x.textContent = '×';
    x.addEventListener('click', close);
    head.appendChild(x);
    root.appendChild(head);

    // ---- 水平滚动 pill 标签（对齐 Kazumi MaterialBottomSheetTabBar）----
    var tabbar = doc.createElement('div');
    tabbar.className = 'sfv-picker-tabs';
    current.forEach(function (c, i) {
      var pill = doc.createElement('button');
      pill.type = 'button';
      pill.className = 'sfv-picker-pill';
      pill.setAttribute('data-idx', String(i));
      var dot = doc.createElement('span');
      dot.className = 'sfv-picker-dot'; // 绿点：已就绪
      var label = doc.createElement('span');
      label.className = 'sfv-picker-pill-label';
      label.textContent = c.label || ('源 ' + (i + 1));
      pill.appendChild(dot); pill.appendChild(label);
      pill.addEventListener('click', function () { pick(i); });
      tabbar.appendChild(pill);
    });
    root.appendChild(tabbar);

    // ---- 分源条目列表 ----
    var list = doc.createElement('div');
    list.className = 'sfv-picker-list';
    if (!current.length) {
      var empty = doc.createElement('div');
      empty.className = 'sfv-picker-empty';
      empty.textContent = '没有可用的播放源，试试其它影片或手动导入片源。';
      list.appendChild(empty);
    } else {
      current.forEach(function (c, i) {
        var row = doc.createElement('button');
        row.type = 'button';
        row.className = 'sfv-picker-row';
        row.setAttribute('data-idx', String(i));
        var ic = doc.createElement('span');
        ic.className = 'sfv-picker-row-ic';
        ic.textContent = (c.kind === 'kazumi') ? '🛰' : '📡';
        var txt = doc.createElement('span');
        txt.className = 'sfv-picker-row-txt';
        var rl = doc.createElement('span');
        rl.className = 'sfv-picker-row-label';
        rl.textContent = c.label || ('源 ' + (i + 1));
        var rs = doc.createElement('span');
        rs.className = 'sfv-picker-row-sub';
        rs.textContent = c.sub || '';
        txt.appendChild(rl); txt.appendChild(rs);
        var go = doc.createElement('span');
        go.className = 'sfv-picker-row-go';
        go.textContent = '播放 ▸';
        row.appendChild(ic); row.appendChild(txt); row.appendChild(go);
        row.addEventListener('click', function () { pick(i); });
        list.appendChild(row);
      });
    }
    root.appendChild(list);

    (doc.body || doc.documentElement).appendChild(backdrop);
    (doc.body || doc.documentElement).appendChild(root);
    doc.body.classList.add('sfv-picker-open');

    // 入场动画（轻量，不用 GSAP）
    requestAnimationFrame(function () {
      if (root) root.classList.add('sfv-picker-in');
    });
  }

  function pick(i) {
    var c = current && current[i];
    if (!c) return;
    var cb = onPick;
    close();
    if (cb) try { cb(c); } catch (e) { console.warn('[source-picker] onPick error:', e); }
  }

  function isOpen() { return !!root; }

  SFV.sourcePicker = { open: open, close: close, isOpen: isOpen };
})(typeof window !== 'undefined' ? window : this);
