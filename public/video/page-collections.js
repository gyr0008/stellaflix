/*
 * Stellaflix 影视模块 — 片单浏览页 (Step 5)
 *
 * 注册为 router page：id = 'collections'
 * 职责：
 *   - 渲染 6 个平行子 Tab（推荐/主题/经典/高分/获奖/我的片单）
 *   - 每个 Tab 下渲染片单卡片网格（collections.js 提供数据）
 *   - 点击卡片 → 交由 SFV.online 进入 collection-items 视图（复用 renderGrid）
 *   - 「我的片单」Tab：渲染用户片单夹列表 + 新建/重命名/删除
 *
 * 双态隔离：本页面仅存在于影视态 #sfv-browse 内部；mount 时 fully owns host。
 * 合规：零硬编码视频源；仅 TMDB 元数据。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  var doc = global.document;
  var activeTab = 'featured';
  var itemsOpen = false; // 是否在具体片单（二级视图）内

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---- 渲染入口：router.go('collections') 时调用 ----
  function mount(host, ctx) {
    if (!SFV.collections) { host.innerHTML = '<div class="sfv-placeholder">片单模块未加载</div>'; return; }
    itemsOpen = false; // 进入列表视图：复位二级视图状态
    host.innerHTML = '';

    // 子 Tab 栏
    var tabs = el('div', 'sfv-collections-tabs');
    var tabDefs = SFV.collections.getTabs();
    tabDefs.forEach(function (t) {
      var b = el('button', 'sfv-collections-tab' + (t.id === activeTab ? ' active' : ''), t.label);
      b.type = 'button';
      b.setAttribute('data-sfv-ctab', t.id);
      b.addEventListener('click', function () {
        activeTab = t.id;
        // 更新激活态
        var all = tabs.querySelectorAll('.sfv-collections-tab');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
        b.classList.add('active');
        renderGrid(host, t.id);
      });
      tabs.appendChild(b);
    });
    host.appendChild(tabs);

    // 卡片网格容器
    var grid = el('div', 'sfv-collections-grid');
    grid.id = 'sfv-collections-grid';
    host.appendChild(grid);

    renderGrid(host, activeTab);
  }

  // ---- 渲染某 Tab 下的片单卡片 ----
  function renderGrid(host, tabId) {
    var grid = doc.getElementById('sfv-collections-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (tabId === 'mine') {
      renderMineTab(grid);
      return;
    }

    var defs = SFV.collections.getByTab(tabId);
    if (!defs.length) {
      grid.innerHTML = '<div class="sfv-placeholder">暂无片单</div>';
      return;
    }

    defs.forEach(function (def) {
      var card = buildCollectionCard(def);
      grid.appendChild(card);
    });
  }

  // ---- 构建单张片单卡片 ----
  function buildCollectionCard(def) {
    var card = el('div', 'sfv-collection-card' + (def.type === 'placeholder' ? ' is-placeholder' : ''));
    card.setAttribute('data-sfv-coll', def.id);

    // 背景层
    var bg = el('div', 'sfv-coll-bg fallback');
    bg.style.setProperty('--bg-warm', def.warm || '#2c3e50');
    card.appendChild(bg);

    // 海报叠加层（先放占位，异步加载真实海报）
    var posters = el('div', 'sfv-coll-posters');
    for (var i = 0; i < 3; i++) {
      var empty = el('div', 'sfv-coll-poster-empty', '🎬');
      posters.appendChild(empty);
    }
    card.appendChild(posters);

    // 异步拉真实海报（不阻塞渲染）
    if (def.type !== 'placeholder' && SFV.collections.getPosters) {
      SFV.collections.getPosters(def, 3).then(function (urls) {
        posters.innerHTML = '';
        if (!urls.length) {
          for (var k = 0; k < 3; k++) posters.appendChild(el('div', 'sfv-coll-poster-empty', '🎬'));
          return;
        }
        urls.forEach(function (u) {
          var img = doc.createElement('img');
          img.loading = 'lazy';
          img.src = u;
          img.alt = '';
          img.addEventListener('error', function () { img.style.display = 'none'; });
          posters.appendChild(img);
        });
        // 用第一张海报作为背景（模糊）
        if (urls[0]) {
          bg.classList.remove('fallback');
          bg.style.backgroundImage = 'url("' + esc(urls[0]) + '")';
        }
      }).catch(function () { /* keep placeholder */ });
    }

    // 信息条
    var info = el('div', 'sfv-coll-info');
    info.appendChild(el('div', 'sfv-coll-title', def.title));
    var countText = def.type === 'placeholder' ? '即将上线' : (def.count != null ? ('共 ' + def.count + ' 部') : '');
    info.appendChild(el('div', 'sfv-coll-count', def.sub ? (def.sub + (countText ? ' · ' + countText : '')) : countText));
    card.appendChild(info);

    // 点击 → 进入影片网格
    if (def.type !== 'placeholder') {
      card.addEventListener('click', function () {
        if (SFV.online && SFV.online.openCollectionItems) {
          SFV.online.openCollectionItems(def);
        }
      });
    }
    return card;
  }

  // ---- 「我的片单」Tab ----
  function renderMineTab(grid) {
    var folders = SFV.collections.listUserFolders();
    if (!folders.length) {
      // 空状态 + 新建入口
      var empty = el('div', 'sfv-collection-card sfv-coll-new');
      empty.innerHTML = '<div style="text-align:center"><div class="sfv-coll-new-icon">+</div><div class="sfv-coll-new-text">新建片单夹</div></div>';
      empty.addEventListener('click', function () { showFolderDialog(null); });
      grid.appendChild(empty);
      return;
    }

    // 新建入口卡片
    var newCard = el('div', 'sfv-collection-card sfv-coll-new');
    newCard.innerHTML = '<div style="text-align:center"><div class="sfv-coll-new-icon">+</div><div class="sfv-coll-new-text">新建片单夹</div></div>';
    newCard.addEventListener('click', function () { showFolderDialog(null); });
    grid.appendChild(newCard);

    folders.forEach(function (f) {
      var card = el('div', 'sfv-collection-card');
      var bg = el('div', 'sfv-coll-bg fallback');
      bg.style.setProperty('--bg-warm', '#534AB7');
      card.appendChild(bg);

      // 海报（取该夹内前 3 张）
      var posters = el('div', 'sfv-coll-posters');
      var items = f.items || [];
      if (items.length) {
        var n = Math.min(3, items.length);
        for (var i = 0; i < n; i++) {
          var img = doc.createElement('img');
          img.loading = 'lazy';
          if (items[i].poster) img.src = items[i].poster;
          img.alt = '';
          img.addEventListener('error', function () { img.style.display = 'none'; });
          posters.appendChild(img);
        }
        if (items[0] && items[0].poster) {
          bg.classList.remove('fallback');
          bg.style.backgroundImage = 'url("' + esc(items[0].poster) + '")';
        }
      } else {
        for (var j = 0; j < 3; j++) posters.appendChild(el('div', 'sfv-coll-poster-empty', '🎬'));
      }
      card.appendChild(posters);

      var info = el('div', 'sfv-coll-info');
      info.appendChild(el('div', 'sfv-coll-title', f.name));
      info.appendChild(el('div', 'sfv-coll-count', (items.length || 0) + ' 部'));
      card.appendChild(info);

      // 操作按钮：重命名 / 删除
      var acts = el('div', 'sfv-coll-actions');
      var renameBtn = el('button', 'sfv-coll-act-btn', '✎');
      renameBtn.type = 'button';
      renameBtn.title = '重命名';
      renameBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        showFolderDialog(f.id);
      });
      var delBtn = el('button', 'sfv-coll-act-btn', '🗑');
      delBtn.type = 'button';
      delBtn.title = '删除';
      delBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (global.confirm && !global.confirm('确认删除片单夹「' + f.name + '」？')) return;
        SFV.collections.deleteUserFolder(f.id);
        renderMineTab(grid);
      });
      acts.appendChild(renameBtn);
      acts.appendChild(delBtn);
      card.appendChild(acts);

      // 点击进入该夹影片列表
      card.addEventListener('click', function () {
        if (SFV.online && SFV.online.openCollectionItems) {
          SFV.online.openCollectionItems({
            id: f.id, title: f.name, type: 'user-folder', folderId: f.id, warm: '#534AB7'
          });
        }
      });
      grid.appendChild(card);
    });
  }

  // ---- 新建/重命名片单夹弹窗 ----
  function showFolderDialog(folderId) {
    var mask = el('div', 'sfv-folder-dialog-mask');
    var dialog = el('div', 'sfv-folder-dialog');
    var title = folderId ? '重命名片单夹' : '新建片单夹';
    dialog.appendChild(el('h3', null, title));
    var input = doc.createElement('input');
    input.type = 'text';
    input.placeholder = '输入片单夹名称';
    if (folderId) {
      var existing = SFV.collections.listUserFolders().filter(function (x) { return x.id === folderId; })[0];
      if (existing) input.value = existing.name;
    }
    dialog.appendChild(input);

    var btns = el('div', 'sfv-folder-dialog-btns');
    var cancel = el('button', 'sfv-folder-btn-cancel', '取消');
    cancel.type = 'button';
    var ok = el('button', 'sfv-folder-btn-ok', folderId ? '保存' : '创建');
    ok.type = 'button';

    var close = function () { if (mask.parentNode) mask.parentNode.removeChild(mask); };
    cancel.addEventListener('click', close);
    mask.addEventListener('click', function (ev) { if (ev.target === mask) close(); });
    var submit = function () {
      var name = (input.value || '').trim();
      if (!name) { input.focus(); return; }
      if (folderId) SFV.collections.renameUserFolder(folderId, name);
      else SFV.collections.createUserFolder(name);
      close();
      // 刷新我的片单 tab
      var grid = doc.getElementById('sfv-collections-grid');
      if (grid && activeTab === 'mine') renderMineTab(grid);
    };
    ok.addEventListener('click', submit);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.keyCode === 13) submit(); });
    btns.appendChild(cancel);
    btns.appendChild(ok);
    dialog.appendChild(btns);

    mask.appendChild(dialog);
    (doc.body || doc.documentElement).appendChild(mask);
    if (input.focus) input.focus();
  }

  // 供 online.js 在进入具体片单时通知页内二级视图状态
  function setItemsOpen(v) { itemsOpen = !!v; }

  // ---- 注册到 router ----
  if (SFV.router) {
    SFV.router.register({
      id: 'collections',
      title: '片单',
      mount: mount,
      back: function () {
        // 页内二级视图（具体片单）消费返回：回到片单列表，返回 true；
        // 顶层片单列表：返回 false，交由外壳关闭全屏覆盖层回到首页。
        if (itemsOpen) {
          itemsOpen = false;
          if (SFV.online && typeof SFV.online.reopenCollections === 'function') {
            SFV.online.reopenCollections();
          }
          return true;
        }
        return false;
      }
    });
  }

  SFV.pageCollections = { mount: mount, renderGrid: renderGrid, showFolderDialog: showFolderDialog, setItemsOpen: setItemsOpen };
})(typeof window !== 'undefined' ? window : this);
