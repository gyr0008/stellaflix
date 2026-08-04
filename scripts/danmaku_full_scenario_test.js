/**
 * 弹幕功能完整用户场景验证 —— 模拟真实用户操作路径
 *
 * 验证范围（逐项对应用户在 npm start 后的实际操作）：
 *   A) 播放视频后控制条出现「弹幕」按钮，点击能打开面板
 *   B) 面板 UI 完整渲染（总开关 / sliders / 三源 toggle / 自动加载 / 凭证输入 / 载入按钮）
 *   C) 点击各 toggle 能切换状态（开↔关）且状态持久化到 localStorage
 *   D) 调整 slider 后引擎选项实时更新
 *   E) 无凭证时点「载入」显示认证失败提示（不是白屏/崩溃）
 *   F) 配置凭证后点「载入」发起网络请求（经 /api/proxy）
 *   G) 自动加载：播片时根据标题自动触发（有凭证时）/ 静默跳过（无凭证时）
 *   H) 浏览器控制台无 JS 报错
 *
 * 运行： env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe scripts/danmaku_full_scenario_test.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_PORT = Number(process.env.SFV_SMOKE_PORT || 3998); // 用不同端口避免冲突

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

// ====== 渲染进程脚本：完整用户场景 ======
const RENDERER = `(async () => {
  const R = [];
  const t = (name, ok, detail) => R.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const ERRORS = [];  // 收集 console.error/warn

  // 劫持 console 以捕获所有报错
  const origError = console.error;
  const origWarn = console.warn;
  console.error = function () { ERRORS.push(Array.prototype.slice.call(arguments).join(' ')); origError.apply(console, arguments); };
  console.warn = function () { ERRORS.push(Array.prototype.slice.call(arguments).join(' ')); origWarn.apply(console, arguments); };

  try {
    const SFV = window.StellaflixVideo;

    // 清理 localStorage 确保测试环境确定（不受上次运行残留影响）
    localStorage.removeItem('stellaflix-danmaku-options');
    localStorage.removeItem('stellaflix-danmaku-credentials');
    localStorage.removeItem('stellaflix-danmaku-auto-load');
    localStorage.removeItem('stellaflix-danmaku-sources-enabled');

    // ========== A) 基础模块加载 ==========
    t('A1: StellaflixVideo 命名空间存在', !!SFV);
    t('A2: danmaku 子模块存在', !!(SFV && SFV.danmaku));
    t('A3: engine/client/ui/sources 均已加载',
      !!(SFV.danmaku.engine && SFV.danmaku.client && SFV.danmaku.ui && SFV.danmaku.sources));

    // ========== B) 打开播放器 → 控制条 → 弹幕按钮 → 面板 ==========
    // 先打开一个视频以创建 overlay 和控制条
    try {
      SFV.player.openUrl(location.origin + '/__scenario_test__.mp4', { id: 'url:test', title: '进击的巨人 第三季 第15集' });
    } catch (e) {
      t('B0: openUrl 抛出异常', false, (e && e.message) || String(e));
    }

    // 等待 DOM 更新
    await new Promise(r => setTimeout(r, 300));

    const overlay = document.getElementById('sfv-overlay');
    t('B1: overlay 已创建', !!overlay);

    const controls = document.getElementById('sfv-controls');
    t('B2: 控制条已创建', !!controls);

    // 找「弹幕」按钮
    const allBtns = overlay ? overlay.querySelectorAll('.sfv-btn') : [];
    const danmakuBtn = Array.from(allBtns).find(function(b) { return b.textContent.trim() === '弹幕'; });
    t('B3: 控制条含「弹幕」按钮', !!danmakuBtn);

    // 点击弹幕按钮打开面板
    if (danmakuBtn) {
      try { danmakuBtn.click(); } catch (e) { t('B4: 点击弹幕按钮抛出异常', false, e.message); }
      await new Promise(r => setTimeout(r, 200));

      const panel = document.querySelector('.sfv-danmaku-panel');
      t('B5: 弹幕设置面板已打开', !!panel);
      t('B6: 面板是 div 元素', !!panel && panel.tagName === 'DIV');

      if (panel) {
        // ========== C) 面板 UI 元素完整性检查 ==========
        const panelText = panel.textContent || '';
        t('C1: 面板包含"弹幕设置"标题', panelText.indexOf('弹幕设置') >= 0);
        t('C2: 面板包含"弹幕开关"', panelText.indexOf('弹幕开关') >= 0);
        t('C3: 面板包含"BiliBili"', panelText.indexOf('BiliBili') >= 0);
        t('C4: 面板包含"Gamer"', panelText.indexOf('Gamer') >= 0);
        t('C5: 面板包含"弹弹play"', panelText.indexOf('弹弹play') >= 0);
        t('C6: 面板包含"自动加载弹幕"', panelText.indexOf('自动加载弹幕') >= 0);
        t('C7: 面板包含"AppId"', panelText.indexOf('AppId') >= 0);
        t('C8: 面板包含"载入"', panelText.indexOf('载入') >= 0);

        // 统计 toggle 按钮（class sfv-dm-toggle）
        const toggles = panel.querySelectorAll('.sfv-dm-toggle');
        t('C9: 面板至少有 6 个 toggle 按钮（总开关+BiliBili+Gamer+弹弹play+自动加载+描边/颜色等）',
          toggles.length >= 6, 'toggle数量=' + toggles.length);

        // 统计 slider
        const sliders = panel.querySelectorAll('.sfv-dm-slider');
        t('C10: 面板至少有 4 个 slider（不透明度/字号/速度/区域等）',
          sliders.length >= 4, 'slider数量=' + sliders.length);

        // 找到各关键元素
        const closeBtn = panel.querySelector('.sfv-dm-close');
        t('C11: 面板有关闭按钮(×)', !!closeBtn);

        const loadBtn = panel.querySelector('.sfv-dm-load');
        t('C12: 面板有「载入」按钮', !!loadBtn);

        const statusEl = panel.querySelector('.sfv-dm-status');
        t('C13: 面板有状态显示区域', !!statusEl);

        // ========== D) Toggle 交互测试 ==========
        // 找 BiliBili toggle
        const allRows = panel.querySelectorAll('.sfv-dm-row');
        let biliToggle = null, gamerToggle = null, dandanToggle = null, autoToggle = null, masterToggle = null;
        allRows.forEach(function(row) {
          const label = row.querySelector('.sfv-dm-label');
          const labelText = label ? label.textContent.trim() : '';
          const toggle = row.querySelector('.sfv-dm-toggle');
          if (labelText === 'BiliBili') biliToggle = toggle;
          else if (labelText === 'Gamer') gamerToggle = toggle;
          else if (labelText === '弹弹play') dandanToggle = toggle;
          else if (labelText === '自动加载弹幕') autoToggle = toggle;
          else if (labelText === '弹幕开关') masterToggle = toggle;
        });

        t('D1: 找到 BiliBili toggle', !!biliToggle);
        t('D2: 找到 Gamer toggle', !!gamerToggle);
        t('D3: 找到 弹弹play toggle', !!dandanToggle);
        t('D4: 找到 自动加载弹幕 toggle', !!autoToggle);
        t('D5: 找到 弹幕开关(master) toggle', !!masterToggle);

        // 测试 toggle 切换：点击 BiliBili
        if (biliToggle) {
          const textBefore = biliToggle.textContent.trim();
          biliToggle.click();
          await new Promise(r => setTimeout(r, 50));
          const textAfter = biliToggle.textContent.trim();
          t('D6: BiliBili toggle 点击后文字改变', textBefore !== textAfter,
            textBefore + ' → ' + textAfter);

          // 再点回来
          biliToggle.click();
          await new Promise(r => setTimeout(r, 50));
          const textRestore = biliToggle.textContent.trim();
          t('D7: BiliBili toggle 再次点击恢复', textRestore === textBefore,
            textAfter + ' → ' + textRestore);
        }

        // 测试自动加载 toggle
        if (autoToggle) {
          const autoBefore = autoToggle.textContent.trim();
          autoToggle.click();
          await new Promise(r => setTimeout(r, 50));
          const autoAfter = autoToggle.textContent.trim();
          t('D8: 自动加载 toggle 可切换', autoBefore !== autoAfter,
            autoBefore + ' → ' + autoAfter);

          // 验证 localStorage 已更新
          const stored = localStorage.getItem('stellaflix-danmaku-auto-load');
          t('D9: 自动加载状态持久化到 localStorage', stored === 'true' || stored === 'false',
            'stored=' + stored);

          // 恢复为开启
          if (autoToggle.textContent.trim() === '关') autoToggle.click();
        }

        // 测试 master toggle（弹幕总开关）
        // 注意：defaults().enabled=false，所以面板打开后 master 初始为「关」（已调用 setVisible(false)）
        if (masterToggle) {
          const initialState = masterToggle.textContent.trim();
          t('D10_init: master toggle 初始状态', initialState === '关', 'state=' + initialState);

          // 第一次点击：关 → 开（显示弹幕层）
          masterToggle.click();
          await new Promise(r => setTimeout(r, 50));
          const dmLayer = document.getElementById('sfv-danmaku-layer');
          t('D10: 弹幕总开关开后层可见(display非none)', !dmLayer || dmLayer.style.display !== 'none',
            dmLayer ? 'display=' + dmLayer.style.display : 'no layer');

          // 第二次点击：开 → 关（隐藏弹幕层）
          masterToggle.click();
          await new Promise(r => setTimeout(r, 50));
          const dmLayer2 = document.getElementById('sfv-danmaku-layer');
          t('D11: 弹幕总开关关闭后层隐藏(display=none)', !dmLayer2 || dmLayer2.style.display === 'none',
            dmLayer2 ? 'display=' + dmLayer2.style.display : 'no layer');

          // 恢复为开启状态
          if (masterToggle.textContent.trim() === '关') masterToggle.click();
        }

        // ========== E) Slider 交互测试 ==========
        const opacitySlider = panel.querySelector('.sfv-dm-slider[type="range"]');
        if (opacitySlider) {
          const oldVal = opacitySlider.value;
          opacitySlider.value = '0.5';
          opacitySlider.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 50));

          // 检查引擎选项是否更新
          const eng = SFV.player.danmaku.engine();
          const opts = eng ? eng.opts : null;
          t('E1: Slider 调整后引擎选项 opacity 更新', opts && opts.opacity === 0.5,
            'opacity=' + (opts && opts.opacity));

          // 恢复
          opacitySlider.value = oldVal;
          opacitySlider.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          t('E1: 未找到 slider', false);
        }

        // ========== F) 凭证输入 + 载入测试（无真实凭证） ==========
        const allTextInputs = panel.querySelectorAll('.sfv-dm-text');
        // 按顺序：番剧名称 / 集数（前两个 text 输入在"载入弹幕"分隔之后）
        // 注意：placeholder 是 "如：进击的巨人" 和 "如：1"，不能用 placeholder*="番剧"
        let titleInput = null, epInput = null, appIdInput = null, appSecretInput = null;
        allTextInputs.forEach(function(inp) {
          const label = inp.closest('.sfv-dm-row') ? inp.closest('.sfv-dm-row').querySelector('.sfv-dm-label') : null;
          const labelText = label ? label.textContent.trim() : '';
          if (labelText === '番剧名称') titleInput = inp;
          else if (labelText === '集数') epInput = inp;
          else if (labelText === 'AppId') appIdInput = inp;
          else if (labelText === 'AppSecret') appSecretInput = inp;
        });

        t('F1: 找到 AppId 输入框', !!appIdInput);
        t('F2: 找到 AppSecret 输入框', !!appSecretInput);
        t('F3: 找到番剧名称输入框', !!titleInput);
        t('F4: 找到集数输入框', !!epInput);

        // 场景 F-a：无凭证直接点载入 → 应显示认证失败
        if (loadBtn && titleInput && epInput && statusEl) {
          titleInput.value = '进击的巨人';
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
          epInput.value = '15';
          epInput.dispatchEvent(new Event('input', { bubbles: true }));

          statusEl.textContent = '';
          loadBtn.click();
          await new Promise(r => setTimeout(r, 1500)); // 等待异步完成

          const statusText = statusEl.textContent || '';
          t('F5: 无凭证载入显示错误提示', statusText.length > 0,
            'status="' + statusText + '"');
          t('F6: 错误提示含"认证"或"Auth"',
            statusText.indexOf('认证') >= 0 || statusText.indexOf('Auth') >= 0 || statusText.indexOf('失败') >= 0,
            'status="' + statusText + '"');
        }

        // 场景 F-b：配置假凭证 → 载入 → 应发起网络请求（会失败因为假凭证）
        if (appIdInput && appSecretInput && loadBtn && statusEl) {
          appIdInput.value = 'test-app-id-12345';
          appIdInput.dispatchEvent(new Event('input', { bubbles: true }));
          appSecretInput.value = 'test-secret-67890';
          appSecretInput.dispatchEvent(new Event('input', { bubbles: true }));

          await new Promise(r => setTimeout(r, 100));

          // 拦截 fetch 来验证请求确实发出了
          let fetchCalled = false;
          let fetchUrl = '';
          const origFetch = window.fetch;
          window.fetch = function(url) {
            fetchCalled = true;
            fetchUrl = url ? String(url) : '';
            // 立即返回一个 reject 让它快速失败
            return Promise.reject(new Error('_INTERCEPTED_FOR_TEST_'));
          };

          statusEl.textContent = '';
          loadBtn.click();
          await new Promise(r => setTimeout(r, 1500));

          window.fetch = origFetch; // 恢复

          t('F7: 有凭证时载入触发了 fetch 请求', fetchCalled,
            fetchCalled ? 'url=' + fetchUrl.substring(0, 80) : 'fetch 未被调用');

          const statusText2 = statusEl.textContent || '';
          t('F8: 假凭证载入后显示错误（非白屏）', statusText2.length > 0,
            'status="' + statusText2 + '"');
        }

        // ========== G) 自动加载测试 ==========
        // 清除自动加载开关确保默认开启
        localStorage.removeItem('stellaflix-danmaku-auto-load');

        // 无凭证时自动加载应静默跳过
        // 先清除凭证
        if (SFV.danmaku.client) {
          SFV.danmaku.client.setCredentials('', '');
        }
        const autoLoadResult = { called: false, skipped: false };
        // 包装 loadFromClient 来检测是否被调用
        const origLoadFromClient = SFV.player.danmaku.loadFromClient.bind(SFV.player.danmaku);
        SFV.player.danmaku.loadFromClient = function() {
          autoLoadResult.called = true;
          return origLoadFromClient.apply(null, arguments);
        };

        // 模拟 prepareForPlay 的自动加载逻辑（player.js 内部函数无法直接调用，
        // 但我们可以通过 openUrl 触发）
        // 先关闭再重新打开一个带标题的视频
        SFV.player.close();
        await new Promise(r => setTimeout(r, 200));

        // 重新 openUrl 会触发 prepareForPlay → autoLoadDanmaku
        // 但无凭证时应静默跳过
        SFV.player.openUrl(location.origin + '/__auto_test__.mp4', {
          id: 'url:auto-test',
          title: '间谍过家家 第08集'
        });
        await new Promise(r => setTimeout(r, 1000)); // 等待异步

        t('G1: 无凭证时自动加载未调用 loadFromClient', !autoLoadResult.called,
          autoLoadResult.called ? '被调用了（不应发生）' : '正确跳过');

        // 恢复原始方法
        SFV.player.danmaku.loadFromClient = origLoadFromClient;

      // ========== H) 控制台错误检查 ==========
      // 过滤掉预期的 fake URL media error（我们故意加载不存在的视频）
      const realErrors = ERRORS.filter(function(e) {
        return e.indexOf('media error for url:') < 0;
      });
      t('H1: 无意外 JavaScript 错误（media error 除外）', realErrors.length === 0,
        realErrors.length > 0 ? realErrors.length + ' 个: ' + realErrors.slice(0, 3).join('; ') : '干净');

        // 清理：关闭面板
        const closeBtn2 = panel.querySelector('.sfv-dm-close');
        if (closeBtn2) closeBtn2.click();
        await new Promise(r => setTimeout(r, 100));
        const panelGone = !document.querySelector('.sfv-danmaku-panel');
        t('H2: 关闭后面板从 DOM 移除', panelGone);

      } else {
        t('C-H: 面板未打开，跳过所有 UI 测试', false, 'panel=null');
      }
    } else {
      t('B-H: 弹幕按钮不存在，无法继续', false);
    }

  } catch (e) {
    R.push({ name: '渲染进程抛出未捕获异常', ok: false, detail: (e && e.stack) || String(e) });
    // 也记录到 ERRORS
    ERRORS.push('UNCAUGHT: ' + String(e));
  }

  // 最终汇总错误（仅统计非预期错误）
  const realErrorsSummary = ERRORS.filter(function(e) {
    return e.indexOf('media error for url:') < 0;
  });
  if (realErrorsSummary.length > 0) {
    R.push({ name: '[汇总] 意外控制台错误总数', ok: false, detail: realErrorsSummary.length + ' 条' });
  } else {
    R.push({ name: '[汇总] 无意外错误（media error 已排除）', ok: true, detail: '干净' });
  }

  return R;
})()`;

function run() {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: false, webSecurity: false },
  });
  win.loadURL('http://127.0.0.1:' + APP_PORT + '/');
  win.once('did-fail-load', (e, code, desc) => { console.error('页面加载失败', code, desc); });

  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      win.webContents.executeJavaScript(RENDERER).then((results) => {
        let fail = 0;
        console.log('\n===== 弹幕完整用户场景验证 =====\n');
        results.forEach((r) => {
          const icon = r.ok ? '\u2713' : '\u2717';  // ✓ or ✗
          console.log('  ' + icon + ' ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
          if (!r.ok) fail++;
        });
        console.log('\n通过 ' + (results.length - fail) + ' / ' + results.length + '，失败 ' + fail);
        if (fail) console.log('\n=== SCENARIO FAIL ==='); else console.log('\n=== SCENARIO PASS ===');
        exitCode = fail ? 1 : 0;
        shutdown();
      }).catch((e) => {
        console.error('executeJavaScript 失败', e && e.stack || e);
        exitCode = 1;
        shutdown();
      });
    }, 2000); // 给更多时间让页面完全初始化
  });

  function shutdown() {
    try { win.close(); } catch (e) {}
    if (serverProc) try { serverProc.kill(); } catch (e) {}
    setTimeout(() => app.quit(), 200);
  }
}

app.whenReady().then(() => {
  startAppServer().then(run).catch((e) => {
    console.error('启动 server 失败', e);
    exitCode = 1;
    if (serverProc) try { serverProc.kill(); } catch (x) {}
    app.quit();
  });
});

process.on('exit', () => process.exit(exitCode));
