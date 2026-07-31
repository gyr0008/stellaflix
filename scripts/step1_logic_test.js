// Step 1 逻辑验证：在沙箱中运行 server.js 完整真实源码（stub 外部依赖、不监听端口），
// 取出 Step 1 新增函数做断言。测的是文件里真实存在的代码。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Writable } = require('stream');
const Module = require('module');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const builtins = ['fs','path','url','crypto','http','https','stream','os','util','events','dns','zlib','querystring','child_process','net','buffer','assert'];
function stubRequire(name) {
  if (builtins.includes(name)) return require(name);
  return {}; // 外部依赖（本环境无 node_modules）返回空对象桩
}

const fakeServer = { listen: () => {}, setCustomSourceBridge: () => {} };
const sandbox = {
  require: stubRequire,
  process, console, Buffer, URL, setTimeout, clearTimeout,
  http: { createServer: () => fakeServer },
};
sandbox.globalThis = sandbox;
sandbox.__dirname = path.resolve(__dirname, '..');
sandbox.module = { exports: {} };
vm.createContext(sandbox);
const augmented = SRC + '\n;globalThis.__exp = { MIME, serveStaticFile, isPrivateIPv4, isPrivateHost };';
vm.runInContext(augmented, sandbox);
const { MIME, serveStaticFile, isPrivateHost } = sandbox.__exp;

let failed = 0;
function assert(c, msg) { if (!c) { console.error('  FAIL:', msg); failed++; } else console.log('  PASS:', msg); }

// 1) SSRF 防护
assert(isPrivateHost('127.0.0.1') === true, 'loopback blocked');
assert(isPrivateHost('192.168.1.5') === true, 'private 192.168 blocked');
assert(isPrivateHost('10.0.0.1') === true, 'private 10.x blocked');
assert(isPrivateHost('169.254.169.254') === true, 'link-local blocked');
assert(isPrivateHost('localhost') === true, 'localhost blocked');
assert(isPrivateHost('8.8.8.8') === false, 'public ip allowed');
assert(isPrivateHost('example.com') === false, 'public domain allowed');

// 2) MIME 表
assert(MIME['.mp4'] === 'video/mp4', 'mp4 -> video/mp4');
assert(MIME['.m3u8'] === 'application/vnd.apple.mpegurl', 'm3u8 -> HLS mime');
assert(MIME['.vtt'] === 'text/vtt', 'vtt -> text/vtt');
assert(MIME['.ts'] === 'video/MP2T', 'ts -> video/MP2T');

// 3) serveStaticFile Range
const tmp = path.join(require('os').tmpdir(), 'stellaflix-test.mp4');
fs.writeFileSync(tmp, Buffer.alloc(1024 * 1024, 7));
function makeRes() {
  const chunks = [];
  const res = new Writable({ write(c, e, cb) { chunks.push(c); cb(); } });
  res._code = null; res._headers = null; res._chunks = chunks;
  res.writeHead = (code, headers) => { res._code = code; res._headers = headers; };
  return res;
}
function runSsf(range, cb) {
  const req = { headers: range ? { range } : {} };
  const res = makeRes();
  serveStaticFile(req, res, tmp);
  res.on('finish', () => cb(res));
}

runSsf('bytes=0-99', res => {
  assert(res._code === 206, 'range -> 206 (got ' + res._code + ')');
  assert(res._headers['Content-Range'] === 'bytes 0-99/1048576', 'Content-Range: ' + res._headers['Content-Range']);
  assert(res._headers['Content-Type'] === 'video/mp4', 'Content-Type: ' + res._headers['Content-Type']);
  assert(res._headers['Accept-Ranges'] === 'bytes', 'Accept-Ranges present');
  assert(res._chunks.reduce((a, c) => a + c.length, 0) === 100, 'body = 100 bytes');

  runSsf(null, res2 => {
    assert(res2._code === 200, 'no-range -> 200');
    assert(res2._headers['Accept-Ranges'] === 'bytes', 'no-range Accept-Ranges');
    assert(res2._chunks.reduce((a, c) => a + c.length, 0) === 1024 * 1024, 'full body = 1MB');
    fs.unlinkSync(tmp);
    console.log(failed === 0 ? '\n=== ALL PASS ===' : `\n=== ${failed} FAILED ===`);
    process.exit(failed === 0 ? 0 : 1);
  });
});
