const path = require('node:path');
const { EventEmitter } = require('node:events');
const { CustomSourceStore } = require('./store');
const { LxSourceRuntime } = require('./runtime');
const { parseScriptInfo, selectLxQuality, validateActionResponse } = require('./protocol');
const { toLxMusicInfo } = require('./music-info');
const { shouldAttemptCustomSource, isCustomFirstMode } = require('./playback-policy');
const { resolvePublicTarget } = require('./network-policy');

const QUALITY_LEVELS = Object.freeze({
  '128k': 'standard',
  '320k': 'exhigh',
  flac: 'lossless',
  flac24bit: 'hires',
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function initializedSources(result) {
  if (!result || typeof result !== 'object') return {};
  return clone(result.sources && typeof result.sources === 'object' ? result.sources : result);
}

function errorMessage(error) {
  return String(error?.message || error || 'CUSTOM_SOURCE_FAILED').slice(0, 1024);
}

async function defaultValidateResolvedUrl(url) {
  await resolvePublicTarget(url);
  return url;
}

class CustomSourceManager extends EventEmitter {
  constructor({ store, runtimeFactory, userDataPath, app, BrowserWindow, ipcMain, validateResolvedUrl } = {}) {
    super();
    const dataPath = userDataPath || app?.getPath?.('userData');
    if (!store && !dataPath) throw new TypeError('store or userDataPath is required');
    this.store = store || new CustomSourceStore(path.join(dataPath, 'custom-sources'));
    this.electron = { app, BrowserWindow, ipcMain };
    this.runtimeFactory = runtimeFactory || (options => new LxSourceRuntime(options));
    this.validateResolvedUrl = validateResolvedUrl || defaultValidateResolvedUrl;
    this.runtime = null;
    this.activeId = '';
    this.sources = {};
    this.consecutiveFailures = 0;
  }

  #item(id) {
    if (typeof this.store.get === 'function') return this.store.get(id);
    return this.store.list().find(item => item.id === id) || null;
  }

  #emitStatus(extra = {}) {
    this.emit('status', { ...this.getStatus(), ...extra });
  }

  #createRuntime(item, script, scriptInfo = item) {
    return this.runtimeFactory({
      script,
      currentScriptInfo: scriptInfo,
      electron: this.electron,
      onUpdateAlert: data => {
        const latest = this.#item(item.id);
        if (latest && latest.allowUpdateAlert === false) return;
        this.emit('updateAlert', { id: item.id, ...data });
      },
    });
  }

  async #stopQuietly(runtime) {
    if (!runtime?.stop) return;
    try { await runtime.stop(); }
    catch (error) { this.emit('runtimeError', error); }
  }

  async #startCandidate(item, script, scriptInfo = item) {
    const runtime = this.#createRuntime(item, script, scriptInfo);
    try {
      const result = await runtime.start();
      return { runtime, sources: initializedSources(result) };
    } catch (error) {
      await this.#stopQuietly(runtime);
      throw error;
    }
  }

  async startActive() {
    const active = this.store.getActive();
    if (!active) return this.getStatus();
    if (this.runtime && this.activeId === active.id) return this.getStatus();
    let candidate;
    try {
      candidate = await this.#startCandidate(active, this.store.getScript(active.id));
      this.store.setStatus(active.id, 'ready', '', candidate.sources);
    } catch (error) {
      await this.#stopQuietly(candidate?.runtime);
      try { this.store.setStatus(active.id, 'failed', errorMessage(error), active.sources || {}); } catch {}
      this.#emitStatus({ error: errorMessage(error) });
      return this.getStatus();
    }
    const previous = this.runtime;
    this.runtime = candidate.runtime;
    this.activeId = active.id;
    this.sources = candidate.sources;
    this.consecutiveFailures = 0;
    await this.#stopQuietly(previous);
    this.#emitStatus();
    return this.getStatus();
  }

  async activate(id) {
    const item = this.#item(id);
    if (!item) throw new Error('SOURCE_NOT_FOUND');
    if (this.runtime && this.activeId === id) return this.getStatus();
    const candidate = await this.#startCandidate(item, this.store.getScript(id));
    const previousActiveId = this.store.getActive()?.id || '';
    try {
      this.store.setActive(id);
      this.store.setStatus(id, 'ready', '', candidate.sources);
    } catch (error) {
      try { this.store.setActive(previousActiveId); } catch {}
      await this.#stopQuietly(candidate.runtime);
      throw error;
    }
    const previous = this.runtime;
    this.runtime = candidate.runtime;
    this.activeId = id;
    this.sources = candidate.sources;
    this.consecutiveFailures = 0;
    await this.#stopQuietly(previous);
    this.#emitStatus();
    return this.getStatus();
  }

  async deactivate() {
    this.store.setActive('');
    const previous = this.runtime;
    this.runtime = null;
    this.activeId = '';
    this.sources = {};
    this.consecutiveFailures = 0;
    await this.#stopQuietly(previous);
    this.#emitStatus();
    return this.getStatus();
  }

  async importScript(script, sourceFileName = '') {
    const scriptInfo = parseScriptInfo(script);
    const placeholder = { id: `import_${Date.now()}`, ...scriptInfo, allowUpdateAlert: true };
    const candidate = await this.#startCandidate(placeholder, script, scriptInfo);
    let imported;
    try {
      imported = this.store.importScript(script, sourceFileName);
      this.store.setStatus(imported.id, 'ready', '', candidate.sources);
      return this.#item(imported.id) || imported;
    } catch (error) {
      if (imported) {
        try { this.store.remove(imported.id); } catch {}
      }
      throw error;
    } finally {
      await this.#stopQuietly(candidate.runtime);
      this.#emitStatus();
    }
  }

  async replaceScript(id, script, sourceFileName = '') {
    const item = this.#item(id);
    if (!item) throw new Error('SOURCE_NOT_FOUND');
    const scriptInfo = { ...item, ...parseScriptInfo(script) };
    const candidate = await this.#startCandidate(item, script, scriptInfo);
    let replaced;
    try {
      replaced = this.store.replaceScript(id, script, sourceFileName);
      this.store.setStatus(id, 'ready', '', candidate.sources);
      replaced = this.#item(id) || replaced;
    }
    catch (error) { await this.#stopQuietly(candidate.runtime); throw error; }
    if (this.activeId === id) {
      const previous = this.runtime;
      this.runtime = candidate.runtime;
      this.sources = candidate.sources;
      this.consecutiveFailures = 0;
      await this.#stopQuietly(previous);
    } else {
      await this.#stopQuietly(candidate.runtime);
    }
    this.#emitStatus();
    return replaced;
  }

  async remove(id) {
    const wasActive = this.activeId === id;
    this.store.remove(id);
    if (wasActive) {
      const previous = this.runtime;
      this.runtime = null;
      this.activeId = '';
      this.sources = {};
      await this.#stopQuietly(previous);
    }
    this.#emitStatus();
    return this.list();
  }

  setAllowUpdateAlert(id, enabled) {
    this.store.setAllowUpdateAlert(id, enabled);
    this.#emitStatus();
    return this.list();
  }

  list() {
    return this.store.list().map(item => item.id === this.activeId && this.runtime
      ? { ...item, active: true, status: 'ready', message: '', sources: clone(this.sources) }
      : item);
  }

  getStatus() {
    if (!this.runtime || !this.activeId) return { active: false, activeId: '', sources: {} };
    return { active: true, activeId: this.activeId, sources: clone(this.sources) };
  }

  // 候选 LX 源线路：歌曲自身平台优先；custom-first 模式下失败继续尝试脚本声明的其它线路
  // （musicInfo 携带 name/singer，聚合类脚本可按曲名匹配，平台 ID 不匹配时脚本自行报错跳过）。
  #resolveSourceCandidates(ownSource, allowAlternates) {
    const candidates = [ownSource];
    if (allowAlternates) {
      for (const source of ['kw', 'mg', 'tx', 'wy', 'kg']) {
        if (source === ownSource) continue;
        if (this.sources[source]?.actions?.includes('musicUrl')) candidates.push(source);
      }
    }
    return candidates;
  }

  async resolveFallback({ song, quality, officialResult, mode, signal } = {}) {
    if (!this.runtime || !this.activeId) return { attempted: false, reason: 'inactive' };
    if (!shouldAttemptCustomSource({ enabled: true, mode, officialResult })) {
      return { attempted: false, reason: 'policy_blocked' };
    }
    let lxSong;
    try { lxSong = toLxMusicInfo(song); }
    catch { return { attempted: true, url: '', reason: 'source_unsupported', error: 'SOURCE_UNSUPPORTED' }; }
    const candidates = this.#resolveSourceCandidates(lxSong.source, isCustomFirstMode(mode));
    const failures = [];
    let attemptedResolve = false;
    for (const source of candidates) {
      const sourceInfo = this.sources[source];
      if (!sourceInfo?.actions?.includes('musicUrl')) continue;
      const lxQuality = selectLxQuality(quality, sourceInfo.qualitys || []);
      if (!lxQuality) continue;
      attemptedResolve = true;
      try {
        const rawUrl = await this.runtime.request({
          source,
          action: 'musicUrl',
          info: { type: lxQuality, musicInfo: { ...lxSong, source } },
        }, signal);
        const url = validateActionResponse('musicUrl', rawUrl);
        await this.validateResolvedUrl(url);
        this.consecutiveFailures = 0;
        return {
          attempted: true,
          provider: 'lx-custom-source',
          thirdParty: true,
          source,
          url,
          level: QUALITY_LEVELS[lxQuality],
          lxQuality,
          alternatesTried: failures,
        };
      } catch (error) {
        failures.push(`${source}: ${errorMessage(error)}`);
        if (signal?.aborted) break;
      }
    }
    if (!attemptedResolve) {
      const ownInfo = this.sources[lxSong.source];
      const unsupportedSource = !ownInfo?.actions?.includes('musicUrl');
      return {
        attempted: true,
        url: '',
        reason: unsupportedSource ? 'source_unsupported' : 'quality_unsupported',
        error: unsupportedSource ? 'SOURCE_UNSUPPORTED' : 'QUALITY_UNSUPPORTED',
      };
    }
    this.consecutiveFailures += 1;
    const message = failures.join(' | ') || 'CUSTOM_SOURCE_FAILED';
    if (this.consecutiveFailures >= 3) {
      try { this.store.setStatus(this.activeId, 'warning', `连续解析失败：${failures[0] || message}`, this.sources); } catch {}
    }
    return { attempted: true, url: '', reason: 'resolve_failed', error: message };
  }

  async dispose() {
    const previous = this.runtime;
    this.runtime = null;
    this.activeId = '';
    this.sources = {};
    await this.#stopQuietly(previous);
  }
}

module.exports = { CustomSourceManager, QUALITY_LEVELS, initializedSources };
