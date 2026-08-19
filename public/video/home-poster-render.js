/*
 * Stellaflix 影视模块 — 影视态海报「渲染 / 动作」子系统 (T119 / T120)
 *
 * 从 home.js 抽出（home.js 影视态首页 Step 3 的可维护性拆债，目标 ≤500 行）。
 *
 * 设计边界（铁律）：
 *   - 存储与内存缓存（posterStore / VIDEO_POSTER_LS_KEY / loadPosterStore /
 *     getUserVideoPoster / setUserVideoPoster / clearUserVideoPoster）保留在 home.js，
 *     因为文案编辑器 saveVideoPosterQuote 与 posterStore 共享同一可变状态，
 *     跨模块暴露可变状态是已踩过的坑（见 source-adapter 的 activeHls），
 *     故本文件只负责「渲染 + 动作」，存储走 SFV.home 门面。
 *   - 运行时经 SFV.home.getUserVideoPoster / setUserVideoPoster / clearUserVideoPoster 取存储；
 *     「改文案」芯片经 SFV.home.editVideoPosterQuote 回 home.js（避免本文件反向依赖 home.js 内部函数）。
 *   - 加载顺序：须晚于 home-core.js（取 escAttr），且晚于 home.js 设置 SFV.home 门面前不会在加载期调用。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  var HC = SFV.homeCore;
  if (!HC) { throw new Error('[SFV home-poster-render] homeCore 未加载，请检查 index.html 加载顺序'); }
  var escAttr = HC.escAttr;

  function d() { return global.document; }

  // 存储取 home.js 门面（posterStore 保留在 home.js）
  function getUserVideoPoster() {
    if (SFV.home && typeof SFV.home.getUserVideoPoster === 'function') return SFV.home.getUserVideoPoster();
    return null;
  }
  function setUserVideoPoster(rec) {
    if (SFV.home && typeof SFV.home.setUserVideoPoster === 'function') return SFV.home.setUserVideoPoster(rec);
    return false;
  }
  function clearUserVideoPoster() {
    if (SFV.home && typeof SFV.home.clearUserVideoPoster === 'function') return SFV.home.clearUserVideoPoster();
    return false;
  }

  // 海报来源策略（用户死命令：仅允许用户上传，不自动回退任何历史/TMDB/收藏数据）
  //   1) 用户手动设置过 → 用 posterStore
  //   2) 否则 → 默认封面（暗色玻璃 + 🎬 emoji）
  function pickVideoPoster() {
    var user = getUserVideoPoster();
    if (user && user.url) return { kind: 'user', url: user.url, title: user.title || '' };
    return { kind: 'default', url: '', title: '' };
  }

  // 渲染影视态左侧海报（默认封面 = B2 暗色玻璃 + 🎬 emoji 96px + 文字 20px）
  // T120 改进：不清空 innerHTML，保留音乐态 .home-poster-frame / .home-poster-reflection 装饰（E1），
  //   仅移除之前注入的影视态子元素（.sfv-poster-default-inner）。
  //   装饰可见性由 CSS class（.sfv-poster-default / .sfv-poster-movie）控制。
  function renderVideoPoster() {
    var doc = d();
    if (!doc) return;
    var media = doc.getElementById('home-poster-media');
    if (!media) return;

    // 先清掉上一次注入的影视态子元素（但不删 frame / frame reflection）
    var oldDefault = media.querySelector('.sfv-poster-default-inner');
    if (oldDefault && oldDefault.parentNode) oldDefault.parentNode.removeChild(oldDefault);

    var picked = pickVideoPoster();
    if (picked.kind === 'default') {
      // 默认封面：暗色玻璃 + 🎬 emoji + "影视空间" 文字（B2 96px + 20px）
      media.classList.add('sfv-poster-default');
      media.classList.remove('sfv-poster-movie', 'has-image');
      media.style.removeProperty('--home-poster-image');

      var inner = doc.createElement('div');
      inner.className = 'sfv-poster-default-inner';
      inner.setAttribute('aria-hidden', 'true');
      var emoji = doc.createElement('div');
      emoji.className = 'sfv-poster-default-emoji';
      emoji.textContent = '\uD83C\uDFAC'; // 🎬
      var text = doc.createElement('div');
      text.className = 'sfv-poster-default-text';
      text.textContent = '影视空间';
      inner.appendChild(emoji);
      inner.appendChild(text);
      media.appendChild(inner);
    } else {
      // 真实海报：背景图 + sfv-poster-movie 类（玻璃质感由 .home-poster-frame 提供，与音乐态同源；
      //   不注入底部遮罩，避免影视态海报底部被系统性压暗，与音乐态亮度对齐）
      media.classList.add('sfv-poster-movie', 'has-image');
      media.classList.remove('sfv-poster-default');
      var safe = escAttr(picked.url);
      media.style.setProperty('--home-poster-image', 'url("' + safe + '")');
    }
  }

  // ---- T119/T120：影视态 home-poster-actions 改造 ----
  // 影视态下（C2 顺序：换图片 → 改文案 → 重置 → 工具箱）：
  //   ① 隐藏 "用当前封面"（避免把音乐封面误用为影视海报）
  //   ② "换图片" 重定向到 pickLocalVideoPoster()（只允许本地自定义图，写 video-poster.json）
  //   ③ "重置" 重定向到 resetVideoPoster()（清 video-poster.json + 回默认封面）
  //   （已移除 "从 TMDB 选" —— 海报仅支持用户本地图片，不再抓取 TMDB）
  //   ⑤ "改文案" / "工具箱" 沿用音乐态
  // T120：每次 render 强制重写（D1，移除 dataset 守卫），用 data-sfv-action 属性去重。
  function restructurePosterActionsForVideo() {
    var doc = d();
    if (!doc) return;
    // 主选器匹配 #home-poster（影视态 hero 容器）；若 index.html 重构丢失该 id，回退到全局唯一的 .home-poster-actions
    var actions = doc.querySelector('#home-poster .home-poster-actions') || doc.querySelector('.home-poster-actions');
    if (!actions) { console.warn('[SFV-HOME] restructurePosterActionsForVideo: .home-poster-actions not found'); return; }

    // 每次 render 强制重写（D1）：不用 dataset 守卫，直接遍历按钮 + 按需修改
    var btns = actions.querySelectorAll('.home-poster-chip');
    console.log('[SFV-HOME] restructurePosterActionsForVideo: found', btns.length, 'chips');
    btns.forEach(function (b) {
      var txt = (b.textContent || '').trim();
      // ① "用当前封面" → display:none（保留 DOM 以便 restoreMusic 还原）
      if (txt === '用当前封面') {
        if (b.style.display !== 'none') b.style.display = 'none';
      }
      // ② "换图片" 重定向到视频态版本
      if (txt === '换图片') {
        b.onclick = function () { console.log('[SFV-HOME] 换图片 clicked'); pickLocalVideoPoster(); };
      }
      // ③ "重置" 重定向到视频态版本
      if (txt === '重置') {
        b.onclick = function () { resetVideoPoster(); };
      }
      // ④ "改文案" 重定向到视频态独立文案存储（不再写入音乐 store stellaflix-home-personal-poster-v1）
      if (txt === '改文案') {
        b.onclick = function () {
          console.log('[SFV-HOME] 改文案 clicked');
          if (SFV.home && typeof SFV.home.editVideoPosterQuote === 'function') SFV.home.editVideoPosterQuote();
        };
      }
    });
  }

  // 重置：清掉 stellaflix-video-poster + 回到默认封面
  function resetVideoPoster() {
    clearUserVideoPoster();
    renderVideoPoster();
    if (typeof global.showToast === 'function') {
      try { global.showToast('影视海报已重置'); } catch (e) {}
    }
  }

  // 本地图片上传 —— 使用 Electron 原生对话框（dialog.showOpenDialog），
  //   替代 <input type="file"> .click() 方案（后者在 Electron 中即使用户手势同步调用也不可靠，
  //   Chromium 安全模型可能因 input 非用户直接交互创建而静默忽略 click()）。
  function pickLocalVideoPoster() {
    console.log('[SFV-HOME] pickLocalVideoPoster: calling native dialog via IPC');
    if (global.desktopWindow && typeof global.desktopWindow.pickImage === 'function') {
      global.desktopWindow.pickImage().then(function (result) {
        console.log('[SFV-HOME] native dialog result:', JSON.stringify(result));
        if (!result || !result.ok) {
          if (result && !result.canceled) {
            if (typeof global.showToast === 'function') global.showToast('图片选择失败: ' + (result.error || '未知错误'));
          }
          return;
        }
        var dataUrl = result.dataUrl || '';
        if (!dataUrl || !/^data:image\//i.test(dataUrl)) {
          if (typeof global.showToast === 'function') global.showToast('图片数据无效');
          return;
        }
        console.log('[SFV-HOME] image selected, dataURL length:', dataUrl.length, 'fileName:', result.fileName);
        // 压缩到 1400px 上限，保持 base64 体积可控
        var doc = d();
        if (!doc) return;
        var img = new Image();
        img.onload = function () {
          var maxSide = 1400;
          var iw = img.naturalWidth || img.width || 1;
          var ih = img.naturalHeight || img.height || 1;
          var scale = Math.min(1, maxSide / Math.max(iw, ih));
          var w = Math.max(1, Math.round(iw * scale));
          var h = Math.max(1, Math.round(ih * scale));
          var cv = doc.createElement('canvas');
          cv.width = w; cv.height = h;
          var cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0, w, h);
          var out = '';
          try { out = cv.toDataURL('image/webp', 0.82); } catch (e1) { console.warn('[SFV-HOME] canvas webp failed:', e1.message); }
          if (!/^data:image\/webp/i.test(out)) {
            try { out = cv.toDataURL('image/jpeg', 0.84); } catch (e2) { out = dataUrl; }
          }
          setUserVideoPoster({ url: out, source: 'local', title: '自定义海报' });
          renderVideoPoster();
          if (typeof global.showToast === 'function') global.showToast('影视海报已替换为本地图片');
        };
        img.onerror = function () { if (typeof global.showToast === 'function') global.showToast('图片读取失败'); };
        img.src = dataUrl;
      }).catch(function (err) {
        console.warn('[SFV-HOME] pickImage IPC error:', err ? err.message : '');
        if (typeof global.showToast === 'function') global.showToast('图片选择失败');
      });
    } else {
      console.warn('[SFV-HOME] desktopWindow.pickImage not available');
      if (typeof global.showToast === 'function') global.showToast('图片选择功能不可用');
    }
  }

  SFV.homePosterRender = {
    pick: pickVideoPoster,
    render: renderVideoPoster,
    restructure: restructurePosterActionsForVideo,
    reset: resetVideoPoster,
    pickLocal: pickLocalVideoPoster,
  };
})(typeof window !== 'undefined' ? window : this);
