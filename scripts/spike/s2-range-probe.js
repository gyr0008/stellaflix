'use strict';
// S2 spike — verify the Range-serving algorithm we plan to add to server.js (Step 1 "服务端三件套").
// Runs standalone with Node, no deps. Proves that a `start-end` partial response + 206 + Content-Range
// is produced correctly BEFORE we wire it into server.js, so the local-mp4-seek contract is validated.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MIME = 'application/octet-stream';

// --- The handler we intend to wire into server.js (Step 1) ---
function serveWithRange(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { 'Content-Type': MIME, 'Content-Length': total, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); res.end(); return; }
  const hasStart = m[1] !== '';
  const hasEnd = m[2] !== '';
  let start = hasStart ? parseInt(m[1], 10) : 0;
  let end = hasEnd ? parseInt(m[2], 10) : total - 1;
  if (!hasStart && hasEnd) { // suffix form: last N bytes
    const n = parseInt(m[2], 10);
    start = Math.max(0, total - n);
    end = total - 1;
  }
  if (start > end || end >= total || start < 0) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` }); res.end(); return;
  }
  const chunk = end - start + 1;
  res.writeHead(206, {
    'Content-Type': MIME,
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunk,
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

const tmp = path.join(os.tmpdir(), `s2-${process.pid}.bin`);
const SIZE = 1000;
const content = Buffer.alloc(SIZE);
for (let i = 0; i < SIZE; i++) content[i] = i & 0xff;
fs.writeFileSync(tmp, content);

const server = http.createServer((req, res) => serveWithRange(req, res, tmp));

function request(port, rangeHeader) {
  return new Promise((resolve, reject) => {
    const opts = { host: '127.0.0.1', port, method: 'GET', path: '/' };
    if (rangeHeader) opts.headers = { Range: rangeHeader };
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    r.end();
  });
}

const tests = [
  { name: 'full (no range)', range: null, status: 200, expectLen: SIZE, expectBody: content },
  { name: 'bytes=0-99', range: 'bytes=0-99', status: 206, expectLen: 100, expectBody: content.slice(0, 100) },
  { name: 'bytes=500-', range: 'bytes=500-', status: 206, expectLen: 500, expectBody: content.slice(500) },
  { name: 'bytes=-100 (suffix)', range: 'bytes=-100', status: 206, expectLen: 100, expectBody: content.slice(SIZE - 100) },
  { name: 'bytes=200-299', range: 'bytes=200-299', status: 206, expectLen: 100, expectBody: content.slice(200, 300) },
  { name: 'out-of-range bytes=0-2000', range: 'bytes=0-2000', status: 416, expectLen: 0, expectBody: Buffer.alloc(0) },
];

server.listen(0, async () => {
  const port = server.address().port;
  let pass = 0, fail = 0;
  for (const t of tests) {
    const r = await request(port, t.range);
    let ok = r.status === t.status && r.body.length === t.expectLen;
    if (ok && t.expectLen > 0) ok = r.body.equals(t.expectBody);
    if (t.status === 206) {
      const cr = r.headers['content-range'];
      const mm = /bytes (\d+)-(\d+)\/(\d+)/.exec(cr || '');
      if (!mm || parseInt(mm[3], 10) !== SIZE) ok = false;
    }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.name}  -> status=${r.status} len=${r.body.length}${t.status === 206 ? ` content-range=${r.headers['content-range']}` : ''}`);
    ok ? pass++ : fail++;
  }
  fs.unlinkSync(tmp);
  server.close();
  console.log(`\nS2 Range algorithm: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
});
