/*
 * Stellaflix 影视模块 — 影视海报网格页面工厂 (T127)
 *
 * 电影 / 动漫 是两个**独立注册**的页面模块，各自调用本工厂生成，传入字面量
 *   mediaType（'movie' / 'anime'），而非运行时用 kind 切换同一函数。
 * 工厂内聚：页面生命周期（mount/unmount/back）+ 3D 海报墙接入（browse3d）。
 *
 * 方案 D（2026-08-05）：删除 DOM 海报网格外壳（grid/filter/loadMore/status），
 * 仅保留底部 TMDB 署名（foot）。海报墙由 browse3d 在共享 WebGL 画布
 * （与首页星空同 canvas）渲染，覆盖层透明透出星空。功能连线（点击→详情 /
 * 筛选 / 加载更多）留待 Phase 4 接回。
 *
 * 双态隔离：本模块只读取 SFV.ui / SFV.online / SFV.router / SFV.browse3d，
 * 绝不写入音乐态 DOM。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});

  // ---- 3D 海报浏览（方案 D）动态加载器 ----
  // 不在 index.html 加 <script>（保持 git diff 为零），按需加载 page-browse-3d.js。
  // 加载策略：fetch+eval（vite dev / Electron WebContents / file:// 三环境通用，
  //   不依赖动态 <script src> 的隐式 fetch 行为，避免 vite/Electron 拦截导致
  //   SFV.browse3d 永远 undefined → 电影页无 3D 海报墙）。
  // 失败回退：fetch 不支持/失败时退回动态 script 注入（向后兼容）。
  // 加载完成通过 'sfv-browse3d-ready' 事件通知等待方激活。
  function ensureBrowse3d(cb) {
    if (SFV.browse3d) { if (cb) cb(); return; }
    if (!global.__sfvBr3dLoading) {
      global.__sfvBr3dLoading = true;
      var done = function (ok) {
        if (!ok) {
          // 加载失败 → 解锁重试 + 退回动态 script 注入
          global.__sfvBr3dLoading = false;
          try {
            var s2 = global.document.createElement('script');
            s2.src = 'video/page-browse-3d.js';
            s2.onerror = function () {
              try { console.error('[SFV] browse3d script fallback also failed'); } catch (_) {}
              global.__sfvBr3dLoading = false;
            };
            (global.document.head || global.document.body || global.document.documentElement).appendChild(s2);
          } catch (e2) {
            try { console.error('[SFV] browse3d fallback script inject error:', e2); } catch (_) {}
            global.__sfvBr3dLoading = false;
          }
        }
      };
      if (global.fetch && global.Promise) {
        global.fetch('video/page-browse-3d.js', { cache: 'no-cache' })
          .then(function (r) {
            if (!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : 'no-response'));
            return r.text();
          })
          .then(function (src) {
            try {
              // 通过 Function 构造器在 global 作用域执行（绕过 script 标签隐式 fetch）
              // eslint-disable-next-line no-new-func
              (new Function('window', 'document', 'self', src))(global, global.document, global);
              try { console.log('[SFV] browse3d loaded via fetch+eval (page-browse-3d.js)'); } catch (_) {}
            } catch (e) {
              try { console.error('[SFV] browse3d eval error:', e); } catch (_) {}
              done(false);
            }
          })
          .catch(function (e) {
            try { console.warn('[SFV] browse3d fetch failed, fallback to <script>:', e && e.message); } catch (_) {}
            done(false);
          });
      } else {
        done(false); // 无 fetch → 直接 script 注入
      }
    }
    var h = function () { global.removeEventListener('sfv-browse3d-ready', h); if (cb) cb(); };
    global.addEventListener('sfv-browse3d-ready', h);
  }
  SFV.ensureBrowse3d = ensureBrowse3d;

  function createMediaGridPage(opts) {
    var id = opts.id;
    var title = opts.title;
    var mediaType = opts.mediaType; // 字面量：'movie' 或 'anime'，非运行时 kind

    var detailOpen = false;
    var showGridFn = null;

    // 方案 D（2026-08-05）：删除 DOM 海报外壳，仅保留底部 TMDB 署名。
    // 星空由透明覆盖层透出，海报墙由 browse3d 渲染。
    function showShell(host) {
      var ui = SFV.ui;
      detailOpen = false;
      host.innerHTML = '';
      var foot = ui.el('div', 'sfv-browse-foot',
        '影视资料来自 TMDB，仅供展示。This product uses the TMDB API but is not endorsed or certified by TMDB.');
      host.appendChild(foot);
    }

    // Phase 1.5 占位态：所有进详情路径统一走 SFV.online.renderDetail 拦截（toast 提示）
    function showDetail(it) {
      try {
        if (SFV.online && typeof SFV.online.renderDetail === 'function') {
          SFV.online.renderDetail(it);
        }
      } catch (e) { /* 静默降级 */ }
    }

    var page = {
      id: id,
      title: title,
      mount: function (host, ctx) {
        var ui = SFV.ui;
        ui.setBrowseChrome(true); // 网格页隐藏浏览层自带内联搜索与操作按钮
        showGridFn = function () { showShell(host); };
        showShell(host);
        // 3D 海报网格栏（方案 D）：复用全局 scene/camera/renderer/orbit
        SFV.ensureBrowse3d(function () {
          if (SFV.browse3d) SFV.browse3d.activate({ mediaType: mediaType, host: host, onCardClick: showDetail });
        });
      },
      // 页面内部 back：详情打开时关闭详情回到网格（返回 true 表示已处理）；
      // 否则返回 false（顶层 tab 页平级，无返回语义，交由外壳 no-op）。
      back: function () {
        if (detailOpen) { if (showGridFn) showGridFn(); return true; }
        return false;
      },
      // 离开本页（router.go 切换 / 切空间）→ 坍缩回收 3D + 还原 orbit
      unmount: function () {
        if (SFV.browse3d) SFV.browse3d.deactivate();
      }
    };

    SFV.router.register(page);
    return page;
  }

  SFV.createMediaGridPage = createMediaGridPage;
})(typeof window !== 'undefined' ? window : this);
