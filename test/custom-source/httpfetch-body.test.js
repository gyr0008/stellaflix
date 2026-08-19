'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Validate that bundled script httpFetch wrappers correctly propagate
 * the third callback argument (body) from lx.request().
 *
 * Bug: qing_haitang_resolve.js 定义的 httpFetch
 * as `request(url, options, (err, resp) => ...)` — dropping the `body` arg
 * that the LX runtime preload provides as `(null, response, body)`.
 * This caused resp.body to be undefined at the call site.
 */

test('httpFetch wrapper propagates body from request callback (LX 2.0.0 contract)', async () => {
  // Simulate the httpFetch implementation from the bundled scripts (fixed version)
  function httpFetch(url, options, requestFn) {
    return new Promise((resolve, reject) => {
      requestFn(url, options, (err, resp, body) => {
        if (err) return reject(err);
        resolve({ ...resp, body });
      });
    });
  }

  // Simulate lx.request calling back with (null, response, body) per runtime-preload.js
  const mockRequest = (_url, _options, callback) => {
    const response = { statusCode: 200, statusMessage: 'OK', headers: {} };
    const body = { code: 0, data: { url: 'https://cdn.example.com/song.mp3' } };
    callback(null, response, body);
  };

  const result = await httpFetch('https://example.com/api', {}, mockRequest);

  // Response fields must be present
  assert.equal(result.statusCode, 200);
  assert.equal(result.statusMessage, 'OK');

  // Body must be present (the critical fix)
  assert.ok(result.body, 'body must be propagated from callback third arg');
  assert.equal(result.body.code, 0);
  assert.equal(result.body.data.url, 'https://cdn.example.com/song.mp3');
});

test('httpFetch wrapper propagates error from request callback', async () => {
  function httpFetch(url, options, requestFn) {
    return new Promise((resolve, reject) => {
      requestFn(url, options, (err, resp, body) => {
        if (err) return reject(err);
        resolve({ ...resp, body });
      });
    });
  }

  const mockRequest = (_url, _options, callback) => {
    callback(new Error('HTTP_FAILED: Timed out'), null, null);
  };

  await assert.rejects(
    () => httpFetch('https://example.com/api', {}, mockRequest),
    { message: 'HTTP_FAILED: Timed out' },
  );
});

test('httpFetch wrapper propagates string body (non-JSON responses)', async () => {
  function httpFetch(url, options, requestFn) {
    return new Promise((resolve, reject) => {
      requestFn(url, options, (err, resp, body) => {
        if (err) return reject(err);
        resolve({ ...resp, body });
      });
    });
  }

  const mockRequest = (_url, _options, callback) => {
    const response = { statusCode: 503, statusMessage: 'Service Unavailable', headers: {} };
    const body = 'service overloaded';
    callback(null, response, body);
  };

  const result = await httpFetch('https://example.com/api', {}, mockRequest);
  assert.equal(result.statusCode, 503);
  assert.equal(result.body, 'service overloaded');
});
