'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function request(port, pathname, method, raw) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: raw
        ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) }
        : {},
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end(raw);
  });
}

test('resolve endpoint forwards mode and officialResult to the bridge verbatim', async t => {
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  const server = require('../../server');
  t.after(async () => {
    server.setCustomSourceBridge?.(null);
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  await new Promise(resolve => (server.listening ? resolve() : server.once('listening', resolve)));
  const port = server.address().port;

  const seen = [];
  server.setCustomSourceBridge({
    async resolve(payload) {
      seen.push(payload);
      return { attempted: true, url: '', reason: 'resolve_failed', error: 'nope' };
    },
  });

  const raw = JSON.stringify({
    song: { provider: 'netease', id: 42, name: '歌' },
    quality: 'hires',
    mode: 'custom-only',
    officialResult: { url: '', reason: 'vip_required' },
  });
  const res = await request(port, '/api/custom-source/resolve', 'POST', raw);
  assert.equal(res.status, 200);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.reason, 'resolve_failed');

  assert.equal(seen.length, 1);
  assert.equal(seen[0].mode, 'custom-only', 'mode 必须原样到达桥接层');
  assert.equal(seen[0].quality, 'hires');
  assert.equal(seen[0].officialResult.reason, 'vip_required');
  assert.equal(seen[0].song.id, 42);
});
