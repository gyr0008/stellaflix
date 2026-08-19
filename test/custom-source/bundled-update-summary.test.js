/**
 * 单元测试: src/music/bundled-update-summary.js 的 decideBundledUpdateToast
 * 两条轨道独立统计,互不掩盖:
 *   - 脚本分发轨道(item.ok / item.error / item.updateAvailable)
 *   - 上游信号轨道(item.upstreamSignal.available / .error)
 * 运行: node --test test/custom-source/bundled-update-summary.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const { decideBundledUpdateToast } = require('../../src/music/bundled-update-summary.js');

function item(over) {
  return Object.assign({ fileName: 'qing_haitang_resolve.js', ok: true }, over);
}

test('updatable: 脚本轨道有差异 -> 提示可更新', () => {
  const r = decideBundledUpdateToast([item({ ok: true, updateAvailable: true, remoteVersion: '1.0.1' })]);
  assert.strictEqual(r.kind, 'updatable');
  assert.strictEqual(r.text, '内置音源: 1 个有更新');
});

test('upstreamPending: 脚本无差异但上游 release 更新 -> 提示复核', () => {
  const r = decideBundledUpdateToast([item({ ok: true, upstreamSignal: { available: true, latestVersion: 'v1.3.9', basedOn: 'v1.3.8' } })]);
  assert.strictEqual(r.kind, 'upstream');
  assert.strictEqual(r.text, '内置音源: 1 个上游项目有更新,建议复核适配');
});

test('script404: 脚本拉取失败且为 404 -> 标注仓库可能未推送', () => {
  const r = decideBundledUpdateToast([item({ ok: false, error: 'HTTP_404' })]);
  assert.strictEqual(r.kind, 'failed');
  assert.match(r.text, /404: 仓库可能未推送/);
});

test('scriptNetworkError: 脚本拉取失败非 404 -> 标注网络异常', () => {
  const r = decideBundledUpdateToast([item({ ok: false, error: 'FETCH_FAILED' })]);
  assert.strictEqual(r.kind, 'failed');
  assert.match(r.text, /网络异常/);
  assert.doesNotMatch(r.text, /404/);
});

test('upstreamError: 上游信号探测报错 -> 标注信号探测失败', () => {
  const r = decideBundledUpdateToast([item({ ok: true, upstreamSignal: { available: false, error: 'RATE_LIMITED' } })]);
  assert.strictEqual(r.kind, 'failed');
  assert.match(r.text, /上游信号探测失败/);
});

test('allLatest: 脚本最新且无上游更新 -> 已是最新', () => {
  const r = decideBundledUpdateToast([item({ ok: true, updateAvailable: false })]);
  assert.strictEqual(r.kind, 'latest');
  assert.strictEqual(r.text, '内置音源已是最新');
});

test('empty/undefined results -> 已是最新(不抛错)', () => {
  assert.strictEqual(decideBundledUpdateToast(undefined).kind, 'latest');
  assert.strictEqual(decideBundledUpdateToast([]).kind, 'latest');
  assert.strictEqual(decideBundledUpdateToast([{}]).kind, 'latest'); // 无 fileName 的条目被跳过
});

test('priority: updatable 优先于 upstreamPending', () => {
  const r = decideBundledUpdateToast([item({ ok: true, updateAvailable: true, upstreamSignal: { available: true, latestVersion: 'v1.3.9' } })]);
  assert.strictEqual(r.kind, 'updatable');
});

test('combined: 脚本 404 + 上游探测失败 -> 两条失败信息用分号合并', () => {
  const r = decideBundledUpdateToast([
    item({ ok: false, error: 'HTTP_404' }),
    item({ fileName: 'x.js', ok: true, upstreamSignal: { available: false, error: 'RATE_LIMITED' } }),
  ]);
  assert.strictEqual(r.kind, 'failed');
  assert.match(r.text, /404: 仓库可能未推送/);
  assert.match(r.text, /上游信号探测失败/);
  assert.match(r.text, /; /); // 合并分隔符
});
