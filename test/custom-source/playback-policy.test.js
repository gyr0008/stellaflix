const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldAttemptCustomSource, isCustomFirstMode } = require('../../desktop/custom-source/playback-policy');

test('never calls a custom source when official playback succeeded or the feature is disabled', () => {
  assert.equal(shouldAttemptCustomSource({ enabled: true, officialResult: { url: 'https://audio.example/a.mp3' } }), false);
  assert.equal(shouldAttemptCustomSource({ enabled: false, officialResult: { reason: 'url_unavailable' } }), false);
});

test('does not use third-party fallback for account or rights restrictions', () => {
  for (const reason of [
    'login_required',
    'vip_required',
    'paid_required',
    'trial_only',
    'copyright_unavailable',
    'credentials_required',
  ]) {
    assert.equal(shouldAttemptCustomSource({ enabled: true, officialResult: { url: '', reason } }), false, reason);
    assert.equal(shouldAttemptCustomSource({
      enabled: true,
      officialResult: { url: '', restriction: { category: reason } },
    }), false, `restriction:${reason}`);
  }
});

test('allows fallback only for technical playback failures', () => {
  for (const reason of ['url_unavailable', 'network_error', 'request_failed', 'format_unsupported', 'http_error']) {
    assert.equal(shouldAttemptCustomSource({ enabled: true, officialResult: { url: '', reason } }), true, reason);
  }
  assert.equal(shouldAttemptCustomSource({ enabled: true, officialResult: { url: '', error: 'socket hang up' } }), true);
  assert.equal(shouldAttemptCustomSource({ enabled: true, officialResult: { url: '', reason: 'unknown_business_rule' } }), false);
});

test('custom-first modes make third-party resolution the primary path', () => {
  assert.equal(isCustomFirstMode('custom-first'), true);
  assert.equal(isCustomFirstMode('custom-only'), true);
  assert.equal(isCustomFirstMode('official-first'), false);
  assert.equal(isCustomFirstMode(''), false);
  for (const mode of ['custom-first', 'custom-only']) {
    assert.equal(shouldAttemptCustomSource({ enabled: true, mode, officialResult: {} }), true, mode);
    assert.equal(shouldAttemptCustomSource({ enabled: true, mode, officialResult: { url: '', reason: 'vip_required' } }), true, mode);
    assert.equal(shouldAttemptCustomSource({ enabled: true, mode, officialResult: { url: '', restriction: { category: 'login_required' } } }), true, mode);
    assert.equal(shouldAttemptCustomSource({ enabled: true, mode, officialResult: { url: 'https://audio.example/a.mp3' } }), false, mode);
    assert.equal(shouldAttemptCustomSource({ enabled: false, mode, officialResult: {} }), false, mode);
    assert.equal(shouldAttemptCustomSource({ enabled: true, mode }), true, mode);
  }
});
