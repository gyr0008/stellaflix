/**
 * Stellaflix Smoke —— 渲染进程侧断言（由 wallpaper_video_smoke_electron.js 注入真实产品页执行）
 *
 * 运行环境：真实 Chromium 渲染进程，页面为真实 public/index.html，由真实 server.js 托管。
 *
 * 覆盖范围（B 组，可在无头 Electron 中自动验证）：
 *   - SFV 关键全局 / 桥接是否存在（state / player / source / WE 桌面预览桥接 R3）。
 *   - R4 双态硬隔离：setSpace('video') 翻转 body + html 的 video-space-active；
 *     音乐态专属 #search-area 在影视态被 CSS 隐藏（display:none），切回后恢复。
 *   - R4 控制器形态：播放时 body.video-player-active 被加上 → #bottom-bar 可见
 *     （离线/真实流不可达时优雅跳过，绝不假绿）。
 *   - R4 粒子照常：切回音乐态后 #canvas-container 内 <canvas> 仍可见、非零尺寸。
 *
 * 不覆盖（属 C 组人工 GUI 清单）：R1 独立壁纸窗口渲染、R2 Explorer 重启无撕裂、
 * R3 桌面合成级捕获/玻璃表面/视差指针（需真实 Windows 桌面 + GPU）。
 *
 * 返回：{ pass:[], fail:[], info:[] }
 */
(async () => {
  var out = { pass: [], fail: [], info: [] };
  function ok(cond, msg, detail) {
    if (cond) out.pass.push(msg);
    else out.fail.push(msg + (detail !== undefined ? ' | 实得: ' + JSON.stringify(detail) : ''));
    return !!cond;
  }
  function info(msg) { out.info.push(msg); }

  // 等待 body 出现某个 class（播放态 video-player-active 由 player-controller 在 sfv:player-open 时加）
  function waitForClass(cls, timeout) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      if (document.body && document.body.classList.contains(cls)) return finish(true);
      var t0 = Date.now();
      (function tick() {
        if (done) return;
        if (document.body && document.body.classList.contains(cls)) return finish(true);
        if (Date.now() - t0 > timeout) return finish(false);
        setTimeout(tick, 200);
      })();
    });
  }

  function computedDisplay(sel) {
    try {
      var el = document.querySelector(sel);
      if (!el) return 'missing:' + sel;
      return getComputedStyle(el).display;
    } catch (e) { return 'err:' + String(e && e.message); }
  }

  // ---------------------------------------------------- A. 全局 / 桥接存在性
  var SFV = window.StellaflixVideo;
  if (!ok(!!SFV, 'A1 window.StellaflixVideo 存在')) return out;
  ok(!!SFV.state && typeof SFV.state.setSpace === 'function', 'A2 SFV.state.setSpace 已导出（双态入口）');
  ok(!!SFV.player, 'A3 SFV.player 已挂载（播放控制）');
  ok(!!SFV.source && typeof SFV.source.open === 'function', 'A4 SFV.source.open 已导出（播放入口）');
  ok(typeof window.__stellaflixPrepareWallpaperEngineDesktopPreview === 'function',
    'A5 R3 渲染端桥接 __stellaflixPrepareWallpaperEngineDesktopPreview 已定义（main.js 捕获/玻璃表面契约）');

  // ---------------------------------------------------- B. 进入影视态（R4 双态）
  try { SFV.state.setSpace('video', { force: true }); }
  catch (e) { ok(false, 'B0 setSpace("video") 抛异常', String(e && e.message)); return out; }
  await new Promise(function (r) { setTimeout(r, 150); }); // 让 spacechange 监听者跑完

  ok(SFV.state.getSpace() === 'video', 'B1 SFV.state.getSpace() 返回 video', SFV.state.getSpace());
  ok(document.body.classList.contains('video-space-active'), 'B2 body.video-space-active 已加身（影视态）');
  ok(document.documentElement.classList.contains('video-space-active'),
    'B3 html.video-space-active 已同步（T137 供影视态专用规则）');

  // ---------------------------------------------------- C. 双态硬隔离
  var searchDisp = computedDisplay('#search-area');
  ok(searchDisp === 'none', 'C1 音乐态 #search-area 在影视态被隐藏（display:none，硬隔离）', searchDisp);

  // 影视态专属导航可见（sanity：影视态自身 UI 在位）
  var navDisp = computedDisplay('#sfv-nav');
  info('C 影视态 #sfv-nav 实得 display=' + navDisp + '（影视专属 UI 在位）');

  // ---------------------------------------------------- D. 播放 → 控制器形态（R4）
  // 用公共 CORS 友好 mux 测试流；离线/不可达时优雅跳过，不计入失败。
  var REAL_M3U8 = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  var reach = false;
  try { reach = await fetch(REAL_M3U8, { method: 'HEAD' }).then(function (r) { return !!r.ok; }); }
  catch (e) { reach = false; }
  if (!reach) {
    info('D0 离线/真实流不可达，跳过「播放态控制器形态」自动化（C 组 R4 真实源播放需真机）');
  } else {
    var opened = false;
    try { opened = SFV.source.open({ url: REAL_M3U8, title: 'Smoke真实HLS流', id: 'smoke:hls:0' }); }
    catch (e) { ok(false, 'D1 SFV.source.open 抛异常', String(e && e.message)); }
    ok(opened !== false, 'D1 SFV.source.open 成功下发播放（覆盖层已显示）', opened);
    var played = await waitForClass('video-player-active', 15000);
    ok(played === true, 'D2 播放态 body.video-player-active 已被加上（控制器接管）', played);
    var bottomDisp = computedDisplay('#bottom-bar');
    ok(bottomDisp !== 'none', 'D3 播放态 #bottom-bar 控制器外壳可见（非隐藏）', bottomDisp);
    try { if (SFV.player && SFV.player.close) SFV.player.close(); } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 300); });
  }

  // ---------------------------------------------------- E. 切回音乐态（R4 双态 + 粒子照常）
  try { SFV.state.setSpace('music', { force: true }); }
  catch (e) { ok(false, 'E0 setSpace("music") 抛异常', String(e && e.message)); return out; }
  await new Promise(function (r) { setTimeout(r, 150); });

  ok(SFV.state.getSpace() === 'music', 'E1 SFV.state.getSpace() 返回 music（已切回）', SFV.state.getSpace());
  ok(!document.body.classList.contains('video-space-active'), 'E2 body.video-space-active 已移除（影视态退出）');
  ok(!document.documentElement.classList.contains('video-space-active'), 'E3 html.video-space-active 已移除');

  var searchDispBack = computedDisplay('#search-area');
  ok(searchDispBack !== 'none', 'E4 音乐态 #search-area 切回后恢复可见（隔离可逆）', searchDispBack);

  // 播放态残留检查
  ok(!document.body.classList.contains('video-player-active'), 'E5 切回后无 video-player-active 残留');

  // 粒子照常：#canvas-container 内 canvas 可见且非零尺寸（影视态不销毁粒子）
  try {
    var cc = document.querySelector('#canvas-container');
    var cv = cc ? cc.querySelector('canvas') : null;
    var ccDisp = cc ? getComputedStyle(cc).display : 'missing';
    var cvOk = !!cv && cv.clientWidth > 0 && cv.clientHeight > 0;
    ok(!!cc && ccDisp !== 'none', 'E6 粒子容器 #canvas-container 仍可见（未因影视态被销毁）', ccDisp);
    ok(cvOk, 'E7 粒子 <canvas> 仍具非零绘制尺寸（粒子照常运行）',
      cv ? (cv.clientWidth + 'x' + cv.clientHeight) : 'no-canvas');
    if (cv) info('E 粒子 canvas 实得尺寸 ' + cv.clientWidth + 'x' + cv.clientHeight);
  } catch (e) {
    ok(false, 'E6 粒子容器检测异常', String(e && e.message));
  }

  info('E 最终空间态: ' + SFV.state.getSpace());
  return out;
})()
