/**
 * Kazumi E2E — 渲染进程侧断言脚本（由 kazumi_e2e_electron.js 注入真实产品页执行）
 *
 * 运行环境：真实 Chromium 渲染进程，页面为真实 public/index.html，
 * 由真实 server.js 托管；网络请求经真实 /api/proxy 转发到本地夹具站
 * （夹具域名用 localtest.me，解析到 127.0.0.1，可绕过代理的私网 IP 拦截，
 *  从而在不修改任何产品代码的前提下打通完整链路）。
 *
 * 本脚本验证的是 vm 沙箱测试无法覆盖的部分：
 *   - 真实 DOMParser / document.evaluate（vm 里这两个是 mock 的）
 *   - 真实 fetch → 真实 /api/proxy → 真实 HTTP 往返
 *   - 真实产品页里 7 个 script 是否确实加载并暴露全局
 *   - 真实 DOM 渲染的规则管理面板
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

  // 等待真实播放：video 达到 readyState>=3（HAVE_FUTURE_DATA）/ currentTime 推进 / 'playing' 事件。
  // 这是「视频真的被解码播放」而非「仅拿到 URL」的硬证据。
  function waitForPlayback(timeout) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      function getVid() {
        try { return (SFV.player && SFV.player.getVideoEl) ? SFV.player.getVideoEl() : null; }
        catch (e) { return null; }
      }
      var v0 = getVid();
      if (v0) v0.addEventListener('playing', function () { finish(true); });
      var t0 = Date.now();
      (function tick() {
        if (done) return;
        var v = getVid();
        if (v) {
          if (v.readyState >= 3) return finish(true);
          if (v.currentTime && v.currentTime > 0.3) return finish(true);
        }
        if (Date.now() - t0 > timeout) return finish(false);
        setTimeout(tick, 300);
      })();
    });
  }

  var FIXTURE_BASE = 'http://localtest.me:4001/';
  var RULE_NAME = 'E2E本地夹具';
  var PROBE_NAME = 'E2E绝对XPath探针';

  // ---------------------------------------------------- A. 全局是否真的加载
  ok(!!window.KazumiRuleSchema, 'A1 全局 KazumiRuleSchema 已加载');
  ok(!!window.KazumiUrlUtils, 'A2 全局 KazumiUrlUtils 已加载');
  ok(!!window.KazumiHttpClient, 'A3 全局 KazumiHttpClient 已加载');
  ok(!!window.KazumiXPathEngine, 'A4 全局 KazumiXPathEngine 已加载');
  ok(!!window.KazumiRuleEngine, 'A5 全局 KazumiRuleEngine 已加载');
  ok(!!(window.Kazumi && window.Kazumi.createRuleManager), 'A6 全局 Kazumi.createRuleManager 可用');

  var SFV = window.StellaflixVideo;
  if (!ok(!!SFV, 'A7 window.StellaflixVideo 存在')) return out;
  if (!ok(!!SFV.kazumi, 'A8 SFV.kazumi 桥接层已挂载')) return out;
  ok(typeof SFV.online === 'object' && typeof SFV.online.openRules === 'function',
    'A9 SFV.online.openRules 已导出（规则面板入口）');

  // 确认 XPath 引擎跑在真实浏览器 API 上（而非 vm mock）
  ok(typeof window.DOMParser === 'function', 'A10 真实 DOMParser 可用');
  ok(typeof document.evaluate === 'function', 'A11 真实 document.evaluate 可用');
  ok(typeof window.XPathResult === 'function' || typeof window.XPathResult === 'object',
    'A12 真实 XPathResult 可用');

  // ---------------------------------------------------- B. 清理 + 导入规则
  try {
    localStorage.removeItem('kazumi-rules');
    localStorage.removeItem('stellaflix-video-kazumi-enabled');
    SFV.kazumi.getManager().load(); // 把内存态与已清空的存储重新对齐
  } catch (e) {
    ok(false, 'B0 清理 localStorage 失败', String(e && e.message));
    return out;
  }
  ok(SFV.kazumi.listRules().length === 0, 'B1 初始状态无任何规则（合规：出厂不预置）',
    SFV.kazumi.listRules().length);
  ok(SFV.kazumi.hasRules() === false, 'B2 hasRules() 初始为 false');

  var rule = {
    api: '4', type: 'anime', name: RULE_NAME, version: '1.0',
    baseURL: FIXTURE_BASE,
    searchURL: FIXTURE_BASE + 'search?wd=@keyword',
    searchList: "//div[@class='item']",
    searchName: ".//span[@class='title']",
    searchResult: './/a',
    chapterRoads: "//div[@class='road']",
    chapterResult: './/a'
  };

  var added;
  try { added = SFV.kazumi.importRule(rule); }
  catch (e) { ok(false, 'B3 导入规则抛异常', String(e && e.message)); return out; }
  ok(Array.isArray(added) && added.length === 1 && added[0] === RULE_NAME, 'B3 导入返回规则名', added);

  var listed = SFV.kazumi.listRules();
  ok(listed.length === 1, 'B4 规则列表长度为 1', listed.length);
  ok(listed[0] && listed[0].valid === true, 'B5 规则通过 schema 校验', listed[0] && listed[0].errors);
  ok(listed[0] && listed[0].enabled === true, 'B6 规则默认启用');
  ok(listed[0] && listed[0].searchMode === 'xpath', 'B7 规则被识别为 xpath 模式', listed[0] && listed[0].searchMode);

  // 验证规则确实落盘到 localStorage（刷新后可恢复）
  var persisted = null;
  try { persisted = JSON.parse(localStorage.getItem('kazumi-rules') || 'null'); } catch (e) {}
  ok(Array.isArray(persisted) && persisted.length === 1 && persisted[0].name === RULE_NAME,
    'B8 规则已持久化到 localStorage[kazumi-rules]', persisted);

  // ---------------------------------------------------- C. 真实搜索（真 fetch → 真 /api/proxy → 真夹具站）
  var sres;
  try { sres = await SFV.kazumi.search('测试'); }
  catch (e) { ok(false, 'C0 search() 抛异常', String(e && e.message)); return out; }

  ok(sres && Array.isArray(sres.items), 'C1 search 返回 items 数组');
  ok(sres.errors && sres.errors.length === 0, 'C2 搜索无错误', sres.errors);
  ok(sres.items.length === 2, 'C3 真实 XPath 解析出 2 条结果', sres.items.length);

  if (sres.items.length >= 2) {
    var i0 = sres.items[0], i1 = sres.items[1];
    ok(i0.title === '测试剧集甲', 'C4 第 1 条标题由真实 XPath 提取正确', i0.title);
    ok(i1.title === '测试剧集乙', 'C5 第 2 条标题由真实 XPath 提取正确', i1.title);
    ok(i0.isKazumi === true, 'C6 结果带 isKazumi 标记（供网格分流）');
    ok(i0.src === '/detail/1', 'C7 第 1 条 src 为原始 href', i0.src);
    ok(i1.src === '/detail/2', 'C8 第 2 条 src 为原始 href（相对 XPath 未串位）', i1.src);
    ok(i0.sourceName === RULE_NAME, 'C9 结果携带来源规则名', i0.sourceName);
    ok(i0.key !== i1.key, 'C10 两条结果 key 不重复');
    ok(Array.isArray(i0.variants) && i0.variants.length === 1 && i0.variants[0].isKazumi === true,
      'C11 variants 结构符合网格契约');
  }

  // ---------------------------------------------------- D. 真实章节解析
  var chap;
  try { chap = await SFV.kazumi.getChapters(RULE_NAME, '/detail/1'); }
  catch (e) { ok(false, 'D0 getChapters() 抛异常', String(e && e.message)); }

  if (chap) {
    ok(Array.isArray(chap.plays), 'D1 返回 plays 数组');
    ok(chap.plays.length === 2, 'D2 解析出 2 条播放线路', chap.plays.length);
    if (chap.plays.length >= 2) {
      var r0 = chap.plays[0], r1 = chap.plays[1];
      ok(r0.episodes.length === 3, 'D3 线路 1 有 3 集', r0.episodes.length);
      ok(r1.episodes.length === 2, 'D4 线路 2 有 2 集', r1.episodes.length);
      ok(r0.episodes[0].name === '第1集', 'D5 剧集名由真实 XPath 提取', r0.episodes[0].name);
      ok(r0.episodes[0].url === FIXTURE_BASE + 'play/1-1',
        'D6 剧集 URL 已归一化为绝对地址且端口未重复', r0.episodes[0].url);
      ok(r0.episodes[0].url.indexOf(':4001:4001') === -1,
        'D7 非默认端口未被重复拼接（端口 bug 回归防线）', r0.episodes[0].url);
      ok(r0.episodes[2].index === 2, 'D8 剧集 index 递增正确', r0.episodes[2].index);
      ok(typeof r0.from === 'string' && r0.from.length > 0, 'D9 线路名非空', r0.from);
    }
  }

  // ---------------------------------------------------- E. 启用/禁用真实生效
  SFV.kazumi.setEnabled(RULE_NAME, false);
  ok(SFV.kazumi.isEnabled(RULE_NAME) === false, 'E1 禁用后 isEnabled 为 false');
  var sOff = await SFV.kazumi.search('测试');
  ok(sOff.items.length === 0, 'E2 禁用后搜索不返回结果', sOff.items.length);
  ok(SFV.kazumi.listRules().length === 1, 'E3 禁用不等于删除，规则仍在列表');

  SFV.kazumi.setEnabled(RULE_NAME, true);
  var sOn = await SFV.kazumi.search('测试');
  ok(sOn.items.length === 2, 'E4 重新启用后搜索恢复', sOn.items.length);

  // ---------------------------------------------------- F. 上游规则写法兼容性探针（关键）
  // Kazumi 上游规则（如 7sefun.json）大量使用 "//a" 这种以 // 开头的写法。
  // Dart 端 node.queryXPath('//a') 是「相对当前节点」；
  // 浏览器 document.evaluate('//a', contextNode) 里 // 锚定的是「文档根」。
  // 若语义不同，上游规则直接导入会串位 —— 此处用真实浏览器实测，不做推断。
  var probeRule = {
    api: '4', type: 'anime', name: PROBE_NAME, version: '1.0',
    baseURL: FIXTURE_BASE,
    searchURL: FIXTURE_BASE + 'search?wd=@keyword',
    searchList: "//div[@class='item']",
    searchName: ".//span[@class='title']",
    searchResult: '//a',                    // 上游常见写法
    chapterRoads: "//div[@class='road']",
    chapterResult: '//a'
  };
  SFV.kazumi.importRule(probeRule);
  SFV.kazumi.setEnabled(RULE_NAME, false); // 只跑探针规则
  var probe = await SFV.kazumi.search('测试');
  SFV.kazumi.setEnabled(RULE_NAME, true);

  var probeSrcs = (probe.items || []).map(function (x) { return x.src; });
  info('F 探针：searchResult="//a" 实测得到 src = ' + JSON.stringify(probeSrcs));
  ok(probeSrcs.length === 2, 'F1 上游写法 "//a" 仍解析出 2 条结果', probeSrcs);
  ok(probeSrcs[0] === '/detail/1' && probeSrcs[1] === '/detail/2',
    'F2 上游写法 "//a" 按节点相对求值，各条目取到各自链接（不串位）', probeSrcs);
  out.probeSrcs = probeSrcs;

  // 章节侧同样验证上游写法
  var probeChap = null;
  try { probeChap = await SFV.kazumi.getChapters(PROBE_NAME, '/detail/1'); } catch (e) {}
  if (probeChap) {
    ok(probeChap.plays.length === 2, 'F3 上游写法 "//a" 解析出 2 条线路', probeChap.plays.length);
    ok(probeChap.plays[0].episodes.length === 3 && probeChap.plays[1].episodes.length === 2,
      'F4 各线路只包含自己的剧集（未把整页链接混入）',
      probeChap.plays.map(function (p) { return p.episodes.length; }));
  } else {
    ok(false, 'F3 上游写法章节解析失败');
  }

  // ---------------------------------------------------- G. 真实 DOM：规则管理面板
  try {
    SFV.online.openRules();
    await new Promise(function (r) { setTimeout(r, 300); });
    var names = Array.prototype.map.call(
      document.querySelectorAll('.sfv-rules-item-name'),
      function (n) { return n.textContent; }
    );
    ok(names.length === 2, 'G1 规则面板渲染出 2 条规则', names);
    ok(names.indexOf(RULE_NAME) !== -1, 'G2 面板显示夹具规则名', names);
    var toggles = document.querySelectorAll('.sfv-rules-item-acts .sfv-rules-btn');
    ok(toggles.length >= 2, 'G3 每条规则渲染出操作按钮', toggles.length);
    var ta = document.querySelector('.sfv-rules-textarea');
    ok(!!ta, 'G4 导入 textarea 已渲染');
    var title = document.querySelector('.sfv-online-title, .sfv-title');
    if (title) info('G 面板标题实得: ' + title.textContent);
  } catch (e) {
    ok(false, 'G0 打开规则面板抛异常', String(e && e.message));
  }

  // ---------------------------------------------------- H. 删除 + 清理
  SFV.kazumi.removeRule(PROBE_NAME);
  SFV.kazumi.removeRule(RULE_NAME);
  ok(SFV.kazumi.listRules().length === 0, 'H1 删除后规则列表清空', SFV.kazumi.listRules().length);
  var after = localStorage.getItem('kazumi-rules');
  ok(after === '[]' || after === null, 'H2 localStorage 同步清空', after);

  try {
    localStorage.removeItem('kazumi-rules');
    localStorage.removeItem('stellaflix-video-kazumi-enabled');
  } catch (e) {}

  // ---------------------------------------------------- I. 真实视频流播放（端到端真货）
  // 目标：验证 playEpisode 真实路径能把一个「可解码」的 HLS 流真正播起来，而非只拿到 URL。
  // 用公共 CORS 友好的 mux 测试流；hls.js 直连 CDN（与产品默认路径一致）。
  // 离线/不可达时优雅跳过，绝不假绿（不计入失败）。
  var REAL_M3U8 = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  try {
    var reach = false;
    try { reach = await fetch(REAL_M3U8, { method: 'HEAD' }).then(function (r) { return !!r.ok; }); }
    catch (e) { reach = false; }
    if (!reach) {
      info('I0 离线/真实流不可达，跳过「真实视频流播放」验证（不计入失败）');
    } else {
      var playId = 'kazumi:E2E真实流:0';
      var opened = false;
      try {
        // 与 online.js playEpisode(view, ep) 完全相同的生产入口签名
        opened = SFV.source.open({ url: REAL_M3U8, title: 'E2E真实HLS流', id: playId });
      } catch (e) {
        ok(false, 'I1 SFV.source.open 抛异常', String(e && e.message));
      }
      ok(opened !== false, 'I1 SFV.source.open 成功下发播放（覆盖层已显示）', opened);
      var played = await waitForPlayback(20000);
      ok(played === true, 'I2 真实 HLS 流已解码播放（readyState>=3 / currentTime>0 / playing 事件）', played);
      try { if (SFV.player && SFV.player.close) SFV.player.close(); } catch (e) {}
    }
  } catch (e) {
    ok(false, 'I0 真实流播放段异常', String(e && e.message));
  }

  return out;
})()
