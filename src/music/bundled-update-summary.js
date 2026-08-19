/**
 * 纯函数: 根据 checkBundledUpdates 返回的 results 决定"检查更新"提示文案。
 * 不依赖 DOM / Electron,可在 Node 下直接单测。
 *
 * 两条轨道独立统计,互不掩盖:
 *   - 脚本分发轨道(item.ok / item.error): 远端脚本能否拉到、与本地有无差异
 *   - 上游信号轨道(item.upstreamSignal): QingMusic 有无比 basedOn 更新的 release
 */
function decideBundledUpdateToast(results) {
  var updatable = 0;       // 脚本轨道: 远端版本与本地不同 -> 可更新
  var scriptFailed = 0;    // 脚本轨道: 拉取失败(网络 / 404 / 解析)
  var script404 = 0;       // 其中 404(通常仓库未推送 / 路径错)
  var upstreamPending = 0; // 上游信号: QingMusic 有比 basedOn 更新的 release
  var upstreamError = 0;   // 上游信号: 探测本身报错(网络 / 限流)
  (results || []).forEach(function (item) {
    if (!item || !item.fileName) return;
    if (item.ok && item.updateAvailable) updatable += 1;
    if (!item.ok) {
      scriptFailed += 1;
      if (/404/.test(String(item.error || ''))) script404 += 1;
    }
    var us = item.upstreamSignal;
    if (us && us.available) upstreamPending += 1;
    if (us && us.error) upstreamError += 1;
  });
  if (updatable) {
    return { kind: 'updatable', text: '内置音源: ' + updatable + ' 个有更新' };
  }
  if (upstreamPending) {
    return { kind: 'upstream', text: '内置音源: ' + upstreamPending + ' 个上游项目有更新,建议复核适配' };
  }
  if (scriptFailed || upstreamError) {
    var msgs = [];
    if (scriptFailed) {
      msgs.push(scriptFailed + ' 个音源脚本拉取失败' + (script404 ? '(404: 仓库可能未推送)' : '(网络异常)'));
    }
    if (upstreamError) {
      msgs.push(upstreamError + ' 个上游信号探测失败');
    }
    return { kind: 'failed', text: '内置音源: ' + msgs.join('; ') };
  }
  return { kind: 'latest', text: '内置音源已是最新' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decideBundledUpdateToast: decideBundledUpdateToast };
}
// 浏览器侧(经典 <script> 经 esbuild transform 模式,无 require):挂到 window 供 legacy-music.js 调用,
// 与仓库 SFV.xxxCore 全局注入模式一致。
if (typeof window !== 'undefined') {
  window.StellaflixBundledSummary = { decideBundledUpdateToast: decideBundledUpdateToast };
}
