/*
 * 影视 SR 纯层单测（Node vm 沙箱，无真实 WebGL/DOM）。
 * 覆盖：sr-hook-adapter（解析/RPN/GLSL 生成/校验）· sr-engine.containRect ·
 *       sr-presets（档位表/降档链/资产存在性）+ 全部 vendor GLSL 的解析集成。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GLSL_DIR = path.join(ROOT, 'public', 'vendor', 'sr', 'glsl');
const HOOKS_OK = ['MAIN', 'PREKERNEL', 'LUMA'];

function newCtx() {
  const ctx = {
    StellaflixVideo: {},
    Promise, Math, JSON, console,
    setTimeout, clearTimeout, Date,
    performance: { now: () => Date.now() },
    fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve('//!HOOK MAIN\nvec4 hook(){return vec4(0);}') }),
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1
  };
  ctx.window = ctx;
  ctx.document = {
    addEventListener() {}, removeEventListener() {},
    createElement() { return { getContext: () => null }; },
    getElementById() { return null; }
  };
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.requestAnimationFrame = () => 0;
  ctx.cancelAnimationFrame = () => {};
  vm.createContext(ctx);
  return ctx;
}
function load(ctx, rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
}
function loadAll() {
  const ctx = newCtx();
  load(ctx, 'public/video/sr/sr-hook-adapter.js');
  load(ctx, 'public/video/sr/sr-engine-core.js');
  load(ctx, 'public/video/sr/sr-engine.js');
  load(ctx, 'public/video/sr/sr-presets.js');
  return ctx;
}
function readGlsl(name) { return fs.readFileSync(path.join(GLSL_DIR, name), 'utf8'); }
function parseFile(ctx, name) { return ctx.StellaflixVideo.srHook.parseShader(readGlsl(name)); }
// vm 内对象与宿主原型不同，deepEqual 前先 JSON 规整
function plain(x) { return JSON.parse(JSON.stringify(x)); }

// ---- sr-hook-adapter：vendor 文件解析 ----
test('parseShader：vendor 各文件 pass 数与结构', () => {
  const ctx = loadAll();
  const h = ctx.StellaflixVideo.srHook;
  const cases = [
    ['Anime4K_AutoDownscalePre_x2.glsl', 1],
    ['Anime4K_AutoDownscalePre_x4.glsl', 1],
    ['Anime4K_Clamp_Highlights.glsl', 3],
    ['Anime4K_Restore_CNN_M.glsl', 8],
    ['Anime4K_Upscale_CNN_x2_M.glsl', 9],
    ['Anime4K_Upscale_CNN_x2_S.glsl', 5],
    ['Anime4K_Upscale_Denoise_CNN_x2_M.glsl', 9],
    ['Anime4K_Upscale_Denoise_CNN_x2_S.glsl', 5],
    ['FSRCNNX_x2_8-0-4-1.glsl', 14]
  ];
  for (const [name, n] of cases) {
    const passes = parseFile(ctx, name);
    assert.equal(passes.length, n, name + ' pass 数');
    for (const p of passes) {
      assert.ok(p.hook, name + ' 每个pass有HOOK');
      assert.ok(p.body.join('\n').includes('vec4 hook()'), name + ' body 含 hook()');
    }
  }
  // 关键语义抽查
  const pre = parseFile(ctx, 'Anime4K_AutoDownscalePre_x2.glsl')[0];
  assert.equal(pre.save, '');                       // 无 SAVE → 运行期默认写回钩子纹理
  assert.ok(pre.when.includes('OUTPUT.w NATIVE.w / 2.0 <'));
  assert.deepEqual(plain(pre.binds), ['HOOKED', 'NATIVE']);
  const clampPasses = parseFile(ctx, 'Anime4K_Clamp_Highlights.glsl');
  assert.equal(clampPasses[2].hook, 'PREKERNEL');   // mpv 内部钩子点，引擎映射为当前 MAIN
  assert.equal(clampPasses[0].save, 'STATSMAX');
  const fsrcnnx = parseFile(ctx, 'FSRCNNX_x2_8-0-4-1.glsl');
  assert.equal(fsrcnnx[0].hook, 'LUMA');
  const last = fsrcnnx[fsrcnnx.length - 1];
  assert.equal(last.save, '');                      // 末 pass 无 SAVE → 写回 LUMA（2×）
  assert.equal(last.width, 'LUMA.w 2 *');
});

// ---- sr-hook-adapter：RPN 求值 ----
test('evalRPN：mpv RPN 表达式语义', () => {
  const ctx = loadAll();
  const ev = ctx.StellaflixVideo.srHook.evalRPN;
  const sizes = { MAIN: { w: 960, h: 540 }, NATIVE: { w: 960, h: 540 }, OUTPUT: { w: 1920, h: 1080 }, LUMA: { w: 960, h: 540 } };
  const sizeOf = (n) => sizes[n] || null;
  assert.equal(ev('1 2 +', sizeOf), 3);
  assert.equal(ev('MAIN.w 2 *', sizeOf), 1920);
  assert.equal(ev('OUTPUT.w MAIN.w / 1.200 >', sizeOf), 1);
  assert.equal(ev('OUTPUT.w MAIN.w / 2.0 <', sizeOf), 0);          // 2.0 < 2.0 为假
  // AutoDownscalePre_x2 完整 WHEN：1.2~2 倍窗口
  const when2 = 'OUTPUT.w NATIVE.w / 2.0 < OUTPUT.h NATIVE.h / 2.0 < * OUTPUT.w NATIVE.w / 1.2 > OUTPUT.h NATIVE.h / 1.2 > * *';
  assert.equal(ev(when2, sizeOf), 0);                               // 2 倍整：不在窗口内
  const s15 = { MAIN: { w: 960, h: 540 }, NATIVE: { w: 960, h: 540 }, OUTPUT: { w: 1440, h: 810 }, LUMA: { w: 960, h: 540 } };
  assert.equal(ev(when2, (n) => s15[n] || null), 1);                // 1.5 倍：命中
  // FSRCNNX WHEN：>1.3 倍才启用
  const whenF = 'OUTPUT.w LUMA.w / 1.300 > OUTPUT.h LUMA.h / 1.300 > *';
  assert.equal(ev(whenF, sizeOf), 1);
  const noGrow = { LUMA: { w: 960, h: 540 }, OUTPUT: { w: 1000, h: 562 } };
  assert.equal(ev(whenF, (n) => noGrow[n] || null), 0);
  // 失败路径
  assert.equal(ev('FOO.w', sizeOf), null);
  assert.equal(ev('', sizeOf), null);
  assert.equal(ev('bogus 1 +', sizeOf), null);
});

// ---- sr-hook-adapter：GLSL 生成与校验 ----
test('buildFragment：uniform/宏/别名/main 包装', () => {
  const ctx = loadAll();
  const h = ctx.StellaflixVideo.srHook;
  const p = h.parseShader('//!HOOK MAIN\n//!BIND HOOKED\nvec4 hook(){ return HOOKED_tex(HOOKED_pos) + MAIN_texOff(vec2(1)); }');
  const src = h.buildFragment(p, ['MAIN', 'NATIVE'], { HOOKED: 'MAIN' });
  assert.ok(src.startsWith('#version 300 es'));
  assert.ok(src.includes('uniform sampler2D MAIN;'));
  assert.ok(src.includes('uniform vec2 MAIN_size;'));
  assert.ok(src.includes('#define HOOKED_tex(pos) texture(MAIN, (pos))'));
  assert.ok(src.includes('#define HOOKED_texOff(off) texture(MAIN, v_uv + MAIN_pt * vec2(off))'));
  assert.ok(src.trimEnd().endsWith('void main() { fragColor = hook(); }'));
  assert.ok(!src.includes('uniform sampler2D HOOKED;'), '别名不重复声明 sampler');
});

test('validatePasses：引用完整性校验', () => {
  const ctx = loadAll();
  const h = ctx.StellaflixVideo.srHook;
  // 全部 vendor 文件通过
  for (const name of fs.readdirSync(GLSL_DIR)) {
    const errs = h.validatePasses(h.parseShader(readGlsl(name)), HOOKS_OK);
    assert.deepEqual(plain(errs), [], name + ' 校验');
  }
  // 合成反例：BIND 未定义纹理
  const bad = h.parseShader('//!HOOK MAIN\n//!BIND not_saved_yet\nvec4 hook(){ return vec4(0); }');
  assert.ok(h.validatePasses(bad, HOOKS_OK).length >= 1);
  // SAVE 后可 BIND
  const good = h.parseShader('//!HOOK MAIN\n//!SAVE tmp\nvec4 hook(){ return vec4(0); }\n//!HOOK MAIN\n//!BIND tmp\nvec4 hook(){ return vec4(1); }');
  assert.deepEqual(plain(h.validatePasses(good, HOOKS_OK)), []);
});

// ---- sr-engine：contain 矩阵几何 ----
test('containRect：object-fit:contain 像素几何', () => {
  const ctx = loadAll();
  const cr = ctx.StellaflixVideo.srEngine.containRect;
  assert.deepEqual(plain(cr(1920, 1080, 1920, 1080)), { x: 0, y: 0, w: 1920, h: 1080 });
  assert.deepEqual(plain(cr(1920, 1080, 1280, 720)), { x: 0, y: 0, w: 1920, h: 1080 });
  const pillar = cr(1920, 1200, 1600, 900);   // 画布比视频更"高" → 左右留黑
  assert.equal(pillar.w, 1920);
  assert.equal(pillar.h, Math.round(900 * 1.2));
  assert.equal(pillar.y, Math.floor((1200 - pillar.h) / 2));
  const letter = cr(1000, 1000, 1600, 900);   // 画布更"宽" → 上下留黑
  assert.equal(letter.w, 1000);
  assert.equal(letter.h, Math.round(900 * 0.625));
  assert.equal(letter.x, 0);
  // 非整数缩放也保持居中
  const mid = cr(1001, 999, 1600, 900);
  assert.ok(mid.x >= 0 && mid.y >= 0 && mid.w <= 1001 && mid.h <= 999);
});

// ---- sr-presets：档位表 / 降档链 / 资产 ----
test('srPresets：6 档定义与 tier 序', () => {
  const ctx = loadAll();
  const P = ctx.StellaflixVideo.srPresets;
  assert.equal(P.LIST.length, 6);
  assert.deepEqual(plain(P.LIST.map((d) => d.id)), ['off', 'fsrcnnx', 'live', 'anime-fast', 'anime-hq', 'anime-4k']);
  const tiers = P.LIST.map((d) => d.tier);
  assert.deepEqual(plain(tiers), plain([...tiers].sort((a, b) => a - b)), 'tier 单调不减');
  assert.equal(new Set(tiers).size, 6, 'tier 唯一');
  // 模式正确性
  assert.equal(P.byId('fsrcnnx').mode, 'luma');
  assert.equal(P.byId('live').mode, 'luma');
  assert.ok(P.byId('live').refine);
  for (const id of ['anime-fast', 'anime-hq', 'anime-4k']) assert.equal(P.byId(id).mode, 'rgb');
  // 双倍档链 = 质量档链 + 三件套（官方 Mode A Fast 完整链）
  const hqFiles = P.byId('anime-hq').files;
  const k4Files = P.byId('anime-4k').files;
  assert.deepEqual(plain(k4Files.slice(0, hqFiles.length)), plain(hqFiles));
  assert.deepEqual(plain(k4Files.slice(hqFiles.length)), ['Anime4K_AutoDownscalePre_x2.glsl', 'Anime4K_AutoDownscalePre_x4.glsl', 'Anime4K_Upscale_CNN_x2_S.glsl']);
});

test('srPresets：降档链逐级递减至 off', () => {
  const ctx = loadAll();
  const P = ctx.StellaflixVideo.srPresets;
  assert.equal(P.degrade('off'), null);
  assert.equal(P.degrade('anime-4k'), 'anime-hq');
  assert.equal(P.degrade('anime-hq'), 'anime-fast');
  assert.equal(P.degrade('anime-fast'), 'live');
  assert.equal(P.degrade('live'), 'fsrcnnx');
  assert.equal(P.degrade('fsrcnnx'), 'off');
});

test('srPresets：所有档位引用的 GLSL 资产都在磁盘上', () => {
  const ctx = loadAll();
  const P = ctx.StellaflixVideo.srPresets;
  const all = new Set();
  P.LIST.forEach((d) => d.files.forEach((f) => all.add(f)));
  assert.ok(all.size >= 7);
  for (const f of all) assert.ok(fs.existsSync(path.join(GLSL_DIR, f)), f + ' 存在');
});

// ---- 幂等守卫 ----
test('模块幂等：重复加载不覆盖命名空间', () => {
  const ctx = loadAll();
  const first = ctx.StellaflixVideo.srHook;
  load(ctx, 'public/video/sr/sr-hook-adapter.js');
  assert.equal(ctx.StellaflixVideo.srHook, first);
});
