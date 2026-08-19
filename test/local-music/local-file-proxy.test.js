'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');

// 令牌必须在 require server.js 之前写入环境(模块加载时即读取),与 desktop/main.js 注入顺序一致。
const localMusic = require('../../desktop/local-music');
process.env.STELLAFLIX_LOCAL_FILE_TOKEN = localMusic.getLocalFileToken();
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';

const TOKEN = localMusic.getLocalFileToken();

function proxyGet(port, query, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/local-file?' + query, headers: headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

function localFileQuery(token, filePath) {
  return 'token=' + encodeURIComponent(token) + '&path=' + encodeURIComponent(filePath);
}

let server = null;
let port = 0;
let insideFile = '';
let outsideFile = '';
let insideBytes = Buffer.alloc(0);

test.before(async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-localfile-'));
  const root = path.join(workDir, 'library');
  fs.mkdirSync(root, { recursive: true });
  insideBytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  insideFile = path.join(root, 'a.mp3');
  fs.writeFileSync(insideFile, insideBytes);
  outsideFile = path.join(workDir, 'outside.mp3');
  fs.writeFileSync(outsideFile, 'secret');
  localMusic.rememberLocalMusicRoot(root);

  server = require('../../server');
  server.setLocalFileAuthorizer(localMusic.resolveAuthorizedLocalFile);
  await new Promise(resolve => (server.listening ? resolve() : server.once('listening', resolve)));
  port = server.address().port;
});

test.after(async () => {
  if (server && server.listening) await new Promise(resolve => server.close(resolve));
});

test('local file proxy rejects missing, wrong token and unauthorized paths', async () => {
  assert.equal((await proxyGet(port, 'path=' + encodeURIComponent(insideFile))).status, 403);
  assert.equal((await proxyGet(port, localFileQuery('wrong-token', insideFile))).status, 403);
  assert.equal((await proxyGet(port, localFileQuery(TOKEN, outsideFile))).status, 403);
});

test('local file proxy streams authorized files with range support', async () => {
  const full = await proxyGet(port, localFileQuery(TOKEN, insideFile));
  assert.equal(full.status, 200);
  assert.ok(full.body.equals(insideBytes));
  assert.equal(full.headers['content-type'], 'audio/mpeg');
  assert.equal(full.headers['accept-ranges'], 'bytes');

  const partial = await proxyGet(port, localFileQuery(TOKEN, insideFile), { Range: 'bytes=2-5' });
  assert.equal(partial.status, 206);
  assert.ok(partial.body.equals(insideBytes.subarray(2, 6)));
  assert.equal(partial.headers['content-range'], `bytes 2-5/${insideBytes.length}`);
  assert.equal(partial.headers['content-length'], '4');

  const suffix = await proxyGet(port, localFileQuery(TOKEN, insideFile), { Range: 'bytes=-3' });
  assert.equal(suffix.status, 206);
  assert.ok(suffix.body.equals(insideBytes.subarray(-3)));

  const invalid = await proxyGet(port, localFileQuery(TOKEN, insideFile), { Range: `bytes=${insideBytes.length + 10}-` });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers['content-range'], `bytes */${insideBytes.length}`);
});

test('local file proxy reports missing authorized files as 404', async () => {
  const missingRoot = localMusic.resolveAuthorizedLocalFile(insideFile);
  const missing = path.join(path.dirname(missingRoot), 'gone.mp3');
  assert.equal((await proxyGet(port, localFileQuery(TOKEN, missing))).status, 404);
});
