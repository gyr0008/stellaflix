/*
 * Step 5 — 真机在线闭环验收（#18）
 *
 * 目的：把「在线播放能用」从信念变成事实。
 *       用你提供的真实 CMS10 源地址，跑通：搜索 → 详情 → 取播放地址 → 经 /api/proxy 真拉流。
 *
 * 这不是单元测试：它真的去打外网 CMS + 本地 /api/proxy，验证整条数据链路能出数据。
 * 视频「解码出画面」仍需真实浏览器/GUI，但本脚本已能证明：源可达、地址可解析、代理能取回分片。
 *
 * 用法（在你的机器上，且已 npm start 把服务端跑起来后）：
 *   CMS_URL="https://你的CMS地址/INDEX.php?m=movie" node scripts/step5_realsource_test.js
 *
 * 依赖：Node 18+（自带 global fetch）。无需 Electron 图形界面即可跑代理链路。
 */
'use strict';

const CMS_URL = process.env.CMS_URL || '';
const KEYWORD = process.env.CMS_KW || '测试';
const PROXY_BASE = (process.env.PROXY_BASE || 'http://127.0.0.1:3000') + '/api/proxy';

if (!CMS_URL) {
  console.error('❌ 缺少 CMS_URL。请这样运行：');
  console.error('   CMS_URL="https://你的CMS地址/INDEX.php?m=movie" node scripts/step5_realsource_test.js');
  process.exit(2);
}

function join(base, params) {
  const sep = base.includes('?') ? '&' : '?';
  return base + sep + params;
}

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 StellaflixProbe/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    try { return { ok: true, data: JSON.parse(txt), raw: txt }; }
    catch (e) { return { ok: false, reason: '响应不是 JSON（可能是 V8 XML 或 HTML 错误页）', raw: txt.slice(0, 200) }; }
  } finally { clearTimeout(t); }
}

// 从 vod_play_url 取第一集第一播放地址（兼容 appleCMS V10 的 $$$ / # / $ 结构）
function extractFirstPlayUrl(s) {
  if (!s) return null;
  const src = String(s).split('$$$')[0];      // 第一个播放源
  const firstEp = src.split('#')[0];           // 第一集
  const parts = firstEp.split('$');
  const url = parts[parts.length - 1];
  return /^https?:\/\//.test(url) ? url : null;
}

// 按 URL 规范解析 HLS 引用（m3u8 内相对路径）：绝对 / 域名相对(/) / 目录相对
function resolveHlsRef(base, ref) {
  if (/^https?:\/\//i.test(ref)) return ref;            // 绝对地址
  if (ref.charAt(0) === '/') {                          // 域名相对（/path）
    try { const u = new URL(base); return u.origin + ref; } catch (e) { return base + ref; }
  }
  return base.slice(0, base.lastIndexOf('/') + 1) + ref; // 目录相对
}

(async () => {
  let pass = 0, fail = 0;
  const log = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? '  ✅ ' : '  ❌ ') + msg); };

  console.log('=== Step 5 真机在线闭环验收 ===');
  console.log('CMS_URL = ' + CMS_URL);
  console.log('PROXY    = ' + PROXY_BASE + '\n');

  // ---- 1) 搜索 ----
  console.log('[1] 搜索关键词「' + KEYWORD + '」');
  let res = await getJson(join(CMS_URL, 'ac=list&wd=' + encodeURIComponent(KEYWORD)));
  if (!res.ok) {
    // 退回 V8/V10 兼容写法
    console.log('  第一次尝试非 JSON，改用 ac=videolist&at=json 重试…');
    res = await getJson(join(CMS_URL, 'ac=videolist&at=json&wd=' + encodeURIComponent(KEYWORD)));
  }
  if (!res.ok) {
    log(false, '搜索接口未返回 JSON：' + res.reason);
    console.log('  原始响应前 200 字：' + res.raw);
    process.exit(1);
  }
  const list = (res.data && (res.data.list || res.data.data)) || [];
  log(list.length > 0, '搜索返回 ' + list.length + ' 条结果');
  if (list.length === 0) {
    console.log('  完整响应：' + JSON.stringify(res.data).slice(0, 400));
    process.exit(1);
  }
  const first = list[0];
  console.log('   首条 → id=' + first.vod_id + '  name=' + first.vod_name);
  console.log('   vod_play_url 原始片段：' + String(first.vod_play_url || '').slice(0, 160));

  // ---- 2) 详情 ----
  console.log('\n[2] 拉取详情（ac=detail）');
  const dres = await getJson(join(CMS_URL, 'ac=detail&ids=' + encodeURIComponent(first.vod_id)));
  if (!dres.ok) { log(false, '详情接口未返回 JSON'); process.exit(1); }
  const dlist = (dres.data && (dres.data.list || dres.data.data)) || [];
  log(dlist.length > 0, '详情返回 ' + dlist.length + ' 条');
  const detail = dlist[0] || first;
  const playUrl = extractFirstPlayUrl(detail.vod_play_url);
  log(!!playUrl, '解析到首集播放地址：' + (playUrl || '(未解析到)'));
  if (!playUrl) {
    console.log('   vod_play_url 原始值：' + String(detail.vod_play_url || '').slice(0, 300));
    process.exit(1);
  }

  // ---- 3) 经 /api/proxy 拉流（验证代理链路）----
  console.log('\n[3] 经 /api/proxy 拉取播放地址（验证 SSRF/Range 透传）');
  const proxied = PROXY_BASE + '?url=' + encodeURIComponent(playUrl);
  let pStatus = 0, pType = '', pLen = 0, pBodyFirst = '';
  try {
    const pr = await fetch(proxied, { headers: { Range: 'bytes=0-1023' } });
    pStatus = pr.status; pType = pr.headers.get('content-type') || '';
    const buf = Buffer.from(await pr.arrayBuffer());
    pLen = buf.length; pBodyFirst = buf.slice(0, 64).toString('utf8').replace(/\s+/g, ' ');
  } catch (e) {
    console.log('   ⚠️  /api/proxy 未响应（请确认已 npm start 把服务端跑起来）：' + e.message);
  }
  log(pStatus === 200 || pStatus === 206, '代理返回 ' + pStatus + '（' + pType + '，' + pLen + ' 字节）');
  console.log('   响应首部内容：' + pBodyFirst.slice(0, 80));

  // ---- 4) 若是 m3u8，下钻到首个分片 ----
  if (/\.m3u8/i.test(playUrl) && (pStatus === 200 || pStatus === 206)) {
    console.log('\n[4] m3u8 清单已取到，尝试解析首个分片并代理拉取');
    let m3u8Text = Buffer.from(await (await fetch(proxied)).arrayBuffer()).toString('utf8');
    let mediaBase = playUrl;          // 当前播放列表的 base（用于解析相对引用）
    // 主播放列表（含 #EXT-X-STREAM-INF）→ 下钻到第一个子播放列表
    if (/#EXT-X-STREAM-INF/i.test(m3u8Text)) {
      console.log('   检测到主播放列表(master)，下钻到首个码率子列表…');
      const lines = m3u8Text.split('\n').map(s => s.trim());
      let variant = null;
      for (let i = 0; i < lines.length; i++) {
        if (/#EXT-X-STREAM-INF/i.test(lines[i]) && lines[i + 1]) { variant = lines[i + 1]; break; }
      }
      if (variant) {
        const absVariant = resolveHlsRef(mediaBase, variant);
        console.log('   子列表地址：' + absVariant);
        const vres = await fetch(PROXY_BASE + '?url=' + encodeURIComponent(absVariant));
        m3u8Text = Buffer.from(await vres.arrayBuffer()).toString('utf8');
        mediaBase = absVariant;
      }
    }
    // 媒体播放列表：首个 #EXTINF 之后的非空行即首分片
    const lines = m3u8Text.split('\n').map(s => s.trim());
    let segLine = null;
    for (let i = 0; i < lines.length; i++) {
      if (/^#EXTINF/i.test(lines[i]) && lines[i + 1]) { segLine = lines[i + 1]; break; }
    }
    if (!segLine) segLine = lines.find(l => l && !l.startsWith('#')); // 兜底
    if (segLine) {
      console.log('   清单内首个分片(原始)：' + segLine);
      const absSeg = resolveHlsRef(mediaBase, segLine);
      console.log('   解析为绝对地址：' + absSeg);
      const segProxy = PROXY_BASE + '?url=' + encodeURIComponent(absSeg);
      try {
        const tr = await fetch(segProxy, { headers: { Range: 'bytes=0-2047' } });
        const body = Buffer.from(await tr.arrayBuffer());
        const magic = body.slice(0, 4).toString('hex');
        log(tr.status === 200 || tr.status === 206, '分片代理返回 ' + tr.status + '，' + body.length + ' 字节（magic=' + magic + '）');
      } catch (e) { log(false, '分片代理失败：' + e.message); }
    } else {
      console.log('   （清单内未找到分片行，可能是纯 m3u8 嵌套或多码率，属正常）');
    }
  }

  console.log('\n=== Step 5 真机验收: ' + pass + ' pass / ' + fail + ' fail ===');
  console.log(fail ? '⚠️ 有失败项：检查上方红色项，多半是 CMS 地址/版本(V8 vs V10)或网络问题。' :
                    '🎉 数据流打通：CMS 可达、地址可解析、/api/proxy 能取回流/分片。剩下的「解码出画面」交给 GUI 点一遍确认。');
  process.exit(fail ? 1 : 0);
})();
