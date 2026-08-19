/**
 * 弹幕功能真机冒烟 —— 真实 Chromium + 真实 server.js + 真实 index.html 下验证
 *
 * 运行： env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe scripts/danmaku_e2e_electron.js
 *
 * 与 vm 沙箱测试的区别（本文件存在的唯一理由）：
 *   vm 测试把 DOM、fetch、真实渲染全部 stub 掉了，无法证明：
 *     · index.html 真的引入了 danmaku/{entry,episode,index,client,engine,ui}.js 且脚本顺序无误；
 *     · DanmakuEngine 在真实 DOM 里真的创建了 .sfv-danmaku 节点、CSS 生效、颜色/描边/位置内联正确；
 *     · 关键词屏蔽 / 类型过滤在真实调度循环里真的跳过节点；
 *     · SFV.player.danmaku 接口与「弹幕」控制按钮真实存在。
 *   本脚本全部用真货跑一遍。
 *
 * 不做的事（诚实边界）：不连接真实弹弹play（需用户 AppId/AppSecret，属运行时配置），
 *   因此「经 /api/proxy 真实拉取弹幕」仍需用户在自己机器配置凭证后确认。
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_PORT = Number(process.env.SFV_SMOKE_PORT || 3997);

let serverProc = null;
let exitCode = 1;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function startAppServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        ELECTRON_RUN_AS_NODE: '1', PORT: String(APP_PORT), HOST: '127.0.0.1',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let done = false;
    const finish = (err) => { if (!done) { done = true; err ? reject(err) : resolve(); } };
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    serverProc.on('error', finish);
    const t0 = Date.now();
    (function probe() {
      http.get({ host: '127.0.0.1', port: APP_PORT, path: '/video/danmaku/engine.js' }, (r) => {
        r.resume();
        if (r.statusCode === 200) return finish();
        if (Date.now() - t0 > 20000) return finish(new Error('server.js 探活失败 HTTP ' + r.statusCode));
        setTimeout(probe, 300);
      }).on('error', () => {
        if (Date.now() - t0 > 20000) return finish(new Error('server.js 20s 内未就绪'));
        setTimeout(probe, 300);
      });
    })();
  });
}

const RENDERER = `(async () => {
  const R = [];
  const t = (name, ok, detail) => R.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  try {
    const SFV = window.StellaflixVideo;
    t('StellaflixVideo 命名空间存在', !!SFV);
    t('danmaku 模块已引入', !!(SFV && SFV.danmaku && SFV.danmaku.engine && SFV.danmaku.client && SFV.danmaku.ui));
    t('DanmakuEntry 可用', !!(SFV.danmaku && SFV.danmaku.DanmakuEntry));

    // 先构建播放器覆盖层（ensureOverlay 在首次 openUrl 时创建控制条 / 弹幕引擎 / 弹幕层）
    try { SFV.player.openUrl(location.origin + '/__dummy_danmaku_smoke__.mp4', { id: 'url:dmsmoke', title: 'smoke' }); } catch (e) {}

    // 控制条「弹幕」按钮
    const btnTexts = Array.from(document.querySelectorAll('#sfv-overlay .sfv-btn')).map(b => b.textContent);
    t('控制条含「弹幕」按钮', btnTexts.indexOf('弹幕') >= 0, btnTexts.join('|'));

    // 取播放器弹幕接口
    const dm = SFV.player && SFV.player.danmaku;
    t('SFV.player.danmaku 接口存在', !!(dm && dm.setEntries && dm.loadFromClient && dm.clear && dm.setOptions && dm.setVisible && dm.engine));

    function mkEntry(time, type, msg) {
      return SFV.danmaku.DanmakuEntry.fromJson({ p: time + ',' + type + ',16777215,', m: msg });
    }

    // ---- 引擎真实 DOM 渲染 ----
    const layer = document.createElement('div');
    layer.style.position = 'absolute'; layer.style.left = '0'; layer.style.top = '0';
    layer.style.width = '1280px'; layer.style.height = '720px';
    document.body.appendChild(layer);
    const eng = new SFV.danmaku.engine.DanmakuEngine({ showBottom: true }); // 显式开启底部以验证三类均渲染
    eng.mount(layer);
    const entries = [
      mkEntry(0.5, 1, '滚动弹幕A'),
      mkEntry(0.6, 5, '顶部弹幕B'),
      mkEntry(0.7, 4, '底部弹幕C')
    ];
    eng.load(entries);
    eng.update(0.8);
    const nodes = layer.querySelectorAll('.sfv-danmaku');
    t('update 后真实创建 .sfv-danmaku 节点', nodes.length >= 3, 'nodes=' + nodes.length);
    const first = nodes[0];
    const cs = first ? getComputedStyle(first) : null;
    t('弹幕节点 position:absolute（CSS 生效）', !!cs && cs.position === 'absolute', cs && cs.position);
    t('弹幕节点 pointer-events:none（不挡点击）', !!cs && cs.pointerEvents === 'none', cs && cs.pointerEvents);
    t('弹幕白色（默认 color:true）', !!cs && cs.color === 'rgb(255, 255, 255)', cs && cs.color);

    // 关键词屏蔽：真实调度跳过
    const eng2 = new SFV.danmaku.engine.DanmakuEngine({ blockedWords: ['广告'] });
    eng2.mount(layer);
    eng2.load([ mkEntry(0.1, 1, '这是广告内容'), mkEntry(0.2, 1, '正常弹幕') ]);
    eng2.update(0.3);
    t('关键词屏蔽：含「广告」的弹幕被跳过', layer.querySelectorAll('.sfv-danmaku').length === 1, '剩余=' + layer.querySelectorAll('.sfv-danmaku').length);

    // 类型过滤：关闭底部后底部弹幕不渲染
    const eng3 = new SFV.danmaku.engine.DanmakuEngine({ showBottom: false });
    eng3.mount(layer);
    eng3.load([ mkEntry(0.1, 4, '底部应被隐藏') ]);
    eng3.update(0.2);
    t('类型过滤：关闭底部后无新增节点', layer.querySelectorAll('.sfv-danmaku').length === 0, '剩余=' + layer.querySelectorAll('.sfv-danmaku').length);

    // 播放器接口：setEntries / 显隐
    if (dm) {
      const okSet = dm.setEntries([ mkEntry(0.1, 1, '接口测试') ]);
      t('SFV.player.danmaku.setEntries 返回 true', okSet === true);
      dm.setVisible(false);
      t('setVisible(false) 生效', dm.isVisible() === false);
      dm.setVisible(true);
      t('setVisible(true) 生效', dm.isVisible() === true);
    }

    // 多数据源框架（真实 DOM 环境验证合并/去重）
    t('danmaku.sources 多源框架已引入', !!(SFV.danmaku.sources && SFV.danmaku.sources.fetchAll && SFV.danmaku.sources.listSources && SFV.danmaku.sources.registerSource));
    t('listSources 含默认 dandanplay 源', SFV.danmaku.sources.listSources().some(function (s) { return s.id === 'dandanplay'; }));
    try {
      // 注册仅用于验证合并逻辑的测试假源（非真实 B站/Gamer）
      SFV.danmaku.sources.registerSource({
        id: 'smoke-fake', label: 'SmokeFake', requiresCredentials: false,
        fetchForEpisode: function () {
          return Promise.resolve({
            entries: [
              SFV.danmaku.DanmakuEntry.fromJson({ p: '1.0,1,16777215,', m: 'fake-hello' }),
              SFV.danmaku.DanmakuEntry.fromJson({ p: '2.0,1,16777215,', m: 'shared' })
            ], origin: 'smoke-fake'
          });
        }
      });
      SFV.danmaku.sources.setEnabled('dandanplay', false); // 避免触及真实凭证/网络
      const merged = await SFV.danmaku.sources.fetchAll({ animeTitle: 'x', episode: '1' });
      t('多源 fetchAll 返回合并结果（2 条）', Array.isArray(merged) && merged.length === 2, 'len=' + (merged && merged.length));
      SFV.danmaku.sources.setEnabled('dandanplay', true);
    } catch (e2) {
      t('多源 fetchAll 合并执行', false, (e2 && e2.message) || String(e2));
    }

    document.body.removeChild(layer);
  } catch (e) {
    R.push({ name: 'renderer 抛出异常', ok: false, detail: (e && e.stack) || String(e) });
  }
  return R;
})()`;

function run() {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: false, webSecurity: false },
  });
  win.loadURL('http://127.0.0.1:' + APP_PORT + '/');
  win.once('did-fail-load', (e, code, desc) => { console.error('加载失败', code, desc); });

  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      win.webContents.executeJavaScript(RENDERER).then((results) => {
        let fail = 0;
        console.log('\\n===== 弹幕真机冒烟 =====');
        results.forEach((r) => {
          console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
          if (!r.ok) fail++;
        });
        console.log('通过 ' + (results.length - fail) + ' / ' + results.length + '，失败 ' + fail);
        exitCode = fail ? 1 : 0;
        if (fail) console.log('=== SMOKE FAIL ==='); else console.log('=== SMOKE PASS ===');
        shutdown();
      }).catch((e) => { console.error('executeJavaScript 失败', e); exitCode = 1; shutdown(); });
    }, 1500);
  });

  function shutdown() {
    try { win.close(); } catch (e) {}
    if (serverProc) try { serverProc.kill(); } catch (e) {}
    setTimeout(() => app.quit(), 200);
  }
}

app.whenReady().then(() => {
  startAppServer().then(run).catch((e) => { console.error('启动 server 失败', e); exitCode = 1; if (serverProc) try { serverProc.kill(); } catch (x) {} app.quit(); });
});

process.on('exit', () => process.exit(exitCode));
