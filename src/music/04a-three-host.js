// 04a-three-host.js — Vite Phase 2 · 2.5a (strategy A)
// Extracted from src/music/legacy-music.js (slices 1181-1477 / 3048-3141 / 12702-12909 / 28258-28590).
// THREE scene/camera/renderer host + orbit/freeCamera + canvas listeners + animate() ROOT orchestrator.
// CLASSIC SCRIPT (no import/export): top-level var/function attach to window.
// LOAD ORDER: must load AFTER /assets/music.js (legacy defines every update fn / util / constant that
// host top-level init + animate() call by name). Build via esbuild --minify (no --bundle).
// ============================================================
//  Three.js 场景
// ============================================================
var scene = new THREE.Scene();
scene.background = null;
var camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
var RENDER_DPR_CAP = 1.35;
var RENDER_PIXEL_BUDGET = 5200000;
var RENDER_MIN_DPR = 0.72;
// 0 = display vsync. Keep visible playback high-refresh capable instead of capping 120Hz+ screens to 60/72.
var RENDER_VISIBLE_VSYNC = true;
var RENDER_ACTIVE_FPS = 0;
var RENDER_LARGE_FPS = 0;
var RENDER_HUGE_FPS = 0;
var RENDER_INTERACTION_FPS = 0;
var RENDER_INTERACTION_LARGE_FPS = 0;
var RENDER_INTERACTION_HUGE_FPS = 0;
var RENDER_INTERACTION_HOLD_MS = 900;
var renderInteractionBoostUntil = 0;
var renderInteractionReason = '';
// 2.5b-regression-fix: stub defined by 08-fx-visual.js (loaded AFTER this host). Event
// handlers registered at host top-level call it; returning false avoids ReferenceError if a
// pointer event fires before 08 executes. 08's function declaration overrides this stub.
function isPointerOverUi() { return false; }
function renderQualityProfile() {
  var quality = normalizePerformanceQuality(fx && fx.performanceQuality);
  if (quality === 'eco') return { cap: 0.95, min: 0.56, budget: 2400000 };
  if (quality === 'balanced') return { cap: 1.12, min: 0.66, budget: 3800000 };
  if (quality === 'ultra') return { cap: 1.75, min: 0.85, budget: 7800000 };
  return { cap: RENDER_DPR_CAP, min: RENDER_MIN_DPR, budget: RENDER_PIXEL_BUDGET };
}
function getRenderPixelRatio() {
  var device = window.devicePixelRatio || 1;
  if (isDeepBackgroundMode()) return Math.min(device, 0.30);
  var cssPixels = Math.max(1, innerWidth * innerHeight);
  var quality = renderQualityProfile();
  var budgetCap = Math.sqrt(quality.budget / cssPixels);
  var cap = Math.min(quality.cap, budgetCap);
  return Math.max(quality.min, Math.min(device, cap));
}
function getRenderPixelLoad() {
  var ratio = getRenderPixelRatio();
  return Math.max(1, innerWidth * innerHeight) * ratio * ratio;
}
function markRenderInteraction(reason, holdMs) {
  if (isDeepBackgroundMode()) return;
  var now = performance.now();
  renderInteractionBoostUntil = Math.max(renderInteractionBoostUntil, now + (holdMs || RENDER_INTERACTION_HOLD_MS));
  renderInteractionReason = reason || renderInteractionReason || 'interaction';
  if (typeof renderPerfState !== 'undefined' && renderPerfState) renderPerfState.lastRenderAt = 0;
}
function isRenderInteractionActive(now) {
  return (now || performance.now()) < renderInteractionBoostUntil;
}
function getRenderLoadTier() {
  var cssPixels = Math.max(1, innerWidth * innerHeight);
  var renderPixels = (typeof getRenderPixelLoad === 'function') ? getRenderPixelLoad() : cssPixels;
  if (cssPixels >= 7200000 || renderPixels >= 5000000) return 2;
  if (cssPixels >= 3200000 || renderPixels >= 3600000) return 1;
  return 0;
}
var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
// X1 (2026-08-18) r128 + KHR_parallel_shader_compile 异步编译补丁：
// 星空/fx 重型 ShaderMaterial(~2s 同步编译)改在 GPU 后台跑，编译期不独占 GPU driver →
// CSS 开屏动画(compositor)照常流畅，消除 X0/B1 实测的「编译期整屏冻结 ~2s」。
// ① 取原生 gl 上下文与扩展；② 关闭 r128 同步 LINK_STATUS 查询(实测阻塞根因：
//    gl.linkProgram 后仍紧跟 getProgramParameter(x,35714) 同步等待)；③ 编译全部完成
//    后才首次绘制(见 animate 覆盖分支轮询 COMPLETION_STATUS_KHR)。缺扩展时
//    parallelShaderCompileExt=null，自动回退 X0 同步行为。
var _gl = renderer.getContext();
var parallelShaderCompileExt = _gl && _gl.getExtension('KHR_parallel_shader_compile');
// 诊断 (2026-08-18 晚)：确认 KHR_parallel_shader_compile 是否在本机可用——若打印 UNAVAILABLE，
// 说明 X1 异步路径未生效、回退同步渲染，这正是入场仍卡的根因。
try { console.log('[Stellaflix] KHR_parallel_shader_compile =', parallelShaderCompileExt ? 'AVAILABLE (async compile)' : 'UNAVAILABLE (sync fallback)'); } catch (e) {}
window.__sfvParallelShaderExt = !!parallelShaderCompileExt;
// === Background shader compilation: GL 层拦截 + 逐步执行 ===
// r149 无 KHR_parallel_shader_compile，renderer.compile() 同步阻塞
// 核心思路：在 GL 层拦截 compileShader/linkProgram，将每个调用变成队列任务，
// 然后用 setTimeout(fn, 0) 逐个执行，每次只编译一个 shader (~50ms)，不阻塞动画帧。
var bgCompileActive = false;
var bgCompileQueue = null;
var bgCompileDone = false;
var _glOrigCompileShader = null;
var _glOrigLinkProgram = null;
var _glOrigGetShaderParameter = null;
var _glOrigGetProgramParameter = null;
var _glOrigGetShaderInfoLog = null;
var _glOrigGetProgramInfoLog = null;
var _glIntercepting = false;
var _glDeferQueue = [];

function _installGlInterceptor() {
  if (_glIntercepting) return;
  _glOrigCompileShader = _gl.compileShader.bind(_gl);
  _glOrigLinkProgram = _gl.linkProgram.bind(_gl);
  _glOrigGetShaderParameter = _gl.getShaderParameter.bind(_gl);
  _glOrigGetProgramParameter = _gl.getProgramParameter.bind(_gl);
  _glOrigGetShaderInfoLog = _gl.getShaderInfoLog.bind(_gl);
  _glOrigGetProgramInfoLog = _gl.getProgramInfoLog.bind(_gl);
  _glDeferQueue = [];
  _glIntercepting = true;

  // 拦截 compileShader: 不执行，只入队
  _gl.compileShader = function (shader) {
    _glDeferQueue.push({ type: 'compileShader', shader: shader });
  };
  // 拦截 linkProgram: 不执行，只入队
  _gl.linkProgram = function (program) {
    _glDeferQueue.push({ type: 'linkProgram', program: program });
  };
  // 拦截 getShaderParameter: 对 COMPILE_STATUS 返回 true (假装已编译)
  _gl.getShaderParameter = function (shader, pname) {
    if (pname === _gl.COMPILE_STATUS) return true;
    if (pname === _gl.DELETE_STATUS) return false;
    return _glOrigGetShaderParameter(shader, pname);
  };
  // 拦截 getProgramParameter: 对 LINK_STATUS 返回 true (假装已链接)
  _gl.getProgramParameter = function (program, pname) {
    if (pname === _gl.LINK_STATUS) return true;
    if (pname === _gl.DELETE_STATUS) return false;
    return _glOrigGetProgramParameter(program, pname);
  };
  // 拦截 getShaderInfoLog: 返回空字符串
  _gl.getShaderInfoLog = function () { return ''; };
  // 拦截 getProgramInfoLog: 返回空字符串
  _gl.getProgramInfoLog = function () { return ''; };
}

function _restoreGlInterceptor() {
  if (!_glIntercepting) return;
  _gl.compileShader = _glOrigCompileShader;
  _gl.linkProgram = _glOrigLinkProgram;
  _gl.getShaderParameter = _glOrigGetShaderParameter;
  _gl.getProgramParameter = _glOrigGetProgramParameter;
  _gl.getShaderInfoLog = _glOrigGetShaderInfoLog;
  _gl.getProgramInfoLog = _glOrigGetProgramInfoLog;
  _glIntercepting = false;
  _glDeferQueue = [];
}

function _processGlDeferQueue(onComplete) {
  if (!_glDeferQueue.length) {
    // 队列已清空
    if (onComplete) onComplete();
    return;
  }
  var item = _glDeferQueue.shift();
  if (item.type === 'compileShader') {
    _glOrigCompileShader(item.shader);
  } else if (item.type === 'linkProgram') {
    _glOrigLinkProgram(item.program);
  }
  // 用 setTimeout(fn, 0) 让出主线程给浏览器渲染
  if (_glDeferQueue.length > 0) {
    setTimeout(function () { _processGlDeferQueue(onComplete); }, 0);
  } else {
    if (onComplete) onComplete();
  }
}

function startBackgroundCompile() {
  if (bgCompileActive || bgCompileDone) return;
  bgCompileActive = true;
  if (!bgCompileQueue) bgCompileQueue = collectShaderCompileQueue();
  console.log('[Stellaflix] Background compile started, programs:', bgCompileQueue.length);

  _installGlInterceptor();

  var compileNext = function () {
    if (bgCompileDone || !bgCompileQueue) {
      _restoreGlInterceptor();
      bgCompileActive = false;
      return;
    }
    var item = bgCompileQueue.shift();
    if (item && item.host && typeof renderer.compile === 'function') {
      if (!_compileTmpScene) _compileTmpScene = new THREE.Scene();
      try {
        var probe;
        if (item.host.isPoints) probe = new THREE.Points(item.host.geometry, item.material);
        else if (item.host.isLine) probe = new THREE.Line(item.host.geometry, item.material);
        else if (item.host.isSprite) probe = new THREE.Sprite(item.material);
        else probe = new THREE.Mesh(item.host.geometry, item.material);
        _compileTmpScene.add(probe);
        // 这里 renderer.compile() 内部调用的 compileShader/linkProgram 都被拦截入队了
        renderer.compile(_compileTmpScene, camera);
        _compileTmpScene.remove(probe);
      } catch (e) {
        console.log('[Stellaflix] Compile probe error:', e);
      }
    }
    // 立即执行队列中的 GL 调用（每步一个 setTimeout）
    _processGlDeferQueue(function () {
      // 此 material 的 GL 调用已全部完成，继续下一个
      if (!bgCompileQueue.length) {
        bgCompileQueue = null;
        bgCompileDone = true;
        shaderCompileDone = true;
        window.__sfvShaderCompileDone = true;
        bgCompileActive = false;
        console.log('[Stellaflix] Background compile COMPLETE');
        _restoreGlInterceptor();
        _tpbSaveAll(_gl);
        try { window.dispatchEvent(new CustomEvent('sfv:shader-compile-done')); } catch (e) {}
        return;
      }
      // 继续下一个 material
      setTimeout(compileNext, 0);
    });
  };

  // 启动第一个 material 的编译
  setTimeout(compileNext, 0);
}

// === End background compile ===
// A2: Three.js ProgramBinary cache (IndexedDB + GPU指纹)
var TPB_DB_NAME = 'stellaflix-three-progbin';
var TPB_STORE = 'programs';
var _tpbDB = null;
var _tpbReady = false;
var _tpbCache = {};
function _tpbOpen() {
  return new Promise(function(resolve, reject) {
    if (_tpbReady) { resolve(); return; }
    try {
      var req = indexedDB.open(TPB_DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(TPB_STORE)) db.createObjectStore(TPB_STORE);
      };
      req.onsuccess = function(e) { _tpbDB = e.target.result; resolve(); };
      req.onerror = function(e) { reject(e.target.error); };
    } catch (e) { reject(e); }
  });
}
function _tpbLoadAll() {
  try {
    if (!_tpbDB) return;
    var tx = _tpbDB.transaction(TPB_STORE, 'readonly');
    var store = tx.objectStore(TPB_STORE);
    var req = store.getAll();
    req.onsuccess = function() {
      var data = req.result || [];
      data.forEach(function(entry) { _tpbCache[entry.fp] = { fmt: entry.fmt, bin: entry.bin }; });
      console.log('[Stellaflix] ProgramBinary loaded:', data.length, 'programs');
    };
    req.onerror = function() {};
  } catch (e) {}
}
function _tpbSave(fp, fmt, bin) {
  try {
    if (!_tpbDB) return;
    var tx = _tpbDB.transaction(TPB_STORE, 'readwrite');
    tx.objectStore(TPB_STORE).put({ fp: fp, fmt: fmt, bin: bin, ts: Date.now() });
  } catch (e) {}
}
function _tpbClear() {
  try {
    if (!_tpbDB) return;
    var tx = _tpbDB.transaction(TPB_STORE, 'readwrite');
    tx.objectStore(TPB_STORE).clear();
    _tpbCache = {};
    console.log('[Stellaflix] Shader cache cleared');
  } catch (e) {}
}
function _tpbFingerprint(gl, vs, fs) {
  var vendor = '', renderer = '', version = '', maxAttrs = 0;
  try {
    var debugExt = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugExt) {
      vendor = String(gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) || '');
      renderer = String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '');
    }
    version = String(gl.getParameter(gl.VERSION) || '');
    maxAttrs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || 0;
  } catch (e) {}
  var str = vs + '\n' + fs + '|' + vendor + '|' + renderer + '|' + version + '|' + THREE.REVISION + '|' + maxAttrs;
  var h = 5381;
  for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '.' + str.length;
}
function _tpbGetProgramFingerprint(gl, prog) {
  try {
    if (!gl || !prog) return null;
    var shaders = gl.getAttachedShaders(prog);
    if (!shaders || shaders.length < 2) return null;
    var vs = gl.getShaderSource(shaders[0]);
    var fs = gl.getShaderSource(shaders[1]);
    if (!vs || !fs) return null;
    return _tpbFingerprint(gl, vs, fs);
  } catch (e) { return null; }
}
var _tpbOrigLink = _gl.linkProgram.bind(_gl);
_gl.linkProgram = function(prog) {
  if (_tpbReady) {
    var fp = _tpbGetProgramFingerprint(_gl, prog);
    if (fp && _tpbCache[fp]) {
      try { _gl.programBinary(prog, _tpbCache[fp].fmt, _tpbCache[fp].bin); } catch (e) {}
    }
  }
  _tpbOrigLink(prog);
  if (_tpbReady) {
    var fp2 = _tpbGetProgramFingerprint(_gl, prog);
    if (fp2 && !_tpbCache[fp2]) {
      try {
        var result = _gl.getProgramBinary(prog);
        if (result && result.binary) {
          _tpbCache[fp2] = { fmt: result.format, bin: result.binary };
          _tpbSave(fp2, result.format, result.binary);
          console.log('[Stellaflix] ProgramBinary saved:', fp2.substring(0, 16), 'len:', result.binary.byteLength);
        }
      } catch (e) {}
    }
  }
}
function _tpbSaveAll(gl) {
  try {
    if (!gl || !gl.getProgramBinary || !renderer.programs) return;
    renderer.programs.forEach(function(p) {
      if (!p || !p.program) return;
      var fp = _tpbGetProgramFingerprint(gl, p.program);
      if (!fp || _tpbCache[fp]) return;
      try {
        var r = gl.getProgramBinary(p.program);
        if (r && r.binary) {
          _tpbCache[fp] = { fmt: r.format, bin: r.binary };
          _tpbSave(fp, r.format, r.binary);
        }
      } catch (e) {}
    });
  } catch (e) {}
}
window.__sfvClearShaderCache = _tpbClear;
console.log('[Stellaflix] ProgramBinary cache (Three.js) enabled');
_tpbOpen().then(function() {
  _tpbReady = true;
  _tpbLoadAll();
  console.log('[Stellaflix] ProgramBinary cache ready');
}).catch(function(e) {
  console.warn('[Stellaflix] ProgramBinary DB fail:', e);
  _tpbReady = false;
});
 // 关键：绕过 r128 阻塞式 LINK_STATUS 同步查询
function addSplashPlayClass() {
  if (document.body && !document.body.classList.contains('splash-play')) document.body.classList.add('splash-play');
}
var shaderCompileKicked = false; // 是否已提交异步编译(renderer.compile)
var shaderCompileDone = false;   // 后台链接是否全部完成(可安全首绘)
var shaderPollSkipCount = 0;     // 方案A (2026-08-19): 编译期轮询削频 —— 每 3 帧全量查一次 COMPLETION_STATUS_KHR
var shaderCompileQueue = null;   // 方案B (2026-08-19): 拆批编译队列(按 material 实例去重)
var shaderCompileCooldown = 0;   // 方案B: 编译节奏(编译 1 个后休 3 帧,摊薄单 program 同步编译)
var _compileTmpScene = null;
// === Deferred Music Compilation: 启动影视态时跳过音乐态 shader 编译 ===
// 根因：用户选"启动影视态"后，音乐态十几套 shader 仍被全量编译 → ~2s 白等
// 方案：启动时读偏好，若为 video 则跳过编译 → 后台懒加载 → 切音乐态加速
var musicDeferredMode = false;
var musicDeferredDone = false;
var musicDeferredQueue = null;
var musicDeferredAccelerate = false;
var musicDeferredFrameCounter = 0;
var musicDeferredActive = false;
var MUSIC_DEFERRED_COOLDOWN_NORMAL = 12;
var MUSIC_DEFERRED_COOLDOWN_ACCEL = 2;

(function initDeferredMode() {
  try {
    var pref = null;
    if (globalThis.localStorage) pref = globalThis.localStorage.getItem('stellaflix-start-space');
    if (pref === 'video') {
      musicDeferredMode = true;
      console.log('[Stellaflix] Music deferred mode: starting in video space, music shaders will compile lazily');
    }
  } catch (e) {}
})();

function startMusicDeferredCompile(accelerate) {
  if (!musicDeferredMode || musicDeferredDone || musicDeferredActive) return;
  musicDeferredActive = true;
  if (accelerate) musicDeferredAccelerate = true;
  musicDeferredQueue = collectShaderCompileQueue();
  musicDeferredFrameCounter = 0;
  console.log('[Stellaflix] Music deferred compile started, programs:', musicDeferredQueue.length, accelerate ? '(ACCELERATED)' : '(background)');

  // 使用 GL 拦截方式，逐步执行，避免阻塞动画帧
  _installGlInterceptor();

  var compileNext = function () {
    if (!musicDeferredMode || musicDeferredDone) {
      _restoreGlInterceptor();
      musicDeferredActive = false;
      return;
    }
    if (!musicDeferredQueue) {
      musicDeferredQueue = collectShaderCompileQueue();
    }
    if (!musicDeferredQueue || !musicDeferredQueue.length) {
      musicDeferredDone = true;
      musicDeferredActive = false;
      shaderCompileDone = true;
      window.__sfvShaderCompileDone = true;
      console.log('[Stellaflix] Music deferred compile COMPLETE');
      _restoreGlInterceptor();
      _tpbSaveAll(_gl);
      try { window.dispatchEvent(new CustomEvent('sfv:shader-compile-done')); } catch (e) {}
      return;
    }
    var item = musicDeferredQueue.shift();
    if (item && item.host && typeof renderer.compile === 'function') {
      if (!_compileTmpScene) _compileTmpScene = new THREE.Scene();
      try {
        var probe;
        if (item.host.isPoints) probe = new THREE.Points(item.host.geometry, item.material);
        else if (item.host.isLine) probe = new THREE.Line(item.host.geometry, item.material);
        else if (item.host.isSprite) probe = new THREE.Sprite(item.material);
        else probe = new THREE.Mesh(item.host.geometry, item.material);
        _compileTmpScene.add(probe);
        renderer.compile(_compileTmpScene, camera);
        _compileTmpScene.remove(probe);
      } catch (e) {
        console.log('[Stellaflix] Deferred compile probe error:', e);
      }
    }
    // 逐步执行 GL 调用
    _processGlDeferQueue(function () {
      if (!musicDeferredQueue || !musicDeferredQueue.length) {
        musicDeferredDone = true;
        musicDeferredActive = false;
        shaderCompileDone = true;
        window.__sfvShaderCompileDone = true;
        console.log('[Stellaflix] Music deferred compile COMPLETE');
        _restoreGlInterceptor();
        _tpbSaveAll(_gl);
        try { window.dispatchEvent(new CustomEvent('sfv:shader-compile-done')); } catch (e) {}
        return;
      }
      // 加速:16ms; 正常:50ms
      var delay = musicDeferredAccelerate ? 16 : 50;
      setTimeout(compileNext, delay);
    });
  };
  // 立即开始第一个
  setTimeout(compileNext, 0);
}

function tickMusicDeferredCompile() {
  // 现在编译在后台（requestIdleCallback/setTimeout）进行
  // 此函数仅作为空操作占位，保持外部调用安全
  // 真正的进度由 startMusicDeferredCompile 的回调驱动
}
     // 方案B: 拆批编译用临时 Scene(复用,惰性创建)
// 方案B: 收集场景去重材质(实例级)生成拆批编译队列。同 programCacheKey 的重复项由 Three.js
// programCache 拦截为 no-op，只保证每个独立 program 至少被编译一次；场景无灯光且材质均为
// 无光照类(Basic/Shader/Points)，临时 Scene 不影响 key。
function collectShaderCompileQueue() {
  var q = [];
  var seen = (typeof Set !== 'undefined') ? new Set() : null;
  try {
    scene.traverse(function (obj) {
      var mat = obj && obj.material;
      if (!mat) return;
      var mats = Array.isArray(mat) ? mat : [mat];
      for (var i = 0; i < mats.length; i++) {
        var m = mats[i];
        if (!m) continue;
        if (seen) { if (seen.has(m)) continue; seen.add(m); }
        q.push({ material: m, host: obj });
      }
    });
  } catch (e) {}
  return q;
}
renderer.setClearColor(0x000000, 0);
// 2.5b-regression-fix: defer the pixel-ratio assignment to DOMContentLoaded so the REAL
// saved fx.performanceQuality (defined by 08-fx-visual.js, loaded LAST) is used instead of
// the legacy stub's default 'high'. renderer itself is already created above.
function applyRenderPixelRatio() { renderer.setPixelRatio(getRenderPixelRatio()); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyRenderPixelRatio);
} else {
  applyRenderPixelRatio();
}
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.background = 'transparent';
renderer.domElement.style.display = 'block';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.tabIndex = 0;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// T140：影视态把 WebGL 清屏改为不透明深底（与 body.video-space-active 的 #080a10 同色），
// 消除「透明画布 + 透明 Electron 窗口 + 实色 body 背景」三层合成不稳导致的
// home / 搜索页闪烁、黑屏。音乐态保持透明清屏（星空墙视觉不变）。
// spacechange 实时切换；启动时按当前空间应用一次（兼容启动即影视态）。
function applySfvClearColor() {
  var isVideo = !!(document.body && document.body.classList.contains('video-space-active'));
  if (isVideo) renderer.setClearColor(0x080a10, 1);
  else renderer.setClearColor(0x000000, 0);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySfvClearColor);
else applySfvClearColor();
if (window.addEventListener) window.addEventListener('spacechange', applySfvClearColor);

// ============================================================
//  相机系统 v7.1 — 分离 user offset / cinema offset
//   - userOrbit: 用户拖拽的目标 (永久保留, 不会被电影模式覆盖)
//   - cinemaOffset: 电影模式的微偏移 (始终叠加, 即使用户在拖)
//   - 最终 theta = userOrbit.theta + cinemaOffset.theta
//   - 回正按钮 / 双击屏幕: 让 userOrbit 缓慢归零
// ============================================================
var orbit = {
  userTheta: 0.0, userPhi: 0.08, userRadius: 6.6,
  cineTheta: 0.0, cinePhi: 0.0, cineRadius: 0.0,
  theta: 0.0, phi: 0.08, radius: 6.6,
  minPhi: -Math.PI*0.45, maxPhi: Math.PI*0.45,
  minRadius: 2.4, maxRadius: 14.0,
  baselineTheta: 0.0, baselinePhi: 0.08, baselineRadius: 6.6,
  rotating: false, last:{x:0,y:0},
  recentering: false,
  centerLocked: false,
  // v8: 镜头跟拍 (hover shelf / queue 时)
  lookAt: new THREE.Vector3(0,0,0),
  focus: {
    active: false,
    type: null,        // 'shelf-side' | 'shelf-stage' | 'queue'
    theta: 0.0, phi: 0.08, radius: 6.6,
    lookAt: new THREE.Vector3(0,0,0),
  },
  glowFollowX: 0,
  glowFollowY: 0,
  glowFollowRoll: 0,
  beatGlow: 0,
};
var ZERO_VEC = new THREE.Vector3(0,0,0);
var BASE_FOV = 45;
var camPunch = 0;
var cinemaT = 0;
function defaultFreeCameraState() {
  return {
    active: false,
    locked: false,
    position: new THREE.Vector3(0, 0, 6.6),
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: BASE_FOV,
    velocity: new THREE.Vector3(),
    keys: {},
    resetTween: null
  };
}
function readFreeCameraState() {
  var state = defaultFreeCameraState();
  try {
    var raw = JSON.parse(localStorage.getItem(FREE_CAMERA_STORE_KEY) || '{}') || {};
    if (raw.position) {
      state.position.set(
        clampRange(Number(raw.position.x) || 0, -80, 80),
        clampRange(Number(raw.position.y) || 0, -80, 80),
        clampRange(Number(raw.position.z) || 6.6, -80, 80)
      );
    }
    state.yaw = clampRange(Number(raw.yaw) || 0, -Math.PI * 8, Math.PI * 8);
    state.pitch = clampRange(Number(raw.pitch) || 0, -Math.PI * 0.49, Math.PI * 0.49);
    state.roll = clampRange(Number(raw.roll) || 0, -Math.PI, Math.PI);
    state.fov = clampRange(Number(raw.fov) || BASE_FOV, 26, 72);
    state.locked = !!(raw.locked || raw.active);
    state.active = false;
  } catch (e) {}
  return state;
}
var freeCamera = readFreeCameraState();
var FREE_CAMERA_MOVE = new THREE.Vector3();
var FREE_CAMERA_TARGET_VEL = new THREE.Vector3();
var FREE_CAMERA_SHAKE_DIR = new THREE.Vector3();
var FREE_CAMERA_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
var FREE_CAMERA_RESET_MAT = new THREE.Matrix4();
var FREE_CAMERA_RESET_QUAT = new THREE.Quaternion();
var FREE_CAMERA_UP = new THREE.Vector3(0, 1, 0);
var freeCameraPointer = { seen: false, x: 0, y: 0 };
var freeCameraDeferredSaveTimer = 0;
function saveFreeCameraState() {
  if (!freeCamera) return;
  try {
    localStorage.setItem(FREE_CAMERA_STORE_KEY, JSON.stringify({
      locked: !!freeCamera.locked,
      active: !!freeCamera.active,
      position: { x: freeCamera.position.x, y: freeCamera.position.y, z: freeCamera.position.z },
      yaw: freeCamera.yaw,
      pitch: freeCamera.pitch,
      roll: freeCamera.roll,
      fov: freeCamera.fov
    }));
  } catch (e) {}
}
function scheduleFreeCameraStateSave(delay) {
  if (freeCameraDeferredSaveTimer) return;
  freeCameraDeferredSaveTimer = setTimeout(function(){
    freeCameraDeferredSaveTimer = 0;
    saveFreeCameraState();
  }, delay || 720);
}
function easeOutCubic01(t) {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}
function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
function getDefaultFreeCameraResetPose() {
  var pose = {
    position: new THREE.Vector3(0, 0, 6.6),
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: BASE_FOV
  };
  if (typeof SKULL_PRESET_INDEX !== 'undefined' && fx && fx.preset === SKULL_PRESET_INDEX && typeof setSkullCameraTargetVectors === 'function') {
    var look = new THREE.Vector3();
    var shelfComposition = typeof isSkullShelfCompositionActive === 'function' && isSkullShelfCompositionActive();
    setSkullCameraTargetVectors(pose.position, look, innerHeight > innerWidth * 1.08, shelfComposition, 0);
    FREE_CAMERA_RESET_MAT.lookAt(pose.position, look, FREE_CAMERA_UP);
    FREE_CAMERA_RESET_QUAT.setFromRotationMatrix(FREE_CAMERA_RESET_MAT);
    FREE_CAMERA_EULER.setFromQuaternion(FREE_CAMERA_RESET_QUAT, 'YXZ');
    pose.pitch = FREE_CAMERA_EULER.x;
    pose.yaw = FREE_CAMERA_EULER.y;
    pose.roll = FREE_CAMERA_EULER.z;
  }
  return pose;
}
function captureFreeCameraFromCurrent() {
  if (!freeCamera) freeCamera = defaultFreeCameraState();
  camera.updateMatrixWorld(true);
  freeCamera.position.copy(camera.position);
  FREE_CAMERA_EULER.setFromQuaternion(camera.quaternion, 'YXZ');
  freeCamera.pitch = FREE_CAMERA_EULER.x;
  freeCamera.yaw = FREE_CAMERA_EULER.y;
  freeCamera.roll = FREE_CAMERA_EULER.z;
  freeCamera.fov = clampRange(camera.fov || BASE_FOV, 26, 72);
}
function applyFreeCameraToCamera() {
  if (!freeCamera || !(freeCamera.active || freeCamera.locked)) return false;
  var cameraShake = clampRange(Number(fx.cinemaShake) || 0, 0, 1.8);
  camera.position.copy(freeCamera.position);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(
    freeCamera.pitch + beatCam.phiKick * cameraShake * 0.45,
    freeCamera.yaw + beatCam.thetaKick * cameraShake * 0.45,
    freeCamera.roll + beatCam.rollKick * cameraShake
  );
  if (cameraShake > 0 && Math.abs(beatCam.radiusKick) > 0.0001) {
    FREE_CAMERA_SHAKE_DIR.set(0, 0, -1).applyEuler(camera.rotation);
    camera.position.addScaledVector(FREE_CAMERA_SHAKE_DIR, beatCam.radiusKick * cameraShake * 0.52);
  }
  var cameraPunch = Math.max(camPunch * 0.55, beatCam.punch * 0.54 + beatCam.radiusKick * 0.16) * cameraShake;
  var targetFov = clampRange(freeCamera.fov || BASE_FOV, 26, 72) - cameraPunch * 1.75;
  camera.fov += (targetFov - camera.fov) * (targetFov < camera.fov ? 0.24 : 0.12);
  camera.updateProjectionMatrix();
  camPunch *= 0.86;
  return true;
}
function updateFreeCameraHint() {
  var el = document.getElementById('free-camera-hint');
  if (el) el.classList.toggle('show', !!(freeCamera && freeCamera.active));
}
function resetFreeCameraToDefault() {
  if (!freeCamera) return;
  if (freeCameraDeferredSaveTimer) {
    clearTimeout(freeCameraDeferredSaveTimer);
    freeCameraDeferredSaveTimer = 0;
  }
  var fromPos = freeCamera.position ? freeCamera.position.clone() : new THREE.Vector3(0, 0, 6.6);
  var resetPose = getDefaultFreeCameraResetPose();
  freeCamera.resetTween = {
    start: performance.now(),
    duration: 620,
    from: {
      position: fromPos,
      yaw: Number(freeCamera.yaw) || 0,
      pitch: Number(freeCamera.pitch) || 0,
      roll: Number(freeCamera.roll) || 0,
      fov: Number(freeCamera.fov) || BASE_FOV
    },
    to: {
      position: resetPose.position,
      yaw: resetPose.yaw,
      pitch: resetPose.pitch,
      roll: resetPose.roll,
      fov: resetPose.fov
    }
  };
  freeCamera.active = false;
  freeCamera.locked = true;
  freeCamera.keys = {};
  if (freeCamera.velocity) freeCamera.velocity.set(0, 0, 0);
  try { if (document.pointerLockElement === renderer.domElement) document.exitPointerLock(); } catch (e) {}
  updateFreeCameraHint();
  showToast('自由镜头正在平滑回正');
}
function toggleFreeCamera() {
  if (!freeCamera) freeCamera = defaultFreeCameraState();
  if (freeCamera.active) {
    freeCamera.active = false;
    freeCamera.locked = true;
    freeCamera.keys = {};
    if (freeCamera.velocity) freeCamera.velocity.set(0, 0, 0);
    try { if (document.pointerLockElement === renderer.domElement) document.exitPointerLock(); } catch (e) {}
    saveFreeCameraState();
    updateFreeCameraHint();
    showToast('自由镜头已固定');
    return;
  }
  captureFreeCameraFromCurrent();
  freeCamera.active = true;
  freeCamera.locked = true;
  freeCamera.resetTween = null;
  freeCamera.keys = {};
  freeCameraPointer.seen = false;
  if (!freeCamera.velocity) freeCamera.velocity = new THREE.Vector3();
  try { renderer.domElement.focus && renderer.domElement.focus({ preventScroll: true }); } catch (e) {
    try { renderer.domElement.focus && renderer.domElement.focus(); } catch (ignore) {}
  }
  saveFreeCameraState();
  updateFreeCameraHint();
  try {
    var lockResult = renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
    if (lockResult && lockResult.catch) lockResult.catch(function(){ freeCameraPointer.seen = false; });
  } catch (e) {
    freeCameraPointer.seen = false;
  }
  showToast('自由镜头: WASD 移动 · 鼠标转向 · K 回正');
}
renderer.domElement.addEventListener('mousedown', function(e){
  beginParticlePointerDrag(e);
});
window.addEventListener('mousedown', function(e){
  if (!(fx && fx.preset === SKULL_PRESET_INDEX)) return;
  if (orbit.rotating || e.target === renderer.domElement) return;
  beginParticlePointerDrag(e);
}, true);
window.addEventListener('mousemove', function(e){
  updateControlsAutoHideFromPointer(e.clientX, e.clientY);
  idleGuidePointerMove(e);
  if (freeCamera && freeCamera.active) {
    markRenderInteraction('free-camera', 900);
    var mdx = e.movementX || 0;
    var mdy = e.movementY || 0;
    if ((!mdx && !mdy) && freeCameraPointer.seen) {
      mdx = e.clientX - freeCameraPointer.x;
      mdy = e.clientY - freeCameraPointer.y;
    }
    freeCameraPointer.x = e.clientX;
    freeCameraPointer.y = e.clientY;
    freeCameraPointer.seen = true;
    freeCamera.yaw -= mdx * 0.00125;
    freeCamera.pitch = clampRange(freeCamera.pitch - mdy * 0.00125, -Math.PI * 0.49, Math.PI * 0.49);
    return;
  }
  if (isPointerOverUi(e) && !orbit.rotating) { mouseActive = false; return; }
  if (orbit.rotating) {
    markRenderInteraction('canvas-drag', 900);
    unlockCenteredView();
    var dx = e.clientX - orbit.last.x, dy = e.clientY - orbit.last.y;
    if (particlePointerSpin.active) {
      var nowSpin = performance.now();
      var spinDt = Math.max(1 / 120, Math.min(0.08, (nowSpin - particlePointerSpin.lastT) / 1000 || 1 / 60));
      applyParticleSpinDrag(dx, dy, spinDt);
      particlePointerSpin.lastX = e.clientX;
      particlePointerSpin.lastY = e.clientY;
      particlePointerSpin.lastT = nowSpin;
    }
    orbit.last.x = e.clientX; orbit.last.y = e.clientY;
    // drag 距离判断
    var totalDx = e.clientX - mouseDownAt.x, totalDy = e.clientY - mouseDownAt.y;
    if (Math.sqrt(totalDx*totalDx + totalDy*totalDy) > CLICK_THRESHOLD) mouseDownAt.hadDrag = true;
    if (orbit.recentering) orbit.recentering = false;
  }
  queueParticlePointerFrame(e.clientX, e.clientY);
});
window.addEventListener('mouseup', function(){
  orbit.rotating = false;
  particlePointerSpin.active = false;
  idleGuidePointerUp();
});
renderer.domElement.addEventListener('mouseleave', function(){
  particlePointerFrame.dirty = false;
  mouseWorld.set(-999, -999, 0);
  mouseActive = false;
  idleGuidePointerLeave();
});
renderer.domElement.addEventListener('wheel', function(e){
  if (isPointerOverUi(e)) return;
  e.preventDefault();
  markRenderInteraction('canvas-wheel', 900);
  if (freeCamera && freeCamera.active) {
    freeCamera.fov = clampRange((freeCamera.fov || BASE_FOV) + e.deltaY * 0.018, 26, 72);
    saveFreeCameraState();
    return;
  }
  if (fx && fx.preset === SKULL_PRESET_INDEX && typeof skullWheelZoomTarget !== 'undefined') {
    skullWheelZoomTarget = clampRange(skullWheelZoomTarget + e.deltaY * 0.00155, -0.95, 1.28);
    return;
  }
  idleGuideWheel(e);
  unlockCenteredView();
  orbit.userRadius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.userRadius + e.deltaY * 0.005));
  if (orbit.recentering) orbit.recentering = false;
}, { passive:false });

// 双击屏幕回正 — 不命中卡片时
renderer.domElement.addEventListener('dblclick', function(e){
  if (isPointerOverUi(e)) return;
  if (freeCamera && freeCamera.locked) {
    resetFreeCameraToDefault();
    resetSkullPresetView(false, { smooth:true, keepLyricLock:true });
    return;
  }
  if (shelfManager && shelfManager.getMode() !== 'off') {
    var mx = (e.clientX / innerWidth) * 2 - 1;
    var my = -(e.clientY / innerHeight) * 2 + 1;
    var rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);
    if (shelfManager.raycastCards(rc)) return;
  }
  recenterCamera();
});
renderer.domElement.addEventListener('click', function(e){
  if (!shelfManager || shelfManager.getMode() === 'off') return;
  if (document.body.classList.contains('splash-active')) return;
  if (isPointerOverUi(e)) return;
  if (mouseDownAt.hadDrag) { mouseDownAt.hadDrag = false; return; }

  var rc = raycasterFromPointerEvent(e);
  var mode = shelfManager.getMode();
  var canInteract = shelfManager.canInteract && shelfManager.canInteract();

  // 优先二级内容框
  if (shelfManager.hasOpenContent()) {
    var cl = shelfManager.getContentList && shelfManager.getContentList();
    if (cl) {
      var rowHit = cl.raycastRows(rc);
      if (!rowHit && cl.pickRowAtScreen) rowHit = cl.pickRowAtScreen(e.clientX, e.clientY);
      if (rowHit) {
        if (cl.pulseRow) cl.pulseRow(rowHit.row, 0.72);
        var selectedRow = Math.abs(rowHit.row.index - cl.getCenterIdx()) < 0.5;
        var rowIsPodcastRadio = !!(rowHit.row.song && rowHit.row.song.type === 'podcast-radio');
        var hitLikeButton = rowHit.uv && rowHit.uv.x > 0.61 && rowHit.uv.x < 0.68 && rowHit.uv.y > 0.20 && rowHit.uv.y < 0.82;
        var hitCollectButton = rowHit.uv && rowHit.uv.x >= 0.68 && rowHit.uv.x < 0.75 && rowHit.uv.y > 0.20 && rowHit.uv.y < 0.82;
        var hitNextButton = rowHit.uv && rowHit.uv.x >= 0.75 && rowHit.uv.x < 0.82 && rowHit.uv.y > 0.20 && rowHit.uv.y < 0.82;
        var hitPlayButton = rowHit.uv && rowHit.uv.x >= 0.82 && rowHit.uv.y > 0.20 && rowHit.uv.y < 0.82;
        var screenAction = (!rowHit.uv && cl.rowActionAtScreen) ? cl.rowActionAtScreen(rowHit.row, e.clientX, e.clientY) : null;
        hitLikeButton = hitLikeButton || screenAction === 'like';
        hitCollectButton = hitCollectButton || screenAction === 'collect';
        hitNextButton = hitNextButton || screenAction === 'next';
        hitPlayButton = hitPlayButton || screenAction === 'play';
        // 详情页支持直接点歌曲播放；红心/收藏按钮仍然保留原动作。
        if (selectedRow && !rowIsPodcastRadio && hitLikeButton) {
          toggleLikeDetailSong(rowHit.row.song);
        } else if (selectedRow && !rowIsPodcastRadio && hitCollectButton) {
          collectDetailSong(rowHit.row.song);
        } else if (selectedRow && !rowIsPodcastRadio && hitNextButton) {
          queueDetailSongNext(rowHit.row.song);
        } else if ((rowHit.row.song && rowHit.row.song.id) || rowIsPodcastRadio || (selectedRow && hitPlayButton)) {
          cl.playRow(rowHit.row);
        } else {
          // 滚到这行
          cl.scrollBy(rowHit.row.index - cl.getCenterIdx());
        }
        return;
      }
      var returnHit = shelfManager.raycastCards(rc);
      safeShelfCloseContent('shelf-card-return');
      if (mode === 'side') setShelfPinnedOpen(true, true);
      if (returnHit && returnHit.card) {
        shelfManager.scrollBy(returnHit.card.index - shelfManager.getCenterIdx());
      }
      return;
    }
  }

  // 一级卡片
  var hit = pointerCardHit(rc, e, mode === 'side' && !shelfPinnedOpen && shelfAlwaysVisible() ? 18 : undefined);
  if (mode === 'side' && !shelfPinnedOpen && !canUseSideShelfWithoutPinnedOpen()) return;

  if (hit) {
    if (mode === 'side') setShelfPinnedOpen(true, true);
    var idx = hit.card.index;
    if (Math.abs(idx - shelfManager.getCenterIdx()) < 0.5) {
      if (isShelfPlaylistPlayHit(hit) && shelfManager.playPlaylistAt && shelfManager.playPlaylistAt(idx)) return;
      shelfManager.openContent(idx);
    } else {
      shelfManager.scrollBy(idx - shelfManager.getCenterIdx());
    }
  } else if (mode === 'side' && shelfPinnedOpen) {
    setShelfPinnedOpen(false, true);
  }
});

renderer.domElement.addEventListener('contextmenu', function(e){
  if (document.body.classList.contains('splash-active')) return;
  if (isPointerOverUi(e)) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof suppressBottomControlsForShelf === 'function') suppressBottomControlsForShelf(980);
  if (!shelfManager) return;
  var mode = shelfManager.getMode && shelfManager.getMode();
  if (mode === 'off') {
    setShelfMode('side');
    mode = 'side';
  }
  if (mode !== 'side') return;
  if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) {
    var rc = raycasterFromPointerEvent(e);
    var cl = shelfManager.getContentList && shelfManager.getContentList();
    var rowHit = cl && cl.raycastRows ? cl.raycastRows(rc) : null;
    if (rowHit && rowHit.row && rowHit.row.song && rowHit.row.song.id && rowHit.row.song.type !== 'podcast-radio') {
      if (cl.pulseRow) cl.pulseRow(rowHit.row, 0.88);
      queueDetailSongNext(rowHit.row.song);
      return;
    }
    safeShelfCloseContent('shelf-context-toggle');
    setShelfPinnedOpen(true, true);
    return;
  }
  setShelfPinnedOpen(!shelfPinnedOpen, true);
  if (!shelfPinnedOpen && typeof setFocusZone === 'function') setFocusZone(null, true);
});

// 滚轮: 在真实卡片或右侧窄热区内滚卡片; 否则保留给封面粒子/视角
//   side 模式: 常驻不再用半屏预览区接管滚轮
//   stage 模式: 鼠标 y > 60% 屏幕高
//   shift + wheel: 强制滚卡片
var wheelOverShelf = false;
renderer.domElement.addEventListener('wheel', function(e){
  if (isPointerOverUi(e)) return;
  if (!shelfManager || shelfManager.getMode() === 'off') return;
  markRenderInteraction('shelf-wheel', 900);
  var rc = raycasterFromPointerEvent(e);
  // 二级框打开时, 只有真正命中详情行才接管滚轮
  if (shelfManager.hasOpenContent()) {
    var cl = shelfManager.getContentList();
    if (cl) {
      var rowHit = cl.raycastRows(rc);
      var panelHit = !rowHit && cl.raycastPanel ? cl.raycastPanel(rc) : null;
      var panelScreenHit = !rowHit && !panelHit && cl.screenContainsPanel ? cl.screenContainsPanel(e.clientX, e.clientY) : false;
      if (!rowHit && !panelHit && !panelScreenHit) return;
      e.preventDefault(); e.stopImmediatePropagation();
      cl.scrollBy(e.deltaY > 0 ? 1 : -1);
      return;
    }
  }
  var mode = shelfManager.getMode();
  var inShelfArea = false;
  var canScrollShelf = shelfManager.canInteract && shelfManager.canInteract();
  var shelfPreviewActive = shelfAutoHiddenInputReady();
  var cardWheelHit = canScrollShelf ? pointerCardHit(rc, e, mode === 'side' && !shelfPinnedOpen && shelfAlwaysVisible() ? 18 : undefined) : null;
  if (canScrollShelf && e.shiftKey && (mode !== 'side' || shelfPinnedOpen || shelfPreviewActive || shelfAlwaysVisible())) inShelfArea = true;
  else if (canScrollShelf && mode === 'side') {
    if (shelfPinnedOpen) inShelfArea = isShelfWheelZone(e) || !!cardWheelHit;
    else if (shelfAlwaysVisible()) inShelfArea = !!cardWheelHit;
    else if (shelfPreviewActive) inShelfArea = isShelfWheelZone(e) || !!cardWheelHit;
  }
  else if (canScrollShelf && mode === 'stage' && cardWheelHit) inShelfArea = true;
  if (inShelfArea) {
    e.preventDefault();
    e.stopImmediatePropagation();
    shelfManager.scrollBy(e.deltaY > 0 ? 1 : -1);
  }
}, { passive: false, capture: true });

// 键盘 / 全局事件
function isFreeCameraControlCode(code) {
  return /^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(code);
}
function consumeFreeCameraKeyEvent(e, isDown) {
  if (isTypingTarget(e.target)) return false;
  if (isDown && e.code === 'KeyR') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return true;
    toggleFreeCamera();
    return true;
  }
  if (!freeCamera || !freeCamera.active) return false;
  if (isDown && e.code === 'KeyK') {
    e.preventDefault();
    e.stopImmediatePropagation();
    resetFreeCameraToDefault();
    return true;
  }
  if (!isFreeCameraControlCode(e.code)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  freeCamera.keys = freeCamera.keys || {};
  freeCamera.keys[e.code] = !!isDown;
  markRenderInteraction('free-camera-key', 900);
  return true;
}
document.addEventListener('keydown', function(e){
  consumeFreeCameraKeyEvent(e, true);
}, true);
document.addEventListener('keyup', function(e){
  consumeFreeCameraKeyEvent(e, false);
}, true);
document.addEventListener('keydown', function(e){
  if (isTypingTarget(e.target)) return;
  markRenderInteraction('keyboard', 700);
  if (e.code === 'KeyK') {
    e.preventDefault();
    if (freeCamera && (freeCamera.active || freeCamera.locked)) resetFreeCameraToDefault();
    else {
      recenterCamera();
      showToast('镜头已回正');
    }
    return;
  }
  if (e.code === 'KeyR') {
    if (e.repeat) return;
    e.preventDefault();
    toggleFreeCamera();
    return;
  }
  if (freeCamera && freeCamera.active) {
    if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      freeCamera.keys[e.code] = true;
      return;
    }
  }
  if (!shelfManager) return;
  if (e.code === 'BracketRight' || e.code === 'PageDown') shelfManager.next();
  else if (e.code === 'BracketLeft' || e.code === 'PageUp') shelfManager.prev();
});
// ============================================================
//  主循环
// ============================================================
var prevTime = performance.now();
var renderPerfState = {
  mode: 'vsync',
  fps: 0,
  frames: 0,
  skipped: 0,
  longFrames: 0,
  lastRenderAt: 0,
  lastSampleAt: performance.now()
};
window.__mineradioPerf = renderPerfState;
var splashWarmRenderLast = 0;

// X0 (2026-08-18): 对齐主枝 Mineradio-2.1.0 的启动策略——不发明暖场/分帧机制，
// 直接在 splash 完全遮挡期间每 ~520ms 渲染真实场景（见 animate 的 isMainSceneCoveredBySplash 分支），
// 让星空/fx 重型 shader 的 ~2s 同步编译落在 splash 遮挡期（用户不可见）。
// 场景已在启动期经 legacy-music.js runStartupSequence 早构建，故 dismiss 时零编译。
// （历史方案 A/A-fix/D 的空暖场场景、beginSplashFrameCompile、compileSplashRealScene 已移除，
//  它们只是把同一次 2s 编译在"启动期/ready 后/dismiss 时"间挪动，属打地鼠，见 docs/PROJECT_MEMORY.md。）

// ---- #17: 播视频时暂停 Three.js 渲染（消费 player.js 广播的 sfv:render-pause 钩子）----
// 视频覆盖层在前、Three.js 画面被完全遮挡，满速渲染纯属浪费 GPU/CPU。
// 这里只设标志并早退，不修改任何 Three.js 内部对象；恢复时由 close 事件把标志复位。
var sfvRenderPaused = false;
function _onSfvRenderPause(ev) {
  var paused = !!(ev && ev.detail && ev.detail.paused);
  sfvRenderPaused = paused;
}
if (window.addEventListener) {
  window.addEventListener('sfv:render-pause', _onSfvRenderPause);
}

function isMainSceneCoveredBySplash() {
  return document.body.classList.contains('splash-active') && !document.body.classList.contains('splash-revealing');
}
function getAdaptiveRenderFps() {
  if (isDeepBackgroundMode()) return 1;
  if (RENDER_VISIBLE_VSYNC) return 0;
  var tier = (typeof getRenderLoadTier === 'function') ? getRenderLoadTier() : 0;
  if (typeof isRenderInteractionActive === 'function' && isRenderInteractionActive()) {
    if (tier >= 2) return RENDER_INTERACTION_HUGE_FPS;
    if (tier >= 1) return RENDER_INTERACTION_LARGE_FPS;
    return RENDER_INTERACTION_FPS;
  }
  if (tier >= 2) return RENDER_HUGE_FPS;
  if (tier >= 1) return RENDER_LARGE_FPS;
  return RENDER_ACTIVE_FPS;
}
function shouldSkipAdaptiveRenderFrame(now) {
  var fps = getAdaptiveRenderFps();
  renderPerfState.mode = fps ? (fps + 'fps') : 'vsync';
  if (!fps) {
    renderPerfState.lastRenderAt = now;
    return false;
  }
  var minGap = 1000 / fps;
  if (now - renderPerfState.lastRenderAt < minGap) {
    renderPerfState.skipped += 1;
    return true;
  }
  renderPerfState.lastRenderAt = now;
  return false;
}
function sampleRenderPerf(now, dt) {
  renderPerfState.frames += 1;
  if (dt > 0.034) renderPerfState.longFrames += 1;
  if (now - renderPerfState.lastSampleAt >= 1000) {
    renderPerfState.fps = Math.round(renderPerfState.frames * 1000 / Math.max(1, now - renderPerfState.lastSampleAt));
    renderPerfState.frames = 0;
    renderPerfState.lastSampleAt = now;
  }
  maybeTrimRuntimeCaches(now);
}
function animate() {
  requestAnimationFrame(animate);
  // 2.5b-regression-fix: guard against running before 08-fx-visual.js has defined uniforms.
  // The loop self-perpetuates via RAF above, so skipping one frame is harmless.
  if (typeof uniforms === 'undefined' || typeof uniforms.uTime === 'undefined') return;
  var now = performance.now();
  // === Early compile start: uniforms ready → 立即启动编译 ===
  // 利用 splash 播放期（~3s）完成编译，避免结束时卡顿
  if (!bgCompileActive && !bgCompileDone && !musicDeferredMode && scene && camera) {
    // 不等待 splash 结束，立即开始后台编译
    startBackgroundCompile();
  }
  // #17: 视频播放中 Three.js 画面被遮挡，跳过全套渲染与频谱分析，仅保持 RAF 存活以便恢复
  if (sfvRenderPaused) {
    prevTime = now; // 防止恢复时 dt 暴涨（dt 已 clamp 0.05，这里再保险一次）
    return;
  }
  // T141-rev: 仅在视频真正播放（video-player-active）时停止星空渲染并切不透明深底，
  // 解决播放态星空透出/白角闪烁；影视态 home/搜索/浏览页保持粒子运行（AGENTS.md 守则）。
  var isVideoPlaying = !!(document.body && document.body.classList.contains('video-player-active'));
  if (isVideoPlaying) {
    if (renderer) { renderer.setClearColor(0x080a10, 1); renderer.clear(); }
    prevTime = now;
    return;
  }
  if (renderer) renderer.setClearColor(0x000000, 0);
  if (shouldSkipAdaptiveRenderFrame(now)) return;
  var dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  sampleRenderPerf(now, dt);
  uniforms.uTime.value += dt;
  if (isMainSceneCoveredBySplash()) {
    // entrance-first sequencing: 等 .splash-play 后再启动编译
    if (!document.body.classList.contains('splash-play')) return;
    // splash 期间：如果编译已完成则渲染，否则只 clear 保持上下文
    if (!bgCompileDone) {
      if (now - splashWarmRenderLast > 520) {
        splashWarmRenderLast = now;
        if (_glIntercepting) {
          _gl.clearColor(0, 0, 0, 0);
          _gl.clear(_gl.COLOR_BUFFER_BIT);
        }
      }
      return; // 编译中：保持 splash 覆盖，跳过渲染
    }
    // 编译已完成：在 splash 下方预热渲染
    if (now - splashWarmRenderLast > 520) {
      splashWarmRenderLast = now;
      if (!shaderCompileDone) {
        shaderCompileDone = true;
        markAppPerf('splash-render-start');
        window.__sfvShaderCompileDone = true;
        try { window.dispatchEvent(new CustomEvent('sfv:shader-compile-done')); } catch (e) {}
      }
      renderer.render(scene, camera);
    }
    return;
  }
  pointerParallax.x += (pointerTarget.x - pointerParallax.x) * 0.040;
  pointerParallax.y += (pointerTarget.y - pointerParallax.y) * 0.040;

  // 频谱分析 — v7.1: 真正分离 kick 和人声
  // bin = sampleRate / fftSize = 44100/2048 ≈ 21.5Hz
  // kick 60-150Hz → bin 3-7 (用前 5 个 bin)
  // vocal 200-3000Hz → bin 9-140 (尽量不计入 bass/mid 的"鼓点"判断)
  // 真正的 mid 乐器/和声: 3000-6000Hz → bin 140-280
  // treble: 6000Hz+ → bin 280+
  beatOnsetFlag = false;
  if (analyser && playing && audio && !audio.paused) {
    if (audioCtx && audioCtx.state === 'suspended') resumeAudioAnalysis();
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(timeDomainData);
    var len = frequencyData.length;
    // 精确频段
    var kickEnd  = 7;                          // 60-150 Hz, 鼓 kick
    var vocalEnd = Math.min(len, 140);         // 200-3000 Hz, 人声主体
    var midEnd   = Math.min(len, 280);         // 3-6 kHz, 中高乐器
    // 累积
    var bKick = 0, mInst = 0, tHigh = 0, voc = 0, rms = 0;
    for (var i = 0; i < kickEnd; i++) bKick += frequencyData[i] / 255;
    for (var i = kickEnd; i < vocalEnd; i++) voc += frequencyData[i] / 255;
    for (var i = vocalEnd; i < midEnd; i++) mInst += frequencyData[i] / 255;
    for (var i = midEnd; i < len; i++) tHigh += frequencyData[i] / 255;
    for (var j = 0; j < timeDomainData.length; j++) {
      var tv = (timeDomainData[j] - 128) / 128;
      rms += tv * tv;
    }
    bKick /= kickEnd;
    voc /= (vocalEnd - kickEnd);
    mInst /= Math.max(1, midEnd - vocalEnd);
    tHigh /= Math.max(1, len - midEnd);
    rms = Math.sqrt(rms / timeDomainData.length);

    // 动态峰值跟踪
    bassPeak = Math.max(bassPeak * 0.994, bKick, 0.030);
    midPeak  = Math.max(midPeak  * 0.993, mInst, 0.026);
    treblePeak = Math.max(treblePeak * 0.992, tHigh, 0.018);
    energyPeak = Math.max(energyPeak * 0.995, rms, 0.030);

    var rb = Math.min(1, Math.pow(bKick / Math.max(0.038, bassPeak * 0.66), 0.78));
    var rm = Math.min(1, Math.pow(mInst / Math.max(0.025, midPeak  * 0.70), 0.86));
    var rt = Math.min(1, Math.pow(tHigh / Math.max(0.020, treblePeak * 0.74), 0.92));
    var re = Math.min(1, Math.pow(rms / Math.max(0.034, energyPeak * 0.68), 0.82));

    var bassOnset = Math.max(0, rb - smoothBass);
    var energyOnset = Math.max(0, re - prevEnergy);
    prevEnergy = prevEnergy * 0.88 + re * 0.12;

    var realtimeBeat = processRealtimeBeatEngine(dt);
    if (realtimeBeat && realtimeBeat.hit) {
      var dj = djMode.active;
      var djMapCoversCurrentTime = !dj || !currentDjBeatMap || !currentDjBeatMap.partialUntilSec || !audio || (audio.currentTime || 0) <= currentDjBeatMap.partialUntilSec - 1.25;
      var djBeatMapReadyForCamera = dj && currentDjBeatMap && currentDjBeatMap.cameraBeats && currentDjBeatMap.cameraBeats.length >= 4 && djMapCoversCurrentTime;
      var beatMapReadyForCamera = dj ? djBeatMapReadyForCamera : (currentBeatMap && currentBeatMap.cameraBeats && currentBeatMap.cameraBeats.length >= 4);
      var waitingForBeatMap = dj ? !djBeatMapReadyForCamera : (!beatMapReadyForCamera && (!!beatMapBusy || !!beatAnalysisTimer || ((audio && audio.currentTime) || 0) < 18));
      var liveKickFrame = dj
        ? (realtimeBeat.low > 0.48 && rb > 0.38 && bassOnset > 0.055 && energyOnset > 0.010 && (realtimeBeat.lowDominance || 0) > 0.82)
        : (realtimeBeat.low > 0.50 && rb > 0.42 && bassOnset > 0.070 && energyOnset > 0.016);
      var liveStrongHit = dj
        ? (realtimeBeat.confidence > 0.60 && realtimeBeat.strength > 0.56 && realtimeBeat.score > 0.50 && liveKickFrame)
        : (realtimeBeat.confidence > 0.76 && realtimeBeat.strength > 0.70 && realtimeBeat.score > 0.56 && liveKickFrame);
      var liveTempoHit = dj
        ? (realtimeBeat.tempoAssist && realtimeBeat.confidence > 0.62 && realtimeBeat.strength > 0.52 && realtimeBeat.low > 0.48 && (liveKickFrame || bassOnset > 0.046))
        : (realtimeBeat.tempoAssist && realtimeBeat.confidence > 0.80 && realtimeBeat.strength > 0.66 && realtimeBeat.low > 0.50 && bassOnset > 0.052);
      var liveFallbackOk = dj
        ? (liveStrongHit || liveTempoHit)
        : (waitingForBeatMap
          ? (liveStrongHit || liveTempoHit)
          : (realtimeBeat.confidence > 0.84 && realtimeBeat.strength > 0.80 && realtimeBeat.low > 0.54 && (liveKickFrame || realtimeBeat.score > 0.68)));
      if (!beatMapReadyForCamera && liveFallbackOk) {
        scheduleBeatCamera({
          time: realtimeBeat.time,
          strength: realtimeBeat.strength,
          confidence: realtimeBeat.confidence,
          low: realtimeBeat.low,
          body: realtimeBeat.body,
          snap: realtimeBeat.snap,
          mass: realtimeBeat.mass,
          sharpness: realtimeBeat.sharpness,
          combo: realtimeBeat.combo,
          impact: clamp01(realtimeBeat.strength * 0.46 + realtimeBeat.confidence * 0.20 + realtimeBeat.low * 0.28),
          preview: waitingForBeatMap,
          primary: true,
          dj: dj
        }, 'live');
      }
      if (!beatMapReadyForCamera && liveFallbackOk) {
        var previewPulseScale = waitingForBeatMap && !dj ? 0.68 : 1;
        var rtPulse = Math.min(dj ? 0.34 : (waitingForBeatMap ? 0.46 : 0.62), realtimeBeat.strength * (realtimeBeat.tempoAssist ? (dj ? 0.42 : 0.62) : (dj ? 0.48 : 0.68)) * previewPulseScale);
        if (rtPulse > beatPulse + 0.09) beatOnsetFlag = true;
        beatPulse = Math.max(beatPulse, rtPulse);
      }
    } else if (bassOnset > 0.075 && rb > 0.32 && energyOnset > 0.020) {
      beatPulse = Math.max(beatPulse, Math.min(0.12, bassOnset * 0.18));
    }
    beatPulse *= Math.pow(0.36, dt);

    // v7.2+: 预解析 beatmap 只在实时引擎暂时没锁住时补位.
    tickPodcastDjBeatMap();
    tickBeatMap();
    if (scheduledBeatFlag) {
      beatOnsetFlag = true;
      scheduledBeatFlag = false;
    }
    // scheduledBeatPulse 衰减并合并到 beatPulse
    if (scheduledBeatPulse > beatPulse) beatPulse = scheduledBeatPulse;
    scheduledBeatPulse *= Math.pow(0.32, dt);

    function env(prev, next, attack, release) {
      var k = next > prev ? attack : release;
      return prev + (next - prev) * k;
    }
    // smoothBass 主要由 kick 驱动 (不被人声干扰)
    smoothBass  = env(smoothBass, Math.min(0.82, rb * 0.78 + re * 0.025), 0.28, 0.075);
    // smoothMid 用 中高乐器, 不再混入人声
    smoothMid   = env(smoothMid,  Math.min(0.68, rm * 0.64 + re * 0.025), 0.18, 0.060);
    smoothTreb  = env(smoothTreb, Math.min(0.56, rt * 0.54), 0.18, 0.055);
    smoothEnergy= env(smoothEnergy, Math.min(0.72, re), 0.16, 0.055);
    updateCinemaDynamics(re, rb);
    updateCinemaTrackProfile({ energy: re, low: rb, vocal: voc, melody: rm, lowOnset: bassOnset, energyOnset: energyOnset });
    // 歌词阳光溢光: 独立于律动强度, 看持续能量 + 中高频抬升, 更像副歌/高音段落而不是单个鼓点.
    var sunEnergy = clamp01((smoothEnergy - 0.18) / 0.38);
    var sunVoice = clamp01((voc - 0.11) / 0.34);
    var sunMelody = clamp01((smoothMid - 0.16) / 0.27);
    var sunAir = clamp01((smoothTreb - 0.105) / 0.17);
    var sunRaw = clamp01(sunEnergy * 0.36 + sunVoice * 0.18 + sunMelody * 0.26 + sunAir * 0.20);
    sunRaw = sunRaw * sunRaw * (3 - 2 * sunRaw);
    lyricSunAvg += (sunRaw - lyricSunAvg) * 0.006;
    lyricSunPeak = Math.max(0.48, lyricSunPeak * 0.9985, sunRaw);
    var sunThreshold = Math.max(0.78, lyricSunAvg + 0.20, lyricSunPeak * 0.74);
    var sunGate = clamp01((sunRaw - sunThreshold) / Math.max(0.08, 1.0 - sunThreshold));
    sunGate = sunGate * sunGate * (3 - 2 * sunGate);
    lyricSunHold += (sunGate - lyricSunHold) * (sunGate > lyricSunHold ? 0.035 : 0.014);
    lyricSunTarget = lyricSunHold > 0.16 ? clamp01((lyricSunHold - 0.16) / 0.84) : 0;
    lyricSunEnergy += (lyricSunTarget - lyricSunEnergy) * (lyricSunTarget > lyricSunEnergy ? 0.075 : 0.030);
  } else {
    smoothBass *= 0.91; smoothMid *= 0.91; smoothTreb *= 0.91; smoothEnergy *= 0.91; beatPulse *= 0.82;
    liveCamAvg *= 0.94;
    liveCamPeak = Math.max(0.28, liveCamPeak * 0.98);
    liveCamLastRaw *= 0.80;
    lyricSunTarget = 0;
    lyricSunHold *= 0.90;
    lyricSunEnergy *= 0.92;
    lyricSunAvg *= 0.995;
    lyricSunPeak = Math.max(0.48, lyricSunPeak * 0.997);
  }
  audioEnergy = Math.max(smoothEnergy, beatPulse * 0.30);
  bass = Math.min(0.90, smoothBass * 1.05 + beatPulse * 0.18) * fx.intensity;
  mid  = Math.min(0.72, smoothMid * 1.12) * fx.intensity;
  treble = Math.min(0.62, smoothTreb * 1.20) * fx.intensity;
  if (fx.preset >= 4) {
    var wallpaperAudio = fx.preset === 5;
    var ringBass = smoothBass * (wallpaperAudio ? 1.10 : 1.58) + beatPulse * (wallpaperAudio ? 0.18 : 0.42) - smoothMid * 0.16 - smoothTreb * 0.06;
    var ringMid = smoothMid * (wallpaperAudio ? 1.16 : 1.82) - smoothBass * 0.14 - smoothTreb * 0.07;
    var ringTreble = smoothTreb * (wallpaperAudio ? 1.34 : 2.28) - smoothMid * 0.10 - smoothBass * 0.05;
    bass = Math.pow(clamp01((ringBass - 0.050) / 0.58), 0.72) * fx.intensity;
    mid = Math.pow(clamp01((ringMid - 0.045) / 0.46), 0.78) * fx.intensity;
    treble = Math.pow(clamp01((ringTreble - 0.030) / 0.34), 0.84) * fx.intensity;
    if (wallpaperAudio) {
      bass = Math.min(bass, 0.46 * fx.intensity);
      mid = Math.min(mid, 0.40 * fx.intensity);
      treble = Math.min(treble, 0.36 * fx.intensity);
      beatPulse *= 0.34;
    }
  }
  if (djMode.active) {
    bass = Math.min(1.00, bass * 1.06 + beatPulse * 0.085);
    mid = Math.min(0.76, mid * 1.00 + clamp01(djMode.sectionChange * 1.6) * 0.020);
    treble = Math.min(0.66, treble * 0.98);
    audioEnergy = Math.max(audioEnergy, beatPulse * 0.38, djMode.sectionEnergy * 0.54);
  }

  var vinylSpeedMul = isFinite(fx.speed) ? Math.max(0.05, fx.speed) : 1;
  var vinylSpinSpeed = (0.40 + smoothBass * 0.09) * vinylSpeedMul;
  uniforms.uVinylSpin.value = (uniforms.uVinylSpin.value + dt * vinylSpinSpeed) % (Math.PI * 2);

  updateParticlePointerFrame();
  uniforms.uBass.value   = bass;
  uniforms.uMid.value    = mid;
  uniforms.uTreble.value = treble;
  uniforms.uBeat.value   = beatPulse;
  uniforms.uEnergy.value = audioEnergy;
  uniforms.uMouseXY.value.set(mouseWorld.x, mouseWorld.y);
  uniforms.uMouseActive.value = mouseActive ? 1 : 0;
  var skullBackdropDim = fx && fx.preset === SKULL_PRESET_INDEX ? 0.58 : 1;
  var shelfDimTarget = shouldDimWallpaperForShelf() ? 0.48 : skullBackdropDim;
  var shelfDimEase = shelfDimTarget < uniforms.uParticleDim.value ? 0.18 : 0.10;
  uniforms.uParticleDim.value += (shelfDimTarget - uniforms.uParticleDim.value) * Math.min(1, shelfDimEase * Math.max(1, dt * 60));

  // 通用转场脉冲: 只作为切换预设时的短促提亮。
  uniforms.uBurstAmt.value *= 0.90;
  tickPresetTransition();

  updateRipples(dt);
  updateFloatLayer(dt);
  if (shelfManager) shelfManager.update(dt);
  tickLyricsParticles();
  updateHomeAudioVisual(dt);

  // 电影镜头
  updateCinema(dt);
  updateFreeCamera(dt);
  updateCamera();
  applySkullCameraPose(dt);

  // v7.2 旋转 = 头部+眼球追踪 + 鼠标/手势拖动 + 惯性
  tickGestureRotation(dt);
  var skullPresetActive = fx && fx.preset === SKULL_PRESET_INDEX;
  var customShapeActive = isCustomShapeRenderActive();
  particles.visible = !skullPresetActive && !customShapeActive;
  if (bloomParticles) bloomParticles.visible = !skullPresetActive && !customShapeActive && fx.bloom && fx.bloomStrength > 0.01;
  if (floatGroup) floatGroup.visible = !skullPresetActive && !customShapeActive;
  if (backCoverGroup) backCoverGroup.visible = !skullPresetActive && !customShapeActive;
  var targetRotY = orbit.centerLocked ? 0 : (headParallax.active ? headParallax.x * 0.5 : 0) + gestureRotation.y;
  var targetRotX = orbit.centerLocked ? 0 : (headParallax.active ? -headParallax.y * 0.35 : 0) + gestureRotation.x;
  particles.rotation.y += (targetRotY - particles.rotation.y) * 0.055;
  particles.rotation.x += (targetRotX - particles.rotation.x) * 0.055;
  if (bloomParticles) {
    bloomParticles.rotation.copy(particles.rotation);
  }
  // 同步给背面粒子层
  if (floatGroup) {
    floatGroup.rotation.copy(particles.rotation);
  }
  if (backCoverGroup) {
    backCoverGroup.rotation.copy(particles.rotation);
  }
  updateCustomShapeLayer(dt);
  updateSkullParticleLayer(dt);
  updateStageLyrics3D(dt);
  syncDesktopOverlayState();

  // 缩略图脉动
  if (currentIdx >= 0) {
    var s = 1 + bass * 0.08;
    var thumbCoverEl = document.getElementById('thumb-cover');
    if (thumbCoverEl) thumbCoverEl.style.transform = 'scale(' + s + ')';
  }

  tickMusicDeferredCompile();
  var _isVideoSpace = !!(document.body && document.body.classList.contains('video-space-active'));
  if (musicDeferredMode && _isVideoSpace && !musicDeferredDone) {
    // 影视态 + 音乐 shader 未编译 → 跳过 render
  } else {
    renderer.render(scene, camera);
  }
}
// 2.5b-regression-fix: defer starting the animate loop until DOMContentLoaded so
// 08-fx-visual.js (loaded after this host) has executed and defined fx/uniforms/particles.
// The loop self-perpetuates via requestAnimationFrame(animate) inside animate().
function startAnimateLoop() { requestAnimationFrame(animate); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startAnimateLoop);
} else {
  startAnimateLoop();
}

// === Space change listener for deferred compilation ===
if (window.addEventListener) {
  window.addEventListener('spacechange', function (ev) {
    var mode = (ev && ev.detail && ev.detail.spaceMode) || null;
    if (mode === 'music' && musicDeferredMode && !musicDeferredDone) {
      if (musicDeferredActive) {
        musicDeferredAccelerate = true;
        console.log('[Stellaflix] Accelerating music shader compilation (user switched to music space)');
      } else {
        startMusicDeferredCompile(true);
      }
    }
  });
}
window.__sfvMusicDeferred = {
  isDeferred: function () { return musicDeferredMode; },
  isDone: function () { return musicDeferredDone; },
  isActive: function () { return musicDeferredActive; },
  accelerate: function () {
    if (musicDeferredMode && !musicDeferredDone) {
      if (musicDeferredActive) musicDeferredAccelerate = true;
      else startMusicDeferredCompile(true);
    }
  }
};
