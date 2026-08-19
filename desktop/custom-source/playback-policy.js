const RIGHTS_RESTRICTIONS = new Set([
  'login_required',
  'vip_required',
  'paid_required',
  'trial_only',
  'copyright_unavailable',
  'credentials_required',
  'video_unavailable',
  'encrypted_audio_unsupported',
]);

const TECHNICAL_FAILURES = new Set([
  'url_unavailable',
  'network_error',
  'request_failed',
  'format_unsupported',
  'http_error',
  'timeout',
  'playback_error',
]);

function resultCategory(result) {
  return String(result?.reason || result?.restriction?.category || '').trim().toLowerCase();
}

function isCustomFirstMode(mode) {
  const value = String(mode || '').toLowerCase();
  return value === 'custom-first' || value === 'custom-only';
}

function shouldAttemptCustomSource({ enabled, mode, officialResult } = {}) {
  if (!enabled) return false;
  // custom-first / custom-only：第三方音源是主取源路径，官方结果（若已尝试）未拿到地址就继续解析，
  // 权限类失败分类不再拦截；official-first 保持旧行为：权限受限不触发第三方解析。
  if (isCustomFirstMode(mode)) return !officialResult || !officialResult.url;
  if (!officialResult || officialResult.url) return false;
  const category = resultCategory(officialResult);
  if (RIGHTS_RESTRICTIONS.has(category)) return false;
  if (TECHNICAL_FAILURES.has(category)) return true;
  return !category && !!officialResult.error;
}

module.exports = { RIGHTS_RESTRICTIONS, TECHNICAL_FAILURES, resultCategory, shouldAttemptCustomSource, isCustomFirstMode };
