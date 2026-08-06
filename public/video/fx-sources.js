/*
 * Stellaflix 影视模块 — 视觉控制台「片源」分页（阶段 1）
 *
 * 【为什么要包装原函数】（均已在 index.html 亲验）
 *   1. 分页不是静态 HTML，由 organizeFxPanel()(25788) 运行时生成，tabMeta(25796) 硬编码 5 项；
 *      bindFxPanel() 在 31182 执行 —— 故本模块必须**等待 #fx-panel-tabs 出现后再注入**。
 *   2. setFxPanelTab(25753) 的 allowed 白名单(25754)硬编码 5 个 key，传入新 key 会被静默
 *      回落到 presets —— 故必须包装该全局函数，自行处理本页激活。
 *   3. .fx-panel-tabs(2052) 写死 grid-template-columns:repeat(5,...) —— 影视态需 CSS 覆盖为 6 列；
 *      音乐态本页按钮 display:none，grid 仅剩 5 项，原布局零影响。
 *
 * 【合规】本分页是「用户手动导入片源」的唯一入口，也是红线的落地方式：
 *   出厂零预置，全部自填。页首常驻风险提示，不可关闭。
 */
(function (global) {
  'use strict';
  console.log('[FX-DIAG] fx-sources.js IIFE 开始执行');
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var PAGE_KEY = 'sfvsource';
  var TAB_CLASS = 'sfv-fx-tab';
  var PAGE_CLASS = 'sfv-fx-page';
  var injected = false;
  var wrapped = false;
  var pageEl = null;
  var listEl = null;
  var rulesListEl = null;
  var pollTimer = null;
  var pollCount = 0;

  function d() { return global.document; }
  function byId(id) { var doc = d(); return doc && doc.getElementById ? doc.getElementById(id) : null; }
  function isVideoSpace() { return !!(SFV.state && SFV.state.isVideo()); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------------- 注入

  function injectTabAndPage() {
    if (injected) return true;
    var tabs = byId('fx-panel-tabs');
    var panel = byId('fx-panel');
    if (!tabs || !panel) return false;

    var btn = d().createElement('button');
    btn.type = 'button';
    btn.className = TAB_CLASS;
    btn.setAttribute('data-fx-tab', PAGE_KEY);
    btn.textContent = '片源';
    tabs.appendChild(btn);

    pageEl = d().createElement('div');
    pageEl.className = 'fx-tab-page ' + PAGE_CLASS;
    pageEl.setAttribute('data-fx-page', PAGE_KEY);
    pageEl.innerHTML = buildPageHtml();
    panel.appendChild(pageEl);

    listEl = pageEl.querySelector('.sfv-src-list');
    rulesListEl = pageEl.querySelector('.sfv-rules-list');
    bindPageEvents();
    renderList();
    renderRulesList();
    injected = true;
    return true;
  }

  function buildPageHtml() {
    return '' +
      /* ---- 合规提示（常驻，不可关闭）---- */
      '<div class="sfv-src-notice">' +
        'Stellaflix <strong>不提供、不存储</strong>任何影视资源，出厂不预置任何片源。' +
        '此处的站点由你自行添加，请自行确认其合法性与安全性，并遵守当地法律法规。' +
      '</div>' +

      /* ---- 片源管理分区 ---- */
      '<div class="sfv-section-label">片源</div>' +
      '<div class="sfv-src-form">' +
        '<div class="sfv-input-row"><label>名称</label><input class="sfv-src-name" type="text" placeholder="可留空，默认取域名"></div>' +
        '<div class="sfv-input-row"><label>接口地址</label><input class="sfv-src-api" type="text" placeholder="如 https://.../api.php/provide/vod"></div>' +
        '<div class="sfv-form-actions"><button type="button" class="sfv-btn-primary sfv-src-add"><span>＋</span> 添加片源</button><span class="sfv-src-hint"></span></div>' +
      '</div>' +
      '<div class="sfv-section-label">已添加片源</div>' +
      '<div class="sfv-src-list"></div>' +

      /* ---- 规则管理分区 ---- */
      '<div class="sfv-section-label">规则</div>' +
      '<div class="sfv-rules-notice">' +
        '导入搜索规则后，搜索会并行查询这些站点（与 CMS10 片源互补）。' +
        '规则文件为 .json 格式，可从规则库获取或手动编写。' +
      '</div>' +
      '<div class="sfv-rules-form">' +
        '<div class="sfv-form-actions">' +
          '<button type="button" class="sfv-btn-secondary sfv-rule-import">导入规则文件</button>' +
          '<input type="file" id="sfv-rule-file" accept=".json,application/json" hidden>' +
          '<span class="sfv-src-hint sfv-rule-hint"></span>' +
        '</div>' +
      '</div>' +
      '<div class="sfv-section-label">已导入规则</div>' +
      '<div class="sfv-rules-list"></div>';
  }

  function renderList() {
    if (!listEl) return;
    var list = (SFV.sources && SFV.sources.getSources()) || [];
    if (!list.length) {
      listEl.innerHTML = '<div class="sfv-src-empty">还没有片源。添加后即可在影视空间中搜索与播放。</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      /* 圆点初始态：未启用=灰(默认)；启用=灰(待自动检查更新为绿/红) */
      var dotCls = s.enabled ? '' : '';
      html += '<div class="sfv-src-item' + (s.enabled ? ' enabled' : '') + '" data-sid="' + esc(s.id) + '" data-enabled="' + (s.enabled ? '1' : '0') + '">' +
        '<span class="sfv-src-dot' + dotCls + '"></span>' +
        '<div class="sfv-src-item-main">' +
          '<div class="sfv-src-item-name">' + esc(s.name) + '</div>' +
          '<div class="sfv-src-item-api">' + esc(s.api) + '</div>' +
          '<div class="sfv-src-item-state"></div>' +
        '</div>' +
        '<div class="sfv-src-item-ops">' +
          '<button type="button" class="fx-mini-btn sfv-src-toggle">' + (s.enabled ? '已启用' : '已停用') + '</button>' +
          '<button type="button" class="fx-mini-btn ghost sfv-src-test">测试</button>' +
          '<button type="button" class="fx-mini-btn ghost sfv-src-del">删除</button>' +
        '</div>' +
      '</div>';
    }
    listEl.innerHTML = html;
  }

  // ---- 规则列表渲染 ----
  function renderRulesList() {
    if (!rulesListEl) { console.log('[FX-DIAG] renderRulesList: rulesListEl is null'); return; }
    var kz = SFV.kazumi;
    console.log('[FX-DIAG] renderRulesList: kz=', !!kz, ' kz.listRules=', !!(kz && kz.listRules));
    if (!kz || !kz.listRules) {
      rulesListEl.innerHTML = '<div class="sfv-src-empty">规则模块未加载。</div>';
      return;
    }
    var rules = kz.listRules();
    if (!rules.length) {
      rulesListEl.innerHTML = '<div class="sfv-src-empty">尚未导入任何规则。导入后，搜索会并行查询这些站点（与 CMS10 片源互补）。</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      /* 规则圆点：未启用=灰(默认)；启用且完整=绿；启用但不完整=红 */
      var rDotCls = '';
      if (r.enabled) { rDotCls = (r.valid !== false) ? ' status-ok' : ' status-bad'; }
      html += '<div class="sfv-src-item sfv-rule-item' + (r.enabled ? ' enabled' : '') + '" data-rid="' + esc(r.name || r.id || i) + '">' +
        '<span class="sfv-src-dot' + rDotCls + '"></span>' +
        '<div class="sfv-src-item-main">' +
          '<div class="sfv-src-item-name">' + esc(r.name) + '</div>' +
          '<div class="sfv-src-item-api">' + (r.searchMode || 'xpath') + ' · ' + (r.baseUrl || '—') + (r.valid ? '' : ' · <span class="sfv-rule-warn">不完整</span>') + '</div>' +
        '</div>' +
        '<div class="sfv-src-item-ops">' +
          '<button type="button" class="fx-mini-btn sfv-rule-toggle">' + (r.enabled ? '停用' : '启用') + '</button>' +
          '<button type="button" class="fx-mini-btn ghost sfv-rule-del">删除</button>' +
        '</div>' +
      '</div>';
    }
    rulesListEl.innerHTML = html;
  }

  function hint(msg, bad) {
    var el = pageEl && pageEl.querySelector('.sfv-src-hint');
    if (!el) {
      el = pageEl && pageEl.querySelector('.sfv-rule-hint');
    }
    if (!el) return;
    el.textContent = msg || '';
    el.className = (el.className.indexOf('sfv-rule-hint') !== -1 ? 'sfv-rule-hint' : 'sfv-src-hint') + (bad ? ' bad' : '');
  }

  var REASON_TEXT = {
    'empty-api': '接口地址不能为空',
    'invalid-api-url': '接口地址格式不正确',
    'duplicate-api': '该接口已存在',
    'empty-list': '接口可达，但没有返回数据',
    'invalid-json': '返回内容不是合法 JSON',
    'fetch-unavailable': '当前环境不支持网络请求',
  };
  function reasonText(r) {
    if (!r) return '未知原因';
    if (REASON_TEXT[r]) return REASON_TEXT[r];
    if (r.indexOf('unsupported-scheme') === 0) return '仅支持 http / https';
    if (r.indexOf('http-') === 0) return '服务端返回 ' + r.slice(5);
    if (r === 'AbortError' || /abort/i.test(r)) return '请求超时';
    return r;
  }

  function bindPageEvents() {
    if (!pageEl) { console.log('[FX-DIAG] bindPageEvents: pageEl is null, skipping'); return; }
    console.log('[FX-DIAG] bindPageEvents: binding click on pageEl, SFV.kazumi=', !!SFV.kazumi);

    pageEl.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.classList) return;

      // ---- 片源操作 ----
      if (t.classList.contains('sfv-src-add')) {
        var nameEl = pageEl.querySelector('.sfv-src-name');
        var apiEl = pageEl.querySelector('.sfv-src-api');
        var res = SFV.sources.addSource({ name: nameEl.value, api: apiEl.value });
        if (!res.ok) { hint(reasonText(res.reason), true); return; }
        nameEl.value = ''; apiEl.value = '';
        hint('已添加：' + res.source.name, false);
        renderList();
        return;
      }

      // ---- 规则操作（不在 .sfv-src-item 内，必须在 item 查找之前处理）----
      if (t.classList.contains('sfv-rule-import')) {
        console.log('[FX-DIAG] 规则导入按钮点击');
        var fileInput = pageEl.querySelector('#sfv-rule-file');
        if (fileInput) fileInput.click();
        return;
      }

      // 规则列表项操作（可能在 .sfv-rule-item 内）
      var ruleItem = t.closest ? t.closest('.sfv-rule-item') : null;
      if (ruleItem) {
        var rid = ruleItem.getAttribute('data-rid');
        var kz = SFV.kazumi;
        console.log('[FX-DIAG] 规则项操作: rid=', rid, ' kz=', !!kz, ' target=', t.className);

        if (t.classList.contains('sfv-rule-del') && kz && kz.removeRule) {
          console.log('[FX-DIAG] → 删除规则: ', rid);
          kz.removeRule(rid);
          renderRulesList();
          return;
        }

        if (t.classList.contains('sfv-rule-toggle') && kz && kz.listRules) {
          console.log('[FX-DIAG] → 切换规则启用: ', rid);
          var allRules = kz.listRules();
          var target = null;
          for (var ri = 0; ri < allRules.length; ri++) {
            if (String(allRules[ri].name || allRules[ri].id || ri) === String(rid)) { target = allRules[ri]; break; }
          }
          if (target && kz.setEnabled) {
            kz.setEnabled(target.name, !target.enabled);
          }
          renderRulesList();
          return;
        }
      }

      // ---- 片源项操作（需要 .sfv-src-item 父容器）----
      var item = t.closest ? t.closest('.sfv-src-item') : null;
      if (!item) return;
      var sid = item.getAttribute('data-sid');
      var stateEl = item.querySelector('.sfv-src-item-state');

      if (t.classList.contains('sfv-src-del')) {
        SFV.sources.removeSource(sid);
        renderList();
        return;
      }

      if (t.classList.contains('sfv-src-toggle')) {
        var all = SFV.sources.getSources();
        var cur = null;
        for (var i = 0; i < all.length; i++) if (all[i].id === sid) cur = all[i];
        if (!cur) return;
        SFV.sources.setEnabled(sid, !cur.enabled);
        renderList();
        return;
      }

      if (t.classList.contains('sfv-src-test')) {
        var all2 = SFV.sources.getSources();
        var src = null;
        for (var j = 0; j < all2.length; j++) if (all2[j].id === sid) src = all2[j];
        if (!src) return;
        var dotEl = item.querySelector('.sfv-src-dot');
        t.disabled = true;
        if (stateEl) { stateEl.textContent = '测试中…'; stateEl.className = 'sfv-src-item-state'; }
        SFV.sources.testSource(src).then(function (testResult) {
          t.disabled = false;
          item.classList.remove('ok', 'bad');
          if (testResult.ok) {
            setDotStatus(dotEl, 'ok');
            item.classList.add('ok');
            if (stateEl) { stateEl.textContent = '可用 · 返回 ' + testResult.count + ' 条 · ' + testResult.ms + 'ms'; stateEl.className = 'sfv-src-item-state ok'; }
          } else {
            setDotStatus(dotEl, 'bad');
            item.classList.add('bad');
            if (stateEl) { stateEl.textContent = '不可用：' + reasonText(testResult.reason); stateEl.className = 'sfv-src-item-state bad'; }
          }
        });
      }
    });

    pageEl.addEventListener('keydown', function (ev) {
      if (ev && (ev.key === 'Enter' || ev.keyCode === 13)) {
        var t = ev.target;
        if (t && t.classList && (t.classList.contains('sfv-src-api') || t.classList.contains('sfv-src-name'))) {
          var btn = pageEl.querySelector('.sfv-src-add');
          if (btn) btn.click();
        }
      }
    });

    // 规则文件导入
    var ruleFileInput = pageEl.querySelector('#sfv-rule-file');
    if (ruleFileInput) {
      ruleFileInput.addEventListener('change', function () {
        var files = ruleFileInput.files;
        if (!files || !files.length) return;
        var f = files[0];
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(reader.result);
            var kz = SFV.kazumi;
            if (!kz || !kz.importRule) { hint('规则模块未加载，无法导入。', true); return; }
            var res = kz.importRule(data);
            // importRule 返回值格式取决于 Kazumi 引擎：可能是 {ok,count,names} 或数组
            if (Array.isArray(res)) {
              hint('已导入 ' + res.length + ' 条规则', false);
            } else if (res && res.ok) {
              hint('已导入 ' + (res.count || res.names ? res.count || res.names.length : '?') + ' 条规则' + (res.names && res.names.length ? '：' + res.names.join(', ') : ''), false);
            } else if (res) {
              hint('已导入规则（请检查「已导入规则」列表确认）', false);
            } else {
              hint('导入失败：未返回有效结果', true);
            }
            renderRulesList();
          } catch (e) {
            hint('导入失败：' + (e && e.message ? e.message : '文件格式不合法的 JSON'), true);
          }
          ruleFileInput.value = '';
        };
        reader.readAsText(f);
      });
    }
  }

  // ---------------------------------------------------------------- 自动状态检查

  /* 设置圆点三态色 */
  function setDotStatus(dotEl, status) {
    if (!dotEl) return;
    dotEl.classList.remove('status-ok', 'status-bad');
    if (status === 'ok') dotEl.classList.add('status-ok');
    else if (status === 'bad') dotEl.classList.add('status-bad');
  }

  /* 对所有已启用片源发起轻量探测，结果驱动圆点着色（绿=通 / 红=断）。
   * 串行执行避免并发风暴；仅探测 enabled 源，disabled 保持灰。 */
  function autoCheckStatus() {
    if (!listEl) return;
    var items = listEl.querySelectorAll('.sfv-src-item[data-enabled="1"]');
    if (!items.length) return;
    /* 先重置所有已启用圆点为灰色（待检查态） */
    for (var k = 0; k < items.length; k++) {
      var d = items[k].querySelector('.sfv-src-dot');
      setDotStatus(d, '');
    }
    /* 串行探测 */
    var idx = 0;
    function next() {
      if (idx >= items.length) return;
      var item = items[idx++];
      var sid = item.getAttribute('data-sid');
      var dot = item.querySelector('.sfv-src-dot');
      var stateEl = item.querySelector('.sfv-src-item-state');
      var all = SFV.sources.getSources();
      var src = null;
      for (var j = 0; j < all.length; j++) { if (all[j].id === sid) { src = all[j]; break; } }
      if (!src) { next(); return; }
      if (stateEl) { stateEl.textContent = '检测中…'; stateEl.className = 'sfv-src-item-state'; }
      SFV.sources.testSource(src).then(function (testResult) {
        /* item/dot/stateEl 已被外层 next() 循环闭包捕获 */
        if (!dot) return;
        item.classList.remove('ok', 'bad');
        if (testResult.ok) {
          setDotStatus(dot, 'ok');
          item.classList.add('ok');
          if (stateEl) { stateEl.textContent = '可用 · ' + testResult.count + ' 条 · ' + testResult.ms + 'ms'; stateEl.className = 'sfv-src-item-state ok'; }
        } else {
          setDotStatus(dot, 'bad');
          item.classList.add('bad');
          if (stateEl) { stateEl.textContent = '不可用：' + reasonText(testResult.reason); stateEl.className = 'sfv-src-item-state bad'; }
        }
        next();
      }).catch(function (testErr) {
        if (dot) setDotStatus(dot, 'bad');
        if (stateEl) { stateEl.textContent = '检测失败'; stateEl.className = 'sfv-src-item-state bad'; }
        next();
      });
    }
    next();
  }

  // ---------------------------------------------------------------- 分页切换

  function activateOwnPage() {
    var panel = byId('fx-panel');
    if (panel) panel.setAttribute('data-active-tab', PAGE_KEY);
    try { global.fxPanelTab = PAGE_KEY; } catch (e) {}
    var doc = d();
    var btns = doc.querySelectorAll('#fx-panel-tabs [data-fx-tab]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-fx-tab') === PAGE_KEY);
    }
    var pages = doc.querySelectorAll('#fx-panel .fx-tab-page');
    for (var j = 0; j < pages.length; j++) {
      pages[j].classList.toggle('active', pages[j].getAttribute('data-fx-page') === PAGE_KEY);
    }
    if (typeof global.repositionFxFloatingPanels === 'function') {
      try { global.repositionFxFloatingPanels(); } catch (e) {}
    }
    renderList();
    renderRulesList();
    /* 延迟 300ms 自动检查已启用源状态（等 DOM 渲染完毕） */
    setTimeout(function () { autoCheckStatus(); }, 300);
  }

  // 包装全局 setFxPanelTab：原函数白名单不含本页 key，会静默回落到 presets。
  function wrapSetter() {
    if (wrapped) return;
    var orig = global.setFxPanelTab;
    if (typeof orig !== 'function') return;
    global.setFxPanelTab = function (tab) {
      if (tab === PAGE_KEY) { activateOwnPage(); return; }
      return orig.apply(this, arguments);
    };
    global.setFxPanelTab.__sfvOriginal = orig;
    wrapped = true;
  }

  function isOwnPageActive() {
    var panel = byId('fx-panel');
    return !!(panel && panel.getAttribute('data-active-tab') === PAGE_KEY);
  }

  // 切回音乐态时本页按钮被隐藏，若仍停留在本页需回落，否则控制台会显示空白。
  function onSpaceChange() {
    if (!isVideoSpace() && isOwnPageActive()) {
      var fn = (global.setFxPanelTab && global.setFxPanelTab.__sfvOriginal) || global.setFxPanelTab;
      if (typeof fn === 'function') { try { fn('presets'); } catch (e) {} }
    }
  }

  // ---------------------------------------------------------------- 启动

  function tryInstall() {
    if (injectTabAndPage()) {
      wrapSetter();
      if (pollTimer) { global.clearInterval(pollTimer); pollTimer = null; }
      return true;
    }
    return false;
  }

  function boot() {
    if (tryInstall()) return;
    // #fx-panel-tabs 由 bindFxPanel() 在主脚本尾部创建，时机晚于本文件加载，故轮询等待。
    pollTimer = global.setInterval(function () {
      pollCount++;
      if (tryInstall() || pollCount > 120) {
        if (pollTimer) { global.clearInterval(pollTimer); pollTimer = null; }
      }
    }, 250);
  }

  function start() {
    var doc = d();
    // 注意：spacechange 由 state.js:38 在 **window** 上派发（global.dispatchEvent），
    // 不是 document —— 监听错目标会静默收不到事件。
    if (global.addEventListener) global.addEventListener('spacechange', onSpaceChange);
    if (doc && doc.readyState === 'loading' && doc.addEventListener) {
      doc.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
  start();

  SFV.fxSources = {
    PAGE_KEY: PAGE_KEY,
    renderList: renderList,
    activate: activateOwnPage,
    isInjected: function () { return injected; },
    isWrapped: function () { return wrapped; },
    reasonText: reasonText,
  };
})(typeof window !== 'undefined' ? window : this);
